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
        WHERE tag.value LIKE 'os_auction:%'
        ORDER BY tag.value
        LIMIT 1
      )
    END AS os_tag,
    CASE
      WHEN listing.listing_type::text <> 'auction' THEN 0
      ELSE (
        SELECT count(*)::integer
        FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value)
        WHERE tag.value LIKE 'os_auction:%'
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
)
SELECT json_build_object(
  'schema_version', 1,
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
  'max_duplicate_multiplicity', COALESCE((SELECT max(multiplicity) FROM duplicate_groups), 0)
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
  if (value.schema_version !== 1 || value.kind !== "maiprop-catalogue-source-quality") {
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
    (value.duplicate_tag_groups > 0 && (
      value.duplicate_tag_rows < value.duplicate_tag_groups * 2 ||
      value.max_duplicate_multiplicity < 2 ||
      value.max_duplicate_multiplicity > value.duplicate_tag_rows
    ))
  ) {
    fail("Catalogue source-quality aggregate counts are inconsistent.");
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

async function main() {
  const [outputPath] = process.argv.slice(2);
  const result = await runCatalogueSourceQualityProbe({
    databaseUrl: process.env.TARGET_DB_URL,
    outputPath,
  });
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (process.argv[1]?.endsWith("catalogue-hotfix-source-quality-probe.mjs")) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
