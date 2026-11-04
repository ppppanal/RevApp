import { describe, expect, it } from "vitest";
import type { TextExtractor } from "../extraction/extractors";
import { NoteService } from "./note-service";

const extractor: TextExtractor = {
  async extract() {
    throw new Error("should not extract");
  },
};

const savedNote = {
  id: "note_1",
  title: "Cells",
  status: "READY" as const,
  summary: "Mitochondria produce ATP.",
  cleanedText: "Mitochondria produce ATP.",
  rawText: "Mitochondria produce ATP.",
  subject: { name: "Biology" },
  tags: [{ name: "atp" }],
  keyPoints: [],
  flashcards: [
    {
      id: "card_1",
      question: "What does the quoted passage say?",
      answer: "Mitochondria produce ATP.",
      position: 2,
      edited: false,
      personal: true,
    },
  ],
  sourceFiles: [],
  createdAt: new Date("2026-11-01T00:00:00.000Z"),
  updatedAt: new Date("2026-11-01T00:00:00.000Z"),
};

describe("quote revision cards", () => {
  it("saves one personal card from a passage in the note", async () => {
    let created: { personal?: boolean; question?: string; answer?: string } | undefined;
    let asked = "";
    const prisma = {
      note: {
        async findFirst() {
          return savedNote;
        },
      },
      flashcard: {
        async findFirst() {
          return { position: 1 };
        },
        async create({ data }: { data: typeof created }) {
          created = data;
          return data;
        },
      },
    };
    const generation = {
      async generate() {
        throw new Error("should not build a study pack");
      },
      async generateQuoteCard(quote: string) {
        asked = quote;
        return { question: "What does the quoted passage say?", answer: "Mitochondria produce ATP." };
      },
    };
    const service = new NoteService(prisma as never, extractor, generation as never, null);
    const note = await service.addQuoteCard("user_1", "note_1", "produce   ATP");
    expect(asked).toBe("produce   ATP");
    expect(created).toMatchObject({ personal: true, position: 2 });
    expect(note.subjectName).toBe("Biology");
    expect(note.tags).toEqual(["atp"]);
    expect(note.flashcards[0]?.personal).toBe(true);
  });

  it("does not call the model when the passage is not in the note", async () => {
    let called = false;
    const prisma = {
      note: {
        async findFirst() {
          return savedNote;
        },
      },
    };
    const generation = {
      async generateQuoteCard() {
        called = true;
        return { question: "Q", answer: "A" };
      },
    };
    const service = new NoteService(prisma as never, extractor, generation as never, null);
    await expect(service.addQuoteCard("user_1", "note_1", "the nucleus divides")).rejects.toMatchObject({
      code: "VALIDATION",
    });
    expect(called).toBe(false);
  });

  it("hides a note that belongs to someone else", async () => {
    const prisma = {
      note: {
        async findFirst() {
          return null;
        },
      },
    };
    const service = new NoteService(prisma as never, extractor, { generateQuoteCard: async () => ({}) } as never, null);
    await expect(service.addQuoteCard("user_2", "note_1", "Mitochondria produce ATP.")).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
  });
});
