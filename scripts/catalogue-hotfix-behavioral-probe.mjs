import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  selectCatalogueProbeContext,
  validateCatalogueBehaviorProbe,
  validateDatabaseContract,
} from "./catalogue-hotfix-workflow-helpers.mjs";

const QUARANTINE_VERSION = "20260728115959";
const PREPARATION_VERSION = "20260728115960";
const BRIDGE_VERSION = "20260728120000";
const REPAIR_VERSION = "20260728121500";
const CATALOGUE_VERSION = "20260728123058";
const HARDENING_VERSION = "20260729120405";
const HOTFIX_VERSIONS = [
  QUARANTINE_VERSION,
  PREPARATION_VERSION,
  BRIDGE_VERSION,
  REPAIR_VERSION,
  CATALOGUE_VERSION,
  HARDENING_VERSION,
];
const LEGACY_FULL_VERSIONS = [
  QUARANTINE_VERSION,
  BRIDGE_VERSION,
  REPAIR_VERSION,
  CATALOGUE_VERSION,
  HARDENING_VERSION,
];
const HOTFIX_VERSION_SQL = HOTFIX_VERSIONS.map((version) => `'${version}'`).join(",");
const TYPED_SIGNATURE = "public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamp with time zone,numeric,uuid,boolean,integer,integer,jsonb)";
const AUCTION_SIGNATURE = "public.get_public_catalogue_auctions(bigint,uuid[],text)";
const MISSING_AUCTION_ID = "00000000-0000-0000-0000-000000000000";
const OS_IDENTITY_COMPONENT_KEYS = [
  "duplicate_quarantine_relation",
  "duplicate_quarantine_acl",
  "extractor_owner",
  "extractor_posture",
  "extractor_body",
  "extractor_acl",
  "generated_column",
  "unique_index",
  "source_check",
  "stored_parity",
];
const PREPARATION_BOOLEAN_FIELDS = [
  "duplicate_preparation_contract",
  "duplicate_preparation_ledger_contract",
  "duplicate_preparation_acl_contract",
  "duplicate_preparation_generated_column",
  "duplicate_preparation_unique_index",
  "duplicate_preparation_source_check",
  "duplicate_preparation_live_recoverable_contract",
];
const PREPARATION_COUNT_FIELDS = [
  "duplicate_preparation_remaining_candidates",
  "duplicate_preparation_owner_guard_rows",
  "duplicate_preparation_active_promotion_rows",
  "duplicate_preparation_ledger_rows",
  "duplicate_preparation_live_marker_rows",
];
const PREPARATION_EVIDENCE_FIELDS = [
  ...PREPARATION_BOOLEAN_FIELDS,
  ...PREPARATION_COUNT_FIELDS,
];
const PREPARATION_FAILED_INVARIANTS = new Set([
  ...PREPARATION_EVIDENCE_FIELDS,
  "duplicate_preparation_ledger_rows_match_live_marker_rows",
  "duplicate_preparation_quarantine_contract",
]);

function fail(message) {
  throw new Error(message);
}

function parseJson(text, label) {
  try {
    return JSON.parse(String(text).trim());
  } catch {
    fail(`${label} did not return valid JSON.`);
  }
}

export async function runCatalogueSql(query, databaseUrl, spawnImpl = spawnSync) {
  const result = spawnImpl(
    "psql",
    [
      databaseUrl,
      "--no-psqlrc",
      "--set",
      "ON_ERROR_STOP=1",
      "--set",
      "VERBOSITY=sqlstate",
      "-qAt",
      "--command",
      "SET ROLE postgres",
      "--command",
      query,
    ],
    { encoding: "utf8", maxBuffer: 10 * 1024 * 1024 },
  );
  if (result.status !== 0) {
    const sqlstate = String(result.stderr ?? "").match(/\b(?:ERROR|FATAL):\s+([0-9A-Z]{5})\b/)?.[1];
    fail(sqlstate
      ? `Database behavioral contract query failed with SQLSTATE ${sqlstate}.`
      : `Database behavioral contract query failed with exit ${result.status ?? "unknown"}.`);
  }
  return result.stdout.trim();
}

async function fetchJson(fetchImpl, url, options, label) {
  const response = await fetchImpl(url, options);
  if (![200, 206].includes(response.status)) {
    fail(`${label} returned HTTP ${response.status}.`);
  }
  try {
    return await response.json();
  } catch {
    fail(`${label} did not return JSON.`);
  }
}

function rpcUrl(apiUrl, name, params = null) {
  const url = new URL(`/rest/v1/rpc/${name}`, apiUrl);
  if (params) {
    for (const [key, value] of params) url.searchParams.append(key, value);
  }
  return url;
}

function anonHeaders(key, json = false) {
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Accept: "application/json",
    ...(json ? { "Content-Type": "application/json" } : {}),
  };
}

function metadataSql(includeQuarantine, includeIdentity, requireExactPrefix) {
  return `
SELECT json_build_object(
  'migration_versions', COALESCE((SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_VERSION_SQL})), '[]'::json),
  'private_catalogue_tables', to_regclass('private.public_catalogue_publications') IS NOT NULL AND to_regclass('private.public_catalogue_current') IS NOT NULL AND to_regclass('private.public_catalogue_versions') IS NOT NULL,
  'private_catalogue_rls_enabled', COALESCE((SELECT bool_and(relrowsecurity) FROM pg_class WHERE oid IN ('private.public_catalogue_publications'::regclass,'private.public_catalogue_current'::regclass,'private.public_catalogue_versions'::regclass)), false),
  'private_catalogue_rls_forced', COALESCE((SELECT bool_or(relforcerowsecurity) FROM pg_class WHERE oid IN ('private.public_catalogue_publications'::regclass,'private.public_catalogue_current'::regclass,'private.public_catalogue_versions'::regclass)), false),
  'private_catalogue_no_direct_privileges', NOT EXISTS (SELECT 1 FROM pg_class AS relation CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl,acldefault('r',relation.relowner))) AS privilege WHERE relation.oid IN ('private.public_catalogue_publications'::regclass,'private.public_catalogue_current'::regclass,'private.public_catalogue_versions'::regclass) AND privilege.grantee IN (0,(SELECT oid FROM pg_roles WHERE rolname='anon'),(SELECT oid FROM pg_roles WHERE rolname='authenticated'))),
  'first_indexes', to_regclass('private.idx_public_catalogue_publications_retention') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_current_listing') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_current_os_tag') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_os_tag_publication') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_newest') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_price_asc') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_price_desc') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_ai_score') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_views') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_open_house') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_type_property') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_location') IS NOT NULL AND to_regclass('private.idx_public_catalogue_versions_features') IS NOT NULL,
  'legacy_rpc', to_regprocedure('public.get_public_listing_catalogue(timestamp with time zone)') IS NOT NULL,
  'publication_rpc', to_regprocedure('public.get_public_catalogue_publication(bigint)') IS NOT NULL,
  'typed_rpc', to_regprocedure('${TYPED_SIGNATURE}') IS NOT NULL,
  'anon_legacy_execute', has_function_privilege('anon','public.get_public_listing_catalogue(timestamp with time zone)','EXECUTE'),
  'anon_publication_execute', has_function_privilege('anon','public.get_public_catalogue_publication(bigint)','EXECUTE'),
  'anon_typed_execute', has_function_privilege('anon','${TYPED_SIGNATURE}','EXECUTE'),
  'auction_rpc', to_regprocedure('${AUCTION_SIGNATURE}') IS NOT NULL,
  'homepage_rpc', to_regprocedure('public.get_public_catalogue_homepage(bigint)') IS NOT NULL,
  'homepage_retain_until_contract', COALESCE(pg_get_function_result(to_regprocedure('public.get_public_catalogue_homepage(bigint)')) = 'TABLE(publication_id bigint, published_at timestamp with time zone, retain_until timestamp with time zone, payload jsonb)', false),
  'anon_auction_execute', COALESCE(has_function_privilege('anon', to_regprocedure('${AUCTION_SIGNATURE}'), 'EXECUTE'), false),
  'anon_homepage_execute', COALESCE(has_function_privilege('anon', to_regprocedure('public.get_public_catalogue_homepage(bigint)'), 'EXECUTE'), false),
  'auction_index', to_regclass('private.idx_public_catalogue_versions_auction_listing_publication') IS NOT NULL,
  ${quarantineMetadataFieldsSql(includeQuarantine)},
  ${osIdentityMetadataFieldsSql(includeIdentity, requireExactPrefix)}
);`;
}

