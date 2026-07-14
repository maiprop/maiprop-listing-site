/**
 * Tests for check-subscription edge function.
 */
import {
  assertEquals,
  assertRejects,
  assertStringIncludes,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const originalStripeRuntimeMode = Deno.env.get("STRIPE_RUNTIME_MODE");
Deno.env.set("STRIPE_RUNTIME_MODE", "test");

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);
const {
  getDatabaseFallback,
  resolveSubscriptionCheck,
  resolveSubscriptionResponse,
} = await import("./index.ts");

Deno.test("OPTIONS preflight returns 200", async () => {
  const res = await handler(req("OPTIONS"));
  assertEquals(res.status, 200);
  assertEquals(
    res.headers.get("Access-Control-Allow-Origin"),
    "https://maiprop.co",
  );
});

Deno.test("missing Authorization returns 401", async () => {
  const res = await handler(req("POST"));
  assertEquals(res.status, 401);
});

Deno.test("fake Bearer token does not pass authentication", async () => {
  const res = await handler(authedReq("POST"));
  assertEquals([401, 429].includes(res.status), true);
});

Deno.test("normal subscription checks are DB-only even when Stripe is configured", async () => {
  let stripeFactoryCalls = 0;
  const result = await resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingRows: [{
        status: "active",
        stripe_product_id: "prod_participant",
        current_period_end: "2099-06-30T00:00:00.000Z",
        plan_key: "pro",
        audience: "participant",
        billing_cycle: "monthly",
      }],
    }),
    "00000000-0000-4000-8000-000000000020",
    {},
    {
      stripeKey: "sk_test_configured",
      createStripe() {
        stripeFactoryCalls += 1;
        throw new Error("Stripe must not be constructed for a normal check");
      },
    },
  );

  assertEquals(stripeFactoryCalls, 0);
  assertEquals(result.httpStatus, 200);
  assertEquals(result.state.subscribed, true);
  assertEquals(result.state.product_id, "prod_participant");
  assertEquals(result.state.sync_status, "synced");
});

Deno.test("subscription checks contain no broad Stripe customer or subscription listing", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertEquals(source.includes("customers.search"), false);
  assertEquals(source.includes("subscriptions.list"), false);
});

Deno.test("legacy profile product ids are never an entitlement source", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  assertEquals(source.includes("allowProfileEntitlement"), false);
  assertEquals(source.includes("subscription_product_id"), false);
});

Deno.test("explicit reconciliation retrieves the exact session and heals missing durable state", async () => {
  const stripeCalls: Array<{
    id: string;
    params: unknown;
    options: unknown;
  }> = [];
  const billingRows: Array<Record<string, unknown>> = [];
  const billingWrites: Array<Record<string, unknown>> = [];
  const result = await resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingRows,
      billingWrites,
      pricingRows: [{
        key: "pro",
        audience: "participant",
        metadata: { stripe_product_id: "prod_participant" },
      }],
    }),
    "00000000-0000-4000-8000-000000000021",
    { checkout_session_id: "cs_test_exact_session" },
    {
      stripeKey: "sk_test_configured",
      createStripe() {
        return {
          checkout: {
            sessions: {
              retrieve(id: string, params: unknown, options: unknown) {
                stripeCalls.push({ id, params, options });
                return Promise.resolve({
                  id,
                  mode: "subscription",
                  status: "complete",
                  livemode: false,
                  customer: "cus_exact",
                  client_reference_id: "00000000-0000-4000-8000-000000000021",
                  metadata: {
                    user_id: "00000000-0000-4000-8000-000000000021",
                    checkout_type: "subscription",
                    audience: "participant",
                  },
                  subscription: {
                    id: "sub_exact",
                    status: "active",
                    livemode: false,
                    current_period_end: 4_102_444_800,
                    metadata: {
                      user_id: "00000000-0000-4000-8000-000000000021",
                      checkout_type: "subscription",
                      plan_key: "pro",
                      audience: "participant",
                      billing_cycle: "monthly",
                    },
                    items: {
                      data: [{
                        price: {
                          id: "price_participant_monthly",
                          product: "prod_participant",
                        },
                      }],
                    },
                  },
                });
              },
            },
          },
        } as never;
      },
    },
  );

  assertEquals(stripeCalls, [{
    id: "cs_test_exact_session",
    params: { expand: ["subscription"] },
    options: { timeout: 3_000, maxNetworkRetries: 0 },
  }]);
  assertEquals(result.httpStatus, 200);
  assertEquals(result.state.sync_status, "synced");
  assertEquals(result.state.subscribed, true);
  assertEquals(result.state.product_id, "prod_participant");
  assertEquals(billingRows.length, 1);
  assertEquals(
    billingWrites.some(({ table }) => table === "billing_subscriptions"),
    true,
  );
});

