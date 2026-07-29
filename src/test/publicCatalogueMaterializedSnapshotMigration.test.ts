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
const exactLookupMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql",
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

  it("keeps nullable catalogue fields nullable in the generated RPC contract", () => {
    const queryTypes = generatedTypes.match(
      /query_public_catalogue:\s*\{[\s\S]*?read_email_batch:/,
    )?.[0] ?? "";

    expect(queryTypes).toContain("ai_score: number | null");
    expect(queryTypes).toContain("open_house_date: string | null");
  });
});
