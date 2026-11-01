import { GenerationError } from "../errors";
import type { ChatMessage, LlmCompletionOptions, LlmProvider } from "./provider";
import { isGoogleGenerativeLanguage, studyChatTarget } from "./study-target";

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
      const target = studyChatTarget(this.options.baseUrl, this.options.model);
      const url = chatCompletionsUrl(target.baseUrl);
      if (isGoogleGenerativeLanguage(url)) {
        throw new GenerationError("PROVIDER_ERROR", "The study call does not use the Google Generative Language API.");
      }
      const response = await fetchImpl(url, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          authorization: `Bearer ${this.options.apiKey}`,
        },
        body: JSON.stringify(
          prepareChatRequest(
            { baseUrl: target.baseUrl, model: target.model, jsonMode: this.options.jsonMode },
            messages,
          ),
        ),
        signal: controller.signal,
      });

      if (!response.ok) {
        const body = await response.text();
        const detail = providerErrorMessage(response.status, body, this.options.apiKey);
        console.error(`LLM provider status ${response.status}: ${detail}`);
        throw new GenerationError("PROVIDER_ERROR", detail);
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

}

export function prepareChatRequest(
  options: { baseUrl: string; model: string; jsonMode: boolean },
  messages: ChatMessage[],
): Record<string, unknown> {
  if (usesPlainPrompt(options)) {
    // The free Gemma model is called with one user message. The Google host is never used.
    return {
      model: options.model,
      messages: foldSystemIntoUser(messages),
    };
  }
  return {
    model: options.model,
    messages,
    temperature: 0.2,
    max_tokens: 4096,
    ...(options.jsonMode ? { response_format: { type: "json_object" as const } } : {}),
  };
}

function usesPlainPrompt(options: { model: string }): boolean {
  return options.model.toLowerCase().includes("gemma");
}

function providerErrorMessage(status: number, body: string, secret: string): string {
  const parsed = providerErrorText(body);
  const text = redact(parsed || body, secret).replace(/\s+/g, " ").trim().slice(0, 300);
  return text || `The model provider returned ${status}.`;
}

function providerErrorText(body: string): string {
  try {
    const parsed = JSON.parse(body) as
      | { error?: { message?: unknown; metadata?: { raw?: unknown } } }
      | Array<{ error?: { message?: unknown } }>;
    const record = Array.isArray(parsed) ? undefined : parsed;
    const error = Array.isArray(parsed) ? parsed[0]?.error : parsed.error;
    const message = typeof error?.message === "string" ? error.message.trim() : "";
    const raw = typeof record?.error?.metadata?.raw === "string" ? record.error.metadata.raw.trim() : "";
    return [message, raw].filter((part) => part.length > 0).join(": ");
  } catch {
    return "";
  }
}

function foldSystemIntoUser(messages: ChatMessage[]): ChatMessage[] {
  const instructions = messages
    .filter((message) => message.role === "system")
    .map((message) => message.content.trim())
    .filter((content) => content.length > 0);
  const users = messages.filter((message) => message.role !== "system");
  if (instructions.length === 0) return users.length > 0 ? users : messages;
  const prompt = users.map((message) => message.content).join("\n\n");
  const content = prompt.length > 0 ? `${instructions.join("\n\n")}\n\n${prompt}` : instructions.join("\n\n");
  return [{ role: "user", content }];
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
