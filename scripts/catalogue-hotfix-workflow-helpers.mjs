import { appendFileSync, chmodSync, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const PRODUCTION_REF = "qvvicunqcrwpioqnvzxf";
const STAGING_REF = "xsiehskfgeoqyazcgauv";
const VERSION = /^\d{14}$/;
const CATALOGUE_HOTFIX_MIGRATIONS = new Map([
  ["20260728120000_canonicalize_os_auction_identity.sql", "20260728120000"],
  ["20260728123058_materialize_public_catalogue_snapshots.sql", "20260728123058"],
  ["20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql", "20260729120405"],
]);
const MAXIMUM_LINKED_PUSH_FAILURE_BYTES = 1024 * 1024;
const FULL_SHA = /^[0-9a-f]{40}$/;
const CAPTURED_CACHE_STATE = /^[A-Z0-9_-]{1,32}$/;
const PRODUCTION_SORTS = ["featured", "newest", "price-asc", "price-desc", "ai-score", "views"];
const ARTIFACT_PATHS = Object.freeze({
  staging: Object.freeze([
    "evidence/catalogue-performance-hotfix-staging.json",
    "evidence/database-contract.json",
    "evidence/dry-run-pending.json",
    "evidence/public-catalogue-pgtap-proof.json",
    "evidence/catalogue-cron-proof.json",
    "evidence/staging-frontend-marker.json",
    "evidence/staging-http-latency.json",
  ]),
  production: Object.freeze([
    "evidence/catalogue-performance-hotfix-production.json",
    "evidence/database-contract.json",
    "evidence/dry-run-pending.json",
    "evidence/catalogue-cron-proof.json",
    "evidence/production-frontend-marker.json",
    "evidence/production-http-latency.json",
  ]),
});

function fail(message) {
  throw new Error(message);
}

function assertExactKeys(value, expected, label) {
  const actual = Object.keys(value ?? {}).sort();
  const wanted = [...expected].sort();
  if (JSON.stringify(actual) !== JSON.stringify(wanted)) {
    fail(`${label} contains an unexpected or missing field.`);
  }
}

function positiveInteger(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative integer.`);
  }
  return value;
}

function completedTimestamp(value) {
  const timestamp = value ?? new Date().toISOString();
  if (typeof timestamp !== "string" || !Number.isFinite(Date.parse(timestamp))) {
    fail("Evidence completion timestamp is invalid.");
  }
  return timestamp;
}

function conservativePercentile(values, quantile) {
  if (!values.length) fail("A latency distribution cannot be empty.");
  const sorted = [...values].sort((left, right) => left - right);
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((sorted.length + 1) * quantile) - 1,
  );
  return sorted[index];
}

function distribution(samples, ceilingMs) {
  const durations = samples.map(({ duration_ms: durationMs }) => durationMs);
  return {
    sample_count: samples.length,
    failed_statuses: samples.filter(({ status }) => ![200, 206].includes(status)).length,
    ceiling_ms: ceilingMs,
    p50_ms: conservativePercentile(durations, 0.5),
    p95_ms: conservativePercentile(durations, 0.95),
    max_ms: Math.max(...durations),
    samples,
  };
}

function normalizeCacheEvidence(value) {
  assertExactKeys(value, ["source", "state"], "Cache evidence");
  const source = String(value.source ?? "").toLowerCase();
  const state = String(value.state ?? "").toUpperCase();
  if (!["x-maiprop-cache", "cf-cache-status", "none"].includes(source) ||
      !CAPTURED_CACHE_STATE.test(state)) {
    fail("Cache evidence is not an approved cache signal.");
  }
  return { source, state };
}

function normalizeProductionRecord(record) {
  assertExactKeys(record, [
    "body_shape_valid",
    "cache",
    "duration_ms",
    "item_count",
    "normalized_cache_key",
    "normalized_url",
    "page",
    "pair",
    "phase",
    "run_bucket",
    "sort",
    "status",
  ], "Production sample");
  const pair = positiveInteger(record.pair, "Production pair");
  const phase = record.phase;
  if (!["cold", "warm"].includes(phase)) fail("Production sample phase is invalid.");
  const runBucket = positiveInteger(record.run_bucket, "Production run bucket");
  if (pair < 1 || pair > 30 || runBucket > 35) {
    fail("Production pair/run bucket is outside the release-bound range.");
  }
  const expectedSort = PRODUCTION_SORTS[Math.floor(runBucket / 6)];
  const expectedPage = 301 + (runBucket % 6) * 30 + pair - 1;
  const expectedKey = `page=${expectedPage}&pageSize=12&offset=0&sort=${expectedSort}`;
  const expectedUrl = `https://portal.maiprop.co/api/public/listings?${expectedKey}`;
  if (record.page !== expectedPage || record.sort !== expectedSort ||
      record.normalized_cache_key !== expectedKey || record.normalized_url !== expectedUrl) {
    fail("Production sample URL/key is not the exact normalized public request.");
  }
  if (record.body_shape_valid !== true && record.body_shape_valid !== false) {
    fail("Production sample body-shape flag is invalid.");
  }
  if (record.item_count !== null && (!Number.isSafeInteger(record.item_count) || record.item_count < 0)) {
    fail("Production sample item count is invalid.");
  }
  return {
    pair,
    run_bucket: runBucket,
    page: expectedPage,
    sort: expectedSort,
    phase,
    normalized_url: expectedUrl,
    normalized_cache_key: expectedKey,
    status: positiveInteger(record.status, "Production HTTP status"),
    duration_ms: positiveInteger(record.duration_ms, "Production duration"),
    item_count: record.item_count,
    body_shape_valid: record.body_shape_valid,
    cache: normalizeCacheEvidence(record.cache),
  };
}

function normalizeStagingRecord(record) {
  assertExactKeys(record, [
    "duration_ms",
    "normalized_request_key",
    "pair",
    "phase",
    "request_role",
    "status",
  ], "Staging sample");
  const pair = positiveInteger(record.pair, "Staging pair");
  const phase = record.phase;
  const expectedRole = phase === "cold"
    ? "direct_rpc_first"
    : phase === "warm"
      ? "direct_rpc_second"
      : "";
  if (!expectedRole || record.request_role !== expectedRole) {
    fail("Staging sample must identify its direct RPC first/second role.");
  }
  const expectedKey = `status=active&is_off_market=false&offset=${(pair - 1) * 12}&limit=12`;
  if (record.normalized_request_key !== expectedKey) {
    fail("Staging sample key is not the exact normalized direct RPC request.");
  }
  return {
    pair,
    phase,
    request_role: expectedRole,
    normalized_request_key: expectedKey,
    status: positiveInteger(record.status, "Staging HTTP status"),
    duration_ms: positiveInteger(record.duration_ms, "Staging duration"),
  };
}

function validatePairSet(records, firstPair) {
  const expectedPairs = Array.from({ length: 30 }, (_, index) => index + firstPair);
  for (const pair of expectedPairs) {
    const pairRecords = records.filter((record) => record.pair === pair);
    if (pairRecords.length !== 2 ||
        pairRecords.filter(({ phase }) => phase === "cold").length !== 1 ||
        pairRecords.filter(({ phase }) => phase === "warm").length !== 1) {
      fail("Evidence must contain exactly one cold and one warm sample per pair.");
    }
    const [cold] = pairRecords.filter(({ phase }) => phase === "cold");
    const [warm] = pairRecords.filter(({ phase }) => phase === "warm");
    const coldKey = cold.normalized_cache_key ?? cold.normalized_request_key;
    const warmKey = warm.normalized_cache_key ?? warm.normalized_request_key;
    if (coldKey !== warmKey) fail("Cold and warm pair keys differ.");
  }
  if (records.some(({ pair }) => !expectedPairs.includes(pair))) {
    fail("Evidence contains a pair outside the exact 30-pair range.");
  }
}

export function parseCacheState(headers) {
  const values = { "x-maiprop-cache": [], "cf-cache-status": [] };
  for (const line of String(headers ?? "").split(/\r?\n/)) {
    const match = /^(x-maiprop-cache|cf-cache-status)\s*:\s*([^\s;,]+)/i.exec(line.trim());
    if (!match) continue;
    values[match[1].toLowerCase()].push(match[2].toUpperCase());
  }
  const source = values["x-maiprop-cache"].length
    ? "x-maiprop-cache"
    : values["cf-cache-status"].length
      ? "cf-cache-status"
      : "";
  if (!source) return { source: "none", state: "MISSING" };
  const states = [...new Set(values[source])];
  if (states.length !== 1) return { source, state: "UNSUPPORTED" };
  return {
    source,
    state: CAPTURED_CACHE_STATE.test(states[0]) ? states[0] : "UNSUPPORTED",
  };
}

export function buildLatencyEvidence({
  targetKind,
  contract,
  records,
  completedAt,
}) {
  if (!Array.isArray(records) || records.length !== 60) {
    fail("Exactly 30 cold and 30 warm samples are required.");
  }
  const ceilings = contract?.hotfix?.latencyCeilingsMs;
  const coldCeiling = positiveInteger(ceilings?.cold12CardP95, "Cold p95 ceiling");
  const warmCeiling = positiveInteger(ceilings?.warm12CardP95, "Warm p95 ceiling");
  const normalized = targetKind === "production"
    ? records.map(normalizeProductionRecord)
    : targetKind === "staging"
      ? records.map(normalizeStagingRecord)
      : fail("Target kind is not recognized.");
  validatePairSet(normalized, 1);

  const cold = distribution(normalized.filter(({ phase }) => phase === "cold"), coldCeiling);
  const warm = distribution(normalized.filter(({ phase }) => phase === "warm"), warmCeiling);
  return {
    schema_version: 1,
    target_kind: targetKind,
    measurement_contract: targetKind === "production"
      ? "live_worker_cache_population_and_reuse"
      : "direct_rpc_first_and_second_request_pairs",
    percentile_method: "conservative_nearest_rank_n_plus_one",
    cold,
    warm,
    completed_at: completedTimestamp(completedAt),
  };
}

export function assertLatencyEvidencePasses(evidence) {
  if (!evidence || !["staging", "production"].includes(evidence.target_kind)) {
    fail("Latency evidence target is invalid.");
  }
  if (evidence.target_kind === "production") {
    for (const record of [...evidence.cold.samples, ...evidence.warm.samples]) {
      const allowed = record.phase === "cold" ? ["MISS", "BYPASS"] : ["HIT"];
      if (!allowed.includes(record.cache.state)) {
        fail(`Production ${record.phase} cache state is not approved.`);
      }
      if (record.body_shape_valid !== true || record.item_count !== 12) {
        fail("Production sample must prove the full nonempty 12-card response body.");
      }
    }
  }
  if (evidence.cold.failed_statuses || evidence.warm.failed_statuses ||
      evidence.cold.p95_ms > evidence.cold.ceiling_ms ||
      evidence.warm.p95_ms > evidence.warm.ceiling_ms) {
    fail("Catalogue latency/status evidence does not satisfy the release contract.");
  }
  return evidence;
}

export function summarizeLatencySamples(options) {
  return assertLatencyEvidencePasses(buildLatencyEvidence(options));
}

export function artifactPathsForTarget(targetKind) {
  const paths = ARTIFACT_PATHS[targetKind];
  if (!paths) fail("Target kind is not recognized.");
  return [...paths];
}

export function buildReleaseSummary({
  targetKind,
  releaseSha,
  contract,
  marker,
  latency,
  completedAt,
}) {
  if (!FULL_SHA.test(releaseSha)) fail("Database hotfix SHA must be a full SHA.");
  const livePagesSha = contract?.hotfix?.livePagesSha;
  if (!FULL_SHA.test(livePagesSha) || marker?.release_sha !== livePagesSha) {
    fail("Frontend marker does not match the manifest-bound fixed SHA.");
  }
  if (latency?.target_kind !== targetKind || latency?.cold?.sample_count !== 30 ||
      latency?.warm?.sample_count !== 30) {
    fail("Latency evidence is not bound to the release target.");
  }
  const latencyFile = `${targetKind}-http-latency.json`;
  return {
    schema_version: 1,
    target_kind: targetKind,
    database_hotfix_sha: releaseSha,
    frontend_sha: livePagesSha,
    migrations: contract.hotfix.migrations.map(({ version, path, sha256 }) => ({
      version,
      path,
      sha256,
    })),
    latency: {
      cold_sample_count: latency.cold.sample_count,
      cold_p50_ms: latency.cold.p50_ms,
      cold_p95_ms: latency.cold.p95_ms,
      warm_sample_count: latency.warm.sample_count,
      warm_p50_ms: latency.warm.p50_ms,
      warm_p95_ms: latency.warm.p95_ms,
      evidence_file: latencyFile,
    },
    evidence_files: artifactPathsForTarget(targetKind).map((path) => basename(path)),
    completed_at: completedTimestamp(completedAt),
  };
}

export function buildCatalogueHotfixStaticMarkerEvidence({ expectedSha, marker }) {
  const markerKeys = [
    "sha",
    "run_id",
    "run_attempt",
    "created_at",
  ];
  const invalid = () => fail("Database hotfix static deploy marker is invalid.");
  if (typeof expectedSha !== "string" || !FULL_SHA.test(expectedSha) ||
      !marker || typeof marker !== "object" || Array.isArray(marker)) {
    invalid();
  }
  try {
    assertExactKeys(marker, markerKeys, "Database hotfix static deploy marker");
  } catch {
    invalid();
  }
  const canonicalCreatedAt = typeof marker.created_at === "string" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(marker.created_at) &&
    !Number.isNaN(Date.parse(marker.created_at)) &&
    new Date(marker.created_at).toISOString() === `${marker.created_at.slice(0, -1)}.000Z`;
  if (
    typeof marker.sha !== "string" || !FULL_SHA.test(marker.sha) ||
    typeof marker.run_id !== "string" || !/^[1-9][0-9]*$/.test(marker.run_id) ||
    typeof marker.run_attempt !== "string" || !/^[1-9][0-9]*$/.test(marker.run_attempt) ||
    !canonicalCreatedAt || marker.sha !== expectedSha
  ) {
    invalid();
  }
  return { release_sha: expectedSha };
}

function validateKey(key, ref) {
  if (/(service_role|service|secret|sb_secret|sk_)/i.test(key)) {
    fail("A service or secret key is not permitted for catalogue verification.");
  }
  if (/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) return;
  const parts = key.split(".");
  if (parts.length !== 3) fail("A publishable or anonymous key is required.");
  let payload;
  try {
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    fail("Anonymous key payload is not parseable.");
  }
  if (payload.role !== "anon" || (payload.ref !== undefined && payload.ref !== ref)) {
    fail("Anonymous key role/ref is not approved for this project.");
  }
}

function validatePublishableKey(key) {
  if (!/^sb_publishable_[A-Za-z0-9_-]+$/.test(key)) {
    fail("A Supabase publishable key is required.");
  }
}

function validateLegacyAnonKey(key, ref) {
  if (/^sb_publishable_/.test(key)) fail("A legacy anonymous JWT is required.");
  validateKey(key, ref);
}

export function parseStagingPublicApiKeyCandidates(response, projectRef) {
  const reject = () => fail("Could not resolve unambiguous staging public API key candidates.");
  if (projectRef !== STAGING_REF || !Array.isArray(response)) reject();

  const rows = response;
  if (!rows.length || rows.some((row) => !row || typeof row !== "object" || Array.isArray(row) ||
      typeof row.api_key !== "string" || !row.api_key || /[\r\n]/.test(row.api_key))) {
    reject();
  }

  const publishable = rows.filter((row) => String(row.type ?? "").toLowerCase() === "publishable");
  const legacyAnon = rows.filter((row) => {
    const type = String(row.type ?? "").toLowerCase();
    const name = String(row.name ?? "").toLowerCase();
    return type === "legacy" && name === "anon";
  });
  if (publishable.length > 1 || legacyAnon.length > 1 ||
      (publishable.length === 0 && legacyAnon.length === 0)) {
    reject();
  }
  const candidates = {
    publishable: publishable[0]?.api_key ?? null,
    legacy_anon: legacyAnon[0]?.api_key ?? null,
  };
  try {
    if (candidates.publishable) validatePublishableKey(candidates.publishable);
    if (candidates.legacy_anon) validateLegacyAnonKey(candidates.legacy_anon, projectRef);
  } catch {
    reject();
  }
  return candidates;
}

export function selectLiveStagingPublicApiKey({
  candidates,
  publishableStatus,
  legacyAnonStatus,
  projectRef,
}) {
  const reject = () => fail("Could not resolve a live staging public API key.");
  if (projectRef !== STAGING_REF || !candidates || typeof candidates !== "object" ||
      Array.isArray(candidates) ||
      JSON.stringify(Object.keys(candidates).sort()) !== JSON.stringify(["legacy_anon", "publishable"])) {
    reject();
  }
  const publishable = candidates.publishable;
  const legacyAnon = candidates.legacy_anon;
  if ((publishable !== null && typeof publishable !== "string") ||
      (legacyAnon !== null && typeof legacyAnon !== "string") ||
      (!publishable && !legacyAnon)) {
    reject();
  }
  try {
    if (publishable) validatePublishableKey(publishable);
    if (legacyAnon) validateLegacyAnonKey(legacyAnon, projectRef);
  } catch {
    reject();
  }

  const live = new Set(["200"]);
  if (publishable) {
    if (live.has(publishableStatus)) {
      if (legacyAnonStatus !== "not-probed") reject();
      return publishable;
    }
    if (publishableStatus !== "401" || !legacyAnon || !live.has(legacyAnonStatus)) reject();
    return legacyAnon;
  }
  if (publishableStatus !== "not-probed" || !legacyAnon || !live.has(legacyAnonStatus)) reject();
  return legacyAnon;
}

export function normalizeDatabaseUrlTls(databaseUrl) {
  if (typeof databaseUrl !== "string" || !databaseUrl || /[\r\n]/.test(databaseUrl)) {
    fail("Database URL cannot be normalized safely.");
  }
  let parsed;
  try {
    parsed = new URL(databaseUrl);
  } catch {
    fail("Database URL cannot be normalized safely.");
  }
  if (!['postgres:', 'postgresql:'].includes(parsed.protocol) || !parsed.hostname ||
      !parsed.username || !parsed.password || parsed.pathname !== "/postgres" || parsed.hash) {
    fail("Database URL cannot be normalized safely.");
  }
  const modes = parsed.searchParams.getAll("sslmode");
  if (modes.length > 1 || (modes.length === 1 && modes[0] !== "require")) {
    fail("Database URL must contain at most one sslmode=require value.");
  }
  parsed.search = "";
  parsed.searchParams.set("sslmode", "require");
  return parsed.toString();
}

const TEMPORARY_DATABASE_ROLE = /^[A-Za-z_][A-Za-z0-9_-]{0,62}$/;
const FORBIDDEN_TEMPORARY_DATABASE_ROLES = new Set([
  "anon",
  "authenticated",
  "postgres",
  "service_role",
  "supabase_admin",
]);
const MAXIMUM_DATABASE_PHASE_SECONDS = 4 * 60;
const DATABASE_CREDENTIAL_MARGIN_SECONDS = 60;
const MINIMUM_TEMPORARY_DATABASE_TTL_SECONDS =
  MAXIMUM_DATABASE_PHASE_SECONDS + DATABASE_CREDENTIAL_MARGIN_SECONDS;

function validateTemporaryDatabaseRole(role) {
  if (typeof role !== "string" || !TEMPORARY_DATABASE_ROLE.test(role) ||
      FORBIDDEN_TEMPORARY_DATABASE_ROLES.has(role.toLowerCase())) {
    fail("Temporary database login role is invalid or privileged.");
  }
  return role;
}

function expectedProjectRef(kind) {
  if (kind === "staging") return STAGING_REF;
  if (kind === "production") return PRODUCTION_REF;
  fail("Target kind is not recognized.");
}

function classifyDatabaseEndpoint(db, ref, expectedRole = null) {
  const username = decodeURIComponent(db.username);
  const directRole = expectedRole ?? "postgres";
  const poolerRole = expectedRole ? `${expectedRole}.${ref}` : `postgres.${ref}`;
  const direct = db.hostname === `db.${ref}.supabase.co` &&
    username === directRole && db.port === "5432";
  const pooler = /^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(db.hostname) &&
    username === poolerRole && ["5432", "6543"].includes(db.port);
  return { direct, pooler };
}

function validateDatabaseSearchParameters(db, temporary) {
  const expectedKeys = temporary ? ["options", "sslmode"] : ["sslmode"];
  const actualKeys = [...db.searchParams.keys()].sort();
  return JSON.stringify(actualKeys) === JSON.stringify(expectedKeys) &&
    db.searchParams.getAll("sslmode").length === 1 &&
    db.searchParams.get("sslmode") === "require" &&
    (!temporary || (
      db.searchParams.getAll("options").length === 1 &&
      db.searchParams.get("options") === "-c role=postgres"
    ));
}

export function buildTemporaryDatabaseCredential({ kind, ref, databaseUrl, response }) {
  if (ref !== expectedProjectRef(kind)) {
    fail("Temporary database login target is not manifest-bound.");
  }
  assertExactKeys(response, ["role", "password", "ttl_seconds"], "Temporary database login response");
  const role = validateTemporaryDatabaseRole(response?.role);
  if (typeof response.password !== "string" || !response.password ||
      response.password.length > 4096 || /[\0\r\n]/.test(response.password)) {
    fail("Temporary database login password is invalid.");
  }
  if (!Number.isSafeInteger(response.ttl_seconds)) {
    fail("Temporary database login TTL is invalid.");
  }
  if (response.ttl_seconds < MINIMUM_TEMPORARY_DATABASE_TTL_SECONDS) {
    fail(`Temporary database login TTL ${response.ttl_seconds}s is below the required ${MINIMUM_TEMPORARY_DATABASE_TTL_SECONDS}s.`);
  }

  if (typeof databaseUrl !== "string" || /[\r\n]/.test(databaseUrl)) {
    fail("Temporary database login cannot replace an invalid database URL.");
  }
  let db;
  try {
    db = new URL(databaseUrl);
  } catch {
    fail("Temporary database login cannot replace an invalid database URL.");
  }
  const endpoint = classifyDatabaseEndpoint(db, ref);
  if (!["postgres:", "postgresql:"].includes(db.protocol) ||
      db.pathname !== "/postgres" || !db.password ||
      !(endpoint.direct || endpoint.pooler) ||
      !validateDatabaseSearchParameters(db, false) || db.hash) {
    fail("Temporary database login cannot replace a non-exact Supabase target.");
  }

  db.username = endpoint.pooler ? `${role}.${ref}` : role;
  db.password = response.password;
  db.search = `${db.search}${db.search ? "&" : "?"}options=-c%20role%3Dpostgres`;
  return { databaseUrl: db.toString(), role, ttlSeconds: response.ttl_seconds };
}

export function buildTemporaryPoolerDatabaseCredential({
  kind,
  ref,
  databaseUrl,
  response,
  poolerResponse,
}) {
  const validated = buildTemporaryDatabaseCredential({ kind, ref, databaseUrl, response });
  if (!Array.isArray(poolerResponse)) {
    fail("Temporary database pooler configuration is invalid.");
  }
  const primaryRecords = poolerResponse.filter((record) =>
    record && typeof record === "object" && !Array.isArray(record) &&
    record.database_type === "PRIMARY"
  );
  if (primaryRecords.length !== 1) {
    fail("Temporary database pooler configuration is ambiguous.");
  }
  const primary = primaryRecords[0];
  const host = primary.db_host;
  const transactionPooler = primary.db_port === 6543 && primary.pool_mode === "transaction";
  const sessionPooler = primary.db_port === 5432 && primary.pool_mode === "session";
  if (
    primary.identifier !== ref ||
    primary.db_user !== `postgres.${ref}` ||
    typeof host !== "string" ||
    !/^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(host) ||
    !(transactionPooler || sessionPooler) ||
    primary.db_name !== "postgres" ||
    primary.is_using_scram_auth !== true ||
    typeof primary.connection_string !== "string" ||
    /[\r\n]/.test(primary.connection_string)
  ) {
    fail("Temporary database pooler configuration is not manifest-bound.");
  }
  let advertised;
  let advertisedUsername;
  let advertisedPassword;
  try {
    advertised = new URL(primary.connection_string);
    advertisedUsername = decodeURIComponent(advertised.username);
    advertisedPassword = decodeURIComponent(advertised.password);
  } catch {
    fail("Temporary database pooler connection string is invalid.");
  }
  if (
    !["postgres:", "postgresql:"].includes(advertised.protocol) ||
    advertisedUsername !== primary.db_user ||
    advertisedPassword !== "[YOUR-PASSWORD]" ||
    advertised.hostname !== host ||
    advertised.port !== String(primary.db_port) ||
    advertised.pathname !== "/postgres" ||
    advertised.search ||
    advertised.hash
  ) {
    fail("Temporary database pooler connection string is contradictory.");
  }

  const pooler = new URL(`postgresql://placeholder:placeholder@${host}:5432/postgres`);
  pooler.username = `${validated.role}.${ref}`;
  pooler.password = response.password;
  pooler.search = "?sslmode=require&options=-c%20role%3Dpostgres";
  const endpoint = classifyDatabaseEndpoint(pooler, ref, validated.role);
  if (!endpoint.pooler || !validateDatabaseSearchParameters(pooler, true)) {
    fail("Temporary database pooler credential could not be constructed safely.");
  }
  return { ...validated, databaseUrl: pooler.toString() };
}

export function validateLinkedProjectState({
  kind,
  ref,
  projectRefText,
  poolerUrlText,
}) {
  if (ref !== expectedProjectRef(kind) || projectRefText !== ref) {
    fail("Linked project reference is not manifest-bound.");
  }
  if (typeof poolerUrlText !== "string" || !poolerUrlText ||
      poolerUrlText.length > 4096 || /[\0\r\n]/.test(poolerUrlText)) {
    fail("Linked pooler URL is invalid.");
  }
  let pooler;
  let username;
  try {
    pooler = new URL(poolerUrlText);
    username = decodeURIComponent(pooler.username);
  } catch {
    fail("Linked pooler URL cannot be parsed safely.");
  }
  if (!['postgres:', 'postgresql:'].includes(pooler.protocol) ||
      username !== `postgres.${ref}` || pooler.password ||
      !/^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(pooler.hostname) ||
      pooler.port !== "5432" || pooler.pathname !== "/postgres" ||
      pooler.search || pooler.hash) {
    fail("Linked pooler URL is not an exact passwordless session endpoint.");
  }
  return { projectRef: ref, poolerHost: pooler.hostname };
}

export function validateTarget({ kind, ref, apiUrl, databaseUrl, key, ephemeralRole = null }) {
  if (!ref || !apiUrl || !databaseUrl || !key) fail("Target credentials are incomplete.");
  if (typeof apiUrl !== "string" || typeof databaseUrl !== "string" ||
      /[\r\n]/.test(apiUrl) || /[\r\n]/.test(databaseUrl)) {
    fail("Target credentials contain an unsafe URL.");
  }
  if (ref !== expectedProjectRef(kind)) {
    fail("Target kind does not match the manifest-bound project ref.");
  }
  const api = new URL(apiUrl);
  if (api.protocol !== "https:" || api.hostname !== `${ref}.supabase.co` || api.port ||
      api.username || api.password || api.pathname !== "/" || api.search || api.hash) {
    fail("API URL is not the exact HTTPS project origin.");
  }
  const db = new URL(databaseUrl);
  const boundRole = ephemeralRole === null || ephemeralRole === undefined || ephemeralRole === ""
    ? null
    : validateTemporaryDatabaseRole(ephemeralRole);
  const { direct, pooler } = classifyDatabaseEndpoint(db, ref, boundRole);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname !== "/postgres" ||
      !db.password || !(direct || pooler) ||
      !validateDatabaseSearchParameters(db, Boolean(boundRole))) {
    fail("Database URL is not an exact TLS-required Supabase target.");
  }
  validateKey(key, ref);
}

