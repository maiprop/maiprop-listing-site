import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const webhook = readFileSync(
  join(process.cwd(), "supabase/functions/stripe-webhook/index.ts"),
  "utf8",
);

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260707157000_addon_purchase_and_investor_payment_ledger.sql"),
  "utf8",
);

describe("stripe webhook add-on and investor custom-payment fulfillment", () => {
  it("records add-on checkout sessions in a durable ledger without profile entitlement sync", () => {
    expect(webhook).toContain("fulfillAddonCheckoutSession(supabase, session)");
    expect(webhook).toContain("metadata.checkout_type !== \"addon\"");
    expect(webhook).toContain("normalizeAddonCheckoutMode(session.mode)");
    expect(webhook).toContain("normalizePositiveQuantity(metadata.quantity)");
    expect(webhook).toContain(".from(\"addon_purchases\")");
    expect(webhook).toContain("onConflict: \"stripe_session_id\"");
    expect(webhook).toContain("metadata.checkout_type");
    expect(webhook).toContain("skipping profile entitlement sync for add-on subscription");
  });

  it("requires explicit investor payment metadata before activating pending access", () => {
    expect(webhook).toContain("activateInvestorPaymentSession(supabase, session)");
    expect(webhook).toContain("metadata.checkout_type !== \"investor_payment\"");
    expect(webhook).toContain("investorTierFromPlanKey");
    expect(webhook).toContain("investor_private");
    expect(webhook).toContain("investor_institutional");
    expect(webhook).toContain(".from(\"investor_subscriptions\")");
    expect(webhook).toContain(".eq(\"status\", \"pending_payment\")");
    expect(webhook).toContain("select(\"id, status, stripe_session_id\")");
    expect(webhook).toContain("investor payment session has no matching pending subscription");
  });

  it("creates ledger tables and keeps browser writes blocked by RLS", () => {
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.addon_purchases");
    expect(migration).toContain("REVOKE ALL ON public.addon_purchases FROM anon");
    expect(migration).toContain("GRANT SELECT ON public.addon_purchases TO authenticated");
    expect(migration).toContain("UNIQUE (stripe_session_id)");
    expect(migration).toContain("CREATE POLICY \"addon_purchases_no_browser_insert\"");
    expect(migration).toContain("WITH CHECK (false)");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS stripe_session_id");
    expect(migration).toContain("idx_investor_subscriptions_stripe_session_id");
  });
});
