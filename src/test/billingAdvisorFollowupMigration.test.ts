import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  "supabase/migrations/20260707172000_fix_billing_advisor_followup.sql",
  "utf8",
);

const advisorPolicy = JSON.parse(
  readFileSync("scripts/supabase-advisor-debt-policy.json", "utf8"),
) as {
  review: Array<{
    match?: {
      name?: string;
      cache_key_contains?: string;
    };
    owner?: string;
    reason?: string;
    next_action?: string;
    review_cadence?: string;
  }>;
};

const appliedFutureMigrations = JSON.parse(
  readFileSync("scripts/applied-future-migrations.json", "utf8"),
) as Array<{ version: string }>;

const appliedFutureMigrationVersions = appliedFutureMigrations.map((entry) => entry.version);

describe("billing advisor follow-up migration", () => {
  it("uses a permissive deny policy so stripe_webhook_events has explicit browser denial", () => {
    expect(migration).toContain("stripe_webhook_events_no_client_access");
    expect(migration).toContain("AS PERMISSIVE");
    expect(migration).toContain("TO anon, authenticated");
    expect(migration).toContain("USING (false)");
    expect(migration).toContain("WITH CHECK (false)");
    expect(migration).toContain("polpermissive IS TRUE");
  });

  it("drops duplicate Stripe identifier indexes only when unique constraint indexes exist", () => {
    expect(migration).toContain("billing_customers_stripe_customer_id_key");
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_billing_customers_stripe_customer_id");
    expect(migration).toContain("billing_subscriptions_stripe_subscription_id_key");
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_billing_subscriptions_stripe_subscription_id");
    expect(migration).toContain("duplicate billing_customers Stripe customer index still exists");
    expect(migration).toContain("duplicate billing_subscriptions Stripe subscription index still exists");
  });

  it("does not keep the current investor subscription helper as accepted advisor debt", () => {
    const entry = advisorPolicy.review.find(
      (item) => item.match?.cache_key_contains === "public_has_current_investor_subscription",
    );

    expect(entry).toBeUndefined();
  });

  it("keeps the follow-up ordered after the current billing/advisor chain", () => {
    expect(appliedFutureMigrationVersions).toContain("20260707172000");
    expect(
      appliedFutureMigrationVersions.indexOf("20260707172000"),
    ).toBeGreaterThan(appliedFutureMigrationVersions.indexOf("20260707171000"));
  });
});
