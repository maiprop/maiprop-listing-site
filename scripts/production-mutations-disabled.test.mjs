import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflowDir = resolve(root, ".github", "workflows");
const workflow = (name) =>
  readFileSync(resolve(workflowDir, name), "utf8");
const parsedWorkflow = (name) => yaml.load(workflow(name));
const workflowNames = readdirSync(workflowDir)
  .filter((name) => /\.ya?ml$/i.test(name))
  .sort();

describe("production mutation boundaries", () => {
  it("keeps CI free of deployment jobs and mutation commands", () => {
    const ci = workflow("ci.yml");
    const jobs = parsedWorkflow("ci.yml").jobs;

    expect(ci).not.toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(jobs.deploy).toBeUndefined();
    expect(jobs["deploy-supabase-staging"]).toBeUndefined();
    expect(ci).not.toMatch(
      /\bpages deploy\b|\bsupabase db push\b|\bsupabase functions deploy\b/,
    );
  });

  it("allows Cloudflare production mutation only through the exact-release reusable boundary", () => {
    const name = "reusable-cloudflare-production-deploy.yml";
    const source = workflow(name);
    const parsed = parsedWorkflow(name);

    expect(Object.keys(parsed.on)).toEqual(["workflow_call"]);
    expect(parsed.jobs.deploy.environment).toBeUndefined();
    expect(source).toContain("npx --no-install wrangler pages deploy dist");
    expect(source).toContain("--commit-dirty=false");
    expect(source).toContain("production-mutation-lease");
    expect(source).not.toContain("secrets: inherit");
    expect(source).not.toMatch(/npm run build|vite build/);
  });

  it.each([
    "deploy-edge-functions.yml",
    "deploy-supabase-production-db.yml",
  ])("allows %s only as an exact-release workflow-call promotion boundary", (name) => {
    const source = workflow(name);
    const parsed = parsedWorkflow(name);

    expect(Object.keys(parsed.on)).toEqual(["workflow_call"]);
    expect(parsed.jobs.deploy.environment).toBe("production");
    expect(parsed.concurrency).toBeUndefined();
    expect(source).toContain("qvvicunqcrwpioqnvzxf");
    expect(source).toContain("persist-credentials: false");
    expect(source).toContain("npm ci --ignore-scripts");
    expect(source).toContain("--workdir release-candidate");
    expect(source).toContain("mutation-lease");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain("secrets: inherit");
    expect(parsed.on.workflow_call.secrets.SUPABASE_PRODUCTION_DB_URL).toBeUndefined();
    expect(source).toContain("secrets.SUPABASE_PRODUCTION_DB_URL");

    const runScripts = parsed.jobs.deploy.steps
      .map((step) => step.run ?? "")
      .join("\n");
    expect(runScripts).not.toMatch(/\$\{\{\s*(?:inputs|secrets)\./);
  });

  it("keeps direct Cloudflare recovery exact-artifact and backend-proof gated", () => {
    const name = "direct-cloudflare-production-deploy.yml";
    const source = workflow(name);
    const jobs = parsedWorkflow(name).jobs;
    const runScripts = jobs.validate.steps
      .map((step) => step.run ?? "")
      .join("\n");

    expect(Object.keys(jobs)).toEqual([
      "validate",
      "deploy-production-cloudflare",
      "attest-production-recovery",
    ]);
    expect(jobs["deploy-production-cloudflare"].uses).toBe(
      "./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(source).toContain("github-recovery");
    expect(source).toContain("backend_run_id");
    expect(source).toContain("backend_run_attempt");
    expect(source).toContain("backend_approval_run_id");
    expect(source).toContain("backend_approval_run_attempt");
    expect(source).toContain("production-mutation-lease");
    expect(source).toContain("scripts/create-release-artifact-binding.mjs");
    expect(source).toContain("scripts/verify-release-artifact-binding.mjs");
    expect(source).not.toContain("secrets: inherit");
    expect(source).not.toMatch(/npm run build|vite build/);
    expect(runScripts).not.toMatch(
      /\bpages deploy\b|\bsupabase db push\b|\bsupabase functions deploy\b/,
    );
  });

  it("orchestrates database, Edge, and Cloudflare only through contract-bound reusable workflows", () => {
    const name = "deploy-production-release.yml";
    const source = workflow(name);
    const jobs = parsedWorkflow(name).jobs;
    const runScripts = [
      ...jobs.validate.steps,
      ...jobs["renew-edge-mutation-lease"].steps,
      ...jobs["renew-cloudflare-mutation-lease"].steps,
    ].map((step) => step.run ?? "").join("\n");

    expect(Object.keys(jobs)).toEqual([
      "validate",
      "consume-break-glass-authorization",
      "cloudflare-production-preflight",
      "archive-production-source",
      "deploy-production-database",
      "renew-edge-mutation-lease",
      "deploy-production-edge",
      "renew-cloudflare-mutation-lease",
      "deploy-production-cloudflare",
      "attest-production-release",
    ]);
    expect(jobs["deploy-production-database"].uses).toBe(
      "./.github/workflows/deploy-supabase-production-db.yml",
    );
    expect(jobs["deploy-production-edge"].uses).toBe(
      "./.github/workflows/deploy-edge-functions.yml",
    );
    expect(jobs["deploy-production-cloudflare"].uses).toBe(
      "./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(jobs["attest-production-release"].permissions).toEqual({
      actions: "read",
      contents: "read",
    });
    expect(source).toContain("scripts/create-release-artifact-binding.mjs");
    expect(source).toContain("scripts/verify-release-artifact-binding.mjs");
    expect(source).not.toContain("secrets: inherit");
    expect(source).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(runScripts).not.toMatch(
      /\bpages deploy\b|\bsupabase db push\b|\bsupabase functions deploy\b/,
    );
  });

  it("routes staging mutations only through the exact-SHA stage workflow", () => {
    const ciJobs = parsedWorkflow("ci.yml").jobs;
    const stagingJobs = parsedWorkflow("stage-release.yml").jobs;
    const reusableStaging =
      parsedWorkflow("reusable-supabase-staging.yml").jobs[
        "deploy-supabase-staging"
      ];

    expect(ciJobs["deploy-supabase-staging"]).toBeUndefined();
    expect(stagingJobs["validate-source"]).toBeDefined();
    expect(stagingJobs["supabase-staging"]).toMatchObject({
      needs: [
        "validate-source",
        "capture-production-n-minus-one",
        "cloudflare-staging-preflight",
      ],
      uses: "./.github/workflows/reusable-supabase-staging.yml",
    });
    expect(workflow("stage-release.yml")).toContain(
      "vars.STAGING_RELEASE_ENABLED == 'true'",
    );
    expect(
      reusableStaging.steps.map((step) => step.run ?? "").join("\n"),
    ).not.toMatch(/\$\{\{\s*(?:inputs|secrets)\./);
  });

  it("keeps every other workflow free of release mutation credentials and commands", () => {
    const authorizedMutationWorkflows = new Set([
      "deploy-edge-functions.yml",
      "deploy-supabase-production-db.yml",
      "bootstrap-cloudflare-staging-pages.yml",
      "reusable-cloudflare-production-deploy.yml",
      "stage-release.yml",
      "reusable-supabase-staging.yml",
    ]);
    const forbiddenMutationWiring =
      /\bI_KNOW_THIS_IS_PROD\b|\bSUPABASE_SERVICE_ROLE_KEY\b|\bSUPABASE_STAGING_DB_URL\b|\bstaging-load-dataset\.mjs\b|\bsupabase\s+(?:db\s+push|functions\s+deploy|migration\s+repair)\b|\bpages\s+deploy\b/;

    for (const name of workflowNames) {
      if (authorizedMutationWorkflows.has(name)) continue;
      expect(workflow(name), name).not.toMatch(forbiddenMutationWiring);
    }
  });

  it("keeps the scheduled live smoke strictly read-only", () => {
    const source = workflow("live-operational-smoke.yml");

    expect(source).not.toMatch(
      /secrets\.|SUPABASE_|VITE_SUPABASE_|E2E_|I_KNOW_THIS_IS_PROD/,
    );
    expect(source).not.toMatch(
      /\/auth\/|ai-quota-status|\b(?:POST|PUT|PATCH|DELETE)\b|npm\s+(?:run|exec)|\bnpx\b|playwright/i,
    );
    expect(source).not.toContain("actions/checkout");
    expect(source).toContain("Run unauthenticated public read-only checks");
    expect(source).toContain('method: "HEAD"');
    expect(source).toContain('method: "GET"');
  });

  it("keeps standalone staging scale mutations disabled", () => {
    const source = workflow("staging-scale-proof.yml");
    const jobs = parsedWorkflow("staging-scale-proof.yml").jobs;

    expect(Object.keys(jobs)).toEqual(["validate-disabled"]);
    expect(source).not.toMatch(
      /SUPABASE_STAGING_DB_URL|staging-load-dataset\.mjs|\bpsql\b/,
    );
    expect(
      jobs["validate-disabled"].steps.some((step) =>
        /exact-SHA stage-release\.yml lease[\s\S]*exit 1/.test(step.run ?? ""),
      ),
    ).toBe(true);
  });

  it("makes the release inventory scan every workflow for mutation paths", () => {
    const inventory = readFileSync(
      resolve(root, "scripts", "release-safety-inventory.mjs"),
      "utf8",
    );

    expect(inventory).toContain("authorizedMutationWorkflows");
    expect(inventory).toContain("staging-load-dataset\\.mjs");
    expect(inventory).toContain("SUPABASE_SERVICE_ROLE_KEY");
    expect(inventory).toContain("SUPABASE_STAGING_DB_URL");
    expect(inventory).toContain("I_KNOW_THIS_IS_PROD");
    expect(inventory).toContain("forbiddenLiveOperationalWiring");
    expect(inventory).toContain("npm\\s+(?:run|exec)");
    expect(inventory).toContain("ai-quota-status");
  });

  it("keeps legacy credentialed CI jobs disabled until the exact-SHA train owns them", () => {
    const ci = parsedWorkflow("ci.yml");

    for (const jobName of [
      "e2e-security-staging",
      "deploy-supabase-staging",
      "deploy-staging",
    ]) {
      expect(ci.jobs[jobName], jobName).toBeUndefined();
    }

    expect(ci.jobs.lighthouse).toBeDefined();
    expect(workflow("ci.yml")).not.toContain(
      "E2E_TEST_EMAIL: ${{ secrets.E2E_TEST_EMAIL }}",
    );
    expect(workflow("ci.yml")).not.toContain(
      "E2E_TEST_PASSWORD: ${{ secrets.E2E_TEST_PASSWORD }}",
    );
  });

  it("rejects standalone manual Supabase staging mutation requests", () => {
    const staging = parsedWorkflow("reusable-supabase-staging.yml");
    const steps = staging.jobs["deploy-supabase-staging"].steps;
    const detector = steps.find((step) => step.id === "supabase_changes");
    const target = steps.find(
      (step) => step.name === "Resolve Supabase staging target",
    );

    expect(Object.keys(staging.on)).toEqual(["workflow_call"]);
    expect(detector.run).toContain(
      '[ "$TRUSTED_CONTROL_SHA" != "$CONTROL_WORKFLOW_SHA" ]',
    );
    expect(detector.run).toContain(
      '[ "$CONTROL_WORKFLOW_SHA" != "$RELEASE_SHA" ]',
    );
    expect(target.if).toBeUndefined();
  });
});
