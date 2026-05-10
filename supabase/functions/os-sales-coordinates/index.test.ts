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

// ── Hardening: input validation ──────────────────────────────────────────────

Deno.test("POST with non-finite lat returns 400", async () => {
  const res = await handler(req("POST", { lat: "not-a-number", lng: 23.7 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "finite");
});

Deno.test("POST with out-of-range lat returns 400", async () => {
  const res = await handler(req("POST", { lat: 123.4, lng: 23.7 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "lat");
});

Deno.test("POST with out-of-range lng returns 400", async () => {
  const res = await handler(req("POST", { lat: 37.9, lng: 999 }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertStringIncludes(body.error, "lng");
});

Deno.test("POST with NaN lat returns 400", async () => {
  const res = await handler(req("POST", { lat: NaN, lng: 23.7 }));
  // NaN serializes to null in JSON.stringify -> hits the required-field check.
  assertEquals(res.status, 400);
});

Deno.test("POST clamps oversized radius_km and limit before forwarding upstream", async () => {
  const origFetch = globalThis.fetch;
  const forwarded: { body: Record<string, unknown> | null } = { body: null };
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("os.maiprop.co") || url.includes("/sales/filter/coordinates")) {
      try {
        forwarded.body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      } catch {
        forwarded.body = null;
      }
      return Promise.resolve(
        new Response(JSON.stringify({ data: [] }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return origFetch(input as Request, init);
  };
  try {
    const res = await handler(
      req("POST", { lat: 37.9, lng: 23.7, radius_km: 99999, limit: 99999 }),
    );
    assertEquals(res.status, 200);
    // Server-side caps must be applied to the upstream request body so a
    // caller cannot bulk-enumerate the OS dataset by sending huge inputs.
    assertEquals(forwarded.body?.radius_km, 5);
    assertEquals(forwarded.body?.limit, 50);
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("POST with JSON null body returns 400 (not a 500)", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "null",
  });
  const res = await handler(r);
  assertEquals(res.status, 400);
});

Deno.test("POST with JSON array body returns 400", async () => {
  const res = await handler(req("POST", [1, 2, 3] as unknown as Record<string, unknown>));
  assertEquals(res.status, 400);
});

// ── Hardening: response field allowlist ──────────────────────────────────────

Deno.test("upstream HTTP 200 with unparseable JSON body returns 503", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("os.maiprop.co") || url.includes("/sales/filter/coordinates")) {
      // HTTP 200, but the body is not JSON — the proxy must surface this as
      // 503 so clients can show an error/retry state instead of an empty list.
      return Promise.resolve(
        new Response("<html>oops</html>", {
          status: 200,
          headers: { "Content-Type": "text/html" },
        }),
      );
    }
    return origFetch(input as Request, init);
  };
  try {
    const res = await handler(req("POST", { lat: 37.9, lng: 23.7 }));
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.available, false);
    assertEquals(body.reason, "upstream_unavailable");
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("upstream rows missing lat/lng/sale_price are dropped, not zero-filled", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("os.maiprop.co") || url.includes("/sales/filter/coordinates")) {
      const body = JSON.stringify({
        data: [
          // Valid row — should be kept.
          {
            id: "good-1",
            address: "OK Street",
            lat: 37.9,
            lng: 23.7,
            sale_price: 100000,
            asking_price: 110000,
          },
          // Missing lat — must be dropped (not zero-filled).
          { id: "bad-no-lat", lng: 23.7, sale_price: 1, asking_price: 1 },
          // Missing sale_price — must be dropped.
          { id: "bad-no-price", lat: 37.9, lng: 23.7, asking_price: 1 },
          // lat out of range — must be dropped.
          { id: "bad-lat-range", lat: 999, lng: 23.7, sale_price: 1, asking_price: 1 },
          // Non-finite price — must be dropped.
          {
            id: "bad-price-inf",
            lat: 37.9,
            lng: 23.7,
            sale_price: "not-a-number",
            asking_price: 1,
          },
        ],
      });
      return Promise.resolve(
        new Response(body, {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }),
      );
    }
    return origFetch(input as Request, init);
  };
  try {
    const res = await handler(req("POST", { lat: 37.9, lng: 23.7 }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Array.isArray(body.data), true);
    assertEquals(body.data.length, 1);
    assertEquals(body.data[0].id, "good-1");
  } finally {
    globalThis.fetch = origFetch;
  }
});

Deno.test("response strips fields outside the SaleRecord allowlist", async () => {
  const origFetch = globalThis.fetch;
  globalThis.fetch = (input: string | URL | Request, init?: RequestInit) => {
    const url = typeof input === "string" ? input : (input as Request).url ?? String(input);
    if (url.includes("os.maiprop.co") || url.includes("/sales/filter/coordinates")) {
      const body = JSON.stringify({
        data: [
          {
            id: "abc-123",
            address: "1 Public Street",
            lat: 37.9,
            lng: 23.7,
            sale_price: 100000,
            asking_price: 110000,
            sale_date: "2025-01-01",
            property_type: "apartment",
            sqm: 80,
            bedrooms: 2,
            status: "sold",
            discount_pct: 9,
            source: "court_auction",
            round: 1,
            // Fields that must be stripped:
            owner_name: "Jane Doe",
            owner_phone: "+30 6900000000",
            internal_notes: "secret",
            raw_url: "http://os.internal/abc-123",
          },
        ],
      });
      return Promise.resolve(
        new Response(body, { status: 200, headers: { "Content-Type": "application/json" } }),
      );
    }
    return origFetch(input as Request, init);
  };
  try {
    const res = await handler(req("POST", { lat: 37.9, lng: 23.7 }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(Array.isArray(body.data), true);
    assertEquals(body.data.length, 1);
    const sale = body.data[0];
    assertEquals(sale.id, "abc-123");
    assertEquals(sale.address, "1 Public Street");
    // Disallowed fields must not be present in the public response.
    assertEquals("owner_name" in sale, false);
    assertEquals("owner_phone" in sale, false);
    assertEquals("internal_notes" in sale, false);
    assertEquals("raw_url" in sale, false);
  } finally {
    globalThis.fetch = origFetch;
  }
});

restore();
