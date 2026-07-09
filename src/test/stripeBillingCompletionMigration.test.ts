import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

const completionMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703073249_complete_stripe_billing_refunds_runtime_current.sql"),
  "utf8",
);
const runtimeScopeMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260703073514_scope_addon_credit_runtime.sql"),
  "utf8",
);
const runtimeConsistencyMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260709093750_enforce_stripe_runtime_livemode_consistency.sql"),
  "utf8",
);
const migration = `${completionMigration}\n${runtimeScopeMigration}\n${runtimeConsistencyMigration}`;

describe("Stripe billing completion migration", () => {
  it("adds refund and runtime fields to add-on purchases", () => {
    expect(migration).toContain("ALTER TABLE public.addon_purchases");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS credits_refunded integer NOT NULL DEFAULT 0");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS refund_status text NOT NULL DEFAULT 'none'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS last_refund_id text");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS refunded_at timestamptz");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS runtime_mode text NOT NULL DEFAULT 'test'");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS livemode boolean NOT NULL DEFAULT false");
    expect(migration).toContain("addon_purchases_credits_refunded_nonnegative");
    expect(migration).toContain("addon_purchases_runtime_mode_valid");
  });

  it("lets consumed refunded credits become a debt while blocking further consumption", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.current_billing_runtime_mode");
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.get_addon_credit_balance");
    expect(migration).toContain("credits_granted - credits_consumed - credits_refunded");
    expect(migration).toContain("COALESCE(SUM(credits_granted - credits_consumed - credits_refunded), 0)");
    expect(migration).toContain("runtime_mode = public.current_billing_runtime_mode()");
    expect(migration).toContain("GREATEST(public.get_addon_credit_balance(p_user_id, p_bucket), 0)");
    expect(migration).toContain("v_balance := public.get_addon_credit_balance(p_user_id, p_bucket)");
    expect(migration).toContain("credits_granted - credits_consumed - credits_refunded > 0");
    expect(migration).not.toContain("credits_consumed <= credits_granted");
  });

  it("adds runtime fields to investor payments and trial claims", () => {
    expect(migration).toContain("ALTER TABLE public.investor_subscriptions");
    expect(migration).toContain("ALTER TABLE public.subscription_trial_claims");
    expect(migration).toContain("investor_subscriptions_runtime_mode_valid");
    expect(migration).toContain("subscription_trial_claims_runtime_mode_valid");
  });

  it("backfills runtime without hiding existing production investor access", () => {
    expect(migration).toContain("UPDATE public.addon_purchases");
    expect(migration).toContain("stripe_session_id LIKE 'cs_live_%'");
    expect(migration).toContain("stripe_session_id LIKE 'cs_test_%'");
    expect(migration).toContain("UPDATE public.investor_subscriptions");
    expect(migration).toContain("status IN ('active', 'trial', 'pending_payment') THEN 'live'");
    expect(migration).toContain("UPDATE public.subscription_trial_claims");
    expect(migration).toContain("stripe_checkout_session_id LIKE 'cs_test_%'");
  });

  it("prevents live and test Checkout sessions from drifting into the wrong billing runtime", () => {
    expect(runtimeConsistencyMigration).toContain("addon_purchases_stripe_session_runtime_consistent");
    expect(runtimeConsistencyMigration).toContain("stripe_session_id LIKE 'cs_live_%'");
    expect(runtimeConsistencyMigration).toContain("runtime_mode = 'live'");
    expect(runtimeConsistencyMigration).toContain("livemode IS TRUE");
    expect(runtimeConsistencyMigration).toContain("stripe_session_id LIKE 'cs_test_%'");
    expect(runtimeConsistencyMigration).toContain("runtime_mode = 'test'");
    expect(runtimeConsistencyMigration).toContain("livemode IS FALSE");
    expect(runtimeConsistencyMigration).toContain("UPDATE public.addon_purchases");
    expect(runtimeConsistencyMigration).toContain("stripe_payment_intent_id = 'pi_3TpWcOGfOEgBOxtl0rbH7ZjF'");
  });

  it("replaces hard trial uniqueness with partial retry-safe indexes", () => {
    expect(migration).toContain("DROP CONSTRAINT IF EXISTS subscription_trial_claims_user_id_key");
    expect(migration).toContain("idx_subscription_trial_claims_one_open_per_user_runtime");
    expect(migration).toContain("status IN ('checkout_started', 'checkout_created')");
    expect(migration).toContain("idx_subscription_trial_claims_one_started_per_user_runtime");
    expect(migration).toContain("status IN ('trialing', 'active', 'past_due', 'canceled', 'expired')");
  });

  it("keeps browser roles read-only and service role writable", () => {
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE ON TABLE public.addon_purchases FROM authenticated");
    expect(migration).toContain("GRANT SELECT ON TABLE public.addon_purchases TO authenticated");
    expect(migration).toContain("GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addon_purchases TO service_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.current_billing_runtime_mode() FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.get_available_addon_credits(uuid, text) FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("ALTER TABLE public.addon_purchases ENABLE ROW LEVEL SECURITY");
  });
});
