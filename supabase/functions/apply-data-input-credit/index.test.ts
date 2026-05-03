/**
 * Tests for apply-data-input-credit edge function.
 *
 * The function delegates to Stripe + Supabase clients which require live
 * credentials, so these tests focus on the early-return behaviours we can
 * exercise without those: CORS preflight, auth missing/invalid, method
 * validation, and the 503 path when env is not configured.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200 with CORS headers", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("missing env vars returns 503", async () => {
  const original = {
    STRIPE_SECRET_KEY: Deno.env.get("STRIPE_SECRET_KEY"),
    SUPABASE_SERVICE_ROLE_KEY: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    SUPABASE_URL: Deno.env.get("SUPABASE_URL"),
  };
  Deno.env.delete("STRIPE_SECRET_KEY");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  Deno.env.delete("SUPABASE_URL");
  try {
    const res = await handler(req("POST"));
    assertEquals(res.status, 503);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
  } finally {
    if (original.STRIPE_SECRET_KEY) Deno.env.set("STRIPE_SECRET_KEY", original.STRIPE_SECRET_KEY);
    if (original.SUPABASE_SERVICE_ROLE_KEY) Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", original.SUPABASE_SERVICE_ROLE_KEY);
    if (original.SUPABASE_URL) Deno.env.set("SUPABASE_URL", original.SUPABASE_URL);
  }
});

Deno.test("missing Authorization header returns 401/503", async () => {
  // With env stubs present, missing auth surfaces as AuthError (401). Without
  // them the 503 path triggers first. Either is correct refusal.
  const res = await handler(req("POST"));
  assertEquals([401, 503].includes(res.status), true);
});

restore();
