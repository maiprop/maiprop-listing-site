import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertStagingMutationTarget,
  MAIPROP_STAGING_SUPABASE_PROJECT_REF,
} from "./assert-staging-mutation-target.mjs";

export const STAGING_AUCTION_FIXTURE_IDS = Object.freeze({
  uuidListingId: "5a7a9000-0000-4000-8000-000000000001",
  osListingId: "5a7a9000-0000-4000-8000-000000000002",
  osProviderId: "stage-proof-os-auction",
});

const FIXTURE_IDS_SQL = Object.values(STAGING_AUCTION_FIXTURE_IDS)
  .filter((value) => /^[0-9a-f-]{36}$/.test(value))
  .map((value) => `'${value}'::uuid`)
  .join(", ");

export function validateStagingAuctionFixtureConfig({
  env = process.env,
  action = process.argv[2],
} = {}) {
  const failures = [];
  if (!new Set(["seed", "cleanup"]).has(action)) {
    failures.push("Action must be seed or cleanup.");
  }
  let databaseUrl = String(env.SUPABASE_STAGING_DB_URL ?? "").trim();
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
  return { ok: failures.length === 0, failures, action, databaseUrl };
}

function publishSql() {
  return "SELECT private.publish_public_catalogue();";
}

export function buildStagingAuctionFixtureSql(action) {
  if (action === "cleanup") {
    return `
BEGIN;
DELETE FROM public.listing_images WHERE listing_id IN (${FIXTURE_IDS_SQL});
DELETE FROM public.listings WHERE id IN (${FIXTURE_IDS_SQL});
${publishSql()}
COMMIT;
`;
  }
  if (action !== "seed") throw new Error("Action must be seed or cleanup.");

  const { uuidListingId, osListingId, osProviderId } =
    STAGING_AUCTION_FIXTURE_IDS;
  return `
BEGIN;
SET LOCAL app.ecas_load_test = 'true';

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
      ]::text[]
    ),
    (
      '${osListingId}'::uuid,
      'Staging OS auction route proof',
      'Piraeus',
      ARRAY[
        'source:maiprop-os',
        'os_auction:${osProviderId}',
        'auction_pool:' || to_char((now() AT TIME ZONE 'UTC')::date, 'YYYY-MM-DD')
      ]::text[]
    )
  ) AS fixture(id, title, city, tags)
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
  'active'::public.listing_status, now() + interval '30 days', 100000,
  'Athens Court', 'https://example.invalid/staging-auction-proof', fixture.tags,
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70',
  now(), now(), false
FROM fixtures
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
  updated_at = now(),
  is_off_market = false;

DELETE FROM public.listing_images
WHERE listing_id IN ('${uuidListingId}'::uuid, '${osListingId}'::uuid);

INSERT INTO public.listing_images (listing_id, url, sort_order)
SELECT fixture_id, url, 0
FROM unnest(ARRAY['${uuidListingId}'::uuid, '${osListingId}'::uuid]) AS fixture_id
CROSS JOIN LATERAL (
  SELECT 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70'::text AS url
) AS image;

DO $verify$
BEGIN
  IF (SELECT count(*) FROM public.listings WHERE id IN (${FIXTURE_IDS_SQL})) <> 2 THEN
    RAISE EXCEPTION 'staging_auction_fixture_seed_incomplete';
  END IF;
END
$verify$;

${publishSql()}
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
      input: buildStagingAuctionFixtureSql(config.action),
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
