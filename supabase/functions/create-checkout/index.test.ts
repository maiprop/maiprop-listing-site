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
  const previousFetch = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    calls.push(`${request.method} ${url.pathname}`);
    if (url.hostname === "test.supabase.co" && request.method === "GET" && url.pathname === "/auth/v1/user") {
      return Promise.resolve(checkoutJson({ code: 401, msg: "invalid token" }, 401));
    }
    throw new Error(`Unexpected checkout auth transport ${request.method} ${url}`);
  };
  try {
    const res = await handler(authedReq("POST", { priceId: "price_test" }));
    assertEquals(res.status, 401);
    const body = await res.json();
    assertEquals(typeof body.error, "string");
    assertEquals(calls, ["GET /auth/v1/user"]);
  } finally {
    globalThis.fetch = previousFetch;
  }
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
  const captured: { checkoutParams: URLSearchParams | null; keys: string[] } = {
    checkoutParams: null,
    keys: [],
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
        captured.keys.push(request.headers.get("Idempotency-Key") ?? "");
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
    assertEquals(captured.checkoutParams?.get("line_items[0][price]"), "price_test_pro_monthly");
    assertEquals(captured.checkoutParams?.get("metadata[user_id]"), userId);
    assertEquals(captured.checkoutParams?.get("subscription_data[metadata][user_id]"), userId);
    assertEquals(captured.checkoutParams?.get("invoice_creation[enabled]"), null);
    const repeated = await handler(authedReq("POST", { plan: "pro", billing_cycle: "monthly" }));
    assertEquals(repeated.status, 200);
    assertEquals(captured.keys.length, 2);
    assertEquals(captured.keys[0], captured.keys[1]);
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

type CheckoutCall = { method: string; url: URL; body: string; form: URLSearchParams; key: string | null };
const checkoutJson = (value: unknown, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const checkoutActor = "00000000-0000-4000-8000-000000000073";
const checkoutAccount = "acct_testcheckouthandler";
let checkoutActorNumber = 0;

const checkoutPlanRow = (overrides: Record<string, unknown> = {}) => ({
  key: "pro", audience: "participant", module: "user_subscription", unit: "monthly", label: "Pro", amount: 19, currency: "eur", metadata: { stripe_price_id_monthly: "price_pro_handler", stripe_product_id: "prod_pro_handler" }, ...overrides,
});
const checkoutAddonRow = (overrides: Record<string, unknown> = {}) => ({
  key: "featured_listing", audience: "participant", module: "adhoc_charges", unit: "per_listing", label: "Featured listing", amount: 39, currency: "eur", metadata: { stripe_price_id: "price_addon_handler", stripe_product_id: "prod_addon_handler" }, ...overrides,
});

const checkoutFixture = async (
  options: {
    input: Record<string, unknown>;
    profile?: Record<string, unknown>;
    subscriptions?: Array<Record<string, unknown>>;
    catalog?: Record<string, unknown> | null;
    runtime?: string;
    catalogError?: boolean;
    mock?: boolean;
    stripePrice?: Record<string, unknown>;
    trialInsertError?: string;
    trialMissingId?: boolean;
    trialUpdateError?: boolean;
    trialDeleteError?: boolean;
    sessionError?: boolean;
    sessionStoredThenError?: boolean;
    customerSaveError?: boolean;
  },
  inspect: (response: Response, body: Record<string, unknown>, calls: CheckoutCall[], context: { repeat: () => Promise<{ response: Response; body: Record<string, unknown> }>; storedSessions: Map<string, string> }) => void | Promise<void>,
) => {
  const priorFetch = globalThis.fetch;
  const envNames = ["STRIPE_RUNTIME_MODE", "STRIPE_EXPECTED_ACCOUNT_ID", "STRIPE_SECRET_KEY", "BILLING_MODE"];
  const priorEnv = new Map(envNames.map((name) => [name, Deno.env.get(name)]));
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  Deno.env.set("STRIPE_EXPECTED_ACCOUNT_ID", checkoutAccount);
  Deno.env.set("STRIPE_SECRET_KEY", "sk_test_checkout_handler");
  Deno.env.set("BILLING_MODE", options.mock ? "mock" : "live");
  const calls: CheckoutCall[] = [];
  const unexpected: string[] = [];
  const storedSessions = new Map<string, string>();
  let trialClaimCount = 0;
  let sessionAttempts = 0;
  const actor = `${checkoutActor.slice(0, -3)}${String(++checkoutActorNumber).padStart(3, "0")}`;
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = input instanceof Request ? input : new Request(input, init);
    const url = new URL(request.url);
    const method = request.method;
    const body = await request.text();
    const form = new URLSearchParams(body);
    calls.push({ method, url, body, form, key: request.headers.get("Idempotency-Key") });
    if (url.hostname === "test.supabase.co") {
      if (url.pathname === "/auth/v1/user" && method === "GET") return checkoutJson({ id: actor, email: "checkout@maiprop.test", aud: "authenticated", role: "authenticated" });
      if (url.pathname === "/rest/v1/rpc/current_billing_runtime_mode" && method === "POST") return checkoutJson(options.runtime ?? "test");
      if (url.pathname === "/rest/v1/profiles" && method === "GET") return checkoutJson([options.profile ?? { role: "buyer", participant_type: "buyer", subscription_product_id: null, force_pro_access: false, is_platform_admin: false }]);
      if (url.pathname === "/rest/v1/billing_subscriptions" && method === "GET") return checkoutJson(options.subscriptions ?? []);
      if (url.pathname === "/rest/v1/pricing_configs" && method === "GET") return options.catalogError ? checkoutJson({ message: "catalog unavailable" }, 500) : checkoutJson(options.catalog === null ? [] : [options.catalog ?? (options.input.addon_key || options.input.addonKey ? checkoutAddonRow() : checkoutPlanRow())]);
      if (url.pathname === "/rest/v1/billing_customers" && method === "POST") return options.customerSaveError ? checkoutJson({ message: "customer save failed" }, 500) : new Response(null, { status: 201 });
      if (url.pathname === "/rest/v1/subscription_trial_claims" && method === "POST") return options.trialInsertError ? checkoutJson({ code: options.trialInsertError, message: "claim unavailable" }, 409) : checkoutJson(options.trialMissingId ? {} : { id: `claim_checkout_handler_${++trialClaimCount}` }, 201);
      if (url.pathname === "/rest/v1/subscription_trial_claims" && method === "PATCH") return options.trialUpdateError ? checkoutJson({ message: "claim update failed" }, 500) : new Response(null, { status: 204 });
      if (url.pathname === "/rest/v1/subscription_trial_claims" && method === "DELETE") return options.trialDeleteError ? checkoutJson({ message: "synthetic claim release failure" }, 500) : new Response(null, { status: 204 });
    }
    if (url.hostname === "api.stripe.com") {
      if (url.pathname === "/v1/account" && method === "GET") return checkoutJson({ id: checkoutAccount });
      if (url.pathname === "/v1/balance" && method === "GET") return checkoutJson({ livemode: false, available: [], pending: [] });
      if (url.pathname === "/v1/customers/search" && method === "GET") return checkoutJson({ object: "search_result", data: [{ id: "cus_checkout_handler", metadata: { user_id: actor }, invoice_settings: { custom_fields: [{ name: "Company VAT", value: "EL802708301" }] } }], has_more: false });
      if (url.pathname.startsWith("/v1/prices/") && method === "GET") return checkoutJson(options.stripePrice ?? { id: "price_addon_handler", active: true, livemode: false, currency: "eur", unit_amount: 3900, product: "prod_addon_handler" });
      if (url.pathname === "/v1/checkout/sessions" && method === "POST") {
        sessionAttempts += 1;
        if (options.sessionStoredThenError) {
          if (!storedSessions.has(request.headers.get("Idempotency-Key") ?? "")) storedSessions.set(request.headers.get("Idempotency-Key") ?? "", `cs_stored_${storedSessions.size + 1}`);
          if (sessionAttempts <= 3) throw new Error("synthetic ambiguous transport after stored session");
        }
        if (options.sessionError) return checkoutJson({ error: { message: "synthetic checkout failure", type: "invalid_request_error" } }, 400);
        return checkoutJson({ id: options.sessionStoredThenError ? `cs_stored_${storedSessions.size}` : "cs_checkout_handler", object: "checkout.session", livemode: false, mode: form.get("mode"), status: "open", subscription: "sub_checkout_handler", url: "https://checkout.stripe.test/session" });
      }
    }
    unexpected.push(`${method} ${url}`);
    throw new Error(`Unexpected checkout transport ${method} ${url}`);
  };
  try {
    const repeat = async () => {
      const response = await handler(authedReq("POST", options.input, { "x-forwarded-for": `203.0.113.${checkoutActorNumber}` }));
      return { response, body: await response.json() as Record<string, unknown> };
    };
    const { response, body } = await repeat();
    await inspect(response, body, calls, { repeat, storedSessions });
    assertEquals(unexpected, []);
  } finally {
    globalThis.fetch = priorFetch;
    for (const [name, value] of priorEnv) {
      if (value === undefined) Deno.env.delete(name);
      else Deno.env.set(name, value);
    }
  }
};

Deno.test("checkout handler stops runtime, audience, duplicate, and catalog failures before Stripe creation", async () => {
  const cases = [
    { options: { input: { plan: "pro" }, runtime: "live" }, status: 503 },
    { options: { input: { plan: "pro" }, profile: { role: "agent", participant_type: null } }, status: 403 },
    { options: { input: { plan: "investor_private" } }, status: 403 },
    { options: { input: { plan: "pro", trial: true }, profile: { role: "buyer", participant_type: "buyer", subscription_product_id: "prod_paid" } }, status: 409 },
    { options: { input: { plan: "pro" }, subscriptions: [{ status: "active", audience: "participant", current_period_end: "2099-01-01T00:00:00Z" }] }, status: 409 },
    { options: { input: { plan: "pro" }, catalogError: true }, status: 503 },
    { options: { input: { plan: "pro" }, catalog: null }, status: 404 },
  ];
  for (const { options, status } of cases) {
    await checkoutFixture(options, (response, _body, calls) => {
      assertEquals(response.status, status);
      assertEquals(calls.some((call) => call.url.pathname === "/v1/checkout/sessions"), false);
      assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/billing_customers"), false);
    });
  }
});

Deno.test("trial checkout reserves before Stripe session and marks the claim afterward", async () => {
  await checkoutFixture({ input: { plan: "pro", trial: true } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals(body.checkout_type, "subscription_trial");
    const customer = calls.find((call) => call.url.pathname === "/rest/v1/billing_customers");
    const reserve = calls.find((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "POST");
    const session = calls.find((call) => call.url.pathname === "/v1/checkout/sessions");
    const mark = calls.find((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "PATCH");
    assertEquals(Boolean(customer && reserve && session && mark), true);
    assertEquals(calls.indexOf(customer!) < calls.indexOf(reserve!), true);
    assertEquals(calls.indexOf(reserve!) < calls.indexOf(session!), true);
    assertEquals(calls.indexOf(session!) < calls.indexOf(mark!), true);
    assertEquals(JSON.parse(reserve!.body).runtime_mode, "test");
    assertEquals(session!.form.get("payment_method_collection"), "always");
    assertEquals(session!.form.get("subscription_data[trial_settings][end_behavior][missing_payment_method]"), "cancel");
    assertEquals(session!.form.get("client_reference_id"), JSON.parse(reserve!.body).user_id);
    assertEquals(Boolean(session!.key && session!.key.length > 12), true);
    assertEquals(JSON.parse(mark!.body).status, "checkout_created");
    assertEquals(mark!.url.searchParams.get("id"), "eq.claim_checkout_handler_1");
  });
});

Deno.test("trial checkout duplicate reservation never creates Stripe session", async () => {
  await checkoutFixture({ input: { plan: "pro", trial: true }, trialInsertError: "23505" }, (response, _body, calls) => {
    assertEquals(response.status, 409);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/checkout/sessions").length, 0);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "DELETE").length, 0);
  });
});

Deno.test("trial checkout reserve storage failures never dispatch a provider session", async () => {
  for (const failure of [{ trialInsertError: "XX000" }, { trialMissingId: true }]) {
    await checkoutFixture({ input: { plan: "pro", trial: true }, ...failure }, (response, _body, calls) => {
      assertEquals(response.status, 500);
      assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "POST").length, 1);
      assertEquals(calls.some((call) => call.url.pathname === "/v1/checkout/sessions"), false);
      assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "DELETE"), false);
    });
  }
});

