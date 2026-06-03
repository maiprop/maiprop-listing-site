import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260707150000_reduce_advisor_policy_noise.sql",
);
const migration = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ");

describe("Supabase advisor policy-noise migration", () => {
  it("removes the stale listing insert quota bypass without changing the quota policy", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "listings_insert" ON public.listings');
    expect(migration).not.toContain('DROP POLICY IF EXISTS "listing_insert_quota"');
  });

  it("converts admin write-all policies into explicit write-only policies", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "agent_data_input_bans_admin_write"');
    expect(migration).toContain('CREATE POLICY "agent_data_input_bans_admin_insert"');
    expect(migration).toContain('CREATE POLICY "agent_data_input_bans_admin_update"');
    expect(migration).toContain('CREATE POLICY "agent_data_input_bans_admin_delete"');
    expect(migration).toContain('DROP POLICY IF EXISTS "ai_usage_limits_admin_write"');
    expect(migration).toContain('CREATE POLICY "ai_usage_limits_admin_insert"');
  });

  it("keeps public plus owner/admin visibility as one OR-equivalent select policy", () => {
    expect(migration).toContain('CREATE POLICY "professionals_select"');
    expect(migration).toContain("archived_at IS NULL OR (SELECT auth.uid()) = user_id");
    expect(migration).toContain('CREATE POLICY "projects_select"');
    expect(migration).toContain("(status = 'active'::text AND archived_at IS NULL) OR owner_id = (SELECT auth.uid())");
  });

  it("does not touch open-house and firesale deal policies without deeper RLS matrix tests", () => {
    expect(migration).not.toContain("open_house_offers");
    expect(migration).not.toContain("open_house_registrations");
    expect(migration).not.toContain("firesale_interest");
    expect(migration).not.toContain("firesale_requests");
  });
});
