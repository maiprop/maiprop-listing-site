import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const PRODUCTION_REF = "qvvicunqcrwpioqnvzxf";
const STAGING_REF = "xsiehskfgeoqyazcgauv";
const VERSION = /^\d{14}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const CACHE_STATES = new Set(["BYPASS", "HIT", "MISS", "MISSING"]);
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
      !CACHE_STATES.has(state)) {
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
  if (states.length !== 1 || !CACHE_STATES.has(states[0])) {
    fail("Public cache-state headers are conflicting or unsupported.");
  }
  return { source, state: states[0] };
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

export function validateTarget({ kind, ref, apiUrl, databaseUrl, key }) {
  if (!ref || !apiUrl || !databaseUrl || !key) fail("Target credentials are incomplete.");
  if (!["staging", "production"].includes(kind)) fail("Target kind is not recognized.");
  if ((kind === "staging" && ref !== STAGING_REF) ||
      (kind === "production" && ref !== PRODUCTION_REF)) {
    fail("Target kind does not match the manifest-bound project ref.");
  }
  const api = new URL(apiUrl);
  if (api.protocol !== "https:" || api.hostname !== `${ref}.supabase.co` || api.port ||
      api.username || api.password || api.pathname !== "/" || api.search || api.hash) {
    fail("API URL is not the exact HTTPS project origin.");
  }
  const db = new URL(databaseUrl);
  const username = decodeURIComponent(db.username);
  const direct = db.hostname === `db.${ref}.supabase.co` && username === "postgres" && db.port === "5432";
  const pooler = /^(?:[a-z0-9-]+\.)+pooler\.supabase\.com$/.test(db.hostname) &&
    username === `postgres.${ref}` && ["5432", "6543"].includes(db.port);
  if (!['postgres:', 'postgresql:'].includes(db.protocol) || db.pathname !== "/postgres" ||
      !db.password || !(direct || pooler) || db.searchParams.getAll("sslmode").length !== 1 ||
      db.searchParams.get("sslmode") !== "require") {
    fail("Database URL is not an exact TLS-required Supabase target.");
  }
  validateKey(key, ref);
}

export function validateDryRun({ contract, remoteHistory, output }) {
  if (!output.trim() || !/(?:migration|push|pending|\d{14})/i.test(output)) {
    fail("Dry-run output is empty or unrecognized.");
  }
  const remote = new Set(remoteHistory.trim().split(/\s+/).filter(Boolean));
  const expected_pending_versions = contract.hotfix.migrations
    .map((migration) => migration.version)
    .filter((version) => !remote.has(version))
    .sort();
  const pending_versions = [...new Set([...output.matchAll(/\b(\d{14})\b/g)].map((match) => match[1]))].sort();
  if (pending_versions.some((version) => !VERSION.test(version)) ||
      JSON.stringify(pending_versions) !== JSON.stringify(expected_pending_versions)) {
    fail("Dry-run pending versions differ from approved versions missing remotely.");
  }
  return { expected_pending_versions, pending_versions };
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
  if (!Array.isArray(auctionSeedRows) || auctionSeedRows.length !== 1) {
    fail("A nonempty typed auction seed invocation is required.");
  }
  const auctionSeed = auctionSeedRows[0];
  if (Number(auctionSeed?.publication_id) !== publicationId ||
      typeof auctionSeed?.listing_id !== "string" || !auctionSeed.listing_id ||
      !auctionSeed.card_payload || typeof auctionSeed.card_payload !== "object" ||
      Array.isArray(auctionSeed.card_payload)) {
    fail("Typed auction seed invocation returned an invalid shape.");
  }
  if (!Array.isArray(auctionRows) || auctionRows.length !== 1) {
    fail("A nonempty exact auction invocation is required.");
  }
  const auction = auctionRows[0];
  if (Number(auction?.publication_id) !== publicationId ||
      auction.listing_id !== auctionSeed.listing_id || !validDate(auction.published_at) ||
      !auction.detail_payload || typeof auction.detail_payload !== "object" ||
      Array.isArray(auction.detail_payload)) {
    fail("Exact auction invocation returned an invalid publication-bound shape.");
  }
  return {
    ...result,
    homepage_call_rows: 1,
    homepage_retain_until_shape: true,
    auction_seed_rows: 1,
    auction_call_rows: 1,
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
  const firstVersion = "20260728123058";
  const secondVersion = "20260729120405";
  const normalizedVersions = [...(recordedVersions ?? [])].sort();
  const expectedVersions = requiredLevel === "full"
    ? [firstVersion, secondVersion]
    : [firstVersion];
  if (!["first_migration", "full"].includes(requiredLevel) ||
      JSON.stringify(normalizedVersions) !== JSON.stringify(expectedVersions) ||
      JSON.stringify([...(metadata?.migration_versions ?? [])].sort()) !== JSON.stringify(expectedVersions)) {
    fail("Database recorded-version contract is incomplete.");
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
  if (requiredLevel === "full") {
    if (!metadata.auction_rpc || !metadata.homepage_rpc ||
        !metadata.homepage_retain_until_contract || !metadata.auction_index) {
      fail("Database second migration function, homepage return, or index contract is incomplete.");
    }
    if (!metadata.anon_auction_execute || !metadata.anon_homepage_execute) {
      fail("Database second migration anon EXECUTE grant contract is incomplete.");
    }
    if (invocation?.homepage_call_rows !== 1 || invocation?.homepage_shape !== true ||
        invocation?.auction_call_rows !== 1 || invocation?.auction_shape !== true) {
      fail("Database second migration anon invocation contract is incomplete.");
    }
    if (restProbe?.homepage_call_rows !== 1 ||
        restProbe?.homepage_retain_until_shape !== true ||
        restProbe?.auction_seed_rows !== 1 || restProbe?.auction_call_rows !== 1 ||
        restProbe?.auction_shape !== true) {
      fail("Database second migration REST behavioral contract is incomplete.");
    }
  }
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
      ...(requiredLevel === "full" ? { auction_lookup: true } : {}),
    },
    functions: {
      legacy_rpc: true,
      publication_rpc: true,
      typed_rpc: true,
      ...(requiredLevel === "full" ? { auction_rpc: true, homepage_rpc: true, homepage_retain_until_contract: true } : {}),
    },
    anon_execute_grants: {
      legacy_rpc: true,
      publication_rpc: true,
      typed_rpc: true,
      ...(requiredLevel === "full" ? { auction_rpc: true, homepage_rpc: true } : {}),
    },
    anon_database_invocations: {
      publication_call_rows: 1,
      publication_shape: true,
      typed_call_rows: invocation.typed_call_rows,
      typed_shape: true,
      ...(requiredLevel === "full" ? {
        homepage_call_rows: 1,
        homepage_shape: true,
        auction_call_rows: 1,
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
  if (command === "validate-target") {
    validateTarget({ kind: process.env.TARGET_KIND, ref: process.env.TARGET_PROJECT_REF, apiUrl: process.env.TARGET_API_URL, databaseUrl: process.env.TARGET_DB_URL, key: process.env.TARGET_ANON_KEY });
    return;
  }
  if (command === "validate-dry-run") {
    const [contractPath, historyPath, outputPath, evidencePath] = args;
    const result = validateDryRun({ contract: JSON.parse(readFileSync(contractPath, "utf8")), remoteHistory: readFileSync(historyPath, "utf8"), output: readFileSync(outputPath, "utf8") });
    writeFileSync(evidencePath, JSON.stringify({ target_kind: process.env.TARGET_KIND, ...result }, null, 2) + "\n");
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
  fail("Usage: validate-target | validate-dry-run <contract> <history> <output> <evidence> | parse-cache-headers <headers> | inspect-public-body <body> | cron-proof <baseline> <current> <elapsed> <evidence> | summarize-samples <target> <contract> <samples> <evidence> | write-summary <target> <release-sha> <contract> <marker> <latency> <summary> | validate-artifacts <target>");
}

if (process.argv[1]?.endsWith("catalogue-hotfix-workflow-helpers.mjs")) {
  try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
