import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import yaml from "js-yaml";

const testRuntime =
  typeof globalThis.describe === "function" && typeof globalThis.it === "function"
    ? globalThis
    : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const { describe, it } = testRuntime;

const root = resolve(import.meta.dirname, "..");
const sourceRef = process.env.PRODUCTION_PROVIDER_BOUNDARY_SOURCE_REF;
const expiryMs = "2000000000000";
const liveClock = "1999999999.999000";
const equalityClock = "2000000000.000000";
const expiredClock = "2000000000.001000";

function workflow(relative) {
  const repositoryPath = `.github/workflows/${relative}`;
  const source = sourceRef
    ? execFileSync("git", ["show", `${sourceRef}:${repositoryPath}`], {
        cwd: root,
        encoding: "utf8",
      })
    : readFileSync(resolve(root, repositoryPath), "utf8");
  return yaml.load(source);
}

function runStep(parsed, name) {
  const matches = Object.values(parsed.jobs ?? {}).flatMap((job) =>
    (job.steps ?? []).filter((step) => step.name === name),
  );
  assert.equal(matches.length, 1, `expected exactly one ${name} step`);
  assert.equal(typeof matches[0].run, "string", `${name} must be a run step`);
  return matches[0].run;
}

function commandTail(source, start, terminal) {
  const startIndex = source.indexOf(start);
  assert.notEqual(startIndex, -1, `missing provider-tail start: ${start}`);
  const terminalIndex = source.indexOf(terminal, startIndex);
  assert.notEqual(terminalIndex, -1, `missing provider-tail terminal: ${terminal}`);
  const terminalEnd = source.indexOf("\n", terminalIndex);
  return source.slice(startIndex, terminalEnd === -1 ? source.length : terminalEnd);
}

function deadlineGuard(source) {
  const start = source.indexOf('if ! [[ "$lease_expires_epoch_ms"');
  assert.notEqual(start, -1, "missing canonical mutation deadline guard");
  const error = source.indexOf("mutation deadline is not canonical", start);
  assert.notEqual(error, -1, "missing canonical mutation deadline error");
  const closing = source.slice(error).match(/\n[ \t]*fi(?:\n|$)/);
  assert.ok(closing, "missing canonical mutation deadline guard terminator");
  return source.slice(start, error + closing.index + closing[0].length);
}

function withControlledClock(source) {
  return source.replaceAll(
    'provider_boundary_epoch_real="$EPOCHREALTIME"',
    'provider_boundary_epoch_real="$TEST_BOUNDARY_EPOCH_REALTIME"',
  );
}

function bash(source) {
  const command = process.platform === "win32" ? "wsl.exe" : "bash";
  const args = process.platform === "win32" ? ["--exec", "bash"] : [];
  return spawnSync(command, args, { input: source, encoding: "utf8" });
}

function harness(fragment, {
  authorizationMode = "break_glass",
  clock = liveClock,
  authorizationExpiryMs = expiryMs,
  leaseExpiryMs = expiryMs,
  body = fragment,
  setup = "",
} = {}) {
  return bash(`
set -u
AUTHORIZATION_MODE='${authorizationMode}'
lease_expires_epoch_ms='${leaseExpiryMs}'
authorization_expires_epoch_ms='${authorizationExpiryMs}'
TEST_BOUNDARY_EPOCH_REALTIME='${clock}'
RUNNER_TEMP=/tmp
SUPABASE_PRODUCTION_DB_URL=postgres://unused
PRODUCTION_PROJECT_REF=unused
PRODUCTION_PROJECT=unused
RELEASE_SHA=${"a".repeat(40)}
provider_calls=0
npx() {
  provider_calls=$((provider_calls + 1))
  printf 'PROVIDER_MUTATION:%s\\n' "$*"
  if [ "\${ADVANCE_AFTER_FIRST:-0}" = 1 ] && [ "$provider_calls" -eq 1 ]; then
    TEST_BOUNDARY_EPOCH_REALTIME='${equalityClock}'
  fi
  return 0
}
psql() {
  printf 'PROVIDER_MUTATION:%s\\n' "$*" >&2
  printf '{}\\n'
}
${setup}
${withControlledClock(body)}
`);
}

function assertProviderReached(result, label, count = 1) {
  assert.equal(result.status, 0, `${label}: ${result.stderr}`);
  assert.equal(
    `${result.stdout}${result.stderr}`.match(/PROVIDER_MUTATION:/g)?.length ?? 0,
    count,
    label,
  );
}

function assertProviderBlocked(result, label) {
  assert.notEqual(result.status, 0, label);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, /PROVIDER_MUTATION:/, label);
}

