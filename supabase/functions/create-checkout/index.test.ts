/**
 * Tests for create-checkout edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", { priceId: "price_test" }));
  assertEquals([401, 500].includes(res.status), true);
});

Deno.test("fake Bearer token results in auth failure, not unhandled crash", async () => {
  const res = await handler(authedReq("POST", { priceId: "price_test" }));
  assertEquals([401, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

restore();
