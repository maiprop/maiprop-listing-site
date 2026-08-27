import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

import yaml from "js-yaml";

const testRuntime =
  typeof globalThis.describe === "function" && typeof globalThis.it === "function"
    ? globalThis
    : await import(/* @vite-ignore */ ["node", "test"].join(":"));
const { describe, it } = testRuntime;

const workflowPath = resolve(
  ".github/workflows/verify-stripe-live-readiness.yml",
);
const checkerPath = resolve("scripts/check-stripe-live-migration.mjs");
const contractPath = resolve("scripts/stripe-live-readiness-contract.mjs");
const supabaseKeyPath = resolve("scripts/supabase-readonly-key.mjs");
const webhookPath = resolve("supabase/functions/stripe-webhook/index.ts");
const releaseSha = "0123456789abcdef0123456789abcdef01234567";
const plaintextReason = "Emergency Stripe readiness verification for the exact release.";

function stepIndex(job, name) {
  return job.steps.findIndex((step) => step.name === name);
}

function executeBreakGlassValidator() {
  const root = mkdtempSync(join(tmpdir(), "maiprop-stripe-authorization-"));
  const authorizationPath = join(root, "release-authorization.json");
  const outputPath = join(root, "github-output.txt");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
  const result = spawnSync(process.execPath, [
    "scripts/production-break-glass-validation.mjs",
    "validate-workflow",
    "--out", authorizationPath,
    "--github-output", outputPath,
  ], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      RELEASE_AUTHORIZATION_ACTION: "stripe-readiness",
      RELEASE_STANDARD_CONFIRMATION: "VERIFY_STRIPE_LIVE_READINESS",
      RELEASE_SINGLE_ADMIN_BREAK_GLASS: "true",
      RELEASE_INCIDENT_ID: "PERF-BOOTSTRAP-20260826-01",
      RELEASE_REASON: plaintextReason,
      RELEASE_CONFIRM:
        `VERIFY_STRIPE_BREAK_GLASS ${releaseSha} PERF-BOOTSTRAP-20260826-01`,
      RELEASE_SHA: releaseSha,
      RELEASE_CURRENT_MAIN_SHA: releaseSha,
      RELEASE_CHECKOUT_SHA: releaseSha,
      GITHUB_REPOSITORY: "maiprop/maiprop-listing-site",
      GITHUB_REF: "refs/heads/main",
      GITHUB_EVENT_NAME: "workflow_dispatch",
      GITHUB_ACTOR: "krenios",
      GITHUB_TRIGGERING_ACTOR: "krenios",
      GITHUB_RUN_ID: "42",
      GITHUB_RUN_ATTEMPT: "1",
      GITHUB_WORKFLOW_SHA: releaseSha,
      PRODUCTION_RELEASE_DEPLOYERS: "release-bot,krenios",
      PRODUCTION_BREAK_GLASS_ACTOR: "krenios",
      PRODUCTION_BREAK_GLASS_RELEASE_SHA: releaseSha,
      PRODUCTION_BREAK_GLASS_INCIDENT_ID: "PERF-BOOTSTRAP-20260826-01",
      PRODUCTION_BREAK_GLASS_EXPIRES_AT: expiresAt,
    },
  });
  return {
    root,
    result,
    authorizationPath,
    outputPath,
    expiresAt,
  };
}

