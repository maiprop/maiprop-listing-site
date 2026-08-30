import { writeFileSync } from "node:fs";
import { runCatalogueSql } from "./catalogue-hotfix-behavioral-probe.mjs";

const INTEGER_FIELDS = [
  "eligible_active_listings",
  "auction_listings",
  "auction_rows_without_tag",
  "auction_rows_with_multiple_tags",
  "invalid_tag_rows",
  "placeholder_tag_rows",
  "duplicate_tag_groups",
  "duplicate_tag_rows",
  "duplicate_placeholder_groups",
  "duplicate_nonplaceholder_groups",
  "max_duplicate_multiplicity",
  "all_os_source_rows",
  "all_os_source_rows_with_invalid_identity",
  "all_os_source_invalid_non_auction_rows",
  "all_os_source_invalid_auction_rows_without_identity",
  "all_os_source_invalid_auction_rows_with_multiple_identities",
  "all_os_source_invalid_auction_rows_with_placeholder_identity",
  "all_os_source_invalid_auction_rows_with_malformed_identity",
  "all_os_source_invalid_rows_with_owner",
  "all_os_source_invalid_rows_with_active_promotion",
  "all_os_identity_rows",
  "all_os_identity_rows_with_owner",
  "quarantine_candidate_rows",
  "quarantine_candidates_with_owner",
  "quarantine_candidates_with_active_promotion",
];

const REQUIRED_KEYS = [
  "schema_version",
  "kind",
  ...INTEGER_FIELDS,
].sort();

function fail(message) {
  throw new Error(message);
}

