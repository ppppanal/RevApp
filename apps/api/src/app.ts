import { createNoteRequestSchema, updateFlashcardRequestSchema, type ApiErrorCode } from "@rev/shared";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { ZodError } from "zod";
import { AppError } from "./errors";
import type { FlashcardApi, NoteApi, UserResolver } from "./services/types";
import { toCreateNoteCommand } from "./validation/create-note";

export interface AppServices {
  notes: NoteApi;
  flashcards: FlashcardApi;
  resolveUser: UserResolver;
}

export function createApp(services: AppServices): express.Express {
  const app = express();
  app.use(cors());
  app.use(express.json({ limit: "1mb" }));

  app.get("/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post(
    "/notes",
    asyncHandler(async (req, res) => {
      const parsed = createNoteRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError("VALIDATION", formatZodError(parsed.error), 400);
      const user = await services.resolveUser();
      const note = await services.notes.create(user.id, toCreateNoteCommand(parsed.data));
      res.status(201).json(note);
    }),
  );

  app.get(
    "/notes",
    asyncHandler(async (_req, res) => {
      const user = await services.resolveUser();
      res.json(await services.notes.list(user.id));
    }),
  );

  app.get(
    "/notes/:id",
    asyncHandler(async (req, res) => {
      const user = await services.resolveUser();
      res.json(await services.notes.get(user.id, req.params.id));
    }),
  );

  app.patch(
    "/flashcards/:id",
    asyncHandler(async (req, res) => {
      const parsed = updateFlashcardRequestSchema.safeParse(req.body);
      if (!parsed.success) throw new AppError("VALIDATION", formatZodError(parsed.error), 400);
      const user = await services.resolveUser();
      res.json(await services.flashcards.update(user.id, req.params.id, parsed.data));
    }),
  );

  app.use((_req, res) => {
    res.status(404).json(errorBody("NOT_FOUND", "Not found."));
  });

  app.use((error: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (error instanceof AppError) {
      res.status(error.status).json(errorBody(error.code, error.message, error.noteId));
      return;
    }
    if (isBodySyntaxError(error)) {
      res.status(400).json(errorBody("VALIDATION", "Request body must be JSON."));
      return;
    }
    if (isTooLarge(error)) {
      res.status(413).json(errorBody("VALIDATION", "Request body is too large."));
      return;
    }
    console.error(error instanceof Error ? error.stack ?? error.message : "Unhandled error");
    res.status(500).json(errorBody("INTERNAL", "Something went wrong."));
  });

  return app;
}

function asyncHandler(
  handler: (req: Request, res: Response) => Promise<void>,
): (req: Request, res: Response, next: NextFunction) => void {
  return (req, res, next) => {
    handler(req, res).catch(next);
  };
}

function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      const path = issue.path.join(".");
      return path ? `${path}: ${issue.message}` : issue.message;
    })
    .join(" ");
}

function errorBody(code: ApiErrorCode, message: string, noteId?: string) {
  return { error: { code, message, ...(noteId ? { noteId } : {}) } };
}

function isBodySyntaxError(error: unknown): boolean {
  return error instanceof SyntaxError && "status" in error && (error as { status?: number }).status === 400;
}

function isTooLarge(error: unknown): boolean {
  return typeof error === "object" && error !== null && "type" in error && error.type === "entity.too.large";
}
