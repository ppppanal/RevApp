import { describe, expect, it } from "vitest";
import { GenerationError } from "../errors";
import { EMPTY_COMPLETION_MESSAGE, OpenAiCompatibleProvider } from "./openai-compatible";

const options = {
  baseUrl: "https://api.openai.com/v1",
  apiKey: "test-key",
  model: "gpt-4o-mini",
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
    expect(captured?.url).toBe("https://api.openai.com/v1/chat/completions");
    expect(captured?.url).not.toContain("generativelanguage.googleapis.com");
    expect(captured?.init.headers).toMatchObject({
      authorization: "Bearer test-key",
    });
    const body = JSON.parse(String(captured?.init.body)) as {
      model: string;
      response_format: { type: string };
    };
    expect(body.model).toBe("gpt-4o-mini");
    expect(body.response_format).toEqual({ type: "json_object" });
  });

  it("keeps the system role and json_object for a non-Gemma model", async () => {
    let body: { messages?: unknown; response_format?: unknown } | undefined;
    const provider = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ choices: [{ message: { content: "{\"summary\":\"ok\"}" } }] });
      },
    });
    await provider.complete(
      [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: "Notes:\nCells" },
      ],
      { timeoutMs: 1000 },
    );
    expect(body?.messages).toEqual([
      { role: "system", content: "Return strict JSON only." },
      { role: "user", content: "Notes:\nCells" },
    ]);
    expect(body?.response_format).toEqual({ type: "json_object" });
  });

  it("sends a Google base URL to OpenRouter with the Gemma model", async () => {
    let captured: { url: string; init: RequestInit } | undefined;
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai/",
      apiKey: "test-key",
      model: "gemini-3.8-flash",
      jsonMode: true,
      fetchImpl: async (input, init) => {
        captured = { url: String(input), init: init ?? {} };
        return jsonResponse({ choices: [{ message: { content: "{\"summary\":\"ok\"}" } }] });
      },
    });
    await provider.complete(
      [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: "Notes:\nCells" },
      ],
      { timeoutMs: 1000 },
    );
    expect(captured?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(captured?.url).not.toContain("generativelanguage.googleapis.com");
    expect(captured?.url).not.toContain("test-key");
    expect(captured?.init.headers).toMatchObject({ authorization: "Bearer test-key" });
    const body = JSON.parse(String(captured?.init.body)) as Record<string, unknown>;
    expect(body.model).toBe("google/gemma-4-31b-it:free");
    expect(body.messages).toEqual([{ role: "user", content: "Return strict JSON only.\n\nNotes:\nCells" }]);
    expect(body).not.toHaveProperty("response_format");
  });

  it("asks Gemma on OpenRouter with one user message and no response format", async () => {
    let captured: { url: string; body: Record<string, unknown> } | undefined;
    const provider = new OpenAiCompatibleProvider({
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: "test-key",
      model: "google/gemma-4-31b-it:free",
      jsonMode: true,
      fetchImpl: async (input, init) => {
        captured = { url: String(input), body: JSON.parse(String(init?.body)) };
        return jsonResponse({ choices: [{ message: { content: "{\"summary\":\"ok\"}" } }] });
      },
    });
    await provider.complete(
      [
        { role: "system", content: "Return strict JSON only." },
        { role: "user", content: "Notes:\nCells" },
      ],
      { timeoutMs: 1000 },
    );
    const body = captured?.body;
    expect(captured?.url).toBe("https://openrouter.ai/api/v1/chat/completions");
    expect(captured?.url).not.toContain("generativelanguage.googleapis.com");
    expect(body?.messages).toEqual([{ role: "user", content: "Return strict JSON only.\n\nNotes:\nCells" }]);
    expect(body).not.toHaveProperty("response_format");
    expect(body).not.toHaveProperty("max_tokens");
    expect(body).not.toHaveProperty("temperature");
    expect(JSON.stringify(body)).not.toContain("json_schema");
    expect(JSON.stringify(body)).not.toContain("\"role\":\"system\"");
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
      message: EMPTY_COMPLETION_MESSAGE,
    });
  });

  it("uses a reasoning field when the message content is empty", async () => {
    const provider = new OpenAiCompatibleProvider({
      ...options,
      model: "nvidia/nemotron-3.5-lightning:free",
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: "", reasoning: "{\"summary\":\"from reasoning\"}" } }],
        }),
    });
    await expect(provider.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).resolves.toBe(
      "{\"summary\":\"from reasoning\"}",
    );

    const details = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: null, reasoning_details: [{ type: "reasoning.text", text: "detail text" }] } }],
        }),
    });
    await expect(details.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).resolves.toBe(
      "detail text",
    );

    const nested = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async () =>
        jsonResponse({
          choices: [
            {
              message: {
                content: "",
                reasoning: { content: [{ type: "reasoning_text", text: "{\"summary\":\"nested\"}" }] },
              },
            },
          ],
        }),
    });
    await expect(nested.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).resolves.toBe(
      "{\"summary\":\"nested\"}",
    );
  });

  it("reads a pack after a thinking trace when the provider body is not JSON", async () => {
    const pack = JSON.stringify({
      summary: "Cells make ATP.",
      keyPoints: [{ kind: "FACT", content: "Mitochondria produce ATP." }],
      flashcards: [{ question: "What do mitochondria produce?", answer: "ATP" }],
    });
    const provider = new OpenAiCompatibleProvider({
      ...options,
      model: "nvidia/nemotron-3.5-lightning:free",
      fetchImpl: async () =>
        new Response(`<think>trace {"a":1}</think>\n${JSON.stringify({ choices: [{ message: { content: pack } }] })}`, {
          status: 200,
        }),
    });
    await expect(provider.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).resolves.toBe(pack);

    const reasoned = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async () =>
        jsonResponse({
          choices: [{ message: { content: "I think {this} is incomplete", reasoning: `Trace.\n${pack}` } }],
        }),
    });
    await expect(reasoned.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).resolves.toContain(
      '"summary":"Cells make ATP."',
    );

    const stream = new OpenAiCompatibleProvider({
      ...options,
      fetchImpl: async () =>
        new Response(
          `data: ${JSON.stringify({ choices: [{ delta: { content: pack.slice(0, 12) } }] })}\n\ndata: ${JSON.stringify({ choices: [{ delta: { content: pack.slice(12) } }] })}\n\ndata: [DONE]\n`,
          { status: 200 },
        ),
    });
    await expect(stream.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })).resolves.toBe(pack);
  });

  it("gives Nemotron a low reasoning budget so the answer is not truncated", async () => {
    let body: { max_tokens?: number; reasoning?: { effort?: string } } | undefined;
    const provider = new OpenAiCompatibleProvider({
      ...options,
      baseUrl: "https://openrouter.ai/api/v1",
      model: "nvidia/nemotron-3.5-lightning:free",
      fetchImpl: async (_input, init) => {
        body = JSON.parse(String(init?.body));
        return jsonResponse({ choices: [{ message: { content: "{\"summary\":\"ok\"}" } }] });
      },
    });
    await provider.complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 });
    expect(body?.max_tokens).toBe(8192);
    expect(body?.reasoning).toEqual({ effort: "low" });
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
    expect(error).toMatchObject({ code: "PROVIDER_ERROR", message: "bad key [redacted]" });
    expect(JSON.stringify(error)).not.toContain("test-key");
  });

  it("reads Google's array error without echoing the API key", async () => {
    const provider = new OpenAiCompatibleProvider({
      ...options,
      apiKey: "secret-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify([
            { error: { code: 400, message: "Please pass a valid API key secret-key", status: "INVALID_ARGUMENT" } },
          ]),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    });
    const error = await provider
      .complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Please pass a valid API key [redacted]",
    });
    expect(JSON.stringify(error)).not.toContain("secret-key");
  });

  it("returns the OpenRouter error text instead of only the status", async () => {
    const provider = new OpenAiCompatibleProvider({
      ...options,
      apiKey: "secret-key",
      fetchImpl: async () =>
        new Response(
          JSON.stringify({
            error: {
              message: "Provider returned error",
              code: 400,
              metadata: { raw: "unsupported_parameter: max_tokens secret-key" },
            },
          }),
          { status: 400, headers: { "content-type": "application/json" } },
        ),
    });
    const error = await provider
      .complete([{ role: "user", content: "Notes" }], { timeoutMs: 1000 })
      .catch((caught: unknown) => caught);
    expect(error).toMatchObject({
      code: "PROVIDER_ERROR",
      message: "Provider returned error: unsupported_parameter: max_tokens [redacted]",
    });
    expect(JSON.stringify(error)).not.toContain("secret-key");
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
