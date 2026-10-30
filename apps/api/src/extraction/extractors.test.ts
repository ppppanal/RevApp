import { describe, expect, it } from "vitest";
import { UnsupportedExtractionError } from "../errors";
import { RoutingTextExtractor } from "./extractors";

describe("RoutingTextExtractor", () => {
  const extractor = new RoutingTextExtractor();

  it("returns plain text unchanged", async () => {
    await expect(extractor.extract({ kind: "text", text: "  ATP  " })).resolves.toBe("  ATP  ");
  });

  it("rejects PDF and image sources with a typed unsupported error", async () => {
    await expect(extractor.extract({ kind: "pdf", filename: "notes.pdf" })).rejects.toMatchObject({
      name: "UnsupportedExtractionError",
      code: "UNSUPPORTED_SOURCE",
      status: 501,
      message: "PDF extraction is not available yet. Create a note from plain text.",
    });
    await expect(extractor.extract({ kind: "image", mimeType: "image/png" })).rejects.toBeInstanceOf(
      UnsupportedExtractionError,
    );
    await expect(extractor.extract({ kind: "image" })).rejects.toThrow(/Image extraction is not available yet/);
  });
});
