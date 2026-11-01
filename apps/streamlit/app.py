"""Rev study page for Streamlit Community Cloud.

Main file: apps/streamlit/app.py
"""

from __future__ import annotations

import hashlib
import hmac
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


def setting(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if value:
        return value
    try:
        secret = st.secrets.get(name, "")
    except Exception:
        return ""
    return str(secret).strip() if secret is not None else ""


def passwords_match(given: str, expected: str) -> bool:
    return hmac.compare_digest(
        hashlib.sha256(given.encode("utf-8")).digest(),
        hashlib.sha256(expected.encode("utf-8")).digest(),
    )


def child_env() -> dict[str, str]:
    env = dict(os.environ)
    try:
        for key, value in st.secrets.items():
            if isinstance(value, str) and not env.get(key, "").strip():
                env[key] = value
    except Exception:
        pass
    return env


def require_password() -> None:
    expected = setting("APP_PASSWORD")
    if not expected:
        st.title("Rev")
        st.error("Set APP_PASSWORD before using this page.")
        st.stop()
    if st.session_state.get("authenticated"):
        return
    st.title("Rev")
    st.caption("Turn notes, a PDF, or a photo into a summary, key points, and flashcards.")
    with st.form("password-gate"):
        entered = st.text_input("Password", type="password")
        submitted = st.form_submit_button("Continue")
    if submitted:
        if passwords_match(entered, expected):
            st.session_state["authenticated"] = True
            st.rerun()
        st.error("Wrong password.")
    st.stop()


def missing_runtime_settings(env: dict[str, str]) -> list[str]:
    missing = []
    if not env.get("DATABASE_URL", "").strip():
        missing.append("DATABASE_URL")
    provider = env.get("LLM_PROVIDER", "openai").strip() or "openai"
    if provider != "fake" and not env.get("LLM_API_KEY", "").strip():
        missing.append("LLM_API_KEY")
    return missing


def render_note(note: dict) -> None:
    st.subheader(note.get("title") or "Study pack")
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
            with st.expander(card.get("question") or "Card"):
                st.write(card.get("answer") or "")
    note_id = note.get("id")
    if note_id:
        st.caption(f"Saved to Neon as {note_id}.")


def main() -> None:
    require_password()
    st.title("Rev")
    st.caption("Paste text or upload a PDF or image. Generation uses the existing study command.")
    langs = installed_tesseract_languages()
    missing = missing_ocr_languages(langs)
    if not missing:
        st.caption("Image OCR uses Tesseract for English, Simplified Chinese, and Japanese.")
    else:
        st.caption("Image OCR uses the existing extractor. Scanned PDFs are not supported.")

    if st.button("Lock", key="lock"):
        st.session_state["authenticated"] = False
        st.rerun()

    title = st.text_input("Title", placeholder="Optional")
    subject = st.text_input("Subject", placeholder="Optional")
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
        env = child_env()
        missing_settings = missing_runtime_settings(env)
        if missing_settings:
            st.error("Set " + ", ".join(missing_settings) + " and try again.")
            return
        try:
            if upload is None:
                payload = build_study_payload(text=text, title=title, subject_name=subject)
            else:
                data = upload.getvalue()
                payload = build_study_payload(
                    filename=upload.name,
                    mime_type=upload.type,
                    data=data,
                    title=title,
                    subject_name=subject,
                )
            with st.spinner("Creating the study pack…"):
                note = run_study(payload, repo_root=REPO_ROOT, env=env)
        except StudyError as error:
            st.error(str(error))
            return
        render_note(note)


main()
