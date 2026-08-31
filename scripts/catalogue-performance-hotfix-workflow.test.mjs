import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import test from "node:test";
import yaml from "js-yaml";

const workflowPath = resolve(
  process.cwd(),
  ".github/workflows/deploy-catalogue-performance-hotfix.yml",
);
const stagingKeyProbePath = resolve(
  process.cwd(),
  "scripts/catalogue-hotfix-staging-key-probe.sh",
);
const staticMarkerPath = resolve(
  process.cwd(),
  "scripts/catalogue-hotfix-static-marker.sh",
);
const databaseLoginPath = resolve(
  process.cwd(),
  "scripts/catalogue-hotfix-database-login.sh",
);
const databaseLoginWrapperPath = resolve(
  process.cwd(),
  "scripts/catalogue-hotfix-with-database-login.sh",
);
const canonicalDatabaseUrlWrapperPath = resolve(
  process.cwd(),
  "scripts/catalogue-hotfix-with-canonical-database-url.sh",
);
const linkedDatabasePushPath = resolve(
  process.cwd(),
  "scripts/catalogue-hotfix-linked-db-push.sh",
);

const temporaryDatabasePhases = {
  staging: [
    "Prove recorded staging database state",
    "Measure staging catalogue bootstrap source quality",
    "Prepare manifest-bound staging migration dry-run",
    "Verify staging database and pgTAP",
    "Prove staging publish-public-catalogue cron liveness",
  ],
  production: [
    "Replay exact manifest-bound production preparation migration",
    "Measure production catalogue bootstrap source quality",
    "Prepare manifest-bound production migration dry-run",
    "Verify production database",
    "Prove production publish-public-catalogue cron liveness",
  ],
};
const linkedMigrationPhases = {
  staging: ["Apply only manifest-bound staging migrations"],
  production: ["Apply only manifest-bound production migrations"],
};
const requiredDatabasePhases = Object.fromEntries(
  Object.keys(temporaryDatabasePhases).map((target) => [
    target,
    [
      ...temporaryDatabasePhases[target].slice(0, 3),
      ...linkedMigrationPhases[target],
      ...temporaryDatabasePhases[target].slice(3),
    ],
  ]),
);

function workflow() {
  assert.ok(existsSync(workflowPath), "the database-only hotfix workflow exists");
  const text = readFileSync(workflowPath, "utf8");
  return { text, value: yaml.load(text) };
}

function steps(job) {
  return job.steps ?? [];
}

function stepText(job) {
  return steps(job)
    .map((step) => `${step.name ?? ""}\n${step.run ?? ""}\n${step.uses ?? ""}`)
    .join("\n");
}

function artifactPaths(job) {
  const upload = steps(job).find((step) =>
    String(step.uses ?? "").startsWith("actions/upload-artifact@")
  );
  assert.ok(upload, "artifact upload step exists");
  return String(upload.with.path)
    .split(/\r?\n/)
    .map((path) => path.trim())
    .filter(Boolean);
}

