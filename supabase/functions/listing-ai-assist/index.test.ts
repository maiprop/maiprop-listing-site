/**
 * Tests for listing-ai-assist edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("ping request returns 200 without auth", async () => {
  // listing-ai-assist has a special 'ping' type that bypasses heavy logic
  const res = await handler(req("POST", { type: "ping" }));
  assertEquals(res.status, 200);
});

Deno.test("ping request returns 200 even when AI provider credentials are missing", async () => {
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");
  const res = await handler(req("POST", { type: "ping" }));
  assertEquals(res.status, 200);
});

Deno.test("unknown origin is rejected with fallback CORS", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "OPTIONS",
    headers: { origin: "https://evil.com" },
  });
  const res = await handler(r);
  assertEquals(res.status, 200);
  // Should fall back to production origin, not echo evil.com
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

restore();
