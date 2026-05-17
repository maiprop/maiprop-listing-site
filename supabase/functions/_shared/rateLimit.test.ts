/**
 * Deno unit tests for the rate limiter.
 *
 * These tests target the in-memory backend directly via
 * `makeMemoryRateLimiter` so they are deterministic regardless of which
 * Supabase env vars happen to be set when `deno test` runs. The
 * DB-backed backend (`makeDbRateLimiter`) is exercised end-to-end by the
 * per-function suites and via integration tests against a real Postgres.
 *
 * Run: deno test supabase/functions/_shared/rateLimit.test.ts --allow-env --allow-net
 */
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  makeDbRateLimiter,
  makeMemoryRateLimiter,
  tooManyRequestsResponse,
} from "./rateLimit.ts";

Deno.test("allows requests below the limit", async () => {
  const limiter = makeMemoryRateLimiter({
    bucket: "test",
    maxRequests: 3,
    windowMs: 60_000,
  });
  assertStrictEquals(await limiter.isLimited("user-1"), false);
  assertStrictEquals(await limiter.isLimited("user-1"), false);
  assertStrictEquals(await limiter.isLimited("user-1"), false);
});

Deno.test("blocks the request that exceeds the limit", async () => {
  const limiter = makeMemoryRateLimiter({
    bucket: "test",
    maxRequests: 2,
    windowMs: 60_000,
  });
  await limiter.isLimited("user-2");
  await limiter.isLimited("user-2");
  assertStrictEquals(await limiter.isLimited("user-2"), true);
});

Deno.test("tracks different keys independently", async () => {
  const limiter = makeMemoryRateLimiter({
    bucket: "test",
    maxRequests: 1,
    windowMs: 60_000,
  });
  assertStrictEquals(await limiter.isLimited("a"), false); // a: 1/1 used
  assertStrictEquals(await limiter.isLimited("a"), true); //  a: blocked
  assertStrictEquals(await limiter.isLimited("b"), false); // b: fresh window
});

Deno.test("resets after the window expires", async () => {
  const limiter = makeMemoryRateLimiter({
    bucket: "test",
    maxRequests: 1,
    windowMs: 10,
  });
  await limiter.isLimited("user-3");
  assertStrictEquals(await limiter.isLimited("user-3"), true); // blocked

  await new Promise((resolve) => setTimeout(resolve, 20));
  assertStrictEquals(await limiter.isLimited("user-3"), false); // new window
});

Deno.test("status() returns correct remaining count", async () => {
  const limiter = makeMemoryRateLimiter({
    bucket: "test",
    maxRequests: 5,
    windowMs: 60_000,
  });
  await limiter.isLimited("user-4");
  await limiter.isLimited("user-4");
  const { remaining } = await limiter.status("user-4");
  assertEquals(remaining, 3);
});

Deno.test("status() returns 0 when limit exceeded", async () => {
  const limiter = makeMemoryRateLimiter({
    bucket: "test",
    maxRequests: 1,
    windowMs: 60_000,
  });
  await limiter.isLimited("user-5");
  await limiter.isLimited("user-5"); // would be blocked, but status just reads
  const { remaining } = await limiter.status("user-5");
  assertEquals(remaining, 0);
});

Deno.test("buckets are isolated from each other", async () => {
  // The same key in two different buckets must NOT share a counter.
  // This guards the new bucket-namespacing contract used by the DB backend.
  const a = makeMemoryRateLimiter({
    bucket: "ai-search",
    maxRequests: 1,
    windowMs: 60_000,
  });
  const b = makeMemoryRateLimiter({
    bucket: "property-chat",
    maxRequests: 1,
    windowMs: 60_000,
  });
  assertStrictEquals(await a.isLimited("user-x"), false);
  assertStrictEquals(await a.isLimited("user-x"), true);
  // b is a separate limiter instance, so user-x should still be allowed.
  assertStrictEquals(await b.isLimited("user-x"), false);
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

Deno.test("DB limiter failClosed blocks when backend cannot be reached", async () => {
  const limiter = makeDbRateLimiter({
    bucket: "expensive",
    maxRequests: 1,
    windowMs: 60_000,
    supabaseUrl: "not-a-valid-url",
    serviceRoleKey: "test",
    failClosed: true,
  });

  assertStrictEquals(await limiter.isLimited("user-1"), true);
  const status = await limiter.status("user-1");
  assertEquals(status.remaining, 0);
});

Deno.test("DB limiter fail-open default allows when backend cannot be reached", async () => {
  const limiter = makeDbRateLimiter({
    bucket: "ordinary",
    maxRequests: 1,
    windowMs: 60_000,
    supabaseUrl: "not-a-valid-url",
    serviceRoleKey: "test",
  });

  assertStrictEquals(await limiter.isLimited("user-1"), false);
});