Deno.test("trial Checkout transport error releases the claim and returns failure", async () => {
  await checkoutFixture({ input: { plan: "pro", trial: true }, sessionStoredThenError: true }, async (response, _body, calls, context) => {
    assertEquals(response.status, 500);
    const create = calls.find((call) => call.url.pathname === "/v1/checkout/sessions");
    const release = calls.find((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "DELETE");
    assertEquals(Boolean(create && release), true);
    assertEquals(calls.indexOf(release!) > calls.indexOf(create!), true);
    assertEquals(release!.url.searchParams.get("id"), "eq.claim_checkout_handler_1");
    assertEquals(context.storedSessions.size, 1, "the fake stored the remote session before losing its response");
    const retry = await context.repeat();
    assertEquals(retry.response.status, 200);
    assertEquals(context.storedSessions.size, 2, "a new claim gives the same logical retry a second provider key");
    const keys = [...context.storedSessions.keys()];
    assertEquals(keys[0] === keys[1], false);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "POST").length, 2);
  });
});

Deno.test("trial Checkout definitive provider rejection attempts exact claim release even when release fails", async () => {
  for (const trialDeleteError of [false, true]) {
    await checkoutFixture({ input: { plan: "pro", trial: true }, sessionError: true, trialDeleteError }, (response, _body, calls) => {
      assertEquals(response.status, 500);
      const reserve = calls.find((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "POST");
      const session = calls.find((call) => call.url.pathname === "/v1/checkout/sessions" && call.method === "POST");
      const release = calls.find((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "DELETE");
      assertEquals(Boolean(reserve && session && release), true);
      assertEquals(calls.indexOf(reserve!) < calls.indexOf(session!), true);
      assertEquals(calls.indexOf(session!) < calls.indexOf(release!), true);
      assertEquals(release!.url.searchParams.get("id"), "eq.claim_checkout_handler_1");
      assertEquals(calls.filter((call) => call.url.pathname === "/v1/checkout/sessions" && call.method === "POST").length, 1);
      assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "PATCH"), false);
    });
  }
});

