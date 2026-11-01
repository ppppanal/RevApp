import { describe, expect, it } from "vitest";
import { assertServerConfig, loadConfig } from "./config";

const databaseUrl = "postgresql://rev:rev@localhost:5432/revapp";

describe("loadConfig", () => {
  it("defaults to the OpenRouter Gemma study model", () => {
    const config = loadConfig({ DATABASE_URL: databaseUrl });
    expect(config.llm.provider).toBe("openai");
    expect(config.llm.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.llm.model).toBe("google/gemma-4-31b-it:free");
    expect(config.llm.jsonMode).toBe(true);
    expect(config.port).toBe(3000);
    expect(config.devUserEmail).toBe("dev@localhost");
  });

  it("rewrites the Google Generative Language host to OpenRouter", () => {
    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      LLM_BASE_URL: "https://generativelanguage.googleapis.com/v1beta/openai",
      LLM_MODEL: "gemini-3.8-flash",
    });
    expect(config.llm.baseUrl).toBe("https://openrouter.ai/api/v1");
    expect(config.llm.model).toBe("google/gemma-4-31b-it:free");
    expect(config.llm.baseUrl).not.toContain("generativelanguage.googleapis.com");
  });

  it("requires an API key for the real provider and allows the local fixture without one", () => {
    const missing = loadConfig({ DATABASE_URL: databaseUrl, LLM_API_KEY: "  " });
    expect(() => assertServerConfig(missing)).toThrow(/LLM_API_KEY/);

    const fake = loadConfig({ DATABASE_URL: databaseUrl, LLM_PROVIDER: "fake" });
    expect(() => assertServerConfig(fake)).not.toThrow();
    expect(fake.r2).toBeNull();
  });

  it("reads R2 settings only when the endpoint, keys, and bucket are all set", () => {
    expect(() => loadConfig({ DATABASE_URL: databaseUrl, R2_BUCKET: "notes" })).toThrow(/R2_ENDPOINT/);

    const config = loadConfig({
      DATABASE_URL: databaseUrl,
      R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
      R2_ACCESS_KEY_ID: "access",
      R2_SECRET_ACCESS_KEY: "secret",
      R2_BUCKET: "notes",
    });
    expect(config.r2).toEqual({
      endpoint: "https://account.r2.cloudflarestorage.com",
      accessKeyId: "access",
      secretAccessKey: "secret",
      bucket: "notes",
    });
    expect(() =>
      loadConfig({
        DATABASE_URL: databaseUrl,
        R2_ENDPOINT: "http://account.r2.cloudflarestorage.com",
        R2_ACCESS_KEY_ID: "access",
        R2_SECRET_ACCESS_KEY: "secret",
        R2_BUCKET: "notes",
      }),
    ).toThrow(/https/);
  });
});
