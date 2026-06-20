import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesPath = resolve(process.cwd(), "public/_routes.json");
const productionDeployWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
);
const ciWorkflowPath = resolve(process.cwd(), ".github/workflows/ci.yml");

describe("Cloudflare Pages function routes", () => {
  it("routes public API and middleware paths through Pages Functions before SPA fallback", () => {
    const routes = JSON.parse(readFileSync(routesPath, "utf8"));

    expect(routes).toMatchObject({ version: 1 });
    expect(routes.include).toEqual(["/*"]);
    expect(routes.exclude ?? []).not.toContain("/api/*");
    expect(routes.exclude ?? []).not.toContain("/api/public/*");
    expect(routes.exclude ?? []).not.toContain("/sitemap-dynamic.xml");
    expect(routes.exclude ?? []).not.toContain("/__unlock");
  });
});

describe("Cloudflare Pages deploy workflow routing", () => {
  it("aligns the Cloudflare Pages production branch before deploying main", () => {
    const workflow = readFileSync(productionDeployWorkflowPath, "utf8");

    expect(workflow).toContain("Ensure Cloudflare Pages production branch is main");
    expect(workflow).toContain("production_branch: $branch");
    expect(workflow).toContain("CURRENT_BRANCH");
    expect(workflow).toContain("Cloudflare Pages production branch verified: main");
  });

  it("deploys production with the verified main branch so the custom domain updates", () => {
    const workflow = readFileSync(productionDeployWorkflowPath, "utf8");
    const deployCommand = workflow.match(/command:\s+pages deploy[^\n]+/)?.[0] ?? "";

    expect(deployCommand).toContain("pages deploy dist");
    expect(deployCommand).toContain("--branch=main");
  });

  it("keeps PR previews on deterministic branch deployments", () => {
    const workflow = readFileSync(ciWorkflowPath, "utf8");
    const deployCommand = workflow.match(/command:\s+pages deploy[^\n]+github\.head_ref[^\n]+/)?.[0] ?? "";

    expect(deployCommand).toContain("--branch=${{ github.head_ref }}");
  });
});
