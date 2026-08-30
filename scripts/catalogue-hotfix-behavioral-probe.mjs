import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import {
  selectCatalogueProbeContext,
  validateCatalogueBehaviorProbe,
  validateDatabaseContract,
} from "./catalogue-hotfix-workflow-helpers.mjs";

const HOTFIX_VERSIONS = ["20260728120000", "20260728123058", "20260729120405"];
const HOTFIX_VERSION_SQL = HOTFIX_VERSIONS.map((version) => `'${version}'`).join(",");
const TYPED_SIGNATURE = "public.query_public_catalogue(bigint,text,text,text,text,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,numeric,integer,integer,text[],text,text,text,text,text[],numeric,numeric,numeric,numeric,numeric,numeric,text,text,text,timestamp with time zone,numeric,uuid,boolean,integer,integer,jsonb)";
const AUCTION_SIGNATURE = "public.get_public_catalogue_auctions(bigint,uuid[],text)";
const MISSING_AUCTION_ID = "00000000-0000-0000-0000-000000000000";

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

function metadataSql() {
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
  'os_identity_contract', ${osIdentityContractSql()}
);`;
}

function osIdentityContractSql() {
  return `
    to_regclass('private.os_auction_duplicate_quarantine') IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM pg_class AS relation
      CROSS JOIN LATERAL aclexplode(COALESCE(relation.relacl, acldefault('r', relation.relowner))) AS privilege
      WHERE relation.oid = to_regclass('private.os_auction_duplicate_quarantine')
        AND privilege.grantee IN (0, (SELECT oid FROM pg_roles WHERE rolname = 'anon'), (SELECT oid FROM pg_roles WHERE rolname = 'authenticated'))
    )
    AND EXISTS (
      SELECT 1
      FROM pg_proc AS procedure
      WHERE procedure.oid = to_regprocedure('private.extract_os_auction_id(text[])')
        AND procedure.provolatile = 'i'
        AND procedure.proparallel = 's'
    )
    AND EXISTS (
      SELECT 1
      FROM pg_attribute AS attribute
      JOIN pg_attrdef AS definition
        ON definition.adrelid = attribute.attrelid
       AND definition.adnum = attribute.attnum
      WHERE attribute.attrelid = 'public.listings'::regclass
        AND attribute.attname = 'os_auction_id'
        AND attribute.attgenerated = 's'
        AND format_type(attribute.atttypid, attribute.atttypmod) = 'text'
        AND pg_get_expr(definition.adbin, definition.adrelid) LIKE '%private.extract_os_auction_id(tags)%'
    )
    AND EXISTS (
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
        AND index_definition.indkey[0] = attribute.attnum
    )
    AND EXISTS (
      SELECT 1
      FROM pg_constraint AS constraint_definition
      WHERE constraint_definition.conrelid = 'public.listings'::regclass
        AND constraint_definition.conname = 'listings_os_auction_source_identity_valid'
        AND constraint_definition.contype = 'c'
        AND constraint_definition.convalidated
        AND pg_get_constraintdef(constraint_definition.oid) LIKE '%private.extract_os_auction_id(tags)%'
    )`;
}

function bridgeMetadataSql() {
  return `
SELECT json_build_object(
  'migration_versions', COALESCE((SELECT json_agg(version ORDER BY version) FROM supabase_migrations.schema_migrations WHERE version IN (${HOTFIX_VERSION_SQL})), '[]'::json),
  'os_identity_contract', ${osIdentityContractSql()}
);`;
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
    [HOTFIX_VERSIONS[0]],
    [HOTFIX_VERSIONS[0], HOTFIX_VERSIONS[1]],
    [HOTFIX_VERSIONS[1]],
    [HOTFIX_VERSIONS[1], HOTFIX_VERSIONS[2]],
    HOTFIX_VERSIONS,
  ];
  if (!approvedRecordedStates.some((state) => JSON.stringify(recordedVersions) === JSON.stringify(state))) {
    fail("Recorded hotfix migrations do not form the approved dependency prefix.");
  }
  if (mode === "postapply" && recordedVersions.length !== HOTFIX_VERSIONS.length) {
    fail("All manifest-bound migrations must be recorded before behavioral certification.");
  }
  if (mode === "recorded" && recordedVersions.length === 1 && recordedVersions[0] === HOTFIX_VERSIONS[0]) {
    const metadata = parseJson(await psql(bridgeMetadataSql()), "Database OS identity bridge contract");
    return validateDatabaseContract({
      metadata,
      invocation: {},
      restProbe: {},
      recordedVersions,
      requiredLevel: "identity_bridge",
    });
  }
  const hasBridge = recordedVersions.includes(HOTFIX_VERSIONS[0]);
  const requireSecond = recordedVersions.includes(HOTFIX_VERSIONS[2]);
  const requiredLevel = mode === "postapply"
    ? "full"
    : hasBridge && requireSecond
    ? "full"
    : requireSecond
    ? "catalogue_contract"
    : hasBridge
    ? "bridge_and_first"
    : "first_migration";

  const metadata = parseJson(await psql(metadataSql()), "Database metadata contract");
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
  const contract = validateDatabaseContract({
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
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
