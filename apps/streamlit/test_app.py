"""The upload page shows the pack it just created, without the saved-notes list."""

import os
import unittest
from pathlib import Path

import flow
from streamlit.testing.v1 import AppTest

NOTE = {
    "id": "note-1",
    "title": "Cells",
    "status": "READY",
    "summary": "Cells make energy.",
    "subjectName": None,
    "tags": [],
    "sourceText": "Mitochondria produce ATP.",
    "keyPoints": [{"id": "k1", "kind": "FACT", "content": "ATP is energy.", "position": 0}],
    "flashcards": [
        {
            "id": "c1",
            "question": "What do mitochondria produce?",
            "answer": "ATP",
            "position": 0,
            "edited": False,
            "personal": False,
        },
        {
            "id": "c2",
            "question": "What is ATP?",
            "answer": "The energy currency.",
            "position": 1,
            "edited": False,
            "personal": False,
        },
    ],
    "createdAt": "2026-11-03T00:00:00.000Z",
    "updatedAt": "2026-11-03T00:00:00.000Z",
}

SUMMARY = {
    "id": NOTE["id"],
    "title": NOTE["title"],
    "status": "READY",
    "summary": NOTE["summary"],
    "subjectName": None,
    "tags": [],
    "flashcardCount": 2,
    "createdAt": NOTE["createdAt"],
    "updatedAt": NOTE["updatedAt"],
}


class UploadPageTests(unittest.TestCase):
    def setUp(self) -> None:
        self._previous = {key: os.environ.get(key) for key in ("DATABASE_URL", "LLM_PROVIDER")}
        os.environ["DATABASE_URL"] = "postgresql://local/test"
        os.environ["LLM_PROVIDER"] = "fake"
        self.home_notes: list[dict] = []
        self._run_study = flow.run_study
        flow.run_study = self._run_study_fake

    def tearDown(self) -> None:
        flow.run_study = self._run_study
        for key, value in self._previous.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value

    def _run_study_fake(self, payload: dict, *, repo_root: object, env: object) -> dict:
        action = payload.get("action") or "create"
        if action == "home":
            return {"notes": list(self.home_notes), "subjects": [], "tags": []}
        if action == "get":
            return NOTE
        if action == "quiz":
            return {
                "title": "Cells",
                "cards": [
                    {
                        "id": "c1",
                        "question": "What do mitochondria produce?",
                        "position": 0,
                        "personal": False,
                        "correctCount": 0,
                        "incorrectCount": 0,
                    }
                ],
            }
        if action == "create":
            return NOTE
        raise AssertionError(action)

    def _open(self) -> AppTest:
        page = AppTest.from_file(str(Path(__file__).with_name("app.py")), default_timeout=20)
        page.session_state["user"] = {"id": "user-1", "login": "ada"}
        page.run()
        self.assertEqual(list(page.exception), [])
        return page

    def test_create_shows_numbered_cards_and_quiz_under_the_form(self) -> None:
        self.home_notes = []
        page = self._open()
        next(box for box in page.text_area if box.label == "Notes").set_value("Mitochondria produce ATP.")
        next(button for button in page.button if button.label == "Create study pack").click()
        page.run()
        self.assertEqual(list(page.exception), [])
        self.assertEqual(page.session_state["page"], "upload")
        self._assert_cards_under_the_form(page)

        next(button for button in page.button if button.label == "Quiz").click()
        page.run()
        self.assertEqual(list(page.exception), [])
        self.assertEqual(page.session_state["page"], "upload")
        self.assertNotIn("開啟之前的 note", [radio.label for radio in page.radio])
        self.assertIn("Your answer", [field.label for field in page.text_input])
        self.assertIn("What do mitochondria produce?", _markdown(page))

        next(button for button in page.button if button.label == "Back to note").click()
        page.run()
        self.assertEqual(list(page.exception), [])
        self._assert_cards_under_the_form(page)

    def test_create_still_shows_cards_when_the_saved_list_includes_the_note(self) -> None:
        self.home_notes = [SUMMARY]
        page = self._open()
        next(box for box in page.text_area if box.label == "Notes").set_value("Mitochondria produce ATP.")
        next(button for button in page.button if button.label == "Create study pack").click()
        page.run()
        self.assertEqual(list(page.exception), [])
        self._assert_cards_under_the_form(page)

    def test_a_dropped_session_note_is_reloaded_on_the_upload_page(self) -> None:
        self.home_notes = []
        page = self._open()
        page.session_state["page"] = "upload"
        page.session_state["note-from"] = "upload"
        page.session_state["pending-note"] = NOTE["id"]
        if "note" in page.session_state:
            del page.session_state["note"]
        page.run()
        self.assertEqual(list(page.exception), [])
        self.assertNotIn("開啟之前的 note", [radio.label for radio in page.radio])
        self._assert_cards_under_the_form(page)

    def test_saved_notes_list_still_opens_from_its_own_button(self) -> None:
        self.home_notes = [SUMMARY]
        page = self._open()
        next(button for button in page.button if button.label == "開啟卡片").click()
        page.run()
        self.assertEqual(list(page.exception), [])
        self.assertIn("開啟之前的 note", [radio.label for radio in page.radio])

    def _assert_cards_under_the_form(self, page: AppTest) -> None:
        self.assertNotIn("開啟之前的 note", [radio.label for radio in page.radio])
        labels = [button.label for button in page.button]
        self.assertLess(labels.index("Create study pack"), labels.index("Quiz"))
        text = _markdown(page)
        create_at = None
        card_at = None
        for index, element in enumerate(page.main):
            value = getattr(element, "label", None) or getattr(element, "value", None) or ""
            if value == "Create study pack":
                create_at = index
            if isinstance(value, str) and value.startswith("**1. "):
                card_at = index
        self.assertIsNotNone(create_at)
        self.assertIsNotNone(card_at)
        assert create_at is not None and card_at is not None
        self.assertLess(create_at, card_at)
        self.assertIn("**1. What do mitochondria produce?**", text)
        self.assertIn("**2. What is ATP?**", text)
        self.assertIn("ATP", text)
        self.assertIn("The energy currency.", text)


def _markdown(page: AppTest) -> str:
    return "\n".join(element.value for element in page.markdown)
