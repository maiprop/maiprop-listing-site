import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260628120000_stripe_billing_state.sql"),
  "utf8",
);

describe("stripe billing state migration", () => {
  it("adds durable Stripe billing state tables", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.billing_customers");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.billing_subscriptions");
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.stripe_webhook_events");
  });

  it("keeps browser writes out of billing ledgers while allowing own-row reads", () => {
    expect(migration).toContain("ALTER TABLE public.billing_customers ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.billing_subscriptions ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("ALTER TABLE public.stripe_webhook_events ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.billing_customers FROM authenticated");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON public.billing_subscriptions FROM authenticated");
    expect(migration).toContain("REVOKE ALL ON public.stripe_webhook_events FROM anon, authenticated");
    expect(migration).toContain("billing_customers_select_own");
    expect(migration).toContain("billing_subscriptions_select_own");
    expect(migration).toContain("user_id = (SELECT auth.uid())");
  });

  it("adds indexes needed by webhooks and subscription checks", () => {
    expect(migration).toContain("idx_billing_customers_stripe_customer_id");
    expect(migration).toContain("idx_billing_subscriptions_user_status");
    expect(migration).toContain("idx_billing_subscriptions_stripe_subscription_id");
    expect(migration).toContain("idx_stripe_webhook_events_status");
  });
});
