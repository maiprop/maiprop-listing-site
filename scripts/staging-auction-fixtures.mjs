import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertStagingMutationTarget,
  MAIPROP_STAGING_SUPABASE_PROJECT_REF,
} from "./assert-staging-mutation-target.mjs";

function fixtureIdsSql(fixtureIds) {
  return Object.values(fixtureIds)
    .filter((value) => /^[0-9a-f-]{36}$/.test(value))
    .map((value) => `'${value}'::uuid`)
    .join(", ");
}

function deterministicUuid(runIdentity, fixtureName) {
  const hex = createHash("sha256")
    .update(
      `maiprop-staging-catalogue:${runIdentity.runId}:${runIdentity.runAttempt}:${runIdentity.job}:${fixtureName}`,
    )
    .digest("hex")
    .slice(0, 32)
    .split("");
  hex[12] = "5";
  hex[16] = "8";
  const value = hex.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20)}`;
}

function fixtureIdsForRun(runIdentity) {
  if (
    !runIdentity ||
    !/^[1-9][0-9]*$/.test(runIdentity.runId) ||
    !/^[1-9][0-9]*$/.test(runIdentity.runAttempt) ||
    !/^[A-Za-z0-9_-]{1,100}$/.test(runIdentity.job)
  ) {
    throw new Error("A valid GitHub workflow identity is required.");
  }
  const providerSuffix = createHash("sha256")
    .update(
      `maiprop-staging-catalogue:${runIdentity.runId}:${runIdentity.runAttempt}:${runIdentity.job}:os-provider`,
    )
    .digest("hex")
    .slice(0, 16);
  return Object.freeze({
    uuidListingId: deterministicUuid(runIdentity, "uuid-auction"),
    osListingId: deterministicUuid(runIdentity, "os-auction"),
    openHouseListingId: deterministicUuid(runIdentity, "open-house"),
    osProviderId: `stage-proof-os-auction-${providerSuffix}`,
  });
}

export function validateStagingAuctionFixtureConfig({
  env = process.env,
  action = process.argv[2],
} = {}) {
  const failures = [];
  if (!new Set(["seed", "cleanup"]).has(action)) {
    failures.push("Action must be seed or cleanup.");
  }
  const runIdentity = {
    runId: String(env.GITHUB_RUN_ID ?? "").trim(),
    runAttempt: String(env.GITHUB_RUN_ATTEMPT ?? "").trim(),
    job: String(env.GITHUB_JOB ?? "").trim(),
  };
  if (!/^[1-9][0-9]*$/.test(runIdentity.runId)) {
    failures.push("GITHUB_RUN_ID must be a positive integer.");
  }
  if (!/^[1-9][0-9]*$/.test(runIdentity.runAttempt)) {
    failures.push("GITHUB_RUN_ATTEMPT must be a positive integer.");
  }
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(runIdentity.job)) {
    failures.push("GITHUB_JOB must be a valid non-empty job identifier.");
  }
  let databaseUrl = String(
    env.SUPABASE_STAGING_EFFECTIVE_DB_URL ?? env.SUPABASE_STAGING_DB_URL ?? "",
  ).trim();
  try {
    const parsed = new URL(databaseUrl);
    if ([...parsed.searchParams.keys()].length === 0) {
      parsed.searchParams.set("sslmode", "require");
      databaseUrl = parsed.toString();
    }
    assertStagingMutationTarget({
      projectRef: env.STAGING_SUPABASE_PROJECT_ID,
      databaseUrl,
      acknowledgement: env.STAGING_MUTATION_ACKNOWLEDGEMENT,
    });
  } catch (error) {
    failures.push(error instanceof Error ? error.message : String(error));
  }
  return {
    ok: failures.length === 0,
    failures,
    action,
    databaseUrl,
    runIdentity,
  };
}

function cataloguePublicationLockSql() {
  return `SELECT pg_catalog.pg_advisory_xact_lock(
  pg_catalog.hashtextextended('private.publish_public_catalogue', 0)
);`;
}

function publishAndVerifySql(action, fixtureIds) {
  const { openHouseListingId } = fixtureIds;
  const fixtureIdsListSql = fixtureIdsSql(fixtureIds);
  const publishedFixturePredicate =
    action === "seed"
      ? `AND jsonb_typeof(published.detail_payload -> 'listing_images') = 'array'
    AND jsonb_array_length(published.detail_payload -> 'listing_images') > 0`
      : "";
  const expectedCount = action === "seed" ? 3 : 0;
  const failure =
    action === "seed"
      ? "staging_catalogue_fixture_seed_not_published"
      : "staging_catalogue_fixture_cleanup_not_published";
  const openHouseVerification =
    action === "seed"
      ? `
  IF NOT EXISTS (
    SELECT 1
    FROM public.get_public_catalogue_listing(
      v_publication_id,
      '${openHouseListingId}'::uuid,
      NULL::text
    ) AS published
    WHERE published.detail_payload ->> 'listing_type' = 'open_house'
      AND published.detail_payload ->> 'open_house_transaction_type' = 'sale'
      AND (published.detail_payload ->> 'open_house_date')::timestamptz >= v_snapshot_minute
  ) THEN
    RAISE EXCEPTION 'staging_catalogue_open_house_not_published';
  END IF;`
      : "";

  return `DO $publish$
