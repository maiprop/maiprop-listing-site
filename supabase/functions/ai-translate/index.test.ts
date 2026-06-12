/**
 * Tests for ai-translate edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
  },
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("static locale (en) returns passthrough without AI call", async () => {
  const res = await handler(req("POST", {
    locale: "en",
    strings: { "nav.home": "Home", "nav.listings": "Listings" },
  }));
  // en is a static locale — returns 200 with original strings
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.locale, "en");
  assertEquals(body.strings["nav.home"], "Home");
});

Deno.test("static locale (el) returns passthrough", async () => {
  const res = await handler(req("POST", {
    locale: "el",
    strings: { "nav.home": "Αρχική" },
  }));
  assertEquals(res.status, 200);
  const body = await res.json();
  assertEquals(body.locale, "el");
});

Deno.test("missing locale returns 400", async () => {
  const res = await handler(req("POST", { strings: { "key": "value" } }));
  assertEquals([400, 500].includes(res.status), true);
});

Deno.test("missing strings returns 400", async () => {
  const res = await handler(req("POST", { locale: "fr" }));
  assertEquals([400, 500].includes(res.status), true);
});

Deno.test("non-static locale requires auth before AI call", async () => {
  const res = await handler(req("POST", {
    locale: "fr",
    strings: { "nav.home": "Home" },
  }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "Authentication required for AI translation");
});

Deno.test("oversized translations do not reserve quota or call provider", async () => {
  const originalFetch = globalThis.fetch;
  let authCalls = 0;
  let quotaCalls = 0;
  let providerCalls = 0;
  const strings = Object.fromEntries(
    Array.from({ length: 501 }, (_, i) => [`key.${i}`, "value"]),
  );

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      authCalls += 1;
      return Promise.resolve(new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) quotaCalls += 1;
    if (url.includes("generativelanguage.googleapis.com") || url.includes("api.openai.com")) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings,
    }, { authorization: "Bearer valid-user-token" }));
    assertEquals(res.status, 413);
    assertEquals(authCalls, 1);
    assertEquals(quotaCalls, 0);
    assertEquals(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("provider misconfiguration does not reserve quota", async () => {
  const originalFetch = globalThis.fetch;
  let quotaCalls = 0;
  Deno.env.delete("OPENAI_API_KEY");
  Deno.env.delete("GEMINI_API_KEY");

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.includes("/rpc/reserve_ai_quota_for_user")) quotaCalls += 1;
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer valid-user-token" }));
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.error, "Translation service not configured");
    assertEquals(quotaCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("OPENAI_API_KEY", "placeholder-openai");
  }
});

Deno.test("unknown origin falls back to production CORS origin", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "OPTIONS",
    headers: { origin: "https://hacker.io" },
  });
  const res = await handler(r);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("translation parse failures do not expose raw model output", async () => {
  const originalFetch = globalThis.fetch;
  const fetchMock = (input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.includes("generativelanguage.googleapis.com") || url.includes("api.openai.com")) {
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: "not-json-response-fragment" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  };
  globalThis.fetch = fetchMock as typeof fetch;
  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer test-valid-token" }));
    assertEquals(res.status, 502);
    const body = await res.json();
    assertEquals(body.error, "Translation parsing failed");
    assert(!("raw" in body));
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("non-static locale fails closed before provider call when quota service is unavailable", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(new Response(JSON.stringify({ user: { id: "user-1" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.includes("generativelanguage.googleapis.com") || url.includes("api.openai.com")) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer valid-user-token" }));
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(body.error, "AI quota service unavailable. Please retry shortly.");
    assertEquals(providerCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
    Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "placeholder-supabase-service-role");
  }
});

Deno.test("non-static locale with quota reservation reaches provider", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  let providerModel = "";

  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(new Response(JSON.stringify({ user: { id: "test-user-id" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    if (url.includes("generativelanguage.googleapis.com") || url.includes("api.openai.com")) {
      providerCalls += 1;
      providerModel = String(JSON.parse(String(init?.body ?? "{}")).model ?? "");
      return Promise.resolve(new Response(JSON.stringify({
        choices: [{ message: { content: "{\"nav.home\":\"Accueil\"}" } }],
      }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }));
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    const res = await handler(req("POST", {
      locale: "fr",
      strings: { "nav.home": "Home" },
    }, { authorization: "Bearer test-valid-token" }));
    assertEquals(res.status, 200);
    const body = await res.json();
    assertEquals(body.strings["nav.home"], "Accueil");
    assertEquals(providerCalls, 1);
    assertEquals(providerModel, "gpt-5.4-mini");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
