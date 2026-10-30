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

  it("decodes PDF and image files and forwards typed extraction errors", async () => {
    const seen: CreateNoteCommand[] = [];
    const api = appWith({
      async create(_userId, command) {
        seen.push(command);
        throw new AppError("EXTRACTION_FAILED", "Could not read text from this PDF.", 422);
      },
    });

    const missing = await request(api).post("/notes").send({ source: { kind: "pdf", filename: "notes.pdf" } }).expect(400);
    expect(missing.body.error.code).toBe("VALIDATION");
    expect(missing.body.error.message).toMatch(/Attach a PDF file/);
    expect(seen).toHaveLength(0);

    const missingImage = await request(api).post("/notes").send({ source: { kind: "image", mimeType: "image/png" } }).expect(400);
    expect(missingImage.body.error.message).toMatch(/Attach an image/);

    const pdf = Buffer.from("%PDF-1.4");
    const failed = await request(api)
      .post("/notes")
      .send({ source: { kind: "pdf", filename: "notes.pdf", data: `data:application/pdf;base64,${pdf.toString("base64")}` } })
      .expect(422);
    expect(failed.body.error.code).toBe("EXTRACTION_FAILED");
    expect(seen[0]?.source).toMatchObject({ kind: "pdf", filename: "notes.pdf" });
    expect(Buffer.from(seen[0]?.source.kind === "pdf" ? seen[0].source.data ?? new Uint8Array() : [])).toEqual(pdf);

    const image = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
    await request(api)
      .post("/notes")
      .send({ source: { kind: "image", mimeType: "image/png", data: image.toString("base64") } })
      .expect(422);
    expect(seen[1]?.source.kind).toBe("image");
    expect(Buffer.from(seen[1]?.source.kind === "image" ? seen[1].source.data ?? new Uint8Array() : [])).toEqual(image);
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