DECLARE
  v_mutated_at timestamptz := clock_timestamp();
  v_prior_publication_id bigint;
  v_prior_snapshot_minute timestamptz;
  v_publication_id bigint;
  v_snapshot_minute timestamptz;
  v_published_at timestamptz;
  v_current_publication_id bigint;
  v_fixture_count integer;
BEGIN
  SELECT publication.publication_id, publication.snapshot_minute
  INTO v_prior_publication_id, v_prior_snapshot_minute
  FROM public.get_public_catalogue_publication(NULL) AS publication;

  IF v_prior_snapshot_minute = date_trunc('minute', clock_timestamp()) THEN
    PERFORM pg_catalog.pg_sleep(
      least(
        greatest(
          extract(epoch FROM (
            v_prior_snapshot_minute
            + interval '1 minute'
            + interval '250 milliseconds'
            - clock_timestamp()
          )),
          0
        ),
        60.25
      )
    );
  END IF;

  SELECT
    publication.publication_id,
    publication.snapshot_minute,
    publication.published_at
  INTO v_publication_id, v_snapshot_minute, v_published_at
  FROM private.publish_public_catalogue() AS publication;

  IF v_publication_id IS NOT DISTINCT FROM v_prior_publication_id
     OR v_published_at <= v_mutated_at THEN
    RAISE EXCEPTION 'staging_catalogue_publication_was_not_advanced';
  END IF;

  SELECT publication.publication_id
  INTO v_current_publication_id
  FROM public.get_public_catalogue_publication(NULL) AS publication;
  IF v_current_publication_id IS DISTINCT FROM v_publication_id THEN
    RAISE EXCEPTION 'staging_catalogue_fixture_not_current';
  END IF;

  SELECT count(*)::integer
  INTO v_fixture_count
  FROM unnest(ARRAY[${fixtureIdsListSql}]) AS fixture(id)
  CROSS JOIN LATERAL public.get_public_catalogue_listing(
    v_publication_id,
    fixture.id,
    NULL::text
  ) AS published
  WHERE true
    ${publishedFixturePredicate};

  IF v_fixture_count <> ${expectedCount} THEN
    RAISE EXCEPTION '${failure}';
  END IF;${openHouseVerification}
END
$publish$;`;
}

export function buildStagingAuctionFixtureSql(action, runIdentity) {
  const fixtureIds = fixtureIdsForRun(runIdentity);
  const fixtureIdsListSql = fixtureIdsSql(fixtureIds);
  if (action === "cleanup") {
    return `
