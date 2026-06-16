import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260616072910_20260617072520_consolidate_enterprise_rls_policies.sql",
);

const readMigration = () =>
  existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

const normalize = (value: string) => value.replace(/\s+/g, " ");

describe("enterprise RLS policy consolidation migration", () => {
  it("splits enterprise FOR ALL management policies into command-specific write policies", () => {
    const migration = normalize(readMigration());

    [
      "organization_memberships",
      "organization_domains",
      "organization_sso_providers",
      "procurement_evidence",
    ].forEach((tableName) => {
      expect(migration).toContain(`DROP POLICY IF EXISTS ${tableName}_manage`);
      expect(migration).toContain(`CREATE POLICY ${tableName}_manage_insert`);
      expect(migration).toContain(`CREATE POLICY ${tableName}_manage_update`);
    });

    expect(migration).not.toMatch(/CREATE POLICY\s+\w+_manage\s+ON\s+public\.\w+\s+FOR ALL/i);
  });

  it("preserves authenticated role scoping and existing enterprise authorization helpers", () => {
    const migration = normalize(readMigration());

    expect(migration).toContain("TO authenticated");
    expect(migration).toContain("private.has_org_role");
    expect(migration).toContain("private.has_platform_admin");
    expect(migration).toContain("ARRAY['owner', 'admin']");
    expect(migration).toContain("ARRAY['owner', 'admin', 'security_admin']");
    expect(migration).toContain(
      "ARRAY['owner', 'admin', 'billing_admin', 'security_admin']",
    );
  });

  it("asserts the live schema has no remaining enterprise FOR ALL policy overlap", () => {
    const migration = normalize(readMigration());

    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain("cmd = 'ALL'");
    expect(migration).toContain("enterprise management FOR ALL policies remain");
  });
});
