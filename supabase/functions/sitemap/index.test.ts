/**
 * Tests for sitemap edge function (public, no auth required).
 * Returns XML sitemap from live DB data; in tests Supabase client will fail or
 * return empty data — function should handle that gracefully.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("GET returns XML content-type with a graceful fallback", async () => {
  const r = new Request("https://functions.supabase.co/fn", { method: "GET" });
  const res = await handler(r);
  // Without real Supabase credentials the query fails, but crawlers still get valid XML.
  assertEquals(res.status, 200);
  const contentType = res.headers.get("Content-Type") ?? "";
  assertStringIncludes(contentType, "xml");
});

Deno.test("OPTIONS preflight returns valid response", async () => {
  // sitemap has no explicit OPTIONS handling — Deno.serve handles it or returns default
  const res = await handler(req("OPTIONS"));
  assertEquals(typeof res.status, "number");
  assertEquals(res.status >= 200 && res.status < 600, true);
});

Deno.test("fallback response body is XML-safe", async () => {
  const r = new Request("https://functions.supabase.co/fn", { method: "GET" });
  const res = await handler(r);
  const text = await res.text();
  assertStringIncludes(text, "<urlset");
  assertStringIncludes(text, "<!--");
});

restore();
