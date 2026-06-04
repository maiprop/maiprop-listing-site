import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260707151000_reduce_remaining_low_risk_policy_noise.sql",
);
const migration = readFileSync(migrationPath, "utf8").replace(/\s+/g, " ");

describe("remaining low-risk Supabase advisor policy migration", () => {
  it("splits professional FOR ALL owner policies into write-only policies", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "professional_services_owner"');
    expect(migration).toContain('CREATE POLICY "professional_services_owner_insert"');
    expect(migration).toContain('CREATE POLICY "professional_services_owner_update"');
    expect(migration).toContain('CREATE POLICY "professional_services_owner_delete"');
    expect(migration).toContain('DROP POLICY IF EXISTS "professional_availability_owner"');
    expect(migration).toContain('CREATE POLICY "professional_availability_owner_insert"');
  });

  it("consolidates marketing lead inserts while preserving public validation", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "Authenticated users can submit leads"');
    expect(migration).toContain('DROP POLICY IF EXISTS "Public can submit leads"');
    expect(migration).toContain('CREATE POLICY "marketing_leads_insert"');
    expect(migration).toContain("owner_id = (SELECT auth.uid()) OR");
    expect(migration).toContain("char_length(full_name) >= 2");
    expect(migration).toContain("OR NOT private.has_role((SELECT auth.uid()), 'admin'::app_role)");
  });

  it("does not touch open-house or firesale policies", () => {
    expect(migration).not.toContain("open_house_offers");
    expect(migration).not.toContain("open_house_registrations");
    expect(migration).not.toContain("firesale_interest");
    expect(migration).not.toContain("firesale_requests");
  });
});
