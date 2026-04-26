/**
 * Tests for os-sales-coordinates edge function (public, no auth required).
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("GET returns 405 Method Not Allowed", async () => {
  const r = new Request("https://functions.supabase.co/fn", { method: "GET" });
  const res = await handler(r);
  assertEquals(res.status, 405);
});

Deno.test("POST without lat/lng returns 400", async () => {
  const res = await handler(req("POST", { radius_km: 2, limit: 10 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "lat");
});

Deno.test("POST with lat/lng returns 200 or 503 (OS may be unavailable in test)", async () => {
  const res = await handler(req("POST", { lat: 37.9838, lng: 23.7275, radius_km: 1, limit: 5 }));
  // Either a successful response (if OS API is reachable) or upstream unavailable
  assertEquals([200, 503].includes(res.status), true);
});

Deno.test("unknown origin falls back to production CORS origin", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "OPTIONS",
    headers: { origin: "https://hacker.io" },
  });
  const res = await handler(r);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("POST with invalid JSON returns 400", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  });
  const res = await handler(r);
  assertEquals(res.status, 400);
});

restore();