export function buildCatalogueSourceQualitySql() {
  return `
WITH source AS (
  SELECT
    listing.id AS listing_id,
    listing.listing_type::text AS listing_type,
    CASE
      WHEN listing.listing_type::text <> 'auction' THEN NULL
      ELSE (
        SELECT substr(tag.value, length('os_auction:') + 1)
        FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
        WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
        ORDER BY tag.value
        LIMIT 1
      )
    END AS os_tag,
    CASE
      WHEN listing.listing_type::text <> 'auction' THEN 0
      ELSE (
        SELECT count(*)::integer
        FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
        WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
      )
    END AS os_tag_count
  FROM public.listings AS listing
  WHERE listing.status = 'active'
    AND COALESCE(listing.is_off_market, false) = false
    AND listing.created_at <= date_trunc('minute', clock_timestamp())
    AND lower(
      concat_ws(
        ' ',
        COALESCE(listing.title, ''),
        COALESCE(listing.address, ''),
        COALESCE(listing.tags::text, '')
      )
    ) !~ '(supervisor-[0-9]+|e2e-full-publish|qa-full-publish|devin test|test free listing)'
), duplicate_groups AS (
  SELECT
    source.os_tag,
    count(*)::bigint AS multiplicity,
    lower(btrim(source.os_tag)) IN (
      'unknown', 'null', 'undefined', 'none', 'n/a', 'na'
    ) AS placeholder
  FROM source
  WHERE source.listing_type = 'auction'
    AND source.os_tag IS NOT NULL
  GROUP BY source.os_tag
  HAVING count(*) > 1
), listing_identity AS (
  SELECT
    listing.id AS listing_id,
    listing.owner_id,
    listing.listing_type,
    listing.status,
    listing.updated_at,
    listing.created_at,
    COALESCE(listing.tags, '{}'::text[]) AS tags,
    identity.tag_count AS provider_tag_count,
    identity.provider_id AS observed_provider_id,
    CASE
      WHEN identity.tag_count = 1
        AND identity.provider_id ~ '^[a-z0-9:_-]{1,120}$'
        AND identity.provider_id NOT IN ('unknown', 'null', 'undefined', 'none', 'na', 'n/a')
      THEN identity.provider_id
      ELSE NULL
    END AS provider_id
  FROM public.listings AS listing
  CROSS JOIN LATERAL (
    SELECT
      count(*)::integer AS tag_count,
      min(normalized.value) AS provider_id
    FROM (
      SELECT lower(btrim(substr(tag.value, length('os_auction:') + 1))) AS value
      FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
      WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
    ) AS normalized
  ) AS identity
), all_os_source_rows AS (
  SELECT
    identity.listing_id,
    identity.owner_id,
    identity.listing_type,
    identity.provider_tag_count,
    identity.observed_provider_id,
    identity.provider_id,
    identity.tags @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[] AS quarantined
  FROM listing_identity AS identity
  WHERE identity.tags @> ARRAY['source:maiprop-os']::text[]
), invalid_os_source_rows AS (
  SELECT
    os_source.listing_id,
    os_source.owner_id,
    CASE
      WHEN os_source.listing_type <> 'auction'::public.listing_type
        THEN 'non_auction'
      WHEN os_source.provider_tag_count = 0
        THEN 'missing_identity'
      WHEN os_source.provider_tag_count > 1
        THEN 'multiple_identities'
      WHEN os_source.observed_provider_id IN (
        'unknown', 'null', 'undefined', 'none', 'na', 'n/a'
      ) THEN 'placeholder_identity'
      ELSE 'malformed_identity'
    END AS invalid_reason
  FROM all_os_source_rows AS os_source
  WHERE NOT os_source.quarantined
    AND (
      os_source.listing_type <> 'auction'::public.listing_type
      OR os_source.provider_id IS NULL
    )
), ranked_os_rows AS (
  SELECT
    identity.listing_id,
    identity.owner_id,
    row_number() OVER (
      PARTITION BY identity.provider_id
      ORDER BY
        CASE WHEN identity.status = 'active'::public.listing_status THEN 1 ELSE 0 END DESC,
        identity.updated_at DESC,
        identity.created_at DESC,
        identity.listing_id DESC
    ) AS identity_rank
  FROM listing_identity AS identity
  WHERE identity.listing_type = 'auction'::public.listing_type
    AND identity.provider_id IS NOT NULL
), quarantine_candidates AS (
  SELECT ranked.listing_id, ranked.owner_id
  FROM ranked_os_rows AS ranked
  WHERE ranked.identity_rank > 1
)
SELECT json_build_object(
  'schema_version', 2,
  'kind', 'maiprop-catalogue-source-quality',
  'eligible_active_listings', (SELECT count(*) FROM source),
  'auction_listings', (SELECT count(*) FROM source WHERE listing_type = 'auction'),
  'auction_rows_without_tag', (SELECT count(*) FROM source WHERE listing_type = 'auction' AND os_tag_count = 0),
  'auction_rows_with_multiple_tags', (SELECT count(*) FROM source WHERE listing_type = 'auction' AND os_tag_count > 1),
  'invalid_tag_rows', (
    SELECT count(*) FROM source
    WHERE listing_type = 'auction'
      AND os_tag IS NOT NULL
      AND (length(os_tag) > 120 OR os_tag !~ '^[A-Za-z0-9:_-]+$')
  ),
  'placeholder_tag_rows', (
    SELECT count(*) FROM source
    WHERE listing_type = 'auction'
      AND lower(btrim(os_tag)) IN ('unknown', 'null', 'undefined', 'none', 'n/a', 'na')
  ),
  'duplicate_tag_groups', (SELECT count(*) FROM duplicate_groups),
  'duplicate_tag_rows', COALESCE((SELECT sum(multiplicity) FROM duplicate_groups), 0),
  'duplicate_placeholder_groups', (SELECT count(*) FROM duplicate_groups WHERE placeholder),
  'duplicate_nonplaceholder_groups', (SELECT count(*) FROM duplicate_groups WHERE NOT placeholder),
  'max_duplicate_multiplicity', COALESCE((SELECT max(multiplicity) FROM duplicate_groups), 0),
  'all_os_source_rows', (SELECT count(*) FROM all_os_source_rows),
  'all_os_source_rows_with_invalid_identity', (SELECT count(*) FROM invalid_os_source_rows),
  'all_os_source_invalid_non_auction_rows', (
    SELECT count(*) FROM invalid_os_source_rows WHERE invalid_reason = 'non_auction'
  ),
  'all_os_source_invalid_auction_rows_without_identity', (
    SELECT count(*) FROM invalid_os_source_rows WHERE invalid_reason = 'missing_identity'
  ),
  'all_os_source_invalid_auction_rows_with_multiple_identities', (
    SELECT count(*) FROM invalid_os_source_rows WHERE invalid_reason = 'multiple_identities'
  ),
  'all_os_source_invalid_auction_rows_with_placeholder_identity', (
    SELECT count(*) FROM invalid_os_source_rows WHERE invalid_reason = 'placeholder_identity'
  ),
  'all_os_source_invalid_auction_rows_with_malformed_identity', (
    SELECT count(*) FROM invalid_os_source_rows WHERE invalid_reason = 'malformed_identity'
  ),
  'all_os_source_invalid_rows_with_owner', (
    SELECT count(*) FROM invalid_os_source_rows WHERE owner_id IS NOT NULL
  ),
  'all_os_source_invalid_rows_with_active_promotion', (
    SELECT count(*)
    FROM invalid_os_source_rows AS invalid_source
    WHERE EXISTS (
      SELECT 1
      FROM public.listing_promotion_allocations AS allocation
      WHERE allocation.listing_id = invalid_source.listing_id
        AND allocation.ends_at > statement_timestamp()
        AND allocation.revoked_at IS NULL
    )
  ),
  'all_os_identity_rows', (SELECT count(*) FROM ranked_os_rows),
  'all_os_identity_rows_with_owner', (
    SELECT count(*)
    FROM ranked_os_rows AS os_identity
    WHERE os_identity.owner_id IS NOT NULL
  ),
  'quarantine_candidate_rows', (SELECT count(*) FROM quarantine_candidates),
  'quarantine_candidates_with_owner', (
    SELECT count(*) FROM quarantine_candidates WHERE owner_id IS NOT NULL
  ),
  'quarantine_candidates_with_active_promotion', (
    SELECT count(*)
    FROM quarantine_candidates AS candidate
    WHERE EXISTS (
      SELECT 1
      FROM public.listing_promotion_allocations AS allocation
      WHERE allocation.listing_id = candidate.listing_id
        AND allocation.ends_at > statement_timestamp()
        AND allocation.revoked_at IS NULL
    )
  )
);`;
}

