import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function migrationSql(): string {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const fileName = readdirSync(migrationsDir).find((name) => name.endsWith("_ecas_privacy_governance.sql"));

  expect(fileName, "missing ECAS privacy governance migration").toBeDefined();

  return readFileSync(resolve(migrationsDir, fileName!), "utf8");
}

function migrationSqlBySuffix(suffix: string): string {
  const migrationsDir = resolve(process.cwd(), "supabase/migrations");
  const fileName = readdirSync(migrationsDir).find((name) => name.endsWith(suffix));

  expect(fileName, `missing migration ending ${suffix}`).toBeDefined();

  return readFileSync(resolve(migrationsDir, fileName!), "utf8");
}

describe("ECAS privacy governance migration", () => {
  it("adds privacy export tracking and a redacted audit ledger", () => {
    const sql = migrationSql();

    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.privacy_export_requests");
    expect(sql).toContain("CREATE TABLE IF NOT EXISTS public.privacy_audit_log");
    expect(sql).toContain("metadata jsonb NOT NULL DEFAULT '{}'::jsonb");
    expect(sql).toContain("CHECK (jsonb_typeof(metadata) = 'object')");
    expect(sql).toContain("COMMENT ON COLUMN public.privacy_audit_log.metadata IS");
    expect(sql).toContain("Do not store raw PII");
  });

  it("keeps privacy rows protected by owner/admin RLS and blocks browser writes to the ledger", () => {
    const sql = migrationSql();

    expect(sql).toContain("ALTER TABLE public.privacy_export_requests ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain("ALTER TABLE public.privacy_audit_log ENABLE ROW LEVEL SECURITY");
    expect(sql).toContain('CREATE POLICY "privacy_export_requests_select_own_or_admin"');
    expect(sql).toContain("user_id = (SELECT auth.uid())");
    expect(sql).toContain("public.has_platform_admin((SELECT auth.uid()))");
    expect(sql).toContain('CREATE POLICY "privacy_export_requests_insert_own"');
    expect(sql).toContain('CREATE POLICY "privacy_audit_log_select_admin"');
    expect(sql).toContain("No INSERT/UPDATE/DELETE policies on privacy_audit_log");
    expect(sql.replaceAll("(SELECT auth.uid())", "")).not.toContain("auth.uid()");
  });

  it("documents explicit public schema CREATE revocation proof", () => {
    const sql = migrationSql();

    expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM PUBLIC");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM anon");
    expect(sql).toContain("REVOKE CREATE ON SCHEMA public FROM authenticated");
    expect(sql).toContain("aclexplode");
    expect(sql).toContain("acl.grantee = 0");
    expect(sql).not.toContain("has_schema_privilege('PUBLIC'");
    expect(sql).toContain("public schema CREATE must remain revoked from client roles");
  });

  it("keeps long-lived staging projects aligned with optimized privacy RLS policies", () => {
    const sql = migrationSqlBySuffix("_optimize_privacy_rls_initplans.sql");

    expect(sql).toContain('DROP POLICY IF EXISTS "privacy_export_requests_select_own_or_admin"');
    expect(sql).toContain('CREATE POLICY "privacy_export_requests_select_own_or_admin"');
    expect(sql).toContain("user_id = (SELECT auth.uid())");
    expect(sql).toContain("public.has_platform_admin((SELECT auth.uid()))");
    expect(sql).toContain('CREATE POLICY "privacy_export_requests_insert_own"');
    expect(sql).toContain('CREATE POLICY "privacy_export_requests_update_admin"');
    expect(sql).toContain('CREATE POLICY "privacy_audit_log_select_admin"');
    expect(sql.replaceAll("(SELECT auth.uid())", "")).not.toContain("auth.uid()");
  });
});
