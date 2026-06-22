/**
 * Tests for public record-listing-view edge function guardrails.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts", {
  RATE_LIMIT_FORCE_MEMORY: "true",
});

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("GET returns 405", async () => {
  const res = await handler(req("GET"));
  assertEquals(res.status, 405);
});

Deno.test("invalid listing id is rejected before RPC work", async () => {
  const res = await handler(req("POST", { listingId: "not-a-uuid" }));
  assertEquals(res.status, 400);
});

Deno.test("invalid JSON is rejected before service-role work", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      origin: "https://maiprop.co",
      "x-forwarded-for": crypto.randomUUID(),
    },
    body: "{",
  }));
  assertEquals(res.status, 400);
  const body = await res.json();
  assertEquals(body.error, "Invalid JSON body");
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("malformed UUID-shaped listing id is rejected before service-role work", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(req("POST", {
    listingId: "------------------------------------",
  }));
  assertEquals(res.status, 400);
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("missing service role configuration fails closed", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "1");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(req("POST", {
    listingId: "11111111-1111-4111-8111-111111111111",
  }));
  assertEquals(res.status, 503);
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

Deno.test("sampled-out view returns success without service-role work", async () => {
  Deno.env.set("VIEW_TRACKING_SAMPLE_RATE", "0");
  Deno.env.delete("SUPABASE_SERVICE_ROLE_KEY");
  const res = await handler(req("POST", {
    listingId: "11111111-1111-4111-8111-111111111111",
  }));
  assertEquals(res.status, 200);
  assertEquals(await res.json(), { success: true, sampled: false });
  Deno.env.delete("VIEW_TRACKING_SAMPLE_RATE");
});

restore();
