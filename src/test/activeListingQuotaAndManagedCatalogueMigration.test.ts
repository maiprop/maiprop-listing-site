import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726220701_correct_active_listing_quota_and_managed_catalogue.sql",
  ),
  "utf8",
);

const correction = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728093154_align_managed_catalogue_and_promotion_principal.sql",
  ),
  "utf8",
);

const transitionHardening = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726234925_harden_storage_cleanup_transitions_and_active_drafts.sql",
  ),
  "utf8",
);

describe("active listing quota and managed catalogue correction", () => {
  it("counts only active personal listings against user-funded listing quotas", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION private.check_listing_quota_for_owner",
    );
    expect(migration).toMatch(
      /WHERE owner_id = p_owner_user_id\s+AND status = 'active'::public\.listing_status/,
    );
    expect(migration).not.toMatch(
      /COALESCE\(status::text,\s*'active'\)\s+NOT IN/,
    );
    expect(transitionHardening).toMatch(
      /listing\.owner_id = p_owner_user_id\s+AND listing\.organization_id IS NULL\s+AND listing\.status = 'active'::public\.listing_status/,
    );
    expect(transitionHardening).toContain(
      "CREATE OR REPLACE FUNCTION private.check_listing_quota_for_principal",
    );
  });

  it("keeps personal ownership distinct from organization membership", () => {
    expect(correction).toContain(
      "CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue()",
    );
    expect(correction).toMatch(
      /catalogue\.organization_id IS NULL\s+AND catalogue\.owner_id = v_actor/,
    );
    expect(correction).toMatch(
      /private\.has_org_permission\(\s*catalogue\.organization_id,\s*'listing:manage',\s*v_actor\s*\)/,
    );
    expect(correction).not.toMatch(
      /catalogue\.owner_id = v_actor\s+OR/,
    );
    expect(correction).not.toContain("'listing:view'");
    expect(correction).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_manageable_listing_catalogue\(\)\s+TO authenticated;/,
    );
  });

  it("paginates the managed catalogue with a stable unique cursor and exact total", () => {
    expect(correction).toContain(
      "CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue_page",
    );
    expect(correction).toContain("p_before_created_at");
    expect(correction).toContain("p_before_id");
    expect(correction).toMatch(
      /ORDER BY catalogue\.created_at DESC, catalogue\.id DESC/,
    );
    expect(correction).toContain("total_count");
    expect(correction).toContain("next_created_at");
    expect(correction).toContain("next_id");
    expect(correction).toContain(
      "LEAST(GREATEST(COALESCE(p_limit, 50), 1), 100)",
    );
  });

  it("returns authoritative managed-catalogue analytics from the same scope", () => {
    expect(correction).toContain(
      "CREATE OR REPLACE FUNCTION public.get_manageable_listing_summary",
    );
    expect(correction).toContain("'totalListings'");
    expect(correction).toContain("'activeListings'");
    expect(correction).toContain("'totalViews'");
    expect(correction).toContain("'averageViews'");
    expect(correction).toContain("'averageActiveDays'");
    expect(correction).toContain("'bestListing'");
  });
});
