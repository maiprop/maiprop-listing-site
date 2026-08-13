/**
 * Tests for create-checkout edge function (handler-level only).
 *
 * sanitizeRedirectPath unit tests live in `sanitizeRedirectPath.test.ts` —
 * keeping them out of this file avoids loading the module before
 * captureHandler patches Deno.serve.
 */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    BILLING_MODE: "live",
    RATE_LIMIT_FORCE_MEMORY: "true",
    STRIPE_EXPECTED_ACCOUNT_ID: "acct_testcheckoutcontract",
    STRIPE_RUNTIME_MODE: "test",
  },
);
const moduleUrl = new URL("./index.ts", import.meta.url).href;
const {
  isCheckoutAudienceAllowed,
  isCheckoutAddonAudienceAllowed,
  isInviteOnlyCheckoutPlan,
  isSupportedCheckoutAddonKey,
  isSupportedCheckoutPlan,
  isSupportedCheckoutAddonModule,
  normalizeExplicitCheckoutKey,
  normalizePlanKey,
} = await import(moduleUrl);

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST", { priceId: "price_test" }));
  assertEquals(res.status, 401);
});

Deno.test("checkout validates bearer auth before DB-backed rate limiting", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const authIndex = source.indexOf("const user = await verifyBearerToken");
  const limiterIndex = source.indexOf("if (await limiter.isLimited");

  assertEquals(authIndex >= 0, true);
  assertEquals(limiterIndex > authIndex, true);
});

Deno.test("GET does not create checkout sessions", async () => {
  const res = await handler(authedReq("GET"));
  assertEquals(res.status, 405);
});

Deno.test("fake Bearer token results in auth failure, not internal error", async () => {
  const res = await handler(authedReq("POST", { priceId: "price_test" }));
  assertEquals(res.status, 401);
  const body = await res.json();
  assertEquals(typeof body.error, "string");
});

Deno.test("checkout plan keys are allowlisted and investor plans remain invitation-only", () => {
  assertEquals(normalizePlanKey(undefined), "pro");
  assertEquals(normalizePlanKey("agent_basic"), "agent_basic");
  assertEquals(normalizePlanKey("bad plan"), null);
  assertEquals(
    normalizeExplicitCheckoutKey("featured_listing"),
    "featured_listing",
  );
  assertEquals(normalizeExplicitCheckoutKey(""), null);
  assertEquals(normalizeExplicitCheckoutKey(undefined), null);

  assertEquals(isSupportedCheckoutPlan("pro"), true);
  assertEquals(isSupportedCheckoutPlan("developer_pro"), true);
  assertEquals(isSupportedCheckoutPlan("investor_private"), true);
  assertEquals(isSupportedCheckoutPlan("unknown_plan"), false);

  assertEquals(isInviteOnlyCheckoutPlan("investor_private"), true);
  assertEquals(isInviteOnlyCheckoutPlan("investor_institutional"), true);
  assertEquals(isInviteOnlyCheckoutPlan("developer_pro"), false);
});

Deno.test("checkout audience gate blocks cross-role public plan purchases", () => {
  assertEquals(
    isCheckoutAudienceAllowed("participant", { role: "buyer" }),
    true,
  );
  assertEquals(
    isCheckoutAudienceAllowed("participant", { participant_type: "seller" }),
    true,
  );
  assertEquals(
    isCheckoutAudienceAllowed("agent", {
      role: "agent",
      participant_type: "agent",
    }),
    true,
  );
  assertEquals(
    isCheckoutAudienceAllowed("developer", {
      role: "developer",
      participant_type: "developer",
    }),
    true,
  );
  assertEquals(
    isCheckoutAudienceAllowed("developer", {
      role: "buyer",
      participant_type: "developer",
    }),
    false,
  );
  assertEquals(
    isCheckoutAudienceAllowed("participant", {
      role: "buyer",
      participant_type: "developer",
    }),
    true,
  );

  assertEquals(
    isCheckoutAudienceAllowed("agent", { participant_type: "buyer" }),
    false,
  );
  assertEquals(
    isCheckoutAudienceAllowed("developer", { participant_type: "agent" }),
    false,
  );
  assertEquals(isCheckoutAudienceAllowed("professional", null), false);
});

