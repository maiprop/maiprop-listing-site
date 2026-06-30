/**
 * Tests for check-subscription edge function.
 */
import { assertEquals, assertRejects, assertStringIncludes } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { authedReq, captureHandler, req } from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
);
const { getDatabaseFallback, resolveSubscriptionResponse } = await import(
  "./index.ts"
);

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

const mockSupabase = (
  {
    profileProductId = null,
    profileRole = "investor",
    participantType = "investor",
    investorStatus = "active",
    investorExpiresAt = "2099-06-30T00:00:00.000Z",
    investorRows,
    billingRows = [],
    pricingRows = [],
    profileError = null,
    investorError = null,
    billingError = null,
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
    pricingRows?: Array<Record<string, unknown>>;
    profileError?: { message: string } | null;
    investorError?: { message: string } | null;
    billingError?: { message: string } | null;
  },
) => ({
  marker: "this-aware-supabase-mock",
  from(table: string) {
    if (this?.marker !== "this-aware-supabase-mock") {
      throw new Error("from called without Supabase client binding");
    }
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
      limit() {
        return chain;
      },
      order() {
        return chain;
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
          resolve({ data: billingRows, error: billingError });
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

Deno.test("live Stripe subscription checks fall back to item period fields", async () => {
  const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
  assertStringIncludes(source, "function getSubscriptionCurrentPeriodEnd");
  assertStringIncludes(source, "current_period_end?: number | null");
  assertStringIncludes(source, "subscription?.items.data[0]");
  assertStringIncludes(source, "rootPeriodEnd ?? itemPeriodEnd ?? null");
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
  assertEquals(state.source, "database");
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
    { allowProfileEntitlement: false },
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
  assertEquals(state.source, "database");
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
  assertEquals(state.source, "database");
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
  assertEquals(state.source, "database");
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
