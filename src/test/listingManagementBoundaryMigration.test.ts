import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260722034703_enforce_listing_management_boundaries.sql"),
  "utf8",
);

describe("listing management boundary migration", () => {
  it("makes the public projection independent from raw listings grants", () => {
    expect(migration).toContain("ALTER VIEW public.public_listing_catalogue");
    expect(migration).toContain("security_invoker = false");
    expect(migration).toContain("REVOKE ALL ON TABLE public.listings FROM anon");
    expect(migration).toContain("DROP POLICY IF EXISTS listings_select ON public.listings");
  });

  it("scopes private reads to owners, organizations and authoritative admins", () => {
    expect(migration).toContain("CREATE OR REPLACE VIEW public.listing_management_catalogue");
    expect(migration).toContain("listing.owner_id = (SELECT auth.uid())");
    expect(migration).toContain("private.has_org_permission(");
    expect(migration).toContain("private.has_platform_admin((SELECT auth.uid()))");
    expect(migration).toContain("GRANT SELECT ON TABLE public.listing_management_catalogue TO authenticated");
  });

  it("removes broad read privileges without bypassing existing write rules", () => {
    expect(migration).toContain(
      "REVOKE SELECT, REFERENCES, TRIGGER, TRUNCATE ON TABLE public.listings",
    );
    expect(migration).toContain("GRANT INSERT, UPDATE, DELETE ON TABLE public.listings TO authenticated");
    expect(migration).toContain("GRANT SELECT (id, owner_id) ON TABLE public.listings TO authenticated");
    expect(migration).not.toContain("SECURITY DEFINER\nRETURNS");
  });
});
