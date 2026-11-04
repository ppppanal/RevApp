import { describe, expect, it } from "vitest";
import { QuizService } from "./quiz-service";

describe("QuizService", () => {
  it("orders the deck by the signed-in user's misses", async () => {
    const service = new QuizService({
      note: {
        async findFirst() {
          return {
            id: "note_1",
            title: "Cells",
            flashcards: [
              { id: "easy", question: "Easy?", position: 0, personal: false },
              { id: "hard", question: "Hard?", position: 1, personal: true },
            ],
          };
        },
      },
      cardScore: {
        async findMany() {
          return [
            { flashcardId: "easy", correct: 3, incorrect: 0 },
            { flashcardId: "hard", correct: 0, incorrect: 2 },
          ];
        },
      },
    } as never);

    const deck = await service.start("user_1", "note_1");
    expect(deck.cards.map((card) => card.id)).toEqual(["hard", "easy"]);
    expect(deck.cards[0]).toMatchObject({ incorrectCount: 2, correctCount: 0 });
  });

  it("hides another user's note", async () => {
    const service = new QuizService({
      note: {
        async findFirst() {
          return null;
        },
      },
    } as never);
    await expect(service.start("user_2", "note_1")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("saves a miss on that user's card", async () => {
    let saved: { correct?: number; incorrect?: number } | undefined;
    const service = new QuizService({
      flashcard: {
        async findFirst() {
          return { id: "card_1", answer: "ATP" };
        },
      },
      cardScore: {
        async upsert({ create }: { create: { correct: number; incorrect: number } }) {
          saved = create;
          return create;
        },
      },
    } as never);

    const grade = await service.grade("user_1", "note_1", "card_1", "glucose");
    expect(grade.correct).toBe(false);
    expect(grade.expected).toBe("ATP");
    expect(saved).toEqual({ userId: "user_1", flashcardId: "card_1", correct: 0, incorrect: 1 });
  });

  it("does not grade a card on someone else's note", async () => {
    const service = new QuizService({
      flashcard: {
        async findFirst() {
          return null;
        },
      },
    } as never);
    await expect(service.grade("user_2", "note_1", "card_1", "ATP")).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
