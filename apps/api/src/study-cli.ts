import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { AppError } from "./errors";
import { parseStudyCliInput } from "./study-input";

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

function fail(error: unknown): never {
  const body =
    error instanceof AppError
      ? { error: { code: error.code, message: error.message, ...(error.noteId ? { noteId: error.noteId } : {}) } }
      : { error: { code: "INTERNAL", message: "Study generation failed." } };
  process.stderr.write(`${JSON.stringify(body)}\n`);
  process.exit(1);
}

async function main(): Promise<void> {
  const raw = (await readStdin()).trim();
  if (!raw) throw new AppError("VALIDATION", "Provide note text or a file.", 400);
  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    throw new AppError("VALIDATION", "The study request was not valid JSON.", 400);
  }
  const prepared = parseStudyCliInput(payload);

  const { loadConfig, assertServerConfig } = await import("./config");
  const { prisma } = await import("./db");
  const { RoutingTextExtractor } = await import("./extraction/extractors");
  const { OpenAiCompatibleProvider } = await import("./llm/openai-compatible");
  const { FixtureLlmProvider } = await import("./llm/fixture-provider");
  const { StudyGenerationService } = await import("./services/generation-service");
  const { NoteService } = await import("./services/note-service");
  const { resolveDevUser } = await import("./services/dev-user");

  try {
    const config = loadConfig();
    assertServerConfig(config);
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
    const user = await resolveDevUser(prisma, config.devUserEmail);
    const note = await notes.create(user.id, prepared.command, {
      storeFiles: false,
      extractedText: prepared.extractedText,
    });
    process.stdout.write(`${JSON.stringify(note)}\n`);
  } finally {
    const { shutdownImageOcr } = await import("./extraction/image-ocr");
    await shutdownImageOcr().catch(() => undefined);
    const { prisma } = await import("./db");
    await prisma.$disconnect().catch(() => undefined);
  }
}

main().catch((error: unknown) => {
  fail(error);
});
