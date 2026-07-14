import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  beginStripeWebhookEvent,
  buildBillingCustomerRow,
  buildBillingSubscriptionRow,
  finishStripeWebhookEvent,
  isDuplicateWebhookInsertError,
  isStaleProcessingWebhookEvent,
  stripeRuntimeModeFromLivemode,
  upsertBillingCustomer,
  upsertBillingSubscription,
} from "./billingState.ts";

Deno.test("billing customer rows are test-mode by default for test Stripe objects", () => {
  assertEquals(
    buildBillingCustomerRow({
      userId: "user-1",
      stripeCustomerId: "cus_test",
      email: "buyer@example.com",
      livemode: false,
      metadata: { user_id: "user-1" },
    }),
    {
      user_id: "user-1",
      stripe_customer_id: "cus_test",
      email: "buyer@example.com",
      runtime_mode: "test",
      livemode: false,
      metadata: { user_id: "user-1" },
    },
  );
});

Deno.test("billing subscription rows normalize Stripe item and period fields", () => {
  const row = buildBillingSubscriptionRow({
    userId: "user-1",
    stripeCustomerId: "cus_test",
    subscription: {
      id: "sub_test",
      status: "active",
      livemode: false,
      cancel_at_period_end: true,
      current_period_start: 1_700_000_000,
      current_period_end: 1_700_086_400,
      trial_start: 1_699_900_000,
      trial_end: 1_700_000_000,
      metadata: {
        plan_key: "pro",
        audience: "participant",
        billing_cycle: "monthly",
      },
      items: {
        data: [
          {
            price: {
              id: "price_test",
              product: "prod_test",
            },
          },
        ],
      },
    },
  });

  assertEquals(row.user_id, "user-1");
  assertEquals(row.stripe_subscription_id, "sub_test");
  assertEquals(row.stripe_product_id, "prod_test");
  assertEquals(row.stripe_price_id, "price_test");
  assertEquals(row.plan_key, "pro");
  assertEquals(row.audience, "participant");
  assertEquals(row.billing_cycle, "monthly");
  assertEquals(row.status, "active");
  assertEquals(row.cancel_at_period_end, true);
  assertEquals(row.current_period_start, "2023-11-14T22:13:20.000Z");
  assertEquals(row.current_period_end, "2023-11-15T22:13:20.000Z");
  assertEquals(row.trial_start, "2023-11-13T18:26:40.000Z");
  assertEquals(row.trial_end, "2023-11-14T22:13:20.000Z");
  assertEquals(row.runtime_mode, "test");
});

Deno.test("billing subscription rows fall back to item period fields for newer Stripe API shapes", () => {
  const row = buildBillingSubscriptionRow({
    userId: "user-1",
    stripeCustomerId: "cus_test",
    subscription: {
      id: "sub_test",
      status: "active",
      livemode: false,
      metadata: {
        plan_key: "agent_basic",
        audience: "agent",
        billing_cycle: "annual",
      },
      items: {
        data: [
          {
            current_period_start: 1_780_000_000,
            current_period_end: 1_811_536_000,
            price: {
              id: "price_agent_annual",
              product: "prod_agent",
            },
          },
        ],
      },
    },
  });

  assertEquals(row.current_period_start, "2026-05-28T20:26:40.000Z");
  assertEquals(row.current_period_end, "2027-05-28T20:26:40.000Z");
  assertEquals(row.billing_cycle, "annual");
});

Deno.test("billing subscription rows persist canonical entitlement and Stripe event ordering fields", () => {
  const row = buildBillingSubscriptionRow({
    userId: "user-1",
    stripeCustomerId: "cus_test",
    subscription: {
      id: "sub_test",
      status: "active",
      livemode: false,
      current_period_end: 4_102_444_800,
      metadata: {},
      items: {
        data: [{
          price: { id: "price_test", product: "prod_test" },
        }],
      },
    },
    canonical: {
      planKey: "pro",
      audience: "participant",
      productId: "prod_test",
      priceId: "price_test",
      billingCycle: "monthly",
    },
    observation: {
      source: "webhook_canonical",
      observedAt: "2026-07-14T12:00:00.500Z",
      stripeEventId: "evt_newer",
      stripeEventCreatedAt: "2026-07-14T12:00:00.000Z",
    },
  } as never);

  assertEquals(row.plan_key, "pro");
  assertEquals(row.audience, "participant");
  assertEquals(row.stripe_product_id, "prod_test");
  assertEquals(row.stripe_price_id, "price_test");
  assertEquals(row.billing_cycle, "monthly");
  assertEquals(
    (row as Record<string, unknown>).state_source,
    "webhook_canonical",
  );
  assertEquals(
    (row as Record<string, unknown>).state_observed_at,
    "2026-07-14T12:00:00.500Z",
  );
  assertEquals((row as Record<string, unknown>).stripe_event_id, "evt_newer");
  assertEquals(
    (row as Record<string, unknown>).stripe_event_created_at,
    "2026-07-14T12:00:00.000Z",
  );
});