test("catalogue hotfix deploys the manifest-bound database subset staging before production", () => {
  const { text, value } = workflow();
  const inputs = value.on.workflow_dispatch.inputs;
  assert.deepEqual(Object.keys(inputs).sort(), [
    "confirm",
    "incident_id",
    "reason",
    "release_sha",
    "single_admin_break_glass",
  ]);
  assert.equal(inputs.release_sha.required, true);
  assert.equal(inputs.release_sha.type, "string");
  assert.equal(inputs.confirm.required, true);
  assert.equal(inputs.confirm.type, "string");
  assert.equal(inputs.single_admin_break_glass.required, true);
  assert.equal(inputs.single_admin_break_glass.default, false);
  assert.equal(inputs.single_admin_break_glass.type, "boolean");

  const { validate, staging, production } = value.jobs;
  assert.ok(validate && staging && production, "validation, staging, and production jobs exist");
  assert.deepEqual(staging.needs, ["validate"]);
  assert.deepEqual(production.needs, ["validate", "staging"]);
  assert.equal(staging.environment, "staging");
  assert.equal(production.environment, "production");
  assert.equal(value.concurrency.group, "maiprop-production-release");
  assert.equal(Object.hasOwn(validate, "if"), false, "validation must fail visibly, not skip");
  assert.equal(Object.hasOwn(staging.env, "TARGET_ANON_KEY"), false);
  assert.equal(Object.hasOwn(staging.env, "SUPABASE_ACCESS_TOKEN"), false);
  assert.equal(production.env.TARGET_ANON_KEY, "${{ secrets.VITE_SUPABASE_PUBLISHABLE_KEY }}");
  assert.equal(Object.hasOwn(production.env, "SUPABASE_ACCESS_TOKEN"), false);

  const stagingKeyStepIndex = steps(staging).findIndex(
    (step) => step.name === "Resolve current staging public API key",
  );
  const stagingIdentityStepIndex = steps(staging).findIndex(
    (step) => step.name === "Revalidate staging identity immediately before mutation",
  );
  assert.ok(stagingKeyStepIndex >= 0 && stagingKeyStepIndex < stagingIdentityStepIndex);
  const stagingKeyStep = steps(staging)[stagingKeyStepIndex];
  assert.deepEqual(stagingKeyStep.env, {
    SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
  });
  assert.match(stagingKeyStep.run, /--request GET/);
  assert.match(stagingKeyStep.run, /https:\/\/api\.supabase\.com\/v1\/projects\/\$TARGET_PROJECT_REF\/api-keys\?reveal=true/);
  assert.match(stagingKeyStep.run, /management_token="\$SUPABASE_ACCESS_TOKEN"/);
  assert.match(stagingKeyStep.run, /unset SUPABASE_ACCESS_TOKEN/);
  assert.match(stagingKeyStep.run, /Authorization: Bearer \$management_token/);
  assert.match(stagingKeyStep.run, /response_file="\$\(mktemp "\$RUNNER_TEMP\//);
  assert.match(stagingKeyStep.run, /candidates_file="\$\(mktemp "\$RUNNER_TEMP\//);
  assert.match(stagingKeyStep.run, /chmod 600 "\$response_file" "\$candidates_file"/);
  assert.match(stagingKeyStep.run, /trap .*rm -f -- "\$response_file" "\$candidates_file".* EXIT/);
  assert.match(stagingKeyStep.run, /--connect-timeout 10/);
  assert.match(stagingKeyStep.run, /--max-time 30/);
  assert.match(stagingKeyStep.run, /--retry 3/);
  assert.match(stagingKeyStep.run, /--retry-all-errors/);
  assert.match(stagingKeyStep.run, /--retry-max-time 90/);
  assert.match(stagingKeyStep.run, /-o "\$response_file"/);
  assert.match(stagingKeyStep.run, /write-staging-public-key-candidates "\$response_file" "\$candidates_file"/);
  assert.match(stagingKeyStep.run, /bash scripts\/catalogue-hotfix-staging-key-probe\.sh "\$candidates_file"/);
  assert.doesNotMatch(stagingKeyStep.run, /TARGET_API_URL/);
  const stagingKeyProbe = readFileSync(stagingKeyProbePath, "utf8");
  const probeFunction = /probe_candidate\(\) \{([\s\S]*?)\n\}/.exec(stagingKeyProbe)?.[1] ?? "";
  assert.match(stagingKeyProbe, /TARGET_PROJECT_REF:-\}" != xsiehskfgeoqyazcgauv/);
  assert.match(stagingKeyProbe, /probe_url="https:\/\/\$\{TARGET_PROJECT_REF\}\.supabase\.co\/auth\/v1\/settings"/);
  assert.match(stagingKeyProbe, /probe_max_attempts=3/);
  assert.match(probeFunction, /while \[ "\$attempts" -lt "\$probe_max_attempts" \]/);
  assert.match(probeFunction, /000\|408\|429\|5\?\?/);
  assert.match(probeFunction, /--connect-timeout 10/);
  assert.match(probeFunction, /--max-time 30/);
  assert.match(probeFunction, /-o \/dev\/null/);
  assert.match(probeFunction, /-w '%\{http_code\}'/);
  assert.match(probeFunction, /-H "apikey: \$candidate"/);
  assert.match(probeFunction, /-H "Accept: application\/json"/);
  assert.doesNotMatch(probeFunction, /\/rest\/v1\/|openapi/i);
  assert.doesNotMatch(probeFunction, /Authorization:|-sS|--show-error|--verbose|--trace/);
  assert.match(stagingKeyProbe, /if \[ "\$publishable_status" = "401" \] && \[ -n "\$legacy_anon_key" \]/);
  assert.match(stagingKeyProbe, /select-live-staging-public-key-env[\s\\\n]+"\$candidates_file"[\s\\\n]+"\$publishable_status" "\$publishable_attempts"[\s\\\n]+"\$legacy_anon_status" "\$legacy_anon_attempts"/);
  assert.ok(
    stagingKeyStep.run.indexOf("write-staging-public-key-candidates") <
      stagingKeyStep.run.indexOf("catalogue-hotfix-staging-key-probe.sh"),
    "every candidate is masked before either candidate is loaded for a live probe",
  );
  assert.doesNotMatch(stagingKeyStep.run, /-sS|--show-error|--verbose|--trace|\bcat\b|\btee\b/);
  assert.doesNotMatch(stagingKeyProbe, /TARGET_API_URL|\/rest\/v1\/|openapi|Authorization:|-sS|--show-error|--verbose|--trace|\bcat\b|\btee\b/i);
  assert.doesNotMatch(text, /STAGING_SUPABASE_PUBLISHABLE_KEY/);
  const accessTokenSteps = Object.values(value.jobs).flatMap((job) =>
    steps(job).filter((step) => Object.hasOwn(step.env ?? {}, "SUPABASE_ACCESS_TOKEN"))
  );
  assert.deepEqual(accessTokenSteps.map((step) => step.name), [
    "Resolve current staging public API key",
    ...requiredDatabasePhases.staging,
    ...requiredDatabasePhases.production,
  ]);
  for (const [target, job] of Object.entries({ staging, production })) {
    const qualityStep = steps(job).find((step) =>
      step.name === `Measure ${target} catalogue bootstrap source quality`
    );
    assert.ok(qualityStep, `${target} measures aggregate-only bootstrap source quality`);
    assert.match(qualityStep.run, /catalogue-hotfix-source-quality-probe\.mjs/);
    assert.match(qualityStep.run, /::notice::Catalogue bootstrap source quality:/);
    assert.doesNotMatch(qualityStep.run, /\bcat\b|\btee\b|--verbose|--trace|-sS/);
  }
  for (const [target, job] of Object.entries({ staging, production })) {
    const identityIndex = steps(job).findIndex((step) => new RegExp(`Revalidate ${target} identity immediately before mutation`).test(step.name ?? ""));
    assert.ok(identityIndex >= 0);
    assert.deepEqual(Object.keys(steps(job)[identityIndex].env ?? {}), ["TARGET_DB_URL"]);
    assert.match(
      steps(job)[identityIndex].run,
      /bash scripts\/catalogue-hotfix-with-canonical-database-url\.sh bash -s <<'IDENTITY_PHASE'/,
    );
    assert.equal(job["timeout-minutes"], 45);
    for (const phaseName of temporaryDatabasePhases[target]) {
      const phase = steps(job).find((step) => step.name === phaseName);
      assert.ok(phase, `${target} has the ${phaseName} phase`);
      assert.equal(phase["timeout-minutes"], 4);
      assert.deepEqual(phase.env, {
        SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
        TARGET_DB_URL: target === "staging"
          ? "${{ secrets.SUPABASE_STAGING_DB_URL }}"
          : "${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
      });
      assert.match(
        phase.run,
        /SUPABASE_ACCESS_TOKEN="\$management_token" bash scripts\/catalogue-hotfix-with-database-login\.sh bash -s <<'DATABASE_PHASE'/,
      );
      assert.ok(
        phase.run.indexOf('unset SUPABASE_ACCESS_TOKEN') <
          phase.run.indexOf('catalogue-hotfix-with-database-login.sh'),
        `${phaseName} removes the inherited token before any database setup child runs`,
      );
    }
    for (const phaseName of linkedMigrationPhases[target]) {
      const phase = steps(job).find((step) => step.name === phaseName);
      assert.ok(phase, `${target} has the ${phaseName} phase`);
      assert.equal(phase["timeout-minutes"], 20);
      assert.deepEqual(phase.env, {
        SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
      });
      assert.match(
        phase.run,
        /SUPABASE_ACCESS_TOKEN="\$management_token" bash scripts\/catalogue-hotfix-linked-db-push\.sh apply/,
      );
      assert.doesNotMatch(phase.run, /TARGET_DB_URL|catalogue-hotfix-with-database-login/);
    }
    assert.equal(
      steps(job).some((step) => /Mint temporary .* database login|Validate temporary .* database binding/.test(step.name ?? "")),
      false,
      `${target} has no job-wide temporary database login`,
    );
  }
  const databaseLogin = readFileSync(databaseLoginPath, "utf8");
  assert.match(databaseLogin, /https:\/\/api\.supabase\.com\/v1\/projects\/xsiehskfgeoqyazcgauv\/cli\/login-role/);
  assert.match(databaseLogin, /https:\/\/api\.supabase\.com\/v1\/projects\/qvvicunqcrwpioqnvzxf\/cli\/login-role/);
  assert.match(databaseLogin, /https:\/\/api\.supabase\.com\/v1\/projects\/xsiehskfgeoqyazcgauv\/config\/database\/pooler/);
  assert.match(databaseLogin, /https:\/\/api\.supabase\.com\/v1\/projects\/qvvicunqcrwpioqnvzxf\/config\/database\/pooler/);
  assert.match(databaseLogin, /--request POST/);
  assert.match(databaseLogin, /--request GET --connect-timeout 5 --max-time 10/);
  assert.match(databaseLogin, /--data '\{"read_only":false\}'/);
  assert.match(databaseLogin, /--connect-timeout 10/);
  assert.match(databaseLogin, /--max-time 30/);
  assert.match(databaseLogin, /--max-filesize 65536/);
  assert.doesNotMatch(databaseLogin, /--retry|--retry-all-errors/);
  assert.match(databaseLogin, /chmod 600 "\$response_file" "\$pooler_response_file"/);
  assert.match(databaseLogin, /trap 'rm -f -- "\$response_file" "\$pooler_response_file"' EXIT/);
  assert.match(databaseLogin, /write-temporary-db-env "\$response_file" "\$pooler_response_file"/);
  assert.doesNotMatch(databaseLogin, /-sS|--show-error|--verbose|--trace|\bcat\b|\btee\b/);
  assert.ok(existsSync(databaseLoginWrapperPath), "the phase-scoped database login wrapper exists");
  const databaseLoginWrapper = readFileSync(databaseLoginWrapperPath, "utf8");
  assert.match(databaseLoginWrapper, /catalogue-hotfix-database-login\.sh/);
  assert.match(databaseLoginWrapper, /chmod 600 "\$database_env"/);
  assert.match(databaseLoginWrapper, /trap .*rm -f -- "\$database_env".* EXIT/);
  assert.match(databaseLoginWrapper, /TARGET_DB_URL/);
  assert.match(databaseLoginWrapper, /TARGET_DB_EPHEMERAL_ROLE/);
  assert.match(databaseLoginWrapper, /catalogue-hotfix-workflow-helpers\.mjs validate-target/);
  assert.match(databaseLoginWrapper, /database_max_attempts=4/);
  assert.match(databaseLoginWrapper, /timeout --signal=TERM --kill-after=1s 6s env PGCONNECT_TIMEOUT=4 psql "\$TARGET_DB_URL" --no-psqlrc --set ON_ERROR_STOP=1 -qAt --command 'SET ROLE postgres' --command "SELECT current_user = 'postgres'" 2>\/dev\/null/);
  assert.match(databaseLoginWrapper, /\[ "\$database_identity" = t \]/);
  assert.match(databaseLoginWrapper, /Temporary database login did not become ready within the bounded propagation window/);
  assert.doesNotMatch(databaseLoginWrapper, /\beval\b|\bsource\b|(?:^|\s)\.\s/);
  assert.equal((text.match(/for n in \$\(seq 1 15\); do/g) ?? []).length, 2);
  assert.equal((text.match(/\[ "\$n" -eq 15 \] \|\| sleep 10/g) ?? []).length, 2);
  const rawDatabaseLines = text.split(/\r?\n/).filter((line) =>
    line.includes('psql "$TARGET_DB_URL"')
  );
  assert.equal(rawDatabaseLines.length, 7);
  for (const line of rawDatabaseLines) {
    assert.equal((line.match(/--command 'SET ROLE postgres'/g) ?? []).length, 1);
    const roleIndex = line.indexOf("--command 'SET ROLE postgres'");
    const queryIndex = Math.max(line.lastIndexOf("--command "), line.indexOf("--file "));
    assert.ok(roleIndex >= 0 && queryIndex > roleIndex, "SET ROLE precedes the same-session query/file");
  }
  assert.ok(existsSync(canonicalDatabaseUrlWrapperPath), "the private canonical database URL wrapper exists");
  const canonicalDatabaseUrlWrapper = readFileSync(canonicalDatabaseUrlWrapperPath, "utf8");
  assert.match(canonicalDatabaseUrlWrapper, /chmod 600 "\$database_env"/);
  assert.match(canonicalDatabaseUrlWrapper, /trap .*rm -f -- "\$database_env".* EXIT/);
  assert.match(canonicalDatabaseUrlWrapper, /GITHUB_ENV="\$database_env" node scripts\/catalogue-hotfix-workflow-helpers\.mjs normalize-db-url-env/);
  assert.doesNotMatch(canonicalDatabaseUrlWrapper, /\beval\b|\bsource\b|(?:^|\s)\.\s/);
  assert.ok(existsSync(linkedDatabasePushPath), "the exact linked CLI migration wrapper exists");
  const linkedDatabasePush = readFileSync(linkedDatabasePushPath, "utf8");
  assert.match(linkedDatabasePush, /db push --linked --include-all/);
  assert.match(linkedDatabasePush, /--dry-run/);
  assert.match(linkedDatabasePush, /--yes/);
  assert.match(linkedDatabasePush, /project_ref_file="\$temporary\/project-ref"/);
  assert.match(linkedDatabasePush, /pooler_url_file="\$temporary\/pooler-url"/);
  assert.match(linkedDatabasePush, /--yes link --project-ref "\$TARGET_PROJECT_REF"/);
  assert.match(linkedDatabasePush, /validate-linked-state "\$project_ref_file" "\$pooler_url_file"/);
  assert.match(linkedDatabasePush, /management_token="\$SUPABASE_ACCESS_TOKEN"[\s\S]*unset SUPABASE_ACCESS_TOKEN/);
  assert.match(linkedDatabasePush, /> "\$output" 2>&1/);
  assert.doesNotMatch(linkedDatabasePush, /--db-url|\bcat\b|\btee\b|-sS|--show-error|--verbose|--trace/);

  const validation = `${stepText(validate)}\n${JSON.stringify(validate)}`;
  const authorizationStep = steps(validate).find(
    (step) => step.name === "Validate exact current-main control and authorization",
  );
  assert.match(validation, /catalogue-performance-hotfix-contract\.mjs verify --json/);
  assert.equal(authorizationStep.env.RELEASE_AUTHORIZATION_ACTION, "production-deploy");
  assert.equal(authorizationStep.env.RELEASE_STANDARD_CONFIRMATION, "DEPLOY_CATALOGUE_PERFORMANCE_HOTFIX");
  assert.match(validation, /production-break-glass-validation\.mjs validate-workflow/);
  assert.equal(authorizationStep.env.PRODUCTION_RELEASE_DEPLOYERS, "${{ vars.PRODUCTION_RELEASE_DEPLOYERS }}");
  assert.match(validation, /RELEASE_CURRENT_MAIN_SHA/);
  assert.match(validation, /GITHUB_SHA/);
  assert.match(validation, /GITHUB_WORKFLOW_SHA/);
  assert.match(validation, /GITHUB_REF/);
  assert.match(validation, /GITHUB_RUN_ATTEMPT/);
  assert.match(validation, /GITHUB_TRIGGERING_ACTOR/);
  const currentMainSteps = [
    authorizationStep,
    steps(staging).find((step) => step.name === "Revalidate staging control and API readiness"),
    steps(production).find((step) => step.name === "Revalidate production control, authorization, and API readiness"),
  ];
  for (const step of currentMainSteps) {
    assert.ok(step, "every mutation gate has a current-main verification step");
    assert.equal(step.env.GH_TOKEN, "${{ github.token }}");
    assert.match(step.run, /gh api --method GET "repos\/\$\{GITHUB_REPOSITORY\}\/commits\/main" --jq '\.sha'/);
    assert.match(step.run, /RELEASE_CURRENT_MAIN_SHA/);
    assert.doesNotMatch(step.run, /git fetch|git config|x-access-token|Authorization:/i);
  }
  for (const job of [validate, staging, production]) {
    const checkout = steps(job).find((step) => String(step.uses ?? "").startsWith("actions/checkout@"));
    assert.equal(checkout.with["persist-credentials"], false);
  }
  const helpers = readFileSync(
    resolve(process.cwd(), "scripts/catalogue-hotfix-workflow-helpers.mjs"),
    "utf8",
  );
  const behaviouralProbe = readFileSync(
    resolve(process.cwd(), "scripts/catalogue-hotfix-behavioral-probe.mjs"),
    "utf8",
  );
  assert.ok(existsSync(staticMarkerPath), "the database-only static marker capture exists");
  const staticMarker = readFileSync(staticMarkerPath, "utf8");

  for (const [target, job] of Object.entries({ staging, production })) {
    const body = stepText(job);
    const identityStepIndex = steps(job).findIndex(
      (step) => step.name === `Revalidate ${target} identity immediately before mutation`,
    );
    const controlStep = steps(job).find((step) =>
      String(step.name ?? "").startsWith(`Revalidate ${target} control`)
    );
    assert.equal(Object.hasOwn(job.env, "TARGET_DB_URL"), false);
    assert.match(steps(job)[identityStepIndex].env.TARGET_DB_URL, /SUPABASE_(?:STAGING|PRODUCTION)_DB_URL/);
    assert.match(body, /catalogue-performance-hotfix-contract\.mjs verify --json/);
    assert.match(body, /RUNNER_TEMP/);
    assert.match(body, /supabase_migrations\.schema_migrations/);
    assert.match(body, /numeric/i);
    assert.match(body, /placeholder/i);
    assert.match(body, /bash scripts\/catalogue-hotfix-linked-db-push\.sh prepare/);
    assert.match(body, /bash scripts\/catalogue-hotfix-linked-db-push\.sh apply/);
    assert.doesNotMatch(body, /db push .*--db-url/);
    assert.match(body, /catalogue-hotfix-workflow-helpers\.mjs validate-dry-run/);
    assert.match(helpers, /expected_pending_versions/);
    assert.match(helpers, /pending_versions/);
    assert.match(helpers, /new URL/);
    assert.match(helpers, /sslmode/);
    assert.match(helpers, /sb_publishable_|role !== "anon"/);
    assert.match(body, /pending/i);
    assert.match(body, /validate-dry-run/);
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs recorded/);
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs postapply evidence\/database-contract\.json/);
    assert.match(behaviouralProbe, /20260728123058/);
    assert.match(behaviouralProbe, /20260729120405/);
    assert.match(behaviouralProbe, /20260728120000/);
    assert.match(behaviouralProbe, /20260728115959/);
    assert.match(behaviouralProbe, /20260728115960/);
    assert.match(behaviouralProbe, /20260728121500/);
    assert.match(behaviouralProbe, /get_public_listing_catalogue/);
    assert.match(behaviouralProbe, /get_public_catalogue_publication/);
    assert.match(behaviouralProbe, /SET LOCAL ROLE anon/);
    assert.match(body, /30/);
    assert.match(helpers, /p95_ms/i);
    assert.match(helpers, /completed_at|timestamp/i);
    assert.match(helpers, /normalizeDatabaseUrlTls/);
    assert.match(helpers, /process\.env\.GITHUB_ENV/);
    assert.match(helpers, /::add-mask::/);
    assert.match(helpers, /appendFileSync/);
    assert.ok(
      helpers.indexOf("process.stdout.write(`::add-mask::") <
        helpers.indexOf("appendFileSync(envPath"),
      "the derived database URL is masked before job-environment persistence",
    );
    assert.match(body, /RELEASE_CURRENT_MAIN_SHA/);
    assert.match(body, /elapsed_seconds/);
    assert.match(body, /successful_runs/);
    assert.ok(controlStep);
    assert.match(controlStep.run, /\$\{TARGET_API_URL%\/\}\/auth\/v1\/settings/);
    assert.match(controlStep.run, /Accept: application\/json/);
    assert.match(controlStep.run, /apikey: \$TARGET_ANON_KEY/);
    assert.match(controlStep.run, /validate-api-readiness "\$readiness_status"/);
    assert.match(controlStep.run, /-o \/dev\/null/);
    assert.match(controlStep.run, /--connect-timeout 10/);
    assert.match(controlStep.run, /--max-time 30/);
    assert.match(controlStep.run, /readiness_status="000"/);
    assert.doesNotMatch(controlStep.run, /\/rest\/v1\/|openapi|-D |--dump-header|response_body|cat .*readiness/i);
    assert.equal(Object.hasOwn(controlStep.env ?? {}, "TARGET_DB_URL"), false);
  }

  const stagingBody = stepText(staging);
  const markerSteps = [
    steps(staging).find((step) => step.name === "Capture manifest-bound frontend marker for staging evidence"),
    steps(production).find((step) => step.name === "Capture fixed live frontend marker"),
  ];
  for (const [index, markerStep] of markerSteps.entries()) {
    assert.ok(markerStep, "both database targets capture the static deploy marker");
    const evidence = index === 0
      ? "evidence/staging-frontend-marker.json"
      : "evidence/production-frontend-marker.json";
    assert.match(markerStep.run, new RegExp(`bash scripts/catalogue-hotfix-static-marker\\.sh "\\$fixed_sha" ${evidence.replaceAll("/", "\\/")}`));
    assert.doesNotMatch(markerStep.run, /release:verify-live-marker|\/api\/release/);
  }
  assert.match(staticMarker, /marker_url="https:\/\/portal\.maiprop\.co\/deploy-version\.json"/);
  assert.match(staticMarker, /mktemp "\$RUNNER_TEMP\/catalogue-hotfix-static-marker\./);
  assert.match(staticMarker, /chmod 600 "\$body_file"/);
  assert.match(staticMarker, /trap .*rm -f -- "\$body_file".* EXIT/);
  assert.match(staticMarker, /--connect-timeout 10/);
  assert.match(staticMarker, /--max-time 30/);
  assert.match(staticMarker, /--retry 2/);
  assert.match(staticMarker, /--retry-max-time 90/);
  assert.match(staticMarker, /-o "\$body_file"/);
  assert.match(staticMarker, /-w '%\{http_code\}'/);
  assert.match(staticMarker, /write-static-marker-evidence/);
  assert.doesNotMatch(staticMarker, /\/api\/release|--location|-L\b|-sS|--show-error|\bcat\b|\btee\b/);
  assert.doesNotMatch(text, /release:verify-live-marker|\/api\/release/);
  assert.match(stagingBody, /public_catalogue_snapshot_test\.sql/);
  assert.match(stagingBody, /90/);
  assert.match(stagingBody, /catalogue_invalid_os_identity_quarantine_test\.sql/);
  assert.match(stagingBody, /--expected-plan 49/);
  assert.match(stagingBody, /status=eq\.active/);
  assert.match(stagingBody, /is_off_market=eq\.false/);
  assert.match(behaviouralProbe, /location_search_text/);
  assert.match(behaviouralProbe, /project:project_detail/);
  assert.match(behaviouralProbe, /listing_images:listing_images_detail/);
  assert.match(stagingBody, /-X GET|--request GET/);
  assert.match(stagingBody, /publish-public-catalogue/);
  assert.match(helpers, /new_run_minutes/);
  assert.match(stagingBody, /publication_id/);
  assert.match(stagingBody, /STAGING_MUTATION_ACKNOWLEDGEMENT/);
  assert.match(readFileSync(resolve(process.cwd(), "scripts/assert-staging-mutation-target.mjs"), "utf8"), /MUTATE_STAGING_xsiehskfgeoqyazcgauv/);
  assert.match(helpers, /p50_ms/);
  assert.match(helpers, /p95_ms/);
  assert.match(stagingBody, /direct_rpc_first/);
  assert.match(stagingBody, /direct_rpc_second/);
  assert.match(stagingBody, /summarize-samples staging/);
  assert.match(stagingBody, /staging-http-latency\.json/);
  assert.match(stagingBody, /staging-frontend-marker\.json/);
  assert.doesNotMatch(stagingBody, /evidence\/probe-context\.json/);
  assert.doesNotMatch(stagingBody, /evidence\/http-samples\.ndjson/);
  assert.deepEqual(artifactPaths(staging), [
    "evidence/catalogue-performance-hotfix-staging.json",
    "evidence/database-contract.json",
    "evidence/dry-run-pending.json",
    "evidence/public-catalogue-pgtap-proof.json",
    "evidence/invalid-os-quarantine-pgtap-proof.json",
    "evidence/catalogue-cron-proof.json",
    "evidence/staging-frontend-marker.json",
    "evidence/staging-http-latency.json",
  ]);
  assert.ok(
    steps(staging).findIndex((step) => step.name === "Enforce staging latency evidence gate") >
      steps(staging).findIndex((step) => String(step.uses ?? "").startsWith("actions/upload-artifact@")),
    "staging preserves and uploads all sample statuses before failing its latency gate",
  );

  const productionBody = stepText(production);
  assert.doesNotMatch(productionBody, /write-staging-public-key-candidates|select-live-staging-public-key-env/);
  assert.match(stagingBody, /Prove recorded staging database state/);
  assert.match(productionBody, /Replay exact manifest-bound production preparation migration/);
  assert.match(productionBody, /catalogue-hotfix-behavioral-probe\.mjs preparation-recovery/);
  for (const body of [stagingBody, productionBody]) {
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs recorded/);
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs postapply/);
    assert.match(body, /catalogue-hotfix-source-quality-probe\.mjs --require-zero-invalid/);
    assert.match(body, /PRODUCTION_RELEASE_DEPLOYERS/);
  }
  assert.match(productionBody, /catalogue-hotfix-static-marker\.sh/);
  assert.match(productionBody, /https:\/\/portal\.maiprop\.co\/api\/public\/listings/);
  assert.match(behaviouralProbe, /get_public_listing_catalogue/);
  assert.match(behaviouralProbe, /get_public_catalogue_auctions/);
  assert.match(behaviouralProbe, /get_public_catalogue_homepage/);
  assert.match(behaviouralProbe, /homepage_retain_until_contract/);
  assert.match(behaviouralProbe, /idx_public_catalogue_versions_auction_listing_publication/);
  assert.match(helpers, /cold_sample_count/);
  assert.match(helpers, /warm_sample_count/);
  assert.match(helpers, /cold_p50_ms/);
  assert.match(helpers, /warm_p95_ms/);
  assert.match(productionBody, /production-frontend-marker\.json/);
  assert.match(helpers, /database_hotfix_sha/);
  assert.match(
    readFileSync(
      resolve(process.cwd(), "scripts/catalogue-performance-hotfix-manifest.json"),
      "utf8",
    ),
    /db53d1b9adae41edae93fbeb3e612b42dd8fec0b/,
  );
  assert.match(productionBody, /parse-cache-headers/);
  assert.match(productionBody, /summarize-samples production/);
  assert.match(productionBody, /normalized_url/);
  assert.match(productionBody, /normalized_cache_key/);
  assert.match(productionBody, /inspect-public-body/);
  assert.match(productionBody, /item_count/);
  assert.match(productionBody, /body_shape_valid/);
  assert.match(helpers, /item_count !== 12/);
  assert.doesNotMatch(productionBody, /first\("cold"\)|-301\.headers/);
  assert.doesNotMatch(productionBody, /public-api-cache-headers\.txt/);
  assert.doesNotMatch(productionBody, /evidence\/probe-context\.json/);
  assert.doesNotMatch(productionBody, /evidence\/http-samples\.ndjson/);
  assert.deepEqual(artifactPaths(production), [
    "evidence/catalogue-performance-hotfix-production.json",
    "evidence/database-contract.json",
    "evidence/dry-run-pending.json",
    "evidence/catalogue-cron-proof.json",
    "evidence/production-frontend-marker.json",
    "evidence/production-http-latency.json",
  ]);
  const productionSampleStep = steps(production).findIndex(
    (step) => step.name === "Sample production public API pairs",
  );
  const productionUploadStep = steps(production).findIndex(
    (step) => String(step.uses ?? "").startsWith("actions/upload-artifact@"),
  );
  assert.ok(
    productionSampleStep >= 0 && productionSampleStep < productionUploadStep,
    "production writes the sanitized sample evidence before artifact upload",
  );
  assert.ok(
    steps(production).findIndex((step) => step.name === "Enforce production latency evidence gate") >
      productionUploadStep,
    "production preserves and uploads all sample/cache states before failing its latency gate",
  );
  assert.match(text, /actions\/upload-artifact@[0-9a-f]{40}/);
  assert.match(text, /actions\/checkout@[0-9a-f]{40}/);
  assert.match(text, /actions\/setup-node@[0-9a-f]{40}/);
});

