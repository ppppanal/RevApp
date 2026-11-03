import { z } from "zod";
import { GenerationError } from "../errors";
import { keepFlashcard } from "../text/section-text";

const keyPointSchema = z
  .object({
    kind: z.enum(["DEFINITION", "FORMULA", "FACT"]),
    content: z.string().trim().min(1).max(1_000),
  })
  .strict();

const flashcardSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    answer: z.string().trim().min(1).max(4_000),
  })
  .strict();

export const studyPackSchema = z
  .object({
    summary: z.string().trim().min(1).max(4_000),
    keyPoints: z.array(keyPointSchema).min(1).max(20),
    flashcards: z.array(flashcardSchema).max(30),
  })
  .strict();

export type StudyPack = z.infer<typeof studyPackSchema>;

export function isStudyPackShape(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  return "summary" in record && "keyPoints" in record && "flashcards" in record;
}

function matchingBrace(text: string, open: number): number {
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let index = open; index < text.length; index += 1) {
    const char = text[index];
    if (inString) {
      if (escape) {
        escape = false;
        continue;
      }
      if (char === "\\") {
        escape = true;
        continue;
      }
      if (char === '"') inString = false;
      continue;
    }
    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return index;
    }
  }
  return -1;
}

// Outermost JSON objects in model text. A failed span is scanned one level down
// so a study pack after a broken `{` is not skipped.
export function embeddedJsonValues(text: string): unknown[] {
  const values: unknown[] = [];
  const collect = (source: string) => {
    for (let index = 0; index < source.length; index += 1) {
      if (source[index] !== "{") continue;
      const end = matchingBrace(source, index);
      if (end < 0) continue;
      const span = source.slice(index, end + 1);
      try {
        values.push(JSON.parse(span));
      } catch {
        collect(span.slice(1, -1));
      }
      index = end;
    }
  };
  collect(text);
  return values;
}

export function salvageJsonValue(text: string): unknown | undefined {
  const values = embeddedJsonValues(text);
  for (let index = values.length - 1; index >= 0; index -= 1) {
    const value = values[index];
    if (value && typeof value === "object" && !Array.isArray(value) && Array.isArray((value as { choices?: unknown }).choices)) {
      return value;
    }
  }
  for (let index = values.length - 1; index >= 0; index -= 1) {
    if (isStudyPackShape(values[index])) return values[index];
  }
  return values.length > 0 ? values[values.length - 1] : undefined;
}

function coercePoint(point: unknown): unknown {
  if (!point || typeof point !== "object" || Array.isArray(point)) return point;
  const record = point as Record<string, unknown>;
  const kind = typeof record.kind === "string" ? record.kind.trim().toUpperCase() : record.kind;
  return { kind, content: record.content };
}

function coerceCard(card: unknown): { question: string; answer: string } | undefined {
  if (!card || typeof card !== "object" || Array.isArray(card)) return undefined;
  const record = card as Record<string, unknown>;
  const question = typeof record.question === "string" ? record.question : "";
  const answer = typeof record.answer === "string" ? record.answer : "";
  if (!keepFlashcard({ question, answer })) return undefined;
  return { question: question.trim(), answer: answer.trim() };
}

function coerceStudyPack(parsed: unknown): unknown {
  if (typeof parsed === "string") {
    try {
      return coerceStudyPack(JSON.parse(parsed));
    } catch {
      return parsed;
    }
  }
  if (!isStudyPackShape(parsed)) return parsed;
  const record = parsed as Record<string, unknown>;
  return {
    summary: record.summary,
    keyPoints: Array.isArray(record.keyPoints) ? record.keyPoints.map(coercePoint) : record.keyPoints,
    flashcards: Array.isArray(record.flashcards)
      ? record.flashcards.flatMap((card) => {
          const kept = coerceCard(card);
          return kept ? [kept] : [];
        })
      : record.flashcards,
  };
}

function jsonCandidates(raw: string): unknown[] {
  const withoutThink = raw.replace(/<think>[\s\S]*?<\/think>/gi, " ").trim();
  const found: unknown[] = [];
  for (const match of withoutThink.matchAll(/```(?:json)?\s*([\s\S]*?)```/gi)) {
    const fenced = match[1]?.trim();
    if (fenced) found.push(fenced);
  }
  if (withoutThink) found.push(withoutThink);
  found.push(...embeddedJsonValues(raw));
  return found;
}

export function parseStudyPack(raw: string): StudyPack {
  let sawJson = false;
  for (const candidate of jsonCandidates(raw)) {
    let parsed: unknown = candidate;
    if (typeof candidate === "string") {
      try {
        parsed = JSON.parse(candidate);
      } catch {
        continue;
      }
    }
    sawJson = true;
    const result = studyPackSchema.safeParse(coerceStudyPack(parsed));
    if (result.success) return result.data;
  }
  throw new GenerationError(
    "INVALID_JSON",
    sawJson ? "The model response did not match the study pack schema." : "The model response was not valid JSON.",
  );
}