BEGIN;
${cataloguePublicationLockSql()}
DELETE FROM public.listing_images WHERE listing_id IN (${fixtureIdsListSql});
DELETE FROM public.listings WHERE id IN (${fixtureIdsListSql});
${publishAndVerifySql("cleanup", fixtureIds)}
COMMIT;
`;
  }
  if (action !== "seed") throw new Error("Action must be seed or cleanup.");

  const { uuidListingId, osListingId, openHouseListingId, osProviderId } =
    fixtureIds;
  return `
BEGIN;
SET LOCAL app.ecas_load_test = 'true';
${cataloguePublicationLockSql()}

WITH fixture_owner AS (
  SELECT id
  FROM public.profiles
  WHERE role::text IN ('seller', 'agent', 'developer', 'admin')
  ORDER BY id
  LIMIT 1
), fixtures AS (
  SELECT * FROM (VALUES
    (
      '${uuidListingId}'::uuid,
      'Staging UUID auction route proof',
      'Athens',
      ARRAY[
        'source:maiprop-os',
        'os_auction:stage-proof-uuid-auction',
        'staging-auction-route:uuid',
        'auction_pool:' || to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
      ]::text[],
      date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        + interval '2 minutes'
    ),
    (
      '${osListingId}'::uuid,
      'Staging OS auction route proof',
      'Piraeus',
      ARRAY[
        'source:maiprop-os',
        'os_auction:${osProviderId}',
        'auction_pool:' || to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
      ]::text[],
      date_trunc('day', clock_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'
        + interval '1 minute'
    )
  ) AS fixture(id, title, city, tags, auction_date)
)
INSERT INTO public.listings (
  id, owner_id, title, description, address, city, region, postal_code,
  latitude, longitude, price, price_per_sqm, sqm, bedrooms, bathrooms,
  floor, total_floors, year_built, energy_class, property_type,
  listing_type, status, auction_date, auction_starting_bid, auction_court,
  website_url, tags, cover_image_url, created_at, updated_at, is_off_market
)
SELECT
  fixture.id, fixture_owner.id, fixture.title,
  'Deterministic staging-only fixture for the exact-SHA auction navigation proof.',
  '1 Staging Proof Avenue', fixture.city, 'Attica', '10557',
  37.98, 23.72, 125000, 1250, 100, 2, 1, 2, 5, 2005, 'B',
  'apartment'::public.property_type, 'auction'::public.listing_type,
  'active'::public.listing_status, fixture.auction_date, 100000,
  'Athens Court', 'https://example.invalid/staging-auction-proof', fixture.tags,
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70',
  date_trunc('minute', clock_timestamp()) - interval '1 minute',
  clock_timestamp(), false
FROM fixtures AS fixture
CROSS JOIN fixture_owner
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  region = EXCLUDED.region,
  postal_code = EXCLUDED.postal_code,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  price = EXCLUDED.price,
  price_per_sqm = EXCLUDED.price_per_sqm,
  sqm = EXCLUDED.sqm,
  bedrooms = EXCLUDED.bedrooms,
  bathrooms = EXCLUDED.bathrooms,
  floor = EXCLUDED.floor,
  total_floors = EXCLUDED.total_floors,
  year_built = EXCLUDED.year_built,
  energy_class = EXCLUDED.energy_class,
  property_type = EXCLUDED.property_type,
  listing_type = EXCLUDED.listing_type,
  status = EXCLUDED.status,
  auction_date = EXCLUDED.auction_date,
  auction_starting_bid = EXCLUDED.auction_starting_bid,
  auction_court = EXCLUDED.auction_court,
  website_url = EXCLUDED.website_url,
  tags = EXCLUDED.tags,
  cover_image_url = EXCLUDED.cover_image_url,
  created_at = EXCLUDED.created_at,
  updated_at = clock_timestamp(),
  is_off_market = false;

WITH fixture_owner AS (
  SELECT id
  FROM public.profiles
  WHERE role::text IN ('seller', 'agent', 'developer', 'admin')
  ORDER BY id
  LIMIT 1
)
INSERT INTO public.listings (
  id, owner_id, title, description, address, city, region, postal_code,
  latitude, longitude, price, price_per_sqm, sqm, bedrooms, bathrooms,
  floor, total_floors, year_built, energy_class, property_type,
  listing_type, status, open_house_date, open_house_transaction_type,
  website_url, tags, cover_image_url, created_at, updated_at, is_off_market
)
SELECT
  '${openHouseListingId}'::uuid, fixture_owner.id,
  'Staging open house catalogue proof',
  'Deterministic staging-only fixture for the exact-SHA open-house catalogue proof.',
  '3 Staging Proof Avenue', 'Athens', 'Attica', '10557',
  37.98, 23.72, 135000, 1350, 100, 2, 1, 2, 5, 2005, 'B',
  'apartment'::public.property_type, 'open_house'::public.listing_type,
  'active'::public.listing_status, now() + interval '30 days', 'sale',
  'https://example.invalid/staging-open-house-proof',
  ARRAY['staging-open-house-catalogue:exact-sha']::text[],
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70',
  date_trunc('minute', clock_timestamp()) - interval '1 minute',
  clock_timestamp(), false
FROM fixture_owner
ON CONFLICT (id) DO UPDATE SET
  owner_id = EXCLUDED.owner_id,
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  address = EXCLUDED.address,
  city = EXCLUDED.city,
  region = EXCLUDED.region,
  postal_code = EXCLUDED.postal_code,
  latitude = EXCLUDED.latitude,
  longitude = EXCLUDED.longitude,
  price = EXCLUDED.price,
  price_per_sqm = EXCLUDED.price_per_sqm,
  sqm = EXCLUDED.sqm,
  bedrooms = EXCLUDED.bedrooms,
  bathrooms = EXCLUDED.bathrooms,
  floor = EXCLUDED.floor,
  total_floors = EXCLUDED.total_floors,
  year_built = EXCLUDED.year_built,
  energy_class = EXCLUDED.energy_class,
  property_type = EXCLUDED.property_type,
  listing_type = EXCLUDED.listing_type,
  status = EXCLUDED.status,
  open_house_date = EXCLUDED.open_house_date,
  open_house_transaction_type = EXCLUDED.open_house_transaction_type,
  website_url = EXCLUDED.website_url,
  tags = EXCLUDED.tags,
  cover_image_url = EXCLUDED.cover_image_url,
  created_at = EXCLUDED.created_at,
  updated_at = clock_timestamp(),
  is_off_market = false;

DELETE FROM public.listing_images
WHERE listing_id IN ('${uuidListingId}'::uuid, '${osListingId}'::uuid, '${openHouseListingId}'::uuid);

INSERT INTO public.listing_images (listing_id, url, sort_order)
SELECT fixture_id, url, 0
FROM unnest(ARRAY['${uuidListingId}'::uuid, '${osListingId}'::uuid, '${openHouseListingId}'::uuid]) AS fixture_id
CROSS JOIN LATERAL (
  SELECT 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70'::text AS url
) AS image;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.listings WHERE id IN (${fixtureIdsListSql})) <> 3 THEN
    RAISE EXCEPTION 'staging_auction_fixture_seed_incomplete';
  END IF;
END
$verify$;

${publishAndVerifySql("seed", fixtureIds)}
COMMIT;
`;
}

export function runStagingAuctionFixtures(options = {}) {
  const config = validateStagingAuctionFixtureConfig(options);
  if (!config.ok) return config;
  const run = spawnSync(
    "psql",
    [config.databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "--no-psqlrc"],
    {
      input: buildStagingAuctionFixtureSql(config.action, config.runIdentity),
      encoding: "utf8",
      env: process.env,
      maxBuffer: 4 * 1024 * 1024,
    },
  );
  return {
    ...config,
    ok: run.status === 0,
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
  };
}

function main() {
  const result = runStagingAuctionFixtures();
  if (result.stdout) process.stdout.write(result.stdout);
  if (!result.ok) {
    for (const failure of result.failures ?? [])
      process.stderr.write(`${failure}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = 1;
  }
}

if (
  process.argv[1] &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1])
) {
  main();
}
