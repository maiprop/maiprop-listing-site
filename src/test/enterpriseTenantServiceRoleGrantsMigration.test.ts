import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const normalizeSql = (value: string) => value.replace(/\s+/g, " ").trim();

const serviceRoleGrantMigration = resolve(
  process.cwd(),
  "supabase/migrations/20260620142838_grant_service_role_org_tables.sql",
);

describe("enterprise tenant service-role grants", () => {
  it("keeps server-side fixture and Edge Function access explicit after browser-role revokes", () => {
    const migration = normalizeSql(readFileSync(serviceRoleGrantMigration, "utf8"));

    [
      "organizations",
      "organization_memberships",
      "organization_domains",
      "organization_sso_providers",
      "procurement_evidence",
    ].forEach((tableName) => {
      expect(migration).toContain(
        `GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.${tableName} TO service_role`,
      );
    });
  });
});
