import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const parsedWorkflow = (name) => yaml.load(workflow(name));

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
});
