import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const cloudflarePostureValidator = readFileSync(
  resolve(root, "scripts", "validate-cloudflare-pages-staging-posture.mjs"),
  "utf8",
);

describe("production release train", () => {
  it("parses every production release workflow as valid YAML", () => {
    for (const name of [
      "ci.yml",
      "approve-production-release.yml",
      "compliance-evidence.yml",
      "lock-cloudflare-pages-git-deploys.yml",
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

  it("never mutates production directly from the validation workflow", () => {
    const ci = workflow("ci.yml");

    expect(ci).toContain("name: Immutable release candidate built");
    expect(ci).toContain("always() &&");
    expect(ci).toContain("RELEASE_SAFETY_RESULT:");
    expect(ci).toContain('if [ "$result" != "success" ]; then');
    expect(ci).toContain("No staging or production service was mutated");
    expect(ci).not.toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
  });

  it("keeps compliance evidence read-only and isolates its Cloudflare read token", () => {
    const compliance = workflow("compliance-evidence.yml");
    const parsed = yaml.load(compliance);
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
    const evidenceDownload = collect.steps.find(
      (step) => step.name === "Download minimized Cloudflare Pages posture evidence",
    );

    expect(parsed.concurrency["cancel-in-progress"]).toBe(false);
    expect(dispatch).toEqual({});
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
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_ACCOUNT_ID).toBe(
      "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}",
    );
    expect(collect.env.CLOUDFLARE_API_TOKEN).toBeUndefined();
    expect(collect.env.CLOUDFLARE_ACCOUNT_ID).toBeUndefined();
    expect(collectSource).not.toContain("secrets.CLOUDFLARE_PAGES_EDIT_TOKEN");
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
      '.result | has("source")',
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
    expect(evidenceDownload.uses).toContain("actions/download-artifact@");
    expect(evidenceDownload.with.path).toBe("compliance-evidence/");
    expect(compliance).not.toMatch(
      /(?:--request|-X)\s*(?:POST|PUT|PATCH|DELETE)\b/i,
    );
    expect(compliance).not.toContain("CLOUDFLARE_PAGES_EDIT_TOKEN");
  });

  it("isolates Cloudflare Pages PATCH operations in a manual trusted-main workflow", () => {
    const lock = workflow("lock-cloudflare-pages-git-deploys.yml");
    const parsed = yaml.load(lock);
    const triggerNames = Object.keys(parsed.on);
    const preflight = parsed.jobs["verify-lock-environment"];
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
    expect(preflight.if).toContain("github.ref == 'refs/heads/main'");
    expect(preflight).not.toHaveProperty("environment");
    expect(lock).toContain(
      "environments/cloudflare-git-deploy-lock",
    );
    expect(lock).toContain(".can_admins_bypass == false");
    expect(lock).toContain(
      ".deployment_branch_policy.custom_branch_policies == true",
    );
    expect(lock).toContain(
      ".deployment_branch_policy.protected_branches == false",
    );
    expect(lock).toContain(".total_count == 1");
    expect(lock).toContain('.branch_policies[0].name == "main"');
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.if).toContain(
      "inputs.confirm == 'DISABLE_CLOUDFLARE_GIT_DEPLOYS'",
    );
    expect(job.needs).toBe("verify-lock-environment");
    expect(job.environment).toBe("cloudflare-git-deploy-lock");
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
      "${{ secrets.CLOUDFLARE_PAGES_READ_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}",
    );
    expect(controlStep.env.CLOUDFLARE_PAGES_EDIT_TOKEN).toBe(
      "${{ secrets.CLOUDFLARE_PAGES_EDIT_TOKEN || secrets.CLOUDFLARE_API_TOKEN }}",
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
      '.result | has("source")',
    );
    expect(controlStep.run).toContain(
      '.result.source.type == "github" or .result.source.type == "gitlab"',
    );
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
    const preflight = parsed.jobs["verify-approval-environment"];
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
    expect(preflight.name).toBe(
      "Verify production approval environment",
    );
    expect(preflight.if).toContain("github.ref == 'refs/heads/main'");
    expect(preflight.permissions.actions).toBe("read");
    expect(job.needs).toBe("verify-approval-environment");
    expect(job.name).toBe("Production release approved");
    expect(job.environment).toBe("production-approval");
    expect(job.if).toContain("github.ref == 'refs/heads/main'");
    expect(job.if).toContain(
      "inputs.confirm == 'APPROVE_PRODUCTION_RELEASE'",
    );
    expect(job.permissions).toMatchObject({
      actions: "read",
      attestations: "write",
      contents: "read",
      "id-token": "write",
    });
    expect(approval).toContain("github-release-evidence");
    expect(approval).not.toContain("git fetch --no-tags origin main");
    expect(approval).toContain(
      'gh api "repos/${GITHUB_REPOSITORY}/branches/main" --jq \'.commit.sha\'',
    );
    expect(approval).toContain(
      "environments/production-approval",
    );
    expect(approval).toContain(
      "deployment-branch-policies?per_page=100",
    );
    expect(approval).toContain(
      '.can_admins_bypass == false',
    );
    expect(approval).toContain(
      '.deployment_branch_policy.custom_branch_policies == true',
    );
    expect(approval).toContain(
      '.deployment_branch_policy.protected_branches == false',
    );
    expect(approval).toContain(
      '.total_count == 1',
    );
    expect(approval).toContain(
      '.branch_policies[0].name == "main"',
    );
    expect(approval).toContain(
      '"required_reviewers_available": false',
    );
    expect(approval).toContain(
      '"compensating_control": "signed-allowlisted-independent-actor"',
    );
    expect(approval).toContain(
      "production-approval-environment-posture-${{ github.run_id }}",
    );
    expect(approval).toContain("gh attestation verify");
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
      "actions/attest-build-provenance@0f67c3f4856b2e3261c31976d6725780e5e4c373",
    );
    expect(approval).toContain(
      "production-release-approval-${{ inputs.release_sha }}-${{ github.run_id }}",
    );
    expect(approval).not.toMatch(
      /secrets\.(?:SUPABASE|VITE_SUPABASE|CLOUDFLARE|SITE_LOCK)|supabase (?:db push|functions deploy)|pages deploy|wrangler-action@/,
    );
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
      "production-release-candidate-${{ github.event.workflow_run.head_sha }}",
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
    expect(stage.match(/--signer-digest "\$RELEASE_SHA"/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(stage.match(/--source-digest "\$RELEASE_SHA"/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(2);
    expect(stage).toContain('--source-ref "refs/heads/main"');
    expect(stage).toContain("--deny-self-hosted-runners");
    expect(stage.match(/persist-credentials: false/g)?.length ?? 0)
      .toBeGreaterThanOrEqual(3);
    expect(stage).not.toContain("npm ci --prefer-offline --no-audit\n");
    expect(stage).toContain("npm ci --ignore-scripts --prefer-offline --no-audit");
  });

  it("revalidates the staging lease before every Supabase mutation", () => {
    const staging = workflow("reusable-supabase-staging.yml");
    const legacyLease = staging.indexOf(
      "Revalidate staging lease before legacy migration repair",
    );
    const legacyPreview = staging.indexOf(
      "Preview reviewed staging migration alias repairs",
    );
    const reviewedAliasLease = staging.indexOf(
      "Revalidate staging lease before reviewed alias repair",
    );
    const legacyRepair = staging.indexOf(
      "Apply reviewed staging migration alias repairs",
    );
    const creditLease = staging.indexOf(
      "Revalidate staging lease before add-on migration repair",
    );
    const creditRepair = staging.indexOf(
      "Repair staging add-on credit migration drift",
    );
    const applyLease = staging.indexOf(
      "Revalidate staging lease before database apply",
    );
    const apply = staging.indexOf("Apply database migrations to staging");
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

    expect(legacyLease).toBeGreaterThan(-1);
    expect(legacyPreview).toBeGreaterThan(legacyLease);
    expect(reviewedAliasLease).toBeGreaterThan(legacyPreview);
    expect(legacyRepair).toBeGreaterThan(reviewedAliasLease);
    expect(creditLease).toBeGreaterThan(legacyRepair);
    expect(creditRepair).toBeGreaterThan(creditLease);
    expect(applyLease).toBeGreaterThan(creditRepair);
    expect(apply).toBeGreaterThan(applyLease);
    expect(postgrestLease).toBeGreaterThan(apply);
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
      .toHaveLength(4);
    expect(stage).not.toContain("secrets.STAGING_DEMO_PASSWORD");
    expect(stage).not.toMatch(
      /STAGING_(?:DEVELOPER_A|DEVELOPER_B|DEVELOPER_FREE|SELLER_FREE)_EMAIL:\s+\$\{\{ secrets\./,
    );
    expect(stage).toContain(
      'const expectedProofNames = [\n            "listings",\n            "projects",\n            "promotions",\n            "storage",',
    );
    expect(stage).toContain(
      "expectedProofNames.some(\n                (name) => business.proofs?.[name]?.ok !== true,",
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

  it("keeps every production mutation workflow a credential-free fail-explicit stub", () => {
    for (const name of [
      "deploy-supabase-production-db.yml",
      "deploy-edge-functions.yml",
      "reusable-cloudflare-production-deploy.yml",
    ]) {
      const content = workflow(name);
      const parsed = yaml.load(content);

      expect(content).toContain("workflow_call:");
      expect(parsed.jobs.deploy.if).toBe("${{ false }}");
      expect(parsed.jobs["validate-disabled"]).toBeDefined();
      expect(content).toContain("PRODUCTION_MUTATIONS_DISABLED");
      expect(content).not.toMatch(
        /secrets\.(?:SUPABASE|VITE_SUPABASE|CLOUDFLARE|SITE_LOCK)/,
      );
      expect(content).not.toMatch(
        /supabase (?:db push|migration repair|functions deploy)|pages deploy|wrangler-action@/,
      );
    }
  });

  it("keeps the production entrypoint validation-only while release blockers remain", () => {
    const release = workflow("deploy-production-release.yml");

    expect(release).toContain("name: Deploy Production Release");
    expect(release).toContain("release_sha:");
    expect(release).toContain("required: true");
    expect(release).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(release).toContain("github-release-evidence");
    expect(release).toContain("release-proof-selection.json");
    expect(release).toContain("release-candidate-attestation-${RELEASE_SHA}");
    expect(release).toContain("gh run download");
    expect(release).toContain("gh attestation verify");
    expect(release).toContain(
      '--signer-workflow "github.com/$GITHUB_REPOSITORY/.github/workflows/stage-release.yml"',
    );
    expect(release).toContain('--signer-digest "$RELEASE_SHA"');
    expect(release).toContain('--source-digest "$RELEASE_SHA"');
    expect(release).toContain('--source-ref "refs/heads/main"');
    expect(release).toContain("--deny-self-hosted-runners");
    expect(release).toContain("release-candidate-attestation");
    expect(release).toContain('SOURCE_TREE="$(git rev-parse "${RELEASE_SHA}^{tree}")"');
    expect(release).toContain('--source-tree "$SOURCE_TREE"');
    expect(release).toContain('--source-run-id "$SOURCE_RUN_ID"');
    expect(release).toContain('--source-run-attempt "$SOURCE_RUN_ATTEMPT"');
    expect(release).toContain("Production mutations remain disabled");
    expect(release).not.toContain(
      "uses: ./.github/workflows/deploy-supabase-production-db.yml",
    );
    expect(release).not.toContain(
      "uses: ./.github/workflows/deploy-edge-functions.yml",
    );
    expect(release).not.toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(release).not.toContain("secrets: inherit");
  });

  it("cryptographically attests the final exact-SHA staging aggregate", () => {
    const stage = workflow("stage-release.yml");
    const parsed = yaml.load(stage);
    const job = parsed.jobs["release-candidate-attested"];

    expect(job.permissions).toMatchObject({
      actions: "read",
      attestations: "write",
      contents: "read",
      "id-token": "write",
    });
    expect(stage).toContain("Attest final release candidate evidence");
    expect(stage).toContain(
      "actions/attest-build-provenance@0f67c3f4856b2e3261c31976d6725780e5e4c373",
    );
    expect(stage).toContain(
      "subject-path: release-candidate-attestation.json",
    );
    expect(stage).toContain("schema_version: 2");
    expect(stage).toContain("security: securityEvidence.sha256");
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

   it("attests that the exact Pages deployment is canonical at the stable staging origin", () => {
    const stage = workflow("stage-release.yml");

    expect(stage).toContain("cloudflare-staging-project-after.json");
    expect(stage).toContain(".result.canonical_deployment.id");
    expect(stage).toContain("canonical_deployment_id");
    expect(stage).toContain("STAGING_APP_URL");
    expect(stage).toContain("stable-release-marker.json");
    expect(stage).toContain("stable-runtime-config.json");
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

  it("keeps direct recovery validation-only while production is disabled", () => {
    const direct = workflow("direct-cloudflare-production-deploy.yml");

    expect(direct).toContain("release_sha:");
    expect(direct).toContain("required: true");
    expect(direct).toContain("github-recovery");
    expect(direct).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(direct).toContain("Production recovery mutations remain disabled");
    expect(direct).not.toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(direct).not.toContain("secrets: inherit");
    expect(direct).not.toContain("pages deploy dist");
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

  it("requires a future production implementation to promote rather than rebuild", () => {
    const cloudflare = workflow("reusable-cloudflare-production-deploy.yml");

    expect(cloudflare).toContain(
      "promote the exact staged artifact without rebuilding it",
    );
    expect(cloudflare).not.toContain("npm run build");
    expect(cloudflare).not.toContain("pages deploy");
  });

  it("documents exact-SHA recovery and backward-compatible rollback constraints", () => {
    const runbook = readFileSync(
      resolve(root, "docs", "PRODUCTION_RELEASE_RUNBOOK.md"),
      "utf8",
    );

    expect(runbook).toContain("Immutable release candidate built");
    expect(runbook).toContain("PRODUCTION_RELEASE_ENABLED");
    expect(runbook).toContain("disabled");
    expect(runbook).toContain("backend proof");
    expect(runbook).toContain("N-1 frontend");
    expect(runbook).toContain("SITE_LOCK_PASSWORD");
    expect(runbook).toContain("SUPABASE_PRODUCTION_DB_URL");
  });
});