describe("Stripe live readiness producer workflow", () => {
  it("produces an exact-SHA attempt-one HMAC-bound read-only artifact", () => {
    assert.equal(existsSync(workflowPath), true, "Stripe readiness workflow is missing");
    const source = readFileSync(workflowPath, "utf8");
    const parsed = yaml.load(source);
    const job = parsed.jobs["verify-stripe-readiness"];

    assert.deepEqual(Object.keys(parsed.on), ["workflow_dispatch"]);
    assert.deepEqual(parsed.on.workflow_dispatch.inputs.release_sha, {
      description: "Exact 40-character SHA currently at the tip of main",
      required: true,
      type: "string",
    });
    assert.deepEqual(parsed.on.workflow_dispatch.inputs.confirm, {
      description: "Type VERIFY_STRIPE_LIVE_READINESS",
      required: true,
      type: "string",
    });
    assert.deepEqual(parsed.permissions, { actions: "read", contents: "read" });
    assert.equal(job.name, "Verify exact-SHA Stripe live catalogue");
    assert.deepEqual(job.permissions, { actions: "read", contents: "read" });
    assert.ok(source.includes("github.ref != 'refs/heads/main'"));
    assert.ok(source.includes("github.run_attempt != 1"));
    assert.ok(source.includes("github.actor != github.triggering_actor"));
    assert.ok(source.includes("PRODUCTION_RELEASE_APPROVERS"));
    assert.ok(source.includes("VERIFY_STRIPE_LIVE_READINESS"));
    assert.ok(!source.includes("environment: production"));
    assert.ok(source.includes("^[0-9a-f]{40}$"));
    assert.ok(source.includes("repos/${GITHUB_REPOSITORY}/branches/main"));
    assert.ok(source.includes('ACTUAL_SHA="$(git rev-parse HEAD)"'));
    assert.ok(source.includes("STRIPE_RESTRICTED_KEY: ${{ secrets.STRIPE_RESTRICTED_KEY }}"));
    assert.ok(!source.includes("STRIPE_EXPECTED_ACCOUNT_ID:"));
    assert.ok(readFileSync(checkerPath, "utf8").includes("MAIPROP_PRODUCTION_STRIPE_ACCOUNT_ID"));
    assert.ok(readFileSync(contractPath, "utf8").includes('"acct_1TnuLTGfOEgBOxtl"'));
    assert.ok(source.includes("VITE_SUPABASE_PUBLISHABLE_KEY"));
    assert.ok(source.includes("check:stripe-live-migration -- --evidence-json"));
    assert.ok(source.includes("verify:stripe-live-migration-evidence --"));
    assert.ok(source.includes("stripe-live-readiness-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}"));
    assert.ok(source.includes("scripts/create-release-artifact-binding.mjs"));
    assert.ok(source.includes("scripts/verify-release-artifact-binding.mjs"));
    assert.ok(source.includes("--same-run"));
    assert.ok(source.includes("-binding"));
    assert.ok(!source.includes("STRIPE_SECRET_KEY: ${{ secrets."));
    assert.doesNotMatch(source, /stripe\s+products\s+create|stripe\s+prices\s+create/i);
    assert.doesNotMatch(source, /curl[^\n]+(?:-X|--request)\s+(?:POST|PUT|PATCH|DELETE)/i);
  });

  it("selects typed standard or break-glass authorization before Stripe credentials", () => {
    const source = readFileSync(workflowPath, "utf8");
    const parsed = yaml.load(source);
    const inputs = parsed.on.workflow_dispatch.inputs;
    const job = parsed.jobs["verify-stripe-readiness"];

    assert.deepEqual(inputs.single_admin_break_glass, {
      description: "Use the exact-SHA single-admin break-glass authorization",
      required: true,
      default: false,
      type: "boolean",
    });
    assert.deepEqual(inputs.incident_id, {
      description: "Configured break-glass incident ID; empty in standard mode",
      required: false,
      type: "string",
    });
    assert.deepEqual(inputs.reason, {
      description: "Ephemeral break-glass reason; empty in standard mode",
      required: false,
      type: "string",
    });

    const checkoutIndex = stepIndex(job, "Verify exact checkout identity");
    const authorizationIndex = stepIndex(job, "Select release authorization");
    const stripeIndex = stepIndex(job, "Produce and verify read-only Stripe live evidence");
    assert.ok(checkoutIndex >= 0);
    assert.ok(authorizationIndex > checkoutIndex);
    assert.ok(stripeIndex > authorizationIndex);
    const authorization = job.steps[authorizationIndex];
    assert.ok(authorization.run.includes(
      "node scripts/production-break-glass-validation.mjs validate-workflow",
    ));
    assert.ok(authorization.run.includes("--out release-authorization.json"));
    assert.equal(authorization.env.RELEASE_AUTHORIZATION_ACTION, "stripe-readiness");
    assert.equal(authorization.env.RELEASE_STANDARD_CONFIRMATION, "VERIFY_STRIPE_LIVE_READINESS");
    assert.equal(authorization.env.RELEASE_REASON, "${{ inputs.reason }}");
    assert.equal(authorization.env.STRIPE_RESTRICTED_KEY, undefined);
    for (const step of job.steps.slice(0, authorizationIndex + 1)) {
      assert.equal(JSON.stringify(step).includes("STRIPE_RESTRICTED_KEY"), false);
    }

    const standardGate = job.steps.find(
      (step) => step.name === "Enforce standard Stripe dispatcher allowlist",
    );
    assert.equal(standardGate.if, "${{ steps.authorization.outputs.mode == 'standard' }}");
    assert.equal(standardGate.env.ALLOWED_ACTORS, "${{ vars.PRODUCTION_RELEASE_APPROVERS }}");
  });

  it("persists only normalized authorization and signs the authorization-bearing evidence", () => {
    const fixture = executeBreakGlassValidator();
    try {
      assert.equal(fixture.result.status, 0, fixture.result.stderr);
      const authorization = JSON.parse(readFileSync(fixture.authorizationPath, "utf8"));
      const githubOutput = readFileSync(fixture.outputPath, "utf8");
      assert.deepEqual(authorization, {
        mode: "break_glass",
        action: "stripe-readiness",
        actor: "krenios",
        release_sha: releaseSha,
        incident_id: "PERF-BOOTSTRAP-20260826-01",
        reason_sha256: "e55b195f33e47c1f6654ed3153b60d5dcaf738a422b4eac798ecdd1b262e5c23",
        authorized_expires_at: fixture.expiresAt,
        workflow_run_id: "42",
        workflow_run_attempt: "1",
      });
      assert.equal(
        `${fixture.result.stdout}${fixture.result.stderr}${githubOutput}${JSON.stringify(authorization)}`
          .includes(plaintextReason),
        false,
      );

      const parsed = yaml.load(readFileSync(workflowPath, "utf8"));
      const job = parsed.jobs["verify-stripe-readiness"];
      const stripe = job.steps.find(
        (step) => step.name === "Produce and verify read-only Stripe live evidence",
      );
      const payloadUpload = job.steps.find(
        (step) => step.id === "stripe_evidence_upload",
      );
      const binding = job.steps.find(
        (step) => step.name === "Create and same-run verify HMAC evidence binding",
      );
      assert.ok(stripe.run.includes(
        "jq --slurpfile authorization release-authorization.json '. + {authorization: $authorization[0]}'",
      ));
      const mergeIndex = stripe.run.indexOf("jq --slurpfile authorization");
      assert.ok(mergeIndex >= 0);
      assert.ok(
        stripe.run.indexOf("verify:stripe-live-migration-evidence --", mergeIndex) > mergeIndex,
      );
      assert.equal(payloadUpload.with.path, "stripe-live-migration-evidence.json");
      assert.ok(binding.run.includes("--payload-root stripe-live-migration-evidence.json"));
      assert.equal(JSON.stringify(job.steps).includes("$GITHUB_STEP_SUMMARY"), false);
    } finally {
      rmSync(fixture.root, { recursive: true, force: true });
    }
  });

  it("keeps provider verification unprivileged with one non-mutating deny probe", () => {
    const workflow = readFileSync(workflowPath, "utf8");
    const checker = readFileSync(checkerPath, "utf8");
    const supabaseKey = readFileSync(supabaseKeyPath, "utf8");

    assert.equal(checker.match(/\bmethod\s*:\s*"POST"/g)?.length, 1);
    assert.ok(checker.includes("assertRestrictedKeyWriteDenied"));
    assert.ok(checker.includes("body: new URLSearchParams()"));
    assert.doesNotMatch(checker, /\bmethod\s*:\s*"(?:PUT|PATCH|DELETE)"/);
    assert.ok(checker.includes("getSupabaseReadOnlyKey(process.env)"));
    assert.ok(supabaseKey.includes("VITE_SUPABASE_PUBLISHABLE_KEY"));
    assert.ok(supabaseKey.includes("Privileged Supabase keys are forbidden"));
    assert.doesNotMatch(workflow, /SUPABASE_(?:SERVICE_ROLE|SECRET)_KEY|SB_SERVICE_ROLE_KEY/);
    assert.doesNotMatch(workflow, /STRIPE_(?:SECRET|API|READ_ONLY)_KEY/);
  });

  it("requires every billing-reconciliation webhook event", () => {
    const checker = readFileSync(checkerPath, "utf8");
    const webhook = readFileSync(webhookPath, "utf8");
    const reconciliationEvents = [
      "invoice.finalized",
      "credit_note.created",
      "credit_note.updated",
      "credit_note.voided",
    ];

    for (const event of reconciliationEvents) {
      assert.ok(webhook.includes(`case "${event}"`));
      assert.ok(checker.includes(`"${event}"`));
    }
  });
});
