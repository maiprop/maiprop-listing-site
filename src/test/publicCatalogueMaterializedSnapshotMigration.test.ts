import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728123058_materialize_public_catalogue_snapshots.sql",
  ),
  "utf8",
);
const scaleProof = readFileSync(
  resolve(process.cwd(), "supabase/tests/public_catalogue_20k_scale_test.sql"),
  "utf8",
);
const snapshotPgTap = readFileSync(
  resolve(process.cwd(), "supabase/tests/public_catalogue_snapshot_test.sql"),
  "utf8",
);
const exactLookupMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql",
  ),
  "utf8",
);
const osAuctionIdentityMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260728120000_canonicalize_os_auction_identity.sql",
  ),
  "utf8",
);
const generatedTypes = readFileSync(
  resolve(
    process.cwd(),
    "src/integrations/supabase/types.ts",
  ),
  "utf8",
);
const publicApiTypes = readFileSync(
  resolve(process.cwd(), "functions/api/public/_cache.ts"),
  "utf8",
);

describe("materialized public catalogue snapshot migration", () => {
  it("publishes immutable temporal card versions with bounded retention", () => {
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS private.public_catalogue_publications",
    );
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS private.public_catalogue_current",
    );
    expect(migration).toContain(
      "CREATE TABLE IF NOT EXISTS private.public_catalogue_versions",
    );
    expect(migration).toContain("content_hash bytea NOT NULL");
    expect(migration).toContain("os_tag text");
    expect(migration).toContain("card_payload jsonb NOT NULL");
    expect(migration).toContain("detail_payload jsonb NOT NULL");
    expect(migration).toContain(
      "priority_rank integer NOT NULL DEFAULT 0 CHECK (priority_rank IN (0, 1))",
    );
    expect(migration).toContain("valid_from_publication bigint NOT NULL");
    expect(migration).toContain("valid_to_publication bigint");
    expect(migration).toContain("interval '40 minutes'");
    expect(migration).toContain("LIMIT 46");
    expect(migration).toContain("pg_advisory_xact_lock");
    expect(migration).toContain("private.guard_public_catalogue_version_update");
    expect(migration).toContain("public_catalogue_version_immutable");
    expect(migration).toContain("WHERE valid_to_publication IS NULL");
    expect(migration).toContain("CREATE TEMP TABLE public_catalogue_stage");
    expect(migration).toContain("content_hash IS DISTINCT FROM");
    expect(migration).not.toContain(
      "CREATE TABLE IF NOT EXISTS private.public_catalogue_snapshot_rows",
    );
    expect(migration).not.toContain(
      "CREATE TABLE IF NOT EXISTS private.public_catalogue_snapshot_batches",
    );
    expect(migration).not.toContain(
      "CREATE OR REPLACE FUNCTION public.ensure_public_listing_catalogue_snapshot",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.publish_public_catalogue()",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.query_public_catalogue",
    );
    expect(migration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_catalogue_listing",
    );
    expect(migration).toContain(
      "stage.listing_type IN ('sale', 'new_build')",
    );
    expect(migration).toContain("public_catalogue_duplicate_os_tag");
    expect(migration).toContain("stage.os_tag");
    expect(migration).toContain("version.os_tag = p_os_tag");
    expect(migration).toContain(
      "TO anon, authenticated",
    );
  });

  it("defines typed rank, search, feature, and open-house indexes", () => {
    expect(migration).toContain(
      "idx_public_catalogue_versions_newest",
    );
    expect(migration).toContain(
      "idx_public_catalogue_versions_price_asc",
    );
    expect(migration).toContain(
      "idx_public_catalogue_versions_price_desc",
    );
    expect(migration).toContain(
      "idx_public_catalogue_versions_ai_score",
    );
    expect(migration).toContain(
      "idx_public_catalogue_versions_views",
    );
    expect(migration).toContain(
      "idx_public_catalogue_versions_open_house",
    );
    expect(migration).toContain(
      "idx_public_catalogue_versions_os_tag_publication",
    );
    expect(migration).toContain(
      "idx_public_catalogue_versions_current_os_tag",
    );
    expect(migration).toContain("extensions.gin_trgm_ops");
    expect(migration).toContain("USING gin (features)");
    expect(migration).toContain("INCLUDE (valid_from_publication, valid_to_publication)");
  });

  it("proves 20k materialization, delta publication, and exact readers from source rows", () => {
    expect(scaleProof).toContain("INSERT INTO public.listings");
    expect(scaleProof).not.toContain(
      "INSERT INTO private.public_catalogue_versions",
    );
    expect(scaleProof).toContain("public.publish_public_catalogue()");
    expect(scaleProof).toContain("public.query_public_catalogue");
    expect(scaleProof).toContain("public.get_public_catalogue_listing");
    expect(scaleProof).toContain("public.get_public_catalogue_auctions");
    expect(scaleProof).toContain(
      "the delta publication stores one new version instead of copying twenty thousand rows",
    );
  });

  it("adds an indexed publication-pinned auction reader with explicit ACLs", () => {
    expect(exactLookupMigration).toContain(
      "idx_public_catalogue_versions_auction_listing_publication",
    );
    expect(exactLookupMigration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_public_catalogue_auctions",
    );
    expect(exactLookupMigration).toContain("public_catalogue_duplicate_os_tag");
    expect(exactLookupMigration).toContain("SECURITY DEFINER");
    expect(exactLookupMigration).toContain("SET search_path = ''");
    expect(exactLookupMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_public_catalogue_auctions",
    );
    expect(exactLookupMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_catalogue_auctions",
    );
    expect(exactLookupMigration).toContain("TO anon, authenticated");
    expect(exactLookupMigration).toContain("retain_until timestamptz");
  });

  it("keeps the immutable catalogue uniqueness and fail-closed lookup contract", () => {
    expect(migration).toContain("public_catalogue_duplicate_os_tag");
    expect(migration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_public_catalogue_versions_current_os_tag",
    );
  });

  it("expects the listings identity index to reject duplicate OS auctions before publication", () => {
    expect(snapshotPgTap).toContain("SELECT plan(132)");
    expect(snapshotPgTap).toContain(
      'duplicate key value violates unique constraint "idx_listings_os_auction_id_unique"',
    );
    expect(snapshotPgTap).toContain(
      "database rejects duplicate OS auction identity before publication",
    );
    expect(snapshotPgTap).not.toContain(
      "the publisher rejects duplicate OS tags within one publication",
    );
  });

  it("keeps nullable catalogue fields explicit at the public API boundary", () => {
    const queryTypes = generatedTypes.match(
      /query_public_catalogue:\s*\{[\s\S]*?read_email_batch:/,
    )?.[0] ?? "";

    expect(queryTypes).toContain("ai_score: number");
    expect(queryTypes).toContain("open_house_date: string");
    expect(publicApiTypes).toContain("ai_score: number | null");
    expect(publicApiTypes).toContain("open_house_date: string | null");
  });

  it("quarantines corrupt duplicates recoverably and enforces one OS identity", () => {
    expect(osAuctionIdentityMigration).toContain(
      "CREATE TABLE IF NOT EXISTS private.os_auction_duplicate_quarantine",
    );
    expect(osAuctionIdentityMigration).toContain("canonical_listing_id uuid NOT NULL");
    expect(osAuctionIdentityMigration).toContain("previous_status public.listing_status NOT NULL");
    expect(osAuctionIdentityMigration).toContain("previous_tags text[] NOT NULL");
    expect(osAuctionIdentityMigration).toContain("listing.updated_at DESC");
    expect(osAuctionIdentityMigration).toContain("listing.created_at DESC");
    expect(osAuctionIdentityMigration).toContain("listing.id DESC");
    expect(osAuctionIdentityMigration).toContain("listing.owner_id IS NOT NULL");
    expect(osAuctionIdentityMigration).toContain("os_auction_duplicate_has_owner");
    expect(osAuctionIdentityMigration).toContain("os_auction_identity_has_owner");
    expect(osAuctionIdentityMigration).toContain("listing_promotion_allocations");
    expect(osAuctionIdentityMigration).toContain("os_auction_duplicate_has_active_promotion");
    expect(osAuctionIdentityMigration).toContain(
      "left(tag.value, length('os_auction:')) = 'os_auction:'",
    );
    expect(osAuctionIdentityMigration).not.toContain("LIKE 'os_auction:%'");
    expect(osAuctionIdentityMigration).toContain(
      "allocation.ends_at > statement_timestamp()",
    );
    expect(osAuctionIdentityMigration).not.toContain(
      "allocation.starts_at <= statement_timestamp()",
    );
    expect(osAuctionIdentityMigration).toContain("THEN 'paused'::public.listing_status");
    expect(osAuctionIdentityMigration).toContain("os_auction_duplicate:");
    expect(osAuctionIdentityMigration).toContain("source:maiprop-os-duplicate-quarantine");
    expect(osAuctionIdentityMigration).toContain("ADD COLUMN os_auction_id text");
    expect(osAuctionIdentityMigration).toContain("GENERATED ALWAYS AS");
    expect(osAuctionIdentityMigration).toContain(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_listings_os_auction_id_unique",
    );
    expect(osAuctionIdentityMigration).not.toMatch(/DELETE\s+FROM\s+public\.listings/i);
    expect(osAuctionIdentityMigration).toContain(
      "REVOKE ALL ON TABLE private.os_auction_duplicate_quarantine",
    );
  });

  it("locks listing and promotion writers with a bounded wait before planning identity repair", () => {
    const timeout = osAuctionIdentityMigration.indexOf("SET LOCAL lock_timeout = '5s'");
    const listingLock = osAuctionIdentityMigration.indexOf(
      "LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE",
    );
    const promotionLock = osAuctionIdentityMigration.indexOf(
      "LOCK TABLE public.listing_promotion_allocations IN SHARE MODE",
    );
    const plan = osAuctionIdentityMigration.indexOf(
      "CREATE TEMP TABLE os_auction_duplicate_plan",
    );
    const promotionGuard = osAuctionIdentityMigration.indexOf(
      "os_auction_duplicate_has_active_promotion",
    );

    expect(timeout).toBeGreaterThanOrEqual(0);
    expect(listingLock).toBeGreaterThan(timeout);
    expect(promotionLock).toBeGreaterThan(listingLock);
    expect(plan).toBeGreaterThan(promotionLock);
    expect(promotionGuard).toBeGreaterThan(plan);
  });

  it("runs the lock-based OS identity repair in one explicit transaction", () => {
    const transactionStart = osAuctionIdentityMigration.indexOf("BEGIN;");
    const lock = osAuctionIdentityMigration.indexOf(
      "LOCK TABLE public.listings IN ACCESS EXCLUSIVE MODE",
    );
    const transactionEnd = osAuctionIdentityMigration.lastIndexOf("COMMIT;");

    expect(transactionStart).toBeGreaterThanOrEqual(0);
    expect(lock).toBeGreaterThan(transactionStart);
    expect(transactionEnd).toBeGreaterThan(lock);
  });

  it("gives only the unavoidable stored-column rewrite a bounded extended timeout", () => {
    const duplicateUpdate = osAuctionIdentityMigration.indexOf(
      "UPDATE public.listings AS listing",
    );
    const rewriteTimeout = osAuctionIdentityMigration.indexOf(
      "SET LOCAL statement_timeout = '6min'",
    );
    const generatedColumn = osAuctionIdentityMigration.indexOf(
      "ADD COLUMN os_auction_id text",
    );
    const rewriteTimeoutReset = osAuctionIdentityMigration.indexOf(
      "SET LOCAL statement_timeout = DEFAULT",
    );
    const sourceConstraint = osAuctionIdentityMigration.indexOf(
      "ADD CONSTRAINT listings_os_auction_source_identity_valid",
    );

    expect(duplicateUpdate).toBeGreaterThanOrEqual(0);
    expect(rewriteTimeout).toBeGreaterThan(duplicateUpdate);
    expect(generatedColumn).toBeGreaterThan(rewriteTimeout);
    expect(rewriteTimeoutReset).toBeGreaterThan(generatedColumn);
    expect(sourceConstraint).toBeGreaterThan(rewriteTimeoutReset);
    expect(
      osAuctionIdentityMigration.match(/SET LOCAL statement_timeout = '6min'/g),
    ).toHaveLength(1);
    expect(
      osAuctionIdentityMigration.match(/SET LOCAL statement_timeout = DEFAULT/g),
    ).toHaveLength(1);
    expect(osAuctionIdentityMigration).not.toContain("statement_timeout = '0'");
  });

  it("rejects an owner-linked OS identity even without an OS source marker", () => {
    const ownerGuard = osAuctionIdentityMigration.match(
      /IF EXISTS \(\s*SELECT 1\s*FROM public\.listings AS listing\s*WHERE listing\.listing_type = 'auction'::public\.listing_type[\s\S]*?RAISE EXCEPTION 'os_auction_identity_has_owner'[\s\S]*?END IF;/,
    )?.[0] ?? "";

    expect(ownerGuard).toContain("listing.listing_type = 'auction'::public.listing_type");
    expect(ownerGuard).toContain("private.extract_os_auction_id(listing.tags) IS NOT NULL");
    expect(ownerGuard).toContain("listing.owner_id IS NOT NULL");
    expect(ownerGuard).not.toContain("source:maiprop-os");
  });
});
