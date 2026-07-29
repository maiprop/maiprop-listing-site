import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726201049_public_auction_candidate_boundary.sql",
  ),
  "utf8",
);
const indexMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726202759_public_auction_candidate_indexes.sql",
  ),
  "utf8",
);
const hardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726204345_harden_public_auction_boundary_and_index.sql",
  ),
  "utf8",
);
const mutationHardeningMigration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260726211816_harden_listing_tenant_and_auction_provenance.sql",
  ),
  "utf8",
);
const compactHardeningMigration = hardeningMigration
  .replace(/\s+/g, " ")
  .replace(/\(\s+/g, "(")
  .replace(/\s+\)/g, ")");

describe("public auction candidate boundary migration", () => {
  it("keeps auction predicates and limits inside a narrow database function", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_public_auction_candidates(",
    );
    expect(migration).toContain("SECURITY DEFINER");
    expect(migration).toContain("SET search_path = ''");
    expect(migration).toContain("LEAST(GREATEST(COALESCE(p_limit, 1), 1), 600)");
    expect(migration).toContain("listing.status = 'active'::public.listing_status");
    expect(migration).toContain("listing.listing_type = 'auction'::public.listing_type");
    expect(migration).toContain("COALESCE(listing.is_off_market, FALSE) = FALSE");
    expect(migration).toContain("listing.tags @> ARRAY['source:maiprop-os']::TEXT[]");
    expect(migration).toContain("listing.auction_date >= p_today::TIMESTAMPTZ");
    expect(migration).toContain("p_stream = 'priority'");
    expect(migration).toContain("p_stream = 'organic'");
  });

  it("returns only card-safe fields and bounded image data", () => {
    expect(migration).toContain("RETURNS TABLE (");
    expect(migration).toContain("listing_images JSONB");
    expect(migration).toContain("LIMIT 3");
    expect(migration).not.toContain("listing_images_detail");
    expect(migration).not.toContain("project_detail");
    expect(migration).not.toContain("owner_id");
    expect(migration).not.toContain("organization_id");
  });

  it("keeps the broad candidate hydration RPC backend-only after staging hardening", () => {
    expect(compactHardeningMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT)",
    );
    expect(compactHardeningMigration).toContain("FROM PUBLIC, anon, authenticated");
    expect(compactHardeningMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT)",
    );
    expect(compactHardeningMigration).toContain("TO service_role");
    expect(compactHardeningMigration).not.toContain("TO anon, authenticated");
  });

  it("rejects browser-writable tags that can forge OS auction provenance", () => {
    expect(mutationHardeningMigration).toContain(
      "listing_reserved_tags_not_writable",
    );
    expect(mutationHardeningMigration).toContain("source:maiprop-os");
    expect(mutationHardeningMigration).toContain("os_auction:");
    expect(mutationHardeningMigration).toContain("auction_pool:");
    expect(mutationHardeningMigration).toMatch(
      /jsonb_array_elements_text\(p_payload->'tags'\)/,
    );
  });
});

describe("public auction candidate indexes", () => {
  it("replaces the broad staging index with one versioned ordered organic candidate index", () => {
    expect(hardeningMigration).toContain(
      "DROP INDEX IF EXISTS public.idx_listings_public_auction_candidates",
    );
    expect(hardeningMigration).toContain(
      "CREATE INDEX IF NOT EXISTS idx_listings_public_auction_order_v1",
    );
    expect(hardeningMigration).toContain(
      "(auction_date ASC NULLS LAST, id ASC)",
    );
    expect(hardeningMigration).not.toContain("INCLUDE (priority_placement, priority_until)");
    expect(hardeningMigration).toContain(
      "status = 'active'::public.listing_status",
    );
    expect(hardeningMigration).toContain(
      "listing_type = 'auction'::public.listing_type",
    );
    expect(hardeningMigration).toContain(
      "COALESCE(is_off_market, FALSE) = FALSE",
    );
    expect(hardeningMigration).toContain(
      "tags @> ARRAY['source:maiprop-os']::TEXT[]",
    );
    expect(hardeningMigration).toContain("SET lock_timeout = '3s'");
  });

  it("removes the unjustified priority candidate index and verifies the replacement definition", () => {
    expect(hardeningMigration).toContain(
      "DROP INDEX IF EXISTS public.idx_listings_public_priority_auction_candidates",
    );
    expect(hardeningMigration).not.toContain(
      "CREATE INDEX IF NOT EXISTS idx_listings_public_priority_auction_candidates",
    );
    expect(hardeningMigration).toContain("pg_get_indexdef");
    expect(hardeningMigration).toContain("indisvalid");
    expect(hardeningMigration).toContain("indisready");
  });

  it("records why the superseded staging indexes are removed", () => {
    expect(indexMigration).toContain("idx_listings_public_auction_candidates");
    expect(indexMigration).toContain("idx_listings_public_priority_auction_candidates");
    expect(hardeningMigration).toContain("Priority auctions are already covered");
  });
});
