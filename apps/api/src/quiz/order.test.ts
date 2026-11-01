import { describe, expect, it } from "vitest";
import { compareQuizPriority, type QuizPriority } from "./order";

function order(cards: QuizPriority[]): number[] {
  return [...cards].sort(compareQuizPriority).map((card) => card.position);
}

describe("quiz card order", () => {
  it("puts a higher miss rate ahead of cards that are usually right", () => {
    expect(
      order([
        { position: 0, correctCount: 4, incorrectCount: 1 },
        { position: 1, correctCount: 0, incorrectCount: 1 },
        { position: 2, correctCount: 0, incorrectCount: 0 },
      ]),
    ).toEqual([1, 0, 2]);
  });

  it("breaks equal miss rates by how many times the card was missed", () => {
    expect(
      order([
        { position: 0, correctCount: 0, incorrectCount: 1 },
        { position: 1, correctCount: 0, incorrectCount: 2 },
      ]),
    ).toEqual([1, 0]);
  });

  it("keeps note order when the saved scores match", () => {
    expect(
      order([
        { position: 2, correctCount: 1, incorrectCount: 1 },
        { position: 0, correctCount: 1, incorrectCount: 1 },
      ]),
    ).toEqual([0, 2]);
  });
});
