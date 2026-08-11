import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");
const parsedWorkflow = (name) => yaml.load(workflow(name));

describe("production mutation hard disable", () => {
  it("does not call the production Cloudflare workflow from CI", () => {
    const ci = workflow("ci.yml");
    expect(ci).not.toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(ci).toContain("name: Production deployment disabled");
    expect(parsedWorkflow("ci.yml").jobs.deploy.if).toBe("${{ false }}");
  });

  it.each([
    "deploy-edge-functions.yml",
    "deploy-supabase-production-db.yml",
    "direct-cloudflare-production-deploy.yml",
    "reusable-cloudflare-production-deploy.yml",
  ])("keeps %s behind a literal false job guard", (name) => {
    expect(parsedWorkflow(name).jobs.deploy.if).toBe("${{ false }}");
  });

  it("does not run staging mutation prep when no Supabase files changed", () => {
    const staging = parsedWorkflow("reusable-supabase-staging.yml");
    const detector = staging.jobs["deploy-supabase-staging"].steps.find(
      (step) => step.id === "supabase_changes",
    );

    expect(detector.run).toMatch(
      /No Supabase DB\/function changes detected: Supabase prep skipped\.[\s\S]*?eligible=false/,
    );
    expect(detector.run).toMatch(
      /No Supabase DB\/function diff detected: Supabase prep skipped\.[\s\S]*?eligible=false/,
    );
  });

  it("keeps legacy credentialed CI jobs disabled until the exact-SHA train owns them", () => {
    const ci = parsedWorkflow("ci.yml");

    for (const jobName of [
      "e2e-security-staging",
      "lighthouse",
      "deploy-supabase-staging",
      "deploy-staging",
    ]) {
      expect(ci.jobs[jobName].if, jobName).toBe("${{ false }}");
    }

    expect(ci.jobs["deploy-supabase-staging"].secrets).toBeUndefined();
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

    expect(detector.run).toMatch(
      /Manual run: standalone Supabase staging prep is disabled\.[\s\S]*?eligible=false[\s\S]*?deploy=false[\s\S]*?db_changes=false/,
    );
    expect(target.if).toBe(
      "steps.supabase_changes.outputs.eligible == 'true'",
    );
  });
});
