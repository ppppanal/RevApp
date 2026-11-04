import type { PrismaClient } from "@prisma/client";
import { answersMatch } from "@rev/shared";
import { AppError } from "../errors";
import { compareQuizPriority } from "../quiz/order";

export interface QuizCard {
  id: string;
  question: string;
  position: number;
  personal: boolean;
  correctCount: number;
  incorrectCount: number;
}

export interface QuizDeck {
  noteId: string;
  title: string;
  cards: QuizCard[];
}

export interface QuizGrade {
  correct: boolean;
  expected: string;
  correctCount: number;
  incorrectCount: number;
}

export class QuizService {
  constructor(private readonly prisma: PrismaClient) {}

  async start(userId: string, noteId: string): Promise<QuizDeck> {
    const note = await this.prisma.note.findFirst({
      where: { id: noteId, userId },
      select: {
        id: true,
        title: true,
        flashcards: {
          select: { id: true, question: true, position: true, personal: true },
          orderBy: { position: "asc" },
        },
      },
    });
    if (!note) throw new AppError("NOT_FOUND", "Note not found.", 404);
    const scores = await this.prisma.cardScore.findMany({
      where: { userId, flashcardId: { in: note.flashcards.map((card) => card.id) } },
      select: { flashcardId: true, correct: true, incorrect: true },
    });
    const byCard = new Map(scores.map((score) => [score.flashcardId, score]));
    const cards = note.flashcards
      .map((card) => {
        const score = byCard.get(card.id);
        return {
          id: card.id,
          question: card.question,
          position: card.position,
          personal: card.personal,
          correctCount: score?.correct ?? 0,
          incorrectCount: score?.incorrect ?? 0,
        };
      })
      .sort(compareQuizPriority);
    return { noteId: note.id, title: note.title, cards };
  }

  async grade(userId: string, noteId: string, cardId: string, attempt: string): Promise<QuizGrade> {
    const given = attempt.trim();
    if (given.length > 2_000) {
      throw new AppError("VALIDATION", "That answer is too long.", 400);
    }
    const card = await this.prisma.flashcard.findFirst({
      where: { id: cardId, noteId, note: { userId } },
      select: { id: true, answer: true },
    });
    if (!card) throw new AppError("NOT_FOUND", "Card not found.", 404);
    const correct = answersMatch(card.answer, given);
    const saved = await this.prisma.cardScore.upsert({
      where: { userId_flashcardId: { userId, flashcardId: card.id } },
      create: {
        userId,
        flashcardId: card.id,
        correct: correct ? 1 : 0,
        incorrect: correct ? 0 : 1,
      },
      update: correct ? { correct: { increment: 1 } } : { incorrect: { increment: 1 } },
      select: { correct: true, incorrect: true },
    });
    return {
      correct,
      expected: card.answer,
      correctCount: saved.correct,
      incorrectCount: saved.incorrect,
    };
  }
}
