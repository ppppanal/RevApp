import { GenerationError } from "../errors";
import { isStudyPackShape, parseStudyPack, salvageJsonValue } from "./parse-study-pack";
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

      const body = await response.text();
      return readContent(parseProviderPayload(body, this.options.apiKey));
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
  const nemotron = options.model.toLowerCase().includes("nemotron");
  return {
    model: options.model,
    messages,
    temperature: 0.2,
    // Nemotron counts its reasoning trace against max_tokens. A short budget
    // ends with finish_reason length, empty content, and no study pack.
    max_tokens: nemotron ? 8192 : 4096,
    ...(nemotron ? { reasoning: { effort: "low" } } : {}),
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

export const EMPTY_COMPLETION_MESSAGE = "The model provider returned an empty completion.";

function partText(part: unknown): string {
  if (typeof part === "string") return part;
  if (!part || typeof part !== "object") return "";
  const record = part as Record<string, unknown>;
  const bits: string[] = [];
  for (const key of ["text", "summary", "content", "reasoning"]) {
    const child = record[key];
    if (typeof child === "string") bits.push(child);
    else if (Array.isArray(child)) bits.push(child.map((item) => partText(item)).join(""));
  }
  return bits.join("");
}

function textOf(value: unknown): string {
  if (typeof value === "string") return value.trim();
  if (Array.isArray(value)) return value.map((part) => partText(part)).join("").trim();
  if (value && typeof value === "object") {
    if (isStudyPackShape(value)) return JSON.stringify(value);
    return partText(value).trim();
  }
  return "";
}

function hasJsonObject(text: string): boolean {
  return text.includes("{") && text.includes("}");
}

const UNREADABLE_COMPLETION_MESSAGE = "The model provider returned an unreadable completion.";

function bodyShape(text: string): string {
  if (text.startsWith("data:")) return "starts with an event stream";
  const first = text[0] ?? "";
  if (first === "{") return "starts with an object";
  if (first === "[") return "starts with an array";
  if (first === "<") return "starts with markup";
  return "starts with text";
}

function parseProviderPayload(body: string, secret: string): unknown {
  const trimmed = body.trim();
  if (!trimmed) {
    console.error("LLM completion was not JSON (0 bytes)");
    throw new GenerationError("INVALID_JSON", UNREADABLE_COMPLETION_MESSAGE);
  }
  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const fromEvents = parseEventStream(trimmed);
    if (fromEvents !== undefined) return fromEvents;
    const embedded = salvageJsonValue(trimmed);
    if (embedded !== undefined) return embedded;
    const reason = error instanceof Error ? error.message : "invalid JSON";
    console.error(
      `LLM completion was not JSON (${trimmed.length} bytes, ${bodyShape(trimmed)}): ${redact(reason, secret).slice(0, 180)}`,
    );
    throw new GenerationError("INVALID_JSON", UNREADABLE_COMPLETION_MESSAGE);
  }
}

function parseEventStream(body: string): unknown | undefined {
  if (!body.includes("data:")) return undefined;
  let content = "";
  let reasoning = "";
  let saw = false;
  for (const line of body.split(/\n/)) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const data = trimmed.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    let payload: unknown;
    try {
      payload = JSON.parse(data);
    } catch {
      payload = salvageJsonValue(data);
    }
    if (!payload || typeof payload !== "object") continue;
    const choices = (payload as { choices?: unknown }).choices;
    if (!Array.isArray(choices) || !choices[0] || typeof choices[0] !== "object") continue;
    const choice = choices[0] as { message?: Record<string, unknown>; delta?: Record<string, unknown> };
    const message = choice.message ?? choice.delta;
    if (!message) continue;
    saw = true;
    content += textOf(message.content);
    reasoning += textOf(message.reasoning) || textOf(message.reasoning_content) || textOf(message.reasoning_details);
  }
  if (!saw) return undefined;
  return { choices: [{ message: { content, reasoning } }] };
}

function acceptsStudyPack(text: string): boolean {
  if (!text) return false;
  try {
    parseStudyPack(text);
    return true;
  } catch {
    return false;
  }
}

function readContent(payload: unknown): string {
  if (typeof payload === "string") {
    const trimmed = payload.trim();
    if (!trimmed) throw new GenerationError("INVALID_JSON", UNREADABLE_COMPLETION_MESSAGE);
    try {
      const again = JSON.parse(trimmed);
      if (again && typeof again === "object") return readContent(again);
    } catch {
      return trimmed;
    }
    return trimmed;
  }
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    throw new GenerationError("INVALID_JSON", UNREADABLE_COMPLETION_MESSAGE);
  }
  if (isStudyPackShape(payload)) return JSON.stringify(payload);
  const choices = (payload as { choices?: unknown }).choices;
  if (!Array.isArray(choices) || choices.length === 0) {
    throw new GenerationError("INVALID_JSON", "The model provider returned no choices.");
  }
  const message = (choices[0] as { message?: Record<string, unknown> } | undefined)?.message;
  const content = textOf(message?.content);
  const reasoning =
    textOf(message?.reasoning) || textOf(message?.reasoning_content) || textOf(message?.reasoning_details);
  if (acceptsStudyPack(content)) return content;
  if (acceptsStudyPack(reasoning)) return reasoning;
  if (hasJsonObject(content)) return content;
  if (hasJsonObject(reasoning)) return reasoning;
  if (content.length > 0) return content;
  if (reasoning.length > 0) return reasoning;
  throw new GenerationError("INVALID_JSON", EMPTY_COMPLETION_MESSAGE);
}

function isTimeout(error: unknown): boolean {
  return error instanceof Error && (error.name === "AbortError" || error.name === "TimeoutError");
}

function redact(text: string, secret: string): string {
  if (!secret) return text;
  return text.split(secret).join("[redacted]");
}
