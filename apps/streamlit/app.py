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

from flow import StudyError, build_study_payload, installed_tesseract_languages, missing_ocr_languages, run_study

st.set_page_config(page_title="Rev", layout="centered")


def child_env() -> dict[str, str]:
    env = dict(os.environ)
    try:
        for key, value in st.secrets.items():
            if isinstance(value, str) and not env.get(key, "").strip():
                env[key] = value
    except Exception:
        pass
    return env


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


def render_note(note: dict) -> None:
    st.subheader(note.get("title") or "Study pack")
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
    points = note.get("keyPoints") or []
    if points:
        st.markdown("**Key points**")
        for point in points:
            st.markdown(f"- **{point.get('kind', 'FACT')}.** {point.get('content', '')}")
    cards = note.get("flashcards") or []
    if cards:
        st.markdown("**Flashcards**")
        for card in cards:
            label = card.get("question") or "Card"
            if card.get("personal"):
                label = f"Revision card: {label}"
            with st.expander(label):
                st.write(card.get("answer") or "")
    source = note.get("sourceText") or ""
    if source:
        st.markdown("**Source**")
        st.caption("Select a passage here, copy it, and paste it below.")
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
    return f"{title} · {subject}" if subject else title


def main() -> None:
    user = account_gate()
    if user is None:
        return
    st.title("Rev")
    st.caption(f"Signed in as {user.get('login', 'you')}.")
    if st.button("Log out"):
        st.session_state.pop("user", None)
        st.session_state.pop("note", None)
        st.session_state.pop("selected-note", None)
        st.session_state.pop("quiz", None)
        st.rerun()

    langs = installed_tesseract_languages()
    if not missing_ocr_languages(langs):
        st.caption("Image OCR uses Tesseract for English, Simplified Chinese, and Japanese.")
    else:
        st.caption("Image OCR uses the existing extractor. Scanned PDFs are not supported.")

    try:
        home = call({"action": "home", "userId": user["id"]}, needs_model=False)
    except StudyError as error:
        st.error(str(error))
        return

    notes = home.get("notes") or []
    labels = {item["id"]: note_label(item) for item in notes}
    pending = st.session_state.pop("pending-note", None)
    if pending in labels:
        st.session_state["selected-note"] = pending
    if st.session_state.get("selected-note") not in labels and st.session_state.get("selected-note") != "":
        st.session_state["selected-note"] = ""
    selected = st.selectbox(
        "Your notes",
        ["", *labels.keys()],
        format_func=lambda note_id: "Choose a note" if note_id == "" else labels.get(note_id, note_id),
        key="selected-note",
    )
    note = st.session_state.get("note")
    if selected and (not note or note.get("id") != selected):
        try:
            note = call({"action": "get", "userId": user["id"], "noteId": selected}, needs_model=False)
        except StudyError as error:
            st.error(str(error))
            note = None
        else:
            st.session_state["note"] = note
    elif not selected:
        note = None

    quiz = st.session_state.get("quiz")
    if quiz and quiz.get("noteId") != (note or {}).get("id"):
        st.session_state.pop("quiz", None)
        quiz = None

    if note and quiz:
        render_quiz(user, note)
    elif note:
        render_note(note)
        if note.get("flashcards"):
            if st.button("Start quiz", key=f"start-quiz-{note['id']}"):
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

    st.divider()
    st.markdown("**New note**")
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
        st.session_state["pending-note"] = created["id"]
        st.rerun()


main()
