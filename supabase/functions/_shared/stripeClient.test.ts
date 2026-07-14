import {
  assertEquals,
  assertRejects,
  assertThrows,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  assertStripeKeyMatchesRuntimeMode,
  buildCompanyVatInvoiceCustomFields,
  buildIdempotencyKey,
  buildPaymentModeInvoiceCreationParams,
  buildSubscriptionCompanyInvoiceSettingsUpdateParams,
  CHECKOUT_TAX_COLLECTION_PARAMS,
  ensureSubscriptionCompanyInvoiceSettings,
  getStripeCompanyVatId,
  getStripeExpectedAccountId,
  getStripeRuntimeMode,
  resolveStripeSoftwareTaxCode,
  STRIPE_AI_BUSINESS_TAX_CODE,
  STRIPE_AI_PERSONAL_TAX_CODE,
  STRIPE_API_VERSION,
  STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
  STRIPE_COMPANY_VAT_ID_DEFAULT,
  STRIPE_SAAS_BUSINESS_TAX_CODE,
  STRIPE_SAAS_PERSONAL_TAX_CODE,
  stripeMetadata,
  verifyStripeAccountIdentity,
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
  const restore = () => {
    for (const [key, value] of previous) {
      if (value === undefined) Deno.env.delete(key);
      else Deno.env.set(key, value);
    }
  };
  try {
    const result = fn();
    if (result instanceof Promise) {
      return result.finally(restore);
    }
    restore();
    return result;
  } catch (error) {
    restore();
    throw error;
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
    required: "if_supported",
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
  withEnv({
    STRIPE_ACCOUNT_TAX_ID: undefined,
    STRIPE_COMPANY_VAT_ID: undefined,
    COMPANY_VAT_ID: undefined,
  }, () => {
    assertEquals(
      buildPaymentModeInvoiceCreationParams({
        checkout_type: "addon",
        user_id: "user-1",
      }),
      {
        invoice_creation: {
          enabled: true,
          invoice_data: {
            metadata: {
              checkout_type: "addon",
              user_id: "user-1",
            },
            custom_fields: [{
              name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
              value: STRIPE_COMPANY_VAT_ID_DEFAULT,
            }],
          },
        },
      },
    );
  });
});

Deno.test("Stripe invoice helpers stamp company VAT and account tax IDs", () => {
  withEnv({
    STRIPE_COMPANY_VAT_ID: "EL802708301",
    STRIPE_ACCOUNT_TAX_ID: "txi_test_company_vat",
  }, () => {
    assertEquals(getStripeCompanyVatId(), "EL802708301");
    assertEquals(buildCompanyVatInvoiceCustomFields(), [{
      name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
      value: "EL802708301",
    }]);
    assertEquals(
      buildPaymentModeInvoiceCreationParams({
        checkout_type: "addon",
        user_id: "user-1",
      }),
      {
        invoice_creation: {
          enabled: true,
          invoice_data: {
            metadata: {
              checkout_type: "addon",
              user_id: "user-1",
            },
            account_tax_ids: ["txi_test_company_vat"],
            custom_fields: [{
              name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
              value: "EL802708301",
            }],
          },
        },
      },
    );
    assertEquals(
      buildSubscriptionCompanyInvoiceSettingsUpdateParams({
        invoice_settings: {
          account_tax_ids: [],
          custom_fields: null,
        },
      } as never),
      {
        invoice_settings: {
          account_tax_ids: ["txi_test_company_vat"],
          custom_fields: [{
            name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
            value: "EL802708301",
          }],
        },
      },
    );
    assertEquals(
      buildSubscriptionCompanyInvoiceSettingsUpdateParams({
        invoice_settings: {
          account_tax_ids: ["txi_test_company_vat"],
          custom_fields: [{
            name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
            value: "EL802708301",
          }],
        },
      } as never),
      null,
    );
  });
});

