import { maxNoteTextLength, type NoteResponse, type NoteSummary } from "@rev/shared";
import type { Prisma, PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { AppError } from "../errors";
import type { TextExtractor } from "../extraction/extractors";
import { imageContentType, sourceObjectKey } from "../storage/object-key";
import type { ObjectStore } from "../storage/object-store";
import { cleanNoteText, deriveTitle, stripNullBytes } from "../text/clean-text";
import type { StudyGenerationService } from "./generation-service";
import type { CreateNoteCommand, NoteApi } from "./types";

const noteInclude = {
  subject: true,
  keyPoints: { orderBy: { position: "asc" } },
  flashcards: { orderBy: { position: "asc" } },
} as const;

type NoteRecord = Prisma.NoteGetPayload<{ include: typeof noteInclude }>;

export class NoteService implements NoteApi {
  constructor(
    private readonly prisma: PrismaClient,
    private readonly extractor: TextExtractor,
    private readonly generation: StudyGenerationService,
    private readonly files: ObjectStore | null = null,
  ) {}

  async create(userId: string, command: CreateNoteCommand): Promise<NoteResponse> {
    if (command.source.kind !== "text" && !this.files) {
      throw new AppError(
        "STORAGE_FAILED",
        "File storage is not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, and R2_BUCKET.",
        503,
      );
    }
    const extracted = await this.extractor.extract(command.source);
    const cleaned = cleanNoteText(extracted);
    if (!cleaned) {
      throw new AppError("EMPTY_TEXT", "Note text is empty after cleaning.", 400);
    }
    if (cleaned.length > maxNoteTextLength) {
      throw new AppError(
        "VALIDATION",
        `Extracted text is longer than ${maxNoteTextLength.toLocaleString("en-US")} characters. Use a shorter section.`,
        400,
      );
    }

    const stored = await this.storeUpload(userId, command);

    const subject = command.subjectName
      ? await this.prisma.subject.upsert({
          where: { userId_name: { userId, name: command.subjectName } },
          update: {},
          create: { userId, name: command.subjectName },
        })
      : null;

    const note = await this.prisma.note.create({
      data: {
        title: command.title ?? deriveTitle(cleaned),
        rawText: stripNullBytes(extracted),
        cleanedText: cleaned,
        status: "PROCESSING",
        userId,
        subjectId: subject?.id,
        sourceFiles: {
          create: {
            id: stored?.id,
            kind: command.source.kind === "text" ? "TEXT" : command.source.kind === "pdf" ? "PDF" : "IMAGE",
            filename: command.source.kind === "text" ? null : command.source.filename,
            mimeType: stored?.mimeType ?? (command.source.kind === "image" ? command.source.mimeType : undefined),
            storageKey: stored?.key,
            extractedText: stripNullBytes(extracted),
          },
        },
      },
    });

    try {
      const pack = await this.generation.generate(cleaned);
      const saved = await this.prisma.note.update({
        where: { id: note.id },
        data: {
          summary: pack.summary,
          status: "READY",
          keyPoints: {
            create: pack.keyPoints.map((point, position) => ({
              kind: point.kind,
              content: point.content,
              position,
            })),
          },
          flashcards: {
            create: pack.flashcards.map((card, position) => ({
              question: card.question,
              answer: card.answer,
              position,
            })),
          },
        },
        include: noteInclude,
      });
      return toNoteResponse(saved);
    } catch (error) {
      await this.prisma.note
        .update({ where: { id: note.id }, data: { status: "FAILED" } })
        .catch(() => undefined);
      if (error instanceof AppError) {
        throw new AppError(error.code, error.message, error.status, note.id);
      }
      throw error;
    }
  }

  async list(userId: string): Promise<NoteSummary[]> {
    const notes = await this.prisma.note.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        subject: true,
        _count: { select: { flashcards: true } },
      },
    });
    return notes.map((note) => ({
      id: note.id,
      title: note.title,
      status: note.status,
      summary: note.summary,
      subjectName: note.subject?.name ?? null,
      flashcardCount: note._count.flashcards,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    }));
  }

  async get(userId: string, noteId: string): Promise<NoteResponse> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, userId },
      include: noteInclude,
    });
    if (!note) throw new AppError("NOT_FOUND", "Note not found.", 404);
    return toNoteResponse(note);
  }

  private async storeUpload(
    userId: string,
    command: CreateNoteCommand,
  ): Promise<{ id: string; key: string; mimeType: string } | null> {
    if (command.source.kind === "text") return null;
    if (!this.files) {
      throw new AppError("STORAGE_FAILED", "File storage is not configured.", 503);
    }
    const data = command.source.data;
    if (!data || data.byteLength === 0) {
      throw new AppError("VALIDATION", command.source.kind === "pdf" ? "Attach a PDF file." : "Attach an image.", 400);
    }
    const id = randomUUID();
    const mimeType = command.source.kind === "pdf" ? "application/pdf" : imageContentType(command.source.mimeType);
    const key = sourceObjectKey({
      userId,
      sourceId: id,
      filename: command.source.filename,
      kind: command.source.kind,
    });
    try {
      await this.files.put({ key, body: data, contentType: mimeType });
    } catch (error) {
      console.error("Object upload failed", error instanceof Error ? error.name : "Error");
      throw new AppError("STORAGE_FAILED", "Could not store this file.", 502);
    }
    return { id, key, mimeType };
  }
}

function toNoteResponse(note: NoteRecord): NoteResponse {
  return {
    id: note.id,
    title: note.title,
    status: note.status,
    summary: note.summary,
    subjectName: note.subject?.name ?? null,
    keyPoints: note.keyPoints.map((point) => ({
      id: point.id,
      kind: point.kind,
      content: point.content,
      position: point.position,
    })),
    flashcards: note.flashcards.map((card) => ({
      id: card.id,
      question: card.question,
      answer: card.answer,
      position: card.position,
      edited: card.edited,
    })),
    createdAt: note.createdAt.toISOString(),
    updatedAt: note.updatedAt.toISOString(),
  };
}