Deno.test("catalog resolution fails before mock or live subscription Checkout creation", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const subscriptionBranch = source.indexOf("const plan = normalizePlanKey");
  const resolutionIndex = source.indexOf(
    "const checkoutPlan = await getCheckoutPlan",
    subscriptionBranch,
  );
  const unavailableIndex = source.indexOf("if (!checkoutPlan)", resolutionIndex);
  const mockIndex = source.indexOf(
    "if (isStripeMockMode())",
    subscriptionBranch,
  );
  const sessionIndex = source.indexOf(
    "stripe.checkout.sessions.create",
    resolutionIndex,
  );

  assertEquals(resolutionIndex >= 0, true);
  assertEquals(unavailableIndex > resolutionIndex, true);
  assertEquals(mockIndex > unavailableIndex, true);
  assertEquals(sessionIndex > unavailableIndex, true);
  assertEquals(source.includes('code: "pricing_catalog_unavailable"'), true);
  assertEquals(source.includes('code: "plan_unavailable"'), true);
  assertEquals(source.includes("PricingCatalogUnavailableError"), true);
});

Deno.test("self-serve add-on modules are explicitly allowlisted", () => {
  assertEquals(isSupportedCheckoutAddonModule("valuation_reports"), true);
  assertEquals(isSupportedCheckoutAddonModule("adhoc_charges"), true);
  assertEquals(isSupportedCheckoutAddonModule("os_data_products"), false);
  assertEquals(isSupportedCheckoutAddonModule("user_subscription"), false);
  assertEquals(isSupportedCheckoutAddonModule("investor_subscription"), false);
  assertEquals(isSupportedCheckoutAddonModule(null), false);
});

Deno.test("self-serve add-on keys are explicitly fulfilled by webhook credits", () => {
  assertEquals(isSupportedCheckoutAddonKey("valuation_single"), true);
  assertEquals(isSupportedCheckoutAddonKey("valuation_bundle"), true);
  assertEquals(isSupportedCheckoutAddonKey("property_report_single"), true);
  assertEquals(
    isSupportedCheckoutAddonKey("neighbourhood_report_single"),
    true,
  );
  assertEquals(
    isSupportedCheckoutAddonKey("neighbourhood_report_bundle"),
    true,
  );
  assertEquals(isSupportedCheckoutAddonKey("featured_listing"), true);
  assertEquals(isSupportedCheckoutAddonKey("priority_placement"), true);
  assertEquals(isSupportedCheckoutAddonKey("featured_priority_bundle"), true);
  assertEquals(isSupportedCheckoutAddonKey("extra_listing"), false);
  assertEquals(isSupportedCheckoutAddonKey("market_intelligence"), false);
  assertEquals(isSupportedCheckoutAddonKey("new_unmapped_report"), false);
  assertEquals(isSupportedCheckoutAddonKey(null), false);
});

Deno.test("add-on audience gate allows delivered reports without opening unrelated charges", () => {
  const audienceAllowed = isCheckoutAddonAudienceAllowed as unknown as (
    addonKey: string,
    addonAudience: string,
    addonModule: string,
    profile: Record<string, unknown> | null,
  ) => boolean;
  assertEquals(
    audienceAllowed("valuation_single", "participant", "valuation_reports", {
      role: "agent",
    }),
    true,
  );
  assertEquals(
    audienceAllowed("extra_listing", "participant", "adhoc_charges", {
      role: "professional",
    }),
    false,
  );
  assertEquals(
    audienceAllowed("agent_extra_seat", "agent", "adhoc_charges", {
      role: "agent",
    }),
    false,
  );
  assertEquals(
    audienceAllowed("valuation_single", "participant", "os_data_products", {
      role: "buyer",
    }),
    false,
  );
  assertEquals(
    audienceAllowed("valuation_single", "participant", "os_data_products", {
      role: "developer",
    }),
    false,
  );
});

