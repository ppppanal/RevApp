import type { StudyPack } from "./parse-study-pack";

export const STUDY_CHUNK_CHARACTERS = 4_000;
const SUMMARY_CHARACTERS = 4_000;

// Split on paragraph breaks so a general PDF is several model calls, each about this size.
export function studyChunks(text: string, size = STUDY_CHUNK_CHARACTERS): string[] {
  const source = text.replace(/\r\n/g, "\n");
  const trimmed = source.trim();
  if (trimmed.length <= size) return [trimmed.length > 0 ? trimmed : source];

  const chunks: string[] = [];
  let current = "";

  const flush = () => {
    const piece = current.trim();
    current = "";
    if (piece) chunks.push(piece);
  };

  const append = (paragraph: string) => {
    const block = paragraph.trim();
    if (!block) return;
    if (block.length > size) {
      flush();
      let rest = block;
      while (rest.length > size) {
        const window = rest.slice(0, size);
        const line = window.lastIndexOf("\n");
        const space = window.lastIndexOf(" ");
        const halfway = Math.floor(size / 2);
        const splitAt = line >= halfway ? line : space >= halfway ? space : size;
        const head = rest.slice(0, splitAt).trim();
        if (head) chunks.push(head);
        rest = rest.slice(splitAt).trim();
      }
      current = rest;
      return;
    }
    if (!current) {
      current = block;
      return;
    }
    if (current.length + 2 + block.length <= size) {
      current = `${current}\n\n${block}`;
      return;
    }
    flush();
    current = block;
  };

  for (const paragraph of trimmed.split(/\n\s*\n/)) append(paragraph);
  flush();
  return chunks;
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
