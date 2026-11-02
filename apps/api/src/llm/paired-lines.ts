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

export function localRevisionPack(text: string): StudyPack {
  const pairs = pairedLinesFromText(text);
  if (pairs.length === 0) {
    throw new AppError("VALIDATION", NO_PAIRED_LINES_MESSAGE, 400);
  }
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
