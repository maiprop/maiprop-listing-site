/**
 * stripe-webhook integration tests — signature verification only.
 *
 * Run locally with:
 *   deno test --allow-env --allow-net supabase/functions/stripe-webhook/webhook.test.ts
 *
 * We don't boot the full Deno.serve handler here (would require mocking
 * Supabase + Stripe SDK). Instead we test the critical invariant: an unsigned
 * or tampered payload must never be accepted. This is the single highest-value
 * assertion for webhook security.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import Stripe from "npm:stripe@18.5.0";

const TEST_SECRET = "test-stripe-webhook-secret-deterministic";

const sign = async (payload: string, secret: string, timestamp: number): Promise<string> => {
  // Stripe signature format: "t=<ts>,v1=<hmac-sha256>"
  // We use the Stripe SDK's own helper to produce a valid signature so the
  // test doesn't re-implement their scheme. Deno's Stripe SDK uses Web Crypto
  // (async only), so we must call the *Async variant — the synchronous
  // generateTestHeaderString throws "SubtleCryptoProvider cannot be used in a
  // synchronous context".
  const header = await Stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret,
    timestamp,
  });
  return header;
};

Deno.test("stripe-webhook: accepts a validly signed payload", async () => {
  const stripe = new Stripe("test-stripe-api-key", { apiVersion: "2025-08-27.basil" });
  const payload = JSON.stringify({
    id: "evt_test_1",
    type: "customer.subscription.created",
    data: { object: { id: "sub_test", customer: "cus_test", status: "active", items: { data: [{ price: { product: "prod_x" } }] } } },
  });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await sign(payload, TEST_SECRET, ts);

  // constructEventAsync throws on bad signatures; success = no throw.
  const event = await stripe.webhooks.constructEventAsync(payload, sig, TEST_SECRET);
  assertEquals(event.type, "customer.subscription.created");
});

Deno.test("stripe-webhook: rejects a tampered payload", async () => {
  const stripe = new Stripe("test-stripe-api-key", { apiVersion: "2025-08-27.basil" });
  const payload = JSON.stringify({ id: "evt_test_2", type: "customer.subscription.created" });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await sign(payload, TEST_SECRET, ts);

  // Mutate the payload after signing.
  const tampered = payload.replace("created", "deleted");

  let threw = false;
  try {
    await stripe.webhooks.constructEventAsync(tampered, sig, TEST_SECRET);
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "signature check must fail on tampered payload");
});

Deno.test("stripe-webhook: rejects wrong secret", async () => {
  const stripe = new Stripe("test-stripe-api-key", { apiVersion: "2025-08-27.basil" });
  const payload = JSON.stringify({ id: "evt_test_3", type: "ping" });
  const ts = Math.floor(Date.now() / 1000);
  const sig = await sign(payload, TEST_SECRET, ts);

  let threw = false;
  try {
    await stripe.webhooks.constructEventAsync(payload, sig, "different-stripe-webhook-secret");
  } catch {
    threw = true;
  }
  assertEquals(threw, true, "signature check must fail with wrong secret");
});
