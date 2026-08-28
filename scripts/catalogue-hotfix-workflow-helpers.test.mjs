import assert from "node:assert/strict";
import test from "node:test";
import {
  artifactPathsForTarget,
  assertLatencyEvidencePasses,
  buildLatencyEvidence,
  buildReleaseSummary,
  parseCacheState,
  summarizeLatencySamples,
  validateDryRun,
  validateTarget,
} from "./catalogue-hotfix-workflow-helpers.mjs";

const ref = "xsiehskfgeoqyazcgauv";
const valid = {
  kind: "staging",
  ref,
  apiUrl: `https://${ref}.supabase.co/`,
  databaseUrl: `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
  key: "sb_publishable_safe_key",
};

test("catalogue hotfix target validator requires exact Supabase identities", () => {
  assert.doesNotThrow(() => validateTarget(valid));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://user@${ref}.supabase.co/` }));
  assert.throws(() => validateTarget({ ...valid, databaseUrl: `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?sslmode=disable` }));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://${ref}.supabase.co/?x=1` }));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://${ref}.supabase.co/not-root` }));
  assert.throws(() => validateTarget({ ...valid, kind: "preview" }));
  assert.throws(() => validateTarget({ ...valid, key: "sb_secret_not_allowed" }));
  assert.throws(() => validateTarget({ ...valid, ref: "qvvicunqcrwpioqnvzxf" }));
  assert.throws(() => validateTarget({ ...valid, kind: "production" }));
  assert.doesNotThrow(() => validateTarget({ ...valid, kind: "production", ref: "qvvicunqcrwpioqnvzxf", apiUrl: "https://qvvicunqcrwpioqnvzxf.supabase.co/", databaseUrl: "postgresql://postgres:password@db.qvvicunqcrwpioqnvzxf.supabase.co:5432/postgres?sslmode=require" }));
  assert.doesNotThrow(() => validateTarget({ ...valid, databaseUrl: `postgresql://postgres.${ref}:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require` }));
  const jwt = `x.${Buffer.from(JSON.stringify({ role: "anon", ref })).toString("base64url")}.x`;
  assert.doesNotThrow(() => validateTarget({ ...valid, key: jwt }));
});

test("dry-run proof requires the exact approved missing set", () => {
  const contract = { hotfix: { migrations: [{ version: "20260728123058" }, { version: "20260729120405" }] } };
  assert.deepEqual(validateDryRun({ contract, remoteHistory: "20260728123058\n", output: "Would push 20260729120405 migration" }).pending_versions, ["20260729120405"]);
  assert.throws(() => validateDryRun({ contract, remoteHistory: "", output: "" }));
  assert.throws(() => validateDryRun({ contract, remoteHistory: "", output: "Would push 20260728123058" }));
  assert.throws(() => validateDryRun({ contract, remoteHistory: "", output: "Would push 20260728123058 and 20260729120405 and 20990101010101" }));
  assert.deepEqual(validateDryRun({ contract, remoteHistory: "20260728123058\n20260729120405\n", output: "No migrations pending" }).pending_versions, []);
});

const contract = {
  hotfix: {
    livePagesSha: "db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
    latencyCeilingsMs: {
      cold12CardP95: 1800,
      warm12CardP95: 1000,
    },
    migrations: [
      {
        version: "20260728123058",
        path: "supabase/migrations/20260728123058_materialize_public_catalogue_snapshots.sql",
        sha256: "3faf0f0f40ba318ce071de48828bf514d3d9b4e5f2dde403f3b0e77d3816e369",
      },
      {
        version: "20260729120405",
        path: "supabase/migrations/20260729120405_harden_public_catalogue_exact_lookup_and_cache.sql",
        sha256: "f20d21b6c1368d0406e607a308ddd68ff1deaaf98a7d2a73927d857ddf7d85aa",
      },
    ],
  },
};

function productionRecords() {
  return Array.from({ length: 30 }, (_, index) => {
    const pair = index + 301;
    const key = `page=${pair}&pageSize=12&offset=0&sort=relevant`;
    const url = `https://portal.maiprop.co/api/public/listings?${key}`;
    return [
      {
        pair,
        phase: "cold",
        normalized_url: url,
        normalized_cache_key: key,
        status: 200,
        duration_ms: index + 1,
        cache: { source: "x-maiprop-cache", state: index === 0 ? "BYPASS" : "MISS" },
      },
      {
        pair,
        phase: "warm",
        normalized_url: url,
        normalized_cache_key: key,
        status: 200,
        duration_ms: index + 101,
        cache: { source: "x-maiprop-cache", state: "HIT" },
      },
    ];
  }).flat();
}

function stagingRecords() {
  return Array.from({ length: 30 }, (_, index) => {
    const pair = index + 1;
    const key = `status=active&is_off_market=false&offset=${index * 12}&limit=12`;
    return [
      {
        pair,
        phase: "cold",
        request_role: "direct_rpc_first",
        normalized_request_key: key,
        status: 200,
        duration_ms: index + 1,
      },
      {
        pair,
        phase: "warm",
        request_role: "direct_rpc_second",
        normalized_request_key: key,
        status: 200,
        duration_ms: index + 101,
      },
    ];
  }).flat();
}

test("cache parser selects the application signal and records missing proof", () => {
  assert.deepEqual(
    parseCacheState("HTTP/2 200\r\ncf-cache-status: DYNAMIC\r\nx-maiprop-cache: miss\r\n"),
    { source: "x-maiprop-cache", state: "MISS" },
  );
  assert.deepEqual(
    parseCacheState("HTTP/2 200\r\nCF-Cache-Status: HIT\r\n"),
    { source: "cf-cache-status", state: "HIT" },
  );
  assert.deepEqual(
    parseCacheState("HTTP/2 503\r\ncontent-type: application/json\r\n"),
    { source: "none", state: "MISSING" },
  );
  assert.throws(() => parseCacheState("x-maiprop-cache: MISS\r\nx-maiprop-cache: HIT\r\n"));
});

