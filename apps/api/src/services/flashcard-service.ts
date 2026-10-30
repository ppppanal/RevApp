import type { Flashcard } from "@rev/shared";
import type { PrismaClient } from "@prisma/client";
import { AppError } from "../errors";
import type { FlashcardApi } from "./types";

export class FlashcardService implements FlashcardApi {
  constructor(private readonly prisma: PrismaClient) {}

  async update(
    userId: string,
    flashcardId: string,
    input: { question?: string; answer?: string },
  ): Promise<Flashcard> {
    const existing = await this.prisma.flashcard.findUnique({
      where: { id: flashcardId },
      include: { note: true },
    });
    if (!existing || existing.note.userId !== userId) {
      throw new AppError("NOT_FOUND", "Flashcard not found.", 404);
    }

    const question = input.question ?? existing.question;
    const answer = input.answer ?? existing.answer;
    const questionChanged = question !== existing.question;
    const answerChanged = answer !== existing.answer;

    const updated = await this.prisma.$transaction(async (tx) => {
      if (questionChanged) {
        await tx.revision.create({
          data: {
            noteId: existing.noteId,
            target: "FLASHCARD",
            targetId: existing.id,
            field: "question",
            before: existing.question,
            after: question,
          },
        });
      }
      if (answerChanged) {
        await tx.revision.create({
          data: {
            noteId: existing.noteId,
            target: "FLASHCARD",
            targetId: existing.id,
            field: "answer",
            before: existing.answer,
            after: answer,
          },
        });
      }
      return tx.flashcard.update({
        where: { id: existing.id },
        data: {
          question,
          answer,
          edited: existing.edited || questionChanged || answerChanged,
        },
      });
    });

    return {
      id: updated.id,
      question: updated.question,
      answer: updated.answer,
      position: updated.position,
      edited: updated.edited,
    };
  }
}