export function validateSupabaseApiReadinessStatus(status) {
  const normalized = String(status ?? "");
  const safeStatus = /^\d{3}$/.test(normalized) ? normalized : "invalid";
  if (safeStatus !== "200") {
    fail(`Supabase API readiness failed with HTTP ${safeStatus}.`);
  }
}

export function validateDryRun({ contract, remoteHistory, output }) {
  if (!output.trim() || !/(?:migration|push|pending|\d{14})/i.test(output)) {
    fail("Dry-run output is empty or unrecognized.");
  }
  const outputLines = output
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.replace(/\x1b\[[0-9;]*m/g, "").trim());
  const remote = new Set(remoteHistory.trim().split(/\s+/).filter(Boolean));
  const expected_pending_versions = contract.hotfix.migrations
    .map((migration) => migration.version)
    .filter((version) => !remote.has(version))
    .sort();
  const pendingHeaderIndex = outputLines.indexOf("Would push these migrations:");
  const parsedPendingVersions = [];
  if (pendingHeaderIndex >= 0) {
    for (const line of outputLines.slice(pendingHeaderIndex + 1)) {
      const match = /^• (\d{14})_[A-Za-z0-9][A-Za-z0-9_-]*\.sql$/.exec(line);
      if (!match) {
        break;
      }
      parsedPendingVersions.push(match[1]);
    }
  }
  const pending_versions = [...new Set(parsedPendingVersions)].sort();
  const dryRunState = outputLines.some((line) =>
    /^Skipping migrations because it is disabled in config\.toml(?: for project: [^\r\n]+)?\.?$/.test(line))
    ? "migrations-disabled"
    : outputLines.includes("Remote database is up to date.")
      ? "remote-up-to-date"
      : pendingHeaderIndex >= 0
        ? "pending-listed"
        : "unknown";
  const stateMatchesExpected = expected_pending_versions.length > 0
    ? dryRunState === "pending-listed"
    : dryRunState === "remote-up-to-date";
  if (!stateMatchesExpected || pending_versions.some((version) => !VERSION.test(version)) ||
      JSON.stringify(pending_versions) !== JSON.stringify(expected_pending_versions)) {
    fail(`Dry-run pending versions differ: state=${dryRunState} expected=${JSON.stringify(expected_pending_versions)} observed=${JSON.stringify(pending_versions)}.`);
  }
  return { expected_pending_versions, pending_versions };
}

