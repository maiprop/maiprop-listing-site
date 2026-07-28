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
});
