/**
 * Tests for apply-data-input-credit edge function.
 *
 * The function delegates to Stripe + Supabase clients which require live
 * credentials, so these tests focus on the early-return behaviours we can
 * exercise without those: CORS preflight, missing auth, and the
 * env-or-auth refusal path.
 *
 * Note: testUtils injects defaults for STRIPE_SECRET_KEY,
 * SUPABASE_SERVICE_ROLE_KEY, and SUPABASE_URL that survive Deno.env.delete()
 * because the patched getter consults an in-memory map first. So a request
 * with no Authorization header surfaces as either 503 (env path triggers
 * first) or 401 (auth path triggers first) depending on how the test
 * runtime is configured. Either is a correct refusal — see streetview-proxy
 * and delete-account tests for the same convention.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req, authedReq } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200 with CORS headers", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(res.headers.get("Access-Control-Allow-Origin"), "https://maiprop.co");
});

Deno.test("POST without auth returns 401 or 503", async () => {
  const res = await handler(req("POST"));
  assertEquals([401, 503].includes(res.status), true);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("fake Bearer token returns 401 (not 500)", async () => {
  const res = await handler(authedReq("POST"));
  assertEquals(res.status, 401);
});

restore();