export function classifyLinkedPushFailure(output) {
  const source = String(output ?? "");
  if (Buffer.byteLength(source, "utf8") > MAXIMUM_LINKED_PUSH_FAILURE_BYTES) {
    return {
      schema_version: 1,
      kind: "maiprop-linked-push-failure",
      migration_filename: null,
      migration_version: null,
      sqlstate: null,
      category: "unknown",
      message: "Linked database push failed without a recognized safe diagnostic.",
    };
  }
  const normalized = source
    .replace(/\x1b\[[0-9;]*m/g, "")
    .replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n").map((line) => line.trim());
  const statementIndex = lines.findIndex((line) => /^At statement: [0-9]+$/.test(line));
  const prefix = lines.slice(0, statementIndex >= 0 ? statementIndex : lines.length);
  const migrationMarkers = prefix
    .map((line, index) => ({
      index,
      filename: /^Applying migration ([0-9]{14}_[a-z0-9][a-z0-9_-]*\.sql)\.\.\.$/.exec(line)?.[1] ?? null,
    }))
    .filter(({ filename }) => CATALOGUE_HOTFIX_MIGRATIONS.has(filename));
  const marker = migrationMarkers.at(-1) ?? null;
  const migrationFilename = marker?.filename ?? null;
  const migrationVersion = migrationFilename === null
    ? null
    : CATALOGUE_HOTFIX_MIGRATIONS.get(migrationFilename);
  const errorLine = prefix
    .slice(marker === null ? 0 : marker.index + 1)
    .find((line) => /^ERROR: .+ \(SQLSTATE [0-9A-Z]{5}\)$/.test(line)) ?? null;
  const sqlstateMatch = errorLine === null
    ? null
    : /\(SQLSTATE ([0-9A-Z]{5})\)$/.exec(errorLine);
  const sqlstate = sqlstateMatch?.[1]?.toUpperCase() ?? null;
  let category = "unknown";
  let message = "Linked database push failed without a recognized safe diagnostic.";
  if (errorLine === "ERROR: public_catalogue_duplicate_os_tag (SQLSTATE P0001)") {
    category = "catalogue-duplicate-os-tag";
    message = "Catalogue bootstrap rejected duplicate OS auction tags.";
  } else if (errorLine === "ERROR: public_catalogue_invalid_os_tag (SQLSTATE P0001)") {
    category = "catalogue-invalid-os-tag";
    message = "Catalogue bootstrap rejected an invalid OS auction tag.";
  } else if (sqlstate !== null) {
    const exact = new Map([
      ["57014", ["query-cancelled", "Database execution was cancelled or exceeded its statement timeout."]],
      ["55P03", ["lock-unavailable", "Database execution could not acquire a required lock."]],
      ["40P01", ["deadlock", "Database execution detected a deadlock."]],
      ["23505", ["unique-violation", "Database execution violated a uniqueness constraint."]],
      ["42501", ["permission", "Database execution lacked a required privilege."]],
      ["42601", ["syntax", "Database execution rejected SQL syntax."]],
      ["28P01", ["authentication", "Database authentication failed."]],
    ]);
    const byClass = sqlstate.startsWith("08")
      ? ["connection", "The database connection failed."]
      : sqlstate.startsWith("22")
        ? ["data-exception", "Database execution rejected input data."]
        : sqlstate.startsWith("23")
          ? ["integrity-constraint", "Database execution violated an integrity constraint."]
          : sqlstate.startsWith("42")
            ? ["schema-definition", "Database execution rejected a schema definition or access rule."]
            : ["database-error", "Database execution returned an unclassified SQLSTATE."];
    [category, message] = exact.get(sqlstate) ?? byClass;
  }
  return {
    schema_version: 1,
    kind: "maiprop-linked-push-failure",
    migration_filename: migrationFilename,
    migration_version: migrationVersion,
    sqlstate,
    category,
    message,
  };
}

function isAllowedProject(value) {
  return value === null || (typeof value === "object" && !Array.isArray(value));
}

function validateProject(record, label) {
  if (!Object.hasOwn(record ?? {}, "project") || !isAllowedProject(record.project)) {
    fail(`${label} project field must be present and either null or an object.`);
  }
}

function validateCardRow(record, label) {
  if (!record || typeof record !== "object" || Array.isArray(record) ||
      typeof record.id !== "string" || !record.id || record.status !== "active" ||
      record.is_off_market !== false) {
    fail(`${label} has an invalid active-card identity or status.`);
  }
  validateProject(record, label);
  if (!Array.isArray(record.listing_images) || record.listing_images.length > 3) {
    fail(`${label} listing_images must be a card array capped at three entries.`);
  }
}

export function selectCatalogueProbeContext(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    fail("A nonempty legacy catalogue seed is required.");
  }
  const candidates = [...rows].sort((left, right) => String(left?.id ?? "").localeCompare(String(right?.id ?? "")));
  for (const row of candidates) {
    try {
      validateCardRow(row, "Catalogue seed");
    } catch {
      continue;
    }
    if (typeof row.city !== "string" || !row.city.trim() ||
        typeof row.location_search_text !== "string" || !row.location_search_text.trim()) {
      continue;
    }
    const city = row.city.trim();
    if (!row.location_search_text.toLocaleLowerCase().includes(city.toLocaleLowerCase())) {
      continue;
    }
    return { id: row.id, city, locationToken: city };
  }
  fail("A deterministic seed with city and matching location_search_text is required.");
}

