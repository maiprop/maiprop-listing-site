/**
 * Tests for smart-filters edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const moduleUrl = new URL("./index.ts", import.meta.url).href;
const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const { parseSmartFilterArgs } = await import(moduleUrl);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { type: "apartment", listing_type: "sale" }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST", { type: "house" }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("parseSmartFilterArgs accepts Gemini/OpenAI text JSON responses", () => {
  const parsed = parseSmartFilterArgs("Here is the JSON:\n```json\n{\"sections\":[\"size\",\"bedrooms\"],\"featureKeys\":[\"has_parking\"],\"sizeLabel\":\"Home Area\",\"priceLabel\":\"Asking Price\",\"bedsLabel\":\"Bedrooms\",\"featuresLabel\":\"Amenities\"}\n```");
  assertEquals(parsed.sections, ["size", "bedrooms"]);
  assertEquals(parsed.featureKeys, ["has_parking"]);
  assertEquals(parsed.priceLabel, "Asking Price");
});

Deno.test("accepts legacy commercial office and other subtype combinations", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalls += 1;
    }
    const content = JSON.stringify({
      sections: ["size", "commercial_details"],
      featureKeys: ["has_facade"],
      sizeLabel: "Usable Area",
      priceLabel: "Asking Price",
      bedsLabel: null,
      featuresLabel: "Commercial Features",
    });
    return Promise.resolve(new Response(JSON.stringify({
      choices: [{ message: { content } }],
      candidates: [{ content: { parts: [{ text: content }] } }],
    }), { status: 200, headers: { "Content-Type": "application/json" } }));
  }) as typeof fetch;

  try {
    for (const subtype of ["office", "other"]) {
      const res = await handler(req("POST", {
        type: "commercial",
        subtype,
        listing_type: "sale",
      }, { authorization: "Bearer test-valid-token" }));
      assertEquals(res.status, 200, subtype);
    }
    assertEquals(providerCalls, 2);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("rejects property subtype combinations outside the canonical mapping before provider calls", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    for (const body of [
      { type: "land", subtype: "studio", listing_type: "sale" },
      { type: "office", subtype: "shop", listing_type: "rent" },
      { type: "studio", subtype: "studio", listing_type: "sale" },
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

Deno.test("rejects unknown filter domains and extra fields before calling the AI provider", async () => {
  const originalFetch = globalThis.fetch;
  let providerCalls = 0;
  globalThis.fetch = ((input: RequestInfo | URL): Promise<Response> => {
    const url = String(input);
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      providerCalls += 1;
    }
    return Promise.resolve(new Response("{}", { status: 200 }));
  }) as typeof fetch;

  try {
    for (const body of [
      { type: "castle", subtype: null, listing_type: "sale" },
      { type: "apartment", subtype: "unsupported-subtype", listing_type: "sale" },
      { type: "apartment", subtype: "studio", listing_type: "lease" },
      { type: "apartment", subtype: null, listing_type: "sale", unexpected: true },
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
