import { z } from "zod";

export const keyPointKinds = ["DEFINITION", "FORMULA", "FACT"] as const;
export const noteStatuses = ["PROCESSING", "READY", "FAILED"] as const;
export const maxNoteTextLength = 20_000;
export const maxUploadBytes = 6_000_000;
export const apiErrorCodes = [
  "VALIDATION",
  "NOT_FOUND",
  "UNSUPPORTED_SOURCE",
  "EMPTY_TEXT",
  "EXTRACTION_FAILED",
  "TIMEOUT",
  "INVALID_JSON",
  "PROVIDER_ERROR",
  "INTERNAL",
] as const;

export type KeyPointKind = (typeof keyPointKinds)[number];
export type NoteStatus = (typeof noteStatuses)[number];
export type ApiErrorCode = (typeof apiErrorCodes)[number];

const blankToUndefined = (value: unknown): unknown => {
  if (typeof value === "string" && value.trim() === "") return undefined;
  return value;
};

const optionalLabel = (max: number) =>
  z.preprocess(blankToUndefined, z.string().trim().min(1).max(max).optional());

const fileData = (missing: string) =>
  z
    .string({ required_error: missing, invalid_type_error: missing })
    .trim()
    .min(1, missing)
    .max(8_200_000, "File must be 6 MB or smaller.");

const textSourceSchema = z
  .object({
    kind: z.literal("text"),
    text: z.string().trim().min(1).max(maxNoteTextLength),
  })
  .strict();

const pdfSourceSchema = z
  .object({
    kind: z.literal("pdf"),
    filename: z.string().trim().min(1).max(200).optional(),
    data: fileData("Attach a PDF file."),
  })
  .strict();

const imageSourceSchema = z
  .object({
    kind: z.literal("image"),
    filename: z.string().trim().min(1).max(200).optional(),
    mimeType: z.string().trim().min(1).max(120).optional(),
    data: fileData("Attach an image."),
  })
  .strict();

export const createNoteRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(maxNoteTextLength).optional(),
    title: optionalLabel(200),
    subjectName: optionalLabel(80),
    source: z.discriminatedUnion("kind", [textSourceSchema, pdfSourceSchema, imageSourceSchema]).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.text && value.source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Send either text or source, not both.",
        path: ["source"],
      });
    }
    if (!value.text && !value.source) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Provide note text.",
        path: ["text"],
      });
    }
  });

export type CreateNoteRequest = z.infer<typeof createNoteRequestSchema>;

export const updateFlashcardRequestSchema = z
  .object({
    question: z.string().trim().min(1).max(2_000).optional(),
    answer: z.string().trim().min(1).max(4_000).optional(),
  })
  .strict()
  .refine((value) => value.question !== undefined || value.answer !== undefined, {
    message: "Provide a question or an answer to update.",
  });

export type UpdateFlashcardRequest = z.infer<typeof updateFlashcardRequestSchema>;

export interface KeyPoint {
  id: string;
  kind: KeyPointKind;
  content: string;
  position: number;
}

export interface Flashcard {
  id: string;
  question: string;
  answer: string;
  position: number;
  edited: boolean;
}

export interface NoteResponse {
  id: string;
  title: string;
  status: NoteStatus;
  summary: string | null;
  subjectName: string | null;
  keyPoints: KeyPoint[];
  flashcards: Flashcard[];
  createdAt: string;
  updatedAt: string;
}

export interface NoteSummary {
  id: string;
  title: string;
  status: NoteStatus;
  summary: string | null;
  subjectName: string | null;
  flashcardCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    message: string;
    noteId?: string;
  };
}

export function answersMatch(expected: string, given: string): boolean {
  const answer = normalizeAnswer(expected);
  const attempt = normalizeAnswer(given);
  if (!answer || !attempt) return false;
  if (answer === attempt) return true;
  const answerWords = answer.split(" ");
  if (answerWords.length === 1) return attempt.split(" ").includes(answer);
  return attempt.includes(answer);
}

function normalizeAnswer(value: string): string {
  return value
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/ +/g, " ");
}
