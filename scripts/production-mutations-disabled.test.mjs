import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(import.meta.dirname, "..");
const workflow = (name) =>
  readFileSync(resolve(root, ".github", "workflows", name), "utf8");

describe("production mutation hard disable", () => {
  it("does not call the production Cloudflare workflow from CI", () => {
    const ci = workflow("ci.yml");
    expect(ci).not.toContain(
      "uses: ./.github/workflows/reusable-cloudflare-production-deploy.yml",
    );
    expect(ci).toContain("name: Production deployment disabled");
    expect(ci).toContain("    if: ${{ false }}");
  });

  it.each([
    "deploy-edge-functions.yml",
    "deploy-supabase-production-db.yml",
    "direct-cloudflare-production-deploy.yml",
    "reusable-cloudflare-production-deploy.yml",
  ])("keeps %s behind a literal false job guard", (name) => {
    const content = workflow(name);
    const deployJob = content.slice(content.indexOf("\n  deploy:\n"));

    expect(deployJob).toContain("    if: ${{ false }}");
    expect(deployJob.indexOf("    if: ${{ false }}")).toBeLessThan(
      deployJob.indexOf("\n    steps:"),
    );
  });
});