Deno.test("explicit reconciliation rejects a checkout session owned by another user", async () => {
  const billingRows: Array<Record<string, unknown>> = [];
  const result = await resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingRows,
      pricingRows: [{
        key: "pro",
        audience: "participant",
        metadata: { stripe_product_id: "prod_participant" },
      }],
    }),
    "00000000-0000-4000-8000-000000000022",
    { checkout_session_id: "cs_test_other_owner" },
    {
      stripeKey: "sk_test_configured",
      createStripe: () => ({
        checkout: {
          sessions: {
            retrieve: () =>
              Promise.resolve({
                id: "cs_test_other_owner",
                mode: "subscription",
                status: "complete",
                livemode: false,
                customer: "cus_other",
                metadata: {
                  user_id: "00000000-0000-4000-8000-000000000099",
                  checkout_type: "subscription",
                  audience: "participant",
                },
                subscription: {
                  id: "sub_other",
                  status: "active",
                  livemode: false,
                  current_period_end: 4_102_444_800,
                  metadata: {
                    user_id: "00000000-0000-4000-8000-000000000099",
                    checkout_type: "subscription",
                    plan_key: "pro",
                    audience: "participant",
                    billing_cycle: "monthly",
                  },
                  items: {
                    data: [{
                      price: {
                        id: "price_participant_monthly",
                        product: "prod_participant",
                      },
                    }],
                  },
                },
              } as never),
          },
        },
      }),
    },
  );

  assertEquals(result.httpStatus, 202);
  assertEquals(result.state.sync_status, "pending");
  assertEquals(result.state.subscribed, false);
  assertEquals(billingRows.length, 0);
});

const mockSupabase = (
  {
    profileProductId = null,
    profileRole = "investor",
    participantType = "investor",
    investorStatus = "active",
    investorExpiresAt = "2099-06-30T00:00:00.000Z",
    investorRows,
    billingRows = [],
    billingWrites = [],
    pricingRows = [],
    profileError = null,
    investorError = null,
    billingError = null,
    stallBillingLookup = false,
  }: {
    profileProductId?: string | null;
    profileRole?: string | null;
    participantType?: string | null;
    investorStatus?: string | null;
    investorExpiresAt?: string | null;
    investorRows?: Array<
      { status?: string | null; expires_at?: string | null }
    >;
    billingRows?: Array<Record<string, unknown>>;
    billingWrites?: Array<Record<string, unknown>>;
    pricingRows?: Array<Record<string, unknown>>;
    profileError?: { message: string } | null;
    investorError?: { message: string } | null;
    billingError?: { message: string } | null;
    stallBillingLookup?: boolean;
  },
) => ({
  marker: "this-aware-supabase-mock",
  from(table: string) {
    if (this?.marker !== "this-aware-supabase-mock") {
      throw new Error("from called without Supabase client binding");
    }
    let rowLimit: number | null = null;
    const chain = {
      select() {
        return chain;
      },
      eq() {
        return chain;
      },
      in() {
        return chain;
      },
      limit(value: number) {
        rowLimit = value;
        return chain;
      },
      order() {
        return chain;
      },
      upsert(payload: Record<string, unknown>) {
        billingWrites.push({ table, payload });
        if (table === "billing_subscriptions") {
          const id = payload.stripe_subscription_id;
          const index = billingRows.findIndex((row) =>
            row.stripe_subscription_id === id
          );
          if (index >= 0) {
            billingRows[index] = { ...billingRows[index], ...payload };
          } else billingRows.push(payload);
        }
        return Promise.resolve({ error: null });
      },
      maybeSingle() {
        if (table === "profiles") {
          return Promise.resolve({
            data: {
              role: profileRole,
              participant_type: participantType,
              subscription_product_id: profileProductId,
            },
            error: profileError,
          });
        }
        if (table === "investor_subscriptions") {
          return Promise.resolve({
            data: investorStatus
              ? { status: investorStatus, expires_at: investorExpiresAt }
              : null,
            error: null,
          });
        }
        if (table === "billing_subscriptions") {
          return Promise.resolve({
            data: billingRows[0] ?? null,
            error: billingError,
          });
        }
        return Promise.resolve({ data: null, error: null });
      },
      then(resolve: (value: unknown) => void) {
        if (table === "investor_subscriptions") {
          resolve({
            data: investorRows ??
              (investorStatus
                ? [{ status: investorStatus, expires_at: investorExpiresAt }]
                : []),
            error: investorError,
          });
          return;
        }
        if (table === "billing_subscriptions") {
          if (stallBillingLookup) return;
          resolve({
            data: rowLimit === null
              ? billingRows
              : billingRows.slice(0, rowLimit),
            error: billingError,
          });
          return;
        }
        if (table === "pricing_configs") {
          resolve({ data: pricingRows, error: null });
          return;
        }
        resolve({ data: null, error: null });
      },
    };
    return chain;
  },
});