export function validateCatalogueBehaviorProbe({
  context,
  cardRows,
  detailRows,
  typedRows,
  publicationRows,
  homepageRows,
  auctionSeedRows,
  auctionRows,
  requireSecond = false,
}) {
  if (!context || typeof context.id !== "string" || !context.id ||
      typeof context.locationToken !== "string" || !context.locationToken) {
    fail("Catalogue probe context is invalid.");
  }
  if (!Array.isArray(cardRows) || cardRows.length !== 1) {
    fail("A nonempty exact legacy card result is required.");
  }
  const card = cardRows[0];
  validateCardRow(card, "Catalogue card");
  if (card.id !== context.id) fail("Catalogue card ID is not bound to the selected seed ID.");
  if (typeof card.location_search_text !== "string" ||
      !card.location_search_text.toLocaleLowerCase().includes(context.locationToken.toLocaleLowerCase())) {
    fail("Catalogue card does not prove the location_search_text filter.");
  }

  if (!Array.isArray(detailRows) || detailRows.length !== 1) {
    fail("A nonempty exact legacy detail result is required.");
  }
  const detail = detailRows[0];
  if (!detail || typeof detail !== "object" || Array.isArray(detail) ||
      detail.id !== context.id || detail.status !== "active" || detail.is_off_market !== false) {
    fail("Catalogue detail ID/status is not bound to the selected seed ID.");
  }
  validateProject(detail, "Catalogue detail");
  if (!Array.isArray(detail.listing_images) || detail.listing_images.length < card.listing_images.length) {
    fail("Catalogue detail listing_images must expose the full alias payload.");
  }

  if (!Array.isArray(publicationRows) || publicationRows.length !== 1) {
    fail("A nonempty catalogue publication invocation is required.");
  }
  const publication = publicationRows[0];
  const publicationId = Number(publication?.publication_id);
  const validDate = (value) => typeof value === "string" && Number.isFinite(Date.parse(value));
  if (!Number.isSafeInteger(publicationId) || publicationId < 1 ||
      !validDate(publication.snapshot_minute) || !validDate(publication.published_at) ||
      !validDate(publication.retain_until) || !Number.isSafeInteger(Number(publication.row_count)) ||
      Number(publication.row_count) < 1) {
    fail("Catalogue publication invocation returned an invalid shape.");
  }

  if (!Array.isArray(typedRows) || typedRows.length < 1) {
    fail("A nonempty typed catalogue invocation is required.");
  }
  for (const row of typedRows) {
    if (Number(row?.publication_id) !== publicationId || typeof row?.listing_id !== "string" ||
        !row.listing_id || !row.card_payload || typeof row.card_payload !== "object" ||
        Array.isArray(row.card_payload)) {
      fail("Typed catalogue invocation returned an invalid publication-bound shape.");
    }
  }

  const result = {
    legacy_card_rows: 1,
    legacy_detail_rows: 1,
    location_filter_matched: true,
    exact_id_binding: true,
    card_project_shape: card.project === null ? "null" : "object",
    detail_project_shape: detail.project === null ? "null" : "object",
    card_image_count: card.listing_images.length,
    detail_image_count: detail.listing_images.length,
    publication_call_rows: 1,
    publication_row_count_positive: true,
    typed_call_rows: typedRows.length,
    typed_shape: true,
  };
  if (!requireSecond) return result;

  if (!Array.isArray(homepageRows) || homepageRows.length !== 1) {
    fail("A nonempty hardened homepage invocation is required.");
  }
  const homepage = homepageRows[0];
  if (Number(homepage?.publication_id) !== publicationId ||
      !validDate(homepage.published_at) || !validDate(homepage.retain_until) ||
      Date.parse(homepage.retain_until) !== Date.parse(publication.retain_until) ||
      !homepage.payload || typeof homepage.payload !== "object" || Array.isArray(homepage.payload)) {
    fail("Hardened homepage invocation returned an invalid retain_until contract.");
  }
  if (!Array.isArray(auctionSeedRows) || auctionSeedRows.length > 1) {
    fail("Typed auction seed invocation returned an invalid row count.");
  }
  const auctionSeed = auctionSeedRows[0] ?? null;
  if (auctionSeed &&
      (Number(auctionSeed.publication_id) !== publicationId ||
       typeof auctionSeed.listing_id !== "string" || !auctionSeed.listing_id ||
       !auctionSeed.card_payload || typeof auctionSeed.card_payload !== "object" ||
       Array.isArray(auctionSeed.card_payload))) {
    fail("Typed auction seed invocation returned an invalid shape.");
  }
  if (!Array.isArray(auctionRows) || auctionRows.length !== auctionSeedRows.length) {
    fail("Exact auction invocation did not match the typed auction seed count.");
  }
  const auction = auctionRows[0] ?? null;
  if (auctionSeed &&
      (Number(auction?.publication_id) !== publicationId ||
       auction.listing_id !== auctionSeed.listing_id || !validDate(auction.published_at) ||
       !auction.detail_payload || typeof auction.detail_payload !== "object" ||
       Array.isArray(auction.detail_payload))) {
    fail("Exact auction invocation returned an invalid publication-bound shape.");
  }
  return {
    ...result,
    homepage_call_rows: 1,
    homepage_retain_until_shape: true,
    auction_seed_rows: auctionSeedRows.length,
    auction_invocation_completed: true,
    auction_call_rows: auctionRows.length,
    auction_shape: true,
  };
}

