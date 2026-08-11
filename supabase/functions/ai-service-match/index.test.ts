/**
 * Tests for ai-service-match edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", { need: "I need a lawyer for a property purchase" }));
  assertEquals(res.status, 401);
});

Deno.test("Authorization: Basic is rejected with 401", async () => {
  const res = await handler(req("POST", { need: "I need a lawyer" }, {
    authorization: "Basic xyz",
  }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer token → auth failure (not 500)", async () => {
  const res = await handler(authedReq("POST", { need: "need a notary" }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("rejects invalid and oversized service needs before calling the AI provider", async () => {
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
      { need: "x".repeat(2001) },
      { need: ["lawyer"] },
      { need: "Need a lawyer", unexpected: true },
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