function completedSubscriptionSession(
  userId: string,
  overrides: {
    mode?: string;
    checkoutType?: string;
    sessionAudience?: string;
    subscriptionAudience?: string;
    livemode?: boolean;
    subscriptionStatus?: string;
    trialEnd?: number | null;
  } = {},
) {
  const audience = overrides.sessionAudience ?? "participant";
  const subscriptionAudience = overrides.subscriptionAudience ?? audience;
  const productId = audience === "developer"
    ? "prod_developer"
    : "prod_participant";
  const planKey = audience === "developer" ? "developer_pro" : "pro";
  return {
    id: overrides.livemode ? "cs_live_validation" : "cs_test_validation",
    mode: overrides.mode ?? "subscription",
    status: "complete",
    livemode: overrides.livemode ?? false,
    customer: "cus_validation",
    client_reference_id: userId,
    metadata: {
      user_id: userId,
      checkout_type: overrides.checkoutType ?? "subscription",
      audience,
    },
    subscription: {
      id: "sub_validation",
      status: overrides.subscriptionStatus ?? "active",
      livemode: overrides.livemode ?? false,
      current_period_end: 4_102_444_800,
      trial_end: overrides.trialEnd,
      metadata: {
        user_id: userId,
        checkout_type: overrides.checkoutType ?? "subscription",
        plan_key: planKey,
        audience: subscriptionAudience,
        billing_cycle: "monthly",
      },
      items: {
        data: [{
          price: {
            id: `price_${audience}_monthly`,
            product: productId,
          },
        }],
      },
    },
  };
}

function stripeOptionsForSession(session: Record<string, unknown>) {
  return {
    stripeKey: "sk_test_configured",
    createStripe: () => ({
      checkout: {
        sessions: {
          retrieve: () => Promise.resolve(session as never),
        },
      },
    }),
  };
}

function completedAddonSession(
  userId: string,
  overrides: {
    paymentStatus?: string;
    livemode?: boolean;
    checkoutType?: string;
    addonKey?: string;
  } = {},
) {
  return {
    id: overrides.livemode
      ? "cs_live_addon_reconciliation"
      : "cs_test_addon_reconciliation",
    mode: "payment",
    status: "complete",
    payment_status: overrides.paymentStatus ?? "paid",
    livemode: overrides.livemode ?? false,
    customer: "cus_addon_owner",
    client_reference_id: userId,
    payment_intent: "pi_addon_reconciliation",
    metadata: {
      checkout_type: overrides.checkoutType ?? "addon",
      user_id: userId,
      addon_key: overrides.addonKey ?? "featured_listing",
      module: "adhoc_charges",
      audience: "participant",
      unit: "per_listing",
      quantity: "1",
      runtime_mode: overrides.livemode ? "live" : "test",
    },
    subscription: null,
  };
}

Deno.test("exact payment-mode reconciliation fulfills a paid promotion add-on", async () => {
  const userId = "00000000-0000-4000-8000-000000000032";
  const session = completedAddonSession(userId);
  const fulfilledSessions: string[] = [];
  const result = await resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
    }),
    userId,
    { checkout_session_id: session.id },
    {
      ...stripeOptionsForSession(session),
      fulfillAddonCheckout: (_supabase: unknown, candidate: { id: string }) => {
        fulfilledSessions.push(candidate.id);
        return Promise.resolve("fulfilled" as const);
      },
    } as never,
  );

  assertEquals(fulfilledSessions, [session.id]);
  assertEquals(result.httpStatus, 200);
  assertEquals(result.state.sync_status, "synced");
  assertEquals(result.state.subscribed, false);
});

