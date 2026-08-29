import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import * as workflowHelpers from "./catalogue-hotfix-workflow-helpers.mjs";
import {
  artifactPathsForTarget,
  assertLatencyEvidencePasses,
  buildTemporaryPoolerDatabaseCredential,
  buildTemporaryDatabaseCredential,
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

function resolveBashExecutable() {
  if (process.platform !== "win32") return "bash";
  const result = spawnSync("where.exe", ["bash"], { encoding: "utf8" });
  assert.equal(result.status, 0, "Bash must be available for shell-contract tests");
  return result.stdout.trim().split(/\r?\n/)[0];
}

const bashExecutable = resolveBashExecutable();

const ref = "xsiehskfgeoqyazcgauv";
const valid = {
  kind: "staging",
  ref,
  apiUrl: `https://${ref}.supabase.co/`,
  databaseUrl: `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?sslmode=require`,
  key: "sb_publishable_safe_key",
};

function poolerConfiguration(projectRef = ref, changed = {}) {
  const host = "aws-0-eu-central-1.pooler.supabase.com";
  return [{
    identifier: projectRef,
    database_type: "PRIMARY",
    db_user: `postgres.${projectRef}`,
    db_host: host,
    db_port: 6543,
    db_name: "postgres",
    connection_string: `postgresql://postgres.${projectRef}:[YOUR-PASSWORD]@${host}:6543/postgres`,
    pool_mode: "transaction",
    default_pool_size: null,
    max_client_conn: null,
    is_using_scram_auth: true,
    ...changed,
  }];
}

test("catalogue hotfix target validator requires exact Supabase identities", () => {
  assert.doesNotThrow(() => validateTarget(valid));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://user@${ref}.supabase.co/` }));
  assert.throws(() => validateTarget({ ...valid, databaseUrl: `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?sslmode=disable` }));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://${ref}.supabase.co/?x=1` }));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://${ref}.supabase.co/not-root` }));
  assert.throws(() => validateTarget({ ...valid, apiUrl: `https://${ref}.supabase.co/\n` }));
  assert.throws(() => validateTarget({ ...valid, databaseUrl: `${valid.databaseUrl}\n` }));
  assert.throws(() => validateTarget({ ...valid, kind: "preview" }));
  assert.throws(() => validateTarget({ ...valid, key: "sb_secret_not_allowed" }));
  assert.throws(() => validateTarget({ ...valid, ref: "qvvicunqcrwpioqnvzxf" }));
  assert.throws(() => validateTarget({ ...valid, kind: "production" }));
  assert.doesNotThrow(() => validateTarget({ ...valid, kind: "production", ref: "qvvicunqcrwpioqnvzxf", apiUrl: "https://qvvicunqcrwpioqnvzxf.supabase.co/", databaseUrl: "postgresql://postgres:password@db.qvvicunqcrwpioqnvzxf.supabase.co:5432/postgres?sslmode=require" }));
  assert.doesNotThrow(() => validateTarget({ ...valid, databaseUrl: `postgresql://postgres.${ref}:password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?sslmode=require` }));
  const jwt = `x.${Buffer.from(JSON.stringify({ role: "anon", ref })).toString("base64url")}.x`;
  assert.doesNotThrow(() => validateTarget({ ...valid, key: jwt }));
});

test("database URL TLS normalization discards preexisting options and requires TLS", () => {
  assert.equal(
    workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres"),
    "postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require",
  );
  assert.equal(
    workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres?connect_timeout=10"),
    "postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require",
  );
  assert.equal(
    workflowHelpers.normalizeDatabaseUrlTls("postgresql://postgres:secret@db.example.test:5432/postgres?host=attacker.example&options=-c%20role%3Dattacker&sslmode=require"),
    "postgresql://postgres:secret@db.example.test:5432/postgres?sslmode=require",
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
  assert.throws(
    () => workflowHelpers.normalizeDatabaseUrlTls("postgresql://"),
    /normalized safely/i,
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

test("temporary database credentials preserve the exact target and assume postgres", () => {
  const response = { role: "cli_login_01234567", password: "temporary:p@ss", ttl_seconds: 3600 };
  const direct = buildTemporaryDatabaseCredential({
    kind: "staging",
    ref,
    databaseUrl: valid.databaseUrl,
    response,
  });
  const pooler = buildTemporaryDatabaseCredential({
    kind: "staging",
    ref,
    databaseUrl: `postgresql://postgres.${ref}:old@aws-0-eu-central-1.pooler.supabase.com:5432/postgres?sslmode=require`,
    response,
  });
  const directUrl = new URL(direct.databaseUrl);
  const poolerUrl = new URL(pooler.databaseUrl);

  assert.equal(decodeURIComponent(directUrl.username), response.role);
  assert.equal(decodeURIComponent(poolerUrl.username), `${response.role}.${ref}`);
  for (const [url, host] of [
    [directUrl, `db.${ref}.supabase.co`],
    [poolerUrl, "aws-0-eu-central-1.pooler.supabase.com"],
  ]) {
    assert.equal(url.hostname, host);
    assert.equal(url.pathname, "/postgres");
    assert.equal(url.searchParams.get("sslmode"), "require");
    assert.equal(url.searchParams.get("options"), "-c role=postgres");
    assert.equal(decodeURIComponent(url.password), response.password);
  }
  assert.equal(direct.role, response.role);
  assert.equal(direct.ttlSeconds, 3600);
  assert.match(direct.databaseUrl, /options=-c%20role%3Dpostgres/);
  assert.doesNotMatch(direct.databaseUrl, /options=-c\+role/);
});

test("temporary database credentials use the manifest-bound PRIMARY IPv4 pooler", () => {
  const response = { role: "cli_login_postgres", password: "temporary:p@ss", ttl_seconds: 300 };
  const sessionConnection = `postgresql://postgres.${ref}:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`;
  for (const poolerResponse of [
    poolerConfiguration(),
    poolerConfiguration(ref, {
      db_port: 5432,
      pool_mode: "session",
      connection_string: sessionConnection,
    }),
  ]) {
    const temporary = buildTemporaryPoolerDatabaseCredential({
      kind: "staging",
      ref,
      databaseUrl: valid.databaseUrl,
      response,
      poolerResponse,
    });
    const url = new URL(temporary.databaseUrl);
    assert.equal(url.hostname, "aws-0-eu-central-1.pooler.supabase.com");
    assert.equal(url.port, "5432");
    assert.equal(decodeURIComponent(url.username), `${response.role}.${ref}`);
    assert.equal(decodeURIComponent(url.password), response.password);
    assert.equal(url.pathname, "/postgres");
    assert.equal(url.searchParams.get("sslmode"), "require");
    assert.equal(url.searchParams.get("options"), "-c role=postgres");
    assert.match(temporary.databaseUrl, /options=-c%20role%3Dpostgres/);
    assert.doesNotMatch(temporary.databaseUrl, /options=-c\+role/);
    assert.equal(temporary.role, response.role);
    assert.equal(temporary.ttlSeconds, 300);
  }
});

test("temporary pooler credentials reject ambiguous or cross-project provider configuration", () => {
  const response = { role: "cli_login_postgres", password: "temporary", ttl_seconds: 300 };
  const input = {
    kind: "staging",
    ref,
    databaseUrl: valid.databaseUrl,
    response,
    poolerResponse: poolerConfiguration(),
  };
  for (const poolerResponse of [
    [],
    [...poolerConfiguration(), ...poolerConfiguration()],
    poolerConfiguration("qvvicunqcrwpioqnvzxf"),
    poolerConfiguration(ref, { identifier: "qvvicunqcrwpioqnvzxf" }),
    poolerConfiguration(ref, { database_type: "READ_REPLICA" }),
    poolerConfiguration(ref, { db_user: "postgres.attacker" }),
    poolerConfiguration(ref, { db_host: "attacker.example" }),
    poolerConfiguration(ref, { db_host: `aws-0-eu-central-1.pooler.supabase.com.attacker.example` }),
    poolerConfiguration(ref, { db_port: 5432 }),
    poolerConfiguration(ref, { db_port: 6432 }),
    poolerConfiguration(ref, { db_name: "template1" }),
    poolerConfiguration(ref, { pool_mode: "session" }),
    poolerConfiguration(ref, { is_using_scram_auth: false }),
    poolerConfiguration(ref, { connection_string: `postgresql://postgres.${ref}:[YOUR-PASSWORD]@attacker.example:6543/postgres` }),
    poolerConfiguration(ref, { connection_string: `postgresql://postgres.attacker:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres` }),
    poolerConfiguration(ref, { connection_string: `postgresql://postgres.${ref}:real-password@aws-0-eu-central-1.pooler.supabase.com:6543/postgres` }),
    poolerConfiguration(ref, { connection_string: `postgresql://postgres.${ref}:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres` }),
    poolerConfiguration(ref, { connection_string: `postgresql://postgres.${ref}:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/template1` }),
    poolerConfiguration(ref, { connection_string: `postgresql://postgres.${ref}:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres?host=attacker.example` }),
    poolerConfiguration(ref, { connection_string: `postgresql://postgres.${ref}:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:6543/postgres#fragment` }),
    { data: poolerConfiguration() },
  ]) {
    assert.throws(() => buildTemporaryPoolerDatabaseCredential({ ...input, poolerResponse }));
  }
});

test("temporary database credentials reject unsafe responses and target drift", () => {
  const response = { role: "cli_login_01234567", password: "temporary", ttl_seconds: 3600 };
  const input = { kind: "staging", ref, databaseUrl: valid.databaseUrl, response };
  for (const changed of [
    { response: { ...response, ttl_seconds: 299 } },
    { response: { ...response, ttl_seconds: "3600" } },
    { response: { ...response, ttl_seconds: 3000.5 } },
    { response: { ...response, ttl_seconds: null } },
    { response: { ...response, extra: true } },
    { response: { ...response, role: "postgres" } },
    { response: { ...response, role: "cli\nlogin" } },
    { response: { ...response, password: "" } },
    { databaseUrl: `postgresql://postgres:old@db.qvvicunqcrwpioqnvzxf.supabase.co:5432/postgres?sslmode=require` },
    { databaseUrl: `postgresql://postgres:old@db.${ref}.supabase.co:5432/postgres?sslmode=require&options=-c+statement_timeout%3D0` },
    { kind: "production" },
  ]) {
    assert.throws(() => buildTemporaryDatabaseCredential({ ...input, ...changed }));
  }
  assert.doesNotThrow(() => buildTemporaryDatabaseCredential({
    kind: "production",
    ref: "qvvicunqcrwpioqnvzxf",
    databaseUrl: "postgresql://postgres:old@db.qvvicunqcrwpioqnvzxf.supabase.co:5432/postgres?sslmode=require",
    response: { ...response, ttl_seconds: 300 },
  }));
  for (const ttl_seconds of [300, 301, 3600]) {
    assert.doesNotThrow(() => buildTemporaryDatabaseCredential({
      ...input,
      response: { ...response, ttl_seconds },
    }));
  }
});

const forbiddenLibpqConnectionParameters = [
  "host=attacker.example",
  "hostaddr=127.0.0.1",
  "port=6543",
  "user=postgres",
  "password=override",
  "dbname=template1",
  "service=attacker",
  "servicefile=%2Ftmp%2Fservice.conf",
  "target_session_attrs=read-write",
  "connect_timeout=10",
  "unknown_key=value",
  "sslmode=require&sslmode=require",
  "options=-c%20role%3Dpostgres",
];

test("database credential builder rejects every preexisting libpq authority override", () => {
  const response = { role: "cli_login_01234567", password: "temporary", ttl_seconds: 3600 };
  for (const parameter of forbiddenLibpqConnectionParameters) {
    assert.throws(() => buildTemporaryDatabaseCredential({
      kind: "staging",
      ref,
      databaseUrl: `${valid.databaseUrl}&${parameter}`,
      response,
    }), /database|Supabase target/i, parameter);
  }
});

test("target validator rejects libpq authority overrides for stored and temporary logins", () => {
  const role = "cli_login_01234567";
  const temporaryBase = `postgresql://${role}:temporary@db.${ref}.supabase.co:5432/postgres?sslmode=require&options=-c%20role%3Dpostgres`;
  for (const parameter of forbiddenLibpqConnectionParameters) {
    assert.throws(() => validateTarget({
      ...valid,
      databaseUrl: `${valid.databaseUrl}&${parameter}`,
    }), /database URL/i, `stored: ${parameter}`);
    assert.throws(() => validateTarget({
      ...valid,
      ephemeralRole: role,
      databaseUrl: `${temporaryBase}&${parameter}`,
    }), /database URL/i, `temporary: ${parameter}`);
  }
});

test("database workflow CLIs reject authority overrides without persisting derived state", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-db-authority-"));
  const responsePath = join(directory, "response.json");
  const poolerResponsePath = join(directory, "pooler-response.json");
  const envPath = join(directory, "github-env");
  writeFileSync(responsePath, JSON.stringify({
    role: "cli_login_01234567",
    password: "temporary",
    ttl_seconds: 3600,
  }));
  writeFileSync(poolerResponsePath, JSON.stringify(poolerConfiguration()));
  try {
    const commonEnv = {
      ...process.env,
      GITHUB_ENV: envPath,
      TARGET_KIND: "staging",
      TARGET_PROJECT_REF: ref,
      TARGET_API_URL: valid.apiUrl,
      TARGET_ANON_KEY: valid.key,
      TARGET_DB_URL: `${valid.databaseUrl}&hostaddr=127.0.0.1`,
    };
    const mint = spawnSync(process.execPath, [
      "scripts/catalogue-hotfix-workflow-helpers.mjs",
      "write-temporary-db-env",
      responsePath,
      poolerResponsePath,
    ], { cwd: process.cwd(), encoding: "utf8", env: commonEnv });
    assert.equal(mint.status, 1);
    assert.equal(mint.stdout, "");
    assert.equal(existsSync(envPath), false);

    const validate = spawnSync(process.execPath, [
      "scripts/catalogue-hotfix-workflow-helpers.mjs",
      "validate-target",
    ], { cwd: process.cwd(), encoding: "utf8", env: commonEnv });
    assert.equal(validate.status, 1);
    assert.equal(validate.stdout, "");
    assert.equal(existsSync(envPath), false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("temporary database credential CLI masks before persisting the ephemeral values", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-db-login-"));
  const responsePath = join(directory, "response.json");
  const poolerResponsePath = join(directory, "pooler-response.json");
  const envPath = join(directory, "github-env");
  const response = { role: "cli_login_01234567", password: "temporary-secret", ttl_seconds: 7200 };
  writeFileSync(responsePath, JSON.stringify(response));
  writeFileSync(poolerResponsePath, JSON.stringify(poolerConfiguration()));
  try {
    const result = spawnSync(process.execPath, [
      "scripts/catalogue-hotfix-workflow-helpers.mjs",
      "write-temporary-db-env",
      responsePath,
      poolerResponsePath,
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ENV: envPath,
        TARGET_KIND: "staging",
        TARGET_PROJECT_REF: ref,
        TARGET_DB_URL: valid.databaseUrl,
      },
    });
    assert.equal(result.status, 0, result.stderr);
    const lines = result.stdout.trim().split("\n");
    assert.equal(lines.length, 4);
    assert.equal(lines[0], `::add-mask::${response.role}`);
    assert.equal(lines[1], `::add-mask::${response.password}`);
    assert.match(lines[2], /^::add-mask::postgresql:/);
    assert.equal(lines[3], "::notice::Temporary database login TTL accepted: 7200s (minimum 300s).");
    const persisted = readFileSync(envPath, "utf8");
    assert.match(persisted, /^TARGET_DB_URL=postgresql:/m);
    assert.match(persisted, new RegExp(`^TARGET_DB_EPHEMERAL_ROLE=${response.role}$`, "m"));
    assert.doesNotMatch(result.stderr, /temporary-secret|cli_login/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("temporary database login shell uses exact private pooler and login requests and fails closed", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-db-login-shell-"));
  const fakeBin = join(directory, "bin");
  const fakeCurl = join(fakeBin, "curl");
  const runnerTemp = join(directory, "runner-temp");
  const responsePath = join(directory, "response.json");
  const poolerResponsePath = join(directory, "pooler-response.json");
  const envPath = join(directory, "github-env");
  const resultPath = join(directory, "curl-result");
  const role = "cli_login_01234567";
  const password = "temporary-shell-secret";
  const accessToken = "management-token-never-log";
  try {
    mkdirSync(fakeBin);
    mkdirSync(runnerTemp);
    writeFileSync(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
method=""; output=""; data=""; url=""; auth=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    --request) shift; method="$1" ;;
    -o) shift; output="$1" ;;
    --data) shift; data="$1" ;;
    -H) shift; if [ "$1" = "Authorization: Bearer $TEST_ACCESS_TOKEN" ]; then auth=true; fi ;;
    https://*) url="$1" ;;
  esac
  shift
done
[ "$auth" = true ]
if [ "$url" = "$TEST_EXPECTED_POOLER_ENDPOINT" ]; then
  [ "$method" = GET ]
  [ -z "$data" ]
  cp "$TEST_POOLER_RESPONSE" "$output"
  printf 'pooler\n' >> "$TEST_RESULT"
  printf '%s' "$TEST_POOLER_STATUS"
else
  [ "$method" = POST ]
  [ "$data" = '{"read_only":false}' ]
  [ "$url" = "$TEST_EXPECTED_ENDPOINT" ]
  cp "$TEST_RESPONSE" "$output"
  printf 'login\n' >> "$TEST_RESULT"
  printf '%s' "$TEST_STATUS"
fi
`);
    chmodSync(fakeCurl, 0o700);
    const run = ({ status, response, poolerStatus = "200", poolerResponse = poolerConfiguration() }) => {
      writeFileSync(responsePath, typeof response === "string" ? response : JSON.stringify(response));
      writeFileSync(poolerResponsePath, typeof poolerResponse === "string" ? poolerResponse : JSON.stringify(poolerResponse));
      rmSync(envPath, { force: true });
      rmSync(resultPath, { force: true });
      const result = spawnSync(bashExecutable, [
        "-c",
        'export PATH="$TEST_FAKE_BIN:$PATH"; exec bash "$TEST_LOGIN_SCRIPT"',
      ], {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          GITHUB_ENV: envPath,
          RUNNER_TEMP: runnerTemp,
          SUPABASE_ACCESS_TOKEN: accessToken,
          TARGET_KIND: "staging",
          TARGET_PROJECT_REF: ref,
          TARGET_DB_URL: valid.databaseUrl,
          TEST_ACCESS_TOKEN: accessToken,
          TEST_EXPECTED_ENDPOINT: `https://api.supabase.com/v1/projects/${ref}/cli/login-role`,
          TEST_EXPECTED_POOLER_ENDPOINT: `https://api.supabase.com/v1/projects/${ref}/config/database/pooler`,
          TEST_FAKE_BIN: fakeBin,
          TEST_LOGIN_SCRIPT: join(process.cwd(), "scripts/catalogue-hotfix-database-login.sh"),
          TEST_POOLER_RESPONSE: poolerResponsePath,
          TEST_POOLER_STATUS: poolerStatus,
          TEST_RESPONSE: responsePath,
          TEST_RESULT: resultPath,
          TEST_STATUS: status,
          WSLENV: [
            process.env.WSLENV,
            "GITHUB_ENV/p",
            "RUNNER_TEMP/p",
            "SUPABASE_ACCESS_TOKEN",
            "TARGET_KIND",
            "TARGET_PROJECT_REF",
            "TARGET_DB_URL",
            "TEST_ACCESS_TOKEN",
            "TEST_EXPECTED_ENDPOINT",
            "TEST_EXPECTED_POOLER_ENDPOINT",
            "TEST_FAKE_BIN/p",
            "TEST_LOGIN_SCRIPT/p",
            "TEST_POOLER_RESPONSE/p",
            "TEST_POOLER_STATUS",
            "TEST_RESPONSE/p",
            "TEST_RESULT/p",
            "TEST_STATUS",
          ].filter(Boolean).join(":"),
        },
      });
      assert.equal(
        readFileSync(resultPath, "utf8"),
        poolerStatus === "200" ? "pooler\nlogin\n" : "pooler\n",
      );
      assert.equal(readdirSync(runnerTemp).length, 0, "private response is removed on every exit");
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(accessToken));
      return result;
    };

    const success = run({
      status: "201",
      response: { role, password, ttl_seconds: 300 },
    });
    assert.equal(success.status, 0, success.stderr);
    assert.equal(success.stderr, "");
    const successLines = success.stdout.trim().split(/\r?\n/);
    assert.equal(successLines.filter((line) => line.startsWith("::add-mask::")).length, 3);
    assert.ok(successLines.includes("::notice::Temporary database login TTL accepted: 300s (minimum 300s)."));
    assert.match(readFileSync(envPath, "utf8"), new RegExp(`^TARGET_DB_EPHEMERAL_ROLE=${role}$`, "m"));

    for (const scenario of [
      { status: "201", response: { role, password, ttl_seconds: 300 }, poolerStatus: "403", poolerResponse: { private: "pooler-body-must-not-log" } },
      { status: "401", response: { private: "body-must-not-log" } },
      { status: "201", response: { role, password, ttl_seconds: 299 } },
      { status: "201", response: "malformed-private-body" },
    ]) {
      const rejected = run(scenario);
      assert.equal(rejected.status, 1);
      assert.equal(existsSync(envPath), false);
      assert.doesNotMatch(`${rejected.stdout}${rejected.stderr}`, /body-must-not-log|pooler-body-must-not-log|malformed-private-body|temporary-shell-secret/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("database phase wrapper keeps a fresh credential private to one validated command", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-db-phase-"));
  const fakeBin = join(directory, "bin");
  const fakeCurl = join(fakeBin, "curl");
  const fakePsql = join(fakeBin, "psql");
  const fakeSleep = join(fakeBin, "sleep");
  const fakeTimeout = join(fakeBin, "timeout");
  const runnerTemp = join(directory, "runner-temp");
  const responsePath = join(directory, "response.json");
  const poolerResponsePath = join(directory, "pooler-response.json");
  const realEnvPath = join(directory, "github-env");
  const phaseScript = join(directory, "phase.sh");
  const phaseResult = join(directory, "phase-result");
  const readinessAttempts = join(directory, "readiness-attempts");
  const role = "cli_login_01234567";
  const password = "phase-only-secret";
  const accessToken = "phase-management-token-never-log";
  try {
    mkdirSync(fakeBin);
    mkdirSync(runnerTemp);
    writeFileSync(responsePath, JSON.stringify({ role, password, ttl_seconds: 300 }));
    writeFileSync(poolerResponsePath, JSON.stringify(poolerConfiguration()));
    writeFileSync(realEnvPath, "UNCHANGED=1\n");
    writeFileSync(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
output=""; url=""; auth=false
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift; output="$1" ;;
    -H) shift; if [ "$1" = "Authorization: Bearer $TEST_ACCESS_TOKEN" ]; then auth=true; fi ;;
    https://*) url="$1" ;;
  esac
  shift
done
[ "$auth" = true ]
if [[ "$url" == */config/database/pooler ]]; then
  cp "$TEST_POOLER_RESPONSE" "$output"
  printf '200'
else
  cp "$TEST_RESPONSE" "$output"
  printf '201'
fi
`);
    writeFileSync(fakePsql, `#!/usr/bin/env bash
set -euo pipefail
if [ -n "\${SUPABASE_ACCESS_TOKEN+x}" ]; then
  exit 31
fi
[ "$1" = "$TARGET_DB_URL" ]
[ "$2" = "--no-psqlrc" ]
[ "$3" = "--set" ]
[ "$4" = "ON_ERROR_STOP=1" ]
[ "$5" = "-qAt" ]
[ "$6" = "--command" ]
[ "$7" = "SET ROLE postgres" ]
[ "$8" = "--command" ]
[ "$9" = "SELECT current_user = 'postgres'" ]
[ "\${PGCONNECT_TIMEOUT:-}" = "4" ]
node --input-type=module -e '
  const url = new URL(process.env.TARGET_DB_URL);
  if (url.hostname !== "aws-0-eu-central-1.pooler.supabase.com" ||
      url.port !== "5432" ||
      decodeURIComponent(url.username) !== process.env.TEST_ROLE + "." + process.env.TARGET_PROJECT_REF) process.exit(1);
'
attempts=0
if [ -f "$TEST_READINESS_ATTEMPTS" ]; then attempts="$(cat "$TEST_READINESS_ATTEMPTS")"; fi
attempts=$((attempts + 1))
printf '%s' "$attempts" > "$TEST_READINESS_ATTEMPTS"
if [ "\${TEST_PSQL_HANG:-}" = "1" ]; then exec /bin/sleep 30; fi
if [ "$attempts" -lt 3 ]; then exit 2; fi
if [ "\${TEST_PSQL_IDENTITY:-true}" = "true" ]; then printf 't\n'; else printf 'f\n'; fi
`);
    writeFileSync(fakeSleep, `#!/usr/bin/env bash
set -euo pipefail
[ "$#" -eq 1 ]
[ "$1" = "2" ]
`);
    writeFileSync(fakeTimeout, `#!/usr/bin/env bash
set -euo pipefail
[ "$1" = "--signal=TERM" ]; shift
[ "$1" = "--kill-after=1s" ]; shift
[ "$1" = "6s" ]; shift
exec /usr/bin/timeout --signal=TERM --kill-after=0.1s 0.1s "$@"
`);
    writeFileSync(phaseScript, `#!/usr/bin/env bash
set -euo pipefail
if [ -n "\${SUPABASE_ACCESS_TOKEN+x}" ]; then
  printf 'management-token-visible' > "$TEST_PHASE_RESULT"
  exit 17
fi
[ "$TARGET_DB_EPHEMERAL_ROLE" = "$TEST_ROLE" ]
[ "$GITHUB_ENV" != "$TEST_REAL_GITHUB_ENV" ]
node scripts/catalogue-hotfix-workflow-helpers.mjs validate-target
printf 'MUST_NOT_PERSIST=1\\n' >> "$GITHUB_ENV"
printf 'phase-ok' > "$TEST_PHASE_RESULT"
`);
    chmodSync(fakeCurl, 0o700);
    chmodSync(fakePsql, 0o700);
    chmodSync(fakeSleep, 0o700);
    chmodSync(fakeTimeout, 0o700);
    chmodSync(phaseScript, 0o700);
    const runWrapper = (extraEnv = {}) => spawnSync(bashExecutable, [
      "-c",
      'export PATH="$TEST_FAKE_BIN:$PATH"; exec bash "$TEST_WRAPPER" bash "$TEST_PHASE_SCRIPT"',
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ENV: realEnvPath,
        RUNNER_TEMP: runnerTemp,
        SUPABASE_ACCESS_TOKEN: accessToken,
        TARGET_KIND: "staging",
        TARGET_PROJECT_REF: ref,
        TARGET_API_URL: valid.apiUrl,
        TARGET_ANON_KEY: valid.key,
        TARGET_DB_URL: valid.databaseUrl,
        TEST_ACCESS_TOKEN: accessToken,
        TEST_FAKE_BIN: fakeBin,
        TEST_PHASE_RESULT: phaseResult,
        TEST_READINESS_ATTEMPTS: readinessAttempts,
        TEST_PHASE_SCRIPT: phaseScript,
        TEST_POOLER_RESPONSE: poolerResponsePath,
        TEST_REAL_GITHUB_ENV: realEnvPath,
        TEST_RESPONSE: responsePath,
        TEST_ROLE: role,
        TEST_WRAPPER: join(process.cwd(), "scripts/catalogue-hotfix-with-database-login.sh"),
        WSLENV: [
          process.env.WSLENV,
          "GITHUB_ENV/p",
          "RUNNER_TEMP/p",
          "SUPABASE_ACCESS_TOKEN",
          "TARGET_KIND",
          "TARGET_PROJECT_REF",
          "TARGET_API_URL",
          "TARGET_ANON_KEY",
          "TARGET_DB_URL",
          "TEST_ACCESS_TOKEN",
          "TEST_FAKE_BIN/p",
          "TEST_PHASE_RESULT/p",
          "TEST_PSQL_IDENTITY",
          "TEST_PSQL_HANG",
          "TEST_READINESS_ATTEMPTS/p",
          "TEST_PHASE_SCRIPT/p",
          "TEST_POOLER_RESPONSE/p",
          "TEST_REAL_GITHUB_ENV/p",
          "TEST_RESPONSE/p",
          "TEST_ROLE",
          "TEST_WRAPPER/p",
        ].filter(Boolean).join(":"),
        ...extraEnv,
      },
    });
    const result = runWrapper();
    assert.equal(readFileSync(phaseResult, "utf8"), "phase-ok");
    assert.equal(readFileSync(readinessAttempts, "utf8"), "3");
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(realEnvPath, "utf8"), "UNCHANGED=1\n");
    assert.equal(readdirSync(runnerTemp).length, 0, "all private credential files are removed");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(accessToken));

    rmSync(phaseResult);
    rmSync(readinessAttempts);
    const notReady = runWrapper({ TEST_PSQL_HANG: "1" });
    assert.equal(notReady.status, 1);
    assert.equal(existsSync(phaseResult), false, "the database phase never starts before readiness");
    assert.equal(readFileSync(readinessAttempts, "utf8"), "4");
    assert.equal(readdirSync(runnerTemp).length, 0, "private credentials are removed after readiness failure");
    const notReadyOutput = `${notReady.stdout}${notReady.stderr}`;
    assert.match(notReadyOutput, /Temporary database login did not become ready within the bounded propagation window/);
    assert.doesNotMatch(notReadyOutput, new RegExp(accessToken));
    assert.doesNotMatch(
      notReadyOutput.split(/\r?\n/).filter((line) => !line.startsWith("::add-mask::")).join("\n"),
      new RegExp(password),
    );

    rmSync(readinessAttempts);
    const wrongIdentity = runWrapper({ TEST_PSQL_IDENTITY: "false" });
    assert.equal(wrongIdentity.status, 1);
    assert.equal(existsSync(phaseResult), false, "the database phase rejects a non-postgres effective role");
    assert.equal(readFileSync(readinessAttempts, "utf8"), "4");
    assert.doesNotMatch(`${wrongIdentity.stdout}${wrongIdentity.stderr}`, new RegExp(accessToken));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("canonical database URL wrapper strips every preexisting connection option privately", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-canonical-db-"));
  const runnerTemp = join(directory, "runner-temp");
  const realEnvPath = join(directory, "github-env");
  const identityScript = join(directory, "identity.sh");
  const identityResult = join(directory, "identity-result");
  const unsafeDatabaseUrl = `postgresql://postgres:password@db.${ref}.supabase.co:5432/postgres?host=attacker.example&options=-c%20role%3Dattacker&connect_timeout=10&sslmode=require`;
  try {
    mkdirSync(runnerTemp);
    writeFileSync(realEnvPath, "UNCHANGED=1\n");
    writeFileSync(identityScript, `#!/usr/bin/env bash
set -euo pipefail
[ "$GITHUB_ENV" != "$TEST_REAL_GITHUB_ENV" ]
node --input-type=module -e '
  const url = new URL(process.env.TARGET_DB_URL);
  const keys = [...url.searchParams.keys()];
  if (keys.length !== 1 || keys[0] !== "sslmode" || url.searchParams.get("sslmode") !== "require") process.exit(1);
'
printf 'MUST_NOT_PERSIST=1\\n' >> "$GITHUB_ENV"
printf 'identity-ok' > "$TEST_IDENTITY_RESULT"
`);
    chmodSync(identityScript, 0o700);
    const result = spawnSync(bashExecutable, [
      "-c",
      'exec bash "$TEST_WRAPPER" bash "$TEST_IDENTITY_SCRIPT"',
    ], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        GITHUB_ENV: realEnvPath,
        RUNNER_TEMP: runnerTemp,
        TARGET_DB_URL: unsafeDatabaseUrl,
        TEST_IDENTITY_RESULT: identityResult,
        TEST_IDENTITY_SCRIPT: identityScript,
        TEST_REAL_GITHUB_ENV: realEnvPath,
        TEST_WRAPPER: join(process.cwd(), "scripts/catalogue-hotfix-with-canonical-database-url.sh"),
        WSLENV: [
          process.env.WSLENV,
          "GITHUB_ENV/p",
          "RUNNER_TEMP/p",
          "TARGET_DB_URL",
          "TEST_IDENTITY_RESULT/p",
          "TEST_IDENTITY_SCRIPT/p",
          "TEST_REAL_GITHUB_ENV/p",
          "TEST_WRAPPER/p",
        ].filter(Boolean).join(":"),
      },
    });
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(identityResult, "utf8"), "identity-ok");
    assert.equal(readFileSync(realEnvPath, "utf8"), "UNCHANGED=1\n");
    assert.equal(readdirSync(runnerTemp).length, 0, "the private canonical environment is removed");
    assert.doesNotMatch(`${result.stdout}${result.stderr}`, /attacker|connect_timeout|options=/);
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

test("database hotfix static marker evidence accepts only the exact immutable marker contract", () => {
  const expectedSha = "db53d1b9adae41edae93fbeb3e612b42dd8fec0b";
  const marker = {
    sha: expectedSha,
    run_id: "123",
    run_attempt: "1",
    created_at: "2026-07-22T12:41:06Z",
  };
  assert.deepEqual(
    workflowHelpers.buildCatalogueHotfixStaticMarkerEvidence({ expectedSha, marker }),
    { release_sha: expectedSha },
  );
  for (const invalid of [
    { ...marker, unexpected: true },
    Object.fromEntries(Object.entries(marker).filter(([key]) => key !== "created_at")),
    { ...marker, sha: "c".repeat(40) },
    { ...marker, run_id: 123 },
    { ...marker, created_at: "2026-02-30T12:41:06Z" },
    { ...marker, created_at: "2026-07-22T12:41:06+00:00" },
    {
      schema_version: 1,
      release_sha: expectedSha,
      source_tree: "a".repeat(40),
      source_run_id: "123",
      source_run_attempt: "1",
      payload_sha256: "b".repeat(64),
    },
  ]) {
    assert.throws(
      () => workflowHelpers.buildCatalogueHotfixStaticMarkerEvidence({ expectedSha, marker: invalid }),
      /static deploy marker/i,
    );
  }
});

test("database hotfix static marker capture keeps the body private and rejects redirects or malformed bodies", () => {
  const directory = mkdtempSync(join(tmpdir(), "catalogue-hotfix-marker-"));
  const fakeBin = join(directory, "bin");
  const fakeCurl = join(fakeBin, "curl");
  const expectedSha = "db53d1b9adae41edae93fbeb3e612b42dd8fec0b";
  const marker = {
    sha: expectedSha,
    run_id: "123",
    run_attempt: "1",
    created_at: "2026-07-22T12:41:06Z",
  };
  const scenarios = [
    { name: "valid", status: "200", body: marker, exit: 0, evidence: { release_sha: expectedSha } },
    { name: "redirect", status: "302", body: marker, exit: 1 },
    { name: "wrong-sha", status: "200", body: { ...marker, sha: "c".repeat(40) }, exit: 1 },
    { name: "extra-field", status: "200", body: { ...marker, private_value: "must-not-leak" }, exit: 1 },
    { name: "malformed", status: "200", body: "not-json-must-not-leak", raw: true, exit: 1 },
    { name: "transport", status: "000", body: marker, transport: true, exit: 1 },
  ];
  try {
    mkdirSync(fakeBin);
    writeFileSync(fakeCurl, `#!/usr/bin/env bash
set -euo pipefail
output=""; url=""
while [ "$#" -gt 0 ]; do
  case "$1" in
    -o) shift; output="$1" ;;
    https://*) url="$1" ;;
  esac
  shift
done
printf '%s\n' "$url" > "$TEST_URL_LOG"
cp "$TEST_RESPONSE_BODY" "$output"
if [ "$TEST_TRANSPORT" = true ]; then exit 28; fi
printf '%s' "$TEST_RESPONSE_STATUS"
`);
    chmodSync(fakeCurl, 0o700);
    for (const scenario of scenarios) {
      const scenarioDirectory = join(directory, scenario.name);
      mkdirSync(scenarioDirectory);
      const bodyPath = join(scenarioDirectory, "response-fixture");
      const evidencePath = join(scenarioDirectory, "evidence.json");
      const urlLogPath = join(scenarioDirectory, "url.txt");
      writeFileSync(bodyPath, scenario.raw ? scenario.body : `${JSON.stringify(scenario.body)}\n`);
      const result = spawnSync(
        bashExecutable,
        ["-c", 'export PATH="$TEST_FAKE_BIN:$PATH"; exec bash "$TEST_MARKER_SCRIPT" "$TEST_EXPECTED_SHA" "$TEST_EVIDENCE_PATH"'],
        {
          cwd: process.cwd(),
          encoding: "utf8",
          env: {
            ...process.env,
            RUNNER_TEMP: scenarioDirectory,
            TEST_FAKE_BIN: fakeBin,
            TEST_MARKER_SCRIPT: join(process.cwd(), "scripts/catalogue-hotfix-static-marker.sh"),
            TEST_EXPECTED_SHA: expectedSha,
            TEST_EVIDENCE_PATH: evidencePath,
            TEST_RESPONSE_BODY: bodyPath,
            TEST_RESPONSE_STATUS: scenario.status,
            TEST_TRANSPORT: String(Boolean(scenario.transport)),
            TEST_URL_LOG: urlLogPath,
            WSLENV: [
              process.env.WSLENV,
              "RUNNER_TEMP/p",
              "TEST_FAKE_BIN/p",
              "TEST_MARKER_SCRIPT/p",
              "TEST_EXPECTED_SHA",
              "TEST_EVIDENCE_PATH/p",
              "TEST_RESPONSE_BODY/p",
              "TEST_RESPONSE_STATUS",
              "TEST_TRANSPORT",
              "TEST_URL_LOG/p",
            ].filter(Boolean).join(":"),
          },
        },
      );
      assert.equal(result.status, scenario.exit, `${scenario.name}: ${result.stderr || result.error?.message}`);
      assert.equal(readFileSync(urlLogPath, "utf8"), "https://portal.maiprop.co/deploy-version.json\n");
      assert.doesNotMatch(`${result.stdout}${result.stderr}`, /must-not-leak|run_id|created_at|not-json/);
      assert.deepEqual(
        readdirSync(scenarioDirectory).filter((name) => name.startsWith("catalogue-hotfix-static-marker.")),
        [],
      );
      if (scenario.evidence) {
        assert.deepEqual(JSON.parse(readFileSync(evidencePath, "utf8")), scenario.evidence);
      } else {
        assert.equal(existsSync(evidencePath), false);
      }
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
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
