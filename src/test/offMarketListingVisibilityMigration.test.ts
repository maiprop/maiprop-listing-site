import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const visibilityMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260526171502_hide_off_market_from_public_select.sql"),
  "utf8",
);
const dedupMigration = readFileSync(
  resolve(process.cwd(), "supabase/migrations/20260604120000_performance_rls_initplan_and_dedup.sql"),
  "utf8",
);
const migration = `${visibilityMigration}\n${dedupMigration}`;
const normalizedVisibilitySql = visibilityMigration.toLowerCase();
const normalizedDedupSql = dedupMigration.toLowerCase();
const normalizedSql = migration.toLowerCase();

describe("off-market listing visibility migration", () => {
  it("replaces the public listing select policy", () => {
    expect(normalizedVisibilitySql).toContain('drop policy if exists "active listings are public" on public.listings');
    expect(normalizedVisibilitySql).toContain('drop policy if exists "listings_select" on public.listings');
    expect(normalizedVisibilitySql).toContain('create policy "listings_select"');
  });

  it("keeps public reads to active non-off-market listings while preserving owner access", () => {
    expect(migration).toContain("status = 'active'::public.listing_status");
    expect(migration).toContain("COALESCE(is_off_market, false) = false");
    expect(normalizedSql).toContain("or (select auth.uid()) = owner_id");
  });

  it("keeps the later RLS dedup migration replay-safe and off-market aware", () => {
    expect(normalizedDedupSql).toContain('drop policy if exists "listings_select"');
    expect(normalizedDedupSql).toContain('create policy "listings_select"');
    expect(dedupMigration).toContain("COALESCE(is_off_market, false) = false");
  });
});