function quarantineMetadataFieldsSql(includeQuarantine) {
  if (!includeQuarantine) return `
  'invalid_identity_quarantine_contract', false,
  'eligible_invalid_os_source_rows', 0,
  'invalid_identity_quarantine_rows', 0,
  'invalid_identity_quarantine_marked_rows', 0,
  'invalid_identity_quarantine_live_contract', false`;
  return `
  'invalid_identity_quarantine_contract', ${invalidIdentityQuarantineContractSql()},
  'eligible_invalid_os_source_rows', ${eligibleInvalidOsSourceRowsSql()},
  'invalid_identity_quarantine_rows', (SELECT count(*) FROM private.os_auction_invalid_identity_quarantine),
  'invalid_identity_quarantine_marked_rows', (
    SELECT count(*) FROM public.listings AS listing
    WHERE COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os-invalid-identity-quarantine']::text[]
  ),
  'invalid_identity_quarantine_live_contract', ${invalidIdentityQuarantineLiveContractSql()}`;
}

function bridgeResidueMetadataFieldsSql() {
  return `
  'bridge_residue_duplicate_quarantine_relation', to_regclass('private.os_auction_duplicate_quarantine') IS NOT NULL,
  'bridge_residue_generated_column', EXISTS (
    SELECT 1
    FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.listings'::regclass
      AND attribute.attname = 'os_auction_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  ),
  'bridge_residue_unique_index', to_regclass('public.idx_listings_os_auction_id_unique') IS NOT NULL,
  'bridge_residue_source_check', EXISTS (
    SELECT 1
    FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.listings'::regclass
      AND constraint_definition.conname = 'listings_os_auction_source_identity_valid'
  ),
  'bridge_residue_duplicate_marker_rows', (
    SELECT count(*)
    FROM public.listings AS listing
    WHERE COALESCE(listing.tags, '{}'::text[])
      @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
  )`;
}

function duplicatePreparationLedgerContractSql() {
  return `
    to_regclass('private.os_auction_duplicate_quarantine') IS NOT NULL
    AND COALESCE((
      SELECT relation.relkind = 'r'
        AND relation.relpersistence = 'p'
        AND NOT relation.relrowsecurity
        AND NOT relation.relforcerowsecurity
        AND pg_get_userbyid(relation.relowner) = 'postgres'
      FROM pg_class AS relation
      WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine')
    ), false)
    AND 7 = (
      SELECT count(*)
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    )
    AND 5 = (
      SELECT count(*)
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_duplicate_quarantine')
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum = 1 AND attribute.attname = 'duplicate_listing_id'
        AND attribute.atttypid = 'uuid'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum = 2 AND attribute.attname = 'canonical_listing_id'
        AND attribute.atttypid = 'uuid'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum = 3 AND attribute.attname = 'provider_id'
        AND attribute.atttypid = 'text'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum = 4 AND attribute.attname = 'previous_status'
        AND attribute.atttypid = 'public.listing_status'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum = 5 AND attribute.attname = 'previous_tags'
        AND attribute.atttypid = 'text[]'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_attrdef AS definition
        ON definition.adrelid = attribute.attrelid AND definition.adnum = attribute.attnum
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum = 6 AND attribute.attname = 'quarantined_at'
        AND attribute.atttypid = 'timestamp with time zone'::regtype AND attribute.attnotnull
        AND pg_get_expr(definition.adbin, definition.adrelid) = 'statement_timestamp()'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_attrdef AS definition
        ON definition.adrelid = attribute.attrelid AND definition.adnum = attribute.attnum
      WHERE attribute.attrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND attribute.attnum = 7 AND attribute.attname = 'reason'
        AND attribute.atttypid = 'text'::regtype AND attribute.attnotnull
        AND pg_get_expr(definition.adbin, definition.adrelid)
          = '''duplicate_os_auction_identity''::text'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND constraint_definition.contype = 'p'
        AND constraint_definition.convalidated
        AND constraint_definition.conkey = ARRAY[1]::smallint[]
    )
    AND 2 = (
      SELECT count(*)
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND constraint_definition.contype = 'f'
        AND constraint_definition.convalidated
        AND constraint_definition.confrelid = 'public.listings'::regclass
        AND constraint_definition.confdeltype = 'r'
        AND constraint_definition.confupdtype = 'a'
        AND constraint_definition.confkey = ARRAY[
          (SELECT attribute.attnum FROM pg_attribute AS attribute
           WHERE attribute.attrelid = 'public.listings'::regclass
             AND attribute.attname = 'id')
        ]::smallint[]
        AND constraint_definition.conkey IN (ARRAY[1]::smallint[], ARRAY[2]::smallint[])
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND constraint_definition.contype = 'c'
        AND constraint_definition.convalidated
        AND regexp_replace(pg_get_constraintdef(constraint_definition.oid), '[[:space:]]+', ' ', 'g')
          = 'CHECK ((reason = ''duplicate_os_auction_identity''::text))'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_duplicate_quarantine')
        AND constraint_definition.contype = 'c'
        AND constraint_definition.convalidated
        AND regexp_replace(pg_get_constraintdef(constraint_definition.oid), '[[:space:]]+', ' ', 'g')
          = 'CHECK ((duplicate_listing_id <> canonical_listing_id))'
    )`;
}

function duplicatePreparationAclContractSql() {
  return `
    NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      CROSS JOIN LATERAL aclexplode(
        COALESCE(relation.relacl, acldefault('r', relation.relowner))
      ) AS privilege
      WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine')
        AND privilege.grantee <> relation.relowner
    )`;
}

function duplicatePreparationRemainingCandidatesSql() {
  return `(
    SELECT COALESCE(sum(identity_count - 1), 0)
    FROM (
      SELECT count(*) AS identity_count
      FROM public.listings AS listing
      WHERE listing.listing_type = 'auction'::public.listing_type
        AND private.extract_os_auction_id(listing.tags) IS NOT NULL
      GROUP BY private.extract_os_auction_id(listing.tags)
      HAVING count(*) > 1
    ) AS duplicates
  )`;
}

