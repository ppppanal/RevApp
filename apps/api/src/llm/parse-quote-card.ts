import { z } from "zod";
import { GenerationError } from "../errors";

const quoteCardSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000),
    answer: z.string().trim().min(1).max(4_000),
  })
  .strict();

export interface QuoteCard {
  question: string;
  answer: string;
}

export function parseQuoteCard(raw: string): QuoteCard {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const candidate = fenced?.[1]?.trim() ?? trimmed;
  let parsed: unknown;
  try {
    parsed = JSON.parse(candidate);
  } catch {
    throw new GenerationError("INVALID_JSON", "The model response was not valid JSON.");
  }
  const result = quoteCardSchema.safeParse(parsed);
  if (!result.success) {
    throw new GenerationError("INVALID_JSON", "The model response did not match a single revision card.");
  }
  return result.data;
}
