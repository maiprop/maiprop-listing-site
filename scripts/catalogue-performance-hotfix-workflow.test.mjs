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
  assert.match(stagingKeyStep.run, /Authorization: Bearer \$SUPABASE_ACCESS_TOKEN/);
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
    "Mint temporary staging database login",
    "Mint temporary production database login",
  ]);
  for (const [job, name] of [
    [staging, "Mint temporary staging database login"],
    [production, "Mint temporary production database login"],
  ]) {
    const loginIndex = steps(job).findIndex((step) => step.name === name);
    const normalizeIndex = steps(job).findIndex((step) => /Normalize .* database URL/.test(step.name ?? ""));
    const identityIndex = steps(job).findIndex((step) => /Revalidate .* immediately before mutation/.test(step.name ?? ""));
    const bindingIndex = steps(job).findIndex((step) => /Validate temporary .* database binding/.test(step.name ?? ""));
    assert.ok(normalizeIndex < identityIndex && loginIndex === identityIndex + 1 && bindingIndex === loginIndex + 1);
    assert.deepEqual(steps(job)[loginIndex].env, {
      SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
    });
    assert.equal(steps(job)[loginIndex].run.trim(), "bash scripts/catalogue-hotfix-database-login.sh");
    assert.equal(steps(job)[bindingIndex].run.trim(), "node scripts/catalogue-hotfix-workflow-helpers.mjs validate-target");
  }
  const databaseLogin = readFileSync(databaseLoginPath, "utf8");
  assert.match(databaseLogin, /https:\/\/api\.supabase\.com\/v1\/projects\/xsiehskfgeoqyazcgauv\/cli\/login-role/);
  assert.match(databaseLogin, /https:\/\/api\.supabase\.com\/v1\/projects\/qvvicunqcrwpioqnvzxf\/cli\/login-role/);
  assert.match(databaseLogin, /--request POST/);
  assert.match(databaseLogin, /--data '\{"read_only":false\}'/);
  assert.match(databaseLogin, /--connect-timeout 10/);
  assert.match(databaseLogin, /--max-time 30/);
  assert.match(databaseLogin, /--max-filesize 65536/);
  assert.doesNotMatch(databaseLogin, /--retry|--retry-all-errors/);
  assert.match(databaseLogin, /chmod 600 "\$response_file"/);
  assert.match(databaseLogin, /trap 'rm -f -- "\$response_file"' EXIT/);
  assert.match(databaseLogin, /write-temporary-db-env "\$response_file"/);
  assert.doesNotMatch(databaseLogin, /-sS|--show-error|--verbose|--trace|\bcat\b|\btee\b/);

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
    steps(staging).find((step) => step.name === "Revalidate staging identity immediately before mutation"),
    steps(production).find((step) => step.name === "Revalidate production control and authorization immediately before mutation"),
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
    const normalizeStepIndex = steps(job).findIndex(
      (step) => step.name === `Normalize ${target} database URL for required TLS`,
    );
    const identityStepIndex = steps(job).findIndex(
      (step) => String(step.name ?? "").startsWith(`Revalidate ${target}`),
    );
    assert.ok(
      normalizeStepIndex >= 0 && normalizeStepIndex < identityStepIndex,
      `${target} normalizes its opaque database secret before identity validation`,
    );
    assert.match(steps(job)[normalizeStepIndex].run, /normalize-db-url-env/);
    assert.match(body, /catalogue-performance-hotfix-contract\.mjs verify --json/);
    assert.match(body, /RUNNER_TEMP/);
    assert.match(body, /supabase_migrations\.schema_migrations/);
    assert.match(body, /numeric/i);
    assert.match(body, /placeholder/i);
    assert.match(body, /--dry-run/);
    assert.match(body, /db push --include-all --dry-run --db-url "\$TARGET_DB_URL"/);
    assert.match(body, /db push --include-all --yes --db-url "\$TARGET_DB_URL"/);
    assert.match(body, /dry-run-output\.txt.*2>&1|2>&1.*dry-run-output\.txt/);
    assert.match(body, /catalogue-hotfix-workflow-helpers\.mjs validate-dry-run/);
    assert.match(helpers, /expected_pending_versions/);
    assert.match(helpers, /pending_versions/);
    assert.match(helpers, /new URL/);
    assert.match(helpers, /sslmode/);
    assert.match(helpers, /sb_publishable_|role !== "anon"/);
    assert.match(body, /pending/i);
    assert.match(body, /validate-dry-run/);
    assert.match(body, /db push --include-all/);
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs recorded/);
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs postapply evidence\/database-contract\.json/);
    assert.match(behaviouralProbe, /20260728123058/);
    assert.match(behaviouralProbe, /20260729120405/);
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
    const identityStep = steps(job)[identityStepIndex];
    assert.match(identityStep.run, /\$\{TARGET_API_URL%\/\}\/auth\/v1\/settings/);
    assert.match(identityStep.run, /Accept: application\/json/);
    assert.match(identityStep.run, /apikey: \$TARGET_ANON_KEY/);
    assert.match(identityStep.run, /validate-api-readiness "\$readiness_status"/);
    assert.match(identityStep.run, /-o \/dev\/null/);
    assert.match(identityStep.run, /--connect-timeout 10/);
    assert.match(identityStep.run, /--max-time 30/);
    assert.match(identityStep.run, /readiness_status="000"/);
    assert.doesNotMatch(identityStep.run, /\/rest\/v1\/|openapi|-D |--dump-header|response_body|cat .*readiness/i);
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
  for (const body of [stagingBody, productionBody]) {
    assert.match(body, /Refuse recorded hotfix drift before/);
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs recorded/);
    assert.match(body, /catalogue-hotfix-behavioral-probe\.mjs postapply/);
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
    (step) => step.name === "Verify production legacy worker, cron, and public API pairs",
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
  assert.match(text, /cd "\$work"/);
  assert.doesNotMatch(text, /echo[^\n]*(?:DB_URL|RELEASE_REASON|reason)/i);
});
