import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = () =>
  readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260614145554_dedupe_project_select_policies.sql"),
    "utf8",
  );

describe("project SELECT advisor policy migration", () => {
  it("keeps anonymous and authenticated project reads in non-overlapping policies", () => {
    const sql = migrationSql();

    expect(sql).toContain('CREATE POLICY "Projects are publicly viewable"');
    expect(sql).toContain("TO anon");
    expect(sql).toContain('CREATE POLICY "Projects are visible to authenticated users"');
    expect(sql).toContain("TO authenticated");
    expect(sql).toContain("status = 'active'::text");
    expect(sql).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(sql).toContain('DROP POLICY IF EXISTS "Public can view active projects" ON public.projects');
    expect(sql).toContain("project SELECT policies still overlap for authenticated");
  });
});