Deno.test("promotion add-on audience gate allows sellers, agents, developers, and admins only", () => {
  const audienceAllowed = isCheckoutAddonAudienceAllowed as unknown as (
    addonKey: string,
    addonAudience: string,
    addonModule: string,
    profile: Record<string, unknown> | null,
  ) => boolean;
  const promotionKeys = [
    "featured_listing",
    "priority_placement",
    "featured_priority_bundle",
  ];

  for (const addonKey of promotionKeys) {
    for (const role of ["seller", "agent", "developer", "admin"]) {
      assertEquals(
        audienceAllowed(addonKey, "participant", "adhoc_charges", {
          role,
          participant_type: role,
          subscription_product_id: null,
        }),
        true,
      );
    }
    assertEquals(
      audienceAllowed(addonKey, "participant", "adhoc_charges", {
        role: "buyer",
      }),
      false,
    );
    assertEquals(
      audienceAllowed(addonKey, "participant", "adhoc_charges", {
        role: "professional",
      }),
      false,
    );
    assertEquals(
      audienceAllowed(addonKey, "participant", "adhoc_charges", {
        role: "investor",
      }),
      false,
    );
    assertEquals(
      audienceAllowed(addonKey, "participant", "adhoc_charges", {
        role: "buyer",
        participant_type: "developer",
      }),
      false,
    );
    assertEquals(
      audienceAllowed(addonKey, "participant", "adhoc_charges", {
        role: null,
        participant_type: "developer",
      }),
      false,
    );
  }
});

Deno.test("mock add-on checkout is gated by add-on availability and audience", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonBranchStart = source.indexOf("if (addonKey) {");
  const stripeSessionStart = source.indexOf(
    "const stripe = createStripeClient",
    addonBranchStart,
  );
  const addonBranch = source.slice(addonBranchStart, stripeSessionStart);

  const lookupIndex = addonBranch.indexOf(
    "const checkoutAddon = await getCheckoutAddon",
  );
  const audienceIndex = addonBranch.indexOf("!isCheckoutAddonAudienceAllowed");
  const mockIndex = addonBranch.indexOf("if (isStripeMockMode())");

  assertEquals(lookupIndex >= 0, true);
  assertEquals(audienceIndex > lookupIndex, true);
  assertEquals(mockIndex > audienceIndex, true);
});

Deno.test("real checkout fails closed when Edge and database Stripe runtimes differ", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const bodyIndex = source.indexOf("const body =");
  const addonBranchIndex = source.indexOf("if (addonKey) {", bodyIndex);
  const runtimeCheckIndex = source.indexOf(
    "getCurrentBillingRuntimeMode",
    bodyIndex,
  );

  assertEquals(runtimeCheckIndex > bodyIndex, true);
  assertEquals(runtimeCheckIndex < addonBranchIndex, true);
  assertEquals(
    source.includes("billingRuntimeMode !== stripeRuntimeMode"),
    true,
  );
  assertEquals(source.includes("Billing runtime configuration mismatch"), true);
});

Deno.test("subscription trial checkout is reserved before Stripe session creation", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const reserveIndex = source.indexOf("reserveSubscriptionTrialClaim");
  const sessionIndex = source.indexOf(
    "stripe.checkout.sessions.create",
    source.indexOf("const checkoutPlan"),
  );
  const updateIndex = source.indexOf(
    "await markSubscriptionTrialCheckoutCreated",
    sessionIndex,
  );

  assertEquals(source.includes("normalizeTrialCheckoutRequest"), true);
  assertEquals(source.includes("trial_period_days: PRO_TRIAL_DAYS"), true);
  assertEquals(
    source.includes(
      'checkout_type: wantsTrial ? "subscription_trial" : "subscription"',
    ),
    true,
  );
  assertEquals(source.includes("...(wantsTrial ? trialMetadata : {})"), true);
  assertEquals(source.includes('payment_method_collection: "always"'), true);
  assertEquals(source.includes('missing_payment_method: "cancel"'), true);
  assertEquals(source.includes("subscription_trial_claims"), true);
  assertEquals(reserveIndex >= 0, true);
  assertEquals(sessionIndex > reserveIndex, true);
  assertEquals(updateIndex > sessionIndex, true);
});

