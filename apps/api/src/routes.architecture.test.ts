import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

describe("route modules", () => {
  it("keeps LLM calls out of the HTTP handlers", () => {
    const root = dirname(fileURLToPath(import.meta.url));
    const app = readFileSync(resolve(root, "app.ts"), "utf8");
    const index = readFileSync(resolve(root, "index.ts"), "utf8");
    expect(app).not.toMatch(/LlmProvider|OpenAiCompatible|chat\/completions|StudyGenerationService/);
    expect(index).toMatch(/StudyGenerationService/);
    expect(index).toMatch(/new NoteService/);
  });
});
