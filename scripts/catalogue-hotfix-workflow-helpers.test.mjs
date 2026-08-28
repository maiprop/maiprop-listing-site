import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as workflowHelpers from "./catalogue-hotfix-workflow-helpers.mjs";
import {
  artifactPathsForTarget,
  assertLatencyEvidencePasses,
  buildCronProof,
  buildLatencyEvidence,
  buildReleaseSummary,
  inspectPublicListingBody,
  parseCacheState,
  selectCatalogueProbeContext,
  summarizeLatencySamples,
  validateCatalogueBehaviorProbe,
  validateDatabaseContract,
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

test("database URL TLS normalization appends require but rejects explicit weaker modes", () => {
  assert.equal(
    workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres"),
    "postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require",
  );
  assert.equal(
    workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres?connect_timeout=10"),
    "postgresql://postgres:secret@db.example.test:5432/postgres?connect_timeout=10&sslmode=require",
  );
  assert.equal(
    workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require"),
    "postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require",
  );
  assert.throws(
    () => workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=disable"),
    /sslmode=require/i,
  );
  assert.throws(
    () => workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require&sslmode=prefer"),
    /sslmode=require/i,
  );
  assert.throws(
    () => workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require&sslmode=require"),
    /sslmode/i,
  );
});

test("database URL normalization CLI masks and persists only the normalized job value", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-env-"));
  const envPath = join(directory, "github-env");
  const databaseUrl = "postgresql://postgres:secret@db.example.test:5432/postgres";
  const normalized = `${databaseUrl}?sslmode=require`;
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/catalogue-hotfix-workflow-helpers.mjs", "normalize-db-url-env"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, GITHUB_ENV: envPath, TARGET_DB_URL: databaseUrl },
      },
    );
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stderr, "");
    assert.equal(result.stdout, `::add-mask::${normalized}\n`);
    assert.equal(readFileSync(envPath, "utf8"), `TARGET_DB_URL=${normalized}\n`);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

const currentPublishable = "sb_publishable_current_staging_key";
const currentAnon = `x.${Buffer.from(JSON.stringify({ role: "anon", ref })).toString("base64url")}.x`;
const publishableRecord = (suffix = "current") => ({
    id: suffix,
    type: "publishable",
    name: suffix,
    api_key: `sb_publishable_${suffix}`,
  });
const legacyRecord = (role, projectRef = ref) => ({
    id: role,
    type: "legacy",
    name: role,
    api_key: `x.${Buffer.from(JSON.stringify({ role, ref: projectRef })).toString("base64url")}.x`,
  });

test("staging key parser retains at most one publishable and one legacy anon candidate", () => {
  assert.deepEqual(
    workflowHelpers.parseStagingPublicApiKeyCandidates([
      { ...publishableRecord(), api_key: currentPublishable },
      { ...legacyRecord("anon"), api_key: currentAnon },
      { id: "private", type: "secret", name: "server", api_key: "sb_secret_not_selected" },
      { id: "service_role", type: "legacy", name: "service_role", api_key: "not-selected" },
    ], ref),
    { publishable: currentPublishable, legacy_anon: currentAnon },
  );
  assert.deepEqual(
    workflowHelpers.parseStagingPublicApiKeyCandidates([
      { ...legacyRecord("anon"), api_key: currentAnon },
      { id: "service_role", name: "service_role", api_key: "not-selected" },
    ], ref),
    { publishable: null, legacy_anon: currentAnon },
  );
});

test("staging key parser rejects malformed, ambiguous, elevated, and wrong-ref candidates", () => {
  for (const response of [
    null,
    {},
    { keys: [publishableRecord("wrapped")] },
    { result: [publishableRecord("wrapped")] },
    [null, publishableRecord("one")],
    [publishableRecord("one"), publishableRecord("two")],
    [legacyRecord("anon"), { ...legacyRecord("anon"), id: "anon-copy" }],
    [publishableRecord("one"), legacyRecord("anon"), { ...legacyRecord("anon"), id: "anon-copy" }],
    [{ id: "secret", type: "secret", name: "secret", api_key: "sb_secret_elevated" }],
    [legacyRecord("service_role")],
    [{ ...publishableRecord("mislabeled"), api_key: "sb_secret_elevated" }],
    [{ ...publishableRecord("legacy-jwt"), api_key: currentAnon }],
    [{ ...legacyRecord("anon"), api_key: currentPublishable }],
    [legacyRecord("anon", "qvvicunqcrwpioqnvzxf")],
  ]) {
    assert.throws(
      () => workflowHelpers.parseStagingPublicApiKeyCandidates(response, ref),
      /staging public API key candidates/i,
    );
  }
});

