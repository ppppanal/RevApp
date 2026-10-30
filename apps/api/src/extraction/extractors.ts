import { AppError } from "../errors";
import { isPdf, sniffImageMime } from "./file-type";
import { recognizeImageText } from "./image-ocr";
import { readPdfText } from "./pdf-text";

export type ExtractionSource =
  | { kind: "text"; text: string }
  | { kind: "pdf"; filename?: string; data?: Uint8Array }
  | { kind: "image"; filename?: string; mimeType?: string; data?: Uint8Array };

export interface TextExtractor {
  extract(source: ExtractionSource): Promise<string>;
}

export class PlainTextExtractor implements TextExtractor {
  async extract(source: ExtractionSource): Promise<string> {
    if (source.kind !== "text") {
      throw new Error("Plain text extractor received a non-text source.");
    }
    return source.text;
  }
}

export class PdfTextExtractor implements TextExtractor {
  async extract(source: ExtractionSource): Promise<string> {
    if (source.kind !== "pdf") {
      throw new Error("PDF extractor received a non-PDF source.");
    }
    if (!source.data || source.data.byteLength === 0) {
      throw new AppError("VALIDATION", "Attach a PDF file.", 400);
    }
    if (!isPdf(source.data)) {
      throw new AppError("VALIDATION", "This file is not a PDF.", 400);
    }
    let text: string;
    try {
      text = await readPdfText(source.data);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw pdfFailure(error);
    }
    if (!text.trim()) {
      throw new AppError(
        "EMPTY_TEXT",
        "This PDF has no selectable text. Scanned PDFs are not supported.",
        400,
      );
    }
    return text;
  }
}

export class ImageTextExtractor implements TextExtractor {
  async extract(source: ExtractionSource): Promise<string> {
    if (source.kind !== "image") {
      throw new Error("Image extractor received a non-image source.");
    }
    if (!source.data || source.data.byteLength === 0) {
      throw new AppError("VALIDATION", "Attach an image.", 400);
    }
    const sniffed = sniffImageMime(source.data);
    const declared = source.mimeType?.trim().toLowerCase();
    if (!sniffed || (declared && !declared.startsWith("image/"))) {
      throw new AppError("VALIDATION", "Use a PNG, JPEG, WEBP, GIF, or BMP image.", 400);
    }
    let text: string;
    try {
      text = await recognizeImageText(source.data);
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError("EXTRACTION_FAILED", "Could not read text from this image.", 422);
    }
    if (!text.trim()) {
      throw new AppError("EMPTY_TEXT", "No text was found in this image.", 400);
    }
    return text;
  }
}

export class RoutingTextExtractor implements TextExtractor {
  constructor(
    private readonly text: TextExtractor = new PlainTextExtractor(),
    private readonly pdf: TextExtractor = new PdfTextExtractor(),
    private readonly image: TextExtractor = new ImageTextExtractor(),
  ) {}

  extract(source: ExtractionSource): Promise<string> {
    switch (source.kind) {
      case "text":
        return this.text.extract(source);
      case "pdf":
        return this.pdf.extract(source);
      case "image":
        return this.image.extract(source);
    }
  }
}

function pdfFailure(error: unknown): AppError {
  const message = error instanceof Error ? error.message : "";
  if (/password/i.test(message)) {
    return new AppError("EXTRACTION_FAILED", "This PDF is password-protected.", 422);
  }
  return new AppError("EXTRACTION_FAILED", "Could not read text from this PDF.", 422);
}
