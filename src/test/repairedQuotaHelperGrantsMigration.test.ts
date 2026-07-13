import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migrationsDir = join(process.cwd(), "supabase", "migrations");
const migrationName = readdirSync(migrationsDir).find((name) =>
  name.endsWith("_harden_repaired_quota_helper_grants.sql"),
);

describe("repaired quota helper grant hardening", () => {
  it("reasserts service-only execution after legacy migration repair", () => {
    expect(migrationName).toBeDefined();

    const migration = readFileSync(join(migrationsDir, migrationName!), "utf8");

    expect(migration).toContain("public.get_ai_call_monthly_base_limit(uuid,text)");
    expect(migration).toContain("public.get_report_monthly_base_limit(uuid)");
    expect(migration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(migrationName!.slice(0, 14).localeCompare("20260628215500")).toBeGreaterThan(0);
  });
});
