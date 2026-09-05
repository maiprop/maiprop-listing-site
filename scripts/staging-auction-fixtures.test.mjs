import { describe, expect, it } from "vitest";
import {
  buildStagingAuctionFixtureSql,
  validateStagingAuctionFixtureConfig,
} from "./staging-auction-fixtures.mjs";

const STAGING_REF = "xsiehskfgeoqyazcgauv";
const stagingUrl = `postgresql://postgres.${STAGING_REF}:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`;
const TEST_RUN = {
  runId: "33931847936",
  runAttempt: "1",
  job: "n_minus_one_compatibility",
};

const validEnv = (overrides = {}) => ({
  STAGING_SUPABASE_PROJECT_ID: STAGING_REF,
  STAGING_MUTATION_ACKNOWLEDGEMENT: `MUTATE_STAGING_${STAGING_REF}`,
  SUPABASE_STAGING_DB_URL: stagingUrl,
  GITHUB_RUN_ID: "33931847936",
  GITHUB_RUN_ATTEMPT: "1",
  GITHUB_JOB: "n_minus_one_compatibility",
  ...overrides,
});

describe("staging auction fixture target guard", () => {
  it("accepts only the isolated staging database with the exact mutation acknowledgement", () => {
    expect(
      validateStagingAuctionFixtureConfig({ env: validEnv(), action: "seed" })
        .ok,
    ).toBe(true);
    expect(
      validateStagingAuctionFixtureConfig({
        env: validEnv({
          SUPABASE_STAGING_DB_URL: stagingUrl.replace("?sslmode=require", ""),
        }),
        action: "seed",
      }),
    ).toMatchObject({ ok: true, databaseUrl: stagingUrl });
    for (const env of [
      validEnv({ STAGING_SUPABASE_PROJECT_ID: "qvvicunqcrwpioqnvzxf" }),
      validEnv({
        SUPABASE_STAGING_DB_URL:
          "postgresql://postgres.qvvicunqcrwpioqnvzxf:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require",
      }),
      validEnv({ STAGING_MUTATION_ACKNOWLEDGEMENT: "yes" }),
    ]) {
      expect(
        validateStagingAuctionFixtureConfig({ env, action: "seed" }).ok,
      ).toBe(false);
    }
  });

  it("prefers the separately resolved IPv4 endpoint while applying the same exact guard", () => {
    const resolvedUrl = stagingUrl.replace("aws-0-", "aws-1-");
    expect(
      validateStagingAuctionFixtureConfig({
        env: validEnv({
          SUPABASE_STAGING_EFFECTIVE_DB_URL: resolvedUrl,
        }),
        action: "seed",
      }),
    ).toMatchObject({ ok: true, databaseUrl: resolvedUrl });

    expect(
      validateStagingAuctionFixtureConfig({
        env: validEnv({
          SUPABASE_STAGING_EFFECTIVE_DB_URL: resolvedUrl.replace(
            STAGING_REF,
            "qvvicunqcrwpioqnvzxf",
          ),
        }),
        action: "seed",
      }).ok,
    ).toBe(false);
  });

  it("requires a GitHub run identity so concurrent fixture lifecycles cannot share rows", () => {
    expect(
      validateStagingAuctionFixtureConfig({
        env: validEnv({ GITHUB_RUN_ID: "" }),
        action: "seed",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateStagingAuctionFixtureConfig({
        env: validEnv({ GITHUB_RUN_ATTEMPT: "" }),
        action: "cleanup",
      }),
    ).toMatchObject({ ok: false });
    expect(
      validateStagingAuctionFixtureConfig({
        env: validEnv({ GITHUB_JOB: "" }),
        action: "seed",
      }),
    ).toMatchObject({ ok: false });
  });
});

describe("staging auction fixture SQL", () => {
  it("seeds deterministic auctions and an open house, then proves a fresh publication", () => {
    const sql = buildStagingAuctionFixtureSql("seed", TEST_RUN);
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain(
      "auction_pool:' || to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')",
    );
    expect(sql).toContain("now() + interval '30 days'");
    expect(sql).toContain("clock_timestamp() + interval '11 minutes'");
    expect(sql).toContain("clock_timestamp() + interval '10 minutes'");
    expect(sql).toContain("fixture.auction_date");
    expect(sql).toContain("'source:maiprop-os'");
    expect(sql).toContain("'os_auction:stage-proof-os-auction-");
    expect(sql).toContain("'staging-auction-route:uuid'");
    expect(sql).toContain("'open_house'::public.listing_type");
    expect(sql).toContain("open_house_date");
    expect(sql).toContain("open_house_transaction_type");
    expect(sql).toContain("'sale'");
    expect(sql).toMatch(/FROM fixtures AS fixture\s+CROSS JOIN fixture_owner/);
    expect(sql).toContain(
      "date_trunc('minute', clock_timestamp()) - interval '1 minute'",
    );
    expect(sql).toContain("created_at = EXCLUDED.created_at");
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql.indexOf("pg_catalog.pg_advisory_xact_lock")).toBeLessThan(
      sql.indexOf("INSERT INTO public.listings"),
    );
    expect(sql).toContain("pg_catalog.pg_sleep");
    expect(sql).toContain("60.25");
    expect(sql).toContain("private.publish_public_catalogue()");
    expect(sql).toContain("v_prior_publication_id");
    expect(sql).toContain(
      "v_publication_id IS NOT DISTINCT FROM v_prior_publication_id",
    );
    expect(sql).toContain("v_published_at <= v_mutated_at");
    expect(sql).toContain("public.get_public_catalogue_publication(NULL)");
    expect(sql).toContain("public.get_public_catalogue_listing(");
    expect(sql).toContain("staging_catalogue_fixture_not_current");
    expect(sql).toContain("staging_catalogue_fixture_seed_not_published");
    expect(sql).toContain("v_fixture_count <> 3");
    expect(sql).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) private\.public_catalogue_/,
    );
  });

  it("cleans only the three deterministic staging fixtures and republishes", () => {
    const sql = buildStagingAuctionFixtureSql("cleanup", TEST_RUN);
    expect(sql).toContain("DELETE FROM public.listing_images");
    expect(sql).toContain("DELETE FROM public.listings");
    expect(
      new Set(
        sql.match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g,
        ),
      ).size,
    ).toBe(3);
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
    expect(sql.indexOf("pg_catalog.pg_advisory_xact_lock")).toBeLessThan(
      sql.indexOf("DELETE FROM public.listing_images"),
    );
    expect(sql).toContain("pg_catalog.pg_sleep");
    expect(sql).toContain("60.25");
    expect(sql).toContain("private.publish_public_catalogue()");
    expect(sql).toContain("v_prior_publication_id");
    expect(sql).toContain(
      "v_publication_id IS NOT DISTINCT FROM v_prior_publication_id",
    );
    expect(sql).toContain("v_published_at <= v_mutated_at");
    expect(sql).toContain("public.get_public_catalogue_publication(NULL)");
    expect(sql).toContain("public.get_public_catalogue_listing(");
    expect(sql).toContain("staging_catalogue_fixture_cleanup_not_published");
    expect(sql).toContain("v_fixture_count <> 0");
    expect(sql).not.toMatch(
      /(?:INSERT INTO|UPDATE|DELETE FROM) private\.public_catalogue_/,
    );
    expect(sql).not.toContain("TRUNCATE");
    expect(sql.trimStart().startsWith("BEGIN;")).toBe(true);
    expect(sql.trimEnd().endsWith("COMMIT;")).toBe(true);
    expect(sql.indexOf("DELETE FROM public.listing_images")).toBeLessThan(
      sql.indexOf("DELETE FROM public.listings"),
    );
    expect(sql.indexOf("DELETE FROM public.listings")).toBeLessThan(
      sql.indexOf("private.publish_public_catalogue()"),
    );
  });

  it("refuses to build mutable SQL without a validated workflow identity", () => {
    expect(() => buildStagingAuctionFixtureSql("seed")).toThrow(
      /workflow identity/i,
    );
    expect(() =>
      buildStagingAuctionFixtureSql("cleanup", {
        runId: "33931847936",
        runAttempt: "1",
        job: "",
      }),
    ).toThrow(/workflow identity/i);
  });

  it("uses stable, disjoint fixture identifiers for each workflow run attempt", () => {
    const runA = {
      runId: "33931847936",
      runAttempt: "1",
      job: "n_minus_one_compatibility",
    };
    const runB = { ...runA, runAttempt: "2" };
    const otherJob = { ...runA, job: "staging_catalogue_performance" };
    const firstSeed = buildStagingAuctionFixtureSql("seed", runA);
    const repeatedSeed = buildStagingAuctionFixtureSql("seed", runA);
    const otherAttemptSeed = buildStagingAuctionFixtureSql("seed", runB);

    expect(firstSeed).toBe(repeatedSeed);
    expect(firstSeed).not.toBe(otherAttemptSeed);
    expect(buildStagingAuctionFixtureSql("cleanup", runA)).not.toBe(
      buildStagingAuctionFixtureSql("cleanup", runB),
    );
    expect(firstSeed).not.toBe(buildStagingAuctionFixtureSql("seed", otherJob));

    const cleanupIds = (identity) =>
      new Set(
        buildStagingAuctionFixtureSql("cleanup", identity).match(
          /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/g,
        ),
      );
    const runAIds = cleanupIds(runA);
    const runBIds = cleanupIds(runB);
    const otherJobIds = cleanupIds(otherJob);
    expect(runAIds.size).toBe(3);
    expect([...runAIds].filter((id) => runBIds.has(id))).toEqual([]);
    expect([...runAIds].filter((id) => otherJobIds.has(id))).toEqual([]);
  });
});