export function validateDatabaseContract({
  metadata,
  invocation,
  restProbe,
  recordedVersions = metadata?.migration_versions,
  requiredLevel = "first_migration",
}) {
  const bridgeVersion = "20260728120000";
  const firstVersion = "20260728123058";
  const secondVersion = "20260729120405";
  const normalizedVersions = [...(recordedVersions ?? [])].sort();
  const expectedVersions = requiredLevel === "full"
    ? [bridgeVersion, firstVersion, secondVersion]
    : requiredLevel === "bridge_and_first"
    ? [bridgeVersion, firstVersion]
    : requiredLevel === "identity_bridge"
    ? [bridgeVersion]
    : requiredLevel === "catalogue_contract"
    ? [firstVersion, secondVersion]
    : [firstVersion];
  if (!["identity_bridge", "first_migration", "bridge_and_first", "catalogue_contract", "full"].includes(requiredLevel) ||
      JSON.stringify(normalizedVersions) !== JSON.stringify(expectedVersions) ||
      JSON.stringify([...(metadata?.migration_versions ?? [])].sort()) !== JSON.stringify(expectedVersions)) {
    fail("Database recorded-version contract is incomplete.");
  }
  const hasIdentityContract = ["identity_bridge", "bridge_and_first", "full"].includes(requiredLevel);
  if (hasIdentityContract && !metadata.os_identity_contract) {
    fail("Database OS auction identity contract is incomplete.");
  }
  if (requiredLevel === "identity_bridge") {
    return {
      schema_version: 1,
      contract_level: requiredLevel,
      recorded_versions: normalizedVersions,
      indexes: { os_auction_identity: true },
      completed_at: completedTimestamp(),
    };
  }
  if (!metadata?.private_catalogue_tables || !metadata?.private_catalogue_rls_enabled ||
      metadata?.private_catalogue_rls_forced !== false ||
      !metadata?.private_catalogue_no_direct_privileges || !metadata?.first_indexes) {
    fail("Database first migration table, RLS, privilege, or index contract is incomplete.");
  }
  if (!metadata?.legacy_rpc || !metadata?.publication_rpc || !metadata?.typed_rpc) {
    fail("Database first migration function contract is incomplete.");
  }
  if (!metadata.anon_legacy_execute || !metadata.anon_publication_execute || !metadata.anon_typed_execute) {
    fail("Database anon EXECUTE grant contract is incomplete.");
  }
  if (invocation?.publication_call_rows !== 1 || invocation?.publication_shape !== true ||
      !Number.isSafeInteger(invocation?.typed_call_rows) || invocation.typed_call_rows < 1 ||
      invocation.typed_shape !== true) {
    fail("Database anon typed/publication invocation contract is incomplete.");
  }
  if (restProbe?.legacy_card_rows !== 1 || restProbe?.legacy_detail_rows !== 1 ||
      restProbe?.location_filter_matched !== true || restProbe?.exact_id_binding !== true ||
      restProbe?.publication_call_rows !== 1 || !Number.isSafeInteger(restProbe?.typed_call_rows) ||
      restProbe.typed_call_rows < 1 || restProbe.typed_shape !== true) {
    fail("Database REST behavioral contract is incomplete.");
  }
  if (["catalogue_contract", "full"].includes(requiredLevel)) {
    if (!metadata.auction_rpc || !metadata.homepage_rpc ||
        !metadata.homepage_retain_until_contract || !metadata.auction_index) {
      fail("Database second migration function, homepage return, or index contract is incomplete.");
    }
    if (!metadata.anon_auction_execute || !metadata.anon_homepage_execute) {
      fail("Database second migration anon EXECUTE grant contract is incomplete.");
    }
    if (invocation?.homepage_call_rows !== 1 || invocation?.homepage_shape !== true ||
        ![0, 1].includes(invocation?.auction_seed_rows) ||
        invocation?.auction_call_rows !== invocation.auction_seed_rows ||
        invocation?.auction_invocation_completed !== true || invocation?.auction_shape !== true) {
      fail("Database second migration anon invocation contract is incomplete.");
    }
    if (restProbe?.homepage_call_rows !== 1 ||
        restProbe?.homepage_retain_until_shape !== true ||
        ![0, 1].includes(restProbe?.auction_seed_rows) ||
        restProbe?.auction_call_rows !== restProbe.auction_seed_rows ||
        restProbe?.auction_invocation_completed !== true || restProbe?.auction_shape !== true) {
      fail("Database second migration REST behavioral contract is incomplete.");
    }
  }
  const hasCatalogueContract = ["catalogue_contract", "full"].includes(requiredLevel);
  const evidence = {
    schema_version: 1,
    contract_level: requiredLevel,
    recorded_versions: normalizedVersions,
    private_tables: {
      exist: true,
      rls_enabled: true,
      rls_forced: false,
      no_public_anon_authenticated_privileges: true,
    },
    indexes: {
      first_migration: true,
      ...(hasCatalogueContract ? { auction_lookup: true } : {}),
      ...(hasIdentityContract ? { os_auction_identity: true } : {}),
    },
    functions: {
      legacy_rpc: true,
      publication_rpc: true,
      typed_rpc: true,
      ...(hasCatalogueContract ? { auction_rpc: true, homepage_rpc: true, homepage_retain_until_contract: true } : {}),
    },
    anon_execute_grants: {
      legacy_rpc: true,
      publication_rpc: true,
      typed_rpc: true,
      ...(hasCatalogueContract ? { auction_rpc: true, homepage_rpc: true } : {}),
    },
    anon_database_invocations: {
      publication_call_rows: 1,
      publication_shape: true,
      typed_call_rows: invocation.typed_call_rows,
      typed_shape: true,
      ...(hasCatalogueContract ? {
        homepage_call_rows: 1,
        homepage_shape: true,
        auction_seed_rows: invocation.auction_seed_rows,
        auction_invocation_completed: true,
        auction_call_rows: invocation.auction_call_rows,
        auction_shape: true,
      } : {}),
    },
    rest_behavior: { ...restProbe },
    completed_at: completedTimestamp(),
  };
  return evidence;
}

