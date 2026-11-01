import { describe, expect, it } from "vitest";
import { parseStudyCliInput } from "./study-input";

describe("study CLI input", () => {
  it("accepts pasted text", () => {
    const prepared = parseStudyCliInput({
      userId: "user_1",
      tags: ["ATP", "cells"],
      source: { kind: "text", text: "Mitochondria produce ATP." },
    });
    expect(prepared.userId).toBe("user_1");
    expect(prepared.command.tagNames).toEqual(["ATP", "cells"]);
    expect(prepared.command.source).toEqual({ kind: "text", text: "Mitochondria produce ATP." });
  });

  it("keeps in-process OCR text and does not require image bytes", () => {
    const prepared = parseStudyCliInput({
      source: { kind: "image", filename: "board.png", mimeType: "image/png" },
      extractedText: "細胞は ATP を作る",
    });
    expect(prepared.extractedText).toBe("細胞は ATP を作る");
    expect(prepared.command.source).toMatchObject({ kind: "image", filename: "board.png", data: undefined });
  });

  it("requires PDF bytes when the text layer was not extracted yet", () => {
    expect(() => parseStudyCliInput({ source: { kind: "pdf", filename: "notes.pdf" } })).toThrow(/Attach a PDF file/);
  });
});