export function validateCatalogueSourceQuality(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    fail("Catalogue source-quality result has an invalid schema.");
  }
  const keys = Object.keys(value).sort();
  if (keys.length !== REQUIRED_KEYS.length || keys.some((key, index) => key !== REQUIRED_KEYS[index])) {
    fail("Catalogue source-quality result has an invalid schema.");
  }
  if (value.schema_version !== 2 || value.kind !== "maiprop-catalogue-source-quality") {
    fail("Catalogue source-quality result has an invalid schema.");
  }
  for (const field of INTEGER_FIELDS) {
    if (!Number.isSafeInteger(value[field]) || value[field] < 0) {
      fail(`Catalogue source-quality field ${field} must be a nonnegative safe integer.`);
    }
  }
  if (
    value.auction_listings > value.eligible_active_listings ||
    value.auction_rows_without_tag > value.auction_listings ||
    value.auction_rows_with_multiple_tags > value.auction_listings ||
    value.invalid_tag_rows > value.auction_listings ||
    value.placeholder_tag_rows > value.auction_listings ||
    value.duplicate_placeholder_groups + value.duplicate_nonplaceholder_groups !== value.duplicate_tag_groups ||
    (value.duplicate_tag_groups === 0 && (value.duplicate_tag_rows !== 0 || value.max_duplicate_multiplicity !== 0)) ||
    value.all_os_source_rows_with_invalid_identity > value.all_os_source_rows ||
    value.all_os_source_invalid_non_auction_rows +
      value.all_os_source_invalid_auction_rows_without_identity +
      value.all_os_source_invalid_auction_rows_with_multiple_identities +
      value.all_os_source_invalid_auction_rows_with_placeholder_identity +
      value.all_os_source_invalid_auction_rows_with_malformed_identity !==
        value.all_os_source_rows_with_invalid_identity ||
    value.all_os_source_invalid_rows_with_owner > value.all_os_source_rows_with_invalid_identity ||
    value.all_os_source_invalid_rows_with_active_promotion > value.all_os_source_rows_with_invalid_identity ||
    value.quarantine_candidate_rows > value.all_os_identity_rows ||
    value.all_os_identity_rows_with_owner > value.all_os_identity_rows ||
    value.quarantine_candidates_with_owner > value.quarantine_candidate_rows ||
    value.quarantine_candidates_with_active_promotion > value.quarantine_candidate_rows ||
    (value.duplicate_tag_groups > 0 && (
      value.duplicate_tag_rows < value.duplicate_tag_groups * 2 ||
      value.max_duplicate_multiplicity < 2 ||
      value.max_duplicate_multiplicity > value.duplicate_tag_rows
    ))
  ) {
    fail("Catalogue source-quality aggregate counts are inconsistent.");
  }
  if (
    value.all_os_source_rows_with_invalid_identity > 1 ||
    value.all_os_source_invalid_rows_with_owner > 0 ||
    value.all_os_source_invalid_rows_with_active_promotion > 0
  ) {
    fail(
      "Catalogue all-status OS source identity contract is invalid or exceeds the one-row remediation cap: " +
        JSON.stringify({
          non_auction_rows: value.all_os_source_invalid_non_auction_rows,
          auction_rows_without_identity:
            value.all_os_source_invalid_auction_rows_without_identity,
          auction_rows_with_multiple_identities:
            value.all_os_source_invalid_auction_rows_with_multiple_identities,
          auction_rows_with_placeholder_identity:
            value.all_os_source_invalid_auction_rows_with_placeholder_identity,
          auction_rows_with_malformed_identity:
            value.all_os_source_invalid_auction_rows_with_malformed_identity,
          rows_with_owner: value.all_os_source_invalid_rows_with_owner,
          rows_with_active_promotion:
            value.all_os_source_invalid_rows_with_active_promotion,
        }),
    );
  }
  if (value.all_os_identity_rows_with_owner > 0) {
    fail("OS identity rows must not have owners.");
  }
  if (
    value.quarantine_candidates_with_owner > 0 ||
    value.quarantine_candidates_with_active_promotion > 0
  ) {
    fail("Catalogue source-quality repair candidates require manual ownership or promotion review.");
  }
  return Object.freeze({ ...value });
}

