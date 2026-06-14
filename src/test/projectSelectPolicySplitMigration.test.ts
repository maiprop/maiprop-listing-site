import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = () =>
  readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260614083000_split_project_select_policy.sql"),
    "utf8",
  );

describe("project select policy split migration", () => {
  it("keeps anonymous project reads free of admin helper calls", () => {
    const sql = migrationSql();

    expect(sql).toContain('DROP POLICY IF EXISTS "projects_select" ON public.projects');
    expect(sql).toContain('CREATE POLICY "Projects are publicly viewable"');
    expect(sql).toContain("TO public");
    expect(sql).toContain("status = 'active'::text");
    expect(sql).toContain("archived_at IS NULL");
    expect(sql).toContain("public_policy ~* 'has_platform_admin'");
  });

  it("keeps owner and platform-admin project reads authenticated-only", () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE POLICY "Projects are viewable by owner or admin"');
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("owner_id = (SELECT auth.uid())");
    expect(sql).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(sql).toContain("authenticated owner/admin projects select policy missing");
  });
});
