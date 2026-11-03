import { GenerationError } from "../errors";
import { EMPTY_COMPLETION_MESSAGE } from "../llm/openai-compatible";
import { kanaKanjiCards, localRevisionPack, paragraphRevisionPack } from "../llm/paired-lines";
import { parseQuoteCard, type QuoteCard } from "../llm/parse-quote-card";
import { parseStudyPack, type StudyPack } from "../llm/parse-study-pack";
import type { ChatMessage, LlmProvider } from "../llm/provider";
import { mergeStudyPacks, studyChunks } from "../llm/study-chunks";

const SYSTEM_PROMPT = `You are a study assistant. Turn the user's notes into a study pack.
These notes may be one section of a longer document. Use only this section.
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

const UPSTREAM_RATE_LIMIT_ATTEMPTS = 4;
const UPSTREAM_RATE_LIMIT_BACKOFF_MS = [1_000, 2_000, 4_000];
export const FREE_MODEL_BUSY_MESSAGE = "免費模型現在很忙，請稍後再試。";

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const UNREADABLE_STUDY_PACK = new Set([
  "The model provider returned an unreadable completion.",
  "The model provider returned no choices.",
  "The model response was not valid JSON.",
  "The model response did not match the study pack schema.",
]);

function isUnreadableStudyPack(error: GenerationError): boolean {
  return error.code === "INVALID_JSON" && UNREADABLE_STUDY_PACK.has(error.message);
}

export function isUpstreamRateLimit(error: GenerationError): boolean {
  return error.code === "PROVIDER_ERROR" && /temporarily rate-limited upstream/i.test(error.message);
}

export class StudyGenerationService {
  constructor(
    private readonly provider: LlmProvider,
    private readonly timeoutMs: number,
    private readonly sleep: (ms: number) => Promise<void> = delay,
  ) {}

  async generate(cleanedText: string, layoutText = cleanedText): Promise<StudyPack> {
    if (kanaKanjiCards(layoutText)) return localRevisionPack(layoutText);
    const packs: StudyPack[] = [];
    for (const chunk of studyChunks(cleanedText)) {
      packs.push(await this.generateChunk(chunk));
    }
    if (packs.length === 0) return paragraphRevisionPack(cleanedText);
    return mergeStudyPacks(packs);
  }

  private async generateChunk(text: string): Promise<StudyPack> {
    try {
      return await this.produce(buildStudyMessages(text), parseStudyPack);
    } catch (error) {
      if (!(error instanceof GenerationError)) throw error;
      if (error.code === "TIMEOUT" || isUnreadableStudyPack(error) || error.message === FREE_MODEL_BUSY_MESSAGE) {
        return paragraphRevisionPack(text);
      }
      if (error.message === EMPTY_COMPLETION_MESSAGE) return localRevisionPack(text);
      throw error;
    }
  }

  async generateQuoteCard(quote: string): Promise<QuoteCard> {
    return this.produce(buildQuoteMessages(quote), parseQuoteCard);
  }

  private async produce<T>(messages: ChatMessage[], parse: (raw: string) => T): Promise<T> {
    let lastError: GenerationError | undefined;
    let parseAttempts = 0;
    let rateAttempts = 0;
    while (parseAttempts < 2) {
      try {
        const raw = await this.provider.complete(messages, { timeoutMs: this.timeoutMs });
        return parse(raw);
      } catch (error) {
        if (!(error instanceof GenerationError)) {
          throw new GenerationError("PROVIDER_ERROR", "Study generation failed.");
        }
        if (error.code === "TIMEOUT" || error.code === "INVALID_JSON") {
          parseAttempts += 1;
          lastError = error;
          continue;
        }
        if (isUpstreamRateLimit(error)) {
          rateAttempts += 1;
          if (rateAttempts >= UPSTREAM_RATE_LIMIT_ATTEMPTS) {
            throw new GenerationError("PROVIDER_ERROR", FREE_MODEL_BUSY_MESSAGE);
          }
          const wait = UPSTREAM_RATE_LIMIT_BACKOFF_MS[rateAttempts - 1] ?? 4_000;
          await this.sleep(wait);
          continue;
        }
        throw error;
      }
    }
    throw lastError ?? new GenerationError("PROVIDER_ERROR", "Study generation failed.");
  }
}
