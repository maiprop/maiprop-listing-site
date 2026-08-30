import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260728115959_quarantine_invalid_os_auction_identity.sql",
);

const migration = readFileSync(migrationPath, "utf8");
const pgtap = readFileSync(
  resolve(process.cwd(), "supabase/tests/catalogue_invalid_os_identity_quarantine_test.sql"),
  "utf8",
);

describe("invalid OS source identity quarantine migration", () => {
  it("keeps the executable pgTAP plan synchronized with every top-level assertion", () => {
    const declaredPlan = Number(pgtap.match(/^SELECT plan\((\d+)\);$/m)?.[1]);
    const assertionCount = (
      pgtap.match(/^SELECT (?:ok|is|throws_ok|set_eq)\(/gm) ?? []
    ).length;

    expect(declaredPlan).toBe(49);
    expect(assertionCount).toBe(declaredPlan);
  });

  it("uses the established bounded listing-before-promotion lock protocol", () => {
    const transaction = migration.indexOf("BEGIN;");
    const timeout = migration.indexOf("SET LOCAL lock_timeout = '5s'");
    const statementTimeout = migration.indexOf("SET LOCAL statement_timeout = '30s'");
    const listingLock = migration.indexOf(
      "LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE",
    );
    const promotionLock = migration.indexOf(
      "LOCK TABLE public.listing_promotion_allocations IN SHARE MODE",
    );
    const plan = migration.indexOf(
      "CREATE TEMP TABLE invalid_os_auction_identity_plan",
    );
    const commit = migration.lastIndexOf("COMMIT;");

    expect(transaction).toBeGreaterThanOrEqual(0);
    expect(timeout).toBeGreaterThan(transaction);
    expect(statementTimeout).toBeGreaterThan(timeout);
    expect(listingLock).toBeGreaterThan(statementTimeout);
    expect(promotionLock).toBeGreaterThan(listingLock);
    expect(plan).toBeGreaterThan(promotionLock);
    expect(commit).toBeGreaterThan(plan);
  });

  it("creates a private recoverable snapshot with a restrictive listing FK and no direct access", () => {
    expect(migration).toContain(
      "CREATE TABLE private.os_auction_invalid_identity_quarantine",
    );
    expect(migration).toMatch(
      /listing_id uuid PRIMARY KEY\s+REFERENCES public\.listings\(id\) ON DELETE RESTRICT/,
    );
    expect(migration).toContain("previous_status public.listing_status NOT NULL");
    expect(migration).toContain("previous_tags text[] NOT NULL");
    expect(migration).toContain(
      "quarantined_at timestamptz NOT NULL DEFAULT statement_timestamp()",
    );
    expect(migration).toContain("reason text NOT NULL CHECK (reason IN (");
    expect(migration).toContain(
      "REVOKE ALL ON TABLE private.os_auction_invalid_identity_quarantine",
    );
    expect(migration).toContain("FROM PUBLIC, anon, authenticated");
  });

  it("uses the normalized five-subtype identity predicate and excludes duplicate-quarantined rows", () => {
    expect(migration).toContain("identity.listing_type <> 'auction'::public.listing_type");
    expect(migration).toContain("provider_tag_count = 0");
    expect(migration).toContain("provider_tag_count > 1");
    expect(migration).toContain(
      "'unknown', 'null', 'undefined', 'none', 'na', 'n/a'",
    );
    expect(migration).toContain("min(value) ~ '^[a-z0-9:_-]{1,120}$'");
    expect(migration).toContain("ARRAY['source:maiprop-os']::text[]");
    expect(migration).toContain(
      "ARRAY['source:maiprop-os-invalid-identity-quarantine']::text[]",
    );
  });

  it("fails the whole transaction for any owner or active promotion before snapshot/update", () => {
    const ownerGuard = migration.indexOf("os_auction_invalid_identity_has_owner");
    const promotionGuard = migration.indexOf(
      "os_auction_invalid_identity_has_active_promotion",
    );
    const snapshot = migration.indexOf(
      "INSERT INTO private.os_auction_invalid_identity_quarantine",
    );
    const update = migration.indexOf("UPDATE public.listings AS listing");

    expect(ownerGuard).toBeGreaterThanOrEqual(0);
    expect(promotionGuard).toBeGreaterThan(ownerGuard);
    expect(snapshot).toBeGreaterThan(promotionGuard);
    expect(update).toBeGreaterThan(snapshot);
    expect(migration).toContain("allocation.ends_at > statement_timestamp()");
    expect(migration).toContain("allocation.revoked_at IS NULL");
    expect(migration).not.toContain("allocation.starts_at <= statement_timestamp()");
  });

  it("pauses active candidates, preserves original tags privately, and hides every live OS consumer tag", () => {
    expect(migration).toContain(
      "WHEN listing.status = 'active'::public.listing_status",
    );
    expect(migration).toContain("THEN 'paused'::public.listing_status");
    expect(migration).toContain(
      "previous_tags text[] NOT NULL",
    );
    expect(migration).toContain("tag.value <> 'source:maiprop-os'");
    expect(migration).toContain(
      "left(tag.value, length('os_auction:')) <> 'os_auction:'",
    );
    expect(migration).not.toContain("LIKE 'os_auction:%'");
    expect(migration).toContain(
      "source:maiprop-os-invalid-identity-quarantine",
    );
    expect(migration).not.toMatch(/DELETE\s+FROM\s+public\.listings/i);
    expect(migration).not.toMatch(/SET\s+(?:os_auction_id|provider_id)\s*=/i);
    expect(migration).not.toContain("os_auction_duplicate:");
    expect(migration).not.toContain("private.publish_public_catalogue()");
  });

  it("is rerun-safe and proves no eligible invalid source row remains", () => {
    expect(migration).toContain("v_candidate_count > 1");
    expect(migration).not.toContain("ON CONFLICT");
    expect(migration).toContain("os_auction_invalid_identity_quarantine_incomplete");
    expect(migration).toMatch(
      /WHERE[\s\S]*?tags[\s\S]*?@> ARRAY\['source:maiprop-os'\]::text\[\][\s\S]*?RAISE EXCEPTION 'os_auction_invalid_identity_quarantine_incomplete'/,
    );
  });
});
