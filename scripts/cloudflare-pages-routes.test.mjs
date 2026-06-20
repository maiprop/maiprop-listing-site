import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesPath = resolve(process.cwd(), "public/_routes.json");
const productionDeployWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
);
const ciWorkflowPath = resolve(process.cwd(), ".github/workflows/ci.yml");
const packageJsonPath = resolve(process.cwd(), "package.json");
const pagesWorkerBuildScriptPath = resolve(process.cwd(), "scripts/build-cloudflare-pages-worker.mjs");

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

  it("deploys production without an explicit branch after verifying production_branch", () => {
    const workflow = readFileSync(productionDeployWorkflowPath, "utf8");
    const deployCommand = workflow.match(/command:\s+pages deploy[^\n]+/)?.[0] ?? "";

    expect(deployCommand).toContain("pages deploy dist");
    expect(deployCommand).not.toContain("--branch=");
    expect(workflow).toContain("id: deploy_pages");
    expect(workflow).toContain("Log Cloudflare Pages deployment outputs");
    expect(workflow).toContain("Inspect Cloudflare Pages deployment aliases");
  });

  it("packages Pages Functions into advanced worker output before Pages deploys", () => {
    const productionWorkflow = readFileSync(productionDeployWorkflowPath, "utf8");
    const ciWorkflow = readFileSync(ciWorkflowPath, "utf8");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const buildScript = readFileSync(pagesWorkerBuildScriptPath, "utf8");

    expect(packageJson.scripts["build:cloudflare-pages-worker"]).toBe("node scripts/build-cloudflare-pages-worker.mjs");
    expect(buildScript).toContain("pages");
    expect(buildScript).toContain("functions");
    expect(buildScript).toContain("build");
    expect(buildScript).toContain('routePath: "/api/public/listings"');
    expect(buildScript).toContain('"_worker.js"');
    expect(buildScript).toContain('"_routes.json"');

    const productionPackageIndex = productionWorkflow.indexOf("Package Cloudflare Pages Functions worker");
    const productionDeployIndex = productionWorkflow.indexOf("Deploy to Cloudflare Pages (production)");
    expect(productionPackageIndex).toBeGreaterThan(-1);
    expect(productionDeployIndex).toBeGreaterThan(productionPackageIndex);
    expect(productionWorkflow).toContain("npm run build:cloudflare-pages-worker");

    const previewPackageIndex = ciWorkflow.indexOf("Package Cloudflare Pages Functions worker");
    const previewDeployIndex = ciWorkflow.indexOf("Deploy to Cloudflare Pages (PR preview)");
    expect(previewPackageIndex).toBeGreaterThan(-1);
    expect(previewDeployIndex).toBeGreaterThan(previewPackageIndex);
  });

  it("keeps PR previews on deterministic branch deployments", () => {
    const workflow = readFileSync(ciWorkflowPath, "utf8");
    const deployCommand = workflow.match(/command:\s+pages deploy[^\n]+github\.head_ref[^\n]+/)?.[0] ?? "";

    expect(deployCommand).toContain("--branch=${{ github.head_ref }}");
  });
});
