import unittest

from flow import StudyError, build_study_payload, missing_ocr_languages, redact


class FlowTests(unittest.TestCase):
    def test_missing_languages(self) -> None:
        self.assertEqual(missing_ocr_languages({"eng"}), ["chi_sim", "jpn"])
        self.assertEqual(missing_ocr_languages({"eng", "chi_sim", "jpn", "osd"}), [])

    def test_text_payload(self) -> None:
        payload = build_study_payload(text="Mitochondria produce ATP.", title="  Cells  ")
        self.assertEqual(payload["title"], "Cells")
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

    def test_redact_database_url(self) -> None:
        self.assertNotIn("secret", redact("connect postgresql://user:secret@host/db failed"))


if __name__ == "__main__":
    unittest.main()
