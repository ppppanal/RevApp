import { describe, expect, it } from "vitest";
import { GenerationError } from "../errors";
import type { ChatMessage, LlmCompletionOptions, LlmProvider } from "../llm/provider";
import { NO_PAIRED_LINES_MESSAGE } from "../llm/paired-lines";
import { FREE_MODEL_BUSY_MESSAGE, StudyGenerationService } from "./generation-service";

const valid = JSON.stringify({
  summary: "Cells make ATP.",
  keyPoints: [{ kind: "FACT", content: "Mitochondria produce ATP." }],
  flashcards: [{ question: "What do mitochondria produce?", answer: "ATP" }],
});

class ScriptedProvider implements LlmProvider {
  calls = 0;
  messages: ChatMessage[][] = [];

  constructor(private readonly steps: Array<string | Error>) {}

  async complete(messages: ChatMessage[], _options: LlmCompletionOptions): Promise<string> {
    this.messages.push(messages);
    const step = this.steps[this.calls] ?? this.steps[this.steps.length - 1];
    this.calls += 1;
    if (step instanceof Error) throw step;
    return step ?? "";
  }
}

describe("StudyGenerationService", () => {
  it("asks for strict JSON and returns a validated pack", async () => {
    const provider = new ScriptedProvider([valid]);
    const service = new StudyGenerationService(provider, 1000);
    const pack = await service.generate("Mitochondria produce ATP.");
    expect(pack.summary).toBe("Cells make ATP.");
    expect(provider.calls).toBe(1);
    expect(provider.messages[0]?.[0]?.content).toMatch(/strict JSON/);
    expect(provider.messages[0]?.[1]?.content).toContain("Mitochondria produce ATP.");
  });

  it("retries once after bad JSON or a timeout, then returns the typed error", async () => {
    const recovers = new ScriptedProvider(["not json", valid]);
    await expect(new StudyGenerationService(recovers, 1000).generate("notes")).resolves.toMatchObject({
      summary: "Cells make ATP.",
    });
    expect(recovers.calls).toBe(2);

    const timesOut = new ScriptedProvider([
      new GenerationError("TIMEOUT", "The model timed out."),
      new GenerationError("TIMEOUT", "The model timed out."),
    ]);
    await expect(new StudyGenerationService(timesOut, 1000).generate("notes")).rejects.toMatchObject({
      code: "TIMEOUT",
    });
    expect(timesOut.calls).toBe(2);

    const invalid = new ScriptedProvider(["nope", "{"]);
    await expect(new StudyGenerationService(invalid, 1000).generate("notes")).rejects.toMatchObject({
      code: "INVALID_JSON",
    });
    expect(invalid.calls).toBe(2);
  });

  it("asks for one card from the quote and not the rest of the note", async () => {
    const provider = new ScriptedProvider([
      JSON.stringify({ question: "What does the passage say?", answer: "Mitochondria produce ATP." }),
    ]);
    const card = await new StudyGenerationService(provider, 1000).generateQuoteCard("Mitochondria produce ATP.");
    expect(card).toEqual({ question: "What does the passage say?", answer: "Mitochondria produce ATP." });
    expect(provider.messages[0]?.[1]?.content).toBe("Quote:\nMitochondria produce ATP.");
    expect(provider.messages[0]?.[1]?.content).not.toContain("energy currency");
    expect(provider.messages[0]?.[0]?.content).toMatch(/exactly one flashcard/);
  });

  it("does not retry a provider error", async () => {
    const provider = new ScriptedProvider([new GenerationError("PROVIDER_ERROR", "The model request failed.")]);
    await expect(new StudyGenerationService(provider, 1000).generate("notes")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(provider.calls).toBe(1);
  });

  it("retries an upstream rate limit, then builds cards from paired lines", async () => {
    const limited = "Provider returned error: google/gemma-4-31b-it:free is temporarily rate-limited upstream. Please retry shortly.";
    const waits: number[] = [];
    const recovers = new ScriptedProvider([
      new GenerationError("PROVIDER_ERROR", limited),
      valid,
    ]);
    await expect(
      new StudyGenerationService(recovers, 1000, async (ms) => {
        waits.push(ms);
      }).generate("notes"),
    ).resolves.toMatchObject({ summary: "Cells make ATP." });
    expect(recovers.calls).toBe(2);
    expect(waits).toEqual([1000]);

    waits.length = 0;
    const notes = "ATP\tenergy currency\njust a sentence\nCell: basic unit";
    const stuck = new ScriptedProvider([new GenerationError("PROVIDER_ERROR", limited)]);
    const pack = await new StudyGenerationService(stuck, 1000, async (ms) => {
      waits.push(ms);
    }).generate(notes);
    expect(stuck.calls).toBe(4);
    expect(waits).toEqual([1000, 2000, 4000]);
    expect(pack.flashcards).toEqual([
      { question: "ATP", answer: "energy currency" },
      { question: "Cell", answer: "basic unit" },
    ]);
    expect(JSON.stringify(pack)).not.toContain(FREE_MODEL_BUSY_MESSAGE);

    const unpaired = new ScriptedProvider([new GenerationError("PROVIDER_ERROR", limited)]);
    await expect(
      new StudyGenerationService(unpaired, 1000, async () => undefined).generate("no pairs here"),
    ).rejects.toThrow(NO_PAIRED_LINES_MESSAGE);
    expect(unpaired.calls).toBe(4);
  });
});
