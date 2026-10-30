import type { Flashcard, NoteResponse, NoteSummary } from "@rev/shared";
import type { ExtractionSource } from "../extraction/extractors";

export interface CreateNoteCommand {
  title?: string;
  subjectName?: string;
  source: ExtractionSource;
}

export interface NoteApi {
  create(userId: string, command: CreateNoteCommand): Promise<NoteResponse>;
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
