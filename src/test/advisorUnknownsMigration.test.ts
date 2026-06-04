import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260707158000_resolve_hardening_advisor_unknowns.sql"),
  "utf8",
);

describe("hardening advisor unknowns migration", () => {
  it("removes browser execute grants from internal security-definer helpers", () => {
    expect(migration).toContain("public.guard_viewing_status_transitions()");
    expect(migration).toContain("public.check_listing_quota()");
    expect(migration).toContain("REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION %s TO service_role");
  });

  it("keeps the private listing quota helper available for RLS while indexing the addon ledger owner key", () => {
    expect(migration).toContain("private.check_listing_quota()");
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role");
    expect(migration).toContain("CREATE INDEX IF NOT EXISTS idx_addon_purchases_user_id");
    expect(migration).toContain("ON public.addon_purchases (user_id)");
  });
});
