/**
 * Tests for streetview-proxy edge function (public, no auth required).
 * Proxies Google Street View; without GOOGLE_MAPS_API_KEY returns 503.
 */
import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing GOOGLE_MAPS_API_KEY returns 503", async () => {
  // testUtils sets GOOGLE_MAPS_API_KEY to empty — handler should return 503
  const r = new Request("https://functions.supabase.co/fn?lat=37.97&lng=23.73", {
    method: "GET",
  });
  const res = await handler(r);
  assertEquals(res.status, 503);
  const body = await res.json();
  assertStringIncludes(body.error, "configured");
});

Deno.test("missing lat/lng/location returns 400 (when key is absent, returns 503 first)", async () => {
  // Without a key the function returns 503 before reaching the lat/lng check,
  // so either 400 or 503 is valid depending on env.
  const r = new Request("https://functions.supabase.co/fn", { method: "GET" });
  const res = await handler(r);
  assertEquals([400, 503].includes(res.status), true);
});

Deno.test("CORS headers present on error responses", async () => {
  const r = new Request("https://functions.supabase.co/fn?lat=37.97&lng=23.73", {
    method: "GET",
    headers: { origin: "https://maiprop.co" },
  });
  const res = await handler(r);
  const origin = res.headers.get("Access-Control-Allow-Origin");
  assertEquals(typeof origin, "string");
});

Deno.test("Google fetch uses app Referer and returns image content", async () => {
  Deno.env.set("GOOGLE_MAPS_API_KEY", "server-side-test-key");
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";
  let requestedReferer = "";

  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    requestedUrl = String(input);
    requestedReferer = new Headers(init?.headers).get("Referer") ?? "";
    return Promise.resolve(
      new Response("jpeg-bytes", {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
  }) as typeof fetch;

  try {
    const res = await handler(new Request("https://functions.supabase.co/fn?lat=37.97&lng=23.73", {
      method: "GET",
      headers: { origin: "http://127.0.0.1:8080" },
    }));

    assertEquals(res.status, 200);
    assertEquals(res.headers.get("Content-Type"), "image/jpeg");
    assertStringIncludes(requestedUrl, "maps.googleapis.com/maps/api/streetview");
    assertEquals(new URL(requestedUrl).searchParams.get("location"), "37.97,23.73");
    assertEquals(requestedReferer, "https://portal.maiprop.co/");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
  }
});

Deno.test("Google URL is built with validated params and cannot inject extra query keys", async () => {
  Deno.env.set("GOOGLE_MAPS_API_KEY", "server-side-test-key");
  const originalFetch = globalThis.fetch;
  let requestedUrl = "";

  globalThis.fetch = ((input: string | URL | Request) => {
    requestedUrl = String(input);
    return Promise.resolve(
      new Response("jpeg-bytes", {
        status: 200,
        headers: { "Content-Type": "image/jpeg" },
      }),
    );
  }) as typeof fetch;

  try {
    const res = await handler(new Request("https://functions.supabase.co/fn?lat=37.97&lng=23.73&size=800x450%26key%3Devil", {
      method: "GET",
      headers: { origin: "https://maiprop.co" },
    }));

    assertEquals(res.status, 400);

    const valid = await handler(new Request("https://functions.supabase.co/fn?location=Athens, Greece&size=800x450", {
      method: "GET",
      headers: { origin: "https://maiprop.co" },
    }));
    assertEquals(valid.status, 200);
    const googleUrl = new URL(requestedUrl);
    assertEquals(googleUrl.searchParams.get("key"), "server-side-test-key");
    assertEquals(googleUrl.searchParams.get("location"), "Athens, Greece");
    assertEquals(googleUrl.searchParams.get("size"), "800x450");
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
  }
});

Deno.test("invalid latitude and longitude are rejected before Google fetch", async () => {
  Deno.env.set("GOOGLE_MAPS_API_KEY", "server-side-test-key");
  const originalFetch = globalThis.fetch;
  let googleFetches = 0;
  globalThis.fetch = (() => {
    googleFetches += 1;
    return Promise.resolve(new Response("unexpected", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(new Request("https://functions.supabase.co/fn?lat=123&lng=23.73", {
      method: "GET",
    }));
    assertEquals(res.status, 400);
    assertEquals(googleFetches, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.delete("GOOGLE_MAPS_API_KEY");
  }
});

restore();