Deno.test("exact add-on reconciliation rejects foreign, unpaid, wrong-runtime, and unsupported sessions", async () => {
  const userId = "00000000-0000-4000-8000-000000000033";
  const invalidSessions = [
    completedAddonSession("00000000-0000-4000-8000-000000000099"),
    completedAddonSession(userId, { paymentStatus: "unpaid" }),
    {
      ...completedAddonSession(userId),
      livemode: true,
    },
    completedAddonSession(userId, { checkoutType: "investor_payment" }),
  ];

  for (const session of invalidSessions) {
    let fulfillmentCalls = 0;
    const result = await resolveSubscriptionCheck(
      mockSupabase({
        profileRole: "buyer",
        participantType: "buyer",
        investorStatus: null,
      }),
      userId,
      { checkout_session_id: session.id },
      {
        ...stripeOptionsForSession(session),
        fulfillAddonCheckout: () => {
          fulfillmentCalls += 1;
          return Promise.resolve("fulfilled" as const);
        },
      } as never,
    );

    assertEquals(fulfillmentCalls, 0, JSON.stringify(session));
    assertEquals(result.httpStatus, 202, JSON.stringify(session));
    assertEquals(result.state.sync_status, "pending", JSON.stringify(session));
  }
});

Deno.test("explicit reconciliation validates subscription mode and matching audience metadata", async () => {
  const userId = "00000000-0000-4000-8000-000000000023";
  const invalidSessions = [
    completedSubscriptionSession(userId, { mode: "payment" }),
    completedSubscriptionSession(userId, { checkoutType: "addon" }),
    completedSubscriptionSession(userId, { sessionAudience: "developer" }),
    completedSubscriptionSession(userId, {
      subscriptionAudience: "developer",
    }),
  ];

  for (const session of invalidSessions) {
    const billingRows: Array<Record<string, unknown>> = [];
    const result = await resolveSubscriptionCheck(
      mockSupabase({
        profileRole: "buyer",
        participantType: "buyer",
        investorStatus: null,
        billingRows,
        pricingRows: [{
          key: "pro",
          audience: "participant",
          metadata: { stripe_product_id: "prod_participant" },
        }],
      }),
      userId,
      { checkout_session_id: session.id },
      stripeOptionsForSession(session),
    );

    assertEquals(result.httpStatus, 202, JSON.stringify(session.metadata));
    assertEquals(result.state.sync_status, "pending");
    assertEquals(billingRows.length, 0);
  }
});

Deno.test("explicit reconciliation rejects expired and missing trial windows", async () => {
  const userId = "00000000-0000-4000-8000-000000000027";
  const durableRow = {
    stripe_subscription_id: "sub_validation",
    status: "active",
    stripe_product_id: "prod_participant",
    current_period_end: "2099-06-30T00:00:00.000Z",
    plan_key: "pro",
    audience: "participant",
    billing_cycle: "monthly",
  };
  const invalidTrials = [
    completedSubscriptionSession(userId, {
      checkoutType: "subscription_trial",
      subscriptionStatus: "trialing",
      trialEnd: Math.floor(Date.now() / 1_000) - 60,
    }),
    completedSubscriptionSession(userId, {
      checkoutType: "subscription_trial",
      subscriptionStatus: "trialing",
      trialEnd: null,
    }),
  ];

  for (const session of invalidTrials) {
    const result = await resolveSubscriptionCheck(
      mockSupabase({
        profileRole: "buyer",
        participantType: "buyer",
        investorStatus: null,
        billingRows: [durableRow],
        pricingRows: [{
          key: "pro",
          audience: "participant",
          metadata: { stripe_product_id: "prod_participant" },
        }],
      }),
      userId,
      { checkout_session_id: session.id },
      stripeOptionsForSession(session),
    );

    assertEquals(result.httpStatus, 202);
    assertEquals(result.state.sync_status, "pending");
    assertEquals(result.state.subscribed, true);
  }
});

Deno.test("explicit reconciliation accepts a future trial after its webhook row is durable", async () => {
  const userId = "00000000-0000-4000-8000-000000000028";
  const trialEnd = Math.floor(Date.now() / 1_000) + 3_600;
  const session = completedSubscriptionSession(userId, {
    checkoutType: "subscription_trial",
    subscriptionStatus: "trialing",
    trialEnd,
  });
  const result = await resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingRows: [{
        stripe_subscription_id: "sub_validation",
        status: "trialing",
        stripe_product_id: "prod_participant",
        current_period_end: null,
        trial_end: new Date(trialEnd * 1_000).toISOString(),
        plan_key: "pro",
        audience: "participant",
        billing_cycle: "monthly",
      }],
      pricingRows: [{
        key: "pro",
        audience: "participant",
        metadata: { stripe_product_id: "prod_participant" },
      }],
    }),
    userId,
    { checkout_session_id: session.id },
    stripeOptionsForSession(session),
  );

  assertEquals(result.httpStatus, 200);
  assertEquals(result.state.sync_status, "synced");
  assertEquals(result.state.subscribed, true);
  assertEquals(result.state.status, "trialing");
});

