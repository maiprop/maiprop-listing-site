import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("create-investor-payment creates an admin-only bespoke investor Checkout session", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));

  assertEquals(source.includes("verifyBearerToken"), true);
  assertEquals(source.includes("Platform admin only"), true);
  assertEquals(source.includes("createStripeClient"), true);
  assertEquals(source.includes("stripe.checkout.sessions.create"), true);
  assertEquals(source.includes('mode: "payment"'), true);
  assertEquals(source.includes('checkout_type: "investor_payment"'), true);
  assertEquals(source.includes("request_id"), true);
  assertEquals(source.includes("plan_key"), true);
  assertEquals(source.includes("investor_private"), true);
  assertEquals(source.includes("investor_institutional"), true);
  assertEquals(source.includes("stripe_session_id"), true);
  assertEquals(source.includes("session_id: session.id"), true);
  assertEquals(source.includes("mode: getStripeRuntimeMode()"), true);
});
