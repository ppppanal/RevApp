import type { StudyPack } from "./parse-study-pack";
import { isImageOnlyFragment, isSectionHeading } from "../text/section-text";

export const STUDY_CHUNK_CHARACTERS = 4_000;
const SUMMARY_CHARACTERS = 4_000;

interface Section {
  heading: string;
  body: string[];
}

// Split on paragraph breaks so a general PDF is several model calls, each about this size.
// A section heading stays with the text that follows it, and a heading line is never cut.
export function studyChunks(text: string, size = STUDY_CHUNK_CHARACTERS): string[] {
  const source = text.replace(/\r\n/g, "\n");
  const trimmed = source.trim();
  if (!trimmed) return [source];

  const paragraphs = trimmed
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0 && !isImageOnlyFragment(paragraph));
  if (paragraphs.length === 0) return [];

  const pieces = sectionsOf(paragraphs).flatMap((section) => sectionPieces(section, size));
  const chunks: string[] = [];
  let current = "";
  for (const piece of pieces) {
    if (!current) {
      current = piece;
      continue;
    }
    if (current.length + 2 + piece.length <= size) {
      current = `${current}\n\n${piece}`;
      continue;
    }
    chunks.push(current);
    current = piece;
  }
  if (current) chunks.push(current);
  return chunks;
}

function sectionsOf(paragraphs: string[]): Section[] {
  const sections: Section[] = [];
  let current: Section = { heading: "", body: [] };
  for (const paragraph of paragraphs) {
    if (!isSectionHeading(paragraph)) {
      current.body.push(paragraph);
      continue;
    }
    if (current.heading || current.body.length > 0) sections.push(current);
    current = { heading: paragraph, body: [] };
  }
  if (current.heading || current.body.length > 0) sections.push(current);
  return sections;
}

function sectionPieces(section: Section, size: number): string[] {
  const pieces: string[] = [];
  let body: string[] = [];
  const textOf = (extra?: string) => [section.heading, ...body, extra].filter((part) => part && part.length > 0).join("\n\n");
  const flush = () => {
    const text = textOf();
    if (text) pieces.push(text);
    body = [];
  };
  const budget = Math.max(1, size - (section.heading ? section.heading.length + 2 : 0));
  for (const paragraph of section.body) {
    if (paragraph.length > budget) {
      if (body.length > 0) flush();
      for (const slice of sliceBody(paragraph, budget)) {
        pieces.push(textOf(slice));
      }
      continue;
    }
    if (body.length > 0 && textOf(paragraph).length > size) flush();
    body.push(paragraph);
  }
  flush();
  return pieces;
}

function sliceBody(paragraph: string, budget: number): string[] {
  const parts: string[] = [];
  let rest = paragraph.trim();
  while (rest.length > budget) {
    const window = rest.slice(0, budget);
    const line = window.lastIndexOf("\n");
    const space = window.lastIndexOf(" ");
    const halfway = Math.floor(budget / 2);
    const splitAt = line >= halfway ? line : space >= halfway ? space : budget;
    const head = rest.slice(0, splitAt).trim();
    if (!head) break;
    parts.push(head);
    const next = rest.slice(splitAt).trim();
    if (next.length === 0 || next === rest) break;
    rest = next;
  }
  if (rest) parts.push(rest);
  return parts;
}

function clipSummary(text: string): string {
  if (text.length <= SUMMARY_CHARACTERS) return text;
  return `${text.slice(0, SUMMARY_CHARACTERS - 1).trimEnd()}…`;
}

// One note: chunk summaries joined in order, then every key point and card in that same order.
export function mergeStudyPacks(packs: StudyPack[]): StudyPack {
  const first = packs[0];
  if (!first) {
    throw new Error("No study packs to merge.");
  }
  if (packs.length === 1) return first;
  const summary = clipSummary(
    packs
      .map((pack) => pack.summary.trim())
      .filter((part) => part.length > 0)
      .join(" "),
  );
  return {
    summary: summary || first.summary,
    keyPoints: packs.flatMap((pack) => pack.keyPoints),
    flashcards: packs.flatMap((pack) => pack.flashcards),
  };
}
