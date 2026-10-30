import { z } from "zod";

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z.string().min(1),
  DEV_USER_EMAIL: z
    .string()
    .trim()
    .min(3)
    .refine((value) => value.includes("@"), "DEV_USER_EMAIL must look like an email.")
    .default("dev@localhost"),
  LLM_PROVIDER: z.enum(["openai", "fake"]).default("openai"),
  LLM_BASE_URL: z.string().url().default("https://generativelanguage.googleapis.com/v1beta/openai"),
  LLM_API_KEY: z.string().optional().default(""),
  LLM_MODEL: z.string().trim().min(1).default("gemini-3.8-flash"),
  LLM_TIMEOUT_MS: z.coerce.number().int().positive().default(45_000),
  LLM_JSON_MODE: z.enum(["object", "off"]).default("object"),
});

export interface AppConfig {
  port: number;
  databaseUrl: string;
  devUserEmail: string;
  llm: {
    provider: "openai" | "fake";
    baseUrl: string;
    apiKey: string;
    model: string;
    timeoutMs: number;
    jsonMode: boolean;
  };
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(env);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.join(".");
        return path ? `${path}: ${issue.message}` : issue.message;
      })
      .join(" ");
    throw new Error(`Invalid environment: ${message}`);
  }

  return {
    port: parsed.data.PORT,
    databaseUrl: parsed.data.DATABASE_URL,
    devUserEmail: parsed.data.DEV_USER_EMAIL,
    llm: {
      provider: parsed.data.LLM_PROVIDER,
      baseUrl: parsed.data.LLM_BASE_URL,
      apiKey: parsed.data.LLM_API_KEY.trim(),
      model: parsed.data.LLM_MODEL,
      timeoutMs: parsed.data.LLM_TIMEOUT_MS,
      jsonMode: parsed.data.LLM_JSON_MODE === "object",
    },
  };
}

export function assertServerConfig(config: AppConfig): void {
  if (config.llm.provider === "openai" && config.llm.apiKey.length === 0) {
    throw new Error(
      "LLM_API_KEY is required. Copy .env.example to apps/api/.env and set a Gemini API key, or set LLM_PROVIDER=fake for local UI work.",
    );
  }
}
