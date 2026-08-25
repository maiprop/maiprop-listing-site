import { readFileSync, readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

import {
  STRIPE_RUNTIME_BINDINGS,
} from "./validate-cloudflare-pages-staging-posture.mjs";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const cloudflarePostureValidator = readFileSync(
  resolve(root, "scripts", "validate-cloudflare-pages-staging-posture.mjs"),
  "utf8",
);
const releasePlan = readFileSync(
  resolve(
    root,
    "docs",
    "superpowers",
    "plans",
    "2026-07-29-complete-ecas-production-release.md",
  ),
  "utf8",
);

function curlRequestsTo(run, accountVariable) {
  const requests = [];
  const needle = `/accounts/$${accountVariable}/`;
  let offset = 0;
  while (offset < run.length) {
    const urlIndex = run.indexOf(needle, offset);
    if (urlIndex === -1) break;
    const start = run.lastIndexOf("curl", urlIndex);
    const end = run.indexOf("\n", urlIndex);
    requests.push(run.slice(start, end === -1 ? run.length : end));
    offset = end === -1 ? run.length : end + 1;
  }
  return requests;
}

describe("production release train", () => {
  it("parses every production release workflow as valid YAML", () => {
    for (const name of [
      "ci.yml",
      "approve-production-release.yml",
      "compliance-evidence.yml",
      "lock-cloudflare-pages-git-deploys.yml",
      "bootstrap-cloudflare-staging-pages.yml",
      "stage-release.yml",
      "reusable-supabase-staging.yml",
      "deploy-edge-functions.yml",
      "deploy-supabase-production-db.yml",
      "deploy-production-release.yml",
      "direct-cloudflare-production-deploy.yml",
      "reusable-cloudflare-production-deploy.yml",
    ]) {
      expect(() => yaml.load(workflow(name)), name).not.toThrow();
    }
  });

  it("keeps every ID-selected artifact flat for direct-path consumers", () => {
    const workflowDirectory = resolve(root, ".github", "workflows");
    const selectedArtifacts = [];
    const offenders = [];

    for (const workflowName of readdirSync(workflowDirectory)
      .filter((name) => name.endsWith(".yml"))
      .sort()) {
      const parsed = yaml.load(
        readFileSync(resolve(workflowDirectory, workflowName), "utf8"),
      );
      for (const [jobName, job] of Object.entries(parsed.jobs ?? {})) {
        for (const [stepIndex, step] of (job.steps ?? []).entries()) {
          if (
            typeof step?.uses !== "string" ||
            !step.uses.startsWith("actions/download-artifact@") ||
            step.with?.["artifact-ids"] === undefined
          ) {
            continue;
          }
          const location = `${workflowName}:${jobName}:${step.name ?? `step-${stepIndex + 1}`}`;
          selectedArtifacts.push(location);
          if (step.with?.["merge-multiple"] !== true) {
            offenders.push(location);
          }
        }
      }
    }

    expect(selectedArtifacts.length).toBeGreaterThan(0);
    expect(offenders).toEqual([]);
  });

  it("rejects non-singleton Stripe artifact IDs before reusable production downloads", () => {
    const offenders = [];
    const singletonGuard =
      'if ! [[ "$STRIPE_READINESS_ARTIFACT_ID" =~ ^[1-9][0-9]*$ ]]; then';

    for (const workflowName of [
      "deploy-edge-functions.yml",
      "deploy-supabase-production-db.yml",
    ]) {
      const parsed = yaml.load(workflow(workflowName));
      const validationSteps = [];

      for (const [jobName, job] of Object.entries(parsed.jobs ?? {})) {
        for (const [stepIndex, step] of (job.steps ?? []).entries()) {
          if (step.name === "Validate exact production release tuple") {
            validationSteps.push({ jobName, stepIndex, step, steps: job.steps });
          }
        }
      }

      expect(
        validationSteps,
        `${workflowName}:Validate exact production release tuple`,
      ).toHaveLength(1);
      const [{ jobName, stepIndex, step, steps }] = validationSteps;
      const downloadIndexes = steps
        .map((candidate, index) => ({ candidate, index }))
        .filter(({ candidate }) =>
          candidate.uses?.startsWith("actions/download-artifact@"),
        )
        .map(({ index }) => index);

      expect(
        downloadIndexes.length,
        `${workflowName}:${jobName}`,
      ).toBeGreaterThan(0);
      expect(
        downloadIndexes.every((downloadIndex) => stepIndex < downloadIndex),
        `${workflowName}:${jobName}:artifact download ordering`,
      ).toBe(true);
      if (!step.run?.includes(singletonGuard)) {
        offenders.push(`${workflowName}:${jobName}:${step.name}`);
      }
    }

    expect(offenders).toEqual([]);
  });

  it("keeps the bare PostgreSQL migration harness aligned with Supabase-managed helpers", () => {
    const ci = workflow("ci.yml");

    expect(ci).toContain("CREATE OR REPLACE FUNCTION auth.jwt() RETURNS jsonb");
    expect(ci).toContain("CREATE OR REPLACE FUNCTION cron.alter_job(");
    expect(ci).toContain("job_id bigint");
    expect(ci).toContain("active boolean DEFAULT NULL");
  });

  it("never mutates production directly from the validation workflow", () => {
    const ci = workflow("ci.yml");

    expect(ci).toContain("name: Immutable release candidate built");
    expect(ci).toContain("--supabase supabase");
    expect(ci).toContain(
      "git status --porcelain --untracked-files=all -- supabase",
    );
    expect(ci).toContain(
      "Supabase source changed before immutable candidate packaging.",
    );
    expect(ci).toContain("always() &&");
    expect(ci).toContain("RELEASE_SAFETY_RESULT:");
    expect(ci).toContain('if [ "$result" != "success" ]; then');
    expect(ci).toContain("No staging or production service was mutated");
    expect(ci).toContain(
      "production-release-candidate-${{ github.sha }}-${{ github.run_attempt }}",
    );
    expect(ci).not.toContain(
      "name: production-release-candidate-${{ github.sha }}\n",
    );
    expect(ci).not.toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
  });

  it("keeps compliance evidence read-only and isolates its Cloudflare read token", () => {
    const compliance = workflow("compliance-evidence.yml");
    const parsed = yaml.load(compliance);
    const mainVerification = parsed.jobs["verify-current-main"];
    const control = parsed.jobs["cloudflare-pages-verify"];
    const collect = parsed.jobs.collect;
    const dispatch = parsed.on.workflow_dispatch;
    const controlStep = control.steps.find(
      (step) => step.name === "Verify Cloudflare Pages Git deployment lockout",
    );
    const controlUpload = control.steps.find(
      (step) => step.name === "Upload minimized Cloudflare Pages posture evidence",
    );
    const controlEnforcement = control.steps.find(
      (step) => step.name === "Enforce Cloudflare Pages posture verification",
    );
    const controlSource = JSON.stringify(control);
    const collectSource = JSON.stringify(collect);
    const evidenceMaterialize = collect.steps.find(
      (step) => step.name === "Materialize minimized Cloudflare Pages posture evidence",
    );
    const collectCheckout = collect.steps.find(
      (step) => String(step.uses ?? "").startsWith("actions/checkout@"),
    );
    const setupNode = collect.steps.find(
      (step) => String(step.uses ?? "").startsWith("actions/setup-node@"),
    );
    const install = collect.steps.find(
      (step) => step.name === "Install dependencies",
    );
    const localStandards = collect.steps.find(
      (step) => step.name === "Run local standards gates",
    );
    const githubEvidence = collect.steps.find(
      (step) => step.name === "Capture GitHub governance evidence",
    );
    const supabaseEvidence = collect.steps.find(
      (step) => step.name === "Capture Supabase live security evidence",
    );
    const sentryEvidence = collect.steps.find(
      (step) => step.name === "Capture Sentry live telemetry status",
    );

    expect(parsed.concurrency["cancel-in-progress"]).toBe(false);
    expect(dispatch).toEqual({});
    expect(mainVerification.if).toBe(
      "${{ github.ref == 'refs/heads/main' }}",
    );
    expect(JSON.stringify(mainVerification)).not.toMatch(
      /secrets\.(?:CLOUDFLARE|SUPABASE|SENTRY)/,
    );
    expect(JSON.stringify(mainVerification)).not.toContain("actions/checkout");
    expect(JSON.stringify(mainVerification)).not.toContain("npm ");
    expect(mainVerification.steps[0].run).toContain(
      "repos/${GITHUB_REPOSITORY}/branches/main",
    );
    expect(mainVerification.steps[0].run).toContain("GITHUB_WORKFLOW_SHA");
    expect(control.needs).toBe("verify-current-main");
    expect(control.if).toBe("${{ github.ref == 'refs/heads/main' }}");
    expect(control.concurrency).toEqual({
      group: "maiprop-cloudflare-pages-git-deploy-verify",
      "cancel-in-progress": false,
    });
    expect(controlSource).not.toContain("actions/checkout");
    expect(controlSource).not.toContain("actions/setup-node");
    expect(controlSource).not.toContain("npm ");
    expect(controlSource).not.toContain("node scripts/");
    expect(control.env).toBeUndefined();
    expect(controlStep.env.CLOUDFLARE_PAGES_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_ACCOUNT_ID).toBe(
      "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
    );
    expect(controlStep.env.CLOUDFLARE_STAGING_PAGES_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_PAGES_READ_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_STAGING_ACCOUNT_ID).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_ACCOUNT_ID }}",
    );
    expect(controlStep.run).toContain(
      '[ "$CLOUDFLARE_ACCOUNT_ID" = "$CLOUDFLARE_STAGING_ACCOUNT_ID" ]',
    );
    expect(collect.env).toBeUndefined();
    expect(collectSource).not.toContain("secrets.CLOUDFLARE_PAGES_EDIT_TOKEN");
    for (const step of [
      collectCheckout,
      setupNode,
      install,
      localStandards,
    ]) {
      expect(JSON.stringify(step)).not.toMatch(
        /(?:SUPABASE|SENTRY|GH_TOKEN|GITHUB_TOKEN|secrets\.)/,
      );
    }
    expect(githubEvidence.env).toEqual({
      GH_TOKEN: "${{ github.token }}",
      GITHUB_TOKEN: "${{ github.token }}",
    });
    expect(supabaseEvidence.env).toEqual({
      SUPABASE_ACCESS_TOKEN: "${{ secrets.SUPABASE_ACCESS_TOKEN }}",
      SUPABASE_PROJECT_REF: "${{ secrets.VITE_SUPABASE_PROJECT_ID }}",
    });
    expect(sentryEvidence.env).toEqual({
      SENTRY_AUTH_TOKEN: "${{ secrets.SENTRY_AUTH_TOKEN }}",
      SENTRY_ORG: "${{ vars.SENTRY_ORG || secrets.SENTRY_ORG }}",
      SENTRY_PROJECT:
        "${{ vars.SENTRY_PROJECT || secrets.SENTRY_PROJECT }}",
      SENTRY_ENVIRONMENT: "production",
    });
    expect(controlStep.run).toContain(
      'PRODUCTION_PROJECT="maiprop-listing-site"',
    );
    expect(controlStep.run).toContain(
      'STAGING_PROJECT="maiprop-listing-site-staging"',
    );
    expect(controlStep.run).toContain(
      '.success == true and .result.name == $name',
    );
    expect(controlStep.run).toContain(
      '($id == "" or .result.id == $id)',
    );
    expect(controlStep.run).toContain(
      '.result.source == null or',
    );
    expect(controlStep.run).toContain(
      '.result.source.type == "github" or .result.source.type == "gitlab"',
    );
    expect(controlStep.run).toContain(
      "cloudflare-pages-git-auto-deploy-post-state.json",
    );
    expect(controlStep.run).toContain(
      '.result.source.config.deployments_enabled == false',
    );
    expect(controlStep.run).toContain(
      '.result.source.config.production_deployments_enabled == false',
    );
    expect(controlStep.run).toContain(
      '.result.source.config.preview_deployment_setting == "none"',
    );
    expect(controlStep["continue-on-error"]).toBe(true);
    expect(controlStep.run).toContain("bootstrap_required");
    expect(controlStep.run).toContain(
      "Set CLOUDFLARE_PAGES_PROJECT_ID and CLOUDFLARE_STAGING_PAGES_PROJECT_ID",
    );
    expect(controlUpload.if).toBe("${{ always() }}");
    expect(controlUpload.with.path).toBe(
      "${{ runner.temp }}/cloudflare-pages-posture-evidence/",
    );
    expect(controlUpload.with.path).not.toContain("raw");
    expect(controlEnforcement.if).toBe("${{ always() }}");
    expect(controlEnforcement.run).toContain("VERIFY_OUTCOME");
    expect(control.steps.indexOf(controlUpload)).toBeLessThan(
      control.steps.indexOf(controlEnforcement),
    );
    expect(evidenceMaterialize.if).toBe("always()");
    expect(evidenceMaterialize.env).toEqual({
      CLOUDFLARE_PAGES_POST_STATE_JSON:
        "${{ needs.cloudflare-pages-verify.outputs.cloudflare_pages_post_state_json }}",
      CLOUDFLARE_PAGES_POSTURE_JSON:
        "${{ needs.cloudflare-pages-verify.outputs.cloudflare_pages_posture_json }}",
      CLOUDFLARE_ADMIN_POSTURE_JSON:
        "${{ needs.cloudflare-pages-verify.outputs.cloudflare_admin_posture_json }}",
    });
    expect(evidenceMaterialize.run).toContain("compliance-evidence/cloudflare-pages-git-auto-deploy-post-state.json");
    expect(collect.needs).toEqual([
      "verify-current-main",
      "cloudflare-pages-verify",
    ]);
    expect(collect.if).toContain("github.ref == 'refs/heads/main'");
    expect(collect.if).toContain(
      "needs.verify-current-main.result == 'success'",
    );
    expect(collectCheckout.with.ref).toBe(
      "${{ needs.verify-current-main.outputs.main_sha }}",
    );
    expect(collectCheckout.with["persist-credentials"]).toBe(false);
    expect(compliance).not.toMatch(
      /(?:--request|-X)\s*(?:POST|PUT|PATCH|DELETE)\b/i,
    );
    expect(compliance).not.toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
  });

  it("uploads unlocked project identity evidence before failing bootstrap", () => {
    const compliance = workflow("compliance-evidence.yml");
    const parsed = yaml.load(compliance);
    const controlStep = parsed.jobs["cloudflare-pages-verify"].steps.find(
      (step) => step.name === "Verify Cloudflare Pages Git deployment lockout",
    );
    const run = controlStep.run;
    const identityStart = run.indexOf("validate_identity() {");
    const lockedStart = run.indexOf("validate_locked() {");
    const identityBody = run.slice(identityStart, lockedStart);
    const evidenceWrite = run.indexOf(
      '"$EVIDENCE_DIR/cloudflare-pages-git-auto-deploy-posture.json"',
    );
    const bootstrapFailure = run.indexOf(
      'if [ "$bootstrap_required" -eq 1 ]; then',
    );
    const lockedValidation = run.indexOf(
      'validate_locked "$PRODUCTION_RAW"',
      bootstrapFailure,
    );

    expect(identityStart).toBeGreaterThanOrEqual(0);
    expect(identityBody).toContain(
      '(.result.id | type == "string" and length > 0)',
    );
    expect(identityBody).not.toContain("production_deployments_enabled");
    expect(run).toContain(
      'if [ "$PRODUCTION_ACTUAL_ID" = "$STAGING_ACTUAL_ID" ]; then',
    );
    expect(run).toContain(
      "allAutomaticDeploymentsDisabled:",
    );
    expect(evidenceWrite).toBeGreaterThanOrEqual(0);
    expect(evidenceWrite).toBeLessThan(bootstrapFailure);
    expect(bootstrapFailure).toBeLessThan(lockedValidation);
  });

  it("formalizes trusted-main provider bootstrap before candidate publication", () => {
    expect(releasePlan).toContain(
      "No candidate branch receives live provider secrets",
    );
    expect(releasePlan).toContain(
      "bootstrap Task 1 workflow",
    );
    expect(releasePlan).toContain(
      "merged to trusted `main` under `[CF-Pages-Skip]`",
    );
    expect(releasePlan).toContain(
      "main-only read and lock verification",
    );
  });

  it("isolates Cloudflare Pages PATCH operations in a manual trusted-main workflow", () => {
    const lock = workflow("lock-cloudflare-pages-git-deploys.yml");
    const parsed = yaml.load(lock);
    const triggerNames = Object.keys(parsed.on);
    const job = parsed.jobs.lock;
    const controlStep = job.steps.find(
      (step) => step.name === "Lock both Cloudflare Pages Git integrations",
    );
    const upload = job.steps.find(
      (step) => step.name === "Upload minimized Cloudflare Pages lock evidence",
    );
    const jobSource = JSON.stringify(job);

    expect(triggerNames).toEqual(["workflow_dispatch"]);
    expect(
      parsed.on.workflow_dispatch.inputs.confirm,
    ).toMatchObject({
      required: true,
      type: "string",
    });
    expect(parsed.jobs["verify-lock-environment"]).toBeUndefined();
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.if).toContain(
      "inputs.confirm == 'DISABLE_CLOUDFLARE_GIT_DEPLOYS'",
    );
    expect(job.needs).toBeUndefined();
    expect(job.environment).toBeUndefined();
    expect(job.if).toContain("github.run_attempt == 1");
    expect(job.if).toContain("github.actor == github.triggering_actor");
    expect(lock).toContain("PRODUCTION_RELEASE_APPROVERS");
    expect(lock).toContain("GITHUB_WORKFLOW_SHA");
    expect(lock).toContain("repos/${GITHUB_REPOSITORY}/branches/main");
    expect(job.concurrency).toEqual({
      group: "maiprop-cloudflare-pages-git-deploy-lock",
      "cancel-in-progress": false,
    });
    expect(jobSource).not.toContain("actions/checkout");
    expect(jobSource).not.toContain("actions/setup-node");
    expect(jobSource).not.toContain("npm ");
    expect(jobSource).not.toContain("node scripts/");
    expect(job.env).toBeUndefined();
    expect(controlStep.env.CLOUDFLARE_PAGES_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_PAGES_EDIT_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_EDIT_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_ACCOUNT_ID).toBe(
      "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
    );
    expect(controlStep.env.CLOUDFLARE_STAGING_PAGES_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_PAGES_READ_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_STAGING_ACCOUNT_ID).toBe(
      "${{ secrets.CLOUDFLARE_STAGING_ACCOUNT_ID }}",
    );
    expect(controlStep.run).toContain(
      '[ "$CLOUDFLARE_ACCOUNT_ID" = "$CLOUDFLARE_STAGING_ACCOUNT_ID" ]',
    );
    expect(controlStep.run).toContain(
      'PRODUCTION_PROJECT="maiprop-listing-site"',
    );
    expect(controlStep.run).toContain(
      'STAGING_PROJECT="maiprop-listing-site-staging"',
    );
    expect(controlStep.run).toContain(
      '.success == true and .result.name == $name and .result.id == $id',
    );
    expect(controlStep.run).toContain(
      '.result.source == null or',
    );
    expect(controlStep.run).toContain(
      '.result.source.type == "github" or .result.source.type == "gitlab"',
    );
    expect(controlStep.run).toContain('if [ -z "$source_type" ]; then');
    expect(controlStep.run.indexOf(
      '[ -z "$EXPECTED_PRODUCTION_PROJECT_ID" ]',
    )).toBeLessThan(controlStep.run.indexOf("patch_project()"));
    expect(controlStep.run.indexOf(
      '[ -z "$EXPECTED_STAGING_PROJECT_ID" ]',
    )).toBeLessThan(controlStep.run.indexOf("patch_project()"));
    expect(controlStep.run).toContain('"type": $source_type');
    expect(controlStep.run).toContain('"deployments_enabled": false');
    expect(controlStep.run).toContain(
      '"production_deployments_enabled": false',
    );
    expect(controlStep.run).toContain(
      '"preview_deployment_setting": "none"',
    );
    expect(controlStep.run).toContain(
      "cloudflare-pages-git-auto-deploy-pre-state.json",
    );
    expect(controlStep.run).toContain(
      "cloudflare-pages-git-auto-deploy-post-state.json",
    );
    expect(controlStep.run).toContain('"capture_status": "failed"');
    expect(controlStep.run).toContain(
      '.result.source.config.deployments_enabled == false',
    );
    expect(controlStep.run).toContain(
      '.result.source.config.production_deployments_enabled == false',
    );
    expect(controlStep.run).toContain(
      '.result.source.config.preview_deployment_setting == "none"',
    );
    expect(upload.if).toBe("${{ always() }}");
    expect(upload.with.path).toBe(
      "${{ runner.temp }}/cloudflare-pages-lock-evidence/",
    );
    expect(upload.with.path).not.toContain("raw");
  });

  it("creates an independently protected exact-SHA production approval artifact", () => {
    const approval = workflow("approve-production-release.yml");
    const parsed = yaml.load(approval);
    const triggerNames = Object.keys(parsed.on);
    const job = parsed.jobs.approve;

    expect(triggerNames).toEqual(["workflow_dispatch"]);
    expect(parsed.on.workflow_dispatch.inputs.release_sha).toMatchObject({
      required: true,
      type: "string",
    });
    expect(parsed.on.workflow_dispatch.inputs.confirm).toMatchObject({
      required: true,
      type: "string",
    });
    expect(Object.keys(parsed.jobs)).toEqual(["approve"]);
    expect(job.name).toBe("Production release approved");
    expect(job.environment).toBeUndefined();
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.if).toContain(
      "inputs.confirm == 'APPROVE_PRODUCTION_RELEASE'",
    );
    expect(job.if).toContain("github.run_attempt == 1");
    expect(job.if).toContain("github.actor == github.triggering_actor");
    expect(job.permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(approval).toContain("github-release-evidence");
    expect(approval).not.toContain("git fetch --no-tags origin main");
    expect(approval).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\'',
    );
    expect(approval).toContain("Require allowlisted production approver");
    expect(approval).toContain("PRODUCTION_RELEASE_APPROVERS");
    expect(approval).toContain("The approval actor is not allowlisted");
    expect(approval).toContain(
      "The allowlisted approver must be independent from CI and staging producers.",
    );
    expect(approval).toContain(
      'binding_name="release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding"',
    );
    expect(approval).toContain("verify-release-artifact-binding.mjs");
    expect(approval).toContain('verification_mode == "prior-run"');
    expect(approval).toContain("RELEASE_EVIDENCE_SIGNING_KEY");
    expect(approval).toContain("RELEASE_EVIDENCE_SIGNING_KEY_ID");
    expect(approval).toContain(
      ".github/workflows/stage-release.yml",
    );
    for (const field of [
      "schema_version: 1",
      "repository:",
      "release_sha:",
      "source_tree:",
      "source_run_id:",
      "source_run_attempt:",
      "artifact_sha256:",
      "staging_run_id:",
      "staging_run_attempt:",
      "approval_run_id:",
      "approval_run_attempt:",
      "approver:",
      "nonce:",
      "revoked: false",
      "approved_at:",
      "expires_at:",
    ]) {
      expect(approval).toContain(field);
    }
    expect(approval).toContain(
      "production-release-approval-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(approval).toContain("Create and verify production approval binding");
    expect(approval).toContain(
      "production-release-approval-binding-${{ inputs.release_sha }}-${{ github.run_id }}-${{ github.run_attempt }}",
    );
    expect(approval).not.toContain("gh attestation");
    expect(approval).not.toContain("actions/attest-build-provenance");
    expect(approval).not.toContain("production-approval-environment");
    expect(approval).not.toMatch(
      /secrets\.(?:SUPABASE|VITE_SUPABASE|CLOUDFLARE|SITE_LOCK)|supabase (?:db push|functions deploy)|pages deploy|wrangler-action@/,
    );
  });

  it("rejects reruns and substituted actors for every manual production workflow", () => {
    for (const [name, jobName] of [
      ["approve-production-release.yml", "approve"],
      ["deploy-production-release.yml", "validate"],
      ["direct-cloudflare-production-deploy.yml", "validate"],
    ]) {
      const parsed = yaml.load(workflow(name));
      const guard = String(parsed.jobs[jobName].if ?? "");
      expect(guard, name).toContain("github.run_attempt == 1");
      expect(guard, name).toContain(
        "github.actor == github.triggering_actor",
      );
    }
  });

  it("requires fresh signed Stripe readiness evidence before production mutation", () => {
    const release = workflow("deploy-production-release.yml");
    const parsed = yaml.load(release);
    const validate = parsed.jobs.validate;
    const aggregate = parsed.jobs["attest-production-release"];

    expect(validate.outputs).toMatchObject({
      stripe_readiness_run_id:
        "${{ steps.release_contract.outputs.stripe_readiness_run_id }}",
      stripe_readiness_run_attempt:
        "${{ steps.release_contract.outputs.stripe_readiness_run_attempt }}",
      stripe_readiness_sha256:
        "${{ steps.release_contract.outputs.stripe_readiness_sha256 }}",
      stripe_readiness_artifact_id:
        "${{ steps.release_contract.outputs.stripe_readiness_artifact_id }}",
      stripe_readiness_artifact_digest:
        "${{ steps.release_contract.outputs.stripe_readiness_artifact_digest }}",
      stripe_readiness_checked_at:
        "${{ steps.release_contract.outputs.stripe_readiness_checked_at }}",
    });
    expect(release).toContain("github-stripe-readiness");
    expect(release).toContain(
      "stripe-live-readiness-${RELEASE_SHA}-${STRIPE_READINESS_RUN_ID}-1",
    );
    expect(release).toContain(
      ".github/workflows/verify-stripe-live-readiness.yml",
    );
    expect(release).toContain(
      "scripts/verify-stripe-live-migration-evidence.mjs",
    );
    expect(release).toContain("RELEASE_EVIDENCE_SIGNING_KEY");
    expect(release).toContain("RELEASE_EVIDENCE_SIGNING_KEY_ID");
    expect(release).toContain("scripts/github-artifact-metadata.mjs");
    expect(release).toContain(
      '--workflow-path ".github/workflows/verify-stripe-live-readiness.yml"',
    );
    expect(release).toContain('--event "workflow_dispatch"');
    expect(release).toContain('--branch "main"');
    expect(release).toContain("stripe_readiness_artifact_id");
    expect(release).toContain("stripe_readiness_artifact_digest");
    expect(release).toContain("stripe_readiness_checked_at");
    expect(release).toContain(
      "STRIPE_READINESS_CHECKED_AT=\"$(jq -er '.checked_at'",
    );
    expect(aggregate.needs).toContain("validate");
    expect(release).toContain("stripe_readiness_sha256");

    for (const name of [
      "deploy-supabase-production-db.yml",
      "deploy-edge-functions.yml",
      "reusable-cloudflare-production-deploy.yml",
    ]) {
      const provider = workflow(name);
      expect(provider, name).toContain("stripe_readiness_run_id:");
      expect(provider, name).toContain("stripe_readiness_run_attempt:");
      expect(provider, name).toContain("stripe_readiness_sha256:");
      expect(provider, name).toContain("--stripe-readiness-run-id");
      expect(provider, name).toContain("--stripe-readiness-run-attempt");
      expect(provider, name).toContain("--stripe-readiness-sha256");
      expect(provider, name).toContain("--stripe-readiness-artifact-id");
      expect(provider, name).toContain(
        "--stripe-readiness-artifact-digest",
      );
    }

    expect(
      release.match(/stripe_readiness_run_id: process\.env\.STRIPE_READINESS_RUN_ID/g),
    ).toHaveLength(4);
    expect(
      release.match(/stripe_readiness_sha256: process\.env\.STRIPE_READINESS_SHA256/g),
    ).toHaveLength(4);
    expect(
      release.match(/stripe_readiness_checked_at:\s*process\.env\.STRIPE_READINESS_CHECKED_AT/g),
    ).toHaveLength(3);

    const directRecovery = workflow("direct-cloudflare-production-deploy.yml");
    expect(directRecovery).toContain("STRIPE_READINESS_CHECKED_AT");
    expect(directRecovery).toMatch(
      /stripe_readiness_checked_at:\s*process\.env\.STRIPE_READINESS_CHECKED_AT/,
    );

    const cloudflare = workflow("reusable-cloudflare-production-deploy.yml");
    expect(cloudflare).toMatch(
      /stripe_readiness_checked_at:\s*sourceLease\.stripe_readiness_checked_at/,
    );
  });

  it("activates the role-switch cron only after exact Edge parity", () => {
    const edge = workflow("deploy-edge-functions.yml");
    const parsed = yaml.load(edge);
    const secrets = parsed.on.workflow_call.secrets;
    expect(secrets.SUPABASE_PRODUCTION_DB_URL).toBeUndefined();
    expect(parsed.jobs.deploy.environment).toBe("production");

    const steps = parsed.jobs.deploy.steps;
    const parityIndex = steps.findIndex(
      (step) => step.name === "Require exact staging-production Edge parity",
    );
    const activationIndex = steps.findIndex(
      (step) => step.name === "Activate and verify role-switch reconciliation cron",
    );
    const attestationIndex = steps.findIndex(
      (step) => step.name === "Create production Edge attestation",
    );
    expect(parityIndex).toBeGreaterThanOrEqual(0);
    expect(activationIndex).toBeGreaterThan(parityIndex);
    expect(attestationIndex).toBeGreaterThan(activationIndex);

    const activation = steps[activationIndex];
    expect(activation.run).toContain("mutation-lease");
    expect(activation.run).toContain(
      "supabase/reconciliation/activate-role-switch-billing-cron.sql",
    );
    expect(activation.run).toContain("production-role-switch-cron-state.json");
  });

  it("keeps staging default-off and binds every privileged job to the trusted candidate", () => {
    const stage = workflow("stage-release.yml");

    expect(stage).toContain("vars.STAGING_RELEASE_ENABLED == 'true'");
    expect(stage).toContain(
      "vars.STAGING_TRUSTED_CONTROL_SHA == github.workflow_sha",
    );
    expect(stage).toContain(
      "github.workflow_sha == github.event.workflow_run.head_sha",
    );
    expect(stage).toContain("TRUSTED_CONTROL_SHA:");
    expect(stage).toContain("WORKFLOW_SHA:");
    expect(stage).toContain(
      "trusted_control_sha: ${{ github.workflow_sha }}",
    );
    expect(stage).toContain(
      "github.event.workflow_run.conclusion == 'success'",
    );
    expect(stage).toContain("github.event.workflow_run.head_sha");
    expect(stage).toContain("github-staging-lease");
    expect(stage).toContain(
      "production-release-candidate-binding-${{ github.event.workflow_run.head_sha }}-${{ github.event.workflow_run.run_attempt }}",
    );
    expect(stage).toContain(
      "release-candidate-attestation-${{ needs.validate-source.outputs.release_sha }}-${{ github.run_attempt }}",
    );
    expect(stage).toContain("source-provenance-verification-");
    expect(stage).toContain("provenance-verification.json");
    expect(stage).toContain("manifest_sha256");
    expect(stage).toContain("/domains");
    expect(stage).toContain("project_domains");
    expect(stage).toContain("STAGING_SUPABASE_PROJECT_ID:");
    expect(stage).toContain("STAGING_SUPABASE_URL:");
    expect(stage).toContain("STAGING_SUPABASE_PUBLISHABLE_KEY:");
    expect(stage).toContain(
      "validate-cloudflare-pages-staging-posture.mjs",
    );
    expect(cloudflarePostureValidator).toContain(
      "SUPABASE_SERVICE_ROLE_KEY",
    );
    expect(cloudflarePostureValidator).toContain(
      "SUPABASE_PROJECT_ID: stagingSupabaseProjectId",
    );
    expect(cloudflarePostureValidator).toContain(
      "SUPABASE_URL: stagingSupabaseUrl",
    );
    expect(cloudflarePostureValidator).toContain(
      "SUPABASE_PUBLISHABLE_KEY: stagingSupabasePublishableKey",
    );
    expect(stage).toContain("verify-release-artifact-binding.mjs");
    expect(stage).toContain("RELEASE_EVIDENCE_SIGNING_KEY");
    expect(stage).toContain("RELEASE_EVIDENCE_SIGNING_KEY_ID");
    expect(stage).toContain(
      '--workflow-ref "$GITHUB_REPOSITORY/.github/workflows/ci.yml@refs/heads/main"',
    );
    expect(stage.match(/persist-credentials: false/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(3);
    expect(stage).not.toContain("npm ci --prefer-offline --no-audit\n");
    expect(stage).toContain("npm ci --ignore-scripts --prefer-offline --no-audit");
  });

  it("revalidates the staging lease before every Supabase mutation", () => {
    const staging = workflow("reusable-supabase-staging.yml");
    const stagingJob = yaml.load(staging).jobs["deploy-supabase-staging"];
    const dryRun = staging.indexOf("Dry-run staging database migrations");
    const applyLease = staging.indexOf(
      "Revalidate staging lease before database apply",
    );
    const apply = staging.indexOf("Apply database migrations to staging");
    const convergenceEvidence = staging.indexOf(
      "Capture legacy migration convergence evidence",
    );
    const postgrestLease = staging.indexOf(
      "Revalidate staging lease before live PostgREST mutation",
    );
    const postgrest = staging.indexOf(
      "Verify live staging PostgREST catalogue contract",
    );
    const edgeLease = staging.indexOf(
      "Revalidate staging lease before Edge mutation",
    );
    const edgeDeploy = staging.indexOf("Deploy edge functions to staging");

    expect(dryRun).toBeGreaterThan(-1);
    expect(applyLease).toBeGreaterThan(dryRun);
    expect(apply).toBeGreaterThan(applyLease);
    expect(convergenceEvidence).toBeGreaterThan(apply);
    expect(postgrestLease).toBeGreaterThan(convergenceEvidence);
    expect(postgrest).toBeGreaterThan(postgrestLease);
    expect(edgeLease).toBeGreaterThan(postgrest);
    expect(edgeDeploy).toBeGreaterThan(edgeLease);
    expect(staging).toContain(
      "PRODUCTION_SUPABASE_PROJECT_ID: ${{ inputs.production_supabase_project_id }}",
    );
    expect(staging).not.toContain(
      "STAGING_SUPABASE_SERVICE_ROLE_KEY=$service_role_key",
    );
    expect(staging).not.toContain(
      "VITE_SUPABASE_PROJECT_ID: ${{ secrets.VITE_SUPABASE_PROJECT_ID }}",
    );
    expect(staging).toContain("trusted_control_sha:");
    expect(staging).toContain("job.workflow_sha");
    expect(staging).toContain("persist-credentials: false");

    expect(staging).not.toContain("migration repair");
    for (const [stepName, mutation] of [
      ["Apply database migrations to staging", "db push"],
      ["Deploy edge functions to staging", "functions deploy"],
    ]) {
      const step = stagingJob.steps.find((candidate) => candidate.name === stepName);
      expect(step, stepName).toBeDefined();
      expect(step.env?.GITHUB_TOKEN, stepName).toBe("${{ github.token }}");
      expect(step.run, stepName).toContain("github-staging-lease");
      expect(step.run.indexOf("github-staging-lease"), stepName).toBeLessThan(
        step.run.indexOf(mutation),
      );
    }
  });

  it("stages database and Edge mutations only from the verified signed artifact", () => {
    const stage = workflow("stage-release.yml");
    const staging = workflow("reusable-supabase-staging.yml");
    const stagingJob = yaml.load(staging).jobs["deploy-supabase-staging"];

    expect(stage).toContain(
      "manifest_sha256: ${{ needs.validate-source.outputs.manifest_sha256 }}",
    );
    expect(staging).toContain("manifest_sha256:");
    expect(staging).toContain("Download immutable Supabase release candidate binding");
    expect(staging).toContain(
      "production-release-candidate-binding-${{ inputs.release_sha }}-${{ inputs.source_run_attempt }}",
    );
    expect(staging).toContain("run-id: ${{ inputs.source_run_id }}");
    expect(staging).toContain("artifact-ids: ${{ steps.supabase_source_binding.outputs.artifact_id }}");
    expect(staging).toContain("verify-release-artifact-binding.mjs");
    expect(staging).toContain(
      "--producer-run source-binding-metadata/run.json",
    );
    expect(staging).not.toContain("gh attestation");
    expect(staging).toContain(
      ".github/workflows/ci.yml",
    );
    expect(staging).toContain(
      "npm run release:artifact:verify --",
    );
    expect(staging).toContain(
      '--dir release-candidate',
    );
    expect(staging).toContain(
      'actual_manifest_sha256="$(sha256sum release-candidate/release-manifest.json',
    );
    expect(staging).not.toContain("npm install -g supabase");
    expect(staging).toContain(
      "npx --no-install supabase --workdir release-candidate --version",
    );
    expect(staging).toContain(
      "npx --no-install supabase --workdir release-candidate db push",
    );
    expect(staging).not.toContain("migration repair");
    expect(staging).toContain(
      "supabase/reconciliation/production-history-v1.sql",
    );
    expect(staging).toContain(
      "npx --no-install supabase --workdir release-candidate functions deploy",
    );
    expect(staging).toContain(
      "find release-candidate/supabase/migrations",
    );
    expect(staging).toContain(
      "--supabase-workdir release-candidate",
    );
    expect(staging).toContain("file_sha256");
    expect(staging).toContain("migration_inventory_sha256");
    for (const stepName of [
      "Dry-run staging database migrations",
      "Apply database migrations to staging",
      "Deploy edge functions to staging",
    ]) {
      const mutationStep = stagingJob.steps.find(
        (step) => step.name === stepName,
      );
      expect(mutationStep.run, stepName).toContain(
        "npm run release:artifact:verify --",
      );
      expect(mutationStep.run, stepName).toContain(
        "release-candidate/release-manifest.json",
      );
    }
    expect(staging).not.toMatch(
      /(?:cp|rsync)\s+(?:-a\s+)?supabase(?:\/|\s).*release-candidate/,
    );
  });

  it("attests the exact staging database and live PostgREST contract before Edge deploy", () => {
    const staging = workflow("reusable-supabase-staging.yml");
    const releaseStage = workflow("stage-release.yml");
    const databaseAttestation = staging.indexOf(
      "Create exact staging database attestation",
    );
    const edgeDeploy = staging.indexOf("Deploy edge functions to staging");

    expect(databaseAttestation).toBeGreaterThan(-1);
    expect(edgeDeploy).toBeGreaterThan(databaseAttestation);
    expect(staging).toContain("public_catalogue_postgrest_contract.mjs");
    expect(staging).toContain("supabase-staging-db-attestation.json");
    expect(staging).toContain("supabase_migrations.schema_migrations");
    expect(staging).toContain("COALESCE(name, '')");
    expect(staging).toContain("publish_public_catalogue");
    expect(staging).toContain("get_public_catalogue_publication");
    expect(staging).toContain("query_public_catalogue");
    expect(staging).toContain("get_public_catalogue_homepage");
    expect(staging).toContain("provolatile");
    expect(staging).toContain("prosecdef");
    expect(staging).toContain("authenticated_execute");
    expect(staging).toContain("public_catalogue_snapshot_test.sql");
    expect(staging).toContain("public_catalogue_20k_scale_test.sql");
    expect(staging).toContain("staging-public-catalogue-pgtap.txt");
    expect(staging).toContain("staging-public-catalogue-scale-pgtap.txt");
    expect(staging).toContain("parse-tap-proof.mjs");
    expect(staging).toContain("staging-public-catalogue-pgtap-proof.json");
    expect(staging).not.toContain("grep -Eq '(^|[[:space:]])not ok");
    expect(staging).toContain('pgtap_sha256: createHash("sha256")');
    expect(staging).toContain("has_function_privilege");
    expect(staging).toContain("database,");
    expect(releaseStage).toContain("const database = supabase.database");
    expect(releaseStage).toContain(
      "database.pgtap_ok_count !== database.pgtap_plan",
    );
    expect(releaseStage).toContain(
      "database.scale_pgtap_ok_count !== database.scale_pgtap_plan",
    );
    expect(releaseStage).toContain(
      "database.postgrest?.concurrent_publish_calls !== 16",
    );
    expect(releaseStage).toContain('database.postgrest?.target !== "staging"');
  });

  it("uses a fresh main lease for each destructive staging proof and final attestation", () => {
    const stage = workflow("stage-release.yml");
    const orderedSteps = [
      "Revalidate lease before listing tenant proof",
      "Run staged listing tenant proof",
      "Revalidate lease before project tenant proof",
      "Run staged project tenant proof",
      "Revalidate lease before promotion entitlement proof",
      "Run staged promotion entitlement proof",
      "Revalidate lease before storage cleanup proof",
      "Run staged storage cleanup proof",
      "Revalidate main lease before final attestation",
      "Create final exact-SHA staging attestation",
    ];
    let cursor = -1;
    for (const step of orderedSteps) {
      const next = stage.indexOf(step);
      expect(next, step).toBeGreaterThan(cursor);
      cursor = next;
    }
    expect(stage).not.toContain(
      "STAGING_SUPABASE_SERVICE_ROLE_KEY=$service_role_key",
    );
    expect(stage.match(/STAGING_DEMO_PASSWORD: \$\{\{ secrets\.E2E_DEMO_PASSWORD \}\}/g))
      .toHaveLength(5);
    expect(stage).not.toContain("secrets.STAGING_DEMO_PASSWORD");
    expect(stage).not.toMatch(
      /STAGING_(?:DEVELOPER_A|DEVELOPER_B|DEVELOPER_FREE|SELLER_FREE)_EMAIL:\s+\$\{\{ secrets\./,
    );
    expect(stage).toContain(
      'const expectedProofNames = [\n            "listings",\n            "projects",\n            "promotions",\n            "storage",',
    );
    expect(stage).toContain("expectedProofNames.some(");
    expect(stage).toContain(
      "(name) => business.proofs?.[name]?.ok !== true,",
    );
  });

  it("requires non-skipped exact-SHA live security evidence before attestation", () => {
    const stage = workflow("stage-release.yml");

    expect(stage).toContain("staging-live-security:");
    expect(stage).toContain("Revalidate lease before security fixture preparation");
    expect(stage).toContain(
      "Revalidate lease before destructive live security proof",
    );
    expect(stage).toContain("api-keys?reveal=true");
    expect(stage).toContain("E2E_SECURITY_USE_ISOLATED_STAGING: \"true\"");
    expect(stage).toContain("E2E_ALLOW_DESTRUCTIVE_LIVE_TESTS: \"true\"");
    expect(stage).toContain("--project=chromium");
    expect(stage).toContain("--reporter=json");
    expect(stage).toContain("staging-live-security-proof.json");
    expect(stage).not.toContain(
      "path: staging-live-security-playwright.json",
    );
    expect(stage).toContain("security: securityEvidence.sha256");
    expect(stage).toContain("security.playwright?.skipped !== 0");
    expect(stage).toContain("security.playwright?.unexpected !== 0");
    expect(stage).toContain("security.playwright?.flaky !== 0");
  });

  it("captures production N-1 before staging mutation and proves it against the staged backend", () => {
    const parsed = yaml.load(workflow("stage-release.yml"));
    const capture = parsed.jobs["capture-production-n-minus-one"];
    const supabase = parsed.jobs["supabase-staging"];
    const compatibility = parsed.jobs["staging-n-minus-one-compatibility"];
    const aggregate = parsed.jobs["release-candidate-attested"];
    const captureSource = JSON.stringify(capture);
    const compatibilitySource = JSON.stringify(compatibility);

    expect(capture).toBeDefined();
    expect(capture.needs).toEqual(["validate-source"]);
    expect(capture.environment).toBe("staging");
    expect(captureSource).toContain("CLOUDFLARE_PAGES_READ_TOKEN");
    expect(captureSource).not.toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
    expect(captureSource).toContain("canonical_deployment");
    expect(captureSource).toContain("production-release-candidate-");
    expect(captureSource).toContain("github.run_attempt");
    expect(capture.outputs.artifact_name).toContain(
      "steps.capture.outputs.artifact_name",
    );
    expect(supabase.needs).toEqual([
      "validate-source",
      "capture-production-n-minus-one",
      "cloudflare-staging-preflight",
    ]);

    expect(compatibility).toBeDefined();
    expect(compatibility.needs).toEqual([
      "validate-source",
      "capture-production-n-minus-one",
      "supabase-staging",
    ]);
    expect(compatibility.environment).toBe("staging");
    expect(compatibilitySource).toContain("wrangler pages dev");
    expect(compatibilitySource).toContain("STAGING_SUPABASE_URL");
    expect(compatibilitySource).toContain("STAGING_SUPABASE_PROJECT_ID");
    expect(compatibilitySource).toContain("STAGING_SUPABASE_PUBLISHABLE_KEY");
    expect(compatibilitySource).toContain("check:production-deploy");
    expect(compatibilitySource).toContain("staging-catalogue-gates.spec.ts");
    expect(compatibilitySource).toContain(
      "needs.capture-production-n-minus-one.outputs.artifact_name",
    );
    expect(compatibilitySource).not.toContain("https://portal.maiprop.co");
    expect(compatibility.outputs.artifact_name).toContain(
      "steps.evidence.outputs.artifact_name",
    );
    expect(compatibilitySource).toContain(
      "staging-n-minus-one-compatibility-${RELEASE_SHA}-${GITHUB_RUN_ATTEMPT}",
    );

    expect(aggregate.needs).toContain("staging-n-minus-one-compatibility");
    expect(JSON.stringify(aggregate)).toContain(
      "needs.staging-n-minus-one-compatibility.outputs.artifact_name",
    );
    expect(JSON.stringify(aggregate)).toContain("n_minus_one");
  });

  it("attests exact-SHA route, API budget, and live performance evidence", () => {
    const parsed = yaml.load(workflow("stage-release.yml"));
    const proof = parsed.jobs["staging-catalogue-performance"];
    const aggregate = parsed.jobs["release-candidate-attested"];
    const proofSource = JSON.stringify(proof);
    const aggregateSource = JSON.stringify(aggregate);

    expect(proof).toBeDefined();
    expect(proof.needs).toEqual([
      "validate-source",
      "supabase-staging",
      "cloudflare-staging",
    ]);
    expect(proof.environment).toBe("staging");
    expect(proofSource).toContain("staging-catalogue-gates.spec.ts");
    expect(proofSource).toContain("--reporter=json");
    expect(proofSource).toContain("check:production-deploy");
    expect(proofSource).toContain("--public-api");
    expect(proofSource).toContain("PLAYWRIGHT_BASE_URL");
    expect(proofSource).toContain("MAIPROP_RUN_STAGING_CATALOGUE_GATES");
    expect(proofSource).toContain("MAIPROP_STAGING_RELEASE_SHA");
    expect(proof.outputs.artifact_name).toContain(
      "steps.proof.outputs.artifact_name",
    );
    expect(proofSource).not.toContain("https://portal.maiprop.co");
    expect(proofSource).toContain(
      "staging-catalogue-performance-${RELEASE_SHA}-${GITHUB_RUN_ATTEMPT}",
    );

    expect(aggregate.needs).toContain("staging-catalogue-performance");
    expect(aggregateSource).toContain(
      "needs.staging-catalogue-performance.outputs.artifact_name",
    );
    expect(aggregateSource).toContain("endpoint_budget");
    expect(aggregateSource).toContain("route_e2e");
    expect(aggregateSource).toContain("cwv_query");
    expect(aggregateSource).toContain("catalogueEndpoint.sha256");
    expect(aggregateSource).toContain("catalogueRouteReport.sha256");
    expect(aggregateSource).toContain("catalogueCwvQueryReport.sha256");
    expect(aggregateSource).toContain("catalogueRouteMeasurements.sha256");
  });

  it("binds raw Playwright reports into the signed staging aggregate", () => {
    const stage = workflow("stage-release.yml");
    expect(stage).toContain("staging-live-security-playwright.json");
    expect(stage).toContain("securityPlaywright.sha256");
    expect(stage).toContain("nMinusOnePlaywright.sha256");
    expect(stage).toContain("nMinusOneDeployment.sha256");
  });

  it("keeps npm banners out of JSON release evidence", () => {
    const workflows = [
      workflow("stage-release.yml"),
      workflow("reusable-cloudflare-production-deploy.yml"),
      workflow("reusable-supabase-staging.yml"),
      workflow("deploy-production-release.yml"),
      workflow("direct-cloudflare-production-deploy.yml"),
      workflow("deploy-supabase-production-db.yml"),
      workflow("deploy-edge-functions.yml"),
    ];
    const jsonProducingScripts = [
      "release:validate",
      "release:verify-live-marker",
      "release:verify-runtime-config",
      "check:production-deploy",
      "staging:prove-storage-cleanup",
    ];

    for (const content of workflows) {
      for (const script of jsonProducingScripts) {
        expect(content).not.toContain(`npm run ${script}`);
      }
    }
    expect(workflows.join("\n")).toContain(
      "npm run --silent check:production-deploy",
    );
  });

  it("propagates attempt-qualified staging artifact names across partial reruns", () => {
    const stage = yaml.load(workflow("stage-release.yml"));
    const aggregateSource = JSON.stringify(
      stage.jobs["release-candidate-attested"],
    );
    const producerOutputs = [
      ["validate-source", "provenance_artifact"],
      ["cloudflare-staging", "attestation_artifact"],
      ["staging-business-proofs", "artifact_name"],
      ["staging-stripe-payment", "artifact_name"],
      ["staging-live-security", "artifact_name"],
      ["staging-n-minus-one-compatibility", "artifact_name"],
      ["staging-catalogue-performance", "artifact_name"],
    ];

    for (const [jobName, outputName] of producerOutputs) {
      expect(stage.jobs[jobName].outputs?.[outputName]).toBeTruthy();
      expect(aggregateSource).toContain(
        `needs.${jobName}.outputs.${outputName}`,
      );
    }

    expect(aggregateSource).toContain(
      "needs.supabase-staging.outputs.edge_attestation_artifact",
    );
    for (const outputName of [
      "edge_attestation_artifact_id",
      "edge_attestation_artifact_digest",
      "edge_attestation_run_id",
      "edge_attestation_run_attempt",
      "edge_attestation_release_sha",
    ]) {
      expect(aggregateSource).toContain(
        `needs.supabase-staging.outputs.${outputName}`,
      );
    }

    const supabase = workflow("reusable-supabase-staging.yml");
    expect(supabase).toContain(
      "supabase-staging-edge-attestation-${RELEASE_SHA}-${GITHUB_RUN_ATTEMPT}",
    );
    expect(supabase).toContain("artifact-id");
    expect(supabase).toContain("artifact-digest");
  });

  it("requires one zero-skip Stripe test payment in the staging attestation", () => {
    const stage = yaml.load(workflow("stage-release.yml"));
    const proof = stage.jobs["staging-stripe-payment"];
    const aggregate = stage.jobs["release-candidate-attested"];
    const proofSource = JSON.stringify(proof);
    const aggregateSource = JSON.stringify(aggregate);
    const paymentSpec = readFileSync(
      resolve(root, "e2e", "stripe-payment-complete.spec.ts"),
      "utf8",
    );

    expect(proof).toBeDefined();
    expect(proof.needs).toEqual([
      "validate-source",
      "supabase-staging",
      "cloudflare-staging",
    ]);
    expect(proofSource).toContain("E2E_COMPLETE_STRIPE_PAYMENT");
    expect(proofSource).toContain("stripe-payment-complete.spec.ts");
    expect(proofSource).toContain(
      "completes test-card subscription checkout and observes synced entitlement",
    );
    expect(proofSource).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(paymentSpec).toContain("/functions/v1/delete-account");
    expect(proofSource).toContain("staging-stripe-payment-evidence.mjs");
    expect(aggregate.needs).toContain("staging-stripe-payment");
    expect(aggregateSource).toContain(
      "needs.staging-stripe-payment.outputs.artifact_name",
    );
    expect(aggregateSource).toContain("stripePayment.playwright?.expected !== 1");
    expect(aggregateSource).toContain("stripePayment.playwright?.skipped !== 0");
    expect(aggregateSource).toContain("stripePaymentPlaywright.sha256");
  });

  it("makes Cloudflare production promotion workflow-call-only and immutable", () => {
    const content = workflow("reusable-cloudflare-production-deploy.yml");
    const parsed = yaml.load(content);
    const call = parsed.on.workflow_call;
    const job = parsed.jobs.deploy;
    const requiredInputs = [
      "release_sha",
      "source_tree",
      "source_run_id",
      "source_run_attempt",
      "staging_run_id",
      "staging_run_attempt",
      "approval_run_id",
      "approval_run_attempt",
      "production_run_id",
      "production_run_attempt",
      "backend_run_id",
      "backend_run_attempt",
      "backend_approval_run_id",
      "backend_approval_run_attempt",
      "stripe_readiness_run_id",
      "stripe_readiness_run_attempt",
      "stripe_readiness_sha256",
      "stripe_readiness_artifact_id",
      "stripe_readiness_artifact_digest",
      "artifact_sha256",
      "manifest_sha256",
      "approval_nonce",
      "allowed_approvers",
      "allowed_deployers",
      "deploy_actor",
      "release_evidence_signing_key_id",
      "mutation_lease_artifact",
      "production_project_id",
      "staging_project_id",
      "database_attestation_artifact",
      "database_attestation_sha256",
      "database_binding_artifact",
      "edge_attestation_artifact",
      "edge_attestation_sha256",
      "edge_binding_artifact",
    ];

    expect(Object.keys(parsed.on)).toEqual(["workflow_call"]);
    for (const name of requiredInputs) {
      expect(call.inputs[name], name).toMatchObject({
        required: true,
        type: "string",
      });
    }
    expect(call.secrets).toEqual({
      CLOUDFLARE_ACCOUNT_ID: { required: true },
      CLOUDFLARE_PAGES_READ_TOKEN: { required: true },
      CLOUDFLARE_PAGES_EDIT_TOKEN: { required: true },
      CLOUDFLARE_STAGING_ACCOUNT_ID: { required: true },
      CLOUDFLARE_STAGING_PAGES_READ_TOKEN: { required: true },
      VITE_SUPABASE_PROJECT_ID: { required: true },
      VITE_SUPABASE_URL: { required: true },
      VITE_SUPABASE_PUBLISHABLE_KEY: { required: true },
      CLOUDFLARE_TURN_KEY_ID: { required: true },
      CLOUDFLARE_TURN_API_TOKEN: { required: true },
      CF_ACCESS_CLIENT_ID: { required: false },
      CF_ACCESS_CLIENT_SECRET: { required: false },
      RELEASE_EVIDENCE_SIGNING_KEY: { required: true },
    });
    expect(job.environment).toBeUndefined();
    expect(parsed.concurrency).toBeUndefined();
    expect(parsed.permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(call.outputs.evidence_sha256.value).toBe(
      "${{ jobs.deploy.outputs.evidence_sha256 }}",
    );
    expect(job.outputs.evidence_sha256).toBe(
      "${{ steps.evidence.outputs.evidence_sha256 }}",
    );
    expect(call.outputs.evidence_binding_artifact.value).toBe(
      "${{ jobs.deploy.outputs.evidence_binding_artifact }}",
    );
    expect(job.outputs.evidence_binding_artifact).toBe(
      "${{ steps.cloudflare_evidence_binding.outputs.binding_artifact_name }}",
    );
    expect(content).toContain('PRODUCTION_PROJECT: "maiprop-listing-site"');
    expect(content).toContain(
      'STAGING_PROJECT: "maiprop-listing-site-staging"',
    );
    expect(content).toContain('PRODUCTION_APP_URL: "https://portal.maiprop.co"');
    expect(content).toContain('PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"');
    expect(content).toContain('WRANGLER_VERSION: "4.86.0"');
    expect(job.env.CLOUDFLARE_PAGES_PROJECT_ID).toBe(
      "${{ inputs.production_project_id }}",
    );
    expect(job.env.CLOUDFLARE_STAGING_PAGES_PROJECT_ID).toBe(
      "${{ inputs.staging_project_id }}",
    );
    expect(job.env.BACKEND_RUN_ID).toBe("${{ inputs.backend_run_id }}");
    expect(job.env.BACKEND_RUN_ATTEMPT).toBe(
      "${{ inputs.backend_run_attempt }}",
    );
    expect(job.env.BACKEND_APPROVAL_RUN_ID).toBe(
      "${{ inputs.backend_approval_run_id }}",
    );
    expect(job.env.BACKEND_APPROVAL_RUN_ATTEMPT).toBe(
      "${{ inputs.backend_approval_run_attempt }}",
    );
    expect(STRIPE_RUNTIME_BINDINGS).toHaveLength(11);
    for (const name of STRIPE_RUNTIME_BINDINGS) {
      expect(job.env[name], name).toBe(`\${{ vars.${name} }}`);
    }
    expect(content).toContain("persist-credentials: false");
    expect(content).toContain("npm ci --ignore-scripts");
    expect(content).toContain("production-release-candidate-");
    expect(content).toContain("release-candidate-attestation-");
    expect(content).toContain("production-release-approval-");
    expect(content).toContain("production-supabase-db-attestation.json");
    expect(content).toContain("production-supabase-edge-attestation.json");
    expect(content).toContain("production-upstream-attestations");
    expect(content).toContain("backend_run_id");
    expect(content).toContain("backend_run_attempt");
    expect(content).toContain("backend_approval_run_id");
    expect(content).toContain("backend_approval_run_attempt");
    expect(content).toContain("verify-release-artifact-binding.mjs");
    expect(content).toContain("RELEASE_EVIDENCE_SIGNING_KEY");
    expect(content).toContain("RELEASE_EVIDENCE_SIGNING_KEY_ID");
    expect(content).toContain(".github/workflows/ci.yml");
    expect(content).toContain(".github/workflows/stage-release.yml");
    expect(content).toContain(".github/workflows/approve-production-release.yml");
    expect(content).toContain(".github/workflows/deploy-production-release.yml");
    expect(content).not.toContain("gh attestation");
    expect(content).not.toContain("actions/attest-build-provenance");
    expect(content).not.toContain("secrets: inherit");
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY: null");
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).not.toContain("secrets.SUPABASE_SERVICE_ROLE_KEY");
    const exactTupleStep = job.steps.find(
      (step) => step.name === "Validate exact production promotion tuple",
    );
    expect(exactTupleStep).toBeDefined();
    expect(exactTupleStep.env).not.toHaveProperty("CF_EDIT_TOKEN");
    expect(exactTupleStep.run).not.toContain("CF_EDIT_TOKEN");
    expect(content).toContain(
      "production-release-candidate-${{ inputs.release_sha }}-${{ inputs.source_run_attempt }}",
    );
    expect(content).toContain(
      "release-candidate-attestation-${{ inputs.release_sha }}-${{ inputs.staging_run_attempt }}",
    );
    expect(content).toContain(
      "production-release-approval-${{ inputs.release_sha }}-${{ inputs.approval_run_id }}-${{ inputs.approval_run_attempt }}",
    );
    const githubValidationSteps = job.steps.filter((step) =>
      typeof step.run === "string" &&
      /github-(?:staging-lease|release-approval)/.test(step.run)
    );
    expect(githubValidationSteps.length).toBeGreaterThan(0);
    for (const step of githubValidationSteps) {
      expect(step.env?.GITHUB_TOKEN, step.name).toBe("${{ github.token }}");
    }
  });

  it("revalidates main and the mutation lease in the same shell before every Cloudflare mutation", () => {
    const parsed = yaml.load(
      workflow("reusable-cloudflare-production-deploy.yml"),
    );
    const steps = parsed.jobs.deploy.steps;
    const mutations = [
      ["Deploy exact immutable production artifact", "pages deploy dist"],
      ["Roll back failed production candidate", "/rollback"],
    ];

    for (const [name, mutation] of mutations) {
      const step = steps.find((candidate) => candidate.name === name);
      expect(step, name).toBeDefined();
      const mutationIndex = step.run.indexOf(mutation);
      const mainIndex = step.run.lastIndexOf(
        "github-staging-lease",
        mutationIndex,
      );
      const leaseIndex = step.run.lastIndexOf("mutation-lease", mutationIndex);
      const projectLockIndex = step.run.lastIndexOf(
        "validate-cloudflare-pages-staging-posture.mjs",
        mutationIndex,
      );
      expect(mainIndex, `${name} current-main validation`).toBeGreaterThan(-1);
      expect(projectLockIndex, `${name} immutable project and Git-lock validation`)
        .toBeGreaterThan(-1);
      expect(mainIndex, `${name} final current-main validation`)
        .toBeGreaterThan(projectLockIndex);
      expect(leaseIndex, `${name} final lease validation`)
        .toBeGreaterThan(mainIndex);
      expect(mutationIndex, `${name} mutation`).toBeGreaterThan(leaseIndex);
    }

    const runtimeVerification = steps.find(
      (step) =>
        step.name ===
        "Verify pre-provisioned production Pages runtime bindings",
    );
    const turnProofIndex = runtimeVerification.run.indexOf(
      "verifyCloudflareTurnCredentials",
    );
    const runtimeSnapshotIndex = runtimeVerification.run.indexOf(
      "cloudflare-production-runtime-boundary-before.json",
    );
    expect(runtimeSnapshotIndex).toBeGreaterThan(-1);
    expect(turnProofIndex).toBeGreaterThan(-1);
    expect(runtimeVerification.run).toContain(
      "cloudflare-production-turn-credentials-preflight.json",
    );
    expect(runtimeVerification.run).toContain("--mode production");
    expect(runtimeVerification.run).not.toContain("--request PATCH");
    expect(runtimeVerification.run).not.toContain("CF_API_TOKEN");
    expect(runtimeVerification.run).not.toContain("mutation-lease");
    expect(runtimeVerification.env.CF_READ_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
    );
    for (const step of steps) {
      if (typeof step.run !== "string") continue;
      for (const request of curlRequestsTo(step.run, "STAGING_CF_ACCOUNT_ID")) {
        expect(request, step.name).toContain(
          'Authorization: Bearer $STAGING_CF_READ_TOKEN',
        );
        expect(request, step.name).not.toContain("CF_API_TOKEN");
      }
    }
  });

  it("durably records and always reconciles the production Pages mutation", () => {
    const parsed = yaml.load(
      workflow("reusable-cloudflare-production-deploy.yml"),
    );
    const steps = parsed.jobs.deploy.steps;
    const deploy = steps.find(
      (step) => step.name === "Deploy exact immutable production artifact",
    );
    const reconciliation = steps.find(
      (step) => step.name === "Resolve and validate exact production deployment",
    );

    expect(deploy.run.indexOf("mutation_attempted=true")).toBeLessThan(
      deploy.run.indexOf("wrangler pages deploy"),
    );
    expect(deploy.run).toContain("cloudflare-production-deployments-before.json");
    expect(deploy.run.indexOf("deployments?env=production&per_page=100"))
      .toBeLessThan(deploy.run.indexOf("mutation_attempted=true"));
    expect(reconciliation.env.DEPLOYMENTS_BEFORE).toBe(
      "${{ steps.deploy.outputs.deployments_before }}",
    );
    expect(deploy.run).toContain(
      "cloudflare-production-mutation-attempt.json",
    );
    expect(reconciliation.if).toContain("always()");
    expect(reconciliation.if).toContain(
      "steps.deploy.outputs.mutation_attempted == 'true'",
    );
    expect(reconciliation.run).toContain(
      "cloudflare-pages-candidate-guard.mjs resolve-candidate",
    );
    expect(reconciliation.run).toContain(
      "cloudflare-production-candidate-receipt.json",
    );
    expect(reconciliation.run).toContain(
      '--before-deployments-file "$DEPLOYMENTS_BEFORE"',
    );
    expect(reconciliation.run).toContain(
      "cloudflare-production-deployments-after.json",
    );
  });

  it("performs the production rollback guard immediately before POST", () => {
    const parsed = yaml.load(
      workflow("reusable-cloudflare-production-deploy.yml"),
    );
    const rollback = parsed.jobs.deploy.steps.find(
      (step) => step.name === "Roll back failed production candidate",
    );
    const finalRead = rollback.run.lastIndexOf(
      "cloudflare-production-project-rollback-final.json",
    );
    const authorization = rollback.run.lastIndexOf(
      "cloudflare-pages-candidate-guard.mjs authorize-rollback",
    );
    const post = rollback.run.indexOf("--request POST", authorization);
    const criticalSection = rollback.run.slice(finalRead, post);

    expect(rollback.if).toContain(
      "steps.deploy.outputs.mutation_attempted == 'true'",
    );
    expect(rollback.env.CANDIDATE_RECEIPT).toBe(
      "${{ steps.deployment.outputs.recovery_candidate_receipt }}",
    );
    expect(finalRead).toBeGreaterThan(-1);
    expect(authorization).toBeGreaterThan(finalRead);
    expect(post).toBeGreaterThan(authorization);
    expect(criticalSection).not.toMatch(/npm |gh |sleep /);
    expect(rollback.run).toContain(
      "Cloudflare Pages rollback has no provider-side compare-and-swap precondition",
    );
  });

  it("deploys the exact isolated candidate and proves production or rolls it back while failing", () => {
    const content = workflow("reusable-cloudflare-production-deploy.yml");
    const parsed = yaml.load(content);
    const steps = parsed.jobs.deploy.steps;
    const prepare = steps.find(
      (step) => step.name === "Prepare isolated immutable Pages candidate",
    );
    const deploy = steps.find(
      (step) => step.name === "Deploy exact immutable production artifact",
    );
    const deployment = steps.find(
      (step) => step.name === "Resolve and validate exact production deployment",
    );
    const health = steps.find(
      (step) => step.name === "Validate production promotion health",
    );
    const nMinusOne = steps.find(
      (step) =>
        step.name ===
        "Prove N-1 frontend compatibility with pre-provisioned runtime",
    );
    const runtimeSync = steps.find(
      (step) =>
        step.name ===
        "Verify pre-provisioned production Pages runtime bindings",
    );
    const browser = steps.find(
      (step) => step.name === "Install production health browser",
    );
    const rollback = steps.find(
      (step) => step.name === "Roll back failed production candidate",
    );
    const rollbackEvidence = steps.find(
      (step) => step.name === "Create minimized rollback evidence",
    );
    const enforce = steps.find(
      (step) => step.name === "Enforce production promotion health",
    );

    expect(prepare.run).toContain("$RUNNER_TEMP");
    expect(prepare.run).toContain("cp -a release-candidate/. ");
    expect(prepare.run).toContain("release:artifact:verify");
    expect(prepare.run).toContain("Wrangler config discovery");
    expect(prepare.run).not.toContain("STAGING_CF_ACCOUNT_ID");
    expect(prepare.run).not.toContain("CF_ACCOUNT_ID");
    expect(deploy.run).toContain("npx --no-install wrangler pages deploy dist");
    expect(deploy.run).toContain("--project-name=maiprop-listing-site");
    expect(deploy.run).toContain("--branch=main");
    expect(deploy.run).toContain('--commit-hash="$RELEASE_SHA"');
    expect(deploy.run).toContain("--commit-dirty=false");
    expect(deploy.run.match(/production-release-artifact\.mjs/g)).toHaveLength(2);
    expect(browser.run).toContain("npx playwright install chromium");
    expect(steps.indexOf(browser)).toBeLessThan(
      steps.indexOf(runtimeSync),
    );
    expect(steps.indexOf(prepare)).toBeLessThan(steps.indexOf(runtimeSync));
    expect(runtimeSync["continue-on-error"]).toBe(true);
    expect(nMinusOne).toBeDefined();
    expect(nMinusOne["continue-on-error"]).toBe(true);
    expect(nMinusOne.if).toContain("steps.runtime-verify.outcome == 'success'");
    expect(nMinusOne.run).toContain("release:verify-live-marker");
    expect(nMinusOne.run).toContain("release:verify-runtime-config");
    expect(nMinusOne.run).toContain("check:production-deploy");
    expect(nMinusOne.run).toContain("cloudflare-production-n-minus-one");
    expect(nMinusOne.env.CLOUDFLARE_TURN_KEY_ID).toBe(
      "${{ secrets.CLOUDFLARE_TURN_KEY_ID }}",
    );
    expect(nMinusOne.env.CLOUDFLARE_TURN_API_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_TURN_API_TOKEN }}",
    );
    expect(nMinusOne.env.MAIPROP_TURN_TTL_SECONDS).toBe("600");
    for (const step of [nMinusOne, deploy, deployment, health]) {
      expect(step["continue-on-error"], step.name).toBe(true);
    }
    expect(health["continue-on-error"]).toBe(true);
    expect(health.run).not.toContain("playwright install");
    expect(health.run).toContain("release:verify-live-marker");
    expect(health.run).toContain("release:verify-runtime-config");
    expect(health.run).toContain("check:production-deploy");
    expect(health.run).toContain("--browser");
    expect(health.run).toContain("--public-api");
    expect(health.run).toContain("auctionConsistency");
    expect(health.run).toContain("listingsCursor");
    expect(health.run).toContain("openHousesCursor");
    expect(health.run).toContain("publicationPinning");
    expect(health.run).toContain("turnService");
    expect(health.run).toContain("credentialsRedacted");
    expect(rollback.if).toContain("steps.deploy.outcome == 'failure'");
    expect(rollback.if).toContain(
      "steps.deploy.outputs.mutation_attempted == 'true'",
    );
    expect(rollback.if).not.toContain("steps.runtime-verify.outcome");
    expect(rollback.if).not.toContain("steps.n_minus_one.outcome");
    expect(rollback.if).toContain("steps.health.outcome == 'failure'");
    expect(rollback.run).not.toContain("--request PATCH");
    expect(rollback.run).not.toContain("runtime_restore_verified");
    expect(rollback.env.CANDIDATE_RECEIPT).toBe(
      "${{ steps.deployment.outputs.recovery_candidate_receipt }}",
    );
    expect(rollback.run).toContain(
      "cloudflare-pages-candidate-guard.mjs authorize-rollback",
    );
    expect(rollback.run).toContain(
      "cloudflare-production-rollback-authorization.json",
    );
    expect(rollback.run).toContain("rollback_deployment_id");
    expect(rollback.run).toContain("candidate_deployment_id");
    expect(rollback.run).toContain("--expected-sha");
    expect(rollback.run).toContain("github-release-approval");
    expect(rollback.run).toContain(
      '"$RUNNER_TEMP/verify-cloudflare-release-bindings.sh"',
    );
    expect(rollback.run.indexOf("verify-cloudflare-release-bindings.sh")).toBeLessThan(
      rollback.run.indexOf("release:validate -- release-approval"),
    );
    expect(rollback.run).toContain("randomBytes(32)");
    expect(rollback.run).toContain(
      "cloudflare-production-rollback-mutation-lease.json",
    );
    expect(rollback.run).toContain("PRODUCTION_DEPLOY_EXPECTED_SHA");
    expect(rollback.run).not.toContain("playwright install");
    expect(rollbackEvidence.if).toContain("always()");
    expect(rollbackEvidence.if).toContain(
      "steps.rollback.outcome != 'skipped'",
    );
    expect(rollbackEvidence.run).toContain("ROLLBACK_OUTCOME");
    expect(rollbackEvidence.run).toContain('release_status: "failed"');
    expect(enforce.if).toBe("${{ always() }}");
    expect(enforce.run).toContain("exit 1");
    expect(content).toContain("cloudflare-production-evidence-");
    expect(content).toContain("cloudflare-production-rollback-evidence-");
    expect(content).toContain("deployment_url: process.env.DEPLOYMENT_URL");
    expect(content).toContain(
      "project_id: process.env.CLOUDFLARE_PAGES_PROJECT_ID",
    );
    expect(content).toContain("git_lock_runtime_verification");
    expect(content).toContain("git_lock_deploy");
    expect(content).toContain("turn_credentials_preflight");
    expect(content).toContain("rollback_mutation_lease");
    expect(content).toContain("mutation_attempt: digest(");
    expect(content).toContain("candidate_receipt: digest(");
    expect(content).toContain("rollback_authorization: digest(");
    expect(content).toContain(
      "cloudflare-production-runtime-boundary-before.json",
    );
    expect(content).toContain(
      "cloudflare-production-n-minus-one-compatibility.json",
    );
    expect(content).toContain("preprovisioned-verified-runtime");
    expect(content).toContain(
      'secret_binding_verification: "allowlisted-name-and-type"',
    );
    expect(content).toMatch(
      /authenticated_live_functional_proof:\s*"signed-staging-attestation-plus-direct-turn-service"/,
    );
    expect(content).toContain("runtime_mutation_attempted: false");
    expect(content).toContain("runtime_restore_required: false");
    expect(content).not.toContain("deployment-only-forward-runtime");
    expect(content).not.toContain("--request PATCH");
    expect(content).not.toContain("runtime-restoration");
    expect(content).not.toContain("runtime_restore_attempted");
    expect(content).not.toContain("runtime_restore_verified");
    expect(content).not.toContain("runtime-restore-request");
    expect(content).not.toContain("runtime_patch_attempted");
    expect(content).toContain("evidence/*.json");
    expect(content).toContain(
      "evidence/mutation-lease/production-mutation-lease.json",
    );
    expect(content).not.toContain("path: cloudflare-production-project");
    expect(content).not.toContain("path: cloudflare-runtime-binding-request");
    expect(content).not.toContain(
      "path: cloudflare-production-runtime-restore-request",
    );
    expect(content).not.toContain("npm run build");
    expect(content).not.toContain("vite build");
    expect(content).not.toContain("wrangler-action@");
    expect(content).toContain(
      "Rollback target must differ from the candidate release SHA.",
    );
    expect(deploy.env.ROLLBACK_ID).toBe("${{ steps.preflight.outputs.rollback_id }}");
    expect(deploy.env.ROLLBACK_SHA).toBe("${{ steps.preflight.outputs.rollback_sha }}");
    expect(deploy.run).toContain("canonical_deployment.id == $rollback_id");
    expect(deploy.run).toContain(
      "Production canonical changed after rollback capture; candidate deploy refused.",
    );
  });

  it("binds every Cloudflare deployment record to the immutable project ID", () => {
    const content = workflow("reusable-cloudflare-production-deploy.yml");
    const commands = content.match(
      /release:validate -- cloudflare-deployment[\s\S]*?(?=\n\s{10}\S|$)/g,
    ) ?? [];

    expect(commands.length).toBeGreaterThanOrEqual(4);
    for (const command of commands) {
      expect(command).toContain('--project-id "$CLOUDFLARE_PAGES_PROJECT_ID"');
    }

    const staging = workflow("stage-release.yml");
    const stagingCommands = staging.match(
      /release:validate -- cloudflare-deployment[\s\S]*?(?=\n\s{10}\S|$)/g,
    ) ?? [];
    expect(stagingCommands).toHaveLength(4);
    const isolatedStagingCommands = stagingCommands.filter((command) =>
      command.includes("CLOUDFLARE_STAGING_PAGES_PROJECT_ID"),
    );
    expect(isolatedStagingCommands).toHaveLength(3);
    for (const command of isolatedStagingCommands) {
      expect(command).toContain(
        '--project-id "$CLOUDFLARE_STAGING_PAGES_PROJECT_ID"',
      );
    }
    expect(
      stagingCommands.filter((command) =>
        command.includes('--project-id "$CLOUDFLARE_PAGES_PROJECT_ID"'),
      ),
    ).toHaveLength(1);
  });

  it("makes production database promotion workflow-call-only and tuple-bound", () => {
    const content = workflow("deploy-supabase-production-db.yml");
    const parsed = yaml.load(content);
    const call = parsed.on.workflow_call;
    const job = parsed.jobs.deploy;
    const requiredInputs = [
      "release_sha",
      "source_tree",
      "source_run_id",
      "source_run_attempt",
      "staging_run_id",
      "staging_run_attempt",
      "approval_run_id",
      "approval_run_attempt",
      "production_run_id",
      "production_run_attempt",
      "stripe_readiness_run_id",
      "stripe_readiness_run_attempt",
      "stripe_readiness_sha256",
      "stripe_readiness_artifact_id",
      "stripe_readiness_artifact_digest",
      "artifact_sha256",
      "manifest_sha256",
      "approval_nonce",
      "mutation_lease_artifact",
    ];

    expect(Object.keys(parsed.on)).toEqual(["workflow_call"]);
    for (const name of requiredInputs) {
      expect(call.inputs[name], name).toMatchObject({
        required: true,
        type: "string",
      });
    }
    expect(call.secrets).toEqual({
      RELEASE_EVIDENCE_SIGNING_KEY: { required: true },
      SUPABASE_ACCESS_TOKEN: { required: true },
      VITE_SUPABASE_PROJECT_ID: { required: true },
      VITE_SUPABASE_URL: { required: true },
    });
    expect(call.outputs.database_binding_artifact.value).toBe(
      "${{ jobs.deploy.outputs.database_binding_artifact }}",
    );
    expect(job.outputs.database_binding_artifact).toBe(
      "${{ steps.database_binding.outputs.binding_artifact_name }}",
    );
    expect(job.environment).toBe("production");
    expect(parsed.concurrency).toBeUndefined();
    expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
    expect(content).toContain('PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"');
    expect(content).toContain("persist-credentials: false");
    expect(content).toContain("npm ci --ignore-scripts");
    expect(content).toContain("Verify signed provider artifact bindings");
    expect(content).toContain("verify-release-artifact-binding.mjs");
    expect(content).toContain("release-candidate-attestation-");
    expect(content).toContain("supabase-staging-edge-attestation-");
    expect(content).toContain("artifact_bindings.supabase");
    expect(content).toContain("artifact-ids:");
    expect(content).toContain("actions/artifacts/$artifact_id");
    expect(content).toContain("artifact_digest");
    expect(content).toContain(
      "canonicalJson(edge.database) !== canonicalJson(database)",
    );
    expect(content).toContain(
      "edge.supabase_sha256 !== releaseManifest.supabase_sha256",
    );
    expect(content).toContain(
      "database.supabase_sha256 !== releaseManifest.supabase_sha256",
    );
    expect(content).toContain("mutation-lease");
    expect(content).toContain("github-staging-lease");
    expect(content).toContain("supabase-target");
    expect(content).toContain("reconcileMigrationHistories");
    expect(content).toContain("assertMigrationDryRunParity");
    expect(content).toContain("file_sha256");
    expect(content).toContain("migration_inventory_sha256");
    expect(content).toContain("production-migrations-pre-apply.json");
    expect(content).toContain(
      "supabase/reconciliation/role-switch-index-preflight.sql",
    );
    expect(content).toContain("scripts/check-role-switch-index-preflight.mjs");
    for (const path of [
      "production-role-switch-index-state-before.json",
      "production-role-switch-index-preflight-before.json",
      "production-role-switch-index-state-mutation-boundary.json",
      "production-role-switch-index-preflight-mutation-boundary.json",
      "production-role-switch-online-finalization.json",
      "production-role-switch-index-state-after.json",
      "production-role-switch-index-preflight-after.json",
      "production-role-switch-fk-state-after.json",
      "production-role-switch-fk-post-apply.json",
    ]) {
      expect(content, path).toContain(path);
    }
    expect(content).toContain("role-switch-fk-state.sql");
    expect(content).toContain("check-role-switch-fk-post-apply.mjs");
    expect(content).toContain("--require-finalized");
    expect(content).toContain(
      "Production migration history changed after the reviewed dry run.",
    );
    expect(content).toContain(
      "npx --no-install supabase --workdir release-candidate db push",
    );
    expect(content).toContain("--dry-run");
    expect(content).toContain("--yes");
    expect(content).not.toContain("--include-all");
    const applyStep = job.steps.find(
      (step) => step.name === "Apply exact staged production migrations",
    );
    const indexPreflightStep = job.steps.find(
      (step) => step.name === "Check production role-switch index safety",
    );
    const dryRunStep = job.steps.find(
      (step) => step.name === "Dry-run exact staged production migrations",
    );
    expect(indexPreflightStep).toBeDefined();
    expect(job.steps.indexOf(indexPreflightStep)).toBeLessThan(
      job.steps.indexOf(dryRunStep),
    );
    expect(applyStep.run).toContain("npm run release:artifact:verify --");
    expect(applyStep.run).toContain("release-candidate/release-manifest.json");
    expect(applyStep.run).toContain("github-staging-lease");
    expect(applyStep.run).toContain("mutation-lease");
    expect(applyStep.run).toContain("supabase-target");
    expect(applyStep.run).toContain(
      "production-role-switch-index-preflight-mutation-boundary.json",
    );
    expect(
      applyStep.run.indexOf(
        "Production migration history changed at the database mutation boundary.",
      ),
    ).toBeLessThan(
      applyStep.run.indexOf(
        "production-role-switch-index-preflight-mutation-boundary.json",
      ),
    );
    expect(
      applyStep.run.indexOf(
        "production-role-switch-index-preflight-mutation-boundary.json",
      ),
    ).toBeLessThan(applyStep.run.indexOf("db push"));
    expect(applyStep.run.indexOf("release:artifact:verify")).toBeLessThan(
      applyStep.run.indexOf("db push"),
    );
    expect(applyStep.run).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_profiles_role_switch_audit_id");
    expect(applyStep.run).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_role_switch_history_reconciliation_due");
    expect(applyStep.run).toContain("CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_agent_data_inputs_user_discount_invoice");
    expect(applyStep.run).toContain("VALIDATE CONSTRAINT profiles_role_switch_audit_id_fkey");
    expect(applyStep.run).toContain("production-role-switch-online-finalization.json");
    expect(applyStep.run).not.toContain('pending_count" = "0" ]; then\n            echo "Production migration history already matches staging."\n            exit 0');
    const terminalEvidence = job.steps.find(
      (step) => step.name === "Create production database terminal evidence",
    );
    const terminalUpload = job.steps.find(
      (step) => step.name === "Upload production database terminal evidence",
    );
    expect(terminalEvidence.if).toBe("${{ always() }}");
    expect(terminalEvidence.env.SUPABASE_PRODUCTION_DB_URL).toBe(
      "${{ secrets.SUPABASE_PRODUCTION_DB_URL }}",
    );
    expect(terminalEvidence.run).toContain(
      'psql "$SUPABASE_PRODUCTION_DB_URL"',
    );
    expect(terminalEvidence.run).toContain(
      "production-migrations-terminal.json",
    );
    expect(terminalEvidence.run).toContain(
      "production_history_capture_status",
    );
    expect(
      terminalEvidence.run.indexOf('psql "$SUPABASE_PRODUCTION_DB_URL"'),
    ).toBeLessThan(
      terminalEvidence.run.indexOf("node --input-type=module"),
    );
    expect(terminalEvidence.run).toContain("production-migrations-before.json");
    expect(terminalEvidence.run).toContain("production-migrations-pre-apply.json");
    expect(terminalEvidence.run).toContain("production-migrations-after.json");
    expect(terminalEvidence.run).toContain("production-migration-dry-run.txt");
    expect(terminalEvidence.run).toContain(
      "production-role-switch-index-preflight-mutation-boundary.json",
    );
    expect(terminalEvidence.run).toContain(
      "production-role-switch-index-preflight-after.json",
    );
    expect(terminalEvidence.run).toContain(
      "production-role-switch-online-finalization.json",
    );
    expect(terminalEvidence.run).toContain(
      "production-role-switch-fk-post-apply.json",
    );
    expect(terminalEvidence.run).toContain("job_status");
    expect(terminalEvidence.run).toContain("readJsonIfValid");
    expect(terminalEvidence.run).toContain("manifest_parse_error");
    expect(terminalUpload.if).toBe("${{ always() }}");
    expect(content).toContain("supabase_migrations.schema_migrations");
    expect(content).toContain(
      "npm run check:supabase-advisor -- --fail-on-error --fail-on-unknown",
    );
    expect(content).toContain("npm run check:supabase-types -- -- --strict");
    expect(content).toContain("npm run capture:supabase-index-stats");
    expect(content).toContain("npm run check:live-security-posture");
    expect(content).toContain("db lint");
    expect(content).toContain("production-supabase-db-attestation");
    expect(content).toContain("Create signed production database evidence binding");
    expect(content).toContain("Upload signed production database evidence binding");
    expect(content).not.toContain("gh attestation");
    expect(content).not.toContain("actions/attest-build-provenance");
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).not.toContain("secrets: inherit");
  });

  it("makes production Edge promotion workflow-call-only and artifact-bound", () => {
    const content = workflow("deploy-edge-functions.yml");
    const parsed = yaml.load(content);
    const call = parsed.on.workflow_call;
    const job = parsed.jobs.deploy;
    const requiredInputs = [
      "release_sha",
      "source_tree",
      "source_run_id",
      "source_run_attempt",
      "staging_run_id",
      "staging_run_attempt",
      "approval_run_id",
      "approval_run_attempt",
      "production_run_id",
      "production_run_attempt",
      "stripe_readiness_run_id",
      "stripe_readiness_run_attempt",
      "stripe_readiness_sha256",
      "stripe_readiness_artifact_id",
      "stripe_readiness_artifact_digest",
      "artifact_sha256",
      "manifest_sha256",
      "approval_nonce",
      "mutation_lease_artifact",
      "database_attestation_artifact",
      "database_attestation_sha256",
      "database_binding_artifact",
    ];

    expect(Object.keys(parsed.on)).toEqual(["workflow_call"]);
    for (const name of requiredInputs) {
      expect(call.inputs[name], name).toMatchObject({
        required: true,
        type: "string",
      });
    }
    expect(call.outputs.edge_attestation_artifact.value).toBe(
      "${{ jobs.deploy.outputs.edge_attestation_artifact }}",
    );
    expect(call.outputs.edge_attestation_sha256.value).toBe(
      "${{ jobs.deploy.outputs.edge_attestation_sha256 }}",
    );
    expect(job.outputs.edge_attestation_artifact).toBe(
      "${{ steps.edge_attestation.outputs.artifact_name }}",
    );
    expect(job.outputs.edge_attestation_sha256).toBe(
      "${{ steps.edge_attestation.outputs.attestation_sha256 }}",
    );
    expect(call.outputs.edge_binding_artifact.value).toBe(
      "${{ jobs.deploy.outputs.edge_binding_artifact }}",
    );
    expect(job.outputs.edge_binding_artifact).toBe(
      "${{ steps.edge_binding.outputs.binding_artifact_name }}",
    );
    expect(call.secrets).toEqual({
      RELEASE_EVIDENCE_SIGNING_KEY: { required: true },
      SUPABASE_ACCESS_TOKEN: { required: true },
      VITE_SUPABASE_PROJECT_ID: { required: true },
      VITE_SUPABASE_URL: { required: true },
    });
    expect(job.environment).toBe("production");
    expect(parsed.concurrency).toBeUndefined();
    expect(parsed.permissions).toEqual({ actions: "read", contents: "read" });
    expect(content).toContain('PRODUCTION_PROJECT_REF: "qvvicunqcrwpioqnvzxf"');
    expect(content).toContain("persist-credentials: false");
    expect(content).toContain("npm ci --ignore-scripts");
    expect(content).toContain("Verify signed provider artifact bindings");
    expect(content).toContain("verify-release-artifact-binding.mjs");
    expect(content).toContain("release-candidate-attestation-");
    expect(content).toContain("supabase-staging-edge-attestation-");
    expect(content).toContain("artifact_bindings.supabase");
    expect(content).toContain("artifact-ids:");
    expect(content).toContain("actions/artifacts/$artifact_id");
    expect(content).toContain("artifact_digest");
    expect(content).toContain("production-supabase-db-attestation");
    expect(content).toContain(
      "staging.supabase_sha256 !== releaseManifest.supabase_sha256",
    );
    expect(content).toContain(
      "evidence.supabase_sha256 !== releaseManifest.supabase_sha256",
    );
    expect(content).toContain(
      ".github/workflows/deploy-production-release.yml",
    );
    expect(content).toContain("assertEdgeSourceManifestParity");
    expect(content).toContain("assertEdgeBundleParity");
    expect(content).toContain("buildEdgeForwardConvergencePlan");
    expect(content).toContain(
      "--supabase-workdir release-candidate",
    );
    expect(content).toContain(
      "npx --no-install supabase --workdir release-candidate functions deploy",
    );
    expect(content).toContain("--use-api");
    expect(content).toContain("--jobs 1");
    expect(content).toContain(
      "Capture strict production live function inventory before deploy",
    );
    expect(content).toContain("release-safety-production-live-functions-before.json");
    expect(content).toContain("production-edge-forward-plan.json");
    expect(content).toContain("production-edge-deploy-progress.jsonl");
    expect(content).toContain('functions deploy "$function_name"');
    const deployStep = job.steps.find(
      (step) => step.name === "Forward-converge exact artifact Edge functions serially",
    );
    expect(deployStep.run).toContain("npm run release:artifact:verify --");
    expect(deployStep.run).toContain("inventory:release");
    expect(deployStep.run).toContain("assertEdgeSourceManifestParity");
    expect(deployStep.run).toContain("github-staging-lease");
    expect(deployStep.run).toContain("mutation-lease");
    expect(deployStep.run).toContain("supabase-target");
    expect(deployStep.run.indexOf("release:artifact:verify")).toBeLessThan(
      deployStep.run.indexOf('functions deploy "$function_name"'),
    );
    const edgeTerminalEvidence = job.steps.find(
      (step) => step.name === "Create production Edge terminal evidence",
    );
    const edgeTerminalUpload = job.steps.find(
      (step) => step.name === "Upload production Edge terminal evidence",
    );
    expect(edgeTerminalEvidence.if).toBe("${{ always() }}");
    expect(edgeTerminalEvidence.run).toContain(
      "release-safety-production-live-functions-before.json",
    );
    expect(edgeTerminalEvidence.run).toContain(
      "release-safety-production-live-functions.json",
    );
    expect(edgeTerminalEvidence.run).toContain("production-edge-forward-plan.json");
    expect(edgeTerminalEvidence.run).toContain("production-edge-deploy-progress.jsonl");
    expect(edgeTerminalEvidence.run).toContain("job_status");
    expect(edgeTerminalEvidence.run).toContain("readJsonIfValid");
    expect(edgeTerminalEvidence.run).toContain("manifest_parse_error");
    expect(edgeTerminalUpload.if).toBe("${{ always() }}");
    expect(content).toContain("--require-live-source-evidence");
    expect(content).toContain("ezbr_sha256");
    expect(content).toContain("production-supabase-edge-attestation");
    expect(content).toContain(
      "production-supabase-edge-attestation-${RELEASE_SHA}-${PRODUCTION_RUN_ID}-${PRODUCTION_RUN_ATTEMPT}",
    );
    expect(content).toContain("Create signed production Edge evidence binding");
    expect(content).toContain("Upload signed production Edge evidence binding");
    expect(content).not.toContain("gh attestation");
    expect(content).not.toContain("actions/attest-build-provenance");
    expect(content).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(content).not.toContain("secrets: inherit");
  });

  it("orchestrates database, Edge, and Cloudflare promotion in order with fresh leases", () => {
    const release = workflow("deploy-production-release.yml");
    const parsed = yaml.load(release);
    const validate = parsed.jobs.validate;
    const cloudflarePreflight =
      parsed.jobs["cloudflare-production-preflight"];
    const sourceArchive = parsed.jobs["archive-production-source"];
    const database = parsed.jobs["deploy-production-database"];
    const renew = parsed.jobs["renew-edge-mutation-lease"];
    const edge = parsed.jobs["deploy-production-edge"];
    const renewCloudflare = parsed.jobs["renew-cloudflare-mutation-lease"];
    const cloudflare = parsed.jobs["deploy-production-cloudflare"];
    const aggregate = parsed.jobs["attest-production-release"];

    expect(release).toContain("name: Deploy Production Release");
    expect(release).toContain("release_sha:");
    expect(release).toContain("required: true");
    expect(release).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(release).toContain("github-release-evidence");
    expect(release).toContain("release-proof-selection.json");
    expect(release).toContain("release-candidate-attestation-${RELEASE_SHA}");
    expect(release).toContain("gh run download");
    expect(release).toContain("verify-release-artifact-binding.mjs");
    expect(release).toContain("RELEASE_EVIDENCE_SIGNING_KEY");
    expect(release).toContain("RELEASE_EVIDENCE_SIGNING_KEY_ID");
    expect(release).toContain("release-candidate-attestation-${RELEASE_SHA}-${STAGING_RUN_ATTEMPT}-binding");
    expect(release).not.toContain("gh attestation");
    expect(release).not.toContain("actions/attest-build-provenance");
    expect(release).toContain("release-candidate-attestation");
    expect(release).toContain('SOURCE_TREE="$(git rev-parse "${RELEASE_SHA}^{tree}")"');
    expect(release).toContain('--source-tree "$SOURCE_TREE"');
    expect(release).toContain('--source-run-id "$SOURCE_RUN_ID"');
    expect(release).toContain('--source-run-attempt "$SOURCE_RUN_ATTEMPT"');
    expect(release).toContain("github-release-approval");
    expect(release).toContain("release-approval");
    expect(release).toContain("production-mutation-lease.json");
    expect(validate.environment).toBeUndefined();
    expect(validate.permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(validate.outputs).toMatchObject({
      source_tree: expect.any(String),
      artifact_sha256: expect.any(String),
      manifest_sha256: expect.any(String),
      approval_nonce: expect.any(String),
      mutation_lease_artifact: expect.any(String),
    });
    expect(database.uses).toBe(
      "./.github/workflows/deploy-supabase-production-db.yml",
    );
    expect(cloudflarePreflight.needs).toBe("validate");
    expect(cloudflarePreflight.environment).toBeUndefined();
    expect(sourceArchive.environment).toBeUndefined();
    expect(sourceArchive.needs).toEqual([
      "validate",
      "cloudflare-production-preflight",
    ]);
    expect(sourceArchive.permissions).toEqual({
      actions: "read",
      contents: "write",
    });
    expect(database.needs).toEqual([
      "validate",
      "cloudflare-production-preflight",
      "archive-production-source",
    ]);
    expect(database.with.production_run_id).toBe("${{ github.run_id }}");
    expect(database.with.production_run_attempt).toBe(
      "${{ github.run_attempt }}",
    );
    expect(renew.needs).toEqual(["validate", "deploy-production-database"]);
    expect(renew.environment).toBeUndefined();
    expect(renew.permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(edge.uses).toBe("./.github/workflows/deploy-edge-functions.yml");
    expect(edge.needs).toEqual([
      "validate",
      "deploy-production-database",
      "renew-edge-mutation-lease",
    ]);
    expect(edge.with.mutation_lease_artifact).toBe(
      "${{ needs.renew-edge-mutation-lease.outputs.mutation_lease_artifact }}",
    );
    expect(edge.with.database_attestation_artifact).toBe(
      "${{ needs.deploy-production-database.outputs.database_attestation_artifact }}",
    );
    expect(edge.with.database_attestation_sha256).toBe(
      "${{ needs.deploy-production-database.outputs.database_attestation_sha256 }}",
    );
    expect(edge.with.database_binding_artifact).toBe(
      "${{ needs.deploy-production-database.outputs.database_binding_artifact }}",
    );
    expect(renewCloudflare.needs).toEqual([
      "validate",
      "deploy-production-database",
      "deploy-production-edge",
    ]);
    expect(renewCloudflare.environment).toBeUndefined();
    expect(cloudflare.uses).toBe(
      "./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(cloudflare.needs).toEqual([
      "validate",
      "deploy-production-database",
      "deploy-production-edge",
      "renew-cloudflare-mutation-lease",
    ]);
    expect(cloudflare.with.backend_run_id).toBe("${{ github.run_id }}");
    expect(cloudflare.with.backend_run_attempt).toBe(
      "${{ github.run_attempt }}",
    );
    expect(cloudflare.with.backend_approval_run_id).toBe(
      "${{ needs.validate.outputs.approval_run_id }}",
    );
    expect(cloudflare.with.backend_approval_run_attempt).toBe(
      "${{ needs.validate.outputs.approval_run_attempt }}",
    );
    expect(cloudflare.with.edge_attestation_artifact).toBe(
      "${{ needs.deploy-production-edge.outputs.edge_attestation_artifact }}",
    );
    expect(cloudflare.with.edge_attestation_sha256).toBe(
      "${{ needs.deploy-production-edge.outputs.edge_attestation_sha256 }}",
    );
    expect(cloudflare.with.database_binding_artifact).toBe(
      "${{ needs.deploy-production-database.outputs.database_binding_artifact }}",
    );
    expect(cloudflare.with.edge_binding_artifact).toBe(
      "${{ needs.deploy-production-edge.outputs.edge_binding_artifact }}",
    );
    expect(aggregate.needs).toEqual([
      "validate",
      "deploy-production-database",
      "deploy-production-edge",
      "renew-cloudflare-mutation-lease",
      "deploy-production-cloudflare",
    ]);
    expect(aggregate.permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(release).toContain(
      "production-release-attestation.json",
    );
    expect(release).toContain("Create signed coordinated production release binding");
    expect(release).toContain("Upload coordinated production release binding");
    expect(release).not.toContain("secrets: inherit");
    expect(release).not.toContain(
      "Production mutations remain disabled until independent approval",
    );
  });

  it("cryptographically attests the final exact-SHA staging aggregate", () => {
    const stage = workflow("stage-release.yml");
    const parsed = yaml.load(stage);
    const job = parsed.jobs["release-candidate-attested"];
    const finalAttestation = job.steps.find(
      (step) => step.name === "Create final exact-SHA staging attestation",
    );

    expect(job.permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(finalAttestation).toBeDefined();
    expect(finalAttestation.run).toContain("schema_version: 5");
    expect(stage).toContain("Create and verify final release candidate binding");
    expect(stage).toContain("Upload final release candidate binding");
    expect(stage).toContain("verify-release-artifact-binding.mjs");
    expect(stage).not.toContain("gh attestation");
    expect(stage).not.toContain("actions/attest-build-provenance");
    expect(stage).toContain("security: securityEvidence.sha256");
    expect(stage).toContain("n_minus_one: nMinusOneEvidence.sha256");
    expect(stage).toContain(
      "catalogue_performance: cataloguePerformanceEvidence.sha256",
    );
    expect(stage).toContain('if [ "$GITHUB_SHA" != "$RELEASE_SHA" ]; then');
  });

  it("serializes every production entrypoint behind one concurrency group", () => {
    for (const name of [
      "deploy-production-release.yml",
      "direct-cloudflare-production-deploy.yml",
    ]) {
      expect(workflow(name)).toContain("group: maiprop-production-release");
      expect(workflow(name)).toContain("cancel-in-progress: false");
    }

    for (const name of [
      "deploy-supabase-production-db.yml",
      "deploy-edge-functions.yml",
    ]) {
      expect(yaml.load(workflow(name)).concurrency).toBeUndefined();
    }
  });

   it("proves every staging runtime alias targets the isolated Supabase project", () => {
     const stage = workflow("stage-release.yml");

     expect(stage).toContain("STAGING_APP_URL:");
     expect(cloudflarePostureValidator).toContain(
       "VITE_SUPABASE_URL: stagingSupabaseUrl",
     );
     expect(cloudflarePostureValidator).toContain(
       "VITE_SUPABASE_PROJECT_ID: stagingSupabaseProjectId",
     );
     expect(cloudflarePostureValidator).toContain(
       "VITE_SUPABASE_PUBLISHABLE_KEY: stagingSupabasePublishableKey",
     );
     expect(cloudflarePostureValidator).toContain(
       "VITE_APP_URL: stagingAppUrl",
     );
     expect(cloudflarePostureValidator).toContain(
       "VITE_PUBLIC_API_ORIGIN: stagingAppUrl",
     );
    expect(stage).toContain("Verify immutable and canonical staging runtimes");
    expect(stage).toContain("runtime-config.js");
   });

   it("API-attests disabled Git auto-deploy for both Pages projects", () => {
     const stage = workflow("stage-release.yml");

     expect(stage.match(/--mode staging/g)).toHaveLength(4);
     expect(stage).toContain("cloudflare-staging-project.json");
     expect(stage).toContain("cloudflare-production-project.json");
     expect(stage).toContain("cloudflare-pages-final-posture.json");
     expect(cloudflarePostureValidator).toContain(
       "productionDeploymentsEnabled",
     );
     expect(cloudflarePostureValidator).toContain(
       "previewDeploymentSetting",
     );
     expect(stage).toContain("git_auto_deploy_posture_sha256");
     expect(stage).toContain("git_auto_deploy_posture");
     expect(stage).toContain("cloudflare.schema_version !== 4");
     expect(stage).toContain(
       "cloudflare.git_auto_deploy_posture?.status !== \"passed\"",
     );
     expect(stage).toContain(
       "Re-attest both Pages projects immediately before final attestation",
     );
     const runtimeIndex = stage.indexOf(
       "Verify immutable and canonical staging runtimes",
     );
     const finalPostureIndex = stage.indexOf(
       "Re-attest both Pages projects immediately before final attestation",
     );
     const attestationIndex = stage.indexOf(
       "Create Cloudflare staging attestation",
     );
     expect(finalPostureIndex).toBeGreaterThan(runtimeIndex);
     expect(attestationIndex).toBeGreaterThan(finalPostureIndex);
     const finalPostureBlock = stage.slice(
       finalPostureIndex,
       attestationIndex,
     );
     expect(finalPostureBlock).toContain(
       "--staging-project-file cloudflare-staging-project-final.json",
     );
     expect(finalPostureBlock).toContain(
       "--production-project-file cloudflare-production-project-final.json",
     );
     expect(finalPostureBlock.match(/release:verify-runtime-config/g)).toHaveLength(
       2,
     );
   });

   it("enforces Stripe test mode in API posture and live runtime proof", () => {
     const stage = workflow("stage-release.yml");

     expect(cloudflarePostureValidator).toContain(
       "VITE_STRIPE_PUBLISHABLE_KEY",
     );
     expect(cloudflarePostureValidator).toContain(
       "VITE_STRIPE_RUNTIME_MODE",
     );
     expect(cloudflarePostureValidator).toContain("VITE_BILLING_MODE");
     expect(stage).toContain("--staging-project-file");
     expect(stage).toContain("--production-project-file");
     expect(stage).toContain("stripe_runtime");
     expect(stage).toContain('status !== "test-or-disabled"');
     expect(stage).toContain("production_price_reuse !== false");
   });

   it("proves authorized short-lived TURN issuance on immutable and canonical staging URLs", () => {
     const stage = workflow("stage-release.yml");

     expect(stage).toContain("STAGING_TURN_PROOF_EMAIL:");
     expect(stage).toContain("STAGING_DEMO_PASSWORD:");
     expect(stage).toContain("/auth/v1/token?grant_type=password");
     expect(stage).toContain("/rest/v1/professionals?select=id");
     expect(stage).toContain("PRODUCTION_DEPLOY_TURN_ACCESS_TOKEN");
     expect(stage).toContain("PRODUCTION_DEPLOY_TURN_ROOM_ID");
     expect(stage).toContain("target?.publicApi?.schemaVersion !== 3");
     expect(stage).toMatch(
       /turnCredentialIssuance\?\.httpStatus !==\s+200/,
     );
     expect(stage).toMatch(
       /turnCredentialIssuance\?\.credentialsRedacted !==\s+true/,
     );
    });

   it("isolates staging Pages reads and writes in a dedicated Cloudflare account", () => {
      const stage = workflow("stage-release.yml");
      const parsed = yaml.load(stage);
      const job = parsed.jobs["cloudflare-staging"];
     const deploy = job.steps.find(
       (step) => step.name === "Deploy exact artifact to dedicated staging project",
     );
     const preflight = job.steps.find(
       (step) => step.name === "Verify pre-provisioned dedicated Pages project",
     );

     expect(deploy.with.apiToken).toBe(
       "${{ secrets.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN }}",
     );
      expect(deploy.with.accountId).toBe(
        "${{ secrets.CLOUDFLARE_STAGING_ACCOUNT_ID }}",
      );
      expect(preflight.env.STAGING_CF_READ_TOKEN).toBe(
        "${{ secrets.CLOUDFLARE_STAGING_PAGES_READ_TOKEN }}",
      );
     expect(preflight.env.STAGING_CF_ACCOUNT_ID).toBe(
       "${{ secrets.CLOUDFLARE_STAGING_ACCOUNT_ID }}",
     );
     expect(preflight.env.PRODUCTION_CF_READ_TOKEN).toBe(
       "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN }}",
     );
     expect(preflight.env.PRODUCTION_CF_ACCOUNT_ID).toBe(
       "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
     );
     expect(preflight.run).toContain(
       'if [ "$STAGING_CF_ACCOUNT_ID" = "$PRODUCTION_CF_ACCOUNT_ID" ]',
     );
     expect(preflight.run).toContain(
       "Staging and production Cloudflare account IDs must be distinct.",
     );
      expect(stage).not.toContain(
        "apiToken: ${{ secrets.CLOUDFLARE_API_TOKEN }}",
      );
       for (const step of job.steps.filter(
        (candidate) =>
          typeof candidate.run === "string" &&
          candidate.run.includes("api.cloudflare.com") &&
          candidate.run.includes("$STAGING_CF_ACCOUNT_ID"),
      )) {
        const performsRollback = step.run.includes("--request POST");
        expect(step.env.STAGING_CF_READ_TOKEN, step.name).toBe(
          "${{ secrets.CLOUDFLARE_STAGING_PAGES_READ_TOKEN }}",
        );
        if (performsRollback) {
          expect(step.env.STAGING_CF_EDIT_TOKEN, step.name).toBe(
            "${{ secrets.CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN }}",
          );
        } else {
          expect(JSON.stringify(step.env), step.name).not.toContain(
            "CLOUDFLARE_STAGING_PAGES_EDIT_TOKEN",
          );
         }
       }
       for (const step of job.steps) {
         if (typeof step.run !== "string") continue;
         for (const request of curlRequestsTo(
           step.run,
           "STAGING_CF_ACCOUNT_ID",
         )) {
           if (request.includes("--request POST")) {
             expect(request, step.name).toContain(
               'Authorization: Bearer $STAGING_CF_EDIT_TOKEN',
             );
           } else {
             expect(request, step.name).toContain(
               'Authorization: Bearer $STAGING_CF_READ_TOKEN',
             );
             expect(request, step.name).not.toContain("STAGING_CF_EDIT_TOKEN");
             expect(request, step.name).not.toContain("PRODUCTION_CF_READ_TOKEN");
           }
         }
       }
     });

    it("durably reconciles staging mutation outcomes and guards the final rollback read", () => {
      const parsed = yaml.load(workflow("stage-release.yml"));
      const steps = parsed.jobs["cloudflare-staging"].steps;
      const intent = steps.find(
        (step) => step.name === "Record staging Pages mutation attempt",
      );
      const deploy = steps.find(
        (step) => step.name === "Deploy exact artifact to dedicated staging project",
      );
      const reconciliation = steps.find(
        (step) => step.name === "Fetch and validate exact Pages deployment",
      );
      const rollback = steps.find(
        (step) => step.name === "Roll back failed staging candidate",
      );
      const finalRead = rollback.run.lastIndexOf(
        "cloudflare-staging-rollback-current-project-final.json",
      );
      const authorization = rollback.run.lastIndexOf(
        "cloudflare-pages-candidate-guard.mjs authorize-rollback",
      );
      const post = rollback.run.indexOf("--request POST", authorization);

      expect(intent.run).toContain("mutation_attempted=true");
      expect(intent.run).toContain("cloudflare-staging-mutation-attempt.json");
      expect(steps.indexOf(intent)).toBeLessThan(steps.indexOf(deploy));
      expect(reconciliation.if).toContain("always()");
      expect(reconciliation.if).toContain(
        "steps.mutation-intent.outputs.mutation_attempted == 'true'",
      );
      expect(reconciliation.run).toContain(
        "cloudflare-pages-candidate-guard.mjs resolve-candidate",
      );
      expect(reconciliation.run).toContain(
        "cloudflare-staging-candidate-receipt.json",
      );
      expect(rollback.if).toContain(
        "steps.mutation-intent.outputs.mutation_attempted == 'true'",
      );
      expect(finalRead).toBeGreaterThan(-1);
      expect(authorization).toBeGreaterThan(finalRead);
      expect(post).toBeGreaterThan(authorization);
      expect(rollback.run.slice(finalRead, post)).not.toMatch(/npm |gh |sleep /);
      expect(rollback.run).toContain(
        "Cloudflare Pages rollback has no provider-side compare-and-swap precondition",
      );
    });

    it("serializes every GitHub-controlled Cloudflare mutation lane", () => {
      const staging = yaml.load(workflow("stage-release.yml"));
      const production = yaml.load(workflow("deploy-production-release.yml"));
      const recovery = yaml.load(
        workflow("direct-cloudflare-production-deploy.yml"),
      );

      expect(staging.concurrency).toEqual({
        group: "maiprop-staging-release",
        "cancel-in-progress": false,
      });
      expect(production.concurrency).toEqual({
        group: "maiprop-production-release",
        "cancel-in-progress": false,
      });
      expect(recovery.concurrency).toEqual(production.concurrency);
    });

   it("attests that the exact Pages deployment is canonical at the stable staging origin", () => {
    const stage = workflow("stage-release.yml");

    expect(stage).toContain("cloudflare-staging-project-after.json");
    expect(stage).toContain(".result.canonical_deployment.id");
    expect(stage).toContain("canonical_deployment_id");
    expect(stage).toContain("STAGING_APP_URL");
     expect(stage).toContain("stable-release-marker.json");
     expect(stage).toContain("stable-runtime-config.json");
     expect(stage).toContain("cloudflare-staging-candidate-receipt.json");
     expect(stage).toContain("cloudflare-staging-mutation-attempt.json");
     expect(stage).toContain(
       'secret_binding_verification: "allowlisted-name-and-type"',
     );
     expect(stage).toContain(
       'authenticated_live_functional_proof: "passed"',
     );
  });

  it("uploads only minimized Cloudflare evidence and never raw binding-bearing responses", () => {
    const stage = workflow("stage-release.yml");
    const uploadStart = stage.indexOf(
      "Upload exact Cloudflare staging evidence",
    );
    const rollbackStart = stage.indexOf(
      "Roll back failed staging candidate",
    );
    const uploadBlock = stage.slice(uploadStart, rollbackStart);

    expect(uploadBlock).toContain(
      "cloudflare-staging-deployment-evidence.json",
    );
    expect(uploadBlock).toContain(
      "cloudflare-staging-canonical-evidence.json",
    );
    expect(uploadBlock).toContain(
      "cloudflare-staging-project-identity-evidence.json",
    );
     expect(uploadBlock).toContain("cloudflare-pages-final-posture.json");
     expect(uploadBlock).toContain("cloudflare-staging-candidate-receipt.json");
     expect(uploadBlock).toContain("cloudflare-staging-mutation-attempt.json");
    expect(uploadBlock).not.toContain("cloudflare-staging-deployment.json");
    expect(uploadBlock).not.toContain(
      "cloudflare-staging-canonical-deployment.json",
    );
    expect(uploadBlock).not.toContain("cloudflare-staging-project-after.json");
    expect(uploadBlock).not.toContain("cloudflare-staging-project-final.json");
    expect(uploadBlock).not.toContain(
      "cloudflare-production-project-final.json",
    );
  });

  it("keeps direct recovery exact-SHA, same-attempt-backend, and no-rebuild gated", () => {
    const direct = workflow("direct-cloudflare-production-deploy.yml");

    expect(direct).toContain("release_sha:");
    expect(direct).toContain("required: true");
    expect(direct).toContain("github-recovery");
    expect(direct).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(direct).toContain("backend_run_id");
    expect(direct).toContain("backend_run_attempt");
    expect(direct).toContain("backend_approval_run_id");
    expect(direct).toContain("backend_approval_run_attempt");
    expect(direct).toContain("production-mutation-lease");
    expect(direct).toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(direct).not.toContain("secrets: inherit");
    expect(direct).not.toContain("pages deploy dist");
    expect(direct).not.toMatch(/npm run build|vite build/);
    expect(direct).toContain("production-recovery-attestation.json");
  });

  it("builds exact-SHA Edge source evidence for staging without enabling production", () => {
    const inventory = readFileSync(
      resolve(root, "scripts", "release-safety-inventory.mjs"),
      "utf8",
    );
    expect(inventory).toContain('"--output-format"');
    expect(inventory).toContain('"json"');
    expect(inventory).toContain("ezbr_sha256");
    expect(inventory).toContain("release_sha:");
    expect(inventory).toContain("edge_source_manifest");
    expect(inventory).toContain("source_sha256");
    expect(inventory).toContain("expected_source_sha256");
    expect(inventory).toContain("manifest_sha256");
  });

  it("builds a deterministic exact-SHA Edge source manifest", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/release-safety-inventory.mjs"],
      {
        cwd: root,
        encoding: "utf8",
        env: {
          ...process.env,
          RELEASE_SAFETY_RELEASE_SHA:
            "0123456789abcdef0123456789abcdef01234567",
        },
      },
    );

    expect(result.status, result.stderr).toBe(0);
    const inventory = JSON.parse(result.stdout);
    expect(inventory.edge_source_manifest.release_sha).toBe(
      "0123456789abcdef0123456789abcdef01234567",
    );
    expect(inventory.edge_source_manifest.manifest_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(inventory.edge_source_manifest.shared.source_sha256).toMatch(
      /^[0-9a-f]{64}$/,
    );
    expect(inventory.edge_source_manifest.functions.length).toBeGreaterThan(50);
    expect(
      inventory.edge_source_manifest.functions.every(
        (entry) =>
          /^[0-9a-f]{64}$/.test(entry.source_sha256) &&
          /^[0-9a-f]{64}$/.test(entry.effective_source_sha256),
      ),
    ).toBe(true);
  });

  it("does not expose the production site-lock secret to executable workflows", () => {
    const cloudflare = workflow("reusable-cloudflare-production-deploy.yml");

    expect(cloudflare).not.toContain("SITE_LOCK_PASSWORD");
    expect(cloudflare).not.toContain("printf 'SITE_LOCK_PASSWORD = %s");
    expect(workflow("ci.yml")).not.toContain("printf 'SITE_LOCK_PASSWORD = %s");
  });

  it("promotes the immutable production candidate rather than rebuilding it", () => {
    const cloudflare = workflow("reusable-cloudflare-production-deploy.yml");

    expect(cloudflare).toContain("pages deploy dist");
    expect(cloudflare).toContain("release:artifact:verify");
    expect(cloudflare).not.toContain("npm run build");
    expect(cloudflare).not.toContain("vite build");
  });

  it("documents exact-SHA recovery and backward-compatible rollback constraints", () => {
    const runbook = readFileSync(
      resolve(root, "docs", "PRODUCTION_RELEASE_RUNBOOK.md"),
      "utf8",
    );

    expect(runbook).toContain("Immutable release candidate built");
    expect(runbook).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(runbook).toContain("enabled only through the protected coordinated release");
    expect(runbook).toContain("backend proof");
    expect(runbook).toContain("N-1 frontend");
    expect(runbook).toContain("SITE_LOCK_PASSWORD");
    expect(runbook).toContain("SUPABASE_PRODUCTION_DB_URL");
  });
});