Deno.test("billing subscription writes preserve canonical observation payload", async () => {
  let payload: Record<string, unknown> | undefined;
  const supabase = {
    from(table: string) {
      assertEquals(table, "billing_subscriptions");
      return {
        upsert(next: Record<string, unknown>) {
          payload = next;
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  await upsertBillingSubscription(supabase as never, {
    userId: "user-1",
    stripeCustomerId: "cus_test",
    subscription: {
      id: "sub_test",
      status: "active",
      livemode: false,
      current_period_end: 4_102_444_800,
      metadata: {},
      items: { data: [] },
    },
    canonical: {
      planKey: "pro",
      audience: "participant",
      productId: "prod_test",
      priceId: "price_test",
      billingCycle: "monthly",
    },
    observation: {
      source: "reconciliation",
      observedAt: "2026-07-14T12:00:00.500Z",
    },
  } as never);

  assertEquals(payload?.plan_key, "pro");
  assertEquals(payload?.audience, "participant");
  assertEquals(payload?.state_source, "reconciliation");
});

Deno.test("billing state helpers recognize runtime mode and duplicate event errors", () => {
  assertEquals(stripeRuntimeModeFromLivemode(false), "test");
  assertEquals(stripeRuntimeModeFromLivemode(true), "live");
  assertEquals(isDuplicateWebhookInsertError({ code: "23505" }), true);
  assertEquals(isDuplicateWebhookInsertError({ code: "PGRST116" }), false);
  assertEquals(isDuplicateWebhookInsertError(null), false);
});

Deno.test("billing customer writes conflict on the user and Stripe runtime", async () => {
  let receivedOptions: Record<string, unknown> | undefined;
  const supabase = {
    from(table: string) {
      assertEquals(table, "billing_customers");
      return {
        upsert(
          _payload: Record<string, unknown>,
          options?: Record<string, unknown>,
        ) {
          receivedOptions = options;
          return Promise.resolve({ error: null });
        },
      };
    },
  };

  await upsertBillingCustomer(supabase as never, {
    userId: "user-1",
    stripeCustomerId: "cus_live",
    livemode: true,
  });

  assertEquals(receivedOptions, { onConflict: "user_id,runtime_mode" });
});

Deno.test("failed duplicate webhook events are marked processing for retry", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      assertEquals(table, "stripe_webhook_events");
      return {
        insert() {
          return Promise.resolve({ error: { code: "23505" } });
        },
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: { status: "failed" }, error: null });
        },
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          return {
            eq() {
              return {
                eq() {
                  return {
                    select() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({
                            data: { event_id: "evt_retry" },
                            error: null,
                          });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };

  const result = await beginStripeWebhookEvent(supabase as never, {
    id: "evt_retry",
    type: "checkout.session.completed",
    livemode: false,
  });

  assertEquals(result.state, "started");
  if (result.state !== "started") throw new Error("expected started claim");
  assertEquals(typeof result.claimToken, "string");
  assertEquals(result.claimToken.length > 20, true);
  assertEquals(updates[0].status, "processing");
  assertEquals(updates[0].error, null);
  assertEquals(
    (updates[0].metadata as Record<string, unknown>).processing_claim_token,
    result.claimToken,
  );
});

Deno.test("processed duplicate webhook events stay duplicate", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      assertEquals(table, "stripe_webhook_events");
      return {
        insert() {
          return Promise.resolve({ error: { code: "23505" } });
        },
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: { status: "processed" },
            error: null,
          });
        },
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          return this;
        },
      };
    },
  };

  const result = await beginStripeWebhookEvent(supabase as never, {
    id: "evt_done",
    type: "checkout.session.completed",
    livemode: false,
  });

  assertEquals(result, { state: "duplicate" });
  assertEquals(updates.length, 0);
});

Deno.test("fresh processing duplicate webhook events request retry instead of ack", async () => {
  const updates: Array<Record<string, unknown>> = [];
  const supabase = {
    from(table: string) {
      assertEquals(table, "stripe_webhook_events");
      return {
        insert() {
          return Promise.resolve({ error: { code: "23505" } });
        },
        select() {
          return this;
        },
        eq() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              status: "processing",
              metadata: { processing_started_at: new Date().toISOString() },
            },
            error: null,
          });
        },
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          return this;
        },
      };
    },
  };

  const result = await beginStripeWebhookEvent(supabase as never, {
    id: "evt_busy",
    type: "checkout.session.completed",
    livemode: false,
  });

  assertEquals(result, { state: "in_progress" });
  assertEquals(updates.length, 0);
});

