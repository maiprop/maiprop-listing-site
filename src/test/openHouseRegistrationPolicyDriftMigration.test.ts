import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260615190500_drop_open_house_registration_all_policy.sql",
);
const migration = readFileSync(migrationPath, "utf8");

describe("open-house registration stale policy cleanup migration", () => {
  it("drops the stale requester FOR ALL policy that overlaps action-specific policies", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "oh_regs_requester"');
    expect(migration).toContain("ON public.open_house_registrations");
  });

  it("also removes legacy named registration policies from older migration paths", () => {
    expect(migration).toContain('DROP POLICY IF EXISTS "OH regs: requester read/insert/update own"');
    expect(migration).toContain('DROP POLICY IF EXISTS "OH regs: owner read/update all for their listing"');
    expect(migration).toContain('DROP POLICY IF EXISTS "OH regs: owner update (approval, attendance)"');
  });

  it("fails migration replay if stale policies still exist after cleanup", () => {
    expect(migration).toContain("RAISE EXCEPTION 'stale open_house_registrations permissive policy still exists'");
    expect(migration).toContain("FROM pg_policies");
    expect(migration).toContain("policyname IN");
  });
});
