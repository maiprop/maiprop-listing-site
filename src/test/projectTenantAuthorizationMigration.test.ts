import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260726181627_align_project_tenant_authorization.sql",
);
const migration = readFileSync(migrationPath, "utf8");
const childScopeMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726215356_enforce_project_child_scope_immutability.sql",
  ),
  "utf8",
);

describe("project tenant authorization migration", () => {
  it("centralizes service-role authorization without exposing it to browser roles", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.can_manage_project(",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_project_management_context_for_service(",
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.get_project_management_context_for_service\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_project_management_context_for_service\(uuid, uuid\)\s+TO service_role;/,
    );
  });

  it("makes project deletion tenant-checked and atomic", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.delete_project_for_service(",
    );
    expect(migration).toContain("project_listing_tenant_mismatch");
    expect(migration).toContain(
      "UPDATE public.listings",
    );
    expect(migration).toContain(
      "DELETE FROM public.projects",
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.delete_project_for_service\(uuid, uuid\)\s+TO service_role;/,
    );
  });

  it.each([
    ["projects", "projects_owner_update"],
    ["project_units", "project_units_owner_update"],
    ["project_media", "project_media_owner_update"],
    ["project_leads", "project_leads_owner_update"],
  ])("requires tenant-aware USING and WITH CHECK for %s", (table, policy) => {
    const policyPattern = new RegExp(
      `CREATE POLICY "${policy}"[\\s\\S]*?ON public\\.${table}[\\s\\S]*?TO authenticated[\\s\\S]*?USING \\([\\s\\S]*?organization_id[\\s\\S]*?project:manage[\\s\\S]*?\\)[\\s\\S]*?WITH CHECK \\([\\s\\S]*?organization_id[\\s\\S]*?project:manage`,
    );
    expect(migration).toMatch(policyPattern);
  });

  it("keeps project ownership immutable for every browser actor", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.guard_tenant_resource_owner_update()",
    );
    expect(migration).not.toContain(
      "v_actor IS NULL OR private.has_platform_admin(v_actor)",
    );
    expect(migration).toContain(
      "tenant resource ownership cannot be reassigned",
    );
  });

  it.each(["project_units", "project_media", "project_leads"])(
    "prevents browser actors from moving %s between projects",
    (table) => {
      expect(childScopeMigration).toContain(
        "CREATE OR REPLACE FUNCTION private.guard_project_child_scope_update()",
      );
      expect(childScopeMigration).toMatch(
        new RegExp(
          `CREATE TRIGGER trg_guard_${table}_project_scope[\\s\\S]*?BEFORE UPDATE OF project_id ON public\\.${table}`,
        ),
      );
      expect(childScopeMigration).toContain(
        "project child scope cannot be reassigned",
      );
    },
  );
});
