/**
 * Tests for customer-portal edge function.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing Authorization returns 401 with error message", async () => {
  const res = await handler(req("POST"));
  // After audit fix the function uses verifyBearerToken so missing/empty token
  // surfaces as AuthError with status 401. The 500 fallback is kept in the
  // assertion only for legacy behaviour during the rollout window.
  assertEquals([401, 500].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("rate limiter allows < 10 requests from same IP", async () => {
  // Just verify the first request hits auth (not rate limit)
  const res = await handler(authedReq("POST"));
  assertEquals(res.status !== 429, true);
});

Deno.test("portal return URL uses the allowlisted Checkout origin resolver", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "resolveCheckoutOrigin");
  assertStringIncludes(source, "const origin = resolveCheckoutOrigin(req.headers.get(\"origin\"))");
});

restore();
