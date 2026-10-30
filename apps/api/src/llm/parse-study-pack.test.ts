import { describe, expect, it } from "vitest";
import { GenerationError } from "../errors";
import { parseStudyPack } from "./parse-study-pack";

const valid = {
  summary: "Cells make ATP in mitochondria.",
  keyPoints: [
    { kind: "DEFINITION", content: "Mitochondria produce ATP." },
    { kind: "FORMULA", content: "ATP is the energy currency." },
  ],
  flashcards: [{ question: "What do mitochondria produce?", answer: "ATP" }],
};

describe("parseStudyPack", () => {
  it("accepts strict JSON and a single fenced object", () => {
    expect(parseStudyPack(JSON.stringify(valid)).summary).toBe(valid.summary);
    expect(parseStudyPack(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``).flashcards).toHaveLength(1);
  });

  it("rejects prose, invalid JSON, and objects that do not match the schema", () => {
    expect(() => parseStudyPack("here you go")).toThrow(GenerationError);
    expect(() => parseStudyPack("{")).toThrow(expect.objectContaining({ code: "INVALID_JSON" }));
    expect(() => parseStudyPack(JSON.stringify({ summary: "Only a summary" }))).toThrow(
      expect.objectContaining({ code: "INVALID_JSON" }),
    );
    expect(() =>
      parseStudyPack(JSON.stringify({ ...valid, extra: true })),
    ).toThrow(/study pack schema/);
  });
});