function duplicatePreparationLiveRecoverableContractSql() {
  return `
    NOT EXISTS (
      SELECT 1
      FROM private.os_auction_duplicate_quarantine AS quarantine
      LEFT JOIN public.listings AS listing
        ON listing.id = quarantine.duplicate_listing_id
      LEFT JOIN public.listings AS canonical
        ON canonical.id = quarantine.canonical_listing_id
      LEFT JOIN LATERAL (
        SELECT tag.value AS original_os_tag
        FROM unnest(quarantine.previous_tags) AS tag(value)
        WHERE left(tag.value, length('os_auction:')) = 'os_auction:'
        ORDER BY tag.value
        LIMIT 1
      ) AS original ON true
      WHERE listing.id IS NULL
        OR canonical.id IS NULL
        OR listing.owner_id IS NOT NULL
        OR private.extract_os_auction_id(quarantine.previous_tags)
          IS DISTINCT FROM quarantine.provider_id
        OR private.extract_os_auction_id(canonical.tags)
          IS DISTINCT FROM quarantine.provider_id
        OR listing.status IS DISTINCT FROM CASE
          WHEN quarantine.previous_status = 'active'::public.listing_status
            THEN 'paused'::public.listing_status
          ELSE quarantine.previous_status
        END
        OR listing.tags IS DISTINCT FROM CASE
          WHEN array_replace(
            quarantine.previous_tags,
            original.original_os_tag,
            'os_auction_duplicate:' || quarantine.provider_id
          ) @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
            THEN array_replace(
              quarantine.previous_tags,
              original.original_os_tag,
              'os_auction_duplicate:' || quarantine.provider_id
            )
          ELSE array_replace(
            quarantine.previous_tags,
            original.original_os_tag,
            'os_auction_duplicate:' || quarantine.provider_id
          ) || ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
        END
        OR (
          SELECT count(*)
          FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS marker(value)
          WHERE marker.value = 'source:maiprop-os-duplicate-quarantine'
        ) <> 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE COALESCE(listing.tags, '{}'::text[])
        @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
        AND NOT EXISTS (
          SELECT 1
          FROM private.os_auction_duplicate_quarantine AS quarantine
          WHERE quarantine.duplicate_listing_id = listing.id
        )
    )`;
}

function preparationMetadataSql(allowBridgeArtifacts = false) {
  const ledgerContract = duplicatePreparationLedgerContractSql();
  const aclContract = duplicatePreparationAclContractSql();
  const remainingCandidates = duplicatePreparationRemainingCandidatesSql();
  const ownerGuardRows = `(
    SELECT count(*)
    FROM public.listings AS listing
    WHERE listing.listing_type = 'auction'::public.listing_type
      AND private.extract_os_auction_id(listing.tags) IS NOT NULL
      AND listing.owner_id IS NOT NULL
  )`;
  const activePromotionRows = `(
    SELECT count(*)
    FROM private.os_auction_duplicate_quarantine AS quarantine
    JOIN public.listing_promotion_allocations AS allocation
      ON allocation.listing_id = quarantine.duplicate_listing_id
    WHERE allocation.ends_at > statement_timestamp()
      AND allocation.revoked_at IS NULL
  )`;
  const ledgerRows = `(SELECT count(*) FROM private.os_auction_duplicate_quarantine)`;
  const markerRows = `(
    SELECT count(*)
    FROM public.listings AS listing
    WHERE COALESCE(listing.tags, '{}'::text[])
      @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
  )`;
  const liveContract = duplicatePreparationLiveRecoverableContractSql();
  const noGeneratedColumn = `NOT EXISTS (
    SELECT 1 FROM pg_attribute AS attribute
    WHERE attribute.attrelid = 'public.listings'::regclass
      AND attribute.attname = 'os_auction_id'
      AND attribute.attnum > 0
      AND NOT attribute.attisdropped
  )`;
  const noUniqueIndex = `to_regclass('public.idx_listings_os_auction_id_unique') IS NULL`;
  const noSourceCheck = `NOT EXISTS (
    SELECT 1 FROM pg_constraint AS constraint_definition
    WHERE constraint_definition.conrelid = 'public.listings'::regclass
      AND constraint_definition.conname = 'listings_os_auction_source_identity_valid'
  )`;
  const bridgeArtifactContract = allowBridgeArtifacts
    ? "true"
    : `(${noGeneratedColumn}) AND (${noUniqueIndex}) AND (${noSourceCheck})`;
  return `
WITH preparation AS MATERIALIZED (
  SELECT
    COALESCE((${ledgerContract}), false) AS ledger_contract,
    COALESCE((${aclContract}), false) AS acl_contract,
    COALESCE((${noGeneratedColumn}), false) AS no_generated_column,
    COALESCE((${noUniqueIndex}), false) AS no_unique_index,
    COALESCE((${noSourceCheck}), false) AS no_source_check,
    ${remainingCandidates} AS remaining_candidates,
    ${ownerGuardRows} AS owner_guard_rows,
    ${activePromotionRows} AS active_promotion_rows,
    ${ledgerRows} AS ledger_rows,
    ${markerRows} AS live_marker_rows,
    COALESCE((${liveContract}), false) AS live_recoverable_contract
)
SELECT json_build_object(
  'migration_versions', COALESCE((SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_VERSION_SQL})), '[]'::json),
  ${quarantineMetadataFieldsSql(true)},
  'duplicate_preparation_contract',
    preparation.ledger_contract
    AND preparation.acl_contract
    AND (${bridgeArtifactContract})
    AND preparation.remaining_candidates = 0
    AND preparation.owner_guard_rows = 0
    AND preparation.active_promotion_rows = 0
    AND preparation.ledger_rows = preparation.live_marker_rows
    AND preparation.live_recoverable_contract,
  'duplicate_preparation_ledger_contract', preparation.ledger_contract,
  'duplicate_preparation_acl_contract', preparation.acl_contract,
  'duplicate_preparation_generated_column', NOT preparation.no_generated_column,
  'duplicate_preparation_unique_index', NOT preparation.no_unique_index,
  'duplicate_preparation_source_check', NOT preparation.no_source_check,
  'duplicate_preparation_remaining_candidates', preparation.remaining_candidates,
  'duplicate_preparation_owner_guard_rows', preparation.owner_guard_rows,
  'duplicate_preparation_active_promotion_rows', preparation.active_promotion_rows,
  'duplicate_preparation_ledger_rows', preparation.ledger_rows,
  'duplicate_preparation_live_marker_rows', preparation.live_marker_rows,
  'duplicate_preparation_live_recoverable_contract', preparation.live_recoverable_contract
)
FROM preparation;`;
}

