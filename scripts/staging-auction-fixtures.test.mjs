import { describe, expect, it } from "vitest";
import {
  STAGING_AUCTION_FIXTURE_IDS,
  buildStagingAuctionFixtureSql,
  validateStagingAuctionFixtureConfig,
} from "./staging-auction-fixtures.mjs";

const STAGING_REF = "xsiehskfgeoqyazcgauv";
const stagingUrl = `postgresql://postgres.${STAGING_REF}:password@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`;

const validEnv = (overrides = {}) => ({
  STAGING_SUPABASE_PROJECT_ID: STAGING_REF,
  STAGING_MUTATION_ACKNOWLEDGEMENT: `MUTATE_STAGING_${STAGING_REF}`,
  SUPABASE_STAGING_DB_URL: stagingUrl,
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
});

describe("staging auction fixture SQL", () => {
  it("seeds deterministic current UUID and OS-route auctions and republishes the catalogue", () => {
    const sql = buildStagingAuctionFixtureSql("seed");
    expect(STAGING_AUCTION_FIXTURE_IDS).toEqual({
      uuidListingId: "5a7a9000-0000-4000-8000-000000000001",
      osListingId: "5a7a9000-0000-4000-8000-000000000002",
      osProviderId: "stage-proof-os-auction",
    });
    expect(sql).toContain("ON CONFLICT (id) DO UPDATE");
    expect(sql).toContain(
      "auction_pool:' || to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')",
    );
    expect(sql).toContain("now() + interval '30 days'");
    expect(sql).toContain("'source:maiprop-os'");
    expect(sql).toContain("'os_auction:stage-proof-os-auction'");
    expect(sql).toContain("'staging-auction-route:uuid'");
    expect(sql).toContain("SELECT private.publish_public_catalogue()");
  });

  it("cleans only the two deterministic staging fixtures and republishes", () => {
    const sql = buildStagingAuctionFixtureSql("cleanup");
    expect(sql).toContain("DELETE FROM public.listing_images");
    expect(sql).toContain("DELETE FROM public.listings");
    expect(sql).toContain("5a7a9000-0000-4000-8000-000000000001");
    expect(sql).toContain("5a7a9000-0000-4000-8000-000000000002");
    expect(sql).toContain("SELECT private.publish_public_catalogue()");
    expect(sql).not.toContain("TRUNCATE");
  });
});
