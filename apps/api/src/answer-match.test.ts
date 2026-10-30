import { answersMatch } from "@rev/shared";
import { describe, expect, it } from "vitest";

describe("answersMatch", () => {
  it("matches case, punctuation, and a short answer inside a sentence", () => {
    expect(answersMatch("ATP", "atp")).toBe(true);
    expect(answersMatch("ATP.", "  atp ")).toBe(true);
    expect(answersMatch("ATP", "They produce ATP.")).toBe(true);
    expect(answersMatch("ATP", "adenosine")).toBe(false);
    expect(answersMatch("ATP", "ATPase")).toBe(false);
  });

  it("matches a longer answer when the phrase is included", () => {
    expect(answersMatch("Mitochondria produce ATP.", "mitochondria produce atp")).toBe(true);
    expect(
      answersMatch(
        "Read the question, recall the answer, then flip the card.",
        "I read the question, recall the answer, then flip the card slowly.",
      ),
    ).toBe(true);
    expect(answersMatch("Mitochondria produce ATP.", "Cells use glucose.")).toBe(false);
    expect(answersMatch("ATP", "")).toBe(false);
  });
});
