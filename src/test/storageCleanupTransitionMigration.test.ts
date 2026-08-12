import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const readRepoFile = (path: string) =>
  readFileSync(resolve(process.cwd(), path), "utf8");

const migration = readRepoFile(
  "supabase/migrations/20260726234925_harden_storage_cleanup_transitions_and_active_drafts.sql",
);

describe("Storage cleanup transition and quota hardening", () => {
  it("writes new editor uploads to the canonical media namespace", () => {
    const projectDetail = readRepoFile("src/pages/ProjectDetail.tsx");
    expect(projectDetail).toContain(
      "`${user.id}/${id}/media/${mediaType}-${crypto.randomUUID()}.${ext}`",
    );
    expect(projectDetail).not.toContain(
      "`${user.id}/${id}/${mediaType}-${crypto.randomUUID()}.${ext}`",
    );
  });

  it("uses locked service-only lifecycle transitions instead of lease-overwriting upserts", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.stage_storage_cleanup_jobs_for_service",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.settle_storage_cleanup_jobs_for_service",
    );
    expect(migration).toContain("storage_cleanup_in_progress");
    expect(migration).toContain("FOR UPDATE");
    expect(migration).toContain("status = 'held'");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.stage_storage_cleanup_jobs_for_service[\s\S]*TO service_role/i,
    );
  });

  it("accepts canonical editor media paths and the existing flat-path family", () => {
    expect(migration).toContain("'media/%'");
    expect(migration).toContain("p_bucket = 'project-media'");
    expect(migration).toContain("storage_cleanup_jobs_path_scope_check");
  });

  it("uses exact canonical object URLs and exact committed references", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.storage_cleanup_expected_public_url",
    );
    expect(migration).toContain("IS DISTINCT FROM v_expected_url");
    expect(migration).toContain("media.url = p_object_url");
    expect(migration).toContain("listing.cover_image_url = p_object_url");
    expect(migration).toContain("image.url = p_object_url");
  });

  it("requires the registered cleanup set to equal the media committed atomically", () => {
    expect(migration).toContain("storage_upload_manifest_mismatch");
    expect(migration).toContain("jsonb_array_elements(p_project_media)");
    expect(migration).toContain("p_listing->>'cover_image_url'");
    expect(migration).toContain("jsonb_array_elements_text(p_additional_image_urls)");
    expect(migration).toContain(
      "private.storage_cleanup_expected_public_url(",
    );
    expect(migration).toMatch(/EXCEPT[\s\S]*EXCEPT/);
  });

  it("enforces the correct personal or organization principal inside fresh service-role creation transactions", () => {
    const wrapper = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.create_new_building_listing_with_storage_for_service",
      ),
      migration.indexOf(
        "REVOKE ALL ON FUNCTION public.create_new_building_listing_with_storage_for_service",
      ),
    );
    expect(wrapper).toMatch(
      /IF NOT v_existing\s+AND NOT private\.check_listing_quota_for_principal\(\s*p_actor_user_id,\s*p_organization_id\s*\) THEN/,
    );
    expect(wrapper).toContain("listing_limit_reached");
    expect(wrapper).toContain("organization_listing_plan_required");
    expect(wrapper.indexOf("private.check_listing_quota_for_principal")).toBeLessThan(
      wrapper.indexOf("public.create_new_building_listing_for_service"),
    );
  });

  it("completes only attached objects and immediately requeues retry-only uploads", () => {
    const wrapper = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.create_new_building_listing_with_storage_for_service",
      ),
      migration.indexOf(
        "REVOKE ALL ON FUNCTION public.create_new_building_listing_with_storage_for_service",
      ),
    );
    expect(wrapper).toMatch(
      /IF public\.is_storage_object_committed\([\s\S]*?THEN[\s\S]*?status = 'completed'[\s\S]*?ELSE[\s\S]*?status = 'pending'/,
    );
    expect(wrapper).toContain("next_attempt_at = now()");
    expect(wrapper).toContain("completed_at = NULL");
  });

  it("bounds registrations, retains operational evidence, and reconciles pg_net failures", () => {
    expect(migration).toContain("storage_cleanup_owner_limit_reached");
    expect(migration).toContain("storage_cleanup_project_limit_reached");
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS public.storage_cleanup_invocations",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.reconcile_storage_cleanup_invocations",
    );
    expect(migration).toContain("net._http_response");
    expect(migration).toContain("storage_cleanup_http_failed");
    expect(migration).toContain("storage_cleanup_backlog");
    expect(migration).toContain("interval '30 days'");
  });

  it("applies active cleanup quotas to terminal-job reactivation", () => {
    const registration = migration.slice(
      migration.indexOf(
        "CREATE OR REPLACE FUNCTION public.register_new_building_storage_upload",
      ),
      migration.indexOf(
        "REVOKE ALL ON FUNCTION public.register_new_building_storage_upload",
      ),
    );
    expect(registration).toContain("v_job_found := FOUND");
    expect(registration).toMatch(
      /IF NOT v_job_found\s+OR v_job\.status IN \('completed', 'dead'\) THEN[\s\S]*?storage_cleanup_owner_limit_reached[\s\S]*?storage_cleanup_project_limit_reached/,
    );
  });

  it("allows drafts at an active cap while keeping zero-allowance and activation checks", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.check_listing_limit()",
    );
    expect(migration).toContain("IF v_limit <= 0 THEN");
    expect(migration).toContain(
      "IF NEW.status = 'active'::public.listing_status",
    );
    expect(migration).toContain(
      "private.check_listing_quota_for_principal(",
    );
  });

  it("keeps personal usage separate and requires a service-controlled paid organization plan", () => {
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION private\.check_listing_quota_for_owner[\s\S]*?listing\.owner_id = p_owner_user_id\s+AND listing\.organization_id IS NULL\s+AND listing\.status = 'active'/,
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.check_listing_quota_for_principal",
    );
    expect(migration).toContain(
      "v_plan IN ('pro', 'enterprise', 'internal')",
    );
    expect(migration).toMatch(
      /CREATE OR REPLACE FUNCTION private\.update_listing_for_actor[\s\S]*?private\.check_listing_quota_for_principal\(\s*v_existing\.owner_id,\s*v_existing\.organization_id\s*\)/,
    );
    expect(migration).toContain("organization_listing_plan_required");
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION private\.check_listing_quota_for_principal\(uuid, uuid\)\s+FROM PUBLIC, anon, authenticated;/,
    );
  });

  it("requires Edge callers to use the locked lifecycle RPCs", () => {
    const creationFunction = readRepoFile(
      "supabase/functions/create-new-building-listing/index.ts",
    );
    const projectFunction = readRepoFile(
      "supabase/functions/project-management/index.ts",
    );

    expect(creationFunction).toContain("stage_storage_cleanup_jobs_for_service");
    expect(projectFunction).toContain("stage_storage_cleanup_jobs_for_service");
    expect(projectFunction).toContain("settle_storage_cleanup_jobs_for_service");
    expect(creationFunction).not.toMatch(
      /from\("storage_cleanup_jobs"\)\.upsert/,
    );
    expect(projectFunction).not.toMatch(
      /from\("storage_cleanup_jobs"\)\.upsert/,
    );
  });

  it("attaches editor media and listing covers through locked storage boundaries", () => {
    const projectFunction = readRepoFile(
      "supabase/functions/project-management/index.ts",
    );
    const projectDetail = readRepoFile("src/pages/ProjectDetail.tsx");

    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.attach_project_media_for_service",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.update_listing_cover_with_storage_for_service",
    );
    expect(migration).toMatch(
      /attach_project_media_for_service[\s\S]*?FOR UPDATE[\s\S]*?v_job\.status <> 'pending'[\s\S]*?INSERT INTO public\.project_media[\s\S]*?status = 'completed'/,
    );
    expect(migration).toMatch(
      /update_listing_cover_with_storage_for_service[\s\S]*?FOR UPDATE[\s\S]*?v_job\.status <> 'pending'[\s\S]*?UPDATE public\.listings[\s\S]*?status = 'completed'/,
    );
    expect(projectFunction).toContain("attach_project_media_for_service");
    expect(projectFunction).toContain(
      "update_listing_cover_with_storage_for_service",
    );
    expect(projectDetail).toContain("registerProjectStorageUpload");
    expect(projectDetail).toContain("uploadNewBuildingListingImage");
  });
});
