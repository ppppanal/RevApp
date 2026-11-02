import { AppError } from "../errors";
import type { StudyPack } from "./parse-study-pack";

export const NO_PAIRED_LINES_MESSAGE = "This file has no paired lines.";

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

export function localRevisionPack(text: string): StudyPack {
  const vocab = kanaKanjiCards(text);
  const flashcards =
    vocab ??
    pairedLinesFromText(text).map((pair) => ({
      question: pair.term,
      answer: pair.meaning,
    }));
  if (flashcards.length === 0) {
    throw new AppError("VALIDATION", NO_PAIRED_LINES_MESSAGE, 400);
  }
  return {
    summary: vocab ? "Revision cards from kanji and kana." : "Revision cards from paired lines.",
    keyPoints: [
      {
        kind: "FACT",
        content: vocab
          ? "Revision cards were built from rows that have both kanji and kana."
          : "Revision cards were built from paired lines in the file.",
      },
    ],
    flashcards,
  };
}
