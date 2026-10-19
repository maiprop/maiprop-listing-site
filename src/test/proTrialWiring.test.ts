import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationFiles = () =>
  readdirSync("supabase/migrations").filter((file) =>
    file.endsWith("_add_subscription_trial_claims.sql"),
  );

const abandonedCheckoutMigrationFiles = () =>
  readdirSync("supabase/migrations").filter((file) =>
    file.endsWith("_allow_abandoned_trial_checkout_retry.sql"),
  );

describe("Pro trial wiring", () => {
  it("adds an RLS-protected one-claim trial ledger migration", () => {
    const [migration] = migrationFiles();

    expect(migration).toBeTruthy();

    const sql = readFileSync(join("supabase/migrations", migration), "utf8");
    expect(sql).toContain(
      "CREATE TABLE IF NOT EXISTS public.subscription_trial_claims",
    );
    expect(sql).toContain("UNIQUE (user_id)");
    expect(sql).toContain(
      "ALTER TABLE public.subscription_trial_claims ENABLE ROW LEVEL SECURITY",
    );
    expect(sql).toContain(
      'CREATE POLICY "subscription_trial_claims_select_own"',
    );
    expect(sql).toContain("USING ((SELECT auth.uid()) = user_id)");
    expect(sql).toContain(
      "GRANT SELECT ON TABLE public.subscription_trial_claims TO authenticated",
    );
    expect(sql).toContain(
      "GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.subscription_trial_claims TO service_role",
    );
  });

  it("syncs trial claims from Stripe webhook lifecycle events", () => {
    expect(existsSync("supabase/functions/stripe-webhook/index.ts")).toBe(true);

    const source = readFileSync(
      "supabase/functions/stripe-webhook/index.ts",
      "utf8",
    );
    const shared = readFileSync("supabase/functions/_shared/trialClaims.ts", "utf8");
    expect(source).toContain("syncSubscriptionTrialClaim");
    expect(source).toContain("reconcileTrialClaim(");
    expect(shared).toContain('db.from("subscription_trial_claims")');
    expect(source).toContain("checkout_type");
    expect(source).toContain("subscription_trial");
  });

  it("allows abandoned checkout retries without reopening a consumed trial", () => {
    const [migration] = abandonedCheckoutMigrationFiles();

    expect(migration).toBeTruthy();
    const sql = readFileSync(join("supabase/migrations", migration), "utf8");
    expect(sql).toContain("'checkout_abandoned'");
    expect(sql).toContain("checkout_expired_at");
    expect(sql).toContain("claimed_at <= now() - interval '24 hours'");
    expect(sql).toContain("stripe_subscription_id IS NULL");
    expect(sql).toContain("status IN ('checkout_started', 'checkout_created')");
    expect(sql).toContain("runtime_mode = 'test'");
    expect(sql).toContain("livemode = false");
    expect(sql).toContain(
      "WHERE status <> 'checkout_abandoned'",
    );
    expect(sql).toContain(
      "idx_subscription_trial_claims_one_non_abandoned_per_user_runtime",
    );
    expect(sql).toContain(
      "DROP INDEX IF EXISTS public.idx_subscription_trial_claims_one_open_per_user_runtime",
    );
    expect(sql).toContain(
      "DROP INDEX IF EXISTS public.idx_subscription_trial_claims_one_started_per_user_runtime",
    );

    const webhook = readFileSync(
      "supabase/functions/stripe-webhook/index.ts",
      "utf8",
    );
    const shared = readFileSync("supabase/functions/_shared/trialClaims.ts", "utf8");
    expect(webhook).toContain('"checkout_abandoned"');
    expect(webhook).toContain("expireAbandonedTrialCheckoutSession");
    expect(shared).toContain('if (status === "checkout_abandoned")');
    expect(shared).toContain('throw new Error("consumed trial cannot be abandoned")');
  });
});
