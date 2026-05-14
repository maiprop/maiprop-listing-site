/**
 * Tests for stripe-webhook edge function (Stripe HMAC-verified webhook).
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(import.meta.url, "./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
});

Deno.test("missing Stripe-Signature header returns 400", async () => {
  const res = await handler(req("POST", { type: "checkout.session.completed" }));
  // Stripe webhook verifies HMAC; missing signature → webhook error, not 200
  assertEquals(res.status, 400);
});

Deno.test("wrong Stripe-Signature returns error response", async () => {
  const r = new Request("https://functions.supabase.co/fn", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=bad,v1=bad",
    },
    body: JSON.stringify({ type: "checkout.session.completed" }),
  });
  const res = await handler(r);
  assertEquals([400, 500].includes(res.status), true);
});

restore();
