import { existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

const PRODUCTION_REF = "qvvicunqcrwpioqnvzxf";
const STAGING_REF = "xsiehskfgeoqyazcgauv";
const VERSION = /^\d{14}$/;
const FULL_SHA = /^[0-9a-f]{40}$/;
const CACHE_STATES = new Set(["BYPASS", "HIT", "MISS", "MISSING"]);
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
    "cache",
    "duration_ms",
    "normalized_cache_key",
    "normalized_url",
    "pair",
    "phase",
    "status",
  ], "Production sample");
  const pair = positiveInteger(record.pair, "Production pair");
  const phase = record.phase;
  if (!["cold", "warm"].includes(phase)) fail("Production sample phase is invalid.");
  const expectedKey = `page=${pair}&pageSize=12&offset=0&sort=relevant`;
  const expectedUrl = `https://portal.maiprop.co/api/public/listings?${expectedKey}`;
  if (record.normalized_cache_key !== expectedKey || record.normalized_url !== expectedUrl) {
    fail("Production sample URL/key is not the exact normalized public request.");
  }
  return {
    pair,
    phase,
    normalized_url: expectedUrl,
    normalized_cache_key: expectedKey,
    status: positiveInteger(record.status, "Production HTTP status"),
    duration_ms: positiveInteger(record.duration_ms, "Production duration"),
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
  validatePairSet(normalized, targetKind === "production" ? 301 : 1);

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
  fail("Usage: validate-target | validate-dry-run <contract> <history> <output> <evidence> | parse-cache-headers <headers> | summarize-samples <target> <contract> <samples> <evidence> | write-summary <target> <release-sha> <contract> <marker> <latency> <summary> | validate-artifacts <target>");
}

if (process.argv[1]?.endsWith("catalogue-hotfix-workflow-helpers.mjs")) {
  try { main(); } catch (error) { process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`); process.exitCode = 1; }
}