test("production evidence validates every exact cold/warm cache pair", () => {
  const result = summarizeLatencySamples({
    targetKind: "production",
    contract,
    records: productionRecords(),
    completedAt: "2026-08-28T12:00:00.000Z",
  });
  assert.equal(result.measurement_contract, "live_worker_cache_population_and_reuse");
  assert.deepEqual(
    {
      cold_count: result.cold.sample_count,
      cold_p50: result.cold.p50_ms,
      cold_p95: result.cold.p95_ms,
      warm_count: result.warm.sample_count,
      warm_p50: result.warm.p50_ms,
      warm_p95: result.warm.p95_ms,
    },
    {
      cold_count: 30,
      cold_p50: 16,
      cold_p95: 30,
      warm_count: 30,
      warm_p50: 116,
      warm_p95: 130,
    },
  );
  assert.equal(result.cold.samples[0].normalized_url, "https://portal.maiprop.co/api/public/listings?page=301&pageSize=12&offset=0&sort=relevant");

  const wrongState = productionRecords();
  wrongState.at(-2).cache.state = "HIT";
  assert.throws(() => summarizeLatencySamples({ targetKind: "production", contract, records: wrongState }));

  const wrongKey = productionRecords();
  wrongKey[0].normalized_cache_key = "page=301&offset=0";
  assert.throws(() => summarizeLatencySamples({ targetKind: "production", contract, records: wrongKey }));

  const slowOutlier = productionRecords();
  slowOutlier.at(-2).duration_ms = 1801;
  assert.throws(() => summarizeLatencySamples({ targetKind: "production", contract, records: slowOutlier }));
});

test("staging evidence retains 30 direct RPC first/second pairs and gates both distributions", () => {
  const result = summarizeLatencySamples({
    targetKind: "staging",
    contract,
    records: stagingRecords(),
    completedAt: "2026-08-28T12:00:00.000Z",
  });
  assert.equal(result.measurement_contract, "direct_rpc_first_and_second_request_pairs");
  assert.equal(result.cold.samples[0].request_role, "direct_rpc_first");
  assert.equal(result.warm.samples[0].request_role, "direct_rpc_second");
  assert.equal(result.cold.sample_count, 30);
  assert.equal(result.warm.sample_count, 30);
  assert.equal(result.cold.p95_ms, 30);
  assert.equal(result.warm.p95_ms, 130);

  const slowOutlier = stagingRecords();
  slowOutlier.at(-1).duration_ms = 1001;
  assert.throws(() => summarizeLatencySamples({ targetKind: "staging", contract, records: slowOutlier }));

  const duplicatePair = stagingRecords();
  duplicatePair[0].pair = 2;
  assert.throws(() => summarizeLatencySamples({ targetKind: "staging", contract, records: duplicatePair }));
});

test("failed HTTP statuses remain in sanitized evidence before the release gate fails", () => {
  const records = productionRecords();
  records[0].status = 503;
  const evidence = buildLatencyEvidence({
    targetKind: "production",
    contract,
    records,
    completedAt: "2026-08-28T12:00:00.000Z",
  });
  assert.equal(evidence.cold.sample_count, 30);
  assert.equal(evidence.warm.sample_count, 30);
  assert.equal(evidence.cold.failed_statuses, 1);
  assert.equal(evidence.cold.samples[0].status, 503);
  assert.throws(() => assertLatencyEvidencePasses(evidence));
});

test("artifact allowlists contain only sanitized, non-duplicated evidence files", () => {
  assert.deepEqual(artifactPathsForTarget("staging"), [
    "evidence/catalogue-performance-hotfix-staging.json",
    "evidence/database-contract.json",
    "evidence/dry-run-pending.json",
    "evidence/public-catalogue-pgtap-proof.json",
    "evidence/catalogue-cron-proof.json",
    "evidence/staging-frontend-marker.json",
    "evidence/staging-http-latency.json",
  ]);
  assert.deepEqual(artifactPathsForTarget("production"), [
    "evidence/catalogue-performance-hotfix-production.json",
    "evidence/database-contract.json",
    "evidence/dry-run-pending.json",
    "evidence/catalogue-cron-proof.json",
    "evidence/production-frontend-marker.json",
    "evidence/production-http-latency.json",
  ]);
  assert.throws(() => artifactPathsForTarget("preview"));
});

test("release summary references sanitized proofs without duplicating per-sample evidence", () => {
  const summary = buildReleaseSummary({
    targetKind: "staging",
    releaseSha: "a".repeat(40),
    contract,
    marker: {
      schema_version: 1,
      release_sha: "db53d1b9adae41edae93fbeb3e612b42dd8fec0b",
      source_tree: "b".repeat(40),
      source_run_id: "123",
      source_run_attempt: "1",
      payload_sha256: "c".repeat(64),
    },
    latency: summarizeLatencySamples({
      targetKind: "staging",
      contract,
      records: stagingRecords(),
      completedAt: "2026-08-28T12:00:00.000Z",
    }),
    completedAt: "2026-08-28T12:00:01.000Z",
  });
  assert.equal(summary.frontend_sha, "db53d1b9adae41edae93fbeb3e612b42dd8fec0b");
  assert.deepEqual(summary.latency, {
    cold_sample_count: 30,
    cold_p50_ms: 16,
    cold_p95_ms: 30,
    warm_sample_count: 30,
    warm_p50_ms: 116,
    warm_p95_ms: 130,
    evidence_file: "staging-http-latency.json",
  });
  assert.equal(JSON.stringify(summary).includes('"samples"'), false);
});