function assertAtomicTail(fragment, providerPattern, label) {
  const clockIndex = fragment.indexOf('provider_boundary_epoch_real="$EPOCHREALTIME"');
  const providerIndex = fragment.search(providerPattern);
  assert.notEqual(clockIndex, -1, `${label}: missing live boundary clock`);
  assert.ok(providerIndex > clockIndex, `${label}: provider must follow boundary clock`);
  const passingTail = fragment.slice(clockIndex, providerIndex);
  assert.doesNotMatch(
    passingTail,
    /\$\(|\b(?:date|jq|node|npm|npx|gh|curl|wget|sleep|find|sha256sum|psql|supabase|wrangler)\b/,
    `${label}: external work found between the live clock and provider command`,
  );
  assert.match(passingTail, />=/, `${label}: expiry comparison must be exclusive`);
}

const database = workflow("deploy-supabase-production-db.yml");
const edge = workflow("deploy-edge-functions.yml");
const cloudflare = workflow("reusable-cloudflare-production-deploy.yml");
const databaseRun = runStep(database, "Apply exact staged production migrations");
const edgeRun = runStep(edge, "Forward-converge exact artifact Edge functions serially");
const cronRun = runStep(edge, "Activate and verify role-switch reconciliation cron");
const cloudflareRun = runStep(cloudflare, "Deploy exact immutable production artifact");

const databasePushBranch = commandTail(
  databaseRun,
  'if [ "$pending_count" != "0" ]; then',
  "--yes",
);
const databasePush = databasePushBranch.slice(databasePushBranch.indexOf("\n") + 1);
const databaseDeadlineGuard = deadlineGuard(databaseRun);
const databaseOnline = commandTail(
  databaseRun,
  'online_sql="release-candidate/supabase/reconciliation/role-switch-online-finalization.sql"',
  '--file "$online_sql"',
);
const edgeDeploy = commandTail(edgeRun, "set +e", "--jobs 1");
const edgeDeadlineGuard = deadlineGuard(edgeRun);
const cronMutation = commandTail(cronRun, 'raw_state="$(mktemp)"', '| sed \'/^[[:space:]]*$/d\' > "$raw_state"');
const cronDeadlineGuard = deadlineGuard(cronRun);
const cloudflareDeploy = commandTail(
  cloudflareRun,
  'wrangler_output_dir="$RUNNER_TEMP/cloudflare-production-wrangler-output"',
  '2>&1 | tee "$RUNNER_TEMP/cloudflare-production-wrangler.log"',
);
const cloudflareDeadlineGuard = deadlineGuard(cloudflareRun);

describe("production provider mutation boundaries", () => {
  it("keeps every live expiry decision atomic with its actual provider command", () => {
    assertAtomicTail(databasePush, /npx --no-install supabase/, "database push");
    assertAtomicTail(databaseOnline, /psql \"\$SUPABASE_PRODUCTION_DB_URL\"/, "database online SQL");
    assertAtomicTail(edgeDeploy, /npx --no-install supabase/, "Edge function deploy");
    assertAtomicTail(cronMutation, /psql \"\$SUPABASE_PRODUCTION_DB_URL\"/, "cron activation");
    assertAtomicTail(cloudflareDeploy, /npx --no-install wrangler/, "Cloudflare Pages deploy");
  });

  it("allows standard and sufficiently live database mutations", () => {
    for (const [label, fragment] of [["push", databasePush], ["online", databaseOnline]]) {
      const setup = label === "push"
        ? "pending_count=1"
        : "grep() { return 0; }\nonline_sql=unused";
      assertProviderReached(
        harness(fragment, { authorizationMode: "standard", setup }),
        `standard database ${label}`,
      );
      assertProviderReached(harness(fragment, { setup }), `live database ${label}`);
    }
  });

  it("blocks database mutation at equality, expiry, and after delayed preparation", () => {
    for (const clock of [equalityClock, expiredClock]) {
      assertProviderBlocked(
        harness(databasePush, { clock, setup: "pending_count=1" }),
        `database push ${clock}`,
      );
      assertProviderBlocked(
        harness(databaseOnline, { clock, setup: "grep() { return 0; }\nonline_sql=unused" }),
        `database online ${clock}`,
      );
    }
    const delayedSetup = `
prep_calls=0
grep() {
  prep_calls=$((prep_calls + 1))
  if [ "$prep_calls" -eq 4 ]; then
    TEST_BOUNDARY_EPOCH_REALTIME='${equalityClock}'
  fi
  return 0
}
online_sql=unused`;
    assertProviderBlocked(
      harness(databaseOnline, { setup: delayedSetup }),
      "database online delayed preflight",
    );
  });

  it("fails closed on malformed or independently expired effective deadlines", () => {
    const cases = [
      ["database push", `${databaseDeadlineGuard}\n${databasePush}`, ""],
      ["database online", `${databaseDeadlineGuard}\n${databaseOnline}`, "grep() { return 0; }\nonline_sql=unused"],
      ["Edge", `${edgeDeadlineGuard}\n${edgeDeploy}`, "function_name=one"],
      ["cron", `${cronDeadlineGuard}\n${cronMutation}`, "mktemp() { printf '/tmp/provider-boundary-%s\\n' \"$BASHPID\"; }"],
      ["Cloudflare", `${cloudflareDeadlineGuard}\n${cloudflareDeploy}`, "rm() { return 0; }\nmkdir() { return 0; }"],
    ];
    for (const [label, fragment, setup] of cases) {
      assertProviderBlocked(
        harness(fragment, { leaseExpiryMs: "not-an-epoch", setup }),
        `${label} malformed lease deadline`,
      );
      assertProviderBlocked(
        harness(fragment, { authorizationExpiryMs: "not-an-epoch", setup }),
        `${label} malformed authorization deadline`,
      );
      assertProviderBlocked(
        harness(fragment, { authorizationExpiryMs: "1999999999999", setup }),
        `${label} expired authorization deadline`,
      );
    }
    assertProviderReached(
      harness(edgeDeploy, {
        authorizationMode: "standard",
        authorizationExpiryMs: "not-an-epoch",
        setup: "function_name=one",
      }),
      "standard Edge ignores absent authorization deadline",
    );
  });

  it("rechecks Edge authorization before every function mutation", () => {
    const loop = `for function_name in one two; do\n${edgeDeploy}\ndone`;
    assertProviderReached(
      harness(edgeDeploy, { authorizationMode: "standard", setup: "function_name=one" }),
      "standard Edge deploy",
    );
    assertProviderReached(harness(edgeDeploy, { setup: "function_name=one" }), "live Edge deploy");
    assertProviderBlocked(harness(edgeDeploy, { clock: equalityClock, setup: "function_name=one" }), "expired Edge deploy");
    const rollover = harness(edgeDeploy, {
      body: loop,
      setup: "ADVANCE_AFTER_FIRST=1",
    });
    assert.notEqual(rollover.status, 0, rollover.stderr);
    assert.equal(rollover.stdout.match(/PROVIDER_MUTATION:/g)?.length, 1);
  });

  it("checks cron authorization after preparation and immediately before SQL", () => {
    const mktempLive = "mktemp() { printf '/tmp/provider-boundary-%s\\n' \"$BASHPID\"; }";
    assertProviderReached(
      harness(cronMutation, { authorizationMode: "standard", setup: mktempLive }),
      "standard cron",
    );
    assertProviderReached(harness(cronMutation, { setup: mktempLive }), "live cron");
    assertProviderBlocked(
      harness(cronMutation, { clock: equalityClock, setup: mktempLive }),
      "expired cron",
    );
    const delayedCron = cronMutation.replace(
      'raw_state="$(mktemp)"',
      `raw_state="$(mktemp)"\nTEST_BOUNDARY_EPOCH_REALTIME='${equalityClock}'`,
    );
    assertProviderBlocked(
      harness(cronMutation, { body: delayedCron, setup: mktempLive }),
      "cron delayed preparation",
    );
  });

  it("checks Cloudflare authorization after preparation and records the actual attempt", () => {
    const prep = "rm() { return 0; }\nmkdir() { return 0; }";
    assertProviderReached(
      harness(cloudflareDeploy, { authorizationMode: "standard", setup: prep }),
      "standard Cloudflare deploy",
    );
    assertProviderReached(harness(cloudflareDeploy, { setup: prep }), "live Cloudflare deploy");
    assertProviderBlocked(
      harness(cloudflareDeploy, { clock: equalityClock, setup: prep }),
      "expired Cloudflare deploy",
    );
    const delayedPrep = `rm() { return 0; }
mkdir() {
  TEST_BOUNDARY_EPOCH_REALTIME='${equalityClock}'
  return 0
}`;
    assertProviderBlocked(
      harness(cloudflareDeploy, { setup: delayedPrep }),
      "Cloudflare delayed preparation",
    );
    const boundary = cloudflareRun.indexOf('provider_boundary_epoch_real="$EPOCHREALTIME"');
    const mutation = cloudflareRun.indexOf("npx --no-install wrangler", boundary);
    const evidence = cloudflareRun.indexOf("forward_mutation_started_at=", mutation);
    assert.ok(boundary >= 0 && mutation > boundary && evidence > mutation);
    assert.match(
      cloudflareRun.slice(evidence),
      /--arg attempted_at "\$forward_mutation_started_at"/,
    );
  });
});