Deno.test("add-on checkout uses server catalog price, target, quantity and payment metadata", async () => {
  await checkoutFixture({ input: { addon_key: "featured_listing", quantity: 2, target_type: "listing", target_id: "listing-1", priceId: "price_attacker" }, profile: { role: "seller", participant_type: "seller" } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals(body.checkout_type, "addon");
    const session = calls.find((call) => call.url.pathname === "/v1/checkout/sessions");
    assertEquals(session?.form.get("line_items[0][price]"), "price_addon_handler");
    assertEquals(session?.form.get("line_items[0][quantity]"), "2");
    assertEquals(session?.form.get("mode"), "payment");
    for (const prefix of ["metadata", "payment_intent_data[metadata]", "invoice_creation[invoice_data][metadata]"]) {
      assertEquals(session?.form.get(`${prefix}[target_id]`), "listing-1");
      assertEquals(session?.form.get(`${prefix}[user_id]`)?.length, 36);
    }
    assertEquals(session?.form.get("subscription_data[metadata][addon_key]"), null);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/subscription_trial_claims"), false);
  });
});

Deno.test("add-on handler rejects malformed quantities and provider price mismatch before customer writes", async () => {
  for (const value of [0, 101, 1.5, {}]) {
    await checkoutFixture({ input: { addon_key: "featured_listing", quantity: value } }, (response, _body, calls) => {
      assertEquals(response.status, 400);
      assertEquals(calls.some((call) => call.url.pathname === "/v1/checkout/sessions"), false);
    });
  }
  await checkoutFixture({ input: { addon_key: "featured_listing" }, profile: { role: "seller", participant_type: "seller" }, stripePrice: { id: "price_addon_handler", active: true, livemode: false, currency: "eur", unit_amount: 1, product: "prod_addon_handler" } }, (response, _body, calls) => {
    assertEquals(response.status, 500);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/billing_customers"), false);
    assertEquals(calls.some((call) => call.url.pathname === "/v1/checkout/sessions"), false);
  });
});

