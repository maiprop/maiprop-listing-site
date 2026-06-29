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
import {
  assertEquals,
  assertRejects,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
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

Deno.test("verifyBearerToken: times out when auth service never answers", async () => {
  const previousTimeout = Deno.env.get("AUTH_VERIFY_TIMEOUT_MS");
  Deno.env.set("AUTH_VERIFY_TIMEOUT_MS", "10");
  const req = new Request("https://maiprop.co/api", {
    headers: { Authorization: "Bearer test-token" },
  });
  const hangingSupabase = {
    auth: {
      getUser: () => new Promise(() => {}),
    },
  } as Parameters<typeof verifyBearerToken>[1];
  let guardTimer: ReturnType<typeof setTimeout> | null = null;

  try {
    const result = await Promise.race([
      verifyBearerToken(req, hangingSupabase).catch((error) => error),
      new Promise((resolve) => {
        guardTimer = setTimeout(() => resolve("hung"), 100);
      }),
    ]);
    if (guardTimer !== null) clearTimeout(guardTimer);

    assertEquals(result instanceof AuthError, true);
    assertStrictEquals((result as AuthError).status, 503);
    assertStrictEquals(
      (result as AuthError).message,
      "Authentication service timeout",
    );
  } finally {
    if (guardTimer !== null) clearTimeout(guardTimer);
    if (previousTimeout === undefined) {
      Deno.env.delete("AUTH_VERIFY_TIMEOUT_MS");
    } else {
      Deno.env.set("AUTH_VERIFY_TIMEOUT_MS", previousTimeout);
    }
  }
});
