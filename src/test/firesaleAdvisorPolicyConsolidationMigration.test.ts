import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260707153000_consolidate_firesale_advisor_policies.sql",
);
const migration = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ");

describe("firesale advisor policy consolidation migration", () => {
  it("keeps firesale interest access authenticated and owner/admin scoped", () => {
    expect(migration).toContain('CREATE POLICY "firesale_interest_select"');
    expect(migration).toContain('CREATE POLICY "firesale_interest_update"');
    expect(migration).toContain('CREATE POLICY "firesale_interest_delete"');
    expect(migration).toContain("TO authenticated");
    expect(migration).toContain("investor_id = (SELECT auth.uid()) OR public.has_platform_admin((SELECT auth.uid()))");
  });

  it("keeps firesale interest insert gated by current subscription or platform admin", () => {
    expect(migration).toContain('CREATE POLICY "firesale_interest_insert"');
    expect(migration).toContain("public.has_platform_admin((SELECT auth.uid())) OR");
    expect(migration).toContain("investor_id = (SELECT auth.uid())");
    expect(migration).toContain("public.has_current_investor_subscription((SELECT auth.uid()))");
  });

  it("keeps published Quick Sale feed access subscription-based", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Eligible buyers view published Quick Sale deals"');
    expect(migration).toContain('CREATE POLICY "firesale_requests_select"');
    expect(migration).toContain("user_id = (SELECT auth.uid())");
    expect(migration).toContain("published_to_investors = true");
    expect(migration).toContain("public.has_current_investor_subscription((SELECT auth.uid()))");
  });

  it("does not require investor profile role for custom annual admin Checkout access", () => {
    expect(migration).not.toContain("role::text IN ('investor', 'institutional')");
    expect(migration).not.toContain("participant_type::text IN ('investor', 'institutional')");
  });

  it("does not touch open-house policies", () => {
    expect(migration).not.toContain("open_house_offers");
    expect(migration).not.toContain("open_house_registrations");
  });
});
