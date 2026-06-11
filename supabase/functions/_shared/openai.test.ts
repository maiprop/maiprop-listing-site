/**
 * Deno unit tests for the shared OpenAI helper.
 * Run: deno test supabase/functions/_shared/openai.test.ts
 */
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  getGeminiModel,
  getOpenAIModel,
  getOpenAIReasoningEffort,
  hasAIProviderCredentials,
  readOpenAITextContent,
  requireAIProviderKey,
  requireOpenAIKey,
  openAIChatCompletion,
  supportsOpenAIReasoningEffort,
} from "./openai.ts";

// ── getOpenAIModel ────────────────────────────────────────────────────────────

Deno.test("getOpenAIModel: returns fallback when env var is unset", () => {
  const prev = Deno.env.get("OPENAI_MODEL");
  Deno.env.delete("OPENAI_MODEL");
  try {
    assertStrictEquals(getOpenAIModel(), "gpt-4.1-mini");
  } finally {
    if (prev) Deno.env.set("OPENAI_MODEL", prev);
  }
});

Deno.test("getOpenAIModel: returns env value when set", () => {
  const prev = Deno.env.get("OPENAI_MODEL");
  Deno.env.set("OPENAI_MODEL", "gpt-4o");
  try {
    assertStrictEquals(getOpenAIModel(), "gpt-4o");
  } finally {
    if (prev) Deno.env.set("OPENAI_MODEL", prev);
    else Deno.env.delete("OPENAI_MODEL");
  }
});

Deno.test("getOpenAIModel: supports custom env var name", () => {
  Deno.env.set("CUSTOM_MODEL", "gpt-3.5-turbo");
  try {
    assertStrictEquals(getOpenAIModel("CUSTOM_MODEL"), "gpt-3.5-turbo");
  } finally {
    Deno.env.delete("CUSTOM_MODEL");
  }
});

Deno.test("getGeminiModel: returns Gemini fallback when env var is unset", () => {
  const prev = Deno.env.get("GEMINI_MODEL");
  Deno.env.delete("GEMINI_MODEL");
  try {
    assertStrictEquals(getGeminiModel(), "gemini-2.5-flash");
  } finally {
    if (prev) Deno.env.set("GEMINI_MODEL", prev);
  }
});

Deno.test("getOpenAIReasoningEffort: returns configured reasoning effort", () => {
  const prev = Deno.env.get("OPENAI_REASONING_EFFORT");
  Deno.env.set("OPENAI_REASONING_EFFORT", "medium");
  try {
    assertStrictEquals(getOpenAIReasoningEffort(), "medium");
  } finally {
    if (prev) Deno.env.set("OPENAI_REASONING_EFFORT", prev);
    else Deno.env.delete("OPENAI_REASONING_EFFORT");
  }
});

// ── requireOpenAIKey ──────────────────────────────────────────────────────────

Deno.test("requireOpenAIKey: throws when OPENAI_API_KEY is unset", () => {
  const prev = Deno.env.get("OPENAI_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  try {
    assertThrows(() => requireOpenAIKey(), Error, "OPENAI_API_KEY not configured");
  } finally {
    if (prev) Deno.env.set("OPENAI_API_KEY", prev);
  }
});

Deno.test("requireOpenAIKey: returns key when set", () => {
  const prev = Deno.env.get("OPENAI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "sk-test-123");
  try {
    assertStrictEquals(requireOpenAIKey(), "sk-test-123");
  } finally {
    if (prev) Deno.env.set("OPENAI_API_KEY", prev);
    else Deno.env.delete("OPENAI_API_KEY");
  }
});

Deno.test("hasAIProviderCredentials: accepts Gemini or OpenAI credentials", () => {
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.delete("OPENAI_API_KEY");
  try {
    assertStrictEquals(hasAIProviderCredentials(), false);
    Deno.env.set("GEMINI_API_KEY", "gemini-test");
    assertStrictEquals(hasAIProviderCredentials(), true);
    Deno.env.delete("GEMINI_API_KEY");
    Deno.env.set("OPENAI_API_KEY", "openai-test");
    assertStrictEquals(hasAIProviderCredentials(), true);
  } finally {
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
  }
});

Deno.test("requireAIProviderKey: prefers OpenAI over Gemini", () => {
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  Deno.env.set("GEMINI_API_KEY", "gemini-test");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  try {
    assertStrictEquals(requireAIProviderKey(), "openai-test");
  } finally {
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
  }
});

Deno.test("supportsOpenAIReasoningEffort: gates reasoning effort to reasoning models", () => {
  assertStrictEquals(supportsOpenAIReasoningEffort("gpt-4.1-mini"), false);
  assertStrictEquals(supportsOpenAIReasoningEffort("gpt-4o"), false);
  assertStrictEquals(supportsOpenAIReasoningEffort("o3-mini"), true);
  assertStrictEquals(supportsOpenAIReasoningEffort("gpt-5.4-mini"), true);
});

Deno.test("openAIChatCompletion prefers OpenAI when both provider keys are configured", async () => {
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.set("GEMINI_API_KEY", "gemini-test");
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = ((input: RequestInfo | URL) => {
    requestedUrl = String(input);
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    const res = await openAIChatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });
    assertEquals(res.status, 200);
    assertStrictEquals(requestedUrl, "https://api.openai.com/v1/chat/completions");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});

Deno.test("openAIChatCompletion omits reasoning_effort for non-reasoning OpenAI models", async () => {
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  const prevReasoning = Deno.env.get("OPENAI_REASONING_EFFORT");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.set("OPENAI_REASONING_EFFORT", "medium");
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    const res = await openAIChatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    }, "gpt-4.1-mini");
    assertEquals(res.status, 200);
    assertStrictEquals("reasoning_effort" in requestBody, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
    if (prevReasoning) Deno.env.set("OPENAI_REASONING_EFFORT", prevReasoning);
    else Deno.env.delete("OPENAI_REASONING_EFFORT");
  }
});