Deno.test("mock checkout still checks catalog and refuses trial", async () => {
  await checkoutFixture({ input: { plan: "pro" }, mock: true }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals(body.mock, true);
    assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
  });
  await checkoutFixture({ input: { plan: "pro", trial: true }, mock: true }, (response, _body, calls) => {
    assertEquals(response.status, 503);
    assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
  });
});

Deno.test("checkout same-audience lookup ignores expired and unrelated rows but blocks null end", async () => {
  for (const row of [
    { status: "active", audience: "participant", current_period_end: null },
    { status: "past_due", audience: "participant", current_period_end: "2099-01-01T00:00:00Z" },
  ]) {
    await checkoutFixture({ input: { plan: "pro" }, subscriptions: [row] }, (response, _body, calls) => {
      assertEquals(response.status, 409);
      const lookup = calls.find((call) => call.url.pathname === "/rest/v1/billing_subscriptions");
      assertEquals(lookup?.url.searchParams.get("runtime_mode"), "eq.test");
      assertEquals(lookup?.url.searchParams.get("livemode"), "eq.false");
      assertEquals(lookup?.url.searchParams.get("limit"), "10");
      assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
    });
  }
  for (const row of [
    { status: "active", audience: "participant", current_period_end: "2020-01-01T00:00:00Z" },
    { status: "active", audience: "professional", current_period_end: "2099-01-01T00:00:00Z" },
    { status: "active", audience: "participant", current_period_end: "invalid-date" },
  ]) {
    await checkoutFixture({ input: { plan: "pro" }, subscriptions: [row] }, (response, _body, calls) => {
      assertEquals(response.status, 200);
      assertEquals(calls.filter((call) => call.url.pathname === "/v1/checkout/sessions").length, 1);
    });
  }
});