function invalidIdentityQuarantineContractSql() {
  return `
    to_regclass('private.os_auction_invalid_identity_quarantine') IS NOT NULL
    AND COALESCE((
      SELECT relation.relrowsecurity
        AND NOT relation.relforcerowsecurity
        AND relation.relkind = 'r'
        AND relation.relpersistence = 'p'
        AND pg_get_userbyid(relation.relowner) = 'postgres'
      FROM pg_class AS relation
      WHERE relation.oid = to_regclass('private.os_auction_invalid_identity_quarantine')
    ), false)
    AND 5 = (
      SELECT count(*)
      FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND attribute.attnum > 0
        AND NOT attribute.attisdropped
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND attribute.attnum = 1 AND attribute.attname = 'listing_id'
        AND attribute.atttypid = 'uuid'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND attribute.attnum = 2 AND attribute.attname = 'previous_status'
        AND attribute.atttypid = 'public.listing_status'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND attribute.attnum = 3 AND attribute.attname = 'previous_tags'
        AND attribute.atttypid = 'text[]'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_attrdef AS definition
        ON definition.adrelid = attribute.attrelid AND definition.adnum = attribute.attnum
      WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND attribute.attnum = 4 AND attribute.attname = 'quarantined_at'
        AND attribute.atttypid = 'timestamp with time zone'::regtype AND attribute.attnotnull
        AND pg_get_expr(definition.adbin, definition.adrelid) = 'statement_timestamp()'
    )
    AND EXISTS (
      SELECT 1 FROM pg_attribute AS attribute
      WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND attribute.attnum = 5 AND attribute.attname = 'reason'
        AND attribute.atttypid = 'text'::regtype AND attribute.attnotnull
        AND NOT attribute.atthasdef
    )
    AND NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
      WHERE relation.oid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = 'anon'), (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'), (SELECT oid FROM pg_roles WHERE rolname = 'service_role'))
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND constraint_definition.contype = 'p'
        AND constraint_definition.convalidated
        AND constraint_definition.conkey = ARRAY[
          (SELECT attribute.attnum FROM pg_attribute AS attribute
           WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
             AND attribute.attname = 'listing_id')
        ]::smallint[]
    )
    AND 1 = (
      SELECT count(*)
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND constraint_definition.contype = 'f'
        AND constraint_definition.convalidated
        AND constraint_definition.confrelid = 'public.listings'::regclass
        AND constraint_definition.confdeltype = 'r'
        AND constraint_definition.confupdtype = 'a'
        AND constraint_definition.conkey = ARRAY[
          (SELECT attribute.attnum FROM pg_attribute AS attribute
           WHERE attribute.attrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
             AND attribute.attname = 'listing_id')
        ]::smallint[]
        AND constraint_definition.confkey = ARRAY[
          (SELECT attribute.attnum FROM pg_attribute AS attribute
           WHERE attribute.attrelid = 'public.listings'::regclass
             AND attribute.attname = 'id')
        ]::smallint[]
    )
    AND 1 = (
      SELECT count(*)
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND constraint_definition.contype = 'c'
        AND constraint_definition.convalidated
        AND pg_get_constraintdef(constraint_definition.oid) = 'CHECK ((reason = ANY (ARRAY[''non_auction''::text, ''missing_identity''::text, ''multiple_identities''::text, ''placeholder_identity''::text, ''malformed_identity''::text])))'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = to_regclass('private.os_auction_invalid_identity_quarantine')
        AND constraint_definition.contype = 'f'
        AND constraint_definition.confrelid = 'public.listings'::regclass
        AND constraint_definition.confdeltype = 'r'
    )`;
}

function invalidIdentityQuarantineLiveContractSql() {
  return `
    NOT EXISTS (
      SELECT 1
      FROM private.os_auction_invalid_identity_quarantine AS quarantine
      JOIN public.listings AS listing ON listing.id = quarantine.listing_id
      WHERE listing.owner_id IS NOT NULL
        OR listing.status IS DISTINCT FROM CASE
          WHEN quarantine.previous_status = 'active'::public.listing_status
            THEN 'paused'::public.listing_status
          ELSE quarantine.previous_status
        END
        OR listing.tags IS DISTINCT FROM (
          ARRAY(
            SELECT tag.value
            FROM unnest(quarantine.previous_tags) WITH ORDINALITY AS tag(value, ordinal)
            WHERE tag.value <> 'source:maiprop-os'
              AND left(tag.value, length('os_auction:')) <> 'os_auction:'
              AND tag.value <> 'source:maiprop-os-invalid-identity-quarantine'
            ORDER BY tag.ordinal
          ) || ARRAY['source:maiprop-os-invalid-identity-quarantine']::text[]
        )
        OR (
          SELECT count(*)
          FROM unnest(COALESCE(listing.tags, '{}'::text[])) AS marker(value)
          WHERE marker.value = 'source:maiprop-os-invalid-identity-quarantine'
        ) <> 1
    )
    AND NOT EXISTS (
      SELECT 1
      FROM private.os_auction_invalid_identity_quarantine AS quarantine
      LEFT JOIN public.listings AS listing ON listing.id = quarantine.listing_id
      WHERE listing.id IS NULL
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os-invalid-identity-quarantine']::text[]
        AND NOT EXISTS (
          SELECT 1 FROM private.os_auction_invalid_identity_quarantine AS quarantine
          WHERE quarantine.listing_id = listing.id
        )
    )
    AND NOT EXISTS (
      SELECT 1
      FROM private.os_auction_invalid_identity_quarantine AS quarantine
      JOIN public.listing_promotion_allocations AS allocation
        ON allocation.listing_id = quarantine.listing_id
      WHERE allocation.ends_at > statement_timestamp()
        AND allocation.revoked_at IS NULL
    )`;
}

function eligibleInvalidOsSourceRowsSql() {
  return `(
    WITH listing_identity AS (
      SELECT
        listing.id,
        listing.listing_type,
        count(tag.value) FILTER (WHERE left(tag.value, length('os_auction:')) = 'os_auction:') AS provider_tag_count,
        min(lower(btrim(substr(tag.value, length('os_auction:') + 1))))
          FILTER (WHERE left(tag.value, length('os_auction:')) = 'os_auction:') AS provider_id
      FROM public.listings AS listing
      LEFT JOIN LATERAL unnest(COALESCE(listing.tags, '{}'::text[])) AS tag(value) ON true
      WHERE COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os']::text[]
        AND NOT COALESCE(listing.tags, '{}'::text[]) @> ARRAY['source:maiprop-os-duplicate-quarantine']::text[]
      GROUP BY listing.id
    )
    SELECT count(*)
    FROM listing_identity AS identity
    WHERE identity.listing_type <> 'auction'::public.listing_type
      OR identity.provider_tag_count <> 1
      OR identity.provider_id !~ '^[a-z0-9:_-]{1,120}$'
      OR identity.provider_id IN ('unknown', 'null', 'undefined', 'none', 'na', 'n/a')
  )`;
}

