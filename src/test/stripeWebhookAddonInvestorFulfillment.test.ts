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

const creditMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260628193711_addon_purchase_credit_delivery.sql"),
  "utf8",
);

const aiCreditReservationFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260628203708_fix_ai_addon_credit_reservation.sql"),
  "utf8",
);

const addonServiceRoleGrantMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260629055249_grant_service_role_addon_purchases.sql"),
  "utf8",
);

const addonBrowserPrivilegeLockMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260630072117_restrict_addon_purchases_browser_privileges.sql"),
  "utf8",
);

const aiCreditStatusRestoreMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260707159000_fix_staging_advisor_drift.sql"),
  "utf8",
);

const aiBundleCreditReservationFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260630121222_fix_ai_bundle_credit_reservation_limit.sql"),
  "utf8",
);

const aiBundleCreditTriggerFixMigration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260630121353_fix_ai_bundle_credit_trigger_limit.sql"),
  "utf8",
);

describe("stripe webhook add-on and custom annual investor payment fulfillment", () => {
  it("records add-on checkout sessions in a durable ledger without profile entitlement sync", () => {
    expect(webhook).toContain("fulfillAddonCheckoutSession(supabase, session)");
    expect(webhook).toContain("metadata.checkout_type !== \"addon\"");
    expect(webhook).toContain("return session.payment_status === \"paid\"");
    expect(webhook).not.toContain("session.status === \"complete\"");
    expect(webhook).toContain("normalizeAddonCheckoutMode(session.mode)");
    expect(webhook).toContain("normalizePositiveQuantity(metadata.quantity)");
    expect(webhook).toContain("addonCreditsGranted(addonKey, quantity)");
    expect(webhook).toContain("credits_granted");
    expect(webhook).toContain(".from(\"addon_purchases\")");
    expect(webhook).toContain("onConflict: \"stripe_session_id\"");
    expect(webhook).toContain("metadata.checkout_type");
    expect(webhook).toContain("syncAddonSubscriptionLifecycle(supabase, sub)");
    expect(webhook).toContain(".eq(\"stripe_subscription_id\", sub.id)");
    expect(webhook).toContain("synced add-on subscription lifecycle");
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
    expect(creditMigration.indexOf("CREATE TABLE IF NOT EXISTS public.addon_purchases")).toBeLessThan(
      creditMigration.indexOf("ALTER TABLE public.addon_purchases"),
    );
    expect(migration).toContain("CREATE TABLE IF NOT EXISTS public.addon_purchases");
    expect(migration).toContain("REVOKE ALL ON public.addon_purchases FROM anon");
    expect(migration).toContain("GRANT SELECT ON public.addon_purchases TO authenticated");
    expect(migration).toContain("UNIQUE (stripe_session_id)");
    expect(migration).toContain("CREATE POLICY \"addon_purchases_no_browser_insert\"");
    expect(migration).toContain("WITH CHECK (false)");
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS stripe_session_id");
    expect(migration).toContain("idx_investor_subscriptions_stripe_session_id");
    expect(addonServiceRoleGrantMigration).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.addon_purchases TO service_role",
    );
    expect(addonBrowserPrivilegeLockMigration).toContain(
      "REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER",
    );
    expect(addonBrowserPrivilegeLockMigration).toContain(
      "addon_purchases must not grant browser write or schema-control privileges",
    );
  });

  it("turns paid AI/report purchases into consumable operational credits", () => {
    expect(creditMigration).toContain("ADD COLUMN IF NOT EXISTS credits_granted");
    expect(creditMigration).toContain("ADD COLUMN IF NOT EXISTS credits_consumed");
    expect(creditMigration).toContain("CREATE OR REPLACE FUNCTION public.addon_credit_bucket");
    expect(creditMigration).toContain("WHEN 'valuation_bundle' THEN 5");
    expect(creditMigration).toContain("WHEN 'neighbourhood_report_bundle' THEN 3");
    expect(creditMigration).toContain("CREATE OR REPLACE FUNCTION public.consume_addon_credit_for_user");
    expect(creditMigration).toContain("FOR UPDATE SKIP LOCKED");
    expect(creditMigration).toContain("CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user");
    expect(creditMigration).toContain("CREATE OR REPLACE FUNCTION public.check_report_monthly_limit()");
    expect(creditMigration).toContain("public.consume_addon_credit_for_user(NEW.user_id, 'property-report')");
    expect(aiCreditStatusRestoreMigration).toContain("public.get_available_addon_credits");
    expect(aiCreditStatusRestoreMigration).toContain("GREATEST(v_count - v_base, 0)");
  });

  it("keeps AI add-on reservations from double-consuming credits before the usage trigger runs", () => {
    expect(aiCreditReservationFixMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user",
    );
    expect(aiCreditReservationFixMigration).toContain(
      "v_consumed_credit := v_base_limit < 999999 AND v_count >= v_base_limit;",
    );
    expect(aiCreditReservationFixMigration).toContain(
      "INSERT INTO public.usage_ai_calls (user_id, bucket)",
    );
    expect(aiCreditReservationFixMigration).not.toContain(
      "v_consumed_credit := public.consume_addon_credit_for_user",
    );
  });

  it("keeps bundle credit reservations from denying already-consumed overage", () => {
    expect(aiBundleCreditReservationFixMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.reserve_ai_quota_for_user",
    );
    expect(aiBundleCreditReservationFixMigration).toContain(
      "v_base_limit + v_available_credits + GREATEST(v_count - v_base_limit, 0)",
    );
    expect(aiBundleCreditReservationFixMigration).toContain(
      "bundle credits can be fully consumed",
    );
    expect(aiBundleCreditReservationFixMigration).not.toContain(
      "v_consumed_credit := public.consume_addon_credit_for_user",
    );
  });

  it("keeps the AI usage trigger aligned with bundle credit reservations", () => {
    expect(aiBundleCreditTriggerFixMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.check_ai_call_monthly_limit_trigger()",
    );
    expect(aiBundleCreditTriggerFixMigration).toContain(
      "v_base_limit + v_available_credits + GREATEST(v_count - v_base_limit, 0)",
    );
    expect(aiBundleCreditTriggerFixMigration).toContain(
      "public.consume_addon_credit_for_user(NEW.user_id, NEW.bucket)",
    );
    expect(aiBundleCreditTriggerFixMigration).toContain(
      "bundles can be fully consumed",
    );
  });
});
