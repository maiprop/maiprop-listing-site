import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260701144610_enforce_investor_subscription_expiry.sql"),
  "utf8",
);
const normalizedMigration = migration.replace(/\r\n/g, "\n");

describe("investor subscription expiry migration", () => {
  it("centralizes current investor subscription checks", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.has_current_investor_subscription");
    expect(migration).toContain("s.status IN ('active', 'trial')");
    expect(migration).toContain("(s.expires_at IS NULL OR s.expires_at > now())");
    expect(migration).toContain("public.has_current_investor_subscription(p_user_id)");
  });

  it("keeps the backdated is_pro definition self-contained", () => {
    expect(migration).not.toContain("public.has_audience_scoped_pro_entitlement");
    expect(migration).toContain("public.pro_product_ids pp");
  });

  it("backfills paid annual rows and expires elapsed grants", () => {
    expect(migration).toContain("stripe_session_id IS NOT NULL");
    expect(migration).toContain("+ interval '365 days'");
    expect(normalizedMigration).toContain("SET\n  status = 'expired'");
    expect(migration).toContain("expires_at <= now()");
  });

  it("applies expiry to Quick Sale policies and protected submit RPC", () => {
    expect(migration).toContain('CREATE POLICY "firesale_interest_insert"');
    expect(migration).toContain('CREATE POLICY "firesale_requests_select"');
    expect(migration).toContain('CREATE POLICY "firesale_feed_select"');
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.submit_firesale_interest_for_user");
    expect(migration).toContain("OR NOT public.has_current_investor_subscription(v_actor)");
  });
});