Deno.test("explicit reconciliation never crosses the configured Stripe runtime", async () => {
  const previousRuntime = Deno.env.get("STRIPE_RUNTIME_MODE");
  Deno.env.set("STRIPE_RUNTIME_MODE", "test");
  try {
    let stripeFactoryCalls = 0;
    const userId = "00000000-0000-4000-8000-000000000024";
    const liveSession = completedSubscriptionSession(userId, {
      livemode: true,
    });
    const result = await resolveSubscriptionCheck(
      mockSupabase({
        profileRole: "buyer",
        participantType: "buyer",
        investorStatus: null,
      }),
      userId,
      { checkout_session_id: liveSession.id },
      {
        stripeKey: "sk_live_configured",
        createStripe: () => {
          stripeFactoryCalls += 1;
          return stripeOptionsForSession(liveSession).createStripe();
        },
      },
    );

    assertEquals(stripeFactoryCalls, 0);
    assertEquals(result.httpStatus, 202);
    assertEquals(result.state.sync_status, "pending");
    assertEquals(result.state.subscribed, false);
  } finally {
    if (previousRuntime === undefined) Deno.env.delete("STRIPE_RUNTIME_MODE");
    else Deno.env.set("STRIPE_RUNTIME_MODE", previousRuntime);
  }
});

Deno.test("explicit reconciliation idempotently refreshes an existing durable row", async () => {
  const userId = "00000000-0000-4000-8000-000000000026";
  const session = completedSubscriptionSession(userId);
  const billingWrites: Array<Record<string, unknown>> = [];
  const result = await resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingWrites,
      billingRows: [{
        stripe_subscription_id: "sub_validation",
        status: "active",
        stripe_product_id: "prod_participant",
        current_period_end: "2099-06-30T00:00:00.000Z",
        plan_key: "pro",
        audience: "participant",
        billing_cycle: "monthly",
      }],
      pricingRows: [{
        key: "pro",
        audience: "participant",
        metadata: { stripe_product_id: "prod_participant" },
      }],
    }),
    userId,
    { checkout_session_id: session.id },
    stripeOptionsForSession(session),
  );

  assertEquals(result.httpStatus, 200);
  assertEquals(result.state.sync_status, "synced");
  assertEquals(result.state.subscribed, true);
  assertEquals(result.state.product_id, "prod_participant");
  assertEquals(
    billingWrites.some(({ table }) => table === "billing_subscriptions"),
    true,
  );
});

Deno.test("checkout reconciliation hard-timeout returns the durable cached state", async () => {
  const userId = "00000000-0000-4000-8000-000000000025";
  const timeoutOptions = {
    stripeKey: "sk_test_configured",
    reconciliationTimeoutMs: 5,
    createStripe: () => ({
      checkout: {
        sessions: {
          retrieve: () => new Promise<never>(() => {}),
        },
      },
    }),
  } as unknown as Parameters<typeof resolveSubscriptionCheck>[3];
  const reconciliation = resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingRows: [{
        status: "active",
        stripe_product_id: "prod_cached",
        current_period_end: "2099-06-30T00:00:00.000Z",
        plan_key: "pro",
        audience: "participant",
        billing_cycle: "monthly",
      }],
    }),
    userId,
    { checkout_session_id: "cs_test_never_settles" },
    timeoutOptions,
  );
  let testCeilingId: ReturnType<typeof setTimeout> | undefined;
  const testCeiling = new Promise<never>((_resolve, reject) => {
    testCeilingId = setTimeout(
      () => reject(new Error("reconciliation exceeded test ceiling")),
      250,
    );
  });

  const result = await Promise.race([reconciliation, testCeiling]).finally(
    () => {
      if (testCeilingId !== undefined) clearTimeout(testCeilingId);
    },
  );

  assertEquals(result.httpStatus, 200);
  assertEquals(result.state.sync_status, "timeout");
  assertEquals(result.state.subscribed, true);
  assertEquals(result.state.product_id, "prod_cached");
});

