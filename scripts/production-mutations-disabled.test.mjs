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

describe("production mutation hard disable", () => {
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

  it("keeps reusable-cloudflare-production-deploy.yml as an explicit disabled stub", () => {
    const name = "reusable-cloudflare-production-deploy.yml";
    const jobs = parsedWorkflow(name).jobs;

    expect(jobs["validate-disabled"]).toBeDefined();
    expect(jobs.deploy.if).toBe("${{ false }}");
  });

  it.each([
    "deploy-edge-functions.yml",
    "deploy-supabase-production-db.yml",
  ])("allows %s only as a protected workflow-call promotion boundary", (name) => {
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

    const runScripts = parsed.jobs.deploy.steps
      .map((step) => step.run ?? "")
      .join("\n");
    expect(runScripts).not.toMatch(/\$\{\{\s*(?:inputs|secrets)\./);
  });

  it("keeps direct-cloudflare-production-deploy.yml validation-only and unconditionally non-mutating", () => {
    const name = "direct-cloudflare-production-deploy.yml";
    const source = workflow(name);
    const jobs = parsedWorkflow(name).jobs;
    const runScripts = jobs.validate.steps
      .map((step) => step.run ?? "")
      .join("\n");

    expect(Object.keys(jobs)).toEqual(["validate"]);
    expect(source).not.toMatch(
      /CLOUDFLARE_API_TOKEN|SUPABASE_ACCESS_TOKEN|SUPABASE_SERVICE_ROLE_KEY/,
    );
    expect(runScripts).not.toMatch(
      /\bpages deploy\b|\bsupabase db push\b|\bsupabase functions deploy\b/,
    );
    expect(runScripts).toMatch(
      /Production (?:recovery )?mutations remain disabled[\s\S]*?exit 1/,
    );
  });

  it("orchestrates production Supabase only through contract-bound reusable workflows", () => {
    const name = "deploy-production-release.yml";
    const source = workflow(name);
    const jobs = parsedWorkflow(name).jobs;
    const runScripts = [
      ...jobs.validate.steps,
      ...jobs["renew-edge-mutation-lease"].steps,
    ].map((step) => step.run ?? "").join("\n");

    expect(Object.keys(jobs)).toEqual([
      "validate",
      "deploy-production-database",
      "renew-edge-mutation-lease",
      "deploy-production-edge",
    ]);
    expect(jobs["deploy-production-database"].uses).toBe(
      "./.github/workflows/deploy-supabase-production-db.yml",
    );
    expect(jobs["deploy-production-edge"].uses).toBe(
      "./.github/workflows/deploy-edge-functions.yml",
    );
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
      needs: "validate-source",
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
});
