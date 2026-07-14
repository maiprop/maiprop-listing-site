import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const routesPath = resolve(process.cwd(), "public/_routes.json");
const productionDeployWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
);
const directProductionDeployWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/direct-cloudflare-production-deploy.yml",
);
const ciWorkflowPath = resolve(process.cwd(), ".github/workflows/ci.yml");
const packageJsonPath = resolve(process.cwd(), "package.json");
const pagesWorkerBuildScriptPath = resolve(process.cwd(), "scripts/build-cloudflare-pages-worker.mjs");
const homepageInitialScriptPath = resolve(process.cwd(), "scripts/inject-homepage-initial.mjs");

describe("Cloudflare Pages function routes", () => {
  it("routes public API and middleware paths through Pages Functions before SPA fallback", () => {
    const routes = JSON.parse(readFileSync(routesPath, "utf8"));

    expect(routes).toMatchObject({ version: 1 });
    expect(routes.include).toEqual([
      "/api/public/*",
      "/sitemap-dynamic.xml",
      "/listings",
      "/auctions",
      "/auction/*",
      "/new-build/*",
      "/open-house/*",
      "/property/*",
      "/__unlock",
    ]);
    expect(routes.include).not.toContain("/*");
    expect(routes.exclude ?? []).not.toContain("/api/*");
    expect(routes.exclude ?? []).not.toContain("/api/public/*");
    expect(routes.exclude ?? []).not.toContain("/sitemap-dynamic.xml");
    expect(routes.exclude ?? []).not.toContain("/__unlock");
  });

  it("excludes static assets from Pages Functions to protect the free invocation budget", () => {
    const routes = JSON.parse(readFileSync(routesPath, "utf8"));

    expect(routes.exclude).toEqual(expect.arrayContaining([
      "/assets/*",
      "/docs/*",
      "/images/*",
      "/lovable-uploads/*",
      "/favicon.ico",
      "/robots.txt",
      "/sitemap.xml",
    ]));
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

  it("deploys production with the verified main branch explicitly", () => {
    const workflow = readFileSync(productionDeployWorkflowPath, "utf8");
    const deployCommand = workflow.match(/command:\s+pages deploy[^\n]+/)?.[0] ?? "";

    expect(deployCommand).toContain("pages deploy dist");
    expect(deployCommand).toContain("--branch=main");
    expect(workflow).toContain("id: deploy_pages");
    expect(workflow).toContain("Log Cloudflare Pages deployment outputs");
    expect(workflow).toContain("Inspect Cloudflare Pages deployment aliases");
  });

  it("waits for the stable production domain to serve the deployed commit", () => {
    const workflow = readFileSync(productionDeployWorkflowPath, "utf8");

    expect(workflow).toContain("Write deployment version marker");
    expect(workflow).toContain("dist/deploy-version.json");
    expect(workflow).toContain("PRODUCTION_DEPLOY_EXPECTED_SHA: ${{ github.sha }}");
    expect(workflow).toContain("PRODUCTION_DEPLOY_CHECK_ATTEMPTS: 30");
    expect(workflow).toContain("--public-api");
    expect(workflow).not.toContain("--public-api-allow-fail-open");
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
    expect(buildScript).toContain("curatedRoutesPath");
    expect(buildScript).toContain("requiredStaticExcludes");
    expect(buildScript).toContain("curatedInclude.length > 0");
    expect(buildScript).toContain("Generated _routes.json would not invoke the Pages Function");

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

  it("runs a public API health check against protected PR previews after deploy", () => {
    const workflow = readFileSync(ciWorkflowPath, "utf8");

    expect(workflow).toContain("id: deploy_pages_preview");
    expect(workflow).toContain("Validate Cloudflare Pages preview public APIs");
    expect(workflow).toContain("steps.deploy_pages_preview.outputs['deployment-url']");
    expect(workflow).toContain("CF_ACCESS_CLIENT_ID");
    expect(workflow).toContain("--public-api");
    expect(workflow).not.toContain("--public-api-allow-fail-open");
  });

  it("injects real homepage initial data after build and before Cloudflare deploy", () => {
    const productionWorkflow = readFileSync(productionDeployWorkflowPath, "utf8");
    const directProductionWorkflow = readFileSync(directProductionDeployWorkflowPath, "utf8");
    const ciWorkflow = readFileSync(ciWorkflowPath, "utf8");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const injector = readFileSync(homepageInitialScriptPath, "utf8");

    expect(packageJson.scripts["build:homepage-initial"]).toBe("node scripts/inject-homepage-initial.mjs");
    expect(injector).toContain("maiprop-homepage-initial");
    expect(injector).toContain('url.searchParams.set("section", section)');
    expect(injector).toContain('fetchHomepageSection(origin, "featured"');
    expect(injector).toContain('fetchHomepageSection(origin, "open-houses"');

    const productionBuildIndex = productionWorkflow.indexOf("Build app with production environment");
    const productionInjectIndex = productionWorkflow.indexOf("Generate homepage initial payload");
    const productionPackageIndex = productionWorkflow.indexOf("Package Cloudflare Pages Functions worker");
    expect(productionInjectIndex).toBeGreaterThan(productionBuildIndex);
    expect(productionPackageIndex).toBeGreaterThan(productionInjectIndex);
    expect(productionWorkflow).toContain(
      "npm run build:homepage-initial -- --strict --allow-origin-unavailable",
    );
    expect(directProductionWorkflow).toContain(
      "npm run build:homepage-initial -- --strict --allow-origin-unavailable",
    );
    expect(productionWorkflow).toContain("HOMEPAGE_INITIAL_ORIGIN: ${{ secrets.VITE_APP_URL }}");

    const previewBuildIndex = ciWorkflow.indexOf("Build app with staging environment");
    const previewInjectIndex = ciWorkflow.indexOf("Generate homepage initial payload");
    const previewPackageIndex = ciWorkflow.indexOf("Package Cloudflare Pages Functions worker");
    expect(previewInjectIndex).toBeGreaterThan(previewBuildIndex);
    expect(previewPackageIndex).toBeGreaterThan(previewInjectIndex);
    expect(ciWorkflow).toContain("HOMEPAGE_INITIAL_ORIGIN: https://portal.maiprop.co");
  });
});
