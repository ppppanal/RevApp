import { maxNoteTextLength } from "@rev/shared";
import { describe, expect, it } from "vitest";
import { PlainTextExtractor } from "../extraction/extractors";
import { NoteService } from "./note-service";

describe("NoteService text limit", () => {
  it("rejects extracted text longer than the note limit before saving", async () => {
    const service = new NoteService({} as never, new PlainTextExtractor(), { generate: async () => "" } as never);
    await expect(
      service.create("user", { source: { kind: "text", text: "a".repeat(maxNoteTextLength + 1) } }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      status: 400,
      message: /20,000 characters/,
    });
  });
});
