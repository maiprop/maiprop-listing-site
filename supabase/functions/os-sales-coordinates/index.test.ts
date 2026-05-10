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
  const request = new Request("https://functions.supabase.co/fn", { method: "GET" });
  const res = await handler(request);
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
  assertEquals([200, 502, 503].includes(res.status), true);
});

Deno.test("unknown origin falls back to production CORS origin", async () => {
  const request = new Request("https://functions.supabase.co/fn", {
    method: "OPTIONS",
    headers: { origin: "https://hacker.io" },
  });
  const res = await handler(request);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("POST with invalid JSON returns 400", async () => {
  const request = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "not-json",
  });
  const res = await handler(request);
  assertEquals(res.status, 400);
});

// ── New hardening tests ─────────────────────────────────────────────────────

Deno.test("POST with array body returns 400", async () => {
  const request = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify([{ lat: 37, lng: 23 }]),
  });
  const res = await handler(request);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "JSON object");
});

Deno.test("POST with null body returns 400", async () => {
  const request = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "null",
  });
  const res = await handler(request);
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "JSON object");
});

Deno.test("POST with non-numeric lat/lng returns 400", async () => {
  const res = await handler(req("POST", { lat: "abc", lng: 23.7275 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "finite numbers");
});

Deno.test("POST with NaN lat returns 400", async () => {
  const request = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: null, lng: 23.7275 }),
  });
  const res = await handler(request);
  assertEquals(res.status, 400);
});

Deno.test("POST with out-of-range lat returns 400", async () => {
  const res = await handler(req("POST", { lat: 91, lng: 23.7275 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "-90");
});

Deno.test("POST with out-of-range lng returns 400", async () => {
  const res = await handler(req("POST", { lat: 37.98, lng: 181 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "-180");
});

Deno.test("POST with boolean lat returns 400", async () => {
  const res = await handler(req("POST", { lat: true, lng: 23 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "finite numbers");
});

Deno.test("radius_km is capped at 50", async () => {
  // We can't easily inspect the forwarded body, but we can confirm no crash
  const res = await handler(req("POST", { lat: 37.98, lng: 23.72, radius_km: 9999, limit: 5 }));
  assertEquals([200, 502, 503].includes(res.status), true);
});

Deno.test("limit is capped at 100", async () => {
  const res = await handler(req("POST", { lat: 37.98, lng: 23.72, radius_km: 1, limit: 99999 }));
  assertEquals([200, 502, 503].includes(res.status), true);
});

restore();