function osIdentityComponentSql(requireExactPrefix = false) {
  const approvedBody = requireExactPrefix
    ? "md5(procedure.prosrc) = 'b98c2a7f368c498c75e221c4064c1878'"
    : "md5(procedure.prosrc) IN ('532205de65120d3e34729a515d949f65', 'b98c2a7f368c498c75e221c4064c1878')";
  return {
    duplicate_quarantine_relation: `
      to_regclass('private.os_auction_duplicate_quarantine') IS NOT NULL`,
    duplicate_quarantine_acl: `
      NOT EXISTS (
        SELECT 1
        FROM pg_class AS relation
        CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
        WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine')
          AND privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = 'anon'), (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))
      )`,
    extractor_owner: `
      EXISTS (
        SELECT 1
        FROM pg_proc AS procedure
        WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
          AND pg_get_userbyid(procedure.proowner) = 'postgres'
      )`,
    extractor_posture: `
      EXISTS (
        SELECT 1
        FROM pg_proc AS procedure
        WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
          AND procedure.prokind = 'f'
          AND procedure.prorettype = 'text'::regtype
          AND NOT procedure.prosecdef
          AND procedure.provolatile = 'i'
          AND procedure.proparallel = 's'
          AND COALESCE(procedure.proconfig, ARRAY[]::text[]) = ARRAY['search_path=""']::text[]
      )`,
    extractor_body: `
      EXISTS (
        SELECT 1
        FROM pg_proc AS procedure
        WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
          AND ${approvedBody}
      )`,
    extractor_acl: `
      1 = (
        SELECT count(*)
        FROM pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(
          COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
        ) AS privilege
        WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
          AND privilege.privilege_type = 'EXECUTE'
          AND pg_get_userbyid(privilege.grantee) = 'service_role'
      )
      AND NOT EXISTS (
        SELECT 1
        FROM pg_proc AS procedure
        CROSS JOIN LATERAL aclexplode(
          COALESCE(procedure.proacl, acldefault('f', procedure.proowner))
        ) AS privilege
        WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
          AND (
            privilege.privilege_type <> 'EXECUTE'
            OR privilege.grantee NOT IN (
              procedure.proowner,
              (SELECT oid FROM pg_roles WHERE rolname = 'service_role')
            )
          )
      )`,
    generated_column: `
      EXISTS (
        SELECT 1
        FROM pg_attribute AS attribute
        JOIN pg_attrdef AS definition
          ON definition.adrelid = attribute.attrelid
         AND definition.adnum = attribute.attnum
        WHERE attribute.attrelid = 'public.listings'::regclass
          AND attribute.attname = 'os_auction_id'
          AND attribute.attgenerated = 's'
          AND format_type(attribute.atttypid, attribute.atttypmod) = 'text'
          AND btrim(regexp_replace(
            pg_get_expr(definition.adbin, definition.adrelid),
            '[[:space:]]+', ' ', 'g'
          )) IN (
            'CASE WHEN (listing_type = ''auction''::listing_type) THEN private.extract_os_auction_id(tags) ELSE NULL::text END',
            'CASE WHEN (listing_type = ''auction''::public.listing_type) THEN private.extract_os_auction_id(tags) ELSE NULL::text END'
          )
      )`,
    unique_index: `
      EXISTS (
        SELECT 1
        FROM pg_index AS index_definition
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index_definition.indrelid
         AND attribute.attname = 'os_auction_id'
        WHERE index_definition.indexrelid = to_regclass('public.idx_listings_os_auction_id_unique')
          AND index_definition.indrelid = 'public.listings'::regclass
          AND index_definition.indisunique
          AND index_definition.indisvalid
          AND index_definition.indisready
          AND index_definition.indnkeyatts = 1
          AND index_definition.indnatts = 1
          AND index_definition.indpred IS NULL
          AND index_definition.indexprs IS NULL
          AND index_definition.indkey[0] = attribute.attnum
      )`,
    source_check: `
      EXISTS (
        SELECT 1
        FROM pg_constraint AS constraint_definition
        WHERE constraint_definition.conrelid = 'public.listings'::regclass
          AND constraint_definition.conname = 'listings_os_auction_source_identity_valid'
          AND constraint_definition.contype = 'c'
          AND constraint_definition.convalidated
          AND regexp_replace(
            pg_get_constraintdef(constraint_definition.oid),
            '[[:space:]]+', ' ', 'g'
          ) IN (
            'CHECK (((NOT (COALESCE(tags, ''{}''::text[]) @> ARRAY[''source:maiprop-os''::text])) OR (COALESCE(tags, ''{}''::text[]) @> ARRAY[''source:maiprop-os-duplicate-quarantine''::text]) OR ((listing_type = ''auction''::listing_type) AND (private.extract_os_auction_id(tags) IS NOT NULL))))',
            'CHECK (((NOT (COALESCE(tags, ''{}''::text[]) @> ARRAY[''source:maiprop-os''::text])) OR (COALESCE(tags, ''{}''::text[]) @> ARRAY[''source:maiprop-os-duplicate-quarantine''::text]) OR ((listing_type = ''auction''::public.listing_type) AND (private.extract_os_auction_id(tags) IS NOT NULL))))'
          )
      )`,
    stored_parity: requireExactPrefix ? `
      NOT EXISTS (
      SELECT 1
      FROM public.listings AS listing
      WHERE listing.os_auction_id IS DISTINCT FROM CASE
        WHEN listing.listing_type = 'auction'::public.listing_type
          THEN private.extract_os_auction_id(listing.tags)
        ELSE NULL
      END
      )`
      : "true",
  };
}

function osIdentityContractSql(requireExactPrefix = false) {
  const components = osIdentityComponentSql(requireExactPrefix);
  return OS_IDENTITY_COMPONENT_KEYS
    .map((component) => `COALESCE((${components[component]}), false)`)
    .join("\n    AND ");
}

function osIdentityComponentsJsonSql(requireExactPrefix = false, includeIdentity = true) {
  const components = includeIdentity ? osIdentityComponentSql(requireExactPrefix) : {};
  return `json_build_object(
${OS_IDENTITY_COMPONENT_KEYS.map((component) =>
  `      '${component}', ${includeIdentity ? `COALESCE((${components[component]}), false)` : "false"}`
).join(",\n")}
    )`;
}

function osIdentityMetadataFieldsSql(includeIdentity, requireExactPrefix) {
  return `'os_identity_contract', ${includeIdentity ? osIdentityContractSql(requireExactPrefix) : "false"},
  'os_identity_components', ${osIdentityComponentsJsonSql(requireExactPrefix, includeIdentity)}`;
}

function bridgeMetadataSql(includeQuarantine = false, requireExactPrefix = false) {
  return `
SELECT json_build_object(
  'migration_versions', COALESCE((SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_VERSION_SQL})), '[]'::json),
  ${includeQuarantine ? `${quarantineMetadataFieldsSql(true)},` : ""}
  ${osIdentityMetadataFieldsSql(true, requireExactPrefix)}
);`;
}

function quarantineMetadataSql() {
  return `
SELECT json_build_object(
  'migration_versions', COALESCE((SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_VERSION_SQL})), '[]'::json),
  ${quarantineMetadataFieldsSql(true)},
  ${bridgeResidueMetadataFieldsSql()}
);`;
}

function validateNoBridgeResidue(metadata) {
  const booleanFields = [
    "bridge_residue_duplicate_quarantine_relation",
    "bridge_residue_generated_column",
    "bridge_residue_unique_index",
    "bridge_residue_source_check",
  ];
  if (booleanFields.some((field) => typeof metadata?.[field] !== "boolean") ||
      !Number.isSafeInteger(metadata?.bridge_residue_duplicate_marker_rows) ||
      metadata.bridge_residue_duplicate_marker_rows < 0) {
    fail("Database OS auction bridge residue evidence is invalid.");
  }
  if (booleanFields.some((field) => metadata[field]) ||
      metadata.bridge_residue_duplicate_marker_rows !== 0) {
    fail("Database OS auction bridge residue is present after quarantine-only recovery.");
  }
}