test("every workflow run block is valid Bash", () => {
  const { value } = workflow();
  for (const [jobName, job] of Object.entries(value.jobs)) {
    for (const [index, step] of steps(job).entries()) {
      if (typeof step.run !== "string") continue;
      const result = spawnSync("bash", ["-n"], {
        encoding: "utf8",
        input: `set -euo pipefail\n${step.run}`,
      });
      assert.equal(
        result.status,
        0,
        `${jobName}/${step.name ?? index}: ${result.stderr || result.error?.message || "bash parse failure"}`,
      );
    }
  }
});

test("catalogue hotfix workflow rejects unrelated mutation and secret surfaces", () => {
  const { text } = workflow();
  assert.doesNotMatch(text, /stripe/i);
  assert.doesNotMatch(text, /functions\s+deploy|edge\s+deploy/i);
  assert.doesNotMatch(text, /pages\s+deploy|cloudflare/i);
  assert.doesNotMatch(text, /migration\s+repair/i);
  assert.doesNotMatch(text, /supabase\s+db\s+push\s*(?:\n|$)/i);
  assert.doesNotMatch(text, /supabase\s+db\s+push\s+--workdir\s+supabase/i);
  assert.match(text, /catalogue-hotfix-linked-db-push\.sh/);
  assert.doesNotMatch(text, /echo[^\n]*(?:DB_URL|RELEASE_REASON|reason)/i);
});

