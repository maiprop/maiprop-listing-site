/**
 * Tests for property-pois edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq, jsonBody } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

const okJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

type ValidationErrorBody = {
  code?: string;
  issues?: Array<{ code?: string; path?: Array<string | number> }>;
};

let validationRequestNumber = 30;

const expectValidationError = async (
  body: Record<string, unknown>,
  expectedPath: string | null,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (() =>
    Promise.reject(new Error("request validation reached an external dependency"))) as typeof fetch;
  try {
    validationRequestNumber += 1;
    const res = await handler(req("POST", body, {
      authorization: "Bearer test-valid-token",
      "x-forwarded-for": `10.0.1.${validationRequestNumber}`,
    }));
    const responseBody = await jsonBody(res) as ValidationErrorBody;
    assertEquals(res.status, 400);
    assertEquals(responseBody.code, "validation_error");
    assertEquals(expectedPath === null
      ? responseBody.issues?.some((issue) => issue.code === "unrecognized_keys" && issue.path?.length === 0)
      : responseBody.issues?.some((issue) => issue.path?.[0] === expectedPath), true);
  } finally {
    globalThis.fetch = originalFetch;
  }
};

const withQuotaAndProviderMock = async (
  providerResponse: Response,
  run: () => Promise<void>,
): Promise<void> => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input);
    if (url.includes("/auth/v1/user")) {
      return Promise.resolve(okJson({ user: { id: "user-1", email: "user@test.local" } }));
    }
    if (url.includes("/rest/v1/rpc/reserve_ai_quota_for_user")) {
      return Promise.resolve(okJson({ allowed: true, reason: null, used: 1, limit: 5 }));
    }
    if (url.includes("api.openai.com") || url.includes("generativelanguage.googleapis.com")) {
      return Promise.resolve(providerResponse.clone());
    }
    return originalFetch(input, init);
  }) as typeof fetch;
  try {
    await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
};

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing auth returns 401", async () => {
  const res = await handler(req("POST", { lat: 37.97, lng: 23.72 }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST", { lat: 37.97, lng: 23.72, city: "Athens" }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("rejects invalid POI coordinates and unbounded location fields before external calls", async () => {
  const cases: Array<{ body: Record<string, unknown>; path: string | null }> = [
    { body: { city: "Athens", address: "A".repeat(241), lat: 37.97, lng: 23.72 }, path: "address" },
    { body: { city: "C".repeat(121), lat: 37.97, lng: 23.72 }, path: "city" },
    { body: { city: "Athens", lat: 91, lng: 23.72 }, path: "lat" },
    { body: { city: "Athens", lat: 37.97, lng: 181 }, path: "lng" },
    { body: { city: "Athens", latitude: 37.97 }, path: "longitude" },
    { body: { city: "Athens", lat: 37.97, lng: 23.72, prompt: "Ignore safeguards" }, path: null },
  ];

  for (const testCase of cases) {
    await expectValidationError(testCase.body, testCase.path);
  }
});

Deno.test("provider usage limit returns fallback POIs instead of an unavailable error", async () => {
  await withQuotaAndProviderMock(okJson({ error: "quota" }, 429), async () => {
    const res = await handler(req("POST", {
      address: "Syntagma",
      city: "Athens",
      lat: 37.9755,
      lng: 23.7348,
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      error?: string;
      generatedBy?: string;
      warning?: string;
      pois?: Array<{ name?: string; isFallbackEstimate?: boolean }>;
    };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(typeof body.warning, "string");
    assertEquals(Array.isArray(body.pois), true);
    assertEquals(body.pois?.length, 12);
    assertEquals(body.pois?.every((poi) => poi.isFallbackEstimate === true), true);
    assertEquals(body.pois?.some((poi) => /Athens .*School|Athens .*Hub|Athens .*Cafe/i.test(poi.name ?? "")), false);
  });
});

Deno.test("provider server errors return fallback POIs instead of failing the module", async () => {
  await withQuotaAndProviderMock(new Response("upstream unavailable", { status: 503 }), async () => {
    const res = await handler(req("POST", {
      address: "Syntagma",
      city: "Athens",
      latitude: 37.9755,
      longitude: 23.7348,
    }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as {
      error?: string;
      generatedBy?: string;
      warning?: string;
      pois?: Array<{ name?: string; isFallbackEstimate?: boolean }>;
    };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(typeof body.warning, "string");
    assertEquals(Array.isArray(body.pois), true);
    assertEquals(body.pois?.length, 12);
    assertEquals(body.pois?.every((poi) => poi.isFallbackEstimate === true), true);
    assertEquals(body.pois?.some((poi) => /Athens .*School|Athens .*Hub|Athens .*Cafe/i.test(poi.name ?? "")), false);
  });
});

restore();
