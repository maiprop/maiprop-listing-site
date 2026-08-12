import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726182846_create_new_building_atomic_boundary.sql",
  ),
  "utf8",
);

describe("atomic new-building creation boundary", () => {
  it("uses one service-role-only security-definer transaction function", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.create_new_building_listing_for_service",
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.create_new_building_listing_for_service\([\s\S]*?\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_new_building_listing_for_service\([\s\S]*?\)\s+TO service_role;/,
    );
  });

  it("validates actor, row counts, and fixed business classifications", () => {
    expect(migration).toContain("authentication_required");
    expect(migration).toContain("private.has_developer_listing_access");
    expect(migration).toContain("building_permit_required");
    expect(migration).toContain("new_build_unit_count_invalid");
    const listingInsert = migration.slice(
      migration.indexOf("INSERT INTO public.listings"),
      migration.indexOf("UPDATE public.project_units"),
    );
    expect(listingInsert).toContain("p_actor_user_id");
    expect(listingInsert).toContain("'new_build'::public.listing_type");
    expect(listingInsert).toContain("'active'::public.listing_status");
    expect(listingInsert).toMatch(/\n\s+false,/);
  });

  it("preserves authorized organization ownership on both project and listing", () => {
    expect(migration).toContain("p_organization_id uuid");
    expect(migration).toMatch(
      /private\.has_org_permission\(\s*p_organization_id,\s*'project:manage',\s*p_actor_user_id\s*\)/,
    );
    expect(migration).toMatch(
      /INSERT INTO public\.projects[\s\S]*?\n\s+p_organization_id,/,
    );
    expect(migration).toMatch(
      /INSERT INTO public\.listings[\s\S]*?\n\s+p_organization_id,/,
    );
  });

  it("derives commercial fields and two-decimal prices inside the transaction", () => {
    expect(migration).toContain("'available'");
    expect(migration).not.toContain(
      "COALESCE(NULLIF(BTRIM(v_unit->>'availability_status'), ''), 'available')",
    );
    expect(migration).toContain("ROUND(");
    expect(migration).toMatch(/ROUND\([\s\S]*?,\s*2\s*\)/);
    expect(migration).toContain(
      "WHEN p_project_kind = 'renovation' THEN 'renovated'",
    );
    expect(migration).toContain("'renovation_project'");
    expect(migration).not.toContain("p_listing->>'construction_status'");
    expect(migration).not.toContain("p_listing->'tags'");
  });

  it("is retry-safe and resolves equal-price representative units by input order", () => {
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("'idempotent', true");
    expect(migration).toContain("ROUND(NULLIF(v_unit->>'price', '')::numeric, 2)");
    expect(migration).toContain("ROUND(NULLIF(v_unit->>'internal_sqm', '')::numeric, 2)");
    expect(migration).toContain("ROUND((v_representative->>'price')::numeric, 2)");
    expect(migration).toContain("ROUND((v_representative->>'internal_sqm')::numeric, 2)");
    expect(migration).toContain("WITH ORDINALITY");
    expect(migration).toMatch(
      /ORDER BY[\s\S]*?\(item\.value->>'price'\)::numeric[\s\S]*?item\.ordinality/,
    );
  });

  it("rejects partial coordinates and impossible project date ordering", () => {
    expect(migration).toContain("project_coordinates_incomplete");
    expect(migration).toContain("project_dates_out_of_order");
    expect(migration).toContain("construction_start_date");
    expect(migration).toContain("structural_completion_date");
    expect(migration).toContain("delivery_date");
  });

  it("inserts every root and child row before returning both identifiers", () => {
    expect(migration).toContain("INSERT INTO public.projects");
    expect(migration).toContain("INSERT INTO public.project_units");
    expect(migration).toContain("INSERT INTO public.listings");
    expect(migration).toContain("UPDATE public.project_units");
    expect(migration).toContain("INSERT INTO public.project_media");
    expect(migration).toContain("INSERT INTO public.listing_images");
    expect(migration).toContain("'listingId', v_listing_id");
    expect(migration).toContain("'projectId', v_project_id");
  });
});
