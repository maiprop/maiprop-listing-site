import { describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrationFiles = () =>
  readdirSync("supabase/migrations").filter((file) =>
    file.endsWith("_add_subscription_trial_claims.sql"),
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
    expect(source).toContain("syncSubscriptionTrialClaim");
    expect(source).toContain("subscription_trial_claims");
    expect(source).toContain("checkout_type");
    expect(source).toContain("subscription_trial");
  });
});
