/**
 * Tests for healthz edge function.
 *
 * The DB connectivity check will fail in the test environment (no live
 * Supabase), so we expect either 200 (healthy) or 503 (degraded). We verify
 * the response shape rather than the specific status.
 */
import {
  assertEquals,
  assertExists,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("GET returns JSON with status and checks fields", async () => {
  const res = await handler(req("GET"));
  assertEquals([200, 503].includes(res.status), true);
  const body = await res.json() as Record<string, unknown>;
  assertExists(body.status);
  assertExists(body.checks);
  assertExists(body.timestamp);
});

Deno.test("POST also returns health JSON (method-agnostic)", async () => {
  const res = await handler(req("POST"));
  assertEquals([200, 503].includes(res.status), true);
  const body = await res.json() as Record<string, unknown>;
  assertEquals(typeof body.status, "string");
});

Deno.test("checks object contains required keys", async () => {
  const res = await handler(req("GET"));
  const body = await res.json() as { checks: Record<string, string> };
  const checks = body.checks;
  assertExists(checks.database);
  assertExists(checks.env_vars);
  assertExists(checks.openai);
  assertExists(checks.stripe);
});

Deno.test("mock billing mode does not degrade health for missing Stripe secrets", async () => {
  Deno.env.set("BILLING_MODE", "mock");
  Deno.env.delete("STRIPE_SECRET_KEY");
  Deno.env.delete("STRIPE_WEBHOOK_SECRET");
  const res = await handler(req("GET"));
  const body = await res.json() as {
    billing_mode: string;
    checks: Record<string, string>;
  };
  assertEquals(body.billing_mode, "mock");
  assertEquals(body.checks.stripe, "mock");
  assertEquals([200, 503].includes(res.status), true);
  Deno.env.delete("BILLING_MODE");
});

restore();
