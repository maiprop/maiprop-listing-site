import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = () =>
  readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260712111352_consolidate_project_select_policies.sql"),
    "utf8",
  );

describe("latest project SELECT policy consolidation", () => {
  it("leaves one public-safe policy while preserving owner and admin access", () => {
    const sql = migrationSql();

    expect(sql).toContain('DROP POLICY IF EXISTS "Projects are publicly viewable" ON public.projects');
    expect(sql).toContain('DROP POLICY IF EXISTS "Projects are viewable by owner or admin" ON public.projects');
    expect(sql).toContain('DROP POLICY IF EXISTS "projects_public_select" ON public.projects');
    expect(sql).toContain('DROP POLICY IF EXISTS "projects_owner_admin_select" ON public.projects');
    expect(sql).toContain('DROP POLICY IF EXISTS "projects_select" ON public.projects');
    expect(sql).toContain('CREATE POLICY "projects_select"');
    expect(sql).toContain("status = 'active'::text");
    expect(sql).toContain("archived_at IS NULL");
    expect(sql).toContain("owner_id = (SELECT auth.uid())");
    expect(sql).toContain("private.has_platform_admin((SELECT auth.uid()))");
  });
});
