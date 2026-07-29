import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726224342_harden_storage_cleanup_lifecycle.sql",
  ),
  "utf8",
);
const serviceRoleAuthMigration = readdirSync(
  resolve(process.cwd(), "supabase/migrations"),
)
  .filter((name) => name.endsWith(".sql"))
  .map((name) =>
    readFileSync(resolve(process.cwd(), "supabase/migrations", name), "utf8"),
  )
  .find((sql) =>
    sql.includes("CREATE OR REPLACE FUNCTION private.is_service_role_request"),
  ) ?? "";
const transitionMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726234925_harden_storage_cleanup_transitions_and_active_drafts.sql",
  ),
  "utf8",
);

describe("storage cleanup lifecycle hardening", () => {
  it("registers every exact new-building object before upload", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.register_new_building_storage_upload",
    );
    expect(migration).toContain("(SELECT auth.uid())");
    expect(migration).toContain("storage_upload_path_invalid");
    expect(migration).toContain("interval '24 hours'");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.register_new_building_storage_upload\([\s\S]*?\)\s+TO authenticated/i,
    );
  });

  it("coordinates atomic creation with registered upload jobs", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.create_new_building_listing_with_storage_for_service",
    );
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("storage_upload_not_registered");
    expect(migration).toContain("storage_cleanup_in_progress");
    expect(migration).toContain("public.create_new_building_listing_for_service");
    expect(migration).toContain("status = 'completed'");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.create_new_building_listing_with_storage_for_service\([\s\S]*?\)\s+TO service_role/i,
    );
  });

  it("uses exact bucket and object path identity with renewable leases", () => {
    expect(migration).toContain("ADD COLUMN IF NOT EXISTS lease_token uuid");
    expect(migration).toContain("lease_token = gen_random_uuid()");
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.prepare_storage_cleanup_delete",
    );
    const commitmentSignature = transitionMigration.match(
      /CREATE OR REPLACE FUNCTION public\.is_storage_object_committed\(([\s\S]*?)\)\s+RETURNS boolean/i,
    )?.[1] ?? "";
    expect(migration).toContain(
      "DROP FUNCTION IF EXISTS public.is_storage_object_committed(text)",
    );
    expect(commitmentSignature).toContain("p_bucket text");
    expect(commitmentSignature).toContain("p_object_path text");
    expect(commitmentSignature).toContain("p_object_url text");
    expect(migration).toContain("candidate.lease_token = p_lease_token");
    expect(migration).toMatch(
      /IF v_job\.status = 'processing' THEN\s+RAISE EXCEPTION 'storage_cleanup_in_progress'/i,
    );
  });

  it("provides service-only dead-job requeue and admin-visible alerts", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.requeue_storage_cleanup_job",
    );
    expect(migration).toContain("storage_cleanup_dead");
    expect(migration).toMatch(/storage cleanup job exhausted retries/i);
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.requeue_storage_cleanup_job\(uuid\)\s+TO service_role/i,
    );
  });

  it("authorizes service RPCs from the current JWT claims object", () => {
    expect(serviceRoleAuthMigration).toContain(
      "CREATE OR REPLACE FUNCTION private.is_service_role_request",
    );
    expect(serviceRoleAuthMigration).toContain("auth.jwt() ->> 'role'");
    expect(serviceRoleAuthMigration).not.toMatch(
      /IF current_setting\('request\.jwt\.claim\.role', true\) IS DISTINCT FROM 'service_role'/i,
    );
  });
});
