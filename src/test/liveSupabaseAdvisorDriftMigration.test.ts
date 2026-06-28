import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260628215500_fix_live_supabase_advisor_drift.sql"),
  "utf8",
);

describe("live Supabase advisor drift migration", () => {
  it("makes stripe webhook event RLS denial explicit without browser access", () => {
    expect(migration).toContain("stripe_webhook_events_no_client_access");
    expect(migration).toContain("AS RESTRICTIVE");
    expect(migration).toContain("TO public");
    expect(migration).toContain("USING (false)");
    expect(migration).toContain("WITH CHECK (false)");
  });

  it("moves legacy quota base helpers behind service-role execution", () => {
    expect(migration).toContain("public.get_ai_call_monthly_base_limit(uuid,text)");
    expect(migration).toContain("public.get_report_monthly_base_limit(uuid)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
  });

  it("drops only redundant billing indexes when unique constraint indexes exist", () => {
    expect(migration).toContain("billing_customers_stripe_customer_id_key");
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_billing_customers_stripe_customer_id");
    expect(migration).toContain("billing_subscriptions_stripe_subscription_id_key");
    expect(migration).toContain("DROP INDEX IF EXISTS public.idx_billing_subscriptions_stripe_subscription_id");
  });
});
