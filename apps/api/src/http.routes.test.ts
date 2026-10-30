import type { Flashcard, NoteResponse } from "@rev/shared";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "./app";
import { AppError } from "./errors";
import type { CreateNoteCommand, FlashcardApi, NoteApi } from "./services/types";

const note: NoteResponse = {
  id: "note_1",
  title: "Cells",
  status: "READY",
  summary: "Cells make ATP.",
  subjectName: "Biology",
  keyPoints: [{ id: "kp_1", kind: "FACT", content: "Mitochondria produce ATP.", position: 0 }],
  flashcards: [
    { id: "card_1", question: "What do mitochondria produce?", answer: "ATP", position: 0, edited: false },
  ],
  createdAt: "2026-10-30T00:00:00.000Z",
  updatedAt: "2026-10-30T00:00:00.000Z",
};

function appWith(notes: Partial<NoteApi> = {}, flashcards: Partial<FlashcardApi> = {}) {
  const noteApi: NoteApi = {
    async create(_userId: string, _command: CreateNoteCommand) {
      return note;
    },
    async list() {
      return [];
    },
    async get() {
      return note;
    },
    ...notes,
  };
  const flashcardApi: FlashcardApi = {
    async update(): Promise<Flashcard> {
      return note.flashcards[0]!;
    },
    ...flashcards,
  };
  return createApp({
    notes: noteApi,
    flashcards: flashcardApi,
    resolveUser: async () => ({ id: "user_1" }),
  });
}

describe("HTTP routes", () => {
  it("serves health and rejects unknown paths", async () => {
    const api = appWith();
    await request(api).get("/health").expect(200, { ok: true });
    const missing = await request(api).get("/missing").expect(404);
    expect(missing.body.error.code).toBe("NOT_FOUND");
  });

  it("validates note and flashcard bodies before calling services", async () => {
    let created = 0;
    const api = appWith({
      async create() {
        created += 1;
        return note;
      },
    });

    const missing = await request(api).post("/notes").send({}).expect(400);
    expect(missing.body.error).toMatchObject({ code: "VALIDATION" });
    expect(missing.body.error.message).toMatch(/Provide note text/);
    expect(created).toBe(0);

    const both = await request(api)
      .post("/notes")
      .send({ text: "Notes", source: { kind: "text", text: "Notes" } })
      .expect(400);
    expect(both.body.error.message).toMatch(/not both/);

    const createdResponse = await request(api)
      .post("/notes")
      .send({ text: "Mitochondria produce ATP.", title: "Cells", subjectName: "Biology" })
      .expect(201);
    expect(createdResponse.body.id).toBe("note_1");
    expect(created).toBe(1);

    const emptyCard = await request(api).patch("/flashcards/card_1").send({}).expect(400);
    expect(emptyCard.body.error.message).toMatch(/question or an answer/);
  });

  it("passes PDF and image sources through to extraction", async () => {
    const seen: string[] = [];
    const api = appWith({
      async create(_userId, command) {
        seen.push(command.source.kind);
        if (command.source.kind !== "text") {
          throw new AppError(
            "UNSUPPORTED_SOURCE",
            `${command.source.kind === "pdf" ? "PDF" : "Image"} extraction is not available yet. Create a note from plain text.`,
            501,
          );
        }
        return note;
      },
    });

    const pdf = await request(api).post("/notes").send({ source: { kind: "pdf", filename: "notes.pdf" } }).expect(501);
    const image = await request(api).post("/notes").send({ source: { kind: "image", mimeType: "image/png" } }).expect(501);
    expect(pdf.body.error.code).toBe("UNSUPPORTED_SOURCE");
    expect(pdf.body.error.message).toMatch(/PDF extraction is not available yet/);
    expect(image.body.error.message).toMatch(/Image extraction is not available yet/);
    expect(seen).toEqual(["pdf", "image"]);
  });

  it("rejects a body that is not JSON", async () => {
    const response = await request(appWith())
      .post("/notes")
      .set("content-type", "application/json")
      .send("not-json")
      .expect(400);
    expect(response.body.error.code).toBe("VALIDATION");
  });
});
