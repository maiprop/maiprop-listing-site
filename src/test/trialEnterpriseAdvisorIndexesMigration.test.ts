import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260615192000_harden_trial_and_enterprise_advisor_indexes.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("trial and enterprise advisor hardening migration", () => {
  it("uses an initplan-safe trial claim RLS policy", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "subscription_trial_claims_select_own"');
    expect(migration).toContain('CREATE POLICY "subscription_trial_claims_select_own"');
    expect(migration).toContain("USING ((SELECT auth.uid()) = user_id)");
  });

  it("adds support indexes for enterprise tenant foreign keys", () => {
    [
      "idx_organizations_created_by",
      "idx_organization_memberships_invited_by",
      "idx_organization_domains_created_by",
      "idx_organization_sso_providers_domain_id",
      "idx_organization_sso_providers_configured_by",
      "idx_procurement_evidence_owner_user_id",
    ].forEach((indexName) => {
      expect(migration).toContain(`CREATE INDEX IF NOT EXISTS ${indexName}`);
    });
  });
});