Deno.test("whole subscription check deadline bounds stalled database work", async () => {
  const operation = resolveSubscriptionCheck(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      stallBillingLookup: true,
    }),
    "00000000-0000-4000-8000-000000000029",
    {},
    { handlerTimeoutMs: 5 } as never,
  );

  let ceilingId: ReturnType<typeof setTimeout> | undefined;
  const ceiling = new Promise<never>((_resolve, reject) => {
    ceilingId = setTimeout(
      () => reject(new Error("whole handler deadline exceeded test ceiling")),
      250,
    );
  });
  const result = await Promise.race([operation, ceiling]).finally(() => {
    if (ceilingId !== undefined) clearTimeout(ceilingId);
  });

  assertEquals(result.httpStatus, 503);
  assertEquals(result.state.sync_status, "timeout");
  assertEquals(result.state.subscribed, false);
});

Deno.test("database fallback prefers durable Stripe billing subscriptions over live Stripe lookups", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingRows: [
        {
          status: "active",
          stripe_product_id: "prod_participant",
          current_period_end: "2099-06-30T00:00:00.000Z",
          plan_key: "pro",
          audience: "participant",
          billing_cycle: "monthly",
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000013",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, "prod_participant");
  assertEquals(state.subscription_end, "2099-06-30T00:00:00.000Z");
  assertEquals(state.source, "billing_state");
  assertEquals(state.plan_key, "pro");
  assertEquals(state.audience, "participant");
  assertEquals(state.billing_cycle, "monthly");
});

Deno.test("database fallback ignores durable subscriptions from a previous role audience", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "developer",
      participantType: "developer",
      investorStatus: null,
      billingRows: [
        {
          status: "active",
          stripe_product_id: "prod_participant",
          current_period_end: "2099-06-30T00:00:00.000Z",
          plan_key: "pro",
          audience: "participant",
          billing_cycle: "monthly",
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000014",
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.source, "database");
});

Deno.test("database fallback picks the current audience when old and new durable subscriptions overlap", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "developer",
      participantType: "developer",
      investorStatus: null,
      billingRows: [
        {
          status: "active",
          stripe_product_id: "prod_participant",
          current_period_end: "2099-06-30T00:00:00.000Z",
          plan_key: "pro",
          audience: "participant",
          billing_cycle: "monthly",
        },
        {
          status: "active",
          stripe_product_id: "prod_developer",
          current_period_end: "2099-07-31T00:00:00.000Z",
          plan_key: "developer_pro",
          audience: "developer",
          billing_cycle: "annual",
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000015",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, "prod_developer");
  assertEquals(state.plan_key, "developer_pro");
  assertEquals(state.audience, "developer");
  assertEquals(state.billing_cycle, "annual");
});

Deno.test("database fallback treats active post-trial renewal as subscribed", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "agent",
      participantType: "agent",
      investorStatus: null,
      billingRows: [
        {
          status: "active",
          stripe_product_id: "prod_agent",
          current_period_end: "2099-07-31T00:00:00.000Z",
          plan_key: "agent_basic",
          audience: "agent",
          billing_cycle: "monthly",
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000016",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, "prod_agent");
  assertEquals(state.plan_key, "agent_basic");
  assertEquals(state.audience, "agent");
});

Deno.test("database fallback keeps failed post-trial payment in recovery grace", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "professional",
      participantType: "professional",
      investorStatus: null,
      billingRows: [
        {
          status: "past_due",
          stripe_product_id: "prod_professional",
          current_period_end: "2099-07-31T00:00:00.000Z",
          plan_key: "professional_basic",
          audience: "professional",
          billing_cycle: "monthly",
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000017",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, "prod_professional");
  assertEquals(state.plan_key, "professional_basic");
  assertEquals(state.audience, "professional");
});

Deno.test("database fallback rejects active and past-due rows without a bounded period", async () => {
  for (const status of ["active", "past_due"]) {
    const state = await getDatabaseFallback(
      mockSupabase({
        profileRole: "buyer",
        participantType: "buyer",
        investorStatus: null,
        billingRows: [{
          status,
          stripe_product_id: "prod_participant",
          current_period_end: null,
          plan_key: "pro",
          audience: "participant",
          billing_cycle: "monthly",
        }],
      }),
      "00000000-0000-4000-8000-000000000030",
    );
    assertEquals(state.subscribed, false, status);
  }
});

Deno.test("database fallback finds a valid current-audience row after five legacy rows", async () => {
  const rows = Array.from({ length: 5 }, (_, index) => ({
    stripe_subscription_id: `sub_legacy_${index}`,
    status: "active",
    stripe_product_id: "prod_participant",
    current_period_end: "2099-06-30T00:00:00.000Z",
    plan_key: "pro",
    audience: "participant",
    billing_cycle: "monthly",
  }));
  rows.push({
    stripe_subscription_id: "sub_current_developer",
    status: "active",
    stripe_product_id: "prod_developer",
    current_period_end: "2099-07-31T00:00:00.000Z",
    plan_key: "developer_pro",
    audience: "developer",
    billing_cycle: "annual",
  });

  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "developer",
      participantType: "developer",
      investorStatus: null,
      billingRows: rows,
    }),
    "00000000-0000-4000-8000-000000000031",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, "prod_developer");
  assertEquals(state.plan_key, "developer_pro");
});

Deno.test("database fallback uses trial_end for active trial access", async () => {
  const trialEnd = "2099-07-07T00:00:00.000Z";
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: null,
      billingRows: [
        {
          status: "trialing",
          stripe_product_id: "prod_participant",
          current_period_end: null,
          trial_end: trialEnd,
          plan_key: "pro",
          audience: "participant",
          billing_cycle: "monthly",
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000019",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, "prod_participant");
  assertEquals(state.subscription_end, trialEnd);
  assertEquals(state.plan_key, "pro");
});

Deno.test("database fallback scopes durable subscriptions to the active Stripe runtime and livemode", async () => {
  const source = await Deno.readTextFile(
    new URL("./index.ts", import.meta.url),
  );
  const lookupStart = source.indexOf('client.from("billing_subscriptions")');
  const lookupEnd = source.indexOf('.in("status"', lookupStart);
  const lookup = source.slice(lookupStart, lookupEnd);

  assertStringIncludes(lookup, '.eq("runtime_mode", runtimeMode)');
  assertStringIncludes(lookup, '.eq("livemode", runtimeMode === "live")');

  const investorLookupStart = source.indexOf(
    'client.from("investor_subscriptions")',
  );
  const investorLookupEnd = source.indexOf('.in("status"', investorLookupStart);
  const investorLookup = source.slice(investorLookupStart, investorLookupEnd);
  assertStringIncludes(investorLookup, '.eq("runtime_mode", runtimeMode)');
  assertStringIncludes(
    investorLookup,
    '.eq("livemode", runtimeMode === "live")',
  );
});

Deno.test("database fallback rejects stale trial rows after the period expires", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "developer",
      participantType: "developer",
      investorStatus: null,
      billingRows: [
        {
          status: "trialing",
          stripe_product_id: "prod_developer",
          current_period_end: null,
          trial_end: "2000-01-01T00:00:00.000Z",
          plan_key: "developer_pro",
          audience: "developer",
          billing_cycle: "monthly",
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000018",
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.source, "database");
});

Deno.test("database fallback ignores terminal post-trial statuses", async () => {
  for (const status of ["canceled", "unpaid", "paused", "incomplete_expired"]) {
    const state = await getDatabaseFallback(
      mockSupabase({
        profileRole: "buyer",
        participantType: "buyer",
        investorStatus: null,
        billingRows: [
          {
            status,
            stripe_product_id: "prod_participant",
            current_period_end: "2099-07-31T00:00:00.000Z",
            plan_key: "pro",
            audience: "participant",
            billing_cycle: "monthly",
          },
        ],
      }),
      `00000000-0000-0000-0000-0000000000${status.length}`,
    );

    assertEquals(state.subscribed, false, status);
    assertEquals(state.product_id, null, status);
  }
});

Deno.test("database fallback never carries investor access across audiences", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileRole: "buyer",
      participantType: "buyer",
      investorStatus: "active",
      investorExpiresAt: "2099-06-30T00:00:00.000Z",
    }),
    "00000000-0000-4000-8000-000000000029",
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.source, "database");
});

