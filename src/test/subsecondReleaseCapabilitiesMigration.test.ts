import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const migration = readFileSync(
  resolve(
    process.cwd(),
    "supabase/migrations/20260901120000_repair_subsecond_release_capabilities.sql",
  ),
  "utf8",
);

const envelopeMigrationPath = resolve(
  process.cwd(),
  "supabase/migrations/20260901130000_add_visible_auction_candidate_envelopes.sql",
);
const envelopeMigration = existsSync(envelopeMigrationPath)
  ? readFileSync(envelopeMigrationPath, "utf8")
  : "";
const compactEnvelopeMigration = envelopeMigration
  .replace(/\s+/g, " ")
  .replace(/\(\s+/g, "(")
  .replace(/\s+\)/g, ")");

const visibleAuctionEnvelope =
  envelopeMigration.match(
    /CREATE OR REPLACE FUNCTION public\.get_visible_auction_candidate_envelope\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";

const compactMigration = migration
  .replace(/\s+/g, " ")
  .replace(/\(\s+/g, "(")
  .replace(/\s+\)/g, ")");

const visibleAuctionSignature =
  "INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, " +
  "NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT";

const visibleAuctionWrapper =
  migration.match(
    /CREATE OR REPLACE FUNCTION public\.get_visible_auction_candidates\([\s\S]*?\$function\$;/,
  )?.[0] ?? "";

const currentUserAuctionLimit =
  migration.match(
    /CREATE OR REPLACE FUNCTION public\.get_current_auction_listing_visible_limit\(\)[\s\S]*?\$function\$;/,
  )?.[0] ?? "";

const preflightAssertions =
  migration.match(/DO \$\$\nBEGIN[\s\S]*?END\n\$\$;/)?.[0] ?? "";

const postCreateAssertions =
  migration.match(/DO \$\$\nDECLARE\n {2}signature TEXT;[\s\S]*?END\n\$\$;/)?.[0] ?? "";

describe("subsecond release capability repair migration", () => {
  it("exposes only an auth.uid-derived current-user entitlement RPC to authenticated callers", () => {
    expect(currentUserAuctionLimit).toContain(
      "CREATE OR REPLACE FUNCTION public.get_current_auction_listing_visible_limit()",
    );
    expect(currentUserAuctionLimit).toContain("auth.uid()");
    expect(currentUserAuctionLimit).not.toContain("p_user_id");
    expect(currentUserAuctionLimit).toContain(
      "public.get_auction_listing_visible_limit(v_user_id)",
    );
    expect(compactMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_current_auction_listing_visible_limit() FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(compactMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_current_auction_listing_visible_limit() TO authenticated",
    );
    expect(compactMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_auction_listing_visible_limit(UUID) FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(compactMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_auction_listing_visible_limit(UUID) TO service_role",
    );
  });

  it("adds a bounded public wrapper over the service-role-only auction RPC", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_visible_auction_candidates(",
    );
    expect(visibleAuctionWrapper).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''/,
    );
    expect(visibleAuctionWrapper).not.toContain("v_user_id UUID");
    expect(visibleAuctionWrapper).toContain("v_visible_limit INTEGER := 60");
    expect(visibleAuctionWrapper).toMatch(/LEAST\(\s+600,/);
    expect(visibleAuctionWrapper).toContain(
      "public.get_current_auction_listing_visible_limit()",
    );
    expect(visibleAuctionWrapper).not.toContain(
      "public.get_auction_listing_visible_limit(v_user_id)",
    );
    expect(visibleAuctionWrapper).toContain(
      "LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600)",
    );
    expect(visibleAuctionWrapper).toContain(
      "FROM public.get_public_auction_candidates(",
    );
    expect(visibleAuctionWrapper).not.toContain("FROM public.listings");
    expect(compactMigration).toContain(
      `REVOKE ALL ON FUNCTION public.get_visible_auction_candidates(${visibleAuctionSignature}) FROM PUBLIC`,
    );
    expect(compactMigration).toContain(
      `GRANT EXECUTE ON FUNCTION public.get_visible_auction_candidates(${visibleAuctionSignature}) TO anon, authenticated`,
    );
    expect(compactMigration).not.toContain(
      "GRANT EXECUTE ON FUNCTION public.get_visible_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) TO anon, authenticated",
    );
    expect(compactMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated",
    );
    expect(compactMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) TO service_role",
    );
  });

  it("filters the bounded 600-row database pool before applying the caller's 60/600 cap", () => {
    for (const parameter of [
      "p_city TEXT DEFAULT NULL",
      "p_property_base TEXT DEFAULT NULL",
      "p_property_subtype TEXT DEFAULT NULL",
      "p_bid_min NUMERIC DEFAULT NULL",
      "p_bid_max NUMERIC DEFAULT NULL",
      "p_year_min INTEGER DEFAULT NULL",
      "p_year_max INTEGER DEFAULT NULL",
      "p_sqm_min NUMERIC DEFAULT NULL",
      "p_sqm_max NUMERIC DEFAULT NULL",
      "p_ownership TEXT DEFAULT NULL",
      "p_round TEXT DEFAULT NULL",
      "p_yield TEXT DEFAULT NULL",
    ]) {
      expect(visibleAuctionWrapper).toContain(parameter);
    }

    expect(visibleAuctionWrapper).toMatch(
      /FROM public\.get_public_auction_candidates\(\s*600,/,
    );
    expect(visibleAuctionWrapper).toContain(
      "STRPOS(LOWER(COALESCE(candidate.city, '')), LOWER(p_city)) > 0",
    );
    expect(visibleAuctionWrapper).toContain(
      "candidate.property_type = p_property_base",
    );
    expect(visibleAuctionWrapper).toContain("land_type:");
    expect(visibleAuctionWrapper).toContain("commercial_type:");
    expect(visibleAuctionWrapper).toContain(
      "COALESCE(candidate.auction_starting_bid, candidate.price, 0)",
    );
    expect(visibleAuctionWrapper).toContain("candidate.year_built IS NOT NULL");
    expect(visibleAuctionWrapper).toContain("COALESCE(candidate.sqm, 0)");

    for (const ownershipAlias of [
      "full_ownership",
      "bare_ownership",
      "undivided",
      "epikarpia",
      "vertical_ownership",
      "horizontal_ownership",
      "ownership_pct:",
    ]) {
      expect(visibleAuctionWrapper).toContain(ownershipAlias);
    }
    expect(visibleAuctionWrapper).toContain("p_round = '3plus'");
    expect(visibleAuctionWrapper).toContain("auction_round >= 3");
    expect(visibleAuctionWrapper).toContain("p_yield = 'low'");
    expect(visibleAuctionWrapper).toContain("p_yield = 'medium'");
    expect(visibleAuctionWrapper).toContain("p_yield = 'high'");
    expect(visibleAuctionWrapper).toContain("p_yield = 'very_high'");
    expect(visibleAuctionWrapper).toContain("estimated_yield >= 9");

    const poolIndex = visibleAuctionWrapper.indexOf(
      "FROM public.get_public_auction_candidates(",
    );
    const filterIndex = visibleAuctionWrapper.indexOf("WHERE");
    const callerCapIndex = visibleAuctionWrapper.lastIndexOf(
      "LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600)",
    );
    expect(poolIndex).toBeGreaterThanOrEqual(0);
    expect(filterIndex).toBeGreaterThan(poolIndex);
    expect(callerCapIndex).toBeGreaterThan(filterIndex);
  });

  it("restores management and professional projections with their original grants", () => {
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_manageable_listing_catalogue_page(",
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_manageable_listing_summary()",
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_manageable_listing_catalogue_page\([\s\S]*?\) TO authenticated/,
    );
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_manageable_listing_summary\(\)\s+TO authenticated/,
    );
    expect(migration).toContain(
      "CREATE OR REPLACE FUNCTION public.get_public_professionals()",
    );
    expect(migration).toContain("CREATE OR REPLACE VIEW public.public_professionals");
    expect(migration).toContain("security_barrier = true, security_invoker = true");
    expect(migration).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.get_public_professionals\(\)\s+TO anon, authenticated, service_role/,
    );
    expect(migration).toMatch(
      /GRANT SELECT ON TABLE public\.public_professionals\s+TO anon, authenticated, service_role/,
    );
  });

  it("fails closed on runtime dependencies before creation and validates capabilities before reloading PostgREST", () => {
    expect(preflightAssertions).toContain("to_regclass('public.listing_management_catalogue')");
    expect(preflightAssertions).toContain("to_regclass('public.listings')");
    expect(preflightAssertions).toContain("to_regclass('public.professionals')");
    expect(preflightAssertions).toContain("to_regprocedure('auth.uid()')");
    expect(preflightAssertions).toContain(
      "public.get_auction_listing_visible_limit(uuid)",
    );
    expect(preflightAssertions).toContain(
      "private.has_org_permission(uuid,text,uuid)",
    );
    expect(preflightAssertions).toContain(
      "public.get_public_auction_candidates(integer,text,date,timestamp with time zone,text)",
    );
    expect(migration.indexOf(preflightAssertions)).toBeGreaterThanOrEqual(0);
    expect(migration.indexOf(preflightAssertions)).toBeLessThan(
      migration.indexOf("CREATE OR REPLACE FUNCTION"),
    );
    expect(postCreateAssertions).toContain("FOREACH signature IN ARRAY ARRAY[");
    expect(postCreateAssertions).toContain(
      "public.get_visible_auction_candidates(integer,text,date,timestamp with time zone,text,text,text,text,numeric,numeric,integer,integer,numeric,numeric,text,text,text)",
    );
    expect(postCreateAssertions).toContain(
      "public.get_current_auction_listing_visible_limit()",
    );
    expect(postCreateAssertions).toContain(
      "public.get_manageable_listing_catalogue_page(integer,timestamp with time zone,uuid)",
    );
    expect(postCreateAssertions).toContain("public.get_manageable_listing_summary()");
    expect(postCreateAssertions).toContain("public.get_public_professionals()");
    expect(postCreateAssertions).toContain("to_regprocedure(signature)");
    expect(postCreateAssertions).toContain("to_regclass('public.public_professionals')");
    expect(migration.indexOf(postCreateAssertions)).toBeGreaterThan(
      migration.indexOf("CREATE OR REPLACE VIEW public.public_professionals"),
    );
    expect(migration.indexOf("NOTIFY pgrst, 'reload schema';")).toBeGreaterThan(
      migration.indexOf(postCreateAssertions),
    );
    expect(migration).toMatch(/NOTIFY pgrst, 'reload schema';\s*$/);
    expect(migration.toLowerCase()).not.toContain("supabase_service_role_key");
    expect(migration.toLowerCase()).not.toContain("service-role secret");
  });
});

describe("visible auction candidate envelope migration", () => {
  const envelopeSignature =
    "INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, " +
    "NUMERIC, NUMERIC, INTEGER, INTEGER, NUMERIC, NUMERIC, TEXT, TEXT, TEXT";

  it("returns one bounded stream envelope with pre-filter pool existence and full metadata", () => {
    expect(visibleAuctionEnvelope).toContain(
      "CREATE OR REPLACE FUNCTION public.get_visible_auction_candidate_envelope(",
    );
    expect(visibleAuctionEnvelope).toMatch(
      /RETURNS TABLE \(\s*pool_exists BOOLEAN,\s*total_raw BIGINT,\s*facet_cities TEXT\[\],\s*facet_rounds INTEGER\[\],\s*visible_rows JSONB\s*\)/,
    );
    expect(visibleAuctionEnvelope).toMatch(
      /LANGUAGE plpgsql\s+STABLE\s+SECURITY DEFINER\s+SET search_path = ''/,
    );
    expect(visibleAuctionEnvelope).toMatch(
      /bounded_candidates AS MATERIALIZED \([\s\S]*?FROM public\.get_public_auction_candidates\(\s*600,/,
    );
    expect(visibleAuctionEnvelope.match(/get_public_auction_candidates\(/g)).toHaveLength(1);

    for (const parameter of [
      "p_city TEXT DEFAULT NULL",
      "p_property_base TEXT DEFAULT NULL",
      "p_property_subtype TEXT DEFAULT NULL",
      "p_bid_min NUMERIC DEFAULT NULL",
      "p_bid_max NUMERIC DEFAULT NULL",
      "p_year_min INTEGER DEFAULT NULL",
      "p_year_max INTEGER DEFAULT NULL",
      "p_sqm_min NUMERIC DEFAULT NULL",
      "p_sqm_max NUMERIC DEFAULT NULL",
      "p_ownership TEXT DEFAULT NULL",
      "p_round TEXT DEFAULT NULL",
      "p_yield TEXT DEFAULT NULL",
    ]) {
      expect(visibleAuctionEnvelope).toContain(parameter);
    }
    for (const filterFragment of [
      "STRPOS(LOWER(COALESCE(candidate.city, '')), LOWER(p_city)) > 0",
      "candidate.property_type = p_property_base",
      "land_type:",
      "commercial_type:",
      "COALESCE(candidate.auction_starting_bid, candidate.price, 0)",
      "candidate.year_built IS NOT NULL",
      "COALESCE(candidate.sqm, 0)",
      "p_ownership = 'full'",
      "p_ownership = 'bare'",
      "p_ownership = 'common'",
      "p_round = '3plus'",
      "auction_round >= 3",
      "~ '^[1-9][0-9]{0,8}$'",
      "p_yield = 'low'",
      "p_yield = 'medium'",
      "p_yield = 'high'",
      "p_yield = 'very_high'",
      "estimated_yield >= 9",
    ]) {
      expect(visibleAuctionEnvelope).toContain(filterFragment);
    }
    expect(visibleAuctionEnvelope).toContain(
      "TRANSLATE(\n          LOWER(BTRIM(COALESCE(candidate.city, ''))),\n          'άέήίόύώϊΐϋΰ',\n          'αεηιουωιιυυ'",
    );

    const boundedPoolIndex = visibleAuctionEnvelope.indexOf("bounded_candidates AS MATERIALIZED");
    const filteredPoolIndex = visibleAuctionEnvelope.indexOf("filtered_candidates AS MATERIALIZED");
    const poolExistsIndex = visibleAuctionEnvelope.indexOf("EXISTS (SELECT 1 FROM bounded_candidates)");
    const totalRawIndex = visibleAuctionEnvelope.indexOf("COUNT(*) FROM filtered_candidates");
    const cityFacetsIndex = visibleAuctionEnvelope.indexOf("FROM bounded_candidates AS city_candidate");
    const roundFacetsIndex = visibleAuctionEnvelope.indexOf("FROM bounded_candidates AS round_candidate");
    const visibleCapIndex = visibleAuctionEnvelope.indexOf(
      "LIMIT LEAST(GREATEST(COALESCE(p_limit, 1), 1), v_visible_limit, 600)",
    );
    expect(boundedPoolIndex).toBeGreaterThanOrEqual(0);
    expect(filteredPoolIndex).toBeGreaterThan(boundedPoolIndex);
    expect(poolExistsIndex).toBeGreaterThan(filteredPoolIndex);
    expect(totalRawIndex).toBeGreaterThan(filteredPoolIndex);
    expect(cityFacetsIndex).toBeGreaterThan(filteredPoolIndex);
    expect(roundFacetsIndex).toBeGreaterThan(filteredPoolIndex);
    expect(visibleCapIndex).toBeGreaterThan(filteredPoolIndex);
  });

  it("exposes only the envelope while preserving the underlying RPC as service-role-only", () => {
    expect(compactEnvelopeMigration).toContain(
      `REVOKE ALL ON FUNCTION public.get_visible_auction_candidate_envelope(${envelopeSignature}) FROM PUBLIC, anon, authenticated, service_role`,
    );
    expect(compactEnvelopeMigration).toContain(
      `GRANT EXECUTE ON FUNCTION public.get_visible_auction_candidate_envelope(${envelopeSignature}) TO anon, authenticated`,
    );
    expect(compactEnvelopeMigration).toContain(
      "REVOKE ALL ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) FROM PUBLIC, anon, authenticated, service_role",
    );
    expect(compactEnvelopeMigration).toContain(
      "GRANT EXECUTE ON FUNCTION public.get_public_auction_candidates(INTEGER, TEXT, DATE, TIMESTAMPTZ, TEXT) TO service_role",
    );
    expect(compactEnvelopeMigration).toMatch(/NOTIFY pgrst, 'reload schema';\s*$/);
    expect(envelopeMigration.toLowerCase()).not.toContain("service_role_key");
  });
});
