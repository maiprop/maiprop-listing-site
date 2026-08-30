import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const migrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260728115960_prepare_batched_os_duplicate_quarantine.sql",
);
const migration = existsSync(migrationPath) ? readFileSync(migrationPath, "utf8") : "";

describe("batched OS auction duplicate quarantine migration", () => {
  it("exists as the only pre-bridge preparation migration", () => {
    expect(existsSync(migrationPath)).toBe(true);
  });

  it("uses one bounded transaction and preserves read availability", () => {
    expect(migration.match(/^BEGIN;$/gm)).toHaveLength(1);
    expect(migration.match(/^COMMIT;$/gm)).toHaveLength(1);
    expect(migration).toContain("SET LOCAL lock_timeout = '5s';");
    expect(migration).toContain("SET LOCAL statement_timeout = '30s';");

    const listingLock = migration.indexOf(
      "LOCK TABLE public.listings IN SHARE ROW EXCLUSIVE MODE;",
    );
    const promotionLock = migration.indexOf(
      "LOCK TABLE public.listing_promotion_allocations IN SHARE MODE;",
    );
    expect(listingLock).toBeGreaterThan(0);
    expect(promotionLock).toBeGreaterThan(listingLock);
    expect(migration).not.toContain("LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE");
  });

  it("creates and validates the exact private ledger expected by the bridge", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS private.os_auction_duplicate_quarantine",
    );
    expect(migration).toContain("duplicate_listing_id uuid PRIMARY KEY");
    expect(migration).toContain("canonical_listing_id uuid NOT NULL");
    expect(migration.match(/REFERENCES public\.listings\(id\) ON DELETE RESTRICT/g)).toHaveLength(
      2,
    );
    expect(migration).toContain("provider_id text NOT NULL");
    expect(migration).toContain("previous_status public.listing_status NOT NULL");
    expect(migration).toContain("previous_tags text[] NOT NULL");
    expect(migration).toContain("DEFAULT 'duplicate_os_auction_identity'");
    expect(migration).toContain("CHECK (duplicate_listing_id <> canonical_listing_id)");
    expect(migration).toMatch(/NOT attribute\.attisdropped\s*\n\s*\) <> 7/);
    expect(migration).toContain("os_auction_duplicate_quarantine_schema_drift");
    expect(migration).toContain(
      "constraint_record.conkey = ARRAY[v_duplicate_attribute]::smallint[]",
    );
    expect(migration).toContain(
      "constraint_record.conkey = ARRAY[v_canonical_attribute]::smallint[]",
    );
    expect(migration).toContain(
      "constraint_record.confkey = ARRAY[v_listings_id_attribute]::smallint[]",
    );
    expect(migration).toContain(
      "REVOKE ALL ON TABLE private.os_auction_duplicate_quarantine",
    );
    expect(migration).toMatch(
      /FROM PUBLIC, anon, authenticated, service_role;/,
    );
    for (const marker of [
      "relation.relpersistence = 'p'",
      "NOT relation.relrowsecurity",
      "NOT relation.relforcerowsecurity",
      "pg_catalog.pg_get_userbyid(relation.relowner) = 'postgres'",
      "privilege.grantee <> relation.relowner",
      "constraint_record.convalidated",
      "NOT constraint_record.condeferrable",
      "NOT constraint_record.condeferred",
      "attribute.attnum = 1",
      "attribute.attnum = 7",
    ]) {
      expect(migration).toContain(marker);
    }
    expect(migration).toContain(
      "CHECK ((reason = ''duplicate_os_auction_identity''::text))",
    );
    expect(migration).toContain(
      "CHECK ((duplicate_listing_id <> canonical_listing_id))",
    );
    expect(migration).not.toMatch(/pg_catalog\.pg_get_constraintdef\([^\n]+\)[\s\S]{0,120}\bLIKE\b/);
  });

  it("materializes extraction once and builds the bridge-equivalent deterministic plan", () => {
    const candidatesStart = migration.indexOf(
      "CREATE TEMP TABLE os_auction_identity_candidates",
    );
    const candidatesEnd = migration.indexOf(
      "CREATE TEMP TABLE os_auction_duplicate_plan",
      candidatesStart,
    );
    const candidateSql = migration.slice(candidatesStart, candidatesEnd);

    expect(candidateSql).toContain("WITH extracted AS MATERIALIZED");
    expect(candidateSql.match(/private\.extract_os_auction_id\(listing\.tags\)/g)).toHaveLength(1);
    expect(candidateSql).toContain(
      "WHERE listing.listing_type = 'auction'::public.listing_type",
    );

    const canonicalOrder = [
      "CASE WHEN candidate.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC",
      "candidate.updated_at DESC",
      "candidate.created_at DESC",
      "candidate.id DESC",
    ];
    let previousIndex = -1;
    for (const marker of canonicalOrder) {
      const index = migration.indexOf(marker, previousIndex + 1);
      expect(index).toBeGreaterThan(previousIndex);
      previousIndex = index;
    }
    expect(migration).toContain("os_auction_duplicate_candidate_cap_exceeded");
    expect(migration).toContain("v_candidate_count > 65536");
    expect(migration).toContain("/ 1024)::integer AS batch_no");
    expect(migration).toContain("v_max_batch_count > 1024");
    expect(migration).not.toContain("CHECK (batch_no BETWEEN 0 AND 63)");
  });

  it("guards owners and live promotions before any ledger or listing data mutation", () => {
    const ownerGuard = migration.indexOf("os_auction_duplicate_has_owner");
    const promotionGuard = migration.indexOf("os_auction_duplicate_has_active_promotion");
    const helper = migration.indexOf(
      "CREATE OR REPLACE FUNCTION pg_temp.apply_os_auction_duplicate_batch",
    );
    expect(ownerGuard).toBeGreaterThan(0);
    expect(promotionGuard).toBeGreaterThan(ownerGuard);
    expect(helper).toBeGreaterThan(promotionGuard);
    expect(migration).toContain("allocation.ends_at > statement_timestamp()");
    expect(migration).toContain("allocation.revoked_at IS NULL");
  });

  it("runs exactly 64 separate verified batches without suppressing triggers", () => {
    const invocations = [
      ...migration.matchAll(/^SELECT pg_temp\.apply_os_auction_duplicate_batch\((\d+)\);$/gm),
    ].map((match) => Number(match[1]));
    expect(invocations).toEqual(Array.from({ length: 64 }, (_, index) => index));
    expect(migration).toContain("plan.batch_no = p_batch_no");
    expect(migration).toContain("os_auction_duplicate_snapshot_rowcount_mismatch");
    expect(migration).toContain("os_auction_duplicate_snapshot_incomplete");
    expect(migration).toContain("os_auction_duplicate_update_rowcount_mismatch");
    expect(migration).toContain("os_auction_duplicate_batch_post_state_mismatch");
    expect(migration).not.toMatch(/session_replication_role/i);
    expect(migration).not.toMatch(/\bDELETE\s+FROM\b/i);
  });

  it("updates only planned rows to exact expected status and tags", () => {
    expect(migration).toContain("expected_status public.listing_status NOT NULL");
    expect(migration).toContain("expected_tags text[] NOT NULL");
    expect(migration).toContain("status = plan.expected_status");
    expect(migration).toContain("tags = plan.expected_tags");
    expect(migration).toContain("listing.id = plan.duplicate_listing_id");
    expect(migration).toContain("listing.status IS DISTINCT FROM plan.expected_status");
    expect(migration).toContain("listing.tags IS DISTINCT FROM plan.expected_tags");
  });
});
