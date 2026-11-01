import { maxNoteTextLength, maxUploadBytes } from "@rev/shared";
import { z } from "zod";
import { AppError } from "./errors";
import type { CreateNoteCommand } from "./services/types";
import { decodeUpload } from "./validation/decode-upload";

const label = z.string().trim().min(1).max(200);

const textSource = z
  .object({
    kind: z.literal("text"),
    text: z.string().trim().min(1).max(maxNoteTextLength),
  })
  .strict();

const pdfSource = z
  .object({
    kind: z.literal("pdf"),
    filename: z.string().trim().min(1).max(200).optional(),
    dataBase64: z.string().optional(),
  })
  .strict();

const imageSource = z
  .object({
    kind: z.literal("image"),
    filename: z.string().trim().min(1).max(200).optional(),
    mimeType: z.string().trim().min(1).max(120).optional(),
    dataBase64: z.string().optional(),
  })
  .strict();

export const studyCliInputSchema = z
  .object({
    action: z.literal("create").optional(),
    userId: z.string().trim().min(1).max(80).optional(),
    title: label.optional(),
    subjectName: z.string().trim().min(1).max(80).optional(),
    tags: z.array(z.string()).max(20).optional(),
    extractedText: z.string().optional(),
    source: z.discriminatedUnion("kind", [textSource, pdfSource, imageSource]),
  })
  .strict();

export type StudyCliInput = z.infer<typeof studyCliInputSchema>;

export interface PreparedStudy {
  userId?: string;
  command: CreateNoteCommand;
  extractedText?: string;
}

export function parseStudyCliInput(value: unknown): PreparedStudy {
  const parsed = studyCliInputSchema.safeParse(value);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new AppError("VALIDATION", issue?.message ?? "The study request is invalid.", 400);
  }
  return toPreparedStudy(parsed.data);
}

function toPreparedStudy(input: StudyCliInput): PreparedStudy {
  const title = input.title;
  const subjectName = input.subjectName;
  const tagNames = input.tags;
  const userId = input.userId;
  if (input.source.kind === "text") {
    return { userId, command: { title, subjectName, tagNames, source: { kind: "text", text: input.source.text } } };
  }

  const extractedText = input.extractedText;
  const bytes = input.source.dataBase64
    ? decodeUpload(input.source.dataBase64, input.source.kind === "pdf" ? "PDF" : "Image")
    : undefined;
  if (extractedText === undefined && (!bytes || bytes.byteLength === 0)) {
    throw new AppError(
      "VALIDATION",
      input.source.kind === "pdf" ? "Attach a PDF file." : "Attach an image.",
      400,
    );
  }
  if (bytes && bytes.byteLength > maxUploadBytes) {
    throw new AppError("VALIDATION", "File must be 6 MB or smaller.", 400);
  }

  if (input.source.kind === "pdf") {
    return {
      userId,
      command: { title, subjectName, tagNames, source: { kind: "pdf", filename: input.source.filename, data: bytes } },
      extractedText,
    };
  }
  return {
    userId,
    command: {
      title,
      subjectName,
      tagNames,
      source: { kind: "image", filename: input.source.filename, mimeType: input.source.mimeType, data: bytes },
    },
    extractedText,
  };
}