Deno.test("subscription trial checkout requires a payment method before trial activation", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const subscriptionBranch = source.slice(
    source.indexOf("const checkoutPlan = await getCheckoutPlan"),
  );

  assertEquals(subscriptionBranch.includes("payment_method_types:"), false);
  assertEquals(subscriptionBranch.includes("payment_method_configuration:"), false);
  assertEquals(
    subscriptionBranch.includes(
      "integration_identifier: STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER",
    ),
    true,
  );
  assertEquals(
    subscriptionBranch.includes('payment_method_collection: "always" as const'),
    true,
  );
  assertEquals(
    subscriptionBranch.includes("trial_period_days: PRO_TRIAL_DAYS"),
    true,
  );
  assertEquals(
    subscriptionBranch.includes('missing_payment_method: "cancel" as const'),
    true,
  );
  assertEquals(
    subscriptionBranch.includes('"missing-payment-method-cancel"'),
    true,
  );
});

Deno.test("subscription checkout blocks duplicate active subscriptions for the same audience", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertEquals(source.includes("hasProvisionedSameAudienceSubscription"), true);
  assertEquals(source.includes('.from("billing_subscriptions")'), true);
  assertEquals(
    source.includes(
      "An active subscription already exists for this account type",
    ),
    true,
  );
});

Deno.test("mock billing never fabricates successful Pro trial checkout", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const subscriptionCheckoutStart = source.indexOf(
    "if (wantsTrial && hasExistingPaidAccess",
  );
  const mockBranchStart = source.indexOf(
    "if (isStripeMockMode())",
    subscriptionCheckoutStart,
  );
  const stripeSessionStart = source.indexOf(
    "const stripe = createStripeClient",
    mockBranchStart,
  );
  const mockBranch = source.slice(mockBranchStart, stripeSessionStart);
  const blockTrialIndex = mockBranch.indexOf("trial_mock_billing_disabled");
  const mockUrlIndex = mockBranch.indexOf("buildMockCheckoutUrl");

  assertEquals(mockBranch.includes("wantsTrial"), true);
  assertEquals(blockTrialIndex >= 0, true);
  assertEquals(mockUrlIndex > blockTrialIndex, true);
});

Deno.test("checkout responses expose normalized session metadata", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertEquals(source.includes("session_id: session.id"), true);
  assertEquals(source.includes('checkout_type: "subscription"'), true);
  assertEquals(source.includes('checkout_type: "addon"'), true);
  assertEquals(source.includes("getStripeRuntimeMode"), true);
  assertEquals(source.includes("mode: getStripeRuntimeMode()"), true);
  assertEquals(source.includes("session_id: null"), true);
});

Deno.test("paid subscription checkout stamps checkout_type metadata on Stripe objects", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const subscriptionCreateStart = source.indexOf(
    "session = await stripe.checkout.sessions.create",
  );
  const idempotencyStart = source.indexOf(
    'idempotencyKey: await buildIdempotencyKey("checkout-v3"',
    subscriptionCreateStart,
  );
  const checkoutCreateArgs = source.slice(
    subscriptionCreateStart,
    idempotencyStart,
  );

  const checkoutTypeStamps = checkoutCreateArgs.match(
    /checkout_type:\s*wantsTrial\s*\?\s*"subscription_trial"\s*:\s*"subscription"/g,
  )?.length ?? 0;
  assertEquals(checkoutTypeStamps, 2);
});

