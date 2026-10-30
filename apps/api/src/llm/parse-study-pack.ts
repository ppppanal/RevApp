import { z } from "zod";
import { GenerationError } from "../errors";

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
    flashcards: z.array(flashcardSchema).min(1).max(30),
  })
  .strict();

export type StudyPack = z.infer<typeof studyPackSchema>;

export function parseStudyPack(raw: string): StudyPack {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;

  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new GenerationError("INVALID_JSON", "The model response was not valid JSON.");
  }

  const result = studyPackSchema.safeParse(parsed);
  if (!result.success) {
    throw new GenerationError("INVALID_JSON", "The model response did not match the study pack schema.");
  }
  return result.data;
}
