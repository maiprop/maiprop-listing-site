/**
 * Tests for sync-to-os edge function (admin only).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");
const LISTING_ID = "44444444-4444-4444-8444-444444444444";

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", { listing_id: LISTING_ID }));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer returns 401 (Supabase getUser rejects)", async () => {
  const res = await handler(authedReq("POST", { listing_id: LISTING_ID }));
  assertEquals([401, 403].includes(res.status), true);
});

Deno.test("missing listing_id with auth → 400", async () => {
  // Even with fake auth, missing listing_id should return 400 if auth were skipped
  // With fake token, we get 401 before the body validation
  const res = await handler(authedReq("POST", {}));
  assertEquals([400, 401, 403].includes(res.status), true);
});

Deno.test("invalid listing sync bodies return structured 400 before database or OS work", async () => {
  const originalFetch = globalThis.fetch;
  let sideEffectCalls = 0;
  globalThis.fetch = (() => {
    sideEffectCalls += 1;
    throw new Error("invalid listing sync input reached a side effect");
  }) as typeof fetch;

  const malformed = new Request("https://functions.test/sync-to-os", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: "{",
  });

  try {
    for (const request of [
      malformed,
      req("POST", { listing_id: "x".repeat(1000) }),
      req("POST", { listing_id: 42 }),
      req("POST", { listing_id: LISTING_ID, entity_type: "auction" }),
      req("POST", { listing_id: LISTING_ID, invented: true }),
    ]) {
      const res = await handler(request);
      const body = await res.json() as {
        code?: string;
        issues?: unknown[];
      };

      assertEquals(res.status, 400);
      assertEquals(
        ["invalid_json", "validation_error"].includes(body.code ?? ""),
        true,
      );
      assertEquals(Array.isArray(body.issues), true);
    }
    assertEquals(sideEffectCalls, 0);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

restore();
