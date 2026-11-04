"""Build a study request and call the existing API generation command."""

from __future__ import annotations

import atexit
import base64
import json
import re
import shutil
import subprocess
import threading
from pathlib import Path
from typing import Callable

from runtime import ensure_study_runtime

OCR_LANGUAGES = ("eng", "chi_sim", "jpn")
MAX_UPLOAD_BYTES = 6_000_000
MAX_NOTE_TEXT = 20_000
_POSTGRES_URL = re.compile(r"postgres(?:ql)?://\S+", re.IGNORECASE)


class StudyError(Exception):
    pass


def is_admin_login(login: str | None, expected: str | None) -> bool:
    admin = (expected or "").strip().lower()
    if not admin:
        return False
    return (login or "").strip().lower() == admin


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


def chart_reading_is_incomplete(text: str) -> bool:
    """A katakana chart that was not read as character plus romaji still needs the image OCR path."""
    pairs = re.findall(r"[ァ-ヶー][ \t]*[A-Za-z]{1,3}(?![A-Za-z])", text)
    if len(pairs) >= 5:
        return False
    if len(re.findall(r"[ァ-ヶー]", text)) >= 5:
        return True
    words = [word for word in text.split() if word]
    has_long_word = any(re.search(r"[A-Za-z]{6,}", word) for word in words)
    return not has_long_word and len(words) >= 12


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
    tags: list[str] | None = None,
    user_id: str = "",
    installed_langs: set[str] | None = None,
    ocr=None,
) -> dict:
    payload: dict = {}
    if user_id:
        payload["action"] = "create"
        payload["userId"] = user_id
    if title.strip():
        payload["title"] = title.strip()
    if subject_name.strip():
        payload["subjectName"] = subject_name.strip()
    clean_tags = [tag.strip() for tag in (tags or []) if tag.strip()]
    if clean_tags:
        payload["tags"] = clean_tags
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
            extracted = reader(data)
            if extracted and not chart_reading_is_incomplete(extracted):
                payload["extractedText"] = extracted
                payload["source"] = source
                return payload
        except Exception:
            pass
    source["dataBase64"] = base64.b64encode(data).decode("ascii")
    payload["source"] = source
    return payload


_READY_TIMEOUT_SECONDS = 90
_ACCOUNT_TIMEOUT_SECONDS = 30
_MODEL_TIMEOUT_SECONDS = 180
# A long PDF is several model calls. Five chunks, each retried once, need more than one call's timeout.
_CREATE_TIMEOUT_SECONDS = 600


class StudySession:
    """One warm study process for the Streamlit server.

    Login used to start a new Node process on every call. The first call still
    waits for that process. Later calls reuse it.
    """

    def __init__(self, popen: Callable[..., subprocess.Popen[str]] = subprocess.Popen) -> None:
        self._popen = popen
        self._lock = threading.Lock()
        self._proc: subprocess.Popen[str] | None = None
        self._env_key: tuple[tuple[str, str], ...] | None = None
        self._stderr: list[str] = []

    def call(self, payload: dict, *, repo_root: Path, env: dict[str, str]) -> dict:
        with self._lock:
            try:
                proc = self._process(repo_root, env)
                return self._roundtrip(proc, payload)
            except StudyError:
                raise
            except Exception as error:
                self._stop()
                message = redact(str(error)).strip()
                raise StudyError(message or "Study generation failed.") from error

    def _process(self, repo_root: Path, env: dict[str, str]) -> subprocess.Popen[str]:
        key = tuple(sorted(env.items()))
        proc = self._proc
        if proc is not None and proc.poll() is None and key == self._env_key:
            return proc
        self._stop()
        runtime = ensure_study_runtime(repo_root, env)
        command = [
            runtime.node,
            str(runtime.tsx),
            str(repo_root / "apps" / "api" / "src" / "study-cli.ts"),
            "--serve",
        ]
        proc = self._popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            bufsize=1,
            cwd=repo_root,
            env=runtime.env,
        )
        self._proc = proc
        self._env_key = key
        self._stderr = []
        if proc.stderr is not None:
            threading.Thread(target=_drain, args=(proc.stderr, self._stderr), daemon=True).start()
        try:
            ready = _readline(proc.stdout, _READY_TIMEOUT_SECONDS)
        except TimeoutError as error:
            self._stop()
            raise StudyError("Study generation failed.") from error
        if proc.poll() is not None or not ready:
            detail = _error_message("".join(self._stderr))
            self._stop()
            raise StudyError(detail)
        try:
            parsed = json.loads(ready)
        except json.JSONDecodeError as error:
            self._stop()
            raise StudyError("Study generation failed.") from error
        if not isinstance(parsed, dict) or parsed.get("ready") is not True:
            self._stop()
            raise StudyError(_error_message(ready))
        return proc

    def _roundtrip(self, proc: subprocess.Popen[str], payload: dict) -> dict:
        if proc.stdin is None or proc.stdout is None:
            self._stop()
            raise StudyError("Study generation failed.")
        action = payload.get("action")
        if action in {None, "create"}:
            timeout = _CREATE_TIMEOUT_SECONDS
        elif action == "quote":
            timeout = _MODEL_TIMEOUT_SECONDS
        else:
            timeout = _ACCOUNT_TIMEOUT_SECONDS
        try:
            proc.stdin.write(json.dumps(payload) + "\n")
            proc.stdin.flush()
            line = _readline(proc.stdout, timeout)
        except (TimeoutError, BrokenPipeError, OSError) as error:
            self._stop()
            if isinstance(error, TimeoutError):
                raise StudyError("The model timed out.") from error
            raise StudyError("Study generation failed.") from error
        if proc.poll() is not None or not line:
            detail = _error_message("".join(self._stderr))
            self._stop()
            raise StudyError(detail)
        try:
            parsed = json.loads(line)
        except json.JSONDecodeError as error:
            self._stop()
            raise StudyError("Study generation returned an unreadable result.") from error
        if isinstance(parsed, dict) and isinstance(parsed.get("error"), dict):
            message = parsed["error"].get("message")
            if isinstance(message, str) and message.strip():
                raise StudyError(message.strip())
            raise StudyError("Study generation failed.")
        if not isinstance(parsed, dict):
            raise StudyError("Study generation returned an unreadable result.")
        return parsed

    def _stop(self) -> None:
        proc = self._proc
        self._proc = None
        self._env_key = None
        if proc is None or proc.poll() is not None:
            return
        proc.terminate()
        try:
            proc.wait(timeout=2)
        except subprocess.TimeoutExpired:
            proc.kill()


_session = StudySession()
atexit.register(_session._stop)


def run_study(payload: dict, *, repo_root: Path, env: dict[str, str]) -> dict:
    return _session.call(payload, repo_root=repo_root, env=env)


def _readline(stream: object, timeout: float) -> str:
    if stream is None or not hasattr(stream, "readline"):
        return ""
    box: list[str] = []

    def read() -> None:
        box.append(stream.readline())

    thread = threading.Thread(target=read, daemon=True)
    thread.start()
    thread.join(timeout)
    if thread.is_alive():
        raise TimeoutError
    return box[0] if box else ""


def _drain(stream: object, bucket: list[str]) -> None:
    readline = getattr(stream, "readline", None)
    if readline is None:
        return
    while True:
        line = readline()
        if not line:
            return
        bucket.append(redact(line))
        del bucket[:-20]


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