Deno.test("openAIChatCompletion sends reasoning_effort for reasoning OpenAI models", async () => {
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  const prevReasoning = Deno.env.get("OPENAI_REASONING_EFFORT");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");
  Deno.env.set("OPENAI_REASONING_EFFORT", "high");
  const originalFetch = globalThis.fetch;
  let requestBody: Record<string, unknown> = {};

  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    requestBody = JSON.parse(String(init?.body ?? "{}"));
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    const res = await openAIChatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    }, "gpt-5.4-mini");
    assertEquals(res.status, 200);
    assertStrictEquals(requestBody.reasoning_effort, "high");
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
    if (prevReasoning) Deno.env.set("OPENAI_REASONING_EFFORT", prevReasoning);
    else Deno.env.delete("OPENAI_REASONING_EFFORT");
  }
});

// ── readOpenAITextContent ─────────────────────────────────────────────────────

Deno.test("readOpenAITextContent: extracts content from standard response", () => {
  const payload = {
    choices: [{ message: { content: "Hello world" } }],
  };
  assertStrictEquals(readOpenAITextContent(payload), "Hello world");
});

Deno.test("readOpenAITextContent: extracts content from Gemini response", () => {
  const payload = {
    candidates: [{ content: { parts: [{ text: "Hello " }, { text: "Gemini" }] } }],
  };
  assertStrictEquals(readOpenAITextContent(payload), "Hello Gemini");
});

Deno.test("readOpenAITextContent: returns empty string for null/undefined", () => {
  assertStrictEquals(readOpenAITextContent(null), "");
  assertStrictEquals(readOpenAITextContent(undefined), "");
});

Deno.test("readOpenAITextContent: returns empty string for non-object", () => {
  assertStrictEquals(readOpenAITextContent("string"), "");
  assertStrictEquals(readOpenAITextContent(42), "");
});

Deno.test("readOpenAITextContent: returns empty string for empty choices", () => {
  assertStrictEquals(readOpenAITextContent({ choices: [] }), "");
});

Deno.test("readOpenAITextContent: returns empty string when content is missing", () => {
  assertStrictEquals(readOpenAITextContent({ choices: [{ message: {} }] }), "");
  assertStrictEquals(readOpenAITextContent({ choices: [{}] }), "");
});

Deno.test("readOpenAITextContent: handles missing choices key", () => {
  assertEquals(readOpenAITextContent({}), "");
});

Deno.test("openAIChatCompletion sends provider requests with an abort signal", async () => {
  const prevOpenAI = Deno.env.get("OPENAI_API_KEY");
  const prevGemini = Deno.env.get("GEMINI_API_KEY");
  Deno.env.set("OPENAI_API_KEY", "openai-test");
  Deno.env.delete("GEMINI_API_KEY");
  const originalFetch = globalThis.fetch;
  let observedSignal: AbortSignal | null = null;

  globalThis.fetch = ((_input: RequestInfo | URL, init?: RequestInit) => {
    observedSignal = init?.signal instanceof AbortSignal ? init.signal : null;
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "ok" } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    const res = await openAIChatCompletion({
      messages: [{ role: "user", content: "Hello" }],
    });
    assertEquals(res.status, 200);
    assertStrictEquals(observedSignal !== null, true);
  } finally {
    globalThis.fetch = originalFetch;
    if (prevOpenAI) Deno.env.set("OPENAI_API_KEY", prevOpenAI);
    else Deno.env.delete("OPENAI_API_KEY");
    if (prevGemini) Deno.env.set("GEMINI_API_KEY", prevGemini);
    else Deno.env.delete("GEMINI_API_KEY");
  }
});
