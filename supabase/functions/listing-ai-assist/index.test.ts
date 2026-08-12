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

Deno.test("accepts every canonical property type", async () => {
  const originalFetch = globalThis.fetch;
  const originalOpenAiKey = Deno.env.get("OPENAI_API_KEY");
  let providerCalls = 0;
  Deno.env.set("OPENAI_API_KEY", "placeholder-openai");
  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content: "Property description" } }],
      candidates: [{ content: { parts: [{ text: "Property description" }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    for (const propertyType of [
      "apartment",
      "house",
      "villa",
      "land",
      "commercial",
      "office",
      "studio",
      "maisonette",
      "warehouse",
      "hotel",
      "mixed_use",
      "parking",
      "storage",
    ]) {
      const res = await handler(req("POST", {
        type: "description",
        property: {
          property_type: propertyType,
          listing_type: "sale",
          city: "Athens",
          sqm: 85,
        },
      }, { authorization: "Bearer test-valid-token" }));
      assertEquals(res.status, 200, propertyType);
    }
    assertEquals(providerCalls, 13);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalOpenAiKey) Deno.env.set("OPENAI_API_KEY", originalOpenAiKey);
    else Deno.env.delete("OPENAI_API_KEY");
  }
});

Deno.test("rejects invalid listing assistance payloads before calling the AI provider", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  const property = {
    property_type: "apartment",
    listing_type: "sale",
    city: "Athens",
    sqm: "85",
  };

  try {
    for (const body of [
      { type: "ping", unexpected: true },
      { type: "description", property: { ...property, property_type: "castle" } },
      { type: "price", property: { ...property, sqm: "Infinity" } },
      { type: "description", property: { ...property, city: "x".repeat(121) } },
      {
        type: "description",
        property: { ...property, features: Array.from({ length: 25 }, (_, i) => `feature-${i}`) },
      },
      { type: "description", property: { ...property, unexpected: true } },
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
