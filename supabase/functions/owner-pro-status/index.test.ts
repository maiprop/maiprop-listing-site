/**
 * Tests for owner-pro-status edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
  },
);

Deno.test("OPTIONS preflight returns CORS headers", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("anonymous direct invoke is rejected before owner status lookup", async () => {
  const res = await handler(req("POST", { listingId: "11111111-1111-4111-8111-111111111111" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(body.error, "No authorization header");
});

Deno.test("fake bearer token returns auth failure, not owner status", async () => {
  const res = await handler(authedReq("POST", { listingId: "11111111-1111-4111-8111-111111111111" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("GET does not expose owner status", async () => {
  const res = await handler(authedReq("GET"));
  assertEquals(res.status, 405);
});

restore();
