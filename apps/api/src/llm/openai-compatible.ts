import { GenerationError } from "../errors";
import type { ChatMessage, LlmCompletionOptions, LlmProvider } from "./provider";

export interface OpenAiCompatibleOptions {
  baseUrl: string;
  apiKey: string;
  model: string;
  jsonMode: boolean;
  fetchImpl?: typeof fetch;
}

export class OpenAiCompatibleProvider implements LlmProvider {
  constructor(private readonly options: OpenAiCompatibleOptions) {}

  async complete(messages: ChatMessage[], options: LlmCompletionOptions): Promise<string> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), options.timeoutMs);
    try {
      const fetchImpl = this.options.fetchImpl ?? fetch;
      const response = await fetchImpl(chatCompletionsUrl(this.options.baseUrl), {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(this.requestBody(messages)),
        signal: controller.signal,
      });

      if (!response.ok) {
        const detail = redact(await response.text(), this.options.apiKey).slice(0, 300);
        console.error(`LLM provider status ${response.status}: ${detail}`);
        throw new GenerationError("PROVIDER_ERROR", `The model provider returned ${response.status}.`);
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new GenerationError("INVALID_JSON", "The model provider returned an unreadable completion.");
      }
      return readContent(payload);
    } catch (error) {
      if (error instanceof GenerationError) throw error;
      if (isTimeout(error)) {
        throw new GenerationError("TIMEOUT", "The model timed out.");
      }
      throw new GenerationError("PROVIDER_ERROR", "The model request failed.");
    } finally {
      clearTimeout(timeout);
    }
  }

  private requestBody(messages: ChatMessage[]): Record<string, unknown> {
    return {
      model: this.options.model,
      messages,
      temperature: 0.2,
      max_tokens: 4096,
      ...(this.options.jsonMode ? { response_format: { type: "json_object" } } : {}),
    };
  }
}

function chatCompletionsUrl(baseUrl: string): string {
  const trimmed = baseUrl.replace(/\/+$/, "");
  if (trimmed.endsWith("/chat/completions")) return trimmed;
  return `${trimmed}/chat/completions`;
}

function readContent(payload: unknown): string {
  if (!payload || typeof payload !== "object") {
    throw new GenerationError("INVALID_JSON", "The model provider returned an unreadable completion.");
  }
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new GenerationError("INVALID_JSON", "The model provider returned no choices.");
  }
  const message = (choices[0] as { message?: { content?: unknown } }).message;
  const content = message?.content;
  if (typeof content === "string" && content.trim().length > 0) return content;
  if (Array.isArray(content)) {
    const text = content
      .map((part) => {
        if (typeof part === "string") return part;
        if (part && typeof part === "object" && "text" in part && typeof part.text === "string") return part.text;
        return "";
      })
      .join("")
      .trim();
    if (text.length > 0) return text;
  }
  throw new GenerationError("INVALID_JSON", "The model provider returned an empty completion.");
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}
