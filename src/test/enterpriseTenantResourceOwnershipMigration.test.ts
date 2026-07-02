import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260702180854_enterprise_tenant_resource_ownership.sql",
);

const readMigration = () =>
  existsSync(migrationPath) ? readFileSync(migrationPath, "utf8").replace(/\s+/g, " ") : "";

describe("enterprise tenant resource ownership migration", () => {
  it("adds optional organization ownership to listings and projects without breaking personal rows", () => {
    const migration = readMigration();

    expect(migration).toContain("ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS organization_id uuid");
    expect(migration).toContain("ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS organization_id uuid");
    expect(migration).toContain("REFERENCES public.organizations(id) ON DELETE SET NULL");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_listings_organization_id");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_projects_organization_id");
    expect(migration).toContain("organization_id IS NULL OR owner_id IS NOT NULL");
  });

  it("extends tenant permissions and RLS policies to resource management", () => {
    const migration = readMigration();

    expect(migration).toContain("p_permission = ANY(ARRAY['listing:view', 'project:view'])");
    expect(migration).toContain("p_permission = ANY(ARRAY['listing:manage', 'project:manage'])");
    expect(migration).toContain("private.has_org_permission(organization_id, 'listing:manage'");
    expect(migration).toContain("private.has_org_permission(organization_id, 'project:manage'");
    expect(migration).toContain("organization_id IS NULL AND owner_id = (SELECT auth.uid())");
    expect(migration).toContain("organization_id IS NOT NULL");
    expect(migration).toContain("CREATE TRIGGER trg_guard_listings_tenant_resource_owner_update");
    expect(migration).toContain("CREATE TRIGGER trg_guard_projects_tenant_resource_owner_update");
  });

  it("records tenant ownership as an enterprise evidence item", () => {
    const migration = readMigration();

    expect(migration).toContain("COMMENT ON COLUMN public.listings.organization_id");
    expect(migration).toContain("COMMENT ON COLUMN public.projects.organization_id");
    expect(migration).toContain("enterprise tenant resource ownership contract missing");
  });
});
