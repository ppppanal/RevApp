import { describe, expect, it } from "vitest";
import { RoutingTextExtractor, type TextExtractor } from "../extraction/extractors";
import { textPdf } from "../extraction/text-pdf";
import { MemoryObjectStore } from "../storage/memory-store";
import { NoteService } from "./note-service";

const extractor: TextExtractor = {
  async extract() {
    return "Mitochondria produce ATP.";
  },
};

describe("NoteService file storage", () => {
  it("rejects a PDF when object storage is not configured", async () => {
    const service = new NoteService({} as never, extractor, { generate: async () => "" } as never, null);
    await expect(
      service.create("user_1", { source: { kind: "pdf", filename: "notes.pdf", data: new Uint8Array([1]) } }),
    ).rejects.toMatchObject({ code: "STORAGE_FAILED", status: 503 });
  });

  it("stores PDF bytes and records the object key", async () => {
    const files = new MemoryObjectStore();
    let createData: { sourceFiles?: { create?: { storageKey?: string; mimeType?: string; kind?: string } } } | undefined;
    const prisma = {
      note: {
        async create({ data }: { data: typeof createData }) {
          createData = data;
          throw new Error("stop after insert");
        },
      },
    };
    const service = new NoteService(prisma as never, extractor, { generate: async () => "" } as never, files);
    const body = new Uint8Array([9, 8, 7]);
    await expect(
      service.create("user_1", { source: { kind: "pdf", filename: "notes.pdf", data: body } }),
    ).rejects.toThrow(/stop after insert/);

    expect(files.objects.size).toBe(1);
    const stored = [...files.objects.values()][0];
    expect(stored?.contentType).toBe("application/pdf");
    expect(stored?.body).toEqual(body);
    expect(createData?.sourceFiles?.create).toMatchObject({
      kind: "PDF",
      mimeType: "application/pdf",
      storageKey: stored?.key,
    });
  });

  it("stores the original PDF after the text layer is read", async () => {
    const files = new MemoryObjectStore();
    const pdf = textPdf(["Mitochondria produce ATP."]);
    const original = new Uint8Array(pdf);
    const prisma = {
      note: {
        async create() {
          throw new Error("stop after insert");
        },
      },
    };
    const service = new NoteService(
      prisma as never,
      new RoutingTextExtractor(),
      { generate: async () => "" } as never,
      files,
    );
    await expect(
      service.create("user_1", { source: { kind: "pdf", filename: "cells.pdf", data: pdf } }),
    ).rejects.toThrow(/stop after insert/);
    const stored = [...files.objects.values()][0];
    expect(Buffer.from(stored?.body ?? [])).toEqual(Buffer.from(original));
  });

  it("returns a typed error when the upload fails", async () => {
    const files = {
      async put() {
        throw new Error("network");
      },
    };
    const service = new NoteService({} as never, extractor, { generate: async () => "" } as never, files);
    await expect(
      service.create("user_1", {
        source: { kind: "image", filename: "notes.png", mimeType: "image/png", data: new Uint8Array([1]) },
      }),
    ).rejects.toMatchObject({ code: "STORAGE_FAILED", status: 502, message: "Could not store this file." });
  });
});
