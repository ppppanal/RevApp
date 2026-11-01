import type { Flashcard, NoteResponse, NoteSummary } from "@rev/shared";
import type { ExtractionSource } from "../extraction/extractors";

export interface CreateNoteCommand {
  title?: string;
  subjectName?: string;
  source: ExtractionSource;
}

export interface CreateNoteOptions {
  /** When false, a PDF or image note is saved without uploading the original bytes. */
  storeFiles?: boolean;
  /** Skip extraction and use this text. The HTTP API does not set it. */
  extractedText?: string;
}

export interface NoteApi {
  create(userId: string, command: CreateNoteCommand, options?: CreateNoteOptions): Promise<NoteResponse>;
  list(userId: string): Promise<NoteSummary[]>;
  get(userId: string, noteId: string): Promise<NoteResponse>;
}

export interface FlashcardApi {
  update(
    userId: string,
    flashcardId: string,
    input: { question?: string; answer?: string },
  ): Promise<Flashcard>;
}

export interface UserResolver {
  (): Promise<{ id: string }>;
}
