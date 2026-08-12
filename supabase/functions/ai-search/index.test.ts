/**
 * Tests for ai-search edge function.
 * Run: deno test supabase/functions/ai-search/index.test.ts --allow-env --allow-net
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200 with CORS headers", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization header returns 401", async () => {
  const res = await handler(req("POST", { query: "apartment in athens" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("wrong Authorization scheme returns 401", async () => {
  const res = await handler(req("POST", { query: "house" }, { authorization: "Basic abc" }));
  assertEquals(res.status, 401);
});

Deno.test("valid Bearer token hits auth and returns non-OPTIONS response", async () => {
  // With a fake token the Supabase getUser call will fail → 401 (not 500)
  const res = await authedReq("POST", { query: "villa in crete" });
  const actual = await handler(res);
  // 401 from auth or 429 from rate limit — both are acceptable without a real token
  assertEquals([401, 429].includes(actual.status), true);
});

Deno.test("rejects invalid and oversized search requests before calling the AI provider", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    for (const body of [
      { query: "x".repeat(501) },
      { query: 42 },
      { query: "Athens apartment", unexpected: true },
    ]) {
      const res = await handler(req("POST", body, {
        authorization: "Bearer test-valid-token",
      }));
      assertEquals(res.status, 400);
      const payload = await res.json();
      assertEquals(payload.code, "validation_error");
      assertEquals(Array.isArray(payload.issues), true);
    }
    assertEquals(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