export function buildCronProof({ baseline, current, elapsedSeconds, completedAt }) {
  const baselinePublicationId = positiveInteger(Number(baseline?.publication_id), "Baseline publication ID");
  const finalPublicationId = positiveInteger(Number(current?.publication_id), "Final publication ID");
  const baselineRunIds = new Set((baseline?.successful_runs ?? []).map(({ runid }) => String(runid)));
  const newRuns = (current?.successful_runs ?? []).filter(({ runid }) => !baselineRunIds.has(String(runid)));
  const newMinutes = [...new Set(newRuns.map(({ start_time: startTime }) => {
    if (typeof startTime !== "string" || !Number.isFinite(Date.parse(startTime))) {
      fail("Cron run start_time is invalid.");
    }
    return startTime.slice(0, 16);
  }))].sort();
  if (baseline?.schedule !== "* * * * *" || current?.schedule !== "* * * * *" ||
      baseline?.command !== "SELECT private.publish_public_catalogue();" ||
      current?.command !== "SELECT private.publish_public_catalogue();" ||
      baseline?.active !== true || current?.active !== true) {
    fail("Catalogue cron definition is invalid.");
  }
  if (!Number.isSafeInteger(elapsedSeconds) || elapsedSeconds < 120 ||
      finalPublicationId < baselinePublicationId + 2 || newRuns.length < 2 || newMinutes.length < 2) {
    fail("Catalogue cron did not prove two new successful minute boundaries.");
  }
  return {
    schema_version: 1,
    schedule: "* * * * *",
    command: "SELECT private.publish_public_catalogue();",
    active: true,
    minute_boundaries: 2,
    elapsed_seconds: elapsedSeconds,
    baseline_publication_id: baselinePublicationId,
    final_publication_id: finalPublicationId,
    new_successful_runs: newRuns.length,
    distinct_run_minutes: newMinutes.length,
    new_run_minutes: newMinutes,
    verified_at: completedTimestamp(completedAt),
  };
}

