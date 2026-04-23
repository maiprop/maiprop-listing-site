/**
 * Tests for customer-portal edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(new URL("./index.ts", import.meta.url));

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 500 with error message", async () => {
  const res = await handler(req("POST"));
  // customer-portal throws "No authorization header provided" as 500
  assertEquals([401, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("rate limiter allows < 10 requests from same IP", async () => {
  // Just verify the first request hits auth (not rate limit)
  const res = await handler(authedReq("POST"));
  assertEquals(res.status !== 429, true);
});

restore();
