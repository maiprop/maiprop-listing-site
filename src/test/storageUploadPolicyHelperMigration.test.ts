import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260605190858_rewrite_late_public_helper_policies.sql"),
  "utf8",
);

describe("late public helper policy rewrite", () => {
  it("moves storage/public policies back to private role helpers", () => {
    expect(migration).toContain("private.has_platform_admin(");
    expect(migration).toContain("private.has_role(");
    expect(migration).toContain("pg_policy");
    expect(migration).toContain("DROP POLICY IF EXISTS %I ON %I.%I");
    expect(migration).toContain("CREATE POLICY %I ON %I.%I");
  });

  it("keeps public helper RPCs service-role-only while preserving private helper execution", () => {
    expect(migration).toContain("GRANT USAGE ON SCHEMA private TO authenticated, service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION private.has_platform_admin(UUID) TO authenticated, service_role");
    expect(migration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
    expect(migration).toContain("public role helper remains browser-executable");
  });

  it("fails loudly if future policies reintroduce public role-helper calls", () => {
    expect(migration).toContain("policy still references a public role helper");
    expect(migration).toContain("pg_get_expr(p.polqual, p.polrelid)");
    expect(migration).toContain("pg_get_expr(p.polwithcheck, p.polrelid)");
  });
});