Deno.test("stale processing webhook events can be reclaimed", async () => {
  const staleStartedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  assertEquals(
    isStaleProcessingWebhookEvent({
      status: "processing",
      metadata: { processing_started_at: staleStartedAt },
    }),
    true,
  );
  assertEquals(
    isStaleProcessingWebhookEvent({
      status: "processing",
      metadata: { processing_started_at: new Date().toISOString() },
    }),
    false,
  );
});

Deno.test("stale processing webhook reclaim is guarded by the updated_at lease", async () => {
  const filters: Array<[string, string, unknown]> = [];
  const updates: Array<Record<string, unknown>> = [];
  const staleStartedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
  const expiredClaimToken = crypto.randomUUID();
  const supabase = {
    from(table: string) {
      assertEquals(table, "stripe_webhook_events");
      return {
        insert() {
          return Promise.resolve({ error: { code: "23505" } });
        },
        select() {
          return this;
        },
        eq(column: string, value: unknown) {
          filters.push(["eq", column, value]);
          return this;
        },
        maybeSingle() {
          return Promise.resolve({
            data: {
              status: "processing",
              updated_at: staleStartedAt,
              metadata: {
                processing_started_at: staleStartedAt,
                processing_claim_token: expiredClaimToken,
              },
            },
            error: null,
          });
        },
        update(payload: Record<string, unknown>) {
          updates.push(payload);
          return {
            eq(column: string, value: unknown) {
              filters.push(["eq", column, value]);
              return this;
            },
            lt(column: string, value: unknown) {
              filters.push(["lt", column, value]);
              return this;
            },
            select() {
              return this;
            },
            maybeSingle() {
              return Promise.resolve({
                data: { event_id: "evt_stale" },
                error: null,
              });
            },
          };
        },
      };
    },
  };

  const result = await beginStripeWebhookEvent(supabase as never, {
    id: "evt_stale",
    type: "checkout.session.completed",
    livemode: false,
  });

  assertEquals(result.state, "started");
  if (result.state !== "started") throw new Error("expected reclaimed claim");
  assertEquals(typeof result.claimToken, "string");
  assertEquals(result.claimToken.length > 20, true);
  assertEquals(result.claimToken === expiredClaimToken, false);
  assertEquals(
    (updates[0].metadata as Record<string, unknown>).processing_claim_token,
    result.claimToken,
  );
  assertEquals(
    filters.some(([op, column]) => op === "lt" && column === "updated_at"),
    true,
  );
});

Deno.test("stale webhook workers cannot finish a replacement claim", async () => {
  const replacementToken = crypto.randomUUID();
  const filters: Array<[string, unknown]> = [];
  const row = {
    event_id: "evt_reclaimed",
    status: "processing",
    metadata: { processing_claim_token: replacementToken },
  };
  const updatePayloads: Array<Record<string, unknown>> = [];

  const supabase = {
    from(table: string) {
      assertEquals(table, "stripe_webhook_events");
      return {
        update(payload: Record<string, unknown>) {
          updatePayloads.push(payload);
          return {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return this;
            },
            select() {
              return this;
            },
            maybeSingle() {
              const matches = filters.every(([column, value]) => {
                if (column === "event_id") return row.event_id === value;
                if (column === "status") return row.status === value;
                if (column === "metadata->>processing_claim_token") {
                  return row.metadata.processing_claim_token === value;
                }
                return false;
              });
              return Promise.resolve({
                data: matches ? { event_id: row.event_id } : null,
                error: null,
              });
            },
          };
        },
      };
    },
  };

  const staleFinished = await finishStripeWebhookEvent(
    supabase as never,
    row.event_id,
    "claim-from-expired-worker",
    "processed",
  );

  assertEquals(staleFinished, false);
  assertEquals(updatePayloads[0]?.status, "processed");
  assertEquals(
    filters.some(([column, value]) =>
      column === "metadata->>processing_claim_token" &&
      value === replacementToken
    ),
    false,
  );

  filters.length = 0;
  const replacementFinished = await finishStripeWebhookEvent(
    supabase as never,
    row.event_id,
    replacementToken,
    "processed",
  );

  assertEquals(replacementFinished, true);
  assertEquals(
    filters.some(([column, value]) =>
      column === "status" && value === "processing"
    ),
    true,
  );
  assertEquals(
    filters.some(([column, value]) =>
      column === "metadata->>processing_claim_token" &&
      value === replacementToken
    ),
    true,
  );
});
