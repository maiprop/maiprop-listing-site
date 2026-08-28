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

  const validation = `${stepText(validate)}\n${JSON.stringify(validate)}`;
  const authorizationStep = steps(validate).find(
    (step) => step.name === "Validate exact current-main control and authorization",
  );
  assert.match(validation, /catalogue-performance-hotfix-contract\.mjs verify --json/);
  assert.equal(authorizationStep.env.RELEASE_AUTHORIZATION_ACTION, "production-deploy");
  assert.equal(authorizationStep.env.RELEASE_STANDARD_CONFIRMATION, "DEPLOY_CATALOGUE_PERFORMANCE_HOTFIX");
  assert.match(validation, /production-break-glass-validation\.mjs validate-workflow/);
  assert.equal(authorizationStep.env.PRODUCTION_RELEASE_DEPLOYERS, "${{ vars.PRODUCTION_RELEASE_DEPLOYERS }}");
  assert.match(validation, /git fetch --no-tags origin main/);
  assert.match(validation, /RELEASE_CURRENT_MAIN_SHA/);
  assert.match(validation, /GITHUB_SHA/);
  assert.match(validation, /GITHUB_WORKFLOW_SHA/);
  assert.match(validation, /GITHUB_REF/);
  assert.match(validation, /GITHUB_RUN_ATTEMPT/);
  assert.match(validation, /GITHUB_TRIGGERING_ACTOR/);

  for (const [target, job] of Object.entries({ staging, production })) {
    const body = stepText(job);
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
    const helpers = readFileSync(resolve(process.cwd(), "scripts/catalogue-hotfix-workflow-helpers.mjs"), "utf8");
    assert.match(helpers, /expected_pending_versions/);
    assert.match(helpers, /pending_versions/);
    assert.match(helpers, /new URL/);
    assert.match(helpers, /sslmode/);
    assert.match(helpers, /sb_publishable_|role !== "anon"/);
    assert.match(body, /pending/i);
    assert.match(body, /validate-dry-run/);
    assert.match(body, /db push --include-all/);
    assert.match(body, /20260728123058/);
    assert.match(body, /20260729120405/);
    assert.match(body, /get_public_listing_catalogue/);
    assert.match(body, /get_public_catalogue_publication/);
    assert.match(body, /anon|anonymous/i);
    assert.match(body, /30/);
    assert.match(body, /p95/i);
    assert.match(body, /completed_at|timestamp/i);
    assert.match(body, /git fetch --no-tags origin main/);
    assert.match(body, /RELEASE_CURRENT_MAIN_SHA/);
    assert.match(body, /elapsed_seconds/);
    assert.match(body, /successful_runs/);
  }

  const stagingBody = stepText(staging);
  assert.match(stagingBody, /public_catalogue_snapshot_test\.sql/);
  assert.match(stagingBody, /90/);
  assert.match(stagingBody, /status=eq\.active/);
  assert.match(stagingBody, /is_off_market=eq\.false/);
  assert.match(stagingBody, /location_search_text=ilike/i);
  assert.match(stagingBody, /project_detail/);
  assert.match(stagingBody, /listing_images_detail/);
  assert.match(stagingBody, /-X GET|--request GET/);
  assert.match(stagingBody, /-X HEAD|--request HEAD/);
  assert.match(stagingBody, /publish-public-catalogue/);
  assert.match(stagingBody, /minute/i);
  assert.match(stagingBody, /publication_id/);
  assert.match(stagingBody, /STAGING_MUTATION_ACKNOWLEDGEMENT/);
  assert.match(readFileSync(resolve(process.cwd(), "scripts/assert-staging-mutation-target.mjs"), "utf8"), /MUTATE_STAGING_xsiehskfgeoqyazcgauv/);
  assert.match(stagingBody, /p50_ms/);
  assert.match(stagingBody, /p95_ms/);
  assert.doesNotMatch(stagingBody, /cold_p95_ms/);

  const productionBody = stepText(production);
  assert.match(productionBody, /release:verify-live-marker/);
  assert.match(productionBody, /https:\/\/portal\.maiprop\.co\/api\/public\/listings/);
  assert.match(productionBody, /get_public_listing_catalogue/);
  assert.match(productionBody, /cold_samples/);
  assert.match(productionBody, /warm_samples/);
  assert.match(productionBody, /cold_p50_ms/);
  assert.match(productionBody, /warm_p95_ms/);
  assert.match(productionBody, /live-frontend-marker\.json/);
  assert.match(productionBody, /database_hotfix_sha/);
  assert.match(productionBody, /db53d1b9adae41edae93fbeb3e612b42dd8fec0b/);
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
