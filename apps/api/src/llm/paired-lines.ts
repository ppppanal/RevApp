import { AppError } from "../errors";
import type { StudyPack } from "./parse-study-pack";

export const NO_PAIRED_LINES_MESSAGE = "This file has no paired lines.";
export const NO_PARAGRAPHS_MESSAGE = "This file has no paragraphs.";

export interface PairedLine {
  term: string;
  meaning: string;
}

const DELIMITERS = [/\t/, / {2,}/, /\|/, /:/];

export function splitPairedLine(line: string): PairedLine | null {
  const trimmed = line.trim();
  if (!trimmed) return null;
  for (const delimiter of DELIMITERS) {
    if (!delimiter.test(trimmed)) continue;
    const parts = trimmed
      .split(delimiter)
      .map((part) => part.trim())
      .filter((part) => part.length > 0);
    if (parts.length === 2) {
      return { term: parts[0], meaning: parts[1] };
    }
  }
  return null;
}

export function pairedLinesFromText(text: string): PairedLine[] {
  return text
    .split(/\n/)
    .map((line) => splitPairedLine(line))
    .filter((line): line is PairedLine => line !== null);
}

const HIRAGANA = /[\u3041-\u3096]/;
const KATAKANA = /[\u30a1-\u30fa\uff66-\uff9d]/;
const KANA = /[\u3040-\u30ff\uff61-\uff9f]/;
const KANJI = /[\u4e00-\u9fff]/;

function isKanaReading(cell: string): boolean {
  return KANA.test(cell) && !KANJI.test(cell);
}

function isKatakanaWord(cell: string): boolean {
  return KATAKANA.test(cell) && !HIRAGANA.test(cell) && !KANJI.test(cell);
}

// Minna-style vocab rows are kana, then kanji, then a gloss. Katakana is a reading, the same as hiragana.
// A katakana word with no kanji spelling still becomes a card. The Chinese gloss is not written on it.
export function kanaKanjiCards(text: string): Array<{ question: string; answer: string }> | null {
  const rows = text
    .split(/\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()).filter((cell) => cell.length > 0));
  const cards = rows.flatMap((cells) => {
    if (!isKanaReading(cells[0])) return [];
    if (cells.length >= 3 && KANJI.test(cells[1])) return [{ question: cells[1], answer: cells[0] }];
    if (cells.length >= 2 && isKatakanaWord(cells[0])) return [{ question: cells[0], answer: cells[0] }];
    return [];
  });
  if (cards.length === 0) return null;
  return cards;
}

function clip(text: string, max: number): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1).trimEnd()}…`;
}

export function paragraphsOf(text: string): string[] {
  const blocks = text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.replace(/\s+/g, " ").trim())
    .filter((paragraph) => paragraph.length > 0);
  if (blocks.length > 0) return blocks;
  return text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function paragraphRevisionPack(text: string): StudyPack {
  const paragraphs = paragraphsOf(text);
  if (paragraphs.length === 0) {
    throw new AppError("VALIDATION", NO_PARAGRAPHS_MESSAGE, 400);
  }
  const summarySource = [...paragraphs].sort((a, b) => b.length - a.length)[0] ?? paragraphs[0];
  return {
    summary: clip(summarySource, 500),
    keyPoints: paragraphs.map((paragraph) => ({
      kind: "FACT" as const,
      content: clip(paragraph, 1_000),
    })),
    flashcards: paragraphs.map((paragraph) => ({
      question: clip(paragraph, 180),
      answer: clip(paragraph, 4_000),
    })),
  };
}

function vocabRevisionPack(cards: Array<{ question: string; answer: string }>): StudyPack {
  return {
    summary: "Revision cards from kanji and kana.",
    keyPoints: [
      {
        kind: "FACT",
        content: "Revision cards were built from rows that have both kanji and kana.",
      },
    ],
    flashcards: cards,
  };
}

function lineRevisionPack(pairs: PairedLine[]): StudyPack {
  return {
    summary: "Revision cards from paired lines.",
    keyPoints: [
      {
        kind: "FACT",
        content: "Revision cards were built from paired lines in the file.",
      },
    ],
    flashcards: pairs.map((pair) => ({
      question: pair.term,
      answer: pair.meaning,
    })),
  };
}

export function localRevisionPack(text: string): StudyPack {
  const vocab = kanaKanjiCards(text);
  if (vocab) return vocabRevisionPack(vocab);
  const lines = text
    .split(/\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const pairs = pairedLinesFromText(text);
  if (lines.length > 0 && pairs.length === lines.length) return lineRevisionPack(pairs);
  return paragraphRevisionPack(text);
}
