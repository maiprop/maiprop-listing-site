/**
 * Tests for neighbourhood-report edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq, jsonBody } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

const okJson = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

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
  const res = await handler(req("POST", { city: "Athens", address: "Kolonaki" }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 from Supabase auth (not 500)", async () => {
  const res = await handler(authedReq("POST", { city: "Athens" }));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("provider usage limit returns fallback neighbourhood report", async () => {
  await withQuotaAndProviderMock(okJson({ error: "quota" }, 429), async () => {
    const res = await handler(req("POST", { city: "Athens", address: "Syntagma" }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as { error?: string; generatedBy?: string; areaName?: string };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.areaName, "Syntagma");
  });
});

Deno.test("provider server errors return fallback neighbourhood report", async () => {
  await withQuotaAndProviderMock(new Response("upstream unavailable", { status: 503 }), async () => {
    const res = await handler(req("POST", { city: "Athens", address: "Syntagma" }, { authorization: "Bearer test-valid-token" }));
    const body = await jsonBody(res) as { error?: string; generatedBy?: string; areaName?: string };
    assertEquals(res.status, 200);
    assertEquals(typeof body.error, "undefined");
    assertEquals(body.generatedBy, "fallback");
    assertEquals(body.areaName, "Syntagma");
  });
});

restore();
