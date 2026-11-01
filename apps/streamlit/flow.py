"""Build a study request and call the existing API generation command."""

from __future__ import annotations

import base64
import json
import re
import shutil
import subprocess
from pathlib import Path

from runtime import ensure_study_runtime

OCR_LANGUAGES = ("eng", "chi_sim", "jpn")
MAX_UPLOAD_BYTES = 6_000_000
MAX_NOTE_TEXT = 20_000
_POSTGRES_URL = re.compile(r"postgres(?:ql)?://\S+", re.IGNORECASE)


class StudyError(Exception):
    pass


def missing_ocr_languages(installed: set[str]) -> list[str]:
    return [language for language in OCR_LANGUAGES if language not in installed]


def installed_tesseract_languages() -> set[str]:
    if shutil.which("tesseract") is None:
        return set()
    try:
        import pytesseract
    except ImportError:
        return set()
    try:
        return set(pytesseract.get_languages(config=""))
    except Exception:
        return set()


def ocr_image(data: bytes) -> str:
    import io

    import pytesseract
    from PIL import Image

    image = Image.open(io.BytesIO(data))
    return pytesseract.image_to_string(image, lang="+".join(OCR_LANGUAGES))


def build_study_payload(
    *,
    text: str = "",
    filename: str | None = None,
    mime_type: str | None = None,
    data: bytes | None = None,
    title: str = "",
    subject_name: str = "",
    installed_langs: set[str] | None = None,
    ocr=None,
) -> dict:
    payload: dict = {}
    if title.strip():
        payload["title"] = title.strip()
    if subject_name.strip():
        payload["subjectName"] = subject_name.strip()
    if data is None:
        notes = text.strip()
        if not notes:
            raise StudyError("Paste note text or choose a PDF or image.")
        if len(notes) > MAX_NOTE_TEXT:
            raise StudyError("Pasted text is longer than 20,000 characters. Use a shorter section.")
        payload["source"] = {"kind": "text", "text": notes}
        return payload
    if len(data) > MAX_UPLOAD_BYTES:
        raise StudyError("File must be 6 MB or smaller.")
    kind = "pdf" if _is_pdf(filename, mime_type) else "image"
    source: dict = {"kind": kind}
    if filename:
        source["filename"] = filename
    if kind == "image" and mime_type:
        source["mimeType"] = mime_type
    langs = installed_tesseract_languages() if installed_langs is None else installed_langs
    if kind == "image" and not missing_ocr_languages(langs):
        reader = ocr or ocr_image
        try:
            payload["extractedText"] = reader(data)
            payload["source"] = source
            return payload
        except Exception:
            pass
    source["dataBase64"] = base64.b64encode(data).decode("ascii")
    payload["source"] = source
    return payload


def run_study(payload: dict, *, repo_root: Path, env: dict[str, str]) -> dict:
    runtime = ensure_study_runtime(repo_root, env)
    try:
        completed = subprocess.run(
            [runtime.node, str(runtime.tsx), str(repo_root / "apps" / "api" / "src" / "study-cli.ts")],
            input=json.dumps(payload),
            text=True,
            capture_output=True,
            cwd=repo_root,
            env=runtime.env,
            timeout=180,
            check=False,
        )
    except subprocess.TimeoutExpired as error:
        raise StudyError("The model timed out.") from error
    if completed.returncode != 0:
        raise StudyError(_error_message(completed.stderr))
    return _parse_note(completed.stdout)


def redact(text: str) -> str:
    return _POSTGRES_URL.sub("postgresql://redacted", text)


def _is_pdf(filename: str | None, mime_type: str | None) -> bool:
    if mime_type and mime_type.split(";", 1)[0].strip().lower() == "application/pdf":
        return True
    return bool(filename and filename.lower().endswith(".pdf"))


def _parse_note(stdout: str) -> dict:
    text = stdout.strip()
    if not text:
        raise StudyError("Study generation returned no result.")
    try:
        return json.loads(text)
    except json.JSONDecodeError:
        start = text.rfind("\n{")
        if start >= 0:
            return json.loads(text[start + 1 :])
        raise StudyError("Study generation returned an unreadable result.") from None


def _error_message(stderr: str) -> str:
    for line in reversed(stderr.splitlines()):
        candidate = line.strip()
        if not candidate:
            continue
        try:
            body = json.loads(candidate)
        except json.JSONDecodeError:
            continue
        message = body.get("error", {}).get("message") if isinstance(body, dict) else None
        if isinstance(message, str) and message.strip():
            return message.strip()
    redacted = redact(stderr).strip()
    if not redacted:
        return "Study generation failed."
    return redacted.splitlines()[-1][:500]
