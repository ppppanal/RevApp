import { config as loadEnv } from "dotenv";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: resolve(apiRoot, ".env") });

const { loadConfig, assertServerConfig } = await import("./config");
const { prisma } = await import("./db");
const { createApp } = await import("./app");
const { RoutingTextExtractor } = await import("./extraction/extractors");
const { OpenAiCompatibleProvider } = await import("./llm/openai-compatible");
const { FixtureLlmProvider } = await import("./llm/fixture-provider");
const { StudyGenerationService } = await import("./services/generation-service");
const { NoteService } = await import("./services/note-service");
const { FlashcardService } = await import("./services/flashcard-service");
const { resolveDevUser } = await import("./services/dev-user");

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

const generation = new StudyGenerationService(provider, config.llm.timeoutMs);
const app = createApp({
  notes: new NoteService(prisma, new RoutingTextExtractor(), generation),
  flashcards: new FlashcardService(prisma),
  resolveUser: () => resolveDevUser(prisma, config.devUserEmail),
});

const host = process.env.HOST?.trim() || "0.0.0.0";
app.listen(config.port, host, () => {
  console.log(`API listening on http://${host}:${config.port}`);
});
