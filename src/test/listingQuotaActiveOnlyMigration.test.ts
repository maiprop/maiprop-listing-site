import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260612163000_active_listing_quota_alignment.sql"),
  "utf8",
);

describe("active-only listing quota alignment migration", () => {
  it("counts active listings only while preserving the per-owner quota lock", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.check_listing_quota()");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('listing_quota:' || v_actor::text))");
    expect(migration).toContain("WHERE owner_id = v_actor");
    expect(migration).toContain("AND status = 'active'::public.listing_status");
    expect(migration).not.toContain("COALESCE(status::text, 'active') NOT IN");
  });

  it("keeps public quota helper off browser roles and private helper available for RLS", () => {
    expect(migration).toContain("REVOKE ALL ON FUNCTION public.check_listing_quota() FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION public.check_listing_quota() TO service_role");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO authenticated, service_role");
    expect(migration).toContain("public.check_listing_quota must not be browser-executable");
    expect(migration).toContain("private.check_listing_quota must remain callable for RLS evaluation");
  });
});
