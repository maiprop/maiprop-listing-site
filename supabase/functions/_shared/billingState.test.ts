import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  beginStripeWebhookEvent,
  buildBillingCustomerRow,
  buildBillingSubscriptionRow,
  isDuplicateWebhookInsertError,
  isStaleProcessingWebhookEvent,
  stripeRuntimeModeFromLivemode,
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

Deno.test("billing state helpers recognize runtime mode and duplicate event errors", () => {
  assertEquals(stripeRuntimeModeFromLivemode(false), "test");
  assertEquals(stripeRuntimeModeFromLivemode(true), "live");
  assertEquals(isDuplicateWebhookInsertError({ code: "23505" }), true);
  assertEquals(isDuplicateWebhookInsertError({ code: "PGRST116" }), false);
  assertEquals(isDuplicateWebhookInsertError(null), false);
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

  assertEquals(result, "started");
  assertEquals(updates[0].status, "processing");
  assertEquals(updates[0].error, null);
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

  assertEquals(result, "duplicate");
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

  assertEquals(result, "in_progress");
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
  const staleStartedAt = new Date(Date.now() - 11 * 60 * 1000).toISOString();
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
              metadata: { processing_started_at: staleStartedAt },
            },
            error: null,
          });
        },
        update() {
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

  assertEquals(result, "started");
  assertEquals(filters.some(([op, column]) => op === "lt" && column === "updated_at"), true);
});
