import { describe, expect, it } from "vitest";
import { GenerationError } from "../errors";
import { OpenAiCompatibleProvider } from "./openai-compatible";

const options = {
  baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
  apiKey: "test-key",
  model: "gemini-3.8-flash",
  jsonMode: true,
};

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("OpenAiCompatibleProvider", () => {
  it("posts an OpenAI-compatible chat completion and returns the message text", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      captured = { url: String(input), init: init ?? {} };
      return jsonResponse({
        choices: [{ message: { content: "{\"summary\":\"ok\"}" } }],
      });
    };
    const provider = new OpenAiCompatibleProvider({ ...options, fetchImpl });

    const content = await provider.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 });

    expect(content).toBe("{\"summary\":\"ok\"}");
    expect(captured?.url).toBe("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    expect(captured?.init.headers).toMatchObject({
      authorization: "Bearer test-key",
    });
    const body = JSON.parse(String(captured?.init.body)) as {
      model: string;
      response_format: { type: string };
    };
    expect(body.model).toBe("gemini-3.8-flash");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("reads array message content and treats an empty completion as invalid JSON", async () => {
    const provider = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: [{ text: "alpha" }, { text: "beta" }] } }] }),
    });
    await expect(provider.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).resolves.toBe(
      "alphabeta",
    );

    const empty = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async () => jsonResponse({ choices: [{ message: { content: "" } }] }),
    });
    await expect(empty.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).rejects.toMatchObject({
      code: "INVALID_JSON",
    });
  });

  it("returns a provider error without echoing the API key", async () => {
    const provider = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async () => new Response("bad key test-key", { status: 401 }),
    });
    const error = await provider
      .complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })
      .catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(GenerationError);
    expect(error).toMatchObject({ code: "PROVIDER_ERROR", message: "The model provider returned 401." });
    expect(JSON.stringify(error)).not.toContain("test-key");
  });

  it("maps an aborted request to a timeout error", async () => {
    const fetchImpl: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    const provider = new OpenAiCompatibleProvider({ ...options, fetchImpl });
    await expect(provider.complete([{ role: "user", content: "Notes" }], { timeoutMs: 20 })).rejects.toMatchObject({
      code: "TIMEOUT",
    });
  });
});
