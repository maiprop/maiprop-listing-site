import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationSql = () =>
  readFileSync(
    resolve(process.cwd(), "supabase/migrations/20260702235107_drop_legacy_project_authenticated_select_policy.sql"),
    "utf8",
  ).replace(/\s+/g, " ");

describe("drop legacy project authenticated select policy migration", () => {
  it("removes the old authenticated project select policy while preserving tenant-aware select", () => {
    const sql = migrationSql();

    expect(sql).toContain('DROP POLICY IF EXISTS "Projects are visible to authenticated users" ON public.projects');
    expect(sql).toContain("legacy authenticated project select policy still present");
    expect(sql).toContain("policyname = 'projects_select'");
    expect(sql).toContain("tenant-aware project select policy missing");
  });
});
