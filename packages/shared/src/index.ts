import { z } from "zod";

export const keyPointKinds = ["DEFINITION", "FORMULA", "FACT"] as const;
export const noteStatuses = ["PROCESSING", "READY", "FAILED"] as const;
export const apiErrorCodes = [
  "VALIDATION",
  "NOT_FOUND",
  "UNSUPPORTED_SOURCE",
  "EMPTY_TEXT",
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

const textSourceSchema = z
  .object({
    kind: z.literal("text"),
    text: z.string().trim().min(1).max(20_000),
  })
  .strict();

const pdfSourceSchema = z
  .object({
    kind: z.literal("pdf"),
    filename: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const imageSourceSchema = z
  .object({
    kind: z.literal("image"),
    filename: z.string().trim().min(1).max(200).optional(),
    mimeType: z.string().trim().min(1).max(120).optional(),
  })
  .strict();

export const createNoteRequestSchema = z
  .object({
    text: z.string().trim().min(1).max(20_000).optional(),
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
