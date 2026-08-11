import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";

Deno.test("create-investor-payment creates an admin-only custom annual investor Checkout session", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertEquals(source.includes("verifyBearerToken"), true);
  assertEquals(source.includes("Platform admin only"), true);
  assertEquals(source.includes("parseAmountCents"), true);
  assertEquals(source.includes("amount is required"), true);
  assertEquals(source.includes("amount_cents is invalid"), true);
  assertEquals(source.includes('INVESTOR_PAYMENT_CURRENCY = "eur"'), true);
  assertEquals(source.includes("INVESTOR_ACCESS_PERIOD_DAYS = 365"), true);
  assertEquals(source.includes('INVESTOR_BILLING_CYCLE = "annual"'), true);
  assertEquals(source.includes("createVerifiedStripeClient"), true);
  assertEquals(source.includes("stripe.checkout.sessions.create"), true);
  assertEquals(source.includes('mode: "payment"'), true);
  assertEquals(source.includes('.select("id, user_id, status, email")'), true);
  assertEquals(source.includes('.select("email")'), false);
  assertEquals(
    source.includes("Approved invitation request has no email"),
    true,
  );
  assertEquals(source.includes('checkout_type: "investor_payment"'), true);
  assertEquals(source.includes("request_id"), true);
  assertEquals(source.includes("plan_key"), true);
  assertEquals(source.includes("investor_private"), true);
  assertEquals(source.includes("investor_institutional"), true);
  assertEquals(source.includes("stripe_session_id"), true);
  assertEquals(source.includes("session_id: session.id"), true);
  assertEquals(source.includes("mode: getStripeRuntimeMode()"), true);
  assertEquals(
    source.includes("No pending investor payment subscription found"),
    true,
  );
  assertEquals(
    source.includes("stripe.checkout.sessions.expire(session.id)"),
    true,
  );
  assertEquals(
    source.includes('.select("id, status, stripe_session_id")'),
    true,
  );
  assertEquals(source.includes('payment_method_types: ["card"]'), true);
  assertEquals(source.includes("CHECKOUT_TAX_COLLECTION_PARAMS"), true);
  assertEquals(
    source.includes("buildPaymentModeInvoiceCreationParams(metadata)"),
    true,
  );
  assertEquals(source.includes("billing_cycle: INVESTOR_BILLING_CYCLE"), true);
  assertEquals(
    source.includes("access_period_days: String(INVESTOR_ACCESS_PERIOD_DAYS)"),
    true,
  );
  assertEquals(source.includes("amount_cents: amountCents"), true);
  assertEquals(source.includes("amount_major: amountCents / 100"), true);
  assertEquals(source.includes("currency: INVESTOR_PAYMENT_CURRENCY"), true);
  assertEquals(source.includes("Annual Investor Access"), true);
  assertEquals(source.includes("STRIPE_SAAS_BUSINESS_TAX_CODE"), true);
  assertEquals(source.includes("STRIPE_DEFAULT_TAX_BEHAVIOR"), true);
  assertEquals(
    source.includes("tax_behavior: STRIPE_DEFAULT_TAX_BEHAVIOR"),
    true,
  );
  assertEquals(
    source.includes("tax_code: STRIPE_SAAS_BUSINESS_TAX_CODE"),
    true,
  );
  assertEquals(source.includes('"stripe-tax-v2-company-vat"'), true);
  assertEquals(
    source.includes(
      "An investor payment link already exists for this pending subscription",
    ),
    true,
  );
  assertEquals(source.includes('.is("stripe_session_id", null)'), true);
  assertEquals(source.includes('"investor-payment-custom-annual-v1"'), true);
  assertEquals(source.includes("FIXED_INVESTOR_PAYMENT_AMOUNT"), false);
  assertEquals(source.includes("Investor payment currency must be EUR"), true);
});
