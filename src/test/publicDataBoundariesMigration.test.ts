import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260721193854_enforce_public_data_boundaries.sql"),
  "utf8",
);

function policy(name: string): string {
  const match = migration.match(
    new RegExp(`CREATE POLICY "${name}"[\\s\\S]*?;`, "m"),
  );
  return match?.[0] ?? "";
}

describe("public data boundary migration", () => {
  it("keeps investor access on the sanitized Quick Sale feed only", () => {
    const selectPolicy = policy("firesale_requests_select");

    expect(selectPolicy).toContain("user_id = (SELECT auth.uid())");
    expect(selectPolicy).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(selectPolicy).not.toContain("published_to_investors");
    expect(selectPolicy).not.toContain("has_current_investor_subscription");
    expect(migration).toContain(
      "GRANT SELECT ON TABLE public.firesale_requests_investor_feed TO authenticated",
    );
  });

  it("removes owner-controlled Quick Sale workflow mutations", () => {
    const updatePolicy = policy("firesale_requests_update");

    expect(updatePolicy).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(updatePolicy).not.toContain("= user_id");
    expect(migration).toContain(
      "authenticated Quick Sale writes remain behind authenticated Edge Functions",
    );
  });

  it("keeps professional profile edits while reserving verification state for admins", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION private.guard_professional_managed_fields()");
    expect(migration).toContain("NEW.verified IS DISTINCT FROM OLD.verified");
    expect(migration).toContain("NEW.verified_at IS DISTINCT FROM OLD.verified_at");
    expect(migration).toContain("NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason");
    expect(migration).toContain("NEW.notes IS DISTINCT FROM OLD.notes");
    expect(migration).toContain("NEW.subscription_tier IS DISTINCT FROM OLD.subscription_tier");
    expect(migration).toContain("professional_managed_fields_forbidden");
    expect(migration).toContain("BEFORE INSERT OR UPDATE ON public.professionals");

    const updatePolicy = policy("professionals_update");
    expect(updatePolicy).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(updatePolicy).toContain("WITH CHECK");
  });

  it("adds an allowlisted public catalogue without prematurely revoking the legacy path", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.public_listing_catalogue");
    expect(migration).toContain("WITH (security_barrier = true, security_invoker = true)");
    expect(migration).toContain("WHERE listing.status = 'active'::public.listing_status");
    expect(migration).toContain("COALESCE(listing.is_off_market, FALSE) = FALSE");
    expect(migration).not.toMatch(/SELECT\s+listing\.\*/i);
    expect(migration).not.toContain("listing.cadastre_number");
    expect(migration).not.toContain("listing.enfia_zone");
    expect(migration).not.toContain("listing.organization_id");
    expect(migration).toContain("GRANT SELECT ON TABLE public.public_listing_catalogue TO anon, authenticated");
    expect(migration).not.toContain("REVOKE SELECT ON TABLE public.listings FROM anon");
  });

  it("preserves card and detail media shapes without unconditional embedded joins", () => {
    expect(migration).toContain("AS listing_images");
    expect(migration).toContain("AS listing_images_detail");
    expect(migration).toContain("LIMIT 3");
    expect(migration).toContain("CASE WHEN listing.project_id IS NULL THEN NULL");
    expect(migration).toContain("AS project");
    expect(migration).toContain("AS project_detail");
    expect(migration).toContain("idx_listing_images_listing_sort");
  });
});
