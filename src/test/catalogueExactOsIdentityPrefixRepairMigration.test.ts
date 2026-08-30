import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260728121500_repair_exact_os_auction_identity_prefix.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("exact OS identity prefix corrective migration", () => {
  it("exists between the identity bridge and catalogue migrations", () => {
    expect(existsSync(migrationPath)).toBe(true);
    expect("20260728120000" < "20260728121500").toBe(true);
    expect("20260728121500" < "20260728123058").toBe(true);
  });

  it("replaces wildcard identity matching with literal-prefix semantics", () => {
    expect(migration).toContain(
      "left(tag.value, length('os_auction:')) = 'os_auction:'",
    );
    expect(migration).not.toContain("LIKE 'os_auction:%'");
  });

  it("locks, drops the old check, recomputes stored values, and validates the exact check", () => {
    const lock = migration.indexOf("LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE");
    const drop = migration.indexOf("DROP CONSTRAINT listings_os_auction_source_identity_valid");
    const historicalGuard = migration.indexOf(
      "os_auction_exact_prefix_historical_duplicate_requires_manual_recovery",
    );
    const replace = migration.indexOf("CREATE OR REPLACE FUNCTION private.extract_os_auction_id");
    const add = migration.indexOf("ADD CONSTRAINT listings_os_auction_source_identity_valid");
    const plan = migration.indexOf("CREATE TEMP TABLE exact_os_auction_identity_repair_plan");
    const replica = migration.indexOf("SET LOCAL session_replication_role = replica");
    const updates = [...migration.matchAll(/UPDATE public\.listings AS listing/g)].map(
      (match) => match.index ?? -1,
    );
    const update = updates[0] ?? -1;
    const origin = migration.indexOf("SET LOCAL session_replication_role = origin");
    const validate = migration.indexOf("VALIDATE CONSTRAINT listings_os_auction_source_identity_valid");

    expect(replace).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(replace);
    expect(historicalGuard).toBeGreaterThan(lock);
    expect(drop).toBeGreaterThan(historicalGuard);
    expect(add).toBeGreaterThan(drop);
    expect(plan).toBeGreaterThan(add);
    expect(replica).toBeGreaterThan(plan);
    expect(update).toBeGreaterThan(replica);
    expect(updates).toHaveLength(2);
    expect(migration.indexOf("plan.expected_os_auction_id IS NULL")).toBeLessThan(
      migration.indexOf("plan.expected_os_auction_id IS NOT NULL"),
    );
    expect(origin).toBeGreaterThan(update);
    expect(validate).toBeGreaterThan(origin);
    expect(migration).toContain("listing.os_auction_id IS DISTINCT FROM");
    expect(migration).toContain("to_jsonb(listing) - 'os_auction_id'");
    expect(migration).toContain("v_candidate_count > 10");
    expect(migration).toContain(
      "v_null_update_count <> v_null_candidate_count",
    );
    expect(migration).toContain("v_value_update_count <> v_value_candidate_count");
    expect(migration).toContain("os_auction_exact_prefix_repair_changed_listing_state");
    expect(migration).toContain("os_auction_exact_prefix_repair_incomplete");
  });

  it("fails closed if quarantine has not removed an exact-source invalid row", () => {
    expect(migration).toContain("ARRAY['source:maiprop-os']::text[]");
    expect(migration).toContain("private.extract_os_auction_id(listing.tags) IS NULL");
    expect(migration).toContain("os_auction_exact_prefix_requires_quarantine");
    expect(migration).toContain("private.os_auction_duplicate_quarantine");
    expect(migration).toContain("canonical.id = quarantine.canonical_listing_id");
    expect(migration).toContain("private.os_auction_invalid_identity_quarantine");
    expect(migration).toContain(
      "canonical_quarantine.listing_id = quarantine.canonical_listing_id",
    );
    expect(migration).toContain(
      "private.extract_os_auction_id(quarantine.previous_tags)",
    );
    expect(migration).toContain(
      "COALESCE(canonical_quarantine.previous_tags, canonical.tags)",
    );
    expect(migration).toContain("IS DISTINCT FROM quarantine.provider_id");
    expect(migration).toContain(
      "os_auction_exact_prefix_historical_duplicate_requires_manual_recovery",
    );
  });
});
