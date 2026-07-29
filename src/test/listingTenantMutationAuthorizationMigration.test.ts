import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726211816_harden_listing_tenant_and_auction_provenance.sql",
  ),
  "utf8",
);

describe("listing tenant mutation authorization migration", () => {
  it("centralizes personal and active-organization management checks", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.can_manage_listing",
    );
    expect(migration).toMatch(
      /listing\.organization_id IS NULL\s+AND listing\.owner_id = p_actor_user_id/,
    );
    expect(migration).toMatch(
      /private\.has_org_permission\(\s+listing\.organization_id,\s+'listing:manage',\s+p_actor_user_id\s+\)/,
    );
    expect(migration).not.toContain("private.has_platform_admin(p_actor_user_id)");
  });

  it("creates organization listings only through a separate authorized argument", () => {
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.create_listing_for_user(jsonb)",
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION public\.create_listing_for_user\(\s*p_payload jsonb,\s*p_organization_id uuid DEFAULT NULL\s*\)/,
    );
    expect(migration).toMatch(
      /p_organization_id IS NOT NULL[\s\S]*?private\.has_org_permission\(\s*p_organization_id,\s*'listing:manage',\s*v_actor\s*\)/,
    );
    expect(migration).toMatch(
      /INSERT INTO public\.listings \(owner_id, organization_id,/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_listing_for_user\(jsonb, uuid\)\s+TO authenticated;/,
    );
  });

  it("uses the same tenant authorization for update and delete", () => {
    const updateFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION private.update_listing_for_actor",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION private.delete_listing_for_actor",
      ),
    );
    const deleteFunction = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION private.delete_listing_for_actor",
      ),
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.create_listing_for_user",
      ),
    );

    expect(updateFunction).toContain(
      "private.can_manage_listing(p_id, v_actor)",
    );
    expect(updateFunction).toContain("listing_not_managed");
    expect(deleteFunction).toContain(
      "private.can_manage_listing(p_id, v_actor)",
    );
    expect(deleteFunction).toContain("listing_not_managed");
  });

  it("locks and evaluates listing quota for the listing owner", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.check_listing_quota_for_owner",
    );
    expect(migration).toMatch(
      /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtext\('listing_quota:' \|\| p_owner_user_id::text\)\s*\)/,
    );
    expect(migration).toMatch(
      /FROM public\.listings[\s\S]*?owner_id = p_owner_user_id[\s\S]*?NOT IN \([\s\S]*?'deleted'[\s\S]*?'withdrawn'/,
    );
    expect(migration).toContain(
      "private.check_listing_quota_for_owner(v_existing.owner_id)",
    );
    expect(migration).toContain(
      "private.check_listing_quota_for_owner(NEW.owner_id)",
    );
  });

  it("does not expose authorization or owner-quota predicates to browser roles", () => {
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION private\.can_manage_listing\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated;/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION private\.can_manage_listing\(uuid, uuid\)\s+TO service_role;/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION private\.check_listing_quota_for_owner\(uuid\)\s+FROM PUBLIC, anon, authenticated;/,
    );
  });
});
