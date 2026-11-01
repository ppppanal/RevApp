import { config as loadEnv } from "dotenv";
import { createInterface } from "node:readline";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { AppError } from "./errors";
import { parseStudyCliInput } from "./study-input";

const userIdSchema = z.string().trim().min(1).max(80);
const accountSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("register"), login: z.string(), password: z.string() }).strict(),
  z.object({ action: z.literal("login"), login: z.string(), password: z.string() }).strict(),
  z.object({ action: z.literal("home"), userId: userIdSchema }).strict(),
  z.object({ action: z.literal("get"), userId: userIdSchema, noteId: z.string().trim().min(1) }).strict(),
  z.object({
    action: z.literal("quote"),
    userId: userIdSchema,
    noteId: z.string().trim().min(1),
    quote: z.string(),
  }).strict(),
  z.object({ action: z.literal("quiz"), userId: userIdSchema, noteId: z.string().trim().min(1) }).strict(),
  z.object({
    action: z.literal("grade"),
    userId: userIdSchema,
    noteId: z.string().trim().min(1),
    cardId: z.string().trim().min(1),
    attempt: z.string(),
  }).strict(),
]);

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(apiRoot, ".env") });
if (!process.env.DIRECT_URL?.trim() && process.env.DATABASE_URL?.trim()) {
  process.env.DIRECT_URL = process.env.DATABASE_URL;
}

const maxStdinBytes = 12_000_000;

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of process.stdin) {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    total += buf.length;
    if (total > maxStdinBytes) {
      throw new AppError("VALIDATION", "Upload is too large.", 400);
    }
    chunks.push(buf);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function errorBody(error: unknown): { error: { code: string; message: string; noteId?: string } } {
  return error instanceof AppError
    ? { error: { code: error.code, message: error.message, ...(error.noteId ? { noteId: error.noteId } : {}) } }
    : { error: { code: "INTERNAL", message: "Study generation failed." } };
}

function writeLine(value: unknown): void {
  process.stdout.write(`${JSON.stringify(value)}\n`);
}

function fail(error: unknown): never {
  process.stderr.write(`${JSON.stringify(errorBody(error))}\n`);
  process.exit(1);
}

async function shutdown(): Promise<void> {
  const { shutdownImageOcr } = await import("./extraction/image-ocr");
  await shutdownImageOcr().catch(() => undefined);
  const { prisma } = await import("./db");
  await prisma.$disconnect().catch(() => undefined);
}

async function warm(): Promise<void> {
  const { prisma } = await import("./db");
  await import("./config");
  await import("./services/account-service");
  await prisma.$connect();
}

async function execute(raw: string): Promise<unknown> {
  const trimmed = raw.trim();
  if (!trimmed) throw new AppError("VALIDATION", "Provide note text or a file.", 400);
  let payload: unknown;
  try {
    payload = JSON.parse(trimmed);
  } catch {
    throw new AppError("VALIDATION", "The study request was not valid JSON.", 400);
  }
  const actionName =
    payload && typeof payload === "object" && "action" in payload && typeof payload.action === "string"
      ? payload.action
      : "create";

  const { loadConfig, assertServerConfig } = await import("./config");
  const { prisma } = await import("./db");
  const { RoutingTextExtractor } = await import("./extraction/extractors");
  const { OpenAiCompatibleProvider } = await import("./llm/openai-compatible");
  const { FixtureLlmProvider } = await import("./llm/fixture-provider");
  const { StudyGenerationService } = await import("./services/generation-service");
  const { NoteService } = await import("./services/note-service");
  const { AccountService } = await import("./services/account-service");
  const { QuizService } = await import("./services/quiz-service");

  const config = loadConfig();
  const needsModel = actionName === "create" || actionName === "quote";
  if (needsModel) assertServerConfig(config);
  const provider =
    config.llm.provider === "fake"
      ? new FixtureLlmProvider()
      : new OpenAiCompatibleProvider({
          baseUrl: config.llm.baseUrl,
          apiKey: config.llm.apiKey,
          model: config.llm.model,
          jsonMode: config.llm.jsonMode,
        });
  const notes = new NoteService(
    prisma,
    new RoutingTextExtractor(),
    new StudyGenerationService(provider, config.llm.timeoutMs),
    null,
  );
  const accounts = new AccountService(prisma);
  const quizzes = new QuizService(prisma);
  let result: unknown;
  if (actionName === "create") {
    const prepared = parseStudyCliInput(payload);
    if (!prepared.userId) throw new AppError("VALIDATION", "Sign in before saving a note.", 400);
    result = await notes.create(prepared.userId, prepared.command, {
      storeFiles: false,
      extractedText: prepared.extractedText,
    });
  } else {
    const parsed = accountSchema.safeParse(payload);
    if (!parsed.success) {
      throw new AppError("VALIDATION", parsed.error.issues[0]?.message ?? "The study request is invalid.", 400);
    }
    const action = parsed.data;
    if (action.action === "register") result = await accounts.register(action.login, action.password);
    else if (action.action === "login") result = await accounts.authenticate(action.login, action.password);
    else if (action.action === "home") {
      const labels = await accounts.labels(action.userId);
      result = { notes: await notes.list(action.userId), ...labels };
    } else if (action.action === "get") result = await notes.get(action.userId, action.noteId);
    else if (action.action === "quiz") result = await quizzes.start(action.userId, action.noteId);
    else if (action.action === "grade") {
      result = await quizzes.grade(action.userId, action.noteId, action.cardId, action.attempt);
    } else result = await notes.addQuoteCard(action.userId, action.noteId, action.quote);
  }
  return result;
}

async function serve(): Promise<void> {
  try {
    await warm();
  } catch (error) {
    fail(error);
  }
  writeLine({ ready: true });
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  try {
    for await (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (Buffer.byteLength(trimmed) > maxStdinBytes) {
        writeLine(errorBody(new AppError("VALIDATION", "Upload is too large.", 400)));
        continue;
      }
      try {
        writeLine(await execute(trimmed));
      } catch (error) {
        writeLine(errorBody(error));
      }
    }
  } finally {
    lines.close();
    await shutdown();
  }
}

async function main(): Promise<void> {
  if (process.argv.includes("--serve")) {
    await serve();
    return;
  }
  try {
    writeLine(await execute(await readStdin()));
  } finally {
    await shutdown();
  }
}

main().catch((error: unknown) => {
  fail(error);
});