Deno.test("subscription response preserves active invite-only investor fallback when Stripe has no entitlement", async () => {
  const state = await resolveSubscriptionResponse(
    mockSupabase({
      profileProductId: "prod_investor",
      investorStatus: "active",
      pricingRows: [
        {
          key: "pro",
          audience: "investor",
          metadata: { stripe_product_id: "prod_investor" },
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000001",
    {
      customerFound: true,
      entitlement: null,
      subscriptionEnd: null,
    },
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, "2099-06-30T00:00:00.000Z");
  assertEquals(state.source, "investor");
});

Deno.test("subscription response ignores stale profile product when Stripe customer has no entitlement", async () => {
  const state = await resolveSubscriptionResponse(
    mockSupabase({
      profileProductId: "prod_investor",
      investorStatus: null,
      pricingRows: [
        {
          key: "pro",
          audience: "investor",
          metadata: { stripe_product_id: "prod_investor" },
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000002",
    {
      customerFound: true,
      entitlement: null,
      subscriptionEnd: null,
    },
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, null);
  assertEquals(state.source, "stripe");
});

Deno.test("subscription response ignores stale profile product when Stripe lookup finds no customer", async () => {
  const state = await resolveSubscriptionResponse(
    mockSupabase({
      profileProductId: "prod_investor",
      investorStatus: null,
      pricingRows: [
        {
          key: "pro",
          audience: "investor",
          metadata: { stripe_product_id: "prod_investor" },
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000008",
    {
      customerFound: false,
      entitlement: null,
      subscriptionEnd: null,
    },
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, null);
  assertEquals(state.source, "database");
});

Deno.test("database fallback ignores stale profile product when profile entitlement is disabled", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileProductId: "prod_investor",
      investorStatus: null,
      pricingRows: [
        {
          key: "pro",
          audience: "investor",
          metadata: { stripe_product_id: "prod_investor" },
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000004",
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, null);
  assertEquals(state.source, "database");
});

Deno.test("database fallback ignores stale profile product by default for no-Stripe-key path", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      profileProductId: "prod_investor",
      investorStatus: null,
      pricingRows: [
        {
          key: "pro",
          audience: "investor",
          metadata: { stripe_product_id: "prod_investor" },
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000005",
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, null);
  assertEquals(state.source, "database");
});

Deno.test("database fallback rejects expired active investor subscription", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      investorStatus: "active",
      investorExpiresAt: "2000-01-01T00:00:00.000Z",
    }),
    "00000000-0000-0000-0000-000000000006",
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, null);
  assertEquals(state.source, "database");
});

Deno.test("database fallback allows mixed expired and valid investor subscriptions", async () => {
  const validExpiresAt = "2099-06-30T00:00:00.000Z";
  const state = await getDatabaseFallback(
    mockSupabase({
      investorRows: [
        { status: "active", expires_at: "2000-01-01T00:00:00.000Z" },
        { status: "trial", expires_at: validExpiresAt },
      ],
    }),
    "00000000-0000-0000-0000-000000000009",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, validExpiresAt);
  assertEquals(state.source, "investor");
});

Deno.test("database fallback keeps Supabase client binding for real client methods", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      investorStatus: "active",
      investorExpiresAt: null,
    }),
    "00000000-0000-0000-0000-000000000012",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.source, "investor");
});

Deno.test("database fallback allows non-expiring trial investor subscription", async () => {
  const state = await getDatabaseFallback(
    mockSupabase({
      investorStatus: "trial",
      investorExpiresAt: null,
    }),
    "00000000-0000-0000-0000-000000000007",
  );

  assertEquals(state.subscribed, true);
  assertEquals(state.product_id, null);
  assertEquals(state.subscription_end, null);
  assertEquals(state.source, "investor");
});

Deno.test("database fallback surfaces Supabase query errors", async () => {
  await assertRejects(
    () =>
      getDatabaseFallback(
        mockSupabase({
          profileError: { message: "permission denied" },
        }),
        "00000000-0000-0000-0000-000000000010",
      ),
    Error,
    "profile subscription lookup failed",
  );

  await assertRejects(
    () =>
      getDatabaseFallback(
        mockSupabase({
          investorError: { message: "relation unavailable" },
        }),
        "00000000-0000-0000-0000-000000000011",
      ),
    Error,
    "investor subscription lookup failed",
  );
});

Deno.test("subscription response rejects cross-role product fallback when pricing audience does not match profile", async () => {
  const state = await resolveSubscriptionResponse(
    mockSupabase({
      profileProductId: "prod_participant",
      profileRole: "developer",
      participantType: "developer",
      investorStatus: null,
      pricingRows: [
        {
          key: "pro",
          audience: "participant",
          metadata: { stripe_product_id: "prod_participant" },
        },
      ],
    }),
    "00000000-0000-0000-0000-000000000003",
    {
      customerFound: true,
      entitlement: null,
      subscriptionEnd: null,
    },
  );

  assertEquals(state.subscribed, false);
  assertEquals(state.product_id, null);
  assertEquals(state.source, "stripe");
});

restore();
if (originalStripeRuntimeMode === undefined) {
  Deno.env.delete("STRIPE_RUNTIME_MODE");
} else {
  Deno.env.set("STRIPE_RUNTIME_MODE", originalStripeRuntimeMode);
}
