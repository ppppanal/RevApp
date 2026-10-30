import { UnsupportedExtractionError } from "../errors";

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
    throw new UnsupportedExtractionError("pdf");
  }
}

export class ImageTextExtractor implements TextExtractor {
  async extract(source: ExtractionSource): Promise<string> {
    if (source.kind !== "image") {
      throw new Error("Image extractor received a non-image source.");
    }
    throw new UnsupportedExtractionError("image");
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
