import { PrismaClient } from "@prisma/client";
import { execFileSync } from "node:child_process";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp, type AppServices } from "./app";
import { RoutingTextExtractor } from "./extraction/extractors";
import type { ChatMessage, LlmCompletionOptions, LlmProvider } from "./llm/provider";
import { FlashcardService } from "./services/flashcard-service";
import { StudyGenerationService } from "./services/generation-service";
import { NoteService } from "./services/note-service";
import { resolveDevUser } from "./services/dev-user";
import { cleanNoteText } from "./text/clean-text";

const integrationEnabled = process.env.REV_INTEGRATION === "1";
const databaseUrl =
  process.env.REV_TEST_DATABASE_URL ?? "postgresql://rev:rev@127.0.0.1:5432/revapp_test";
const email = `rev-test-${process.pid}@example.com`;

const studyPack = {
  summary: "Mitochondria produce ATP.",
  keyPoints: [
    { kind: "DEFINITION", content: "Mitochondria are the organelles that produce ATP." },
    { kind: "FORMULA", content: "C6H12O6 + 6O2 -> 6CO2 + 6H2O + ATP" },
  ],
  flashcards: [
    { question: "What do mitochondria produce?", answer: "ATP" },
    { question: "What does ATP stand for?", answer: "Adenosine triphosphate" },
  ],
};

class StaticProvider implements LlmProvider {
  calls = 0;
  messages: ChatMessage[][] = [];
  results: string[];

  constructor(results: string[]) {
    this.results = results;
  }

  async complete(messages: ChatMessage[], _options: LlmCompletionOptions): Promise<string> {
    this.messages.push(messages);
    const result = this.results[this.calls] ?? this.results[this.results.length - 1] ?? "";
    this.calls += 1;
    return result;
  }
}

describe.skipIf(!integrationEnabled)("text path", () => {
  let prisma: PrismaClient;
  const provider = new StaticProvider([JSON.stringify(studyPack)]);

  beforeAll(() => {
    execFileSync("npx", ["prisma", "migrate", "deploy"], {
      cwd: resolve(dirname(fileURLToPath(import.meta.url)), ".."),
      env: { ...process.env, DATABASE_URL: databaseUrl },
      stdio: "inherit",
    });
    prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  });

  beforeEach(async () => {
    provider.calls = 0;
    provider.messages = [];
    provider.results = [JSON.stringify(studyPack)];
    await prisma.user.deleteMany({ where: { email } });
  });

  afterAll(async () => {
    if (!prisma) return;
    await prisma.user.deleteMany({ where: { email } });
    await prisma.$disconnect();
  });

  function services(active: LlmProvider): AppServices {
    return {
      notes: new NoteService(prisma, new RoutingTextExtractor(), new StudyGenerationService(active, 1000)),
      flashcards: new FlashcardService(prisma),
      resolveUser: () => resolveDevUser(prisma, email),
    };
  }

  it("creates a note from text, persists the study pack, and updates one card", async () => {
    const raw = "Mitochondria   produce ATP.\r\n\r\n\r\nATP \u0000is energy.";
    const api = createApp(services(provider));

    const created = await request(api)
      .post("/notes")
      .send({ text: raw, title: "Cells", subjectName: "Biology" })
      .expect(201);

    expect(created.body).toMatchObject({
      title: "Cells",
      status: "READY",
      summary: studyPack.summary,
      subjectName: "Biology",
    });
    expect(created.body.keyPoints).toHaveLength(2);
    expect(created.body.flashcards).toHaveLength(2);
    expect(created.body.flashcards[0].edited).toBe(false);
    expect(provider.calls).toBe(1);
    expect(provider.messages[0]?.[1]?.content).toContain(cleanNoteText(raw));
    expect(provider.messages[0]?.[1]?.content).not.toContain("\u0000");

    const stored = await prisma.note.findUniqueOrThrow({
      where: { id: created.body.id },
      include: { sourceFiles: true, keyPoints: true, flashcards: true },
    });
    expect(stored.cleanedText).toBe(cleanNoteText(raw));
    expect(stored.rawText).toBe(raw.replace(/\u0000/g, ""));
    expect(stored.rawText).not.toContain("\u0000");
    expect(stored.sourceFiles[0]?.kind).toBe("TEXT");
    expect(stored.keyPoints).toHaveLength(2);
    expect(stored.flashcards).toHaveLength(2);

    const loaded = await request(api).get(`/notes/${created.body.id}`).expect(200);
    expect(loaded.body.summary).toBe(studyPack.summary);

    const cardId = created.body.flashcards[0].id as string;
    const updated = await request(api)
      .patch(`/flashcards/${cardId}`)
      .send({ answer: "They produce ATP." })
      .expect(200);
    expect(updated.body).toMatchObject({ id: cardId, answer: "They produce ATP.", edited: true });

    const again = await request(api).get(`/notes/${created.body.id}`).expect(200);
    expect(again.body.flashcards[0]).toMatchObject({ answer: "They produce ATP.", edited: true });

    const revisions = await prisma.revision.findMany({ where: { targetId: cardId } });
    expect(revisions).toEqual([
      expect.objectContaining({
        target: "FLASHCARD",
        field: "answer",
        before: "ATP",
        after: "They produce ATP.",
      }),
    ]);

    const list = await request(api).get("/notes").expect(200);
    expect(list.body).toEqual([
      expect.objectContaining({ id: created.body.id, flashcardCount: 2, subjectName: "Biology" }),
    ]);
  });

  it("marks the note failed after one retry when the model keeps returning bad JSON", async () => {
    const failing = new StaticProvider(["not json", "{"]);
    const api = createApp(services(failing));
    const response = await request(api).post("/notes").send({ text: "A short note about osmosis." }).expect(502);
    expect(response.body.error.code).toBe("INVALID_JSON");
    expect(failing.calls).toBe(2);
    const failed = await prisma.note.findUniqueOrThrow({ where: { id: response.body.error.noteId } });
    expect(failed.status).toBe("FAILED");
    expect(failed.summary).toBeNull();
  });

  it("returns the unsupported extraction error for PDF and image sources", async () => {
    const api = createApp(services(provider));
    const pdf = await request(api).post("/notes").send({ source: { kind: "pdf" } }).expect(501);
    const image = await request(api).post("/notes").send({ source: { kind: "image" } }).expect(501);
    expect(pdf.body.error.message).toMatch(/PDF extraction is not available yet/);
    expect(image.body.error.message).toMatch(/Image extraction is not available yet/);
    expect(provider.calls).toBe(0);
    expect(await prisma.note.count({ where: { user: { email } } })).toBe(0);
  });

  it("hides another user's flashcard", async () => {
    const api = createApp(services(provider));
    const created = await request(api).post("/notes").send({ text: "Osmosis moves water." }).expect(201);
    const cardId = created.body.flashcards[0].id as string;
    const other = createApp({
      ...services(provider),
      resolveUser: () => resolveDevUser(prisma, `other-${email}`),
    });
    await request(other).patch(`/flashcards/${cardId}`).send({ answer: "Nope" }).expect(404);
    await prisma.user.deleteMany({ where: { email: `other-${email}` } });
  });

  it("rejects text that is empty after cleaning", async () => {
    const api = createApp(services(provider));
    const response = await request(api).post("/notes").send({ text: "\u0000\u0001" }).expect(400);
    expect(response.body.error.code).toBe("EMPTY_TEXT");
    expect(provider.calls).toBe(0);
  });
});
