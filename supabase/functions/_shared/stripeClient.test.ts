import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHECKOUT_TAX_COLLECTION_PARAMS,
  STRIPE_API_VERSION,
  STRIPE_AI_BUSINESS_TAX_CODE,
  STRIPE_AI_PERSONAL_TAX_CODE,
  STRIPE_SAAS_BUSINESS_TAX_CODE,
  STRIPE_SAAS_PERSONAL_TAX_CODE,
  buildPaymentModeInvoiceCreationParams,
  assertStripeKeyMatchesRuntimeMode,
  buildIdempotencyKey,
  getStripeRuntimeMode,
  resolveStripeSoftwareTaxCode,
  stripeMetadata,
} from "./stripeClient.ts";

function withEnv(
  values: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
) {
  const previous = new Map<string, string | undefined>();
  for (const key of Object.keys(values)) {
    previous.set(key, Deno.env.get(key));
    const value = values[key];
    if (value === undefined) Deno.env.delete(key);
    else Deno.env.set(key, value);
  }
  try {
    return fn();
  } finally {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  }
}

Deno.test("Stripe helper pins the current API version", () => {
  assertEquals(STRIPE_API_VERSION, "2026-06-24.dahlia");
});

Deno.test("Stripe Checkout tax helper requires VAT-ready customer details", () => {
  assertEquals(CHECKOUT_TAX_COLLECTION_PARAMS.automatic_tax, {
    enabled: true,
  });
  assertEquals(CHECKOUT_TAX_COLLECTION_PARAMS.tax_id_collection, {
    enabled: true,
  });
  assertEquals(
    CHECKOUT_TAX_COLLECTION_PARAMS.billing_address_collection,
    "required",
  );
  assertEquals(CHECKOUT_TAX_COLLECTION_PARAMS.customer_update, {
    address: "auto",
    name: "auto",
  });
});

Deno.test("Stripe payment-mode Checkout helper creates hosted invoices with metadata", () => {
  assertEquals(buildPaymentModeInvoiceCreationParams({
    checkout_type: "addon",
    user_id: "user-1",
  }), {
    invoice_creation: {
      enabled: true,
      invoice_data: {
        metadata: {
          checkout_type: "addon",
          user_id: "user-1",
        },
      },
    },
  });
});

Deno.test("Stripe software tax-code resolver classifies SaaS and AI products", () => {
  assertEquals(
    resolveStripeSoftwareTaxCode({ key: "pro", audience: "participant" }),
    STRIPE_SAAS_PERSONAL_TAX_CODE,
  );
  assertEquals(
    resolveStripeSoftwareTaxCode({ key: "agent_basic", audience: "agent" }),
    STRIPE_SAAS_BUSINESS_TAX_CODE,
  );
  assertEquals(
    resolveStripeSoftwareTaxCode({
      key: "valuation_single",
      audience: "participant",
    }),
    STRIPE_AI_PERSONAL_TAX_CODE,
  );
  assertEquals(
    resolveStripeSoftwareTaxCode({
      key: "valuation_single",
      audience: "professional",
    }),
    STRIPE_AI_BUSINESS_TAX_CODE,
  );
  assertEquals(
    resolveStripeSoftwareTaxCode({
      key: "market_intelligence",
      audience: "participant",
      module: "os_data_products",
    }),
    STRIPE_SAAS_BUSINESS_TAX_CODE,
  );
});

Deno.test("Stripe runtime mode defaults to test mode", () => {
  withEnv({
    STRIPE_RUNTIME_MODE: undefined,
    STRIPE_LIVE_MODE: undefined,
  }, () => {
    assertEquals(getStripeRuntimeMode(), "test");
  });
});

Deno.test("Stripe runtime mode requires test keys in test mode", () => {
  withEnv({ STRIPE_RUNTIME_MODE: "test" }, () => {
    assertStripeKeyMatchesRuntimeMode("sk_test_123");
    assertThrows(
      () => assertStripeKeyMatchesRuntimeMode("sk_live_123"),
      Error,
      "test mode",
    );
  });
});

Deno.test("Stripe runtime mode requires explicit live opt-in for live keys", () => {
  withEnv({ STRIPE_RUNTIME_MODE: "live", STRIPE_LIVE_MODE: undefined }, () => {
    assertThrows(
      () => assertStripeKeyMatchesRuntimeMode("sk_live_123"),
      Error,
      "STRIPE_LIVE_MODE=true",
    );
  });
});

Deno.test("Stripe helper builds stable idempotency keys and metadata", async () => {
  const key = await buildIdempotencyKey("checkout", ["user-1", "pro", "monthly"]);
  assertEquals(key.startsWith("maiprop-checkout-"), true);
  assertEquals(key.length <= 255, true);
  assertEquals(
    stripeMetadata({
      checkoutType: "subscription",
      userId: "user-1",
      planKey: "pro",
      billingCycle: "monthly",
      extra: { ignored: undefined, request_id: "req_1" },
    }),
    {
      checkout_type: "subscription",
      user_id: "user-1",
      plan_key: "pro",
      billing_cycle: "monthly",
      request_id: "req_1",
    },
  );
});
