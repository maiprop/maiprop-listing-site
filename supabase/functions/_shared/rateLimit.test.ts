/**
 * Deno unit tests for the in-memory rate limiter.
 * Run: deno test supabase/functions/_shared/rateLimit.test.ts
 */
import { assertEquals, assertStrictEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "./rateLimit.ts";

Deno.test("allows requests below the limit", () => {
  const limiter = makeRateLimiter({ maxRequests: 3, windowMs: 60_000 });
  assertStrictEquals(limiter.isLimited("user-1"), false);
  assertStrictEquals(limiter.isLimited("user-1"), false);
  assertStrictEquals(limiter.isLimited("user-1"), false);
});

Deno.test("blocks the request that exceeds the limit", () => {
  const limiter = makeRateLimiter({ maxRequests: 2, windowMs: 60_000 });
  limiter.isLimited("user-2");
  limiter.isLimited("user-2");
  assertStrictEquals(limiter.isLimited("user-2"), true);
});

Deno.test("tracks different keys independently", () => {
  const limiter = makeRateLimiter({ maxRequests: 1, windowMs: 60_000 });
  assertStrictEquals(limiter.isLimited("a"), false); // a: 1/1 used
  assertStrictEquals(limiter.isLimited("a"), true);  // a: blocked
  assertStrictEquals(limiter.isLimited("b"), false); // b: fresh window
});

Deno.test("resets after the window expires", async () => {
  const limiter = makeRateLimiter({ maxRequests: 1, windowMs: 10 });
  limiter.isLimited("user-3");
  assertStrictEquals(limiter.isLimited("user-3"), true); // blocked

  await new Promise(resolve => setTimeout(resolve, 20)); // wait for window to expire
  assertStrictEquals(limiter.isLimited("user-3"), false); // new window
});

Deno.test("status() returns correct remaining count", () => {
  const limiter = makeRateLimiter({ maxRequests: 5, windowMs: 60_000 });
  limiter.isLimited("user-4");
  limiter.isLimited("user-4");
  const { remaining } = limiter.status("user-4");
  assertEquals(remaining, 3);
});

Deno.test("status() returns 0 when limit exceeded", () => {
  const limiter = makeRateLimiter({ maxRequests: 1, windowMs: 60_000 });
  limiter.isLimited("user-5");
  limiter.isLimited("user-5"); // would be blocked but status just reads
  const { remaining } = limiter.status("user-5");
  assertEquals(remaining, 0);
});

Deno.test("tooManyRequestsResponse returns 429 with Retry-After header", async () => {
  const corsHeaders = { "Access-Control-Allow-Origin": "*" };
  const resp = tooManyRequestsResponse(corsHeaders);
  assertStrictEquals(resp.status, 429);
  assertStrictEquals(resp.headers.get("Retry-After"), "60");
  assertStrictEquals(resp.headers.get("Access-Control-Allow-Origin"), "*");
  const body = await resp.json();
  assertEquals(typeof body.error, "string");
});
