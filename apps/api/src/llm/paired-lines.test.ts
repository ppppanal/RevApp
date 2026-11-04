import { describe, expect, it } from "vitest";
import { AppError } from "../errors";
import {
  kanaKanjiCards,
  katakanaChartCards,
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

  it("treats a katakana reading like hiragana and leaves the Chinese gloss off the card", () => {
    const text = ["アメリカ\t美國", "コーヒー\t珈琲\t咖啡", "わたし\t我"].join("\n");
    const cards = kanaKanjiCards(text);
    expect(cards).toEqual([
      { question: "アメリカ", answer: "アメリカ" },
      { question: "珈琲", answer: "コーヒー" },
    ]);
    expect(cards?.some((card) => card.question.includes("美國") || card.answer.includes("美國"))).toBe(false);
    expect(cards?.some((card) => card.question.includes("咖啡") || card.answer.includes("咖啡"))).toBe(false);
    expect(cards?.some((card) => card.question === "我" || card.answer === "我")).toBe(false);
  });

  it("builds one card per katakana chart cell and skips a short note", () => {
    const text = ["ア a", "カ ka", "シ shi", "ツ tsu", "ン n"].join("\n");
    expect(katakanaChartCards(text)).toEqual([
      { question: "ア", answer: "a" },
      { question: "カ", answer: "ka" },
      { question: "シ", answer: "shi" },
      { question: "ツ", answer: "tsu" },
      { question: "ン", answer: "n" },
    ]);
    const pack = localRevisionPack(text);
    expect(pack.flashcards).toEqual(katakanaChartCards(text));
    expect(pack.keyPoints).toEqual([]);
    expect(katakanaChartCards("ア a\nイ i\nウ u\nエ e")).toBeNull();
    expect(katakanaChartCards("The カ is a syllable in シ shi, not a chart.")).toBeNull();
  });

  it("keeps a clean pair from a noisy page read and does not save those lines as key points", () => {
    const text = ["FT a Fy ka サ sa", "シン shi", "オ s ゴ ko Y so"].join("\n");
    const pack = localRevisionPack(text);
    expect(pack.flashcards).toEqual([{ question: "サ", answer: "sa" }]);
    expect(pack.keyPoints).toEqual([]);
    expect(JSON.stringify(pack)).not.toContain("FT a");
    expect(JSON.stringify(pack)).not.toContain("FACT");
  });
});