test("live staging key selector prefers a ready publishable key and falls back only on its 401", () => {
  const candidates = { publishable: currentPublishable, legacy_anon: currentAnon };
  assert.equal(workflowHelpers.selectLiveStagingPublicApiKey({
    candidates,
    publishableStatus: "200",
    legacyAnonStatus: "not-probed",
    projectRef: ref,
  }), currentPublishable);
  assert.equal(workflowHelpers.selectLiveStagingPublicApiKey({
    candidates,
    publishableStatus: "401",
    legacyAnonStatus: "200",
    projectRef: ref,
  }), currentAnon);
  assert.equal(workflowHelpers.selectLiveStagingPublicApiKey({
    candidates: { publishable: null, legacy_anon: currentAnon },
    publishableStatus: "not-probed",
    legacyAnonStatus: "200",
    projectRef: ref,
  }), currentAnon);
});

test("live staging key selector rejects both-inactive and every indeterminate publishable status", () => {
  const candidates = { publishable: currentPublishable, legacy_anon: currentAnon };
  assert.throws(() => workflowHelpers.selectLiveStagingPublicApiKey({
    candidates,
    publishableStatus: "401",
    legacyAnonStatus: "401",
    projectRef: ref,
  }), /live staging public API key/i);
  for (const status of ["000", "301", "400", "403", "404", "408", "409", "429", "500", "invalid"]) {
    assert.throws(() => workflowHelpers.selectLiveStagingPublicApiKey({
      candidates,
      publishableStatus: status,
      legacyAnonStatus: "not-probed",
      projectRef: ref,
    }), /live staging public API key/i);
  }
});

