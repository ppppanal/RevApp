import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { RoutingTextExtractor } from "./extractors";
import { shutdownImageOcr } from "./image-ocr";
import { textPdf } from "./text-pdf";

const fixture = readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), "fixtures/mitochondria.png"));

describe("RoutingTextExtractor", () => {
  const extractor = new RoutingTextExtractor();

  afterAll(async () => {
    await shutdownImageOcr();
  });

  it("returns plain text unchanged", async () => {
    await expect(extractor.extract({ kind: "text", text: "  ATP  " })).resolves.toBe("  ATP  ");
  });

  it("extracts a text layer from a PDF", async () => {
    const text = await extractor.extract({
      kind: "pdf",
      filename: "cells.pdf",
      data: textPdf(["Mitochondria produce ATP.", "ATP is the energy currency."]),
    });
    expect(text).toContain("Mitochondria produce ATP.");
    expect(text).toContain("ATP is the energy currency.");
  });

  it("rejects a PDF with no text layer", async () => {
    await expect(extractor.extract({ kind: "pdf", data: textPdf([""]) })).rejects.toMatchObject({
      code: "EMPTY_TEXT",
      status: 400,
      message: "This PDF has no selectable text. Scanned PDFs are not supported.",
    });
  });

  it("rejects a file that is not a PDF", async () => {
    await expect(extractor.extract({ kind: "pdf", data: new Uint8Array(Buffer.from("hello")) })).rejects.toMatchObject({
      code: "VALIDATION",
      message: "This file is not a PDF.",
    });
  });

  it("rejects a PDF that cannot be parsed", async () => {
    await expect(
      extractor.extract({ kind: "pdf", data: new Uint8Array(Buffer.from("%PDF-1.4\ngarbage")) }),
    ).rejects.toMatchObject({
      code: "EXTRACTION_FAILED",
      status: 422,
    });
  });

  it("rejects a PDF with too many pages", async () => {
    await expect(extractor.extract({ kind: "pdf", data: textPdf(Array.from({ length: 51 }, () => "Hi")) })).rejects.toMatchObject({
      code: "VALIDATION",
      message: /51 pages/,
    });
  });

  it("reads English text from an image", async () => {
    const text = await extractor.extract({
      kind: "image",
      filename: "notes.png",
      mimeType: "image/png",
      data: new Uint8Array(fixture),
    });
    expect(text).toContain("Mitochondria produce ATP");
  }, 30_000);

  it("rejects a file that is not an image", async () => {
    await expect(
      extractor.extract({ kind: "image", mimeType: "image/png", data: new Uint8Array(Buffer.from("hello")) }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: /PNG, JPEG/,
    });
  });
});
