/**
 * Deno unit tests for the shared AI usage quota helper.
 * Run: deno test supabase/functions/_shared/aiUsage.test.ts
 *
 * Tests focus on the enforceAiQuota request-parsing and auth-header
 * logic, which is deterministic and doesn't require a live Supabase.
 */
import {
  assertEquals,
  assertStrictEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { enforceAiQuota } from "./aiUsage.ts";

const CORS = { "Access-Control-Allow-Origin": "*" };

// ── enforceAiQuota: auth header checks ────────────────────────────────────────

Deno.test("enforceAiQuota: returns 401 when Authorization header is missing", async () => {
  const req = new Request("https://example.com/fn", { method: "POST" });
  const { userId, errorResponse, reserved } = await enforceAiQuota(req, "test-bucket", CORS);

  assertStrictEquals(userId, null);
  assertStrictEquals(errorResponse?.status, 401);
  assertStrictEquals(reserved, false);

  const body = await errorResponse!.json();
  assertEquals(body.error, "Authentication required");
});

Deno.test("enforceAiQuota: returns 401 when Authorization is not Bearer", async () => {
  const req = new Request("https://example.com/fn", {
    method: "POST",
    headers: { Authorization: "Basic abc123" },
  });
  const { userId, errorResponse, reserved } = await enforceAiQuota(req, "test-bucket", CORS);

  assertStrictEquals(userId, null);
  assertStrictEquals(errorResponse?.status, 401);
  assertStrictEquals(reserved, false);
});

Deno.test("enforceAiQuota: returns 401 for empty Authorization header", async () => {
  const req = new Request("https://example.com/fn", {
    method: "POST",
    headers: { Authorization: "" },
  });
  const { userId, errorResponse, reserved } = await enforceAiQuota(req, "test-bucket", CORS);

  assertStrictEquals(userId, null);
  assertStrictEquals(errorResponse?.status, 401);
  assertStrictEquals(reserved, false);
});

Deno.test("enforceAiQuota: CORS headers included in 401 response", async () => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "https://maiprop.co",
    "Access-Control-Allow-Methods": "POST",
  };
  const req = new Request("https://example.com/fn", { method: "POST" });
  const { errorResponse } = await enforceAiQuota(req, "test-bucket", corsHeaders);

  assertStrictEquals(errorResponse?.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
  assertStrictEquals(errorResponse?.headers.get("Content-Type"), "application/json");
});

// ── enforceAiQuota: fail-closed when Supabase is unavailable ──────────────────

Deno.test("enforceAiQuota: fails closed when Supabase env is missing", async () => {
  const prevUrl = Deno.env.get("SUPABASE_URL");
  const prevKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_URL");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");

  try {
    const req = new Request("https://example.com/fn", {
      method: "POST",
      headers: { Authorization: "Bearer fake-jwt-token" },
    });
    const { userId, errorResponse, reserved } = await enforceAiQuota(req, "test-bucket", CORS);

    assertStrictEquals(userId, null);
    assertStrictEquals(errorResponse?.status, 503);
    assertStrictEquals(reserved, false);
    const body = await errorResponse!.json();
    assertEquals(body.error, "AI quota service unavailable. Please retry shortly.");
  } finally {
    if (prevUrl) Deno.env.set("SUPABASE_URL", prevUrl);
    if (prevKey) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", prevKey);
  }
});
