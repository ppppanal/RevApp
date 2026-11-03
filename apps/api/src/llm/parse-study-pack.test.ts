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
    expect(parseStudyPack(`The cells use energy.\n${JSON.stringify(valid)}`).summary).toBe(valid.summary);
    expect(parseStudyPack(`<think>{"not":"the pack"}</think>\n${JSON.stringify(valid)}`).summary).toBe(valid.summary);
    expect(parseStudyPack(JSON.stringify({ ...valid, extra: true })).summary).toBe(valid.summary);
    expect(
      parseStudyPack(
        JSON.stringify({
          ...valid,
          keyPoints: [{ kind: "fact", content: "Mitochondria produce ATP.", note: "extra" }],
        }),
      ).keyPoints[0],
    ).toEqual({ kind: "FACT", content: "Mitochondria produce ATP." });
  });

  it("rejects prose, invalid JSON, and objects that do not match the schema", () => {
    expect(() => parseStudyPack("here you go")).toThrow(GenerationError);
    expect(() => parseStudyPack("{")).toThrow(/not valid JSON/);
    expect(() => parseStudyPack(JSON.stringify({ summary: "Only a summary" }))).toThrow(/study pack schema/);
  });

  it("drops heading cards, empty answers, and answers that repeat the question", () => {
    const pack = parseStudyPack(
      JSON.stringify({
        summary: "Nutrients and outcomes.",
        keyPoints: [{ kind: "FACT", content: "Carbohydrates supply energy." }],
        flashcards: [
          { question: "4. Nutrient II", answer: "Nutrient II" },
          { question: "5. 1 Learning Outcomes", answer: "1 Learning Outcomes" },
          { question: "6. Name the nutrient groups", answer: " " },
          { question: "7. Name the nutrient groups", answer: "N/A" },
          { question: "8. State the learning outcome.", answer: "State the learning outcome." },
          { question: "What do carbohydrates supply?", answer: "Energy" },
        ],
      }),
    );
    expect(pack.flashcards).toEqual([{ question: "What do carbohydrates supply?", answer: "Energy" }]);
  });
});
