/**
 * Deno unit tests for the shared auth helper.
 * Run: deno test supabase/functions/_shared/auth.test.ts
 *
 * NOTE: verifyBearerToken's happy-path requires a live Supabase client and cannot
 * be tested without network access.  We test:
 *   1. AuthError class shape (pure constructor, no I/O)
 *   2. The two early-throw branches in verifyBearerToken — no auth header, and
 *      empty token — using a minimal stub that is never actually called.
 */
import { assertEquals, assertStrictEquals, assertRejects } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { AuthError, verifyBearerToken } from "./auth.ts";

// Minimal stub — getUser should never be reached in these tests
const stubSupabase = {} as Parameters<typeof verifyBearerToken>[1];

// ── AuthError ─────────────────────────────────────────────────────────────────

Deno.test("AuthError: default status is 401", () => {
  const err = new AuthError("test");
  assertStrictEquals(err.status, 401);
  assertStrictEquals(err.message, "test");
  assertStrictEquals(err.name, "AuthError");
});

Deno.test("AuthError: custom status is preserved", () => {
  const err = new AuthError("forbidden", 403);
  assertStrictEquals(err.status, 403);
});

Deno.test("AuthError: is an instance of Error", () => {
  const err = new AuthError("oops");
  assertEquals(err instanceof Error, true);
  assertEquals(err instanceof AuthError, true);
});

// ── verifyBearerToken — early-throw paths (no Supabase call) ─────────────────

Deno.test("verifyBearerToken: throws AuthError when Authorization header is missing", async () => {
  const req = new Request("https://maiprop.co/api", { method: "POST" });
  await assertRejects(
    () => verifyBearerToken(req, stubSupabase),
    AuthError,
    "No authorization header",
  );
});

Deno.test("verifyBearerToken: throws AuthError when bearer token is empty string", async () => {
  const req = new Request("https://maiprop.co/api", {
    method: "POST",
    headers: { Authorization: "Bearer " },
  });
  await assertRejects(
    () => verifyBearerToken(req, stubSupabase),
    AuthError,
    "Empty bearer token",
  );
});

Deno.test("verifyBearerToken: throws AuthError (not generic Error) for missing header", async () => {
  const req = new Request("https://maiprop.co/api");
  let thrown: unknown;
  try {
    await verifyBearerToken(req, stubSupabase);
  } catch (e) {
    thrown = e;
  }
  assertEquals(thrown instanceof AuthError, true);
  assertStrictEquals((thrown as AuthError).status, 401);
});