Deno.test("subscription Checkout identifies the authenticated user for reconciliation", async () => {
  const userId = "00000000-0000-4000-8000-000000000041";
  const originalFetch = globalThis.fetch;
  const captured: { checkoutParams: URLSearchParams | null } = {
    checkoutParams: null,
  };

  globalThis.fetch = async (
    input: RequestInfo | URL,
    init?: RequestInit,
  ) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const json = (body: unknown, status = 200) =>
      new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
      });

    if (url.hostname === "test.supabase.co") {
      if (url.pathname === "/auth/v1/user") {
        return json({
          id: userId,
          email: "checkout-contract@maiprop.test",
          aud: "authenticated",
          role: "authenticated",
        });
      }
      if (url.pathname === "/rest/v1/rpc/current_billing_runtime_mode") {
        return json("test");
      }
      if (url.pathname === "/rest/v1/profiles") {
        return json([{
          role: "buyer",
          participant_type: "buyer",
          subscription_product_id: null,
          force_pro_access: false,
          is_platform_admin: false,
        }]);
      }
      if (url.pathname === "/rest/v1/billing_subscriptions") {
        return json([]);
      }
      if (url.pathname === "/rest/v1/pricing_configs") {
        return json([{
          key: "pro",
          audience: "participant",
          module: "user_subscription",
          unit: "monthly",
          label: "Pro",
          amount: 19,
          currency: "eur",
          metadata: {
            stripe_price_id_monthly: "price_test_pro_monthly",
            stripe_product_id: "prod_test_pro",
          },
        }]);
      }
      if (
        url.pathname === "/rest/v1/billing_customers" && method === "POST"
      ) {
        return new Response(null, { status: 201 });
      }
    }

    if (url.hostname === "api.stripe.com") {
      if (url.pathname === "/v1/account") {
        return json({ id: "acct_testcheckoutcontract" });
      }
      if (url.pathname === "/v1/balance") {
        return json({ livemode: false, available: [], pending: [] });
      }
      if (url.pathname === "/v1/customers/search") {
        return json({
          object: "search_result",
          data: [{
            id: "cus_test_checkout_contract",
            invoice_settings: {
              custom_fields: [{ name: "Company VAT", value: "EL802708301" }],
            },
          }],
          has_more: false,
          url: "/v1/customers/search",
        });
      }
      if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
        captured.checkoutParams = new URLSearchParams(await request.text());
        return json({
          id: "cs_test_checkout_contract",
          object: "checkout.session",
          livemode: false,
          mode: "subscription",
          status: "open",
          url: "https://checkout.stripe.test/session",
        });
      }
    }

    throw new Error(`Unexpected ${method} request to ${url}`);
  };

  try {
    const response = await handler(authedReq("POST", {
      plan: "pro",
      billing_cycle: "monthly",
    }));
    const responseBody = await response.json();

    assertEquals(response.status, 200, JSON.stringify(responseBody));
    assertEquals(captured.checkoutParams?.get("mode"), "subscription");
    assertEquals(captured.checkoutParams?.get("client_reference_id"), userId);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("add-on checkout propagates optional target metadata", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonBranchStart = source.indexOf("if (addonKey) {");
  const planBranchStart = source.indexOf(
    "const plan = normalizePlanKey",
    addonBranchStart,
  );
  const addonBranch = source.slice(addonBranchStart, planBranchStart);

  assertEquals(addonBranch.includes("target_type"), true);
  assertEquals(addonBranch.includes("target_id"), true);
  assertEquals(addonBranch.includes("normalizeCheckoutTarget"), true);
});

Deno.test("add-on checkout validates and propagates requested quantity", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonBranchStart = source.indexOf("if (addonKey) {");
  const planBranchStart = source.indexOf(
    "const plan = normalizePlanKey",
    addonBranchStart,
  );
  const addonBranch = source.slice(addonBranchStart, planBranchStart);

  assertEquals(source.includes("MAX_ADDON_CHECKOUT_QUANTITY"), true);
  assertEquals(addonBranch.includes("normalizeCheckoutQuantity"), true);
  assertEquals(addonBranch.includes("body.quantity ?? body.qty"), true);
  assertEquals(addonBranch.includes("quantity: checkoutQuantity"), true);
  assertEquals(
    addonBranch.includes("quantity: String(checkoutQuantity)"),
    true,
  );
  assertEquals(addonBranch.includes('"checkout-addon-v3"'), true);
});

Deno.test("add-on checkout stamps payment intent metadata for refund reconciliation", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonBranchStart = source.indexOf("if (addonKey) {");
  const planBranchStart = source.indexOf(
    "const plan = normalizePlanKey",
    addonBranchStart,
  );
  const addonBranch = source.slice(addonBranchStart, planBranchStart);

  assertEquals(addonBranch.includes("payment_intent_data"), true);
  assertEquals(addonBranch.includes("metadata: addonMetadata"), true);
  assertEquals(addonBranch.includes("user_id: user.id"), true);
  assertEquals(addonBranch.includes('checkout_type: "addon"'), true);
  assertEquals(addonBranch.includes("addon_key: checkoutAddon.addonKey"), true);
});

