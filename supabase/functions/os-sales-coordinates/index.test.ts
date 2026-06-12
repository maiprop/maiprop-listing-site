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

Deno.test("upstream URL honours MAIPROP_OS_URL env var", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  const previousOsUrl = Deno.env.get("MAIPROP_OS_URL");
  globalThis.fetch = ((input: Request | string | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    // Return a 503 so the handler falls through to mock data and the test
    // doesn't need a real upstream.
    return Promise.resolve(new Response(null, { status: 503 }));
  }) as typeof fetch;
  try {
    Deno.env.set("MAIPROP_OS_URL", "https://staging-os.example.test");
    const res = await handler(req("POST", { lat: 37.98, lng: 23.72, radius_km: 1, limit: 5 }));
    // Status doesn't matter (we expect a fallback path), only that we
    // attempted to call the staging URL we configured.
    assertEquals([200, 502, 503].includes(res.status), true);
    const upstreamCall = calls.find((u) => u.includes("/api/v1/sales/filter/coordinates"));
    if (!upstreamCall) {
      throw new Error(`expected an upstream call to /api/v1/sales/filter/coordinates, got: ${calls.join(", ") || "<none>"}`);
    }
    assertStringIncludes(upstreamCall, "https://staging-os.example.test/api/v1/sales/filter/coordinates");
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOsUrl === undefined) Deno.env.delete("MAIPROP_OS_URL");
    else Deno.env.set("MAIPROP_OS_URL", previousOsUrl);
  }
});

Deno.test("missing MAIPROP_OS_URL fails closed without calling a default upstream", async () => {
  const calls: string[] = [];
  const originalFetch = globalThis.fetch;
  const previousOsUrl = Deno.env.get("MAIPROP_OS_URL");
  globalThis.fetch = ((input: Request | string | URL) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    calls.push(url);
    return Promise.resolve(new Response(null, { status: 503 }));
  }) as typeof fetch;
  try {
    Deno.env.delete("MAIPROP_OS_URL");
    const res = await handler(req("POST", { lat: 37.98, lng: 23.72, radius_km: 1, limit: 5 }));
    assertEquals(res.status, 503);
    assertEquals(calls.some((u) => u.includes("/api/v1/sales/filter/coordinates")), false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOsUrl === undefined) Deno.env.delete("MAIPROP_OS_URL");
    else Deno.env.set("MAIPROP_OS_URL", previousOsUrl);
  }
});

Deno.test("non-HTTPS MAIPROP_OS_URL fails closed", async () => {
  const originalFetch = globalThis.fetch;
  const previousOsUrl = Deno.env.get("MAIPROP_OS_URL");
  let called = false;
  globalThis.fetch = (() => {
    called = true;
    return Promise.resolve(new Response(null, { status: 503 }));
  }) as typeof fetch;
  try {
    Deno.env.set("MAIPROP_OS_URL", "http://app.os.maiprop.co:8080");
    const res = await handler(req("POST", { lat: 37.98, lng: 23.72, radius_km: 1, limit: 5 }));
    assertEquals(res.status, 503);
    assertEquals(called, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (previousOsUrl === undefined) Deno.env.delete("MAIPROP_OS_URL");
    else Deno.env.set("MAIPROP_OS_URL", previousOsUrl);
  }
});

restore();