function validatePreparationContract(
  metadata,
  recordedVersions,
  { allowBridgeArtifacts = false } = {},
) {
  const exactPreparationState = JSON.stringify(recordedVersions) === JSON.stringify([
    QUARANTINE_VERSION,
    PREPARATION_VERSION,
  ]);
  const preparationDiagnostic = () => {
    const evidence = Object.fromEntries(
      PREPARATION_EVIDENCE_FIELDS
        .filter((field) => typeof metadata?.[field] === "boolean" ||
          (Number.isSafeInteger(metadata?.[field]) && metadata[field] >= 0))
        .map((field) => [field, metadata[field]]),
    );
    const failedInvariants = [
      ...PREPARATION_BOOLEAN_FIELDS.filter((field) => typeof metadata?.[field] !== "boolean"),
      ...PREPARATION_COUNT_FIELDS.filter((field) => !Number.isSafeInteger(metadata?.[field]) || metadata[field] < 0),
    ];
    if (typeof metadata?.duplicate_preparation_contract === "boolean" &&
        !metadata.duplicate_preparation_contract) failedInvariants.push("duplicate_preparation_contract");
    if (typeof metadata?.duplicate_preparation_ledger_contract === "boolean" &&
        !metadata.duplicate_preparation_ledger_contract) failedInvariants.push("duplicate_preparation_ledger_contract");
    if (typeof metadata?.duplicate_preparation_acl_contract === "boolean" &&
        !metadata.duplicate_preparation_acl_contract) failedInvariants.push("duplicate_preparation_acl_contract");
    if (!allowBridgeArtifacts) {
      for (const field of [
        "duplicate_preparation_generated_column",
        "duplicate_preparation_unique_index",
        "duplicate_preparation_source_check",
      ]) {
        if (metadata?.[field] === true) failedInvariants.push(field);
      }
    }
    for (const field of [
      "duplicate_preparation_remaining_candidates",
      "duplicate_preparation_owner_guard_rows",
      "duplicate_preparation_active_promotion_rows",
    ]) {
      if (Number.isSafeInteger(metadata?.[field]) && metadata[field] !== 0) {
        failedInvariants.push(field);
      }
    }
    if (Number.isSafeInteger(metadata?.duplicate_preparation_ledger_rows) &&
        Number.isSafeInteger(metadata?.duplicate_preparation_live_marker_rows) &&
        metadata.duplicate_preparation_ledger_rows !== metadata.duplicate_preparation_live_marker_rows) {
      failedInvariants.push("duplicate_preparation_ledger_rows_match_live_marker_rows");
    }
    if (typeof metadata?.duplicate_preparation_live_recoverable_contract === "boolean" &&
        !metadata.duplicate_preparation_live_recoverable_contract) {
      failedInvariants.push("duplicate_preparation_live_recoverable_contract");
    }
    return {
      schema_version: 1,
      kind: "maiprop-duplicate-preparation-contract-failure",
      failed_invariants: [...new Set(failedInvariants)].sort(),
      evidence,
    };
  };
  const failPreparation = (message, additionalInvariant = null) => {
    const error = new Error(message);
    if (exactPreparationState) {
      const diagnostic = preparationDiagnostic();
      if (additionalInvariant) {
        diagnostic.failed_invariants = [...new Set([
          ...diagnostic.failed_invariants,
          additionalInvariant,
        ])].sort();
      }
      error.preparationDiagnostic = diagnostic;
    }
    throw error;
  };
  if (PREPARATION_BOOLEAN_FIELDS.some((field) => typeof metadata?.[field] !== "boolean") ||
      PREPARATION_COUNT_FIELDS.some((field) => !Number.isSafeInteger(metadata?.[field]) || metadata[field] < 0)) {
    failPreparation("Database duplicate identity preparation evidence is invalid.");
  }
  if (!metadata.duplicate_preparation_contract ||
      !metadata.duplicate_preparation_ledger_contract ||
      !metadata.duplicate_preparation_acl_contract ||
      (!allowBridgeArtifacts && (
        metadata.duplicate_preparation_generated_column ||
        metadata.duplicate_preparation_unique_index ||
        metadata.duplicate_preparation_source_check
      )) ||
      metadata.duplicate_preparation_remaining_candidates !== 0 ||
      metadata.duplicate_preparation_owner_guard_rows !== 0 ||
      metadata.duplicate_preparation_active_promotion_rows !== 0 ||
      metadata.duplicate_preparation_ledger_rows !== metadata.duplicate_preparation_live_marker_rows ||
      !metadata.duplicate_preparation_live_recoverable_contract) {
    failPreparation("Database duplicate identity preparation contract is incomplete.");
  }
  let quarantineContract;
  try {
    quarantineContract = validateDatabaseContract({
      metadata: {
        ...metadata,
        migration_versions: [QUARANTINE_VERSION],
      },
      invocation: {},
      restProbe: {},
      recordedVersions: [QUARANTINE_VERSION],
      requiredLevel: "invalid_identity_quarantine",
    });
  } catch (error) {
    if (exactPreparationState) {
      failPreparation(
        "Database duplicate identity preparation contract is incomplete.",
        "duplicate_preparation_quarantine_contract",
      );
    }
    throw error;
  }
  return {
    ...quarantineContract,
    contract_level: "duplicate_identity_preparation",
    recorded_versions: recordedVersions,
    indexes: {
      ...quarantineContract.indexes,
      duplicate_identity_preparation: true,
    },
  };
}

export function formatPreparationDiagnosticNotice(error) {
  const diagnostic = error?.preparationDiagnostic;
  try {
    const isPlainRecord = (value) => value && typeof value === "object" &&
      !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      Object.getOwnPropertyNames(value).length === Object.keys(value).length;
    const isCanonicalStringArray = (value) => Array.isArray(value) &&
      Object.getPrototypeOf(value) === Array.prototype &&
      Object.getOwnPropertySymbols(value).length === 0 &&
      Object.getOwnPropertyNames(value).every((name) =>
        name === "length" || /^(?:0|[1-9][0-9]*)$/.test(name)) &&
      Object.keys(value).length === value.length;
    if (!isPlainRecord(diagnostic) ||
        JSON.stringify(Object.keys(diagnostic).sort()) !== JSON.stringify([
          "evidence",
          "failed_invariants",
          "kind",
          "schema_version",
        ])) {
      return null;
    }
    if (diagnostic.schema_version !== 1 ||
        diagnostic.kind !== "maiprop-duplicate-preparation-contract-failure" ||
        !isCanonicalStringArray(diagnostic.failed_invariants)) {
      return null;
    }
    const failedInvariants = Array.from(diagnostic.failed_invariants);
    const sortedInvariants = [...failedInvariants].sort();
    if (failedInvariants.length === 0 ||
        failedInvariants.some((invariant) =>
          typeof invariant !== "string" || !PREPARATION_FAILED_INVARIANTS.has(invariant)) ||
        new Set(failedInvariants).size !== failedInvariants.length ||
        failedInvariants.some((invariant, index) => invariant !== sortedInvariants[index]) ||
        !isPlainRecord(diagnostic.evidence)) {
      return null;
    }
    const evidenceKeys = Object.keys(diagnostic.evidence);
    if (evidenceKeys.some((field) => !PREPARATION_EVIDENCE_FIELDS.includes(field)) ||
        evidenceKeys.some((field) => PREPARATION_BOOLEAN_FIELDS.includes(field)
          ? typeof diagnostic.evidence[field] !== "boolean"
          : !Number.isSafeInteger(diagnostic.evidence[field]) || diagnostic.evidence[field] < 0)) {
      return null;
    }
    const evidence = Object.fromEntries(
      PREPARATION_EVIDENCE_FIELDS
        .filter((field) => Object.hasOwn(diagnostic.evidence, field))
        .map((field) => [field, diagnostic.evidence[field]]),
    );
    return `::notice::${JSON.stringify({
      schema_version: 1,
      kind: "maiprop-duplicate-preparation-contract-failure",
      failed_invariants: failedInvariants,
      evidence,
    })}`;
  } catch {
    return null;
  }
}

function validateDatabaseContractForRecordedState({
  metadata,
  invocation,
  restProbe,
  recordedVersions,
  requiredLevel,
}) {
  const projectedVersions = recordedVersions.filter((version) => version !== PREPARATION_VERSION);
  const contract = validateDatabaseContract({
    metadata: {
      ...metadata,
      migration_versions: projectedVersions,
    },
    invocation,
    restProbe,
    recordedVersions: projectedVersions,
    requiredLevel,
  });
  return recordedVersions.includes(PREPARATION_VERSION)
    ? { ...contract, recorded_versions: recordedVersions }
    : contract;
}

