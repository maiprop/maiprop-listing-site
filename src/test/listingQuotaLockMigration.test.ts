import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20260707156000_lock_listing_quota_checks.sql"),
  "utf8",
);

describe("listing quota lock migration", () => {
  it("serializes quota checks per owner before counting listing rows", () => {
    expect(migration).toContain("CREATE OR REPLACE FUNCTION public.check_listing_quota()");
    expect(migration).toContain("pg_advisory_xact_lock(hashtext('listing_quota:' || v_actor::text))");
    expect(migration).toContain("WHERE owner_id = v_actor");
  });

  it("keeps entitlement and terminal-status semantics explicit", () => {
    expect(migration).toContain("public.has_audience_scoped_pro_entitlement(p.user_id)");
    expect(migration).toContain("public.get_listing_limit(v_role, v_is_pro)");
    expect(migration).toContain("COALESCE(status::text, 'active') NOT IN");
    expect(migration).toContain("'deleted'");
    expect(migration).toContain("'closed'");
  });

  it("keeps the private quota helper callable for browser RLS usage", () => {
    expect(migration).toContain("GRANT EXECUTE ON FUNCTION private.check_listing_quota() TO authenticated, service_role");
  });
});