export function inspectPublicListingBody(text) {
  try {
    const body = JSON.parse(String(text));
    if (!body || typeof body !== "object" || Array.isArray(body) || !Array.isArray(body.data)) {
      return { item_count: null, body_shape_valid: false };
    }
    return { item_count: body.data.length, body_shape_valid: true };
  } catch {
    return { item_count: null, body_shape_valid: false };
  }
}

function main() {
  const [command, ...args] = process.argv.slice(2);
  if (command === "normalize-db-url-env") {
    const envPath = process.env.GITHUB_ENV;
    if (!envPath) fail("GitHub environment file is unavailable.");
    const normalized = normalizeDatabaseUrlTls(process.env.TARGET_DB_URL);
    process.stdout.write(`::add-mask::${normalized}\n`);
    appendFileSync(envPath, `TARGET_DB_URL=${normalized}\n`, "utf8");
    return;
  }
  if (command === "write-temporary-db-env") {
    const envPath = process.env.GITHUB_ENV;
    if (!envPath) fail("GitHub environment file is unavailable.");
    if (args.length !== 2) fail("Temporary database provider responses are incomplete.");
    let response;
    let poolerResponse;
    try {
      response = JSON.parse(readFileSync(args[0], "utf8"));
    } catch {
      fail("Could not parse the temporary database login response.");
    }
    try {
      poolerResponse = JSON.parse(readFileSync(args[1], "utf8"));
    } catch {
      fail("Could not parse the temporary database pooler response.");
    }
    const temporary = buildTemporaryPoolerDatabaseCredential({
      kind: process.env.TARGET_KIND,
      ref: process.env.TARGET_PROJECT_REF,
      databaseUrl: process.env.TARGET_DB_URL,
      response,
      poolerResponse,
    });
    process.stdout.write(`::add-mask::${temporary.role}\n`);
    process.stdout.write(`::add-mask::${response.password}\n`);
    process.stdout.write(`::add-mask::${temporary.databaseUrl}\n`);
    process.stdout.write(`::notice::Temporary database login TTL accepted: ${temporary.ttlSeconds}s (minimum ${MINIMUM_TEMPORARY_DATABASE_TTL_SECONDS}s).\n`);
    appendFileSync(envPath, `TARGET_DB_URL=${temporary.databaseUrl}\n`, "utf8");
    appendFileSync(envPath, `TARGET_DB_EPHEMERAL_ROLE=${temporary.role}\n`, "utf8");
    return;
  }
  if (command === "write-staging-public-key-candidates") {
    if (process.env.TARGET_KIND !== "staging" || process.env.TARGET_PROJECT_REF !== STAGING_REF) {
      fail("Staging public API key environment is not exact.");
    }
    const [responsePath, candidatesPath] = args;
    let response;
    try {
      response = JSON.parse(readFileSync(responsePath, "utf8"));
    } catch {
      fail("Could not parse the current staging public API key response.");
    }
    const candidates = parseStagingPublicApiKeyCandidates(response, process.env.TARGET_PROJECT_REF);
    for (const key of [candidates.publishable, candidates.legacy_anon].filter(Boolean)) {
      process.stdout.write(`::add-mask::${key}\n`);
    }
    try {
      chmodSync(candidatesPath, 0o600);
      writeFileSync(candidatesPath, `${JSON.stringify(candidates)}\n`, "utf8");
    } catch {
      fail("Could not persist private staging public API key candidates.");
    }
    return;
  }
  if (command === "select-live-staging-public-key-env") {
    const envPath = process.env.GITHUB_ENV;
    if (!envPath || process.env.TARGET_KIND !== "staging" ||
        process.env.TARGET_PROJECT_REF !== STAGING_REF) {
      fail("Staging public API key environment is not exact.");
    }
    let candidates;
    try {
      candidates = JSON.parse(readFileSync(args[0], "utf8"));
    } catch {
      fail("Could not parse private staging public API key candidates.");
    }
    const normalizeStatus = (value) => value === "not-probed" || /^\d{3}$/.test(value ?? "")
      ? value
      : "invalid";
    const normalizeAttempts = (value, status) => {
      const attempts = Number(value);
      if (!Number.isInteger(attempts) || attempts < 0 || attempts > 3 ||
          (status === "not-probed" ? attempts !== 0 : attempts === 0)) {
        fail("Staging public API key probe attempts are invalid.");
      }
      return attempts;
    };
    const publishableStatus = normalizeStatus(args[1]);
    const publishableAttempts = normalizeAttempts(args[2], publishableStatus);
    const legacyAnonStatus = normalizeStatus(args[3]);
    const legacyAnonAttempts = normalizeAttempts(args[4], legacyAnonStatus);
    let key;
    let selectionError;
    try {
      key = selectLiveStagingPublicApiKey({
        candidates,
        publishableStatus,
        legacyAnonStatus,
        projectRef: process.env.TARGET_PROJECT_REF,
      });
    } catch (error) {
      selectionError = error;
    }
    const publishablePresent = typeof candidates?.publishable === "string" &&
      candidates.publishable.length > 0;
    const legacyAnonPresent = typeof candidates?.legacy_anon === "string" &&
      candidates.legacy_anon.length > 0;
    const selectedTier = key && key === candidates.publishable
      ? "publishable"
      : key && key === candidates.legacy_anon
        ? "legacy_anon"
        : "none";
    process.stdout.write(`${JSON.stringify({
      schema_version: 1,
      publishable_present: publishablePresent,
      legacy_anon_present: legacyAnonPresent,
      publishable_status: publishableStatus,
      publishable_attempts: publishableAttempts,
      legacy_anon_status: legacyAnonStatus,
      legacy_anon_attempts: legacyAnonAttempts,
      selected_tier: selectedTier,
    })}\n`);
    if (selectionError) throw selectionError;
    appendFileSync(envPath, `TARGET_ANON_KEY=${key}\n`, "utf8");
    return;
  }
  if (command === "validate-target") {
    validateTarget({ kind: process.env.TARGET_KIND, ref: process.env.TARGET_PROJECT_REF, apiUrl: process.env.TARGET_API_URL, databaseUrl: process.env.TARGET_DB_URL, key: process.env.TARGET_ANON_KEY, ephemeralRole: process.env.TARGET_DB_EPHEMERAL_ROLE });
    return;
  }
  if (command === "validate-linked-state") {
    if (args.length !== 2) fail("Linked project state paths are incomplete.");
    validateLinkedProjectState({
      kind: process.env.TARGET_KIND,
      ref: process.env.TARGET_PROJECT_REF,
      projectRefText: readFileSync(args[0], "utf8"),
      poolerUrlText: readFileSync(args[1], "utf8"),
    });
    return;
  }
  if (command === "validate-api-readiness") {
    validateSupabaseApiReadinessStatus(args[0]);
    return;
  }
  if (command === "validate-dry-run") {
    const [contractPath, historyPath, outputPath, evidencePath] = args;
    const result = validateDryRun({ contract: JSON.parse(readFileSync(contractPath, "utf8")), remoteHistory: readFileSync(historyPath, "utf8"), output: readFileSync(outputPath, "utf8") });
    writeFileSync(evidencePath, JSON.stringify({ target_kind: process.env.TARGET_KIND, ...result }, null, 2) + "\n");
    return;
  }
  if (command === "classify-push-failure") {
    if (args.length !== 1) fail("Linked push failure output path is incomplete.");
    const outputPath = args[0];
    const outputStat = statSync(outputPath);
    if (!outputStat.isFile() || outputStat.size > MAXIMUM_LINKED_PUSH_FAILURE_BYTES ||
        (process.platform !== "win32" && (outputStat.mode & 0o077) !== 0)) {
      fail("Linked push failure output is not a private bounded file.");
    }
    process.stdout.write(`${JSON.stringify(classifyLinkedPushFailure(readFileSync(outputPath, "utf8")))}\n`);
    return;
  }
  if (command === "parse-cache-headers") {
    const [headersPath] = args;
    process.stdout.write(`${JSON.stringify(parseCacheState(readFileSync(headersPath, "utf8")))}\n`);
    return;
  }
  if (command === "inspect-public-body") {
    const [bodyPath] = args;
    process.stdout.write(`${JSON.stringify(inspectPublicListingBody(readFileSync(bodyPath, "utf8")))}\n`);
    return;
  }
  if (command === "cron-proof") {
    const [baselinePath, currentPath, elapsedSeconds, evidencePath] = args;
    const result = buildCronProof({
      baseline: JSON.parse(readFileSync(baselinePath, "utf8")),
      current: JSON.parse(readFileSync(currentPath, "utf8")),
      elapsedSeconds: Number(elapsedSeconds),
    });
    writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "summarize-samples") {
    const [targetKind, contractPath, samplesPath, evidencePath] = args;
    const sampleText = readFileSync(samplesPath, "utf8").trim();
    const records = sampleText ? sampleText.split(/\r?\n/).map((line) => JSON.parse(line)) : [];
    const result = buildLatencyEvidence({
      targetKind,
      contract: JSON.parse(readFileSync(contractPath, "utf8")),
      records,
    });
    writeFileSync(evidencePath, `${JSON.stringify(result, null, 2)}\n`);
    assertLatencyEvidencePasses(result);
    return;
  }
  if (command === "write-summary") {
    const [targetKind, releaseSha, contractPath, markerPath, latencyPath, outputPath] = args;
    const result = buildReleaseSummary({
      targetKind,
      releaseSha,
      contract: JSON.parse(readFileSync(contractPath, "utf8")),
      marker: JSON.parse(readFileSync(markerPath, "utf8")),
      latency: JSON.parse(readFileSync(latencyPath, "utf8")),
    });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "write-static-marker-evidence") {
    const [expectedSha, markerPath, outputPath] = args;
    let marker;
    try {
      marker = JSON.parse(readFileSync(markerPath, "utf8"));
    } catch {
      fail("Database hotfix static deploy marker is invalid.");
    }
    const result = buildCatalogueHotfixStaticMarkerEvidence({ expectedSha, marker });
    writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`);
    return;
  }
  if (command === "validate-artifacts") {
    const [targetKind] = args;
    for (const path of artifactPathsForTarget(targetKind)) {
      if (!existsSync(path) || !statSync(path).isFile()) {
        fail(`Required sanitized artifact is missing: ${path}`);
      }
      JSON.parse(readFileSync(path, "utf8"));
    }
    return;
  }
  fail("Usage: normalize-db-url-env | write-temporary-db-env <response> | write-staging-public-key-candidates <response> <candidates> | select-live-staging-public-key-env <candidates> <publishable-status> <publishable-attempts> <legacy-anon-status> <legacy-anon-attempts> | validate-target | validate-linked-state <project-ref> <pooler-url> | validate-api-readiness <status> | validate-dry-run <contract> <history> <output> <evidence> | classify-push-failure <output> | parse-cache-headers <headers> | inspect-public-body <body> | cron-proof <baseline> <current> <elapsed> <evidence> | summarize-samples <target> <contract> <samples> <evidence> | write-static-marker-evidence <expected-sha> <marker> <evidence> | write-summary <target> <release-sha> <contract> <marker> <latency> <summary> | validate-artifacts <target>");
}

if (process.argv[1]?.endsWith("catalogue-hotfix-workflow-helpers.mjs")) {
  try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