function anonInvocationSql(requireSecond) {
  if (!requireSecond) return `
BEGIN;
SET LOCAL ROLE anon;
WITH publication AS MATERIALIZED (
  SELECT * FROM public.get_public_catalogue_publication(NULL)
), typed AS MATERIALIZED (
  SELECT * FROM public.query_public_catalogue(
    p_publication_id => (SELECT publication_id FROM publication),
    p_limit => 1,
    p_offset => 0
  )
)
SELECT json_build_object(
  'publication_call_rows', (SELECT count(*) FROM publication),
  'publication_shape', COALESCE((SELECT bool_and(publication_id > 0 AND snapshot_minute IS NOT NULL AND published_at IS NOT NULL AND retain_until IS NOT NULL AND row_count > 0) FROM publication), false),
  'typed_call_rows', (SELECT count(*) FROM typed),
  'typed_shape', COALESCE((SELECT bool_and(publication_id = (SELECT publication_id FROM publication) AND listing_id IS NOT NULL AND jsonb_typeof(card_payload) = 'object') FROM typed), false)
);
COMMIT;`;
  return `
BEGIN;
SET LOCAL ROLE anon;
WITH publication AS MATERIALIZED (
  SELECT * FROM public.get_public_catalogue_publication(NULL)
), typed AS MATERIALIZED (
  SELECT * FROM public.query_public_catalogue(
    p_publication_id => (SELECT publication_id FROM publication),
    p_limit => 1,
    p_offset => 0
  )
), homepage AS MATERIALIZED (
  SELECT * FROM public.get_public_catalogue_homepage((SELECT publication_id FROM publication))
), auction_seed AS MATERIALIZED (
  SELECT * FROM public.query_public_catalogue(
    p_publication_id => (SELECT publication_id FROM publication),
    p_listing_type => 'auction',
    p_limit => 1,
    p_offset => 0
  )
), auction_reader AS MATERIALIZED (
  SELECT * FROM public.get_public_catalogue_auctions(
    (SELECT publication_id FROM publication),
    ARRAY[COALESCE((SELECT listing_id FROM auction_seed), '${MISSING_AUCTION_ID}'::uuid)],
    NULL
  )
)
SELECT json_build_object(
  'publication_call_rows', (SELECT count(*) FROM publication),
  'publication_shape', COALESCE((SELECT bool_and(publication_id > 0 AND snapshot_minute IS NOT NULL AND published_at IS NOT NULL AND retain_until IS NOT NULL AND row_count > 0) FROM publication), false),
  'typed_call_rows', (SELECT count(*) FROM typed),
  'typed_shape', COALESCE((SELECT bool_and(publication_id = (SELECT publication_id FROM publication) AND listing_id IS NOT NULL AND jsonb_typeof(card_payload) = 'object') FROM typed), false),
  'homepage_call_rows', (SELECT count(*) FROM homepage),
  'homepage_shape', COALESCE((SELECT bool_and(publication_id = (SELECT publication_id FROM publication) AND published_at IS NOT NULL AND retain_until = (SELECT retain_until FROM publication) AND jsonb_typeof(payload) = 'object') FROM homepage), false),
  'auction_seed_rows', (SELECT count(*) FROM auction_seed),
  'auction_invocation_completed', true,
  'auction_call_rows', (SELECT count(*) FROM auction_reader),
  'auction_shape', CASE
    WHEN (SELECT count(*) FROM auction_seed) = 0 THEN (SELECT count(*) FROM auction_reader) = 0
    ELSE (SELECT count(*) FROM auction_reader) = 1 AND COALESCE((SELECT bool_and(publication_id = (SELECT publication_id FROM publication) AND listing_id = (SELECT listing_id FROM auction_seed) AND published_at IS NOT NULL AND jsonb_typeof(detail_payload) = 'object') FROM auction_reader), false)
  END
);
COMMIT;`;
}

