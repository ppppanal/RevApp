import { describe, expect, it } from "vitest";
import { GenerationError } from "../errors";
import type { ChatMessage, LlmCompletionOptions, LlmProvider } from "../llm/provider";
import { EMPTY_COMPLETION_MESSAGE } from "../llm/openai-compatible";
import { NO_PARAGRAPHS_MESSAGE } from "../llm/paired-lines";
import { STUDY_CHUNK_CHARACTERS } from "../llm/study-chunks";
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

  it("retries once after bad JSON or a timeout, then saves paragraph cards", async () => {
    const recovers = new ScriptedProvider(["not json", valid]);
    await expect(new StudyGenerationService(recovers, 1000).generate("notes")).resolves.toMatchObject({
      summary: "Cells make ATP.",
    });
    expect(recovers.calls).toBe(2);

    const timesOut = new ScriptedProvider([
      new GenerationError("TIMEOUT", "The model timed out."),
      new GenerationError("TIMEOUT", "The model timed out."),
    ]);
    const timed = await new StudyGenerationService(timesOut, 1000).generate("notes");
    expect(timesOut.calls).toBe(2);
    expect(timed.keyPoints.map((point) => point.content)).toEqual(["notes"]);
    expect(timed.flashcards).toEqual([]);

    const invalid = new ScriptedProvider(["nope", "{"]);
    const notes = "Mitochondria produce ATP.\n\nATP is the energy currency.";
    const pack = await new StudyGenerationService(invalid, 1000).generate(notes);
    expect(invalid.calls).toBe(2);
    expect(pack.keyPoints.map((point) => point.content)).toEqual([
      "Mitochondria produce ATP.",
      "ATP is the energy currency.",
    ]);
    expect(JSON.stringify(pack)).not.toContain("unreadable completion");
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

  it("retries an upstream rate limit, then builds paragraph cards", async () => {
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
    const notes = "Mitochondria produce ATP.\n\nATP is the energy currency.";
    const stuck = new ScriptedProvider([new GenerationError("PROVIDER_ERROR", limited)]);
    const pack = await new StudyGenerationService(stuck, 1000, async (ms) => {
      waits.push(ms);
    }).generate(notes);
    expect(stuck.calls).toBe(4);
    expect(waits).toEqual([1000, 2000, 4000]);
    expect(pack.keyPoints.map((point) => point.content)).toEqual([
      "Mitochondria produce ATP.",
      "ATP is the energy currency.",
    ]);
    expect(pack.flashcards).toEqual([]);
    expect(JSON.stringify(pack)).not.toContain(FREE_MODEL_BUSY_MESSAGE);

    const empty = new ScriptedProvider([new GenerationError("PROVIDER_ERROR", limited)]);
    await expect(new StudyGenerationService(empty, 1000, async () => undefined).generate("   ")).rejects.toThrow(
      NO_PARAGRAPHS_MESSAGE,
    );
    expect(empty.calls).toBe(4);

    const layout = "わたし\t我\nせんせい\t先生\t老師";
    const vocab = new ScriptedProvider([valid]);
    const kanji = await new StudyGenerationService(vocab, 1000).generate("cleaned prose", layout);
    expect(vocab.calls).toBe(0);
    expect(kanji.flashcards).toEqual([{ question: "先生", answer: "せんせい" }]);
  });

  it("retries an empty completion once, then builds local cards", async () => {
    const empty = new GenerationError("INVALID_JSON", EMPTY_COMPLETION_MESSAGE);
    const notes = "Mitochondria produce ATP.\n\nATP is the energy currency.";
    const recovers = new ScriptedProvider([empty, valid]);
    await expect(new StudyGenerationService(recovers, 1000).generate(notes)).resolves.toMatchObject({
      summary: "Cells make ATP.",
    });
    expect(recovers.calls).toBe(2);

    const stuck = new ScriptedProvider([empty]);
    const pack = await new StudyGenerationService(stuck, 1000).generate(notes);
    expect(stuck.calls).toBe(2);
    expect(pack.keyPoints.map((point) => point.content)).toEqual([
      "Mitochondria produce ATP.",
      "ATP is the energy currency.",
    ]);
    expect(JSON.stringify(pack)).not.toContain(EMPTY_COMPLETION_MESSAGE);

    const lines = new ScriptedProvider([empty]);
    const paired = await new StudyGenerationService(lines, 1000).generate("ATP\tenergy currency\nCell: basic unit");
    expect(paired.flashcards).toEqual([
      { question: "ATP", answer: "energy currency" },
      { question: "Cell", answer: "basic unit" },
    ]);
  });

  it("builds paragraph cards when the provider body is not JSON", async () => {
    const unreadable = new GenerationError("INVALID_JSON", "The model provider returned an unreadable completion.");
    const notes = "Mitochondria produce ATP.\n\nATP is the energy currency.";
    const stuck = new ScriptedProvider([unreadable]);
    const pack = await new StudyGenerationService(stuck, 1000).generate(notes);
    expect(stuck.calls).toBe(2);
    expect(pack.flashcards).toEqual([]);
    expect(JSON.stringify(pack)).not.toContain("unreadable completion");

    const schema = new ScriptedProvider([JSON.stringify({ summary: "Only a summary" })]);
    const fallback = await new StudyGenerationService(schema, 1000).generate(notes);
    expect(schema.calls).toBe(2);
    expect(fallback.keyPoints).toHaveLength(2);
    expect(fallback.flashcards).toEqual([]);

    const embedded = new ScriptedProvider([`The trace mentions {braces}.\n${valid}`]);
    await expect(new StudyGenerationService(embedded, 1000).generate(notes)).resolves.toMatchObject({
      summary: "Cells make ATP.",
    });
    expect(embedded.calls).toBe(1);

    const quote = new ScriptedProvider([unreadable]);
    await expect(
      new StudyGenerationService(quote, 1000).generateQuoteCard("Mitochondria produce ATP."),
    ).rejects.toMatchObject({ message: "The model provider returned an unreadable completion." });
    expect(quote.calls).toBe(2);
  });

  it("sends a long document one chunk at a time and merges the packs", async () => {
    const partA = `Alpha start. ${"a".repeat(STUDY_CHUNK_CHARACTERS - 20)}`;
    const partB = `Beta start. ${"b".repeat(STUDY_CHUNK_CHARACTERS - 20)}`;
    const notes = `${partA}\n\n${partB}`;
    const packA = JSON.stringify({
      summary: "Part A.",
      keyPoints: [{ kind: "FACT", content: "Alpha fact." }],
      flashcards: [{ question: "What is alpha?", answer: "Alpha" }],
    });
    const packB = JSON.stringify({
      summary: "Part B.",
      keyPoints: [{ kind: "DEFINITION", content: "Beta fact." }],
      flashcards: [{ question: "What is beta?", answer: "Beta" }],
    });
    const provider = new ScriptedProvider([packA, packB]);
    const pack = await new StudyGenerationService(provider, 1000).generate(notes);
    expect(provider.calls).toBe(2);
    const sent = provider.messages.map((messages) => messages[1]?.content ?? "");
    expect(sent[0]).toContain("Alpha start.");
    expect(sent[0]).not.toContain("Beta start.");
    expect(sent[1]).toContain("Beta start.");
    expect(sent[1]).not.toContain("Alpha start.");
    for (const message of sent) {
      const body = message.replace(/^Notes:\n/, "");
      expect(body.length).toBeLessThanOrEqual(STUDY_CHUNK_CHARACTERS);
    }
    expect(pack.summary).toBe("Part A. Part B.");
    expect(pack.keyPoints.map((point) => point.content)).toEqual(["Alpha fact.", "Beta fact."]);
    expect(pack.flashcards.map((card) => card.answer)).toEqual(["Alpha", "Beta"]);

    const timeout = new GenerationError("TIMEOUT", "The model timed out.");
    const partial = new ScriptedProvider([packA, timeout]);
    const continued = await new StudyGenerationService(partial, 1000).generate(notes);
    expect(partial.calls).toBe(3);
    expect(continued.flashcards[0]).toEqual({ question: "What is alpha?", answer: "Alpha" });
    expect(continued.flashcards[1]?.answer).toContain("Beta start.");
    expect(continued.keyPoints.length).toBeGreaterThan(1);

    const failed = new ScriptedProvider([
      packA,
      new GenerationError("PROVIDER_ERROR", "The model request failed."),
    ]);
    await expect(new StudyGenerationService(failed, 1000).generate(notes)).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(failed.calls).toBe(2);

    const layout = "わたし\t我\nせんせい\t先生\t老師";
    const vocab = new ScriptedProvider([packA]);
    const kanji = await new StudyGenerationService(vocab, 1000).generate(notes, layout);
    expect(vocab.calls).toBe(0);
    expect(kanji.flashcards).toEqual([{ question: "先生", answer: "せんせい" }]);
  });
});
