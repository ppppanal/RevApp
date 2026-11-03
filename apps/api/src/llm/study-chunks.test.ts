import { describe, expect, it } from "vitest";
import type { StudyPack } from "./parse-study-pack";
import { STUDY_CHUNK_CHARACTERS, mergeStudyPacks, studyChunks } from "./study-chunks";

function pack(summary: string, fact: string): StudyPack {
  return {
    summary,
    keyPoints: [{ kind: "FACT", content: fact }],
    flashcards: [{ question: fact, answer: fact }],
  };
}

describe("studyChunks", () => {
  it("keeps a short note as one chunk and splits a longer note on paragraphs", () => {
    expect(studyChunks("Mitochondria produce ATP.")).toEqual(["Mitochondria produce ATP."]);

    const alpha = `Alpha. ${"a".repeat(2_000)}`;
    const beta = `Beta. ${"b".repeat(2_000)}`;
    const split = studyChunks(`${alpha}\n\n${beta}`);
    expect(split).toEqual([alpha, beta]);
    for (const chunk of split) expect(chunk.length).toBeLessThanOrEqual(STUDY_CHUNK_CHARACTERS);

    const fitted = studyChunks(`${"A".repeat(1_500)}\n\n${"B".repeat(1_500)}`);
    expect(fitted).toHaveLength(1);
    expect(fitted[0]).toContain("A".repeat(1_500));
    expect(fitted[0]).toContain("B".repeat(1_500));
  });

  it("cuts a paragraph that is longer than one chunk", () => {
    const chunks = studyChunks("word ".repeat(2_000));
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.join(" ").replace(/ +/g, " ").trim().length).toBeGreaterThan(STUDY_CHUNK_CHARACTERS);
    for (const chunk of chunks) expect(chunk.length).toBeLessThanOrEqual(STUDY_CHUNK_CHARACTERS);
  });
});

describe("mergeStudyPacks", () => {
  it("returns one pack unchanged and joins later packs in order", () => {
    const only = pack("Only.", "One fact.");
    expect(mergeStudyPacks([only])).toBe(only);

    const merged = mergeStudyPacks([pack("First.", "Alpha"), pack("Second.", "Beta")]);
    expect(merged.summary).toBe("First. Second.");
    expect(merged.keyPoints.map((point) => point.content)).toEqual(["Alpha", "Beta"]);
    expect(merged.flashcards.map((card) => card.answer)).toEqual(["Alpha", "Beta"]);

    const clipped = mergeStudyPacks([pack("A".repeat(3_000), "Alpha"), pack("B".repeat(3_000), "Beta")]);
    expect(clipped.summary.length).toBeLessThanOrEqual(4_000);
    expect(clipped.summary.startsWith("A".repeat(100))).toBe(true);
    expect(clipped.summary.endsWith("…")).toBe(true);
  });
});
