import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260707167000_developer_only_new_builds.sql",
);
const migrationSql = () => readFileSync(migrationPath, "utf8");

describe("developer-only new-build and project RLS migration", () => {
  it("adds a private developer access helper based on authoritative role", () => {
    const sql = migrationSql();

    expect(sql).toContain("CREATE OR REPLACE FUNCTION private.has_developer_listing_access");
    expect(sql).toContain("public.authoritative_role(_user_id) = 'developer'::public.user_role");
    expect(sql).toContain("private.has_platform_admin(_user_id)");
    expect(sql).toContain("REVOKE ALL ON FUNCTION private.has_developer_listing_access(uuid) FROM PUBLIC, anon");
  });

  it("blocks non-developer writes to new_build or project-linked listings", () => {
    const sql = migrationSql();

    expect(sql).toContain("DROP POLICY IF EXISTS listing_insert_quota ON public.listings");
    expect(sql).toContain("DROP POLICY IF EXISTS listings_update ON public.listings");
    expect(sql).toContain("COALESCE(listing_type::text, 'sale') <> 'new_build'");
    expect(sql).toContain("project_id IS NULL");
    expect(sql).toContain("private.has_developer_listing_access((SELECT auth.uid()))");
    expect(sql).toContain("WITH CHECK");
  });

  it("restricts project and project inventory writes to developer accounts", () => {
    const sql = migrationSql();

    for (const policy of [
      "projects_owner_insert",
      "projects_owner_update",
      "projects_owner_delete",
      "project_media_owner_insert",
      "project_media_owner_update",
      "project_media_owner_delete",
      "project_units_owner_insert",
      "project_units_owner_update",
      "project_units_owner_delete",
    ]) {
      expect(sql).toContain(`DROP POLICY IF EXISTS "${policy}"`);
      expect(sql).toContain(`CREATE POLICY "${policy}"`);
    }

    expect(sql).toContain("private.has_developer_listing_access((SELECT auth.uid()))");
  });

  it("contains migration-time assertions so policy drift fails loudly", () => {
    const sql = migrationSql();

    expect(sql).toContain("developer-only new-build listing insert policy missing");
    expect(sql).toContain("developer-only listing update policy missing");
    expect(sql).toContain("developer-only project insert policy missing");
    expect(sql).toContain("developer-only project inventory policy missing");
  });
});