Deno.test("checkout trial post-session claim-write error keeps the reservation", async () => {
  await checkoutFixture({ input: { plan: "pro", trial: true }, trialUpdateError: true }, (response, _body, calls) => {
    assertEquals(response.status, 500);
    assertEquals(calls.filter((call) => call.url.pathname === "/v1/checkout/sessions").length, 1);
    assertEquals(calls.filter((call) => call.url.pathname === "/rest/v1/subscription_trial_claims" && call.method === "DELETE").length, 0);
  });
});

Deno.test("checkout rejects incomplete add-on target before catalog and provider requests", async () => {
  await checkoutFixture({ input: { addon_key: "featured_listing", target_type: "listing" } }, (response, _body, calls) => {
    assertEquals(response.status, 400);
    assertEquals(calls.some((call) => call.url.pathname === "/rest/v1/pricing_configs"), false);
    assertEquals(calls.some((call) => call.url.hostname === "api.stripe.com"), false);
  });
});

Deno.test("checkout recurring report add-on selects subscription metadata without payment invoice", async () => {
  const catalog = { key: "valuation_single", audience: "participant", module: "valuation_reports", unit: "monthly", amount: 19, currency: "eur", metadata: { stripe_price_id: "price_addon_handler", stripe_product_id: "prod_addon_handler" } };
  await checkoutFixture({ input: { addon_key: "valuation_single" }, catalog, stripePrice: { id: "price_addon_handler", active: true, livemode: false, currency: "eur", unit_amount: 1900, product: "prod_addon_handler" } }, (response, body, calls) => {
    assertEquals(response.status, 200);
    assertEquals(body.checkout_type, "addon");
    const session = calls.find((call) => call.url.pathname === "/v1/checkout/sessions");
    assertEquals(session?.form.get("mode"), "subscription");
    assertEquals(session?.form.get("subscription_data[metadata][addon_key]"), "valuation_single");
    assertEquals(session?.form.get("payment_intent_data[metadata][addon_key]"), null);
    assertEquals(session?.form.get("invoice_creation[enabled]"), null);
  });
});

Deno.test("checkout refuses session creation when durable customer persistence fails", async () => {
  for (const input of [{ plan: "pro" }, { addon_key: "featured_listing" }]) {
    await checkoutFixture({ input, profile: input.addon_key ? { role: "seller", participant_type: "seller" } : undefined, customerSaveError: true }, (response, _body, calls) => {
      assertEquals(response.status, 500);
      assertEquals(calls.some((call) => call.url.pathname === "/v1/checkout/sessions"), false);
    });
  }
});

Deno.test("checkout redirects reject unsafe paths and change the provider key when the safe path changes", async () => {
  const input: Record<string, unknown> = { plan: "pro", success_url: "https://attacker.test/paid", cancel_url: "//attacker.test/cancel" };
  await checkoutFixture({ input }, async (response, _body, calls, context) => {
    assertEquals(response.status, 200);
    const first = calls.find((call) => call.url.pathname === "/v1/checkout/sessions" && call.method === "POST")!;
    assertEquals(first.form.get("success_url"), "https://maiprop.co/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}");
    assertEquals(first.form.get("cancel_url"), "https://maiprop.co/pricing?checkout=cancelled");
    input.success_url = "/pricing?checkout=success&session_id=attacker#details";
    input.cancel_url = "/pricing?checkout=cancelled";
    const second = await context.repeat();
    assertEquals(second.response.status, 200);
    const sessions = calls.filter((call) => call.url.pathname === "/v1/checkout/sessions" && call.method === "POST");
    assertEquals(sessions.length, 2);
    assertEquals(sessions[1].form.get("success_url"), "https://maiprop.co/pricing?checkout=success&session_id={CHECKOUT_SESSION_ID}#details");
    assertEquals(sessions[1].form.get("cancel_url"), "https://maiprop.co/pricing?checkout=cancelled");
    assertEquals(first.key === sessions[1].key, false);
  });
});
