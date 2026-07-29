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

  it.each([
    "deploy-edge-functions.yml",
    "deploy-supabase-production-db.yml",
    "reusable-cloudflare-production-deploy.yml",
  ])("keeps %s as an explicit disabled stub", (name) => {
    const jobs = parsedWorkflow(name).jobs;

    expect(jobs["validate-disabled"]).toBeDefined();
    expect(jobs.deploy.if).toBe("${{ false }}");
  });

  it.each([
    "direct-cloudflare-production-deploy.yml",
    "deploy-production-release.yml",
  ])("keeps %s validation-only and unconditionally non-mutating", (name) => {
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

  it("routes staging mutations only through the exact-SHA stage workflow", () => {
    const ciJobs = parsedWorkflow("ci.yml").jobs;
    const stagingJobs = parsedWorkflow("stage-release.yml").jobs;

    expect(ciJobs["deploy-supabase-staging"]).toBeUndefined();
    expect(stagingJobs["validate-source"]).toBeDefined();
    expect(stagingJobs["supabase-staging"]).toMatchObject({
      needs: "validate-source",
      uses: "./.github/workflows/reusable-supabase-staging.yml",
    });
    expect(workflow("stage-release.yml")).toContain(
      "vars.STAGING_RELEASE_ENABLED == 'true'",
    );
  });

  it("keeps every other workflow free of release mutation credentials and commands", () => {
    const authorizedMutationWorkflows = new Set([
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
