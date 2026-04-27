import { assertEquals } from "https://deno.land/std@0.208.0/assert/mod.ts";
import { fetchWithRetry } from "./retry.ts";

// Stub global fetch for testing
const originalFetch = globalThis.fetch;

function mockFetch(responses: Array<{ status: number; body?: string } | "throw">) {
  let callCount = 0;
  globalThis.fetch = ((_input: unknown, _init?: unknown) => {
    const r = responses[callCount++];
    if (r === "throw") return Promise.reject(new Error("network error"));
    return Promise.resolve(new Response(r.body ?? "", { status: r.status }));
  }) as typeof fetch;
  return () => callCount;
}

function restore() {
  globalThis.fetch = originalFetch;
}

Deno.test("returns immediately on success (no retry)", async () => {
  const getCount = mockFetch([{ status: 200, body: "ok" }]);
  try {
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 2,
      initialDelayMs: 1,
    });
    assertEquals(res.status, 200);
    assertEquals(getCount(), 1);
  } finally {
    restore();
  }
});

Deno.test("retries on 503 and succeeds on second attempt", async () => {
  const getCount = mockFetch([
    { status: 503 },
    { status: 200, body: "ok" },
  ]);
  try {
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 2,
      initialDelayMs: 1,
    });
    assertEquals(res.status, 200);
    assertEquals(getCount(), 2);
  } finally {
    restore();
  }
});

Deno.test("returns last failed response after exhausting retries", async () => {
  const getCount = mockFetch([
    { status: 503 },
    { status: 503 },
    { status: 503 },
  ]);
  try {
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 2,
      initialDelayMs: 1,
    });
    assertEquals(res.status, 503);
    assertEquals(getCount(), 3);
  } finally {
    restore();
  }
});

Deno.test("does not retry on 4xx errors (except 429)", async () => {
  const getCount = mockFetch([{ status: 400, body: "bad request" }]);
  try {
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 2,
      initialDelayMs: 1,
    });
    assertEquals(res.status, 400);
    assertEquals(getCount(), 1);
  } finally {
    restore();
  }
});

Deno.test("retries on 429 Too Many Requests", async () => {
  const getCount = mockFetch([
    { status: 429 },
    { status: 200, body: "ok" },
  ]);
  try {
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 2,
      initialDelayMs: 1,
    });
    assertEquals(res.status, 200);
    assertEquals(getCount(), 2);
  } finally {
    restore();
  }
});

Deno.test("retries on network error and succeeds", async () => {
  const getCount = mockFetch([
    "throw",
    { status: 200, body: "ok" },
  ]);
  try {
    const res = await fetchWithRetry("https://example.com", undefined, {
      maxRetries: 2,
      initialDelayMs: 1,
    });
    assertEquals(res.status, 200);
    assertEquals(getCount(), 2);
  } finally {
    restore();
  }
});
