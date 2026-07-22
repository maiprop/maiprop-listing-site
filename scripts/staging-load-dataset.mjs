import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const STAGING_PROJECT_REF = "xsiehskfgeoqyazcgauv";
export const PRODUCTION_PROJECT_REF = "qvvicunqcrwpioqnvzxf";
export const SUPPORTED_DATASET_SIZES = [1_000, 10_000];

function readArg(argv, name) {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function clean(value) {
  return String(value ?? "").trim();
}

function sqlLiteral(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function deterministicUuidSql(valueExpression) {
  return `(substr(md5(${valueExpression}), 1, 8) || '-' || substr(md5(${valueExpression}), 9, 4) || '-' || substr(md5(${valueExpression}), 13, 4) || '-' || substr(md5(${valueExpression}), 17, 4) || '-' || substr(md5(${valueExpression}), 21, 12))::uuid`;
}

export function validateStagingDatasetConfig({ env = process.env, argv = process.argv.slice(2) } = {}) {
  const failures = [];
  const action = clean(readArg(argv, "--action") || env.ECAS_DATASET_ACTION || "seed").toLowerCase();
  const targetCount = Number(readArg(argv, "--target-count") || env.ECAS_DATASET_SIZE || 1_000);
  const runId = clean(readArg(argv, "--run-id") || env.ECAS_DATASET_RUN_ID || "manual").toLowerCase();
  const projectRef = clean(env.STAGING_SUPABASE_PROJECT_ID);
  const databaseUrl = clean(env.SUPABASE_STAGING_EFFECTIVE_DB_URL || env.SUPABASE_STAGING_DB_URL);

  if (env.ALLOW_STAGING_LOAD_DATASET !== "true") {
    failures.push("ALLOW_STAGING_LOAD_DATASET=true is required.");
  }
  if (!['seed', 'cleanup', 'cleanup-all'].includes(action)) {
    failures.push("ECAS dataset action must be seed, cleanup, or cleanup-all.");
  }
  if (!SUPPORTED_DATASET_SIZES.includes(targetCount)) {
    failures.push(`ECAS dataset size must be one of: ${SUPPORTED_DATASET_SIZES.join(", ")}.`);
  }
  if (!/^[a-z0-9][a-z0-9-]{2,47}$/.test(runId)) {
    failures.push("ECAS dataset run id must be 3-48 lowercase letters, numbers, or hyphens.");
  }
  if (projectRef !== STAGING_PROJECT_REF) {
    failures.push(`STAGING_SUPABASE_PROJECT_ID must be the isolated staging project ${STAGING_PROJECT_REF}.`);
  }
  if (projectRef === PRODUCTION_PROJECT_REF) {
    failures.push("The production Supabase project is never a valid load-dataset target.");
  }

  let parsedUrl = null;
  try {
    parsedUrl = new URL(databaseUrl);
    if (!['postgres:', 'postgresql:'].includes(parsedUrl.protocol)) {
      failures.push("The staging database URL must use postgres:// or postgresql://.");
    }
    const connectionIdentity = `${decodeURIComponent(parsedUrl.username)} ${parsedUrl.hostname}`;
    if (!connectionIdentity.includes(STAGING_PROJECT_REF)) {
      failures.push("The staging database URL does not identify the configured staging project.");
    }
    if (connectionIdentity.includes(PRODUCTION_PROJECT_REF)) {
      failures.push("The staging database URL identifies the production project.");
    }
  } catch {
    failures.push("SUPABASE_STAGING_EFFECTIVE_DB_URL or SUPABASE_STAGING_DB_URL must be a valid Postgres URL.");
  }

  return {
    ok: failures.length === 0,
    failures,
    config: {
      action,
      targetCount,
      runId,
      tag: `ecas-load:${runId}`,
      projectRef,
      databaseUrl,
      parsedUrl,
    },
  };
}

export function buildCleanupSql(tag) {
  const tagSql = sqlLiteral(tag);
  return `
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

DELETE FROM public.listing_promotion_allocations
WHERE request_key LIKE ${tagSql} || ':%';

DELETE FROM public.project_units
WHERE project_id IN (
  SELECT id FROM public.projects WHERE description = ${tagSql}
)
OR listing_id IN (
  SELECT id FROM public.listings WHERE ${tagSql} = ANY(tags)
);

DELETE FROM public.project_media
WHERE project_id IN (
  SELECT id FROM public.projects WHERE description = ${tagSql}
);

DELETE FROM public.listing_images
WHERE listing_id IN (
  SELECT id FROM public.listings WHERE ${tagSql} = ANY(tags)
);

DELETE FROM public.listings WHERE ${tagSql} = ANY(tags);
DELETE FROM public.projects WHERE description = ${tagSql};
DELETE FROM public.organization_memberships
WHERE organization_id IN (
  SELECT id FROM public.organizations WHERE settings ->> 'ecas_load_tag' = ${tagSql}
);
DELETE FROM public.organizations WHERE settings ->> 'ecas_load_tag' = ${tagSql};

COMMIT;
`;
}

export function buildCleanupAllSql() {
  return `
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '10min';

DELETE FROM public.listing_promotion_allocations
WHERE request_key LIKE 'ecas-load:%';

DELETE FROM public.project_units
WHERE project_id IN (
  SELECT id FROM public.projects WHERE description LIKE 'ecas-load:%'
)
OR listing_id IN (
  SELECT id FROM public.listings
  WHERE EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag LIKE 'ecas-load:%')
);

DELETE FROM public.project_media
WHERE project_id IN (
  SELECT id FROM public.projects WHERE description LIKE 'ecas-load:%'
);

DELETE FROM public.listing_images
WHERE listing_id IN (
  SELECT id FROM public.listings
  WHERE EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag LIKE 'ecas-load:%')
);

DELETE FROM public.listings
WHERE EXISTS (SELECT 1 FROM unnest(tags) AS tag WHERE tag LIKE 'ecas-load:%');
DELETE FROM public.projects WHERE description LIKE 'ecas-load:%';
DELETE FROM public.organization_memberships
WHERE organization_id IN (
  SELECT id FROM public.organizations WHERE settings ->> 'ecas_load_tag' LIKE 'ecas-load:%'
);
DELETE FROM public.organizations WHERE settings ->> 'ecas_load_tag' LIKE 'ecas-load:%';

COMMIT;
`;
}

export function buildSeedSql({ tag, targetCount }) {
  const tagSql = sqlLiteral(tag);
  const projectCount = targetCount / 20;
  const organizationCount = targetCount === 10_000 ? 50 : 20;
  const listingUuid = deterministicUuidSql(`${tagSql} || ':listing:' || i::text`);
  const projectUuid = deterministicUuidSql(`${tagSql} || ':project:' || i::text`);
  const organizationUuid = deterministicUuidSql(`${tagSql} || ':org:' || i::text`);

  return `${buildCleanupSql(tag)}
BEGIN;
SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '20min';
SET LOCAL app.ecas_load_test = 'true';

DO $guard$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '942130d0-c41c-4cde-8664-34c00cac32fb'::uuid
      AND email = 'agent.pro@maiprop.demo'
  ) OR NOT EXISTS (
    SELECT 1 FROM auth.users
    WHERE id = '6214f804-492d-491b-9ebf-02d8bfd576f5'::uuid
      AND email = 'developer.pro@maiprop.demo'
  ) THEN
    RAISE EXCEPTION 'staging_demo_accounts_missing';
  END IF;
END
$guard$;

WITH source AS (
  SELECT i, ${organizationUuid} AS id
  FROM generate_series(1, ${organizationCount}) AS series(i)
)
INSERT INTO public.organizations (id, name, slug, plan, created_by, settings)
SELECT
  id,
  'ECAS Load Organization ' || i,
  'ecas-load-${tag.replace('ecas-load:', '')}-' || i,
  CASE WHEN i % 5 = 0 THEN 'enterprise' ELSE 'pro' END,
  '942130d0-c41c-4cde-8664-34c00cac32fb'::uuid,
  jsonb_build_object('ecas_load_tag', ${tagSql}, 'synthetic', true)
FROM source;

INSERT INTO public.organization_memberships (organization_id, user_id, role, status)
SELECT
  ${deterministicUuidSql(`${tagSql} || ':org:' || i::text`)},
  '6214f804-492d-491b-9ebf-02d8bfd576f5'::uuid,
  'member',
  'active'
FROM generate_series(1, ${organizationCount}) AS series(i)
WHERE i % 4 = 0;

INSERT INTO public.projects (
  id, owner_id, name, description, city, municipality, address,
  cover_image_url, status, building_permit_number, developer_company,
  latitude, longitude, delivery_date, organization_id
)
SELECT
  ${projectUuid},
  '6214f804-492d-491b-9ebf-02d8bfd576f5'::uuid,
  'ECAS New Build ' || i,
  ${tagSql},
  (ARRAY['Athens','Glyfada','Thessaloniki','Piraeus','Patras','Heraklion'])[(i % 6) + 1],
  (ARRAY['Athens','Glyfada','Thessaloniki','Piraeus','Patras','Heraklion'])[(i % 6) + 1],
  (10 + i % 190) || ' Synthetic Avenue',
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70',
  'active',
  'ECAS-' || i,
  'ECAS Synthetic Developments',
  37.90 + ((i % 100)::numeric / 1000),
  23.65 + ((i % 100)::numeric / 1000),
  current_date + ((90 + i % 720) || ' days')::interval,
  ${deterministicUuidSql(`${tagSql} || ':org:' || ((i - 1) % ${organizationCount} + 1)::text`)}
FROM generate_series(1, ${projectCount}) AS series(i);

WITH generated AS (
  SELECT
    i,
    ${listingUuid} AS id,
    ((i - 1) % 20) AS bucket,
    ((i - 1) % ${organizationCount} + 1) AS org_number,
    (ARRAY['Athens','Glyfada','Thessaloniki','Piraeus','Patras','Heraklion','Larissa','Volos'])[((i - 1) % 8) + 1] AS city,
    (ARRAY['apartment','house','villa','land','commercial','office','studio','maisonette','warehouse','hotel'])[((i - 1) % 10) + 1]::public.property_type AS property_type,
    (45 + (i % 240))::numeric AS sqm
  FROM generate_series(1, ${targetCount}) AS series(i)
)
INSERT INTO public.listings (
  id, owner_id, organization_id, project_id, title, description, address, city,
  region, postal_code, latitude, longitude, price, price_per_sqm, sqm, bedrooms,
  bathrooms, floor, total_floors, year_built, energy_class, property_type,
  listing_type, status, auction_date, auction_starting_bid, open_house_date,
  open_house_transaction_type, has_parking, has_elevator, has_balcony,
  has_video_tour, views_count, ai_score, tags, cover_image_url, created_at,
  updated_at, is_pre_sale, construction_status
)
SELECT
  id,
  CASE WHEN bucket = 19
    THEN '6214f804-492d-491b-9ebf-02d8bfd576f5'::uuid
    ELSE '942130d0-c41c-4cde-8664-34c00cac32fb'::uuid
  END,
  ${deterministicUuidSql(`${tagSql} || ':org:' || org_number::text`)},
  CASE WHEN bucket = 19
    THEN ${deterministicUuidSql(`${tagSql} || ':project:' || ((i + 19) / 20)::text`)}
    ELSE NULL
  END,
  'ECAS ' || CASE
    WHEN bucket <= 10 THEN 'Sale'
    WHEN bucket <= 16 THEN 'Rental'
    WHEN bucket = 17 THEN 'Auction'
    WHEN bucket = 18 THEN 'Open House'
    ELSE 'New Build'
  END || ' ' || i,
  'Synthetic staging-only listing for controlled ECAS load proof.',
  (1 + i % 220) || ' ' || (ARRAY['Kifisias','Vouliagmenis','Tsimiski','Poseidonos','Patision'])[(i % 5) + 1] || ' Avenue',
  city,
  CASE WHEN city IN ('Thessaloniki','Larissa','Volos') THEN 'Central Macedonia' ELSE 'Attica' END,
  lpad((10000 + i % 89999)::text, 5, '0'),
  37.88 + ((i % 300)::numeric / 10000),
  23.62 + ((i % 300)::numeric / 10000),
  CASE WHEN bucket BETWEEN 11 AND 16
    THEN 550 + (i % 3500)
    ELSE 85000 + (i % 80) * 12500
  END,
  round((CASE WHEN bucket BETWEEN 11 AND 16 THEN 550 + (i % 3500) ELSE 85000 + (i % 80) * 12500 END) / sqm, 2),
  sqm,
  CASE WHEN property_type IN ('land','commercial','office','warehouse','hotel') THEN NULL ELSE 1 + (i % 5) END,
  CASE WHEN property_type = 'land' THEN NULL ELSE 1 + (i % 3) END,
  CASE WHEN property_type = 'land' THEN NULL ELSE (i % 8) END,
  CASE WHEN property_type = 'land' THEN NULL ELSE 2 + (i % 8) END,
  1970 + (i % 56),
  (ARRAY['A+','A','B+','B','C'])[(i % 5) + 1],
  property_type,
  CASE
    WHEN bucket <= 10 THEN 'sale'
    WHEN bucket <= 16 THEN 'rent'
    WHEN bucket = 17 THEN 'auction'
    WHEN bucket = 18 THEN 'open_house'
    ELSE 'new_build'
  END::public.listing_type,
  'active',
  CASE WHEN bucket = 17 THEN now() + ((15 + i % 180) || ' days')::interval END,
  CASE WHEN bucket = 17 THEN 50000 + (i % 50) * 10000 END,
  CASE WHEN bucket = 18 THEN now() + ((1 + i % 45) || ' days')::interval END,
  CASE WHEN bucket = 18 THEN CASE WHEN i % 2 = 0 THEN 'rent' ELSE 'sale' END END,
  i % 3 = 0,
  property_type <> 'land' AND i % 4 <> 0,
  property_type <> 'land' AND i % 2 = 0,
  i % 20 = 0,
  i % 500,
  50 + (i % 50),
  ARRAY[${tagSql}, 'synthetic', lower(city)],
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70',
  now() - ((i % 365) || ' days')::interval - ((i % 1440) || ' minutes')::interval,
  now() - ((i % 90) || ' days')::interval,
  false,
  CASE WHEN bucket = 19 THEN 'under_construction' END
FROM generated;

INSERT INTO public.listing_images (listing_id, url, sort_order)
SELECT
  ${deterministicUuidSql(`${tagSql} || ':listing:' || i::text`)},
  CASE WHEN image_number = 1
    THEN 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70'
    ELSE 'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?auto=format&fit=crop&w=1200&q=70'
  END,
  image_number - 1
FROM generate_series(1, ${targetCount}) AS listing_series(i)
CROSS JOIN generate_series(1, 2) AS image_series(image_number);

INSERT INTO public.project_units (
  project_id, unit_id, floor, unit_number, availability_status, internal_sqm,
  balcony_sqm, bedrooms, bathrooms, price, price_per_sqm, vat_included,
  energy_class, listing_id
)
SELECT
  ${deterministicUuidSql(`${tagSql} || ':project:' || project_number::text`)},
  'U' || unit_number,
  (unit_number - 1) / 2,
  project_number || '-' || unit_number,
  CASE WHEN unit_number = 6 THEN 'reserved' ELSE 'available' END,
  48 + project_number % 80 + unit_number * 7,
  6 + unit_number * 2,
  1 + unit_number % 4,
  1 + unit_number % 2,
  (48 + project_number % 80 + unit_number * 7) * (3000 + project_number % 3500),
  3000 + project_number % 3500,
  true,
  'A+',
  CASE WHEN unit_number = 1
    THEN ${deterministicUuidSql(`${tagSql} || ':listing:' || (project_number * 20)::text`)}
  END
FROM generate_series(1, ${projectCount}) AS project_series(project_number)
CROSS JOIN generate_series(1, 6) AS unit_series(unit_number);

INSERT INTO public.project_media (project_id, url, media_type, title, sort_order)
SELECT
  ${deterministicUuidSql(`${tagSql} || ':project:' || i::text`)},
  'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?auto=format&fit=crop&w=1200&q=70',
  'rendering',
  'ECAS project rendering',
  0
FROM generate_series(1, ${projectCount}) AS series(i);

ALTER TABLE public.listings DISABLE TRIGGER trg_featured_listing_notify;

INSERT INTO public.listing_promotion_allocations (
  listing_id, owner_id, promotion_type, source_type, status, request_key,
  starts_at, ends_at, listing_snapshot, owner_snapshot
)
SELECT
  ${deterministicUuidSql(`${tagSql} || ':listing:' || i::text`)},
  '942130d0-c41c-4cde-8664-34c00cac32fb'::uuid,
  CASE WHEN i % 100 = 1 THEN 'spotlight' ELSE 'priority' END,
  'admin',
  'active',
  ${tagSql} || ':promotion:' || i,
  now() - ((i % 20) || ' days')::interval,
  now() + ((10 + i % 20) || ' days')::interval,
  jsonb_build_object('synthetic', true, 'load_tag', ${tagSql}),
  jsonb_build_object('synthetic', true)
FROM generate_series(1, ${targetCount}) AS series(i)
WHERE i % 100 IN (1, 2);

ALTER TABLE public.listings ENABLE TRIGGER trg_featured_listing_notify;

ANALYZE public.listings;
ANALYZE public.listing_images;
ANALYZE public.projects;
ANALYZE public.project_units;
ANALYZE public.listing_promotion_allocations;

DO $verify$
DECLARE
  listing_count integer;
  project_count integer;
  image_count integer;
  promotion_count integer;
BEGIN
  SELECT count(*) INTO listing_count FROM public.listings WHERE ${tagSql} = ANY(tags);
  SELECT count(*) INTO project_count FROM public.projects WHERE description = ${tagSql};
  SELECT count(*) INTO image_count
  FROM public.listing_images AS image
  JOIN public.listings AS listing ON listing.id = image.listing_id
  WHERE ${tagSql} = ANY(listing.tags);
  SELECT count(*) INTO promotion_count
  FROM public.listing_promotion_allocations
  WHERE request_key LIKE ${tagSql} || ':%';

  IF listing_count <> ${targetCount}
     OR project_count <> ${projectCount}
     OR image_count <> ${targetCount * 2}
     OR promotion_count <> ${targetCount / 50} THEN
    RAISE EXCEPTION 'staging_dataset_count_mismatch listings=% projects=% images=% promotions=%',
      listing_count, project_count, image_count, promotion_count;
  END IF;
END
$verify$;

COMMIT;

SELECT
  count(*) FILTER (WHERE listing_type = 'sale') AS sale,
  count(*) FILTER (WHERE listing_type = 'rent') AS rent,
  count(*) FILTER (WHERE listing_type = 'auction') AS auctions,
  count(*) FILTER (WHERE listing_type = 'open_house') AS open_houses,
  count(*) FILTER (WHERE listing_type = 'new_build') AS new_builds,
  count(*) FILTER (WHERE is_featured) AS spotlight,
  count(*) FILTER (WHERE priority_placement > 0) AS priority
FROM public.listings
WHERE ${tagSql} = ANY(tags);
`;
}

export function runStagingDataset(options = {}) {
  const validation = validateStagingDatasetConfig(options);
  if (!validation.ok) return validation;

  const { action, tag, targetCount, databaseUrl } = validation.config;
  const sql = action === 'cleanup'
    ? buildCleanupSql(tag)
    : action === 'cleanup-all'
      ? buildCleanupAllSql()
      : buildSeedSql({ tag, targetCount });
  const run = spawnSync('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '--no-psqlrc'], {
    input: sql,
    encoding: 'utf8',
    env: process.env,
    maxBuffer: 16 * 1024 * 1024,
  });

  return {
    ...validation,
    ok: run.status === 0,
    status: run.status,
    stdout: run.stdout,
    stderr: run.stderr,
  };
}

function main() {
  const result = runStagingDataset();
  if (!result.ok) {
    for (const failure of result.failures ?? []) process.stderr.write(`${failure}\n`);
    if (result.stderr) process.stderr.write(result.stderr);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(result.stdout || `Completed ${result.config.action} for ${result.config.tag}.\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main();
