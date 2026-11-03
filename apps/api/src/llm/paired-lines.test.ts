import { describe, expect, it } from "vitest";
import { AppError } from "../errors";
import {
  kanaKanjiCards,
  localRevisionPack,
  NO_PARAGRAPHS_MESSAGE,
  paragraphRevisionPack,
  splitPairedLine,
} from "./paired-lines";

describe("paired lines", () => {
  it("splits a line on a tab, several spaces, a pipe, or a colon", () => {
    expect(splitPairedLine("ATP\tenergy currency")).toEqual({ term: "ATP", meaning: "energy currency" });
    expect(splitPairedLine("Cell    basic unit")).toEqual({ term: "Cell", meaning: "basic unit" });
    expect(splitPairedLine("Gene | a unit of heredity")).toEqual({
      term: "Gene",
      meaning: "a unit of heredity",
    });
    expect(splitPairedLine("Mitochondria: powerhouse")).toEqual({
      term: "Mitochondria",
      meaning: "powerhouse",
    });
  });

  it("skips lines that do not split into one term and one meaning", () => {
    expect(splitPairedLine("just a sentence")).toBeNull();
    expect(splitPairedLine("one space only")).toBeNull();
    expect(splitPairedLine("too\tmany\tcolumns")).toBeNull();
    expect(splitPairedLine("Term: meaning: extra")).toBeNull();
    expect(splitPairedLine("   ")).toBeNull();
  });

  it("builds paragraph cards for prose and does not split on a colon", () => {
    const pack = paragraphRevisionPack("Role: developer and TypeScript.\n\nSkills include PostgreSQL.");
    expect(pack.keyPoints.map((point) => point.content)).toEqual([
      "Role: developer and TypeScript.",
      "Skills include PostgreSQL.",
    ]);
    expect(pack.flashcards.map((card) => card.answer)).toEqual([
      "Role: developer and TypeScript.",
      "Skills include PostgreSQL.",
    ]);
    expect(pack.summary).toContain("Role: developer");
    expect(() => localRevisionPack("   ")).toThrow(AppError);
    expect(() => localRevisionPack("   ")).toThrow(NO_PARAGRAPHS_MESSAGE);
  });

  it("builds kanji to kana cards from a three-column vocab sheet", () => {
    const text = [
      "大家的日本語",
      "第1課",
      "單字",
      "わたし\t我",
      "せんせい\t先生\t老師",
      "あのひと\tあの人\t他、她、那個人",
      "だれ\t誰(哪位)",
      "どうぞよろしくおねがいします。\tどうぞよろしくお願いします。\t請多關照.請多指教.",
      "Note: this gloss is not a second card",
    ].join("\n");
    expect(kanaKanjiCards(text)).toEqual([
      { question: "先生", answer: "せんせい" },
      { question: "あの人", answer: "あのひと" },
      { question: "どうぞよろしくお願いします。", answer: "どうぞよろしくおねがいします。" },
    ]);
    expect(localRevisionPack(text).flashcards).toEqual(kanaKanjiCards(text));
  });
});