export async function runCatalogueSourceQualityProbe(
  { databaseUrl, outputPath },
  dependencies = {},
) {
  if (!databaseUrl) fail("Catalogue source-quality database target is missing.");
  const psql = dependencies.psql ?? ((query) => runCatalogueSql(query, databaseUrl));
  const writeFile = dependencies.writeFile ?? writeFileSync;
  let parsed;
  try {
    parsed = JSON.parse(String(await psql(buildCatalogueSourceQualitySql())).trim());
  } catch (error) {
    if (error instanceof SyntaxError) fail("Catalogue source-quality query did not return valid JSON.");
    throw error;
  }
  const result = validateCatalogueSourceQuality(parsed);
  if (outputPath) writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
  return result;
}

export function requireZeroInvalidCatalogueSourceQuality(value) {
  const result = validateCatalogueSourceQuality(value);
  if (result.all_os_source_rows_with_invalid_identity !== 0) {
    fail("Catalogue postapply source-quality contract still has eligible invalid OS source rows.");
  }
  return result;
}

async function main() {
  const [option] = process.argv.slice(2);
  if (option && option !== "--require-zero-invalid") {
    fail("Catalogue source-quality probe option is invalid.");
  }
  const result = await runCatalogueSourceQualityProbe({
    databaseUrl: process.env.TARGET_DB_URL,
  });
  const certified = option === "--require-zero-invalid"
    ? requireZeroInvalidCatalogueSourceQuality(result)
    : result;
  process.stdout.write(`${JSON.stringify(certified)}\n`);
}

if (process.argv[1]?.endsWith("catalogue-hotfix-source-quality-probe.mjs")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
