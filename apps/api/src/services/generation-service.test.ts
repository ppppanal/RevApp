import { describe, expect, it } from "vitest";
import { GenerationError } from "../errors";
import type { ChatMessage, LlmCompletionOptions, LlmProvider } from "../llm/provider";
import { StudyGenerationService } from "./generation-service";

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

  it("does not retry a provider error", async () => {
    const provider = new ScriptedProvider([new GenerationError("PROVIDER_ERROR", "The model request failed.")]);
    await expect(new StudyGenerationService(provider, 1000).generate("notes")).rejects.toMatchObject({
      code: "PROVIDER_ERROR",
    });
    expect(provider.calls).toBe(1);
  });
});
