import { GenerationError } from "../errors";
import { parseQuoteCard, type QuoteCard } from "../llm/parse-quote-card";
import { parseStudyPack, type StudyPack } from "../llm/parse-study-pack";
import type { ChatMessage, LlmProvider } from "../llm/provider";

const SYSTEM_PROMPT = `You are a study assistant. Turn the user's notes into a study pack.
Return strict JSON only. No markdown fences. No prose before or after the JSON.
The JSON object must contain exactly these keys:
- "summary": a short core summary string
- "keyPoints": an array of objects with "kind" and "content"
- "flashcards": an array of objects with "question" and "answer"
"kind" must be one of "DEFINITION", "FORMULA", or "FACT".
Use DEFINITION for definitions and FORMULA for formulas when the notes include them. Use FACT otherwise.
Write flashcards as study questions with standalone answers.`;

const QUOTE_PROMPT = `You write exactly one flashcard from a single quoted passage.
Use only the quote. Do not add facts that are not in the quote.
Return strict JSON only. No markdown fences. No prose before or after the JSON.
The JSON object must contain exactly these keys: "question" and "answer".
Do not return a summary, key points, or more than one card.`;

export function buildStudyMessages(cleanedText: string): ChatMessage[] {
  return [
    { role: "system", content: SYSTEM_PROMPT },
    { role: "user", content: `Notes:\n${cleanedText}` },
  ];
}

export function buildQuoteMessages(quote: string): ChatMessage[] {
  return [
    { role: "system", content: QUOTE_PROMPT },
    { role: "user", content: `Quote:\n${quote}` },
  ];
}

export class StudyGenerationService {
  constructor(
    private readonly provider: LlmProvider,
    private readonly timeoutMs: number,
  ) {}

  async generate(cleanedText: string): Promise<StudyPack> {
    let lastError: GenerationError | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await this.provider.complete(buildStudyMessages(cleanedText), {
          timeoutMs: this.timeoutMs,
        });
        return parseStudyPack(raw);
      } catch (error) {
        if (error instanceof GenerationError && (error.code === "TIMEOUT" || error.code === "INVALID_JSON")) {
          lastError = error;
          continue;
        }
        if (error instanceof GenerationError) throw error;
        throw new GenerationError("PROVIDER_ERROR", "Study generation failed.");
      }
    }
    throw lastError ?? new GenerationError("PROVIDER_ERROR", "Study generation failed.");
  }

  async generateQuoteCard(quote: string): Promise<QuoteCard> {
    let lastError: GenerationError | undefined;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const raw = await this.provider.complete(buildQuoteMessages(quote), { timeoutMs: this.timeoutMs });
        return parseQuoteCard(raw);
      } catch (error) {
        if (error instanceof GenerationError && (error.code === "TIMEOUT" || error.code === "INVALID_JSON")) {
          lastError = error;
          continue;
        }
        if (error instanceof GenerationError) throw error;
        throw new GenerationError("PROVIDER_ERROR", "Study generation failed.");
      }
    }
    throw lastError ?? new GenerationError("PROVIDER_ERROR", "Study generation failed.");
  }
}
