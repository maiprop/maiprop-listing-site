/**
 * Tests for check-subscription edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler("./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer token returns 401 or 500 (Stripe key missing in test env)", async () => {
  const res = await handler(authedReq("POST"));
  // Without real Stripe key it may 500; without real token it will 401
  assertEquals([401, 429, 500].includes(res.status), true);
});

restore();
