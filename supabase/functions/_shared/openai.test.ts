/**
 * Deno unit tests for the shared OpenAI helper.
 * Run: deno test supabase/functions/_shared/openai.test.ts
 */
import {
  assertEquals,
  assertStrictEquals,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { getOpenAIModel, readOpenAITextContent, requireOpenAIKey } from "./openai.ts";

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

// ── readOpenAITextContent ─────────────────────────────────────────────────────

Deno.test("readOpenAITextContent: extracts content from standard response", () => {
  const payload = {
    choices: [{ message: { content: "Hello world" } }],
  };
  assertStrictEquals(readOpenAITextContent(payload), "Hello world");
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
