"""Rev study page for Streamlit Community Cloud.

Main file: apps/streamlit/app.py
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

import streamlit as st

APP_DIR = Path(__file__).resolve().parent
REPO_ROOT = APP_DIR.parents[1]
if str(APP_DIR) not in sys.path:
    sys.path.insert(0, str(APP_DIR))

from flow import (
    StudyError,
    build_study_payload,
    installed_tesseract_languages,
    is_admin_login,
    missing_ocr_languages,
    run_study,
)

st.set_page_config(page_title="Rev", layout="centered")

_RIGHT_CONTROLS = """
<style>
[data-testid="stToolbar"],
[data-testid="stDecoration"],
[data-testid="stStatusWidget"],
[data-testid="stMainMenu"],
#MainMenu,
.stDeployButton,
.stAppDeployButton {
  display: none !important;
}
</style>
"""


def hide_right_controls() -> None:
    """The Streamlit toolbar sits on the right and is visible to every viewer.

    Keep it for the admin account only.
    """
    user = st.session_state.get("user")
    login = user.get("login") if isinstance(user, dict) else ""
    if is_admin_login(str(login or ""), child_env().get("ADMIN_LOGIN", "")):
        return
    st.markdown(_RIGHT_CONTROLS, unsafe_allow_html=True)


def child_env() -> dict[str, str]:
    env = dict(os.environ)
    try:
        for key, value in st.secrets.items():
            if isinstance(value, str) and not env.get(key, "").strip():
                env[key] = value
    except Exception:
        pass
    return env


hide_right_controls()


def missing_runtime_settings(env: dict[str, str], *, needs_model: bool) -> list[str]:
    missing = []
    if not env.get("DATABASE_URL", "").strip():
        missing.append("DATABASE_URL")
    if needs_model:
        provider = env.get("LLM_PROVIDER", "openai").strip() or "openai"
        if provider != "fake" and not env.get("LLM_API_KEY", "").strip():
            missing.append("LLM_API_KEY")
    return missing


def call(payload: dict, *, needs_model: bool) -> dict:
    env = child_env()
    missing = missing_runtime_settings(env, needs_model=needs_model)
    if missing:
        raise StudyError("Set " + ", ".join(missing) + " and try again.")
    return run_study(payload, repo_root=REPO_ROOT, env=env)


def render_howto() -> None:
    st.markdown("**使用方式：** 上傳 PDF、image，或貼上 text → 同一頁看到 revision cards → 按 Quiz。")
    st.caption("可加上 subject 和 tags。答錯的 card 下次 Quiz 會排在前面。掃描的 PDF 沒有 text layer，無法讀取。")


def render_note(note: dict) -> None:
    st.subheader(note.get("title") or "Revision cards")
    details = []
    if note.get("subjectName"):
        details.append(f"Subject: {note['subjectName']}")
    tags = note.get("tags") or []
    if tags:
        details.append("Tags: " + ", ".join(tags))
    if details:
        st.caption(" · ".join(details))
    summary = note.get("summary")
    if summary:
        st.write(summary)
    cards = note.get("flashcards") or []
    st.markdown("**Revision cards**")
    if not cards:
        st.write("這份 note 還沒有 card。")
    for index, card in enumerate(cards, start=1):
        label = card.get("question") or "Card"
        if card.get("personal"):
            label = f"Revision card: {label}"
        st.markdown(f"**{index}. {label}**")
        with st.expander("Answer"):
            st.write(card.get("answer") or "")
    points = note.get("keyPoints") or []
    if points:
        st.markdown("**Key points**")
        for point in points:
            st.markdown(f"- **{point.get('kind', 'FACT')}.** {point.get('content', '')}")
    source = note.get("sourceText") or ""
    if source:
        st.markdown("**Source**")
        st.caption("從這裡複製一段，貼到下面，可以再加一張 revision card。")
        st.text_area("Source text", value=source, height=160, disabled=True, label_visibility="collapsed")


def account_gate() -> dict | None:
    if st.session_state.get("user"):
        return st.session_state["user"]
    st.title("Rev")
    st.caption("Create an account or log in. Each person only sees their own notes.")
    mode = st.radio("Account", ["Log in", "Register"], horizontal=True)
    with st.form("account"):
        login = st.text_input("Email or username")
        password = st.text_input("Password", type="password")
        confirm = st.text_input("Confirm password", type="password") if mode == "Register" else ""
        submitted = st.form_submit_button(mode)
    if submitted:
        if mode == "Register" and password != confirm:
            st.error("Those passwords do not match.")
            st.stop()
        try:
            user = call(
                {"action": "register" if mode == "Register" else "login", "login": login, "password": password},
                needs_model=False,
            )
        except StudyError as error:
            st.error(str(error))
            st.stop()
        st.session_state["user"] = user
        st.rerun()
    st.stop()
    return None


def begin_quiz(user: dict, note: dict) -> None:
    try:
        started = call({"action": "quiz", "userId": user["id"], "noteId": note["id"]}, needs_model=False)
    except StudyError as error:
        st.error(str(error))
        return
    st.session_state["quiz"] = {
        "noteId": note["id"],
        "title": started.get("title") or note.get("title") or "Quiz",
        "cards": started.get("cards") or [],
        "index": 0,
        "sessionCorrect": 0,
        "phase": "ask",
    }
    st.rerun()


def render_quiz(user: dict, note: dict) -> None:
    quiz = st.session_state["quiz"]
    cards = quiz.get("cards") or []
    st.subheader(quiz.get("title") or "Quiz")
    if st.button("Back to note"):
        st.session_state.pop("quiz", None)
        st.rerun()
    if not cards:
        st.write("No cards to quiz.")
        return

    total = len(cards)
    index = quiz.get("index", 0)
    if index >= total:
        st.markdown(f"**Score {quiz.get('sessionCorrect', 0)} of {total}**")
        st.caption("That score is saved on your account. The next quiz starts with the cards you miss most.")
        if st.button("Quiz again"):
            begin_quiz(user, note)
        return

    card = cards[index]
    attempts = card.get("correctCount", 0) + card.get("incorrectCount", 0)
    history = (
        f"Missed {card.get('incorrectCount', 0)} of {attempts}."
        if attempts
        else "Not quizzed yet."
    )
    st.caption(f"Card {index + 1} of {total}. {history} Session score {quiz.get('sessionCorrect', 0)} of {total}.")
    label = card.get("question") or "Card"
    if card.get("personal"):
        label = f"Revision card: {label}"
    st.markdown(f"**{label}**")

    if quiz.get("phase") == "review":
        result = quiz.get("last") or {}
        if result.get("correct"):
            st.success("Matched.")
        else:
            st.error("Not a match.")
        st.write(result.get("expected") or "")
        st.caption(
            f"Saved on this card: {result.get('correctCount', 0)} correct, {result.get('incorrectCount', 0)} missed."
        )
        if st.button("Next"):
            quiz["index"] = index + 1
            quiz["phase"] = "ask"
            quiz.pop("last", None)
            st.session_state["quiz"] = quiz
            st.rerun()
        return

    with st.form(f"quiz-answer-{card.get('id')}"):
        attempt = st.text_input("Your answer")
        submitted = st.form_submit_button("Check")
    if submitted:
        try:
            graded = call(
                {
                    "action": "grade",
                    "userId": user["id"],
                    "noteId": note["id"],
                    "cardId": card["id"],
                    "attempt": attempt,
                },
                needs_model=False,
            )
        except StudyError as error:
            st.error(str(error))
            return
        if graded.get("correct"):
            quiz["sessionCorrect"] = quiz.get("sessionCorrect", 0) + 1
        card["correctCount"] = graded.get("correctCount", 0)
        card["incorrectCount"] = graded.get("incorrectCount", 0)
        quiz["phase"] = "review"
        quiz["last"] = graded
        st.session_state["quiz"] = quiz
        st.rerun()


def note_label(note: dict) -> str:
    subject = note.get("subjectName")
    title = note.get("title") or "Untitled note"
    label = f"{title} · {subject}" if subject else title
    count = note.get("flashcardCount")
    if isinstance(count, int):
        label = f"{label} · {count} cards"
    return label


def render_page_buttons() -> str:
    page = st.session_state.get("page") or "upload"
    upload_col, cards_col = st.columns(2)
    with upload_col:
        if st.button("上傳", type="primary" if page == "upload" else "secondary", use_container_width=True):
            if page != "upload":
                st.session_state["page"] = "upload"
                st.session_state.pop("quiz", None)
                st.rerun()
    with cards_col:
        if st.button("開啟卡片", type="primary" if page == "cards" else "secondary", use_container_width=True):
            if page != "cards":
                st.session_state["page"] = "cards"
                st.session_state.pop("quiz", None)
                st.rerun()
    return st.session_state.get("page") or "upload"


def render_result(user: dict, note: dict) -> None:
    quiz = st.session_state.get("quiz")
    if quiz and quiz.get("noteId") != note.get("id"):
        st.session_state.pop("quiz", None)
        quiz = None
    if quiz:
        render_quiz(user, note)
        return
    render_note(note)
    if note.get("flashcards") and st.button("Quiz", type="primary", key=f"start-quiz-{note['id']}"):
        begin_quiz(user, note)
    quote = st.text_area("Quote", placeholder="Paste a passage from the source.", key=f"quote-{note['id']}")
    if st.button("Make revision card", key=f"quote-button-{note['id']}"):
        try:
            updated = call(
                {"action": "quote", "userId": user["id"], "noteId": note["id"], "quote": quote},
                needs_model=True,
            )
        except StudyError as error:
            st.error(str(error))
        else:
            st.session_state["note"] = updated
            st.rerun()


def render_upload(user: dict, home: dict) -> None:
    st.caption("PDF、image，或貼上 text。")
    title = st.text_input("Title", placeholder="Optional")
    subjects = home.get("subjects") or []
    subject_choice = st.selectbox("Subject", ["None", *subjects, "New subject"])
    subject_name = ""
    if subject_choice == "New subject":
        subject_name = st.text_input("New subject")
    elif subject_choice != "None":
        subject_name = subject_choice
    picked = st.multiselect("Tags", home.get("tags") or [])
    extra_tags = st.text_input("New tags", placeholder="Comma separated")
    source = st.radio("Input", ["Text", "PDF or image"], horizontal=True)
    text = ""
    upload = None
    if source == "Text":
        text = st.text_area("Notes", height=220, placeholder="Paste the notes to study.")
    else:
        upload = st.file_uploader(
            "PDF or image",
            type=["pdf", "png", "jpg", "jpeg", "webp", "gif", "bmp"],
            help="PDFs need a text layer. Photos are read with Tesseract when the language packs are installed.",
        )

    if st.button("Create study pack", type="primary"):
        tags = list(picked)
        tags.extend(part.strip() for part in extra_tags.split(",") if part.strip())
        try:
            if upload is None:
                payload = build_study_payload(
                    text=text,
                    title=title,
                    subject_name=subject_name,
                    tags=tags,
                    user_id=user["id"],
                )
            else:
                payload = build_study_payload(
                    filename=upload.name,
                    mime_type=upload.type,
                    data=upload.getvalue(),
                    title=title,
                    subject_name=subject_name,
                    tags=tags,
                    user_id=user["id"],
                )
            with st.spinner("Creating the study pack…"):
                created = call(payload, needs_model=True)
        except StudyError as error:
            st.error(str(error))
            return
        st.session_state["note"] = created
        st.session_state["note-from"] = "upload"
        st.session_state["pending-note"] = created["id"]
        st.session_state["page"] = "upload"
        st.session_state.pop("quiz", None)
        st.rerun()


def main() -> None:
    user = account_gate()
    if user is None:
        return
    st.title("Rev")
    signed_in, logout = st.columns([4, 1])
    with signed_in:
        st.caption(f"Signed in as {user.get('login', 'you')}.")
    with logout:
        if st.button("Log out"):
            st.session_state.pop("user", None)
            st.session_state.pop("note", None)
            st.session_state.pop("note-from", None)
            st.session_state.pop("selected-note", None)
            st.session_state.pop("pending-note", None)
            st.session_state.pop("page", None)
            st.session_state.pop("quiz", None)
            st.rerun()
    render_howto()
    page = render_page_buttons()

    try:
        home = call({"action": "home", "userId": user["id"]}, needs_model=False)
    except StudyError as error:
        st.error(str(error))
        return

    notes = home.get("notes") or []
    labels = {item["id"]: note_label(item) for item in notes}
    note = st.session_state.get("note")
    note_from = st.session_state.get("note-from")
    pending_id = st.session_state.get("pending-note")
    if (
        isinstance(note, dict)
        and note.get("id") not in labels
        and not _created_on_upload(note, note_from, pending_id)
    ):
        note = None
        st.session_state.pop("note", None)

    if page == "cards":
        pending = st.session_state.pop("pending-note", None)
        if pending in labels:
            st.session_state["selected-note"] = pending
        if st.session_state.get("selected-note") not in labels:
            st.session_state["selected-note"] = next(iter(labels), "")
        if not labels:
            st.info("還沒有儲存的 note。先按「上傳」。")
            return
        selected = st.radio(
            "開啟之前的 note",
            list(labels),
            format_func=lambda note_id: labels.get(note_id, note_id),
            key="selected-note",
        )
        if selected and (not note or note.get("id") != selected):
            try:
                note = call({"action": "get", "userId": user["id"], "noteId": selected}, needs_model=False)
            except StudyError as error:
                st.error(str(error))
                return
            st.session_state["note"] = note
        if note:
            st.session_state["note-from"] = "cards"
            render_result(user, note)
        return

    note, note_from = _pack_on_upload_page(user, note, note_from, pending_id)
    quizzing = bool(note) and (st.session_state.get("quiz") or {}).get("noteId") == note.get("id")
    if not (quizzing and note_from == "upload"):
        langs = installed_tesseract_languages()
        if not missing_ocr_languages(langs):
            st.caption("Image OCR uses Tesseract for English, Simplified Chinese, and Japanese.")
        else:
            st.caption("Image OCR uses the existing extractor. Scanned PDFs are not supported.")
        render_upload(user, home)
    if note and note_from == "upload":
        render_result(user, note)


def _created_on_upload(note: dict, note_from: object, pending_id: object) -> bool:
    """A pack from Create study pack stays on the upload page even if the saved list has not caught up."""
    if note_from == "upload":
        return True
    return isinstance(pending_id, str) and bool(pending_id) and note.get("id") == pending_id


def _pack_on_upload_page(
    user: dict,
    note: dict | None,
    note_from: object,
    pending_id: object,
) -> tuple[dict | None, object]:
    """Load the pack that was just created so its cards render under the form."""
    if not isinstance(pending_id, str) or not pending_id:
        return note, note_from
    if isinstance(note, dict) and note.get("id") == pending_id and "flashcards" in note:
        if note_from != "upload":
            st.session_state["note-from"] = "upload"
            note_from = "upload"
        return note, note_from
    try:
        loaded = call({"action": "get", "userId": user["id"], "noteId": pending_id}, needs_model=False)
    except StudyError as error:
        st.error(str(error))
        return note, note_from
    st.session_state["note"] = loaded
    st.session_state["note-from"] = "upload"
    return loaded, "upload"


main()