Deno.test("add-on checkout validates the server price and never accepts client pricing", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonBranchStart = source.indexOf("if (addonKey) {");
  const planBranchStart = source.indexOf(
    "const plan = normalizePlanKey",
    addonBranchStart,
  );
  const addonBranch = source.slice(addonBranchStart, planBranchStart);
  const priceLookup = addonBranch.indexOf(
    "stripe.prices.retrieve(checkoutAddon.priceId)",
  );
  const sessionCreate = addonBranch.indexOf(
    "stripe.checkout.sessions.create",
  );

  assertEquals(priceLookup > 0, true);
  assertEquals(sessionCreate > priceLookup, true);
  assertEquals(
    addonBranch.includes("assertStripePriceMatchesCheckoutAddon"),
    true,
  );
  assertEquals(addonBranch.includes("price: checkoutAddon.priceId"), true);
  assertEquals(addonBranch.includes("client_reference_id: user.id"), true);
  assertEquals(addonBranch.includes("body.priceId"), false);
  assertEquals(addonBranch.includes("body.price_id"), false);
  assertEquals(addonBranch.includes("body.amount"), false);
  assertEquals(addonBranch.includes("body.product"), false);
  assertEquals(addonBranch.includes("runtime_mode: stripeRuntimeMode"), true);
});

Deno.test("checkout sessions use Dashboard-managed dynamic payment methods", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonBranchStart = source.indexOf("if (addonKey) {");
  const planBranchStart = source.indexOf(
    "const plan = normalizePlanKey",
    addonBranchStart,
  );
  const addonBranch = source.slice(addonBranchStart, planBranchStart);
  const subscriptionBranch = source.slice(planBranchStart);

  assertEquals(addonBranch.includes("payment_method_types:"), false);
  assertEquals(addonBranch.includes("payment_method_configuration:"), false);
  assertEquals(subscriptionBranch.includes("payment_method_types:"), false);
  assertEquals(
    addonBranch.includes(
      "integration_identifier: STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER",
    ),
    true,
  );
  assertEquals(
    subscriptionBranch.includes(
      "integration_identifier: STRIPE_CHECKOUT_INTEGRATION_IDENTIFIER",
    ),
    true,
  );
});

Deno.test("Checkout persists the runtime-scoped Stripe customer before session creation", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const addonStart = source.indexOf("if (addonKey) {");
  const planStart = source.indexOf("const plan = normalizePlanKey", addonStart);
  const addonBranch = source.slice(addonStart, planStart);
  const subscriptionBranch = source.slice(planStart);

  assertEquals(source.includes("upsertBillingCustomer"), true);
  assertEquals(
    addonBranch.indexOf("await upsertBillingCustomer") >
      addonBranch.indexOf("getOrCreateOwnedStripeCustomer"),
    true,
  );
  assertEquals(
    addonBranch.indexOf("await upsertBillingCustomer") <
      addonBranch.indexOf("stripe.checkout.sessions.create"),
    true,
  );
  assertEquals(
    subscriptionBranch.indexOf("await upsertBillingCustomer") >
      subscriptionBranch.indexOf("getOrCreateOwnedStripeCustomer"),
    true,
  );
  assertEquals(
    subscriptionBranch.indexOf("await upsertBillingCustomer") <
      subscriptionBranch.indexOf("stripe.checkout.sessions.create"),
    true,
  );
});

Deno.test("checkout sessions enable Stripe Tax and payment-mode invoice creation", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertEquals(source.includes("CHECKOUT_TAX_COLLECTION_PARAMS"), true);
  assertEquals(source.includes("...CHECKOUT_TAX_COLLECTION_PARAMS"), true);
  assertEquals(
    source.includes("buildPaymentModeInvoiceCreationParams(addonMetadata)"),
    true,
  );
  assertEquals(source.includes('"stripe-tax-v1"'), true);
});

Deno.test("checkout idempotency keys include price and session shape", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );

  assertEquals(source.includes("buildIdempotencyKey"), true);
  assertEquals(source.includes('"checkout-v3"'), true);
  assertEquals(source.includes('"checkout-addon-v3"'), true);
  assertEquals(source.includes("checkoutPlan.priceId"), true);
  assertEquals(source.includes("checkoutAddon.priceId"), true);
  assertEquals(source.includes('"dynamic-payment-methods-v1"'), true);
});

restore();
