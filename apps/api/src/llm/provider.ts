export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface LlmCompletionOptions {
  timeoutMs: number;
}

export interface LlmProvider {
  complete(messages: ChatMessage[], options: LlmCompletionOptions): Promise<string>;
}
