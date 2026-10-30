import type { ChatMessage, LlmCompletionOptions, LlmProvider } from "./provider";

export class FixtureLlmProvider implements LlmProvider {
  async complete(messages: ChatMessage[], _options: LlmCompletionOptions): Promise<string> {
    const notes = messages.find((message) => message.role === "user")?.content ?? "";
    const snippet = notes.replace(/^Notes:\n?/, "").trim().slice(0, 180);
    const idea = snippet.length > 0 ? snippet : "Review these notes.";
    return JSON.stringify({
      summary: idea,
      keyPoints: [
        { kind: "FACT", content: idea },
        { kind: "DEFINITION", content: "A flashcard pairs a question with an answer." },
      ],
      flashcards: [
        { question: "What is the main idea of these notes?", answer: idea },
        {
          question: "How do you study a flashcard?",
          answer: "Read the question, recall the answer, then flip the card.",
        },
      ],
    });
  }
}
