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

const KANA = /[\u3040-\u30ff]/;
const KANJI = /[\u4e00-\u9fff]/;

function isKanaReading(cell: string): boolean {
  return KANA.test(cell) && !KANJI.test(cell);
}

// Minna-style vocab rows are kana, then kanji, then a gloss. A row with no kanji column is skipped.
export function kanaKanjiCards(text: string): Array<{ question: string; answer: string }> | null {
  const rows = text
    .split(/\n/)
    .map((line) => line.split("\t").map((cell) => cell.trim()).filter((cell) => cell.length > 0));
  const cards = rows.flatMap((cells) => {
    if (cells.length < 3 || !isKanaReading(cells[0]) || !KANJI.test(cells[1])) return [];
    return [{ question: cells[1], answer: cells[0] }];
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

export function localRevisionPack(text: string): StudyPack {
  const vocab = kanaKanjiCards(text);
  if (vocab) return vocabRevisionPack(vocab);
  return paragraphRevisionPack(text);
}