test("production preparation recovery replays only the exact manifest-bound P state", () => {
  const { value } = workflow();
  const productionSteps = steps(value.jobs.production);
  const recoveryIndex = productionSteps.findIndex((step) =>
    step.name === "Replay exact manifest-bound production preparation migration"
  );
  const sourceQualityIndex = productionSteps.findIndex((step) =>
    step.name === "Measure production catalogue bootstrap source quality"
  );
  const dryRunIndex = productionSteps.findIndex((step) =>
    step.name === "Prepare manifest-bound production migration dry-run"
  );
  assert.ok(recoveryIndex >= 0, "the production-only replay gate exists");
  assert.ok(recoveryIndex < sourceQualityIndex && sourceQualityIndex < dryRunIndex);
  const recovery = productionSteps[recoveryIndex];
  assert.equal(recovery["timeout-minutes"], 4);
  assert.deepEqual(recovery.env, {
    SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    TARGET_DB_URL: "${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
  });
  assert.match(recovery.run, /unset SUPABASE_ACCESS_TOKEN/);
  assert.match(recovery.run, /catalogue-hotfix-with-database-login\.sh bash -s <<'DATABASE_PHASE'/);
  assert.match(recovery.run, /catalogue-performance-hotfix-contract\.mjs verify --json/);
  assert.match(recovery.run, /catalogue-hotfix-behavioral-probe\.mjs preparation-recovery/);
  assert.match(recovery.run, /20260728115960_prepare_batched_os_duplicate_quarantine\.sql/);
  assert.match(recovery.run, /a35a4f6390937a04202e81ef67d2bd6d98e00c0118b9d7bff7b85544f6ed7a5b/);
  assert.match(recovery.run, /sha256sum/);
  assert.match(recovery.run, /psql "\$TARGET_DB_URL".*--file "\$replay_path"/);
  assert.match(recovery.run, /catalogue-hotfix-behavioral-probe\.mjs recorded/);
  assert.match(recovery.run, /recovery_action="\$\(jq -er/);
  assert.match(recovery.run, /case "\$recovery_action" in/);
  assert.match(recovery.run, /replay\) psql "\$TARGET_DB_URL"/);
  assert.match(recovery.run, /no_replay\) ;;/);
  assert.doesNotMatch(recovery.run, /migration repair|db push|--db-url|--command .*schema_migrations/i);
  assert.ok(
    recovery.run.indexOf("preparation-recovery") < recovery.run.indexOf('--file "$replay_path"'),
    "the exact extractor attests immediately before replay",
  );
});