export async function runCatalogueBehavioralProbe(
  { mode, apiUrl, databaseUrl, key, outputPath },
  dependencies = {},
) {
  if (!["recorded", "postapply"].includes(mode)) fail("Behavioral probe mode is invalid.");
  if (!apiUrl || !databaseUrl || !key) fail("Behavioral probe target is incomplete.");
  const psql = dependencies.psql ?? ((query) => runCatalogueSql(query, databaseUrl));
  const fetchImpl = dependencies.fetchImpl ?? globalThis.fetch;

  const recordedVersions = parseJson(await psql(
    `WITH recorded_hotfix_versions AS (SELECT version FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_VERSION_SQL})) SELECT COALESCE(json_agg(version ORDER BY version),'[]'::json) FROM recorded_hotfix_versions`,
  ), "Recorded hotfix versions");
  if (!Array.isArray(recordedVersions) || recordedVersions.some((version) => !HOTFIX_VERSIONS.includes(version)) ||
      new Set(recordedVersions).size !== recordedVersions.length) {
    fail("Recorded hotfix migration versions are invalid.");
  }
  if (mode === "recorded" && recordedVersions.length === 0) return { skipped: true };
  const approvedRecordedStates = [
    [],
    [BRIDGE_VERSION],
    [CATALOGUE_VERSION],
    [BRIDGE_VERSION, CATALOGUE_VERSION],
    [CATALOGUE_VERSION, HARDENING_VERSION],
    [BRIDGE_VERSION, CATALOGUE_VERSION, HARDENING_VERSION],
    [QUARANTINE_VERSION],
    [QUARANTINE_VERSION, BRIDGE_VERSION],
    [QUARANTINE_VERSION, BRIDGE_VERSION, REPAIR_VERSION],
    [QUARANTINE_VERSION, BRIDGE_VERSION, REPAIR_VERSION, CATALOGUE_VERSION],
    LEGACY_FULL_VERSIONS,
    [QUARANTINE_VERSION, CATALOGUE_VERSION],
    [QUARANTINE_VERSION, BRIDGE_VERSION, CATALOGUE_VERSION],
    [QUARANTINE_VERSION, CATALOGUE_VERSION, HARDENING_VERSION],
    [QUARANTINE_VERSION, BRIDGE_VERSION, CATALOGUE_VERSION, HARDENING_VERSION],
    [QUARANTINE_VERSION, PREPARATION_VERSION],
    [QUARANTINE_VERSION, PREPARATION_VERSION, BRIDGE_VERSION],
    [QUARANTINE_VERSION, PREPARATION_VERSION, BRIDGE_VERSION, REPAIR_VERSION],
    [QUARANTINE_VERSION, PREPARATION_VERSION, BRIDGE_VERSION, REPAIR_VERSION, CATALOGUE_VERSION],
    HOTFIX_VERSIONS,
    [QUARANTINE_VERSION, PREPARATION_VERSION, CATALOGUE_VERSION],
    [QUARANTINE_VERSION, PREPARATION_VERSION, CATALOGUE_VERSION, HARDENING_VERSION],
    [QUARANTINE_VERSION, PREPARATION_VERSION, BRIDGE_VERSION, CATALOGUE_VERSION],
    [QUARANTINE_VERSION, PREPARATION_VERSION, BRIDGE_VERSION, CATALOGUE_VERSION, HARDENING_VERSION],
  ];
  if (!approvedRecordedStates.some(
    (state) => JSON.stringify(state) === JSON.stringify(recordedVersions)
  )) {
    fail("Recorded hotfix migrations do not form the approved dependency prefix.");
  }
  if (mode === "postapply" && JSON.stringify(recordedVersions) !== JSON.stringify(HOTFIX_VERSIONS)) {
    fail("All manifest-bound migrations must be recorded before behavioral certification.");
  }
  if (mode === "recorded" && recordedVersions.length === 1 && recordedVersions[0] === QUARANTINE_VERSION) {
    const metadata = parseJson(await psql(quarantineMetadataSql()), "Database invalid OS identity quarantine contract");
    validateNoBridgeResidue(metadata);
    return validateDatabaseContractForRecordedState({
      metadata,
      invocation: {},
      restProbe: {},
      recordedVersions,
      requiredLevel: "invalid_identity_quarantine",
    });
  }
  if (mode === "recorded" &&
      JSON.stringify(recordedVersions) === JSON.stringify([QUARANTINE_VERSION, PREPARATION_VERSION])) {
    const metadata = parseJson(
      await psql(preparationMetadataSql()),
      "Database duplicate identity preparation contract",
    );
    return validatePreparationContract(metadata, recordedVersions);
  }
  const hasQuarantine = recordedVersions.includes(QUARANTINE_VERSION);
  const hasPreparation = recordedVersions.includes(PREPARATION_VERSION);
  const hasBridge = recordedVersions.includes(BRIDGE_VERSION);
  const hasFirst = recordedVersions.includes(CATALOGUE_VERSION);
  const requireSecond = recordedVersions.includes(HARDENING_VERSION);
  if (hasPreparation) {
    const preparationMetadata = parseJson(
      await psql(preparationMetadataSql(hasBridge)),
      "Database duplicate identity preparation attestation",
    );
    validatePreparationContract(
      preparationMetadata,
      recordedVersions,
      { allowBridgeArtifacts: hasBridge },
    );
  }
  if (mode === "recorded" && hasBridge && !hasFirst) {
    const metadata = parseJson(
      await psql(bridgeMetadataSql(hasQuarantine, recordedVersions.includes(REPAIR_VERSION))),
      "Database OS identity bridge contract",
    );
    return validateDatabaseContractForRecordedState({
      metadata,
      invocation: {},
      restProbe: {},
      recordedVersions,
      requiredLevel: hasQuarantine
        ? "quarantine_and_identity_bridge"
        : "identity_bridge",
    });
  }
  const requiredLevel = mode === "postapply"
    ? "full"
    : hasQuarantine && hasBridge && requireSecond
    ? "full"
    : hasBridge && requireSecond
    ? "legacy_full"
    : hasQuarantine && requireSecond
    ? "quarantine_catalogue_contract"
    : hasQuarantine && hasBridge
    ? "quarantine_bridge_and_first"
    : requireSecond
    ? "catalogue_contract"
    : hasQuarantine
    ? "quarantine_and_first"
    : hasBridge
    ? "bridge_and_first"
    : "first_migration";

  const metadata = parseJson(
    await psql(metadataSql(hasQuarantine, hasBridge, recordedVersions.includes(REPAIR_VERSION))),
    "Database metadata contract",
  );
  const invocation = parseJson(await psql(anonInvocationSql(requireSecond)), "Anon database invocation contract");

  const seedRows = await fetchJson(
    fetchImpl,
    rpcUrl(apiUrl, "get_public_listing_catalogue", [
      ["select", "id,status,is_off_market,city,location_search_text,project,listing_images"],
      ["status", "eq.active"],
      ["is_off_market", "eq.false"],
      ["order", "id.asc"],
      ["limit", "200"],
    ]),
    { method: "GET", headers: anonHeaders(key) },
    "Legacy catalogue seed probe",
  );
  const context = selectCatalogueProbeContext(seedRows);

  const cardRows = await fetchJson(
    fetchImpl,
    rpcUrl(apiUrl, "get_public_listing_catalogue", [
      ["select", "id,status,is_off_market,city,location_search_text,project,listing_images"],
      ["status", "eq.active"],
      ["is_off_market", "eq.false"],
      ["location_search_text", `ilike.*${context.locationToken}*`],
      ["id", `eq.${context.id}`],
      ["limit", "1"],
    ]),
    { method: "GET", headers: anonHeaders(key) },
    "Legacy filtered card probe",
  );
  const detailRows = await fetchJson(
    fetchImpl,
    rpcUrl(apiUrl, "get_public_listing_catalogue", [
      ["select", "id,status,is_off_market,project:project_detail,listing_images:listing_images_detail"],
      ["status", "eq.active"],
      ["is_off_market", "eq.false"],
      ["id", `eq.${context.id}`],
      ["limit", "1"],
    ]),
    { method: "GET", headers: anonHeaders(key) },
    "Legacy exact detail probe",
  );
  const publicationRows = await fetchJson(
    fetchImpl,
    rpcUrl(apiUrl, "get_public_catalogue_publication"),
    {
      method: "POST",
      headers: anonHeaders(key, true),
      body: JSON.stringify({ p_publication_id: null }),
    },
    "Public catalogue publication RPC",
  );
  const publicationId = Number(publicationRows?.[0]?.publication_id);
  const typedRows = await fetchJson(
    fetchImpl,
    rpcUrl(apiUrl, "query_public_catalogue"),
    {
      method: "POST",
      headers: anonHeaders(key, true),
      body: JSON.stringify({ p_publication_id: publicationId, p_limit: 1, p_offset: 0 }),
    },
    "Typed public catalogue RPC",
  );
  let homepageRows;
  let auctionSeedRows;
  let auctionRows;
  if (requireSecond) {
    homepageRows = await fetchJson(
      fetchImpl,
      rpcUrl(apiUrl, "get_public_catalogue_homepage"),
      {
        method: "POST",
        headers: anonHeaders(key, true),
        body: JSON.stringify({ p_publication_id: publicationId }),
      },
      "Hardened public catalogue homepage RPC",
    );
    auctionSeedRows = await fetchJson(
      fetchImpl,
      rpcUrl(apiUrl, "query_public_catalogue"),
      {
        method: "POST",
        headers: anonHeaders(key, true),
        body: JSON.stringify({ p_publication_id: publicationId, p_listing_type: "auction", p_limit: 1, p_offset: 0 }),
      },
      "Typed public catalogue auction seed RPC",
    );
    auctionRows = await fetchJson(
      fetchImpl,
      rpcUrl(apiUrl, "get_public_catalogue_auctions"),
      {
        method: "POST",
        headers: anonHeaders(key, true),
        body: JSON.stringify({
          p_publication_id: publicationId,
          p_listing_ids: [auctionSeedRows?.[0]?.listing_id ?? MISSING_AUCTION_ID],
          p_os_tag: null,
        }),
      },
      "Exact public catalogue auction RPC",
    );
  }

  const restProbe = validateCatalogueBehaviorProbe({
    context,
    cardRows,
    detailRows,
    typedRows,
    publicationRows,
    homepageRows,
    auctionSeedRows,
    auctionRows,
    requireSecond,
  });
  const contract = validateDatabaseContractForRecordedState({
    metadata,
    invocation,
    restProbe,
    recordedVersions,
    requiredLevel,
  });
  if (outputPath) writeFileSync(outputPath, `${JSON.stringify(contract, null, 2)}\n`);
  return contract;
}

async function main() {
  const [mode, outputPath] = process.argv.slice(2);
  await runCatalogueBehavioralProbe({
    mode,
    apiUrl: process.env.TARGET_API_URL,
    databaseUrl: process.env.TARGET_DB_URL,
    key: process.env.TARGET_ANON_KEY,
    outputPath,
  });
}

if (process.argv[1]?.endsWith("catalogue-hotfix-behavioral-probe.mjs")) {
  main().catch((error) => {
    const notice = formatPreparationDiagnosticNotice(error);
    if (notice) process.stdout.write(`${notice}\n`);
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
