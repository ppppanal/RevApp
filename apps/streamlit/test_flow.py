import json
import unittest
from pathlib import Path

from flow import StudyError, StudySession, build_study_payload, is_admin_login, missing_ocr_languages, redact


class FlowTests(unittest.TestCase):
    def test_missing_languages(self) -> None:
        self.assertEqual(missing_ocr_languages({"eng"}), ["chi_sim", "jpn"])
        self.assertEqual(missing_ocr_languages({"eng", "chi_sim", "jpn", "osd"}), [])

    def test_text_payload(self) -> None:
        payload = build_study_payload(
            text="Mitochondria produce ATP.",
            title="  Cells  ",
            user_id="user_1",
            tags=["ATP", " cells "],
        )
        self.assertEqual(payload["title"], "Cells")
        self.assertEqual(payload["userId"], "user_1")
        self.assertEqual(payload["tags"], ["ATP", "cells"])
        self.assertEqual(payload["source"], {"kind": "text", "text": "Mitochondria produce ATP."})

    def test_image_uses_in_process_ocr_when_languages_exist(self) -> None:
        payload = build_study_payload(
            filename="board.png",
            mime_type="image/png",
            data=b"png",
            installed_langs={"eng", "chi_sim", "jpn"},
            ocr=lambda _data: "細胞",
        )
        self.assertEqual(payload["extractedText"], "細胞")
        self.assertNotIn("dataBase64", payload["source"])
        self.assertEqual(payload["source"]["kind"], "image")

    def test_image_falls_back_when_a_language_is_missing(self) -> None:
        payload = build_study_payload(
            filename="board.png",
            mime_type="image/png",
            data=b"png",
            installed_langs={"eng"},
            ocr=lambda _data: "should not run",
        )
        self.assertNotIn("extractedText", payload)
        self.assertEqual(payload["source"]["dataBase64"], "cG5n")

    def test_ocr_exception_uses_existing_extraction(self) -> None:
        def fail(_data: bytes) -> str:
            raise RuntimeError("tesseract missing")

        payload = build_study_payload(
            filename="board.png",
            mime_type="image/png",
            data=b"png",
            installed_langs={"eng", "chi_sim", "jpn"},
            ocr=fail,
        )
        self.assertNotIn("extractedText", payload)
        self.assertIn("dataBase64", payload["source"])

    def test_pdf_keeps_bytes_for_existing_extractor(self) -> None:
        payload = build_study_payload(
            filename="notes.pdf",
            mime_type="application/pdf",
            data=b"%PDF",
            installed_langs={"eng", "chi_sim", "jpn"},
            ocr=lambda _data: "should not ocr a pdf",
        )
        self.assertEqual(payload["source"]["kind"], "pdf")
        self.assertNotIn("extractedText", payload)
        self.assertIn("dataBase64", payload["source"])

    def test_empty_input(self) -> None:
        with self.assertRaises(StudyError):
            build_study_payload(text="  ")

    def test_only_the_admin_login_is_admin(self) -> None:
        self.assertFalse(is_admin_login("ada", ""))
        self.assertFalse(is_admin_login("ada", "admin"))
        self.assertTrue(is_admin_login("Admin", "admin"))
        self.assertFalse(is_admin_login("", "admin"))

    def test_redact_database_url(self) -> None:
        self.assertNotIn("secret", redact("connect postgresql://user:secret@host/db failed"))

    def test_repeat_call_reuses_one_study_process(self) -> None:
        proc = _ScriptedProcess()

        def popen(args, **_kwargs):
            proc.starts += 1
            proc.args = list(args)
            return proc

        session = StudySession(popen=popen)
        env = {"LLM_PROVIDER": "fake"}
        root = Path(__file__).resolve().parents[2]
        first = session.call({"action": "login", "login": "ada", "password": "secret"}, repo_root=root, env=env)
        second = session.call({"action": "home", "userId": "user_1"}, repo_root=root, env=env)
        self.assertEqual(proc.starts, 1)
        self.assertIn("--serve", proc.args)
        self.assertEqual(first["login"], "ada")
        self.assertEqual(second["notes"], [])
        self.assertEqual(len(proc.requests), 2)

    def test_a_dead_study_process_starts_again(self) -> None:
        created: list[_ScriptedProcess] = []

        def popen(*_args, **_kwargs):
            proc = _ScriptedProcess()
            created.append(proc)
            return proc

        session = StudySession(popen=popen)
        env = {"LLM_PROVIDER": "fake"}
        root = Path(__file__).resolve().parents[2]
        session.call({"action": "login", "login": "ada", "password": "secret"}, repo_root=root, env=env)
        created[0].returncode = 0
        session.call({"action": "login", "login": "ada", "password": "secret"}, repo_root=root, env=env)
        self.assertEqual(len(created), 2)

    def test_worker_error_stays_on_the_same_process(self) -> None:
        proc = _ScriptedProcess(error="Unknown email or username, or the password is wrong.")

        def popen(*_args, **_kwargs):
            proc.starts += 1
            return proc

        session = StudySession(popen=popen)
        root = Path(__file__).resolve().parents[2]
        with self.assertRaises(StudyError) as caught:
            session.call({"action": "login", "login": "ada", "password": "nope"}, repo_root=root, env={})
        self.assertIn("password", str(caught.exception))
        self.assertIsNone(proc.poll())
        session.call({"action": "login", "login": "ada", "password": "secret"}, repo_root=root, env={})
        self.assertEqual(proc.starts, 1)


class _ScriptedProcess:
    def __init__(self, error: str = "") -> None:
        self.starts = 0
        self.args: list[str] = []
        self.requests: list[dict] = []
        self.stdout = self
        self.stdin = self
        self.stderr = None
        self.returncode: int | None = None
        self._lines = ['{"ready":true}\n']
        self._error = error
        self._saw_request = False

    def __call__(self, args, **_kwargs):
        return self

    def write(self, data: str) -> None:
        body = json.loads(data)
        self.requests.append(body)
        if self._error and not self._saw_request:
            self._lines.append(json.dumps({"error": {"code": "AUTH", "message": self._error}}) + "\n")
            self._saw_request = True
            return
        if body.get("action") == "home":
            self._lines.append('{"notes":[],"subjects":[],"tags":[]}\n')
        else:
            self._lines.append(json.dumps({"id": "user_1", "login": body.get("login", "")}) + "\n")

    def flush(self) -> None:
        return None

    def readline(self) -> str:
        return self._lines.pop(0)

    def poll(self) -> int | None:
        return self.returncode

    def terminate(self) -> None:
        self.returncode = 0

    def kill(self) -> None:
        self.returncode = -9

    def wait(self, timeout: float | None = None) -> int:
        return self.returncode or 0


if __name__ == "__main__":
    unittest.main()