test("staging candidate CLI masks all candidates before selection persists only the live fallback", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-key-"));
  const responsePath = join(directory, "keys.json");
  const candidatesPath = join(directory, "candidates.json");
  const envPath = join(directory, "github-env");
  try {
    writeFileSync(responsePath, JSON.stringify([
      { id: "public", type: "publishable", name: "default", api_key: currentPublishable },
      { ...legacyRecord("anon"), api_key: currentAnon },
      { id: "private", type: "secret", name: "server", api_key: "sb_secret_never_logged" },
    ]));
    writeFileSync(candidatesPath, "");
    const parsed = spawnSync(
      process.execPath,
      ["scripts/catalogue-hotfix-workflow-helpers.mjs", "write-staging-public-key-candidates", responsePath, candidatesPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, TARGET_KIND: "staging", TARGET_PROJECT_REF: ref },
      },
    );
    assert.equal(parsed.status, 0, parsed.stderr);
    assert.equal(parsed.stderr, "");
    assert.equal(parsed.stdout, `::add-mask::${currentPublishable}\n::add-mask::${currentAnon}\n`);
    assert.deepEqual(JSON.parse(readFileSync(candidatesPath, "utf8")), {
      publishable: currentPublishable,
      legacy_anon: currentAnon,
    });
    assert.equal(existsSync(envPath), false);

    const selected = spawnSync(
      process.execPath,
      ["scripts/catalogue-hotfix-workflow-helpers.mjs", "select-live-staging-public-key-env", candidatesPath, "401", "1", "200", "1"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, GITHUB_ENV: envPath, TARGET_KIND: "staging", TARGET_PROJECT_REF: ref },
      },
    );
    assert.equal(selected.status, 0, selected.stderr);
    assert.equal(selected.stderr, "");
    assert.deepEqual(JSON.parse(selected.stdout), {
      schema_version: 1,
      publishable_present: true,
      legacy_anon_present: true,
      publishable_status: "401",
      publishable_attempts: 1,
      legacy_anon_status: "200",
      legacy_anon_attempts: 1,
      selected_tier: "legacy_anon",
    });
    assert.equal(readFileSync(envPath, "utf8"), `TARGET_ANON_KEY=${currentAnon}\n`);

    writeFileSync(responsePath, JSON.stringify([
      { id: "private", type: "secret", name: "server", api_key: "sb_secret_never_logged" },
    ]));
    writeFileSync(candidatesPath, "");
    rmSync(envPath, { force: true });
    const rejected = spawnSync(
      process.execPath,
      ["scripts/catalogue-hotfix-workflow-helpers.mjs", "write-staging-public-key-candidates", responsePath, candidatesPath],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, TARGET_KIND: "staging", TARGET_PROJECT_REF: ref },
      },
    );
    assert.equal(rejected.status, 1);
    assert.equal(rejected.stdout, "");
    assert.match(rejected.stderr, /staging public API key candidates/i);
    assert.doesNotMatch(rejected.stderr, /sb_secret|never_logged/);
    assert.equal(existsSync(envPath), false);
    assert.equal(readFileSync(candidatesPath, "utf8"), "");
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("staging resolver shell retries only transient statuses and never probes fallback after indeterminate publishable", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-probe-"));
  const fakeBin = join(directory, "bin");
  const fakeCurl = join(fakeBin, "curl");
  const scenarios = [
    {
      name: "publishable-ready",
      candidates: { publishable: currentPublishable, legacy_anon: currentAnon },
      statuses: ["200"],
      exit: 0,
      calls: ["publishable"],
      expected: ["200", 1, "not-probed", 0, "publishable"],
      selected: currentPublishable,
    },
    {
      name: "explicit-401-fallback",
      candidates: { publishable: currentPublishable, legacy_anon: currentAnon },
      statuses: ["401", "200"],
      exit: 0,
      calls: ["publishable", "legacy_anon"],
      expected: ["401", 1, "200", 1, "legacy_anon"],
      selected: currentAnon,
    },
    {
      name: "both-inactive",
      candidates: { publishable: currentPublishable, legacy_anon: currentAnon },
      statuses: ["401", "401"],
      exit: 1,
      calls: ["publishable", "legacy_anon"],
      expected: ["401", 1, "401", 1, "none"],
    },
    {
      name: "fallback-absent",
      candidates: { publishable: currentPublishable, legacy_anon: null },
      statuses: ["401"],
      exit: 1,
      calls: ["publishable"],
      expected: ["401", 1, "not-probed", 0, "none"],
    },
    ...[
      ["transport-retry", "000"],
      ["timeout-retry", "408"],
      ["rate-limit-retry", "429"],
      ["server-retry", "503"],
    ].map(([name, firstStatus]) => ({
      name,
      candidates: { publishable: currentPublishable, legacy_anon: currentAnon },
      statuses: [firstStatus, "200"],
      exit: 0,
      calls: ["publishable", "publishable"],
      expected: ["200", 2, "not-probed", 0, "publishable"],
      selected: currentPublishable,
    })),
    {
      name: "indeterminate-never-falls-back",
      candidates: { publishable: currentPublishable, legacy_anon: currentAnon },
      statuses: ["503", "503", "503"],
      exit: 1,
      calls: ["publishable", "publishable", "publishable"],
      expected: ["503", 3, "not-probed", 0, "none"],
    },
    {
      name: "redirect-never-falls-back",
      candidates: { publishable: currentPublishable, legacy_anon: currentAnon },
      statuses: ["301"],
      exit: 1,
      calls: ["publishable"],
      expected: ["301", 1, "not-probed", 0, "none"],
    },
  ];
  try {
    mkdirSync(fakeBin);
    writeFileSync(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
: "${"${TEST_COUNT_FILE:?missing count file}"}"
: "${"${TEST_STATUS_PLAN:?missing status plan}"}"
: "${"${TEST_CALL_LOG:?missing call log}"}"
index="$(( $(<"$TEST_COUNT_FILE") + 1 ))"
printf '%s' "$index" > "$TEST_COUNT_FILE"
status="$(sed -n "${"${index}"}p" "$TEST_STATUS_PLAN")"
[ -n "$status" ] || exit 97
tier=unknown
while [ "$#" -gt 0 ]; do
  if [ "$1" = -H ] && [ "$#" -ge 2 ]; then
    shift
    if [ "$1" = "apikey: $TEST_PUBLISHABLE" ]; then tier=publishable; fi
    if [ "$1" = "apikey: $TEST_LEGACY_ANON" ]; then tier=legacy_anon; fi
  fi
  shift
done
printf '%s\n' "$tier" >> "$TEST_CALL_LOG"
if [ "$status" = 000 ]; then exit 28; fi
printf '%s' "$status"
`);
    chmodSync(fakeCurl, 0o700);
    const bashExecutable = spawnSync("where.exe", ["bash"], { encoding: "utf8" })
      .stdout.trim().split(/\r?\n/)[0];

    for (const scenario of scenarios) {
      const scenarioDirectory = join(directory, scenario.name);
      mkdirSync(scenarioDirectory);
      const candidatesPath = join(scenarioDirectory, "candidates.json");
      const statusPath = join(scenarioDirectory, "statuses.txt");
      const countPath = join(scenarioDirectory, "count.txt");
      const callLogPath = join(scenarioDirectory, "calls.txt");
      const envPath = join(scenarioDirectory, "github-env");
      writeFileSync(candidatesPath, `${JSON.stringify(scenario.candidates)}\n`);
      writeFileSync(statusPath, `${scenario.statuses.join("\n")}\n`);
      writeFileSync(countPath, "0");
      writeFileSync(callLogPath, "");
      const result = spawnSync(
        bashExecutable,
        [
          "-c",
          'export PATH="$TEST_FAKE_BIN:$PATH"; exec bash "$TEST_PROBE_SCRIPT" "$TEST_CANDIDATES_FILE"',
        ],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            GITHUB_ENV: envPath,
            TARGET_KIND: "staging",
            TARGET_PROJECT_REF: ref,
            TEST_STATUS_PLAN: statusPath,
            TEST_COUNT_FILE: countPath,
            TEST_CALL_LOG: callLogPath,
            TEST_PUBLISHABLE: currentPublishable,
            TEST_LEGACY_ANON: currentAnon,
            TEST_FAKE_BIN: fakeBin,
            TEST_PROBE_SCRIPT: join(process.cwd(), "scripts/catalogue-hotfix-staging-key-probe.sh"),
            TEST_CANDIDATES_FILE: candidatesPath,
            WSLENV: [
              process.env.WSLENV,
              "GITHUB_ENV/p",
              "TARGET_KIND",
              "TARGET_PROJECT_REF",
              "TEST_STATUS_PLAN/p",
              "TEST_COUNT_FILE/p",
              "TEST_CALL_LOG/p",
              "TEST_PUBLISHABLE",
              "TEST_LEGACY_ANON",
              "TEST_FAKE_BIN/p",
              "TEST_PROBE_SCRIPT/p",
              "TEST_CANDIDATES_FILE/p",
            ].filter(Boolean).join(":"),
          },
        },
      );
      assert.equal(result.status, scenario.exit, `${scenario.name}: ${result.stderr || result.error?.message}`);
      const diagnostic = JSON.parse(result.stdout.trim().split(/\r?\n/).at(-1));
      assert.deepEqual(diagnostic, {
        schema_version: 1,
        publishable_present: scenario.candidates.publishable !== null,
        legacy_anon_present: scenario.candidates.legacy_anon !== null,
        publishable_status: scenario.expected[0],
        publishable_attempts: scenario.expected[1],
        legacy_anon_status: scenario.expected[2],
        legacy_anon_attempts: scenario.expected[3],
        selected_tier: scenario.expected[4],
      }, scenario.name);
      assert.deepEqual(
        readFileSync(callLogPath, "utf8").trim().split(/\r?\n/).filter(Boolean),
        scenario.calls,
        scenario.name,
      );
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(`${currentPublishable}|${currentAnon}`));
      if (scenario.selected) {
        assert.equal(readFileSync(envPath, "utf8"), `TARGET_ANON_KEY=${scenario.selected}\n`);
      } else {
        assert.equal(existsSync(envPath), false);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("Supabase Auth settings readiness accepts only an exact successful response", () => {
  for (const status of [200, "200"]) {
    assert.doesNotThrow(() => workflowHelpers.validateSupabaseApiReadinessStatus(status));
  }
  for (const status of [0, "000", 201, 301, 400, 401, 403, 404, 429, 500, "not-a-status"]) {
    assert.throws(
      () => workflowHelpers.validateSupabaseApiReadinessStatus(status),
      /Supabase API readiness failed with HTTP (?:\d{3}|invalid)\./,
    );
  }
});

test("Supabase readiness CLI reports only a sanitized HTTP status", () => {
  const secret = "sb_publishable_must_not_be_logged";
  const result = spawnSync(
    process.execPath,
    ["scripts/catalogue-hotfix-workflow-helpers.mjs", "validate-api-readiness", `401-${secret}`],
    { cwd: process.cwd(), encoding: "utf8" },
  );
  assert.equal(result.status, 1);
  assert.equal(result.stdout, "");
  assert.equal(result.stderr, "Supabase API readiness failed with HTTP invalid.\n");
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(secret));
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

function productionRecords(run_bucket = 0) {
  const sorts = ["featured", "newest", "price-asc", "price-desc", "ai-score", "views"];
  return Array.from({ length: 30 }, (_, index) => {
    const pair = index + 1;
    const page = 301 + (run_bucket % 6) * 30 + index;
    const sort = sorts[Math.floor(run_bucket / 6)];
    const key = `page=${page}&pageSize=12&offset=0&sort=${sort}`;
    const url = `https://portal.maiprop.co/api/public/listings?${key}`;
    return [
      {
        pair,
        run_bucket,
        page,
        sort,
        phase: "cold",
        normalized_url: url,
        normalized_cache_key: key,
        status: 200,
        duration_ms: index + 1,
        ...inspectPublicListingBody(JSON.stringify({ data: Array.from({ length: 12 }, () => ({ id: "card" })) })),
        cache: { source: "x-maiprop-cache", state: index === 0 ? "BYPASS" : "MISS" },
      },
      {
        pair,
        run_bucket,
        page,
        sort,
        phase: "warm",
        normalized_url: url,
        normalized_cache_key: key,
        status: 200,
        duration_ms: index + 101,
        ...inspectPublicListingBody(JSON.stringify({ data: Array.from({ length: 12 }, () => ({ id: "card" })) })),
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
  assert.deepEqual(
    parseCacheState("HTTP/2 503\r\nCF-Cache-Status: DYNAMIC\r\n"),
    { source: "cf-cache-status", state: "DYNAMIC" },
  );
  assert.deepEqual(
    parseCacheState("x-maiprop-cache: MISS\r\nx-maiprop-cache: HIT\r\n"),
    { source: "x-maiprop-cache", state: "UNSUPPORTED" },
  );
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
  assert.equal(result.cold.samples[0].normalized_url, "https://portal.maiprop.co/api/public/listings?page=301&pageSize=12&offset=0&sort=featured");

  const wrongState = productionRecords();
  wrongState.at(-2).cache.state = "HIT";
  assert.throws(() => summarizeLatencySamples({ targetKind: "production", contract, records: wrongState }));

  const wrongKey = productionRecords();
  wrongKey[0].normalized_cache_key = "page=301&offset=0";
  assert.throws(() => summarizeLatencySamples({ targetKind: "production", contract, records: wrongKey }));

  const slowOutlier = productionRecords();
  slowOutlier.at(-2).duration_ms = 1801;
  assert.throws(() => summarizeLatencySamples({ targetKind: "production", contract, records: slowOutlier }));

  const emptySuccess = productionRecords();
  Object.assign(emptySuccess[0], inspectPublicListingBody('{"data":[]}'));
  const emptyEvidence = buildLatencyEvidence({ targetKind: "production", contract, records: emptySuccess });
  assert.equal(emptyEvidence.cold.samples[0].item_count, 0);
  assert.equal(emptyEvidence.cold.samples[0].body_shape_valid, true);
  assert.throws(() => assertLatencyEvidencePasses(emptyEvidence));

  const shortPage = productionRecords();
  shortPage[0].item_count = 11;
  assert.throws(() => assertLatencyEvidencePasses(buildLatencyEvidence({ targetKind: "production", contract, records: shortPage })));

  const retryBucket = summarizeLatencySamples({
    targetKind: "production",
    contract,
    records: productionRecords(35),
  });
  assert.equal(retryBucket.cold.samples[0].normalized_cache_key, "page=451&pageSize=12&offset=0&sort=views");
  assert.equal(retryBucket.cold.samples.at(-1).normalized_cache_key, "page=480&pageSize=12&offset=0&sort=views");
});

test("public response inspection preserves 503 and malformed bodies without throwing", () => {
  assert.deepEqual(inspectPublicListingBody('{"error":"unavailable"}'), {
    item_count: null,
    body_shape_valid: false,
  });
  assert.deepEqual(inspectPublicListingBody('<html>upstream failed</html>'), {
    item_count: null,
    body_shape_valid: false,
  });
  assert.deepEqual(inspectPublicListingBody('{"data":[]}'), {
    item_count: 0,
    body_shape_valid: true,
  });

  const unavailable = productionRecords();
  unavailable[0].status = 503;
  Object.assign(unavailable[0], inspectPublicListingBody('{"error":"unavailable"}'));
  unavailable[0].cache = parseCacheState("HTTP/2 503\r\nCF-Cache-Status: DYNAMIC\r\n");
  const unavailableEvidence = buildLatencyEvidence({ targetKind: "production", contract, records: unavailable });
  assert.equal(unavailableEvidence.cold.samples[0].status, 503);
  assert.equal(unavailableEvidence.cold.samples[0].item_count, null);
  assert.equal(unavailableEvidence.cold.samples[0].body_shape_valid, false);
  assert.deepEqual(unavailableEvidence.cold.samples[0].cache, {
    source: "cf-cache-status",
    state: "DYNAMIC",
  });
  assert.throws(() => assertLatencyEvidencePasses(unavailableEvidence));

  const malformed = productionRecords();
  Object.assign(malformed[1], inspectPublicListingBody('not-json'));
  const malformedEvidence = buildLatencyEvidence({ targetKind: "production", contract, records: malformed });
  assert.equal(malformedEvidence.warm.samples[0].item_count, null);
  assert.equal(malformedEvidence.warm.samples[0].body_shape_valid, false);
  assert.throws(() => assertLatencyEvidencePasses(malformedEvidence));
});

const projectFixtures = {
  nullProject: {
    id: "00000000-0000-4000-8000-000000000001",
    status: "active",
    is_off_market: false,
    city: "Athens",
    location_search_text: "athens attica",
    project: null,
    listing_images: [{ id: "one" }],
  },
  objectProject: {
    id: "00000000-0000-4000-8000-000000000002",
    status: "active",
    is_off_market: false,
    city: "Piraeus",
    location_search_text: "piraeus attica",
    project: { id: "project" },
    listing_images: [{ id: "one" }, { id: "two" }],
  },
};

function validBehaviourFixture() {
  const context = selectCatalogueProbeContext([
    projectFixtures.objectProject,
    projectFixtures.nullProject,
  ]);
  return {
    context,
    cardRows: [{ ...projectFixtures.nullProject }],
    detailRows: [{
      id: projectFixtures.nullProject.id,
      status: "active",
      is_off_market: false,
      project: null,
      listing_images: [{ id: "one" }, { id: "two" }],
    }],
    publicationRows: [{
      publication_id: 42,
      snapshot_minute: "2026-08-28T12:00:00.000Z",
      published_at: "2026-08-28T12:00:01.000Z",
      retain_until: "2026-08-28T13:00:00.000Z",
      row_count: 12,
    }],
    typedRows: [{
      publication_id: 42,
      listing_id: projectFixtures.nullProject.id,
      card_payload: { id: projectFixtures.nullProject.id },
    }],
  };
}

test("catalogue behavioural proof accepts null project but rejects missing or wrong project fields", () => {
  const fixture = validBehaviourFixture();
  assert.equal(fixture.context.id, projectFixtures.nullProject.id, "seed selection is deterministic by id");
  assert.doesNotThrow(() => validateCatalogueBehaviorProbe(fixture));

  const missing = validBehaviourFixture();
  delete missing.cardRows[0].project;
  assert.throws(() => validateCatalogueBehaviorProbe(missing), /project/i);

  const arrayProject = validBehaviourFixture();
  arrayProject.detailRows[0].project = [];
  assert.throws(() => validateCatalogueBehaviorProbe(arrayProject), /project/i);

  const scalarProject = validBehaviourFixture();
  scalarProject.cardRows[0].project = "wrong";
  assert.throws(() => validateCatalogueBehaviorProbe(scalarProject), /project/i);
});

test("catalogue behavioural proof rejects empty 200 bodies and enforces exact card/detail binding", () => {
  const emptyCard = validBehaviourFixture();
  emptyCard.cardRows = [];
  assert.throws(() => validateCatalogueBehaviorProbe(emptyCard), /nonempty/i);

  const emptyDetail = validBehaviourFixture();
  emptyDetail.detailRows = [];
  assert.throws(() => validateCatalogueBehaviorProbe(emptyDetail), /nonempty/i);

  const wrongCardId = validBehaviourFixture();
  wrongCardId.cardRows[0].id = projectFixtures.objectProject.id;
  assert.throws(() => validateCatalogueBehaviorProbe(wrongCardId), /id/i);

  const wrongDetailId = validBehaviourFixture();
  wrongDetailId.detailRows[0].id = projectFixtures.objectProject.id;
  assert.throws(() => validateCatalogueBehaviorProbe(wrongDetailId), /id/i);

  const wrongLocation = validBehaviourFixture();
  wrongLocation.cardRows[0].location_search_text = "Thessaloniki";
  assert.throws(() => validateCatalogueBehaviorProbe(wrongLocation), /location_search_text/i);
});

test("catalogue behavioural proof requires real typed and publication results", () => {
  const emptyTyped = validBehaviourFixture();
  emptyTyped.typedRows = [];
  assert.throws(() => validateCatalogueBehaviorProbe(emptyTyped), /typed/i);

  const emptyPublication = validBehaviourFixture();
  emptyPublication.publicationRows = [];
  assert.throws(() => validateCatalogueBehaviorProbe(emptyPublication), /publication/i);

  const wrongPublication = validBehaviourFixture();
  wrongPublication.typedRows[0].publication_id = 99;
  assert.throws(() => validateCatalogueBehaviorProbe(wrongPublication), /publication/i);
});

test("database contract requires anon grants and actual typed/publication invocations", () => {
  const metadata = {
    migration_versions: ["20260728123058", "20260729120405"],
    private_catalogue_tables: true,
    private_catalogue_rls_enabled: true,
    private_catalogue_rls_forced: false,
    private_catalogue_no_direct_privileges: true,
    first_indexes: true,
    legacy_rpc: true,
    publication_rpc: true,
    typed_rpc: true,
    anon_legacy_execute: true,
    anon_publication_execute: true,
    anon_typed_execute: true,
  };
  const invocation = {
    publication_call_rows: 1,
    publication_shape: true,
    typed_call_rows: 1,
    typed_shape: true,
  };
  const restProbe = validateCatalogueBehaviorProbe(validBehaviourFixture());
  const firstMetadata = { ...metadata, migration_versions: ["20260728123058"] };
  assert.doesNotThrow(() => validateDatabaseContract({ metadata: firstMetadata, invocation, restProbe }));
  assert.equal(JSON.stringify(validateDatabaseContract({ metadata: firstMetadata, invocation, restProbe })).includes(projectFixtures.nullProject.id), false);
  assert.throws(() => validateDatabaseContract({ metadata: { ...firstMetadata, anon_typed_execute: false }, invocation, restProbe }), /grant/i);
  assert.throws(() => validateDatabaseContract({ metadata: firstMetadata, invocation: { ...invocation, typed_call_rows: 0 }, restProbe }), /invocation/i);
});

test("cron proof derives both count and minute boundaries only from post-baseline runs", () => {
  const baseline = {
    schedule: "* * * * *",
    command: "SELECT private.publish_public_catalogue();",
    active: true,
    publication_id: 10,
    successful_runs: [
      { runid: 1, start_time: "2026-08-28T12:00:05Z" },
      { runid: 2, start_time: "2026-08-28T12:01:05Z" },
    ],
  };
  const current = {
    ...baseline,
    publication_id: 12,
    successful_runs: [
      ...baseline.successful_runs,
      { runid: 3, start_time: "2026-08-28T12:02:05Z" },
      { runid: 4, start_time: "2026-08-28T12:03:05Z" },
    ],
  };
  const proof = buildCronProof({ baseline, current, elapsedSeconds: 125 });
  assert.equal(proof.new_successful_runs, 2);
  assert.equal(proof.distinct_run_minutes, 2);
  assert.deepEqual(proof.new_run_minutes, ["2026-08-28T12:02", "2026-08-28T12:03"]);

  const oldMinutesOnly = {
    ...current,
    successful_runs: [
      ...baseline.successful_runs,
      { runid: 3, start_time: "2026-08-28T12:01:15Z" },
      { runid: 4, start_time: "2026-08-28T12:01:45Z" },
    ],
  };
  assert.throws(() => buildCronProof({ baseline, current: oldMinutesOnly, elapsedSeconds: 125 }), /minute/i);
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
