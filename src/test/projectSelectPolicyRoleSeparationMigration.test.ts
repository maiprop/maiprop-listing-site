import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = () =>
  readFileSync(
    resolve(
      process.cwd(),
      "supabase/migrations/20260712222044_restore_anon_safe_project_select_policies.sql",
    ),
    "utf8",
  );

describe("project SELECT policy role separation", () => {
  it("keeps anonymous active-project reads free of authenticated helpers", () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE POLICY "projects_anon_select"');
    expect(sql).toContain("TO anon");
    expect(sql).toContain("status = 'active'::text");
    expect(sql).toContain("archived_at IS NULL");
    expect(sql).toContain("anon_policy ~* 'has_platform_admin'");
  });

  it("preserves public, owner, and platform-admin reads for authenticated users", () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE POLICY "projects_authenticated_select"');
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("status = 'active'::text");
    expect(sql).toContain("owner_id = (SELECT auth.uid())");
    expect(sql).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(sql).toContain("authenticated projects policy missing");
  });
});
