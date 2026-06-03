/**
 * Tests for property-chat edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { messages: [{ role: "user", content: "hello" }] }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST", { messages: [] }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("Gemini JSON responses are normalized to frontend-readable SSE chunks", async () => {
  const originalFetch = globalThis.fetch;
  const providerText = "This auction looks below nearby comparables.";
  Deno.env.set("GEMINI_API_KEY", "placeholder-gemini");
  globalThis.fetch = (() =>
    Promise.resolve(new Response(JSON.stringify({
      candidates: [{ content: { parts: [{ text: providerText }] } }],
    }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }))) as typeof fetch;

  try {
    const res = await handler(authedReq(
      "POST",
      { messages: [{ role: "user", content: "Summarize this property" }] },
      { authorization: "Bearer test-valid-token" },
    ));
    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), "text/event-stream");
    const body = await res.text();
    assertEquals(body.includes("data: "), true);
    assertEquals(body.includes(providerText), true);
    assertEquals(body.includes("data: [DONE]"), true);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("GEMINI_API_KEY");
  }
});

restore();