Deno.test("subscription invoice settings fall back to company VAT custom field", async () => {
  await withEnv({
    STRIPE_COMPANY_VAT_ID: "EL802708301",
    STRIPE_ACCOUNT_TAX_ID: "txi_wrong_mode",
  }, async () => {
    const calls: unknown[] = [];
    const sub = {
      id: "sub_123",
      invoice_settings: {
        account_tax_ids: [],
        custom_fields: null,
      },
    };
    const stripe = {
      subscriptions: {
        update(_id: string, params: unknown) {
          calls.push(params);
          if (calls.length === 1) {
            return Promise.reject(new Error("No such tax id"));
          }
          return Promise.resolve({
            ...sub,
            invoice_settings: (params as {
              invoice_settings: unknown;
            }).invoice_settings,
          });
        },
      },
    };

    const updated = await ensureSubscriptionCompanyInvoiceSettings(
      stripe as never,
      sub as never,
    );

    assertEquals(calls, [
      {
        invoice_settings: {
          account_tax_ids: ["txi_wrong_mode"],
          custom_fields: [{
            name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
            value: "EL802708301",
          }],
        },
      },
      {
        invoice_settings: {
          custom_fields: [{
            name: STRIPE_COMPANY_VAT_CUSTOM_FIELD_NAME,
            value: "EL802708301",
          }],
        },
      },
    ]);
    assertEquals(
      (updated as {
        invoice_settings: {
          custom_fields: Array<{ name: string; value: string }>;
        };
      }).invoice_settings.custom_fields[0].value,
      "EL802708301",
    );
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

Deno.test("Stripe runtime mode fails closed when configuration is missing", () => {
  withEnv({
    STRIPE_RUNTIME_MODE: undefined,
    STRIPE_ENVIRONMENT: undefined,
    STRIPE_RUN_MODE: undefined,
    STRIPE_LIVE_MODE: undefined,
  }, () => {
    assertThrows(
      () => getStripeRuntimeMode(),
      Error,
      "STRIPE_RUNTIME_MODE must be explicitly set",
    );
  });
});

Deno.test("Stripe runtime mode rejects unknown values", () => {
  withEnv({ STRIPE_RUNTIME_MODE: "preview" }, () => {
    assertThrows(
      () => getStripeRuntimeMode(),
      Error,
      "STRIPE_RUNTIME_MODE must be explicitly set",
    );
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

Deno.test("Stripe expected account configuration is required and normalized", () => {
  withEnv({ STRIPE_EXPECTED_ACCOUNT_ID: undefined }, () => {
    assertThrows(
      () => getStripeExpectedAccountId(),
      Error,
      "STRIPE_EXPECTED_ACCOUNT_ID is not set",
    );
  });
  withEnv({ STRIPE_EXPECTED_ACCOUNT_ID: "  acct_expected123  " }, () => {
    assertEquals(getStripeExpectedAccountId(), "acct_expected123");
  });
  withEnv({ STRIPE_EXPECTED_ACCOUNT_ID: "not-an-account" }, () => {
    assertThrows(
      () => getStripeExpectedAccountId(),
      Error,
      "valid Stripe account ID",
    );
  });
});

Deno.test("Stripe account verification rejects a mismatched webhook event account", async () => {
  let retrieveCalls = 0;
  const stripe = {
    accounts: {
      retrieve() {
        retrieveCalls += 1;
        return Promise.resolve({ id: "acct_expected123" });
      },
    },
  };

  await assertRejects(
    () =>
      verifyStripeAccountIdentity(stripe as never, {
        expectedAccountId: " acct_expected123 ",
        eventAccount: "acct_other456",
        cacheTtlMs: 0,
      }),
    Error,
    "event account",
  );
  assertEquals(retrieveCalls, 0);
});

Deno.test("Stripe account verification rejects a client authenticated to another account", async () => {
  const stripe = {
    accounts: {
      retrieve() {
        return Promise.resolve({ id: "acct_other456" });
      },
    },
  };

  await assertRejects(
    () =>
      verifyStripeAccountIdentity(stripe as never, {
        expectedAccountId: "acct_expected123",
        cacheTtlMs: 0,
      }),
    Error,
    "authenticated account",
  );
});

Deno.test("Stripe account verification is bounded and caches successful checks", async () => {
  let retrieveCalls = 0;
  const stripe = {
    accounts: {
      retrieve() {
        retrieveCalls += 1;
        return Promise.resolve({ id: "acct_cache123" });
      },
    },
  };

  await verifyStripeAccountIdentity(stripe as never, {
    expectedAccountId: "acct_cache123",
    cacheTtlMs: 60_000,
    timeoutMs: 100,
  });
  await verifyStripeAccountIdentity(stripe as never, {
    expectedAccountId: "acct_cache123",
    cacheTtlMs: 60_000,
    timeoutMs: 100,
  });

  assertEquals(retrieveCalls, 1);
});

Deno.test("Stripe account verification fails within its request deadline", async () => {
  const stripe = {
    accounts: {
      retrieve() {
        return new Promise<{ id: string }>(() => undefined);
      },
    },
  };

  await assertRejects(
    () =>
      verifyStripeAccountIdentity(stripe as never, {
        expectedAccountId: "acct_timeout123",
        cacheTtlMs: 0,
        timeoutMs: 5,
      }),
    Error,
    "timed out",
  );
});

Deno.test("Stripe helper builds stable idempotency keys and metadata", async () => {
  const key = await buildIdempotencyKey("checkout", [
    "user-1",
    "pro",
    "monthly",
  ]);
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
