import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";

const routesPath = resolve(process.cwd(), "public/_routes.json");
const productionDeployWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/reusable-cloudflare-production-deploy.yml",
);
const ciWorkflowPath = resolve(process.cwd(), ".github/workflows/ci.yml");
const stageWorkflowPath = resolve(
  process.cwd(),
  ".github/workflows/stage-release.yml",
);
const packageJsonPath = resolve(process.cwd(), "package.json");
const pagesWorkerBuildScriptPath = resolve(
  process.cwd(),
  "scripts/build-cloudflare-pages-worker.mjs",
);
const homepageInitialScriptPath = resolve(
  process.cwd(),
  "scripts/inject-homepage-initial.mjs",
);

function routePatternMatches(pattern, pathname) {
  const escaped = pattern
    .split("*")
    .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  return new RegExp(`^${escaped}$`).test(pathname);
}

function invokesPagesFunctions(routes, pathname) {
  const included = routes.include.some((pattern) =>
    routePatternMatches(pattern, pathname),
  );
  const excluded = routes.exclude.some((pattern) =>
    routePatternMatches(pattern, pathname),
  );
  return included && !excluded;
}

describe("Cloudflare Pages function routes", () => {
  it("routes every application and API path through the root middleware", () => {
    const routes = JSON.parse(readFileSync(routesPath, "utf8"));

    expect(routes).toMatchObject({ version: 1 });
    expect(routes.include).toEqual(["/*"]);

    const protectedPaths = [
      "/",
      "/open-houses",
      "/dashboard",
      "/dashboard/listings",
      "/investor-dashboard",
      "/a/future/spa/route",
      "/runtime-config.js",
      "/sitemap-dynamic.xml",
      "/__unlock",
      "/api/release",
      "/api/public/listings",
      "/api/private/unknown",
      "/api/anything/nested",
    ];

    for (const pathname of protectedPaths) {
      expect(
        invokesPagesFunctions(routes, pathname),
        `${pathname} must invoke Pages Functions`,
      ).toBe(true);
    }
  });

  it("excludes only the reviewed immutable public asset surface", () => {
    const routes = JSON.parse(readFileSync(routesPath, "utf8"));

    expect(routes.exclude).toEqual([
      "/assets/*",
      "/docs/*",
      "/images/*",
      "/lovable-uploads/*",
      "/favicon.ico",
      "/hero-bg.mp4",
      "/hero-bg.webm",
      "/hero-poster.jpg",
      "/oauth-logo.png",
      "/og-image.png",
      "/placeholder.svg",
      "/robots.txt",
      "/sitemap-static.xml",
      "/sitemap.xml",
      "/api-docs.css",
    ]);

    const excludedStaticPaths = [
      "/assets/app.01234567.js",
      "/docs/edge-functions.openapi.yaml",
      "/images/maiprop-logo.webp",
      "/lovable-uploads/3c02ed5d-5638-402e-b7c8-0daa01b502d0.png",
      "/favicon.ico",
      "/hero-bg.webm",
      "/robots.txt",
    ];

    for (const pathname of excludedStaticPaths) {
      expect(
        invokesPagesFunctions(routes, pathname),
        `${pathname} is an explicitly reviewed static bypass`,
      ).toBe(false);
    }

    for (const pattern of routes.exclude) {
      expect(pattern).not.toBe("/*");
      expect(pattern).not.toMatch(
        /^\/(?:api|dashboard|open-houses|investor-dashboard)(?:\/|$)/,
      );
    }
  });
});

describe("Cloudflare Pages deploy workflow routing", () => {
  it("promotes the exact immutable candidate with scoped credentials and reconciliation", () => {
    const workflow = readFileSync(productionDeployWorkflowPath, "utf8");

    expect(workflow).toContain(
      "Promote immutable candidate to Cloudflare production",
    );
    expect(workflow).not.toContain("environment: production");
    expect(workflow).toContain("secrets.CLOUDFLARE_PAGES_READ_TOKEN");
    expect(workflow).toContain("secrets.CLOUDFLARE_PAGES_EDIT_TOKEN");
    expect(workflow).toContain("pages deploy dist");
    expect(workflow).toContain('--commit-hash="$RELEASE_SHA"');
    expect(workflow).toContain("--commit-dirty=false");
    expect(workflow).toContain("mutation_attempted=true");
    expect(workflow).toContain(
      "cloudflare-pages-candidate-guard.mjs resolve-candidate",
    );
    expect(workflow).toContain(
      "always() && steps.deploy.outputs.mutation_attempted == 'true'",
    );
    expect(workflow).not.toContain("secrets.CLOUDFLARE_API_TOKEN");
    expect(workflow).not.toContain("npm run build");
  });

  it("packages Pages Functions into advanced worker output before Pages deploys", () => {
    const ciWorkflow = readFileSync(ciWorkflowPath, "utf8");
    const stageWorkflow = readFileSync(stageWorkflowPath, "utf8");
    const stageDeployJob = JSON.stringify(
      yaml.load(stageWorkflow).jobs["cloudflare-staging"],
    );
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const buildScript = readFileSync(pagesWorkerBuildScriptPath, "utf8");

    expect(packageJson.scripts["build:cloudflare-pages-worker"]).toBe(
      "node scripts/build-cloudflare-pages-worker.mjs",
    );
    expect(buildScript).toContain("pages");
    expect(buildScript).toContain("functions");
    expect(buildScript).toContain("build");
    expect(buildScript).toContain('routePath: "/api/public/listings"');
    expect(buildScript).toContain('"_worker.js"');
    expect(buildScript).toContain('"_routes.json"');
    expect(buildScript).toContain("curatedRoutesPath");
    expect(buildScript).toContain("requiredStaticExcludes");
    expect(buildScript).toContain("curatedInclude.length > 0");
    expect(buildScript).toContain(
      "Generated _routes.json would not invoke the Pages Function",
    );

    const candidatePackageIndex = ciWorkflow.indexOf(
      "Package Cloudflare Pages Functions worker",
    );
    const candidateCreateIndex = ciWorkflow.indexOf(
      "Create immutable release candidate",
    );
    expect(candidatePackageIndex).toBeGreaterThan(-1);
    expect(candidateCreateIndex).toBeGreaterThan(candidatePackageIndex);

    const stageVerifyIndex = stageWorkflow.indexOf(
      "Verify immutable candidate again",
    );
    const stageDeployIndex = stageWorkflow.indexOf(
      "Deploy exact artifact to dedicated staging project",
    );
    expect(stageVerifyIndex).toBeGreaterThan(-1);
    expect(stageDeployIndex).toBeGreaterThan(stageVerifyIndex);
    expect(stageDeployJob).not.toContain("npm run build");
    expect(stageDeployJob).not.toContain(
      "npm run build:cloudflare-pages-worker",
    );
  });

  it("keeps exact-SHA staging on a deterministic dedicated deployment", () => {
     const workflow = readFileSync(stageWorkflowPath, "utf8");
     const deployCommand =
       workflow.match(
         /pages deploy dist[\s\S]*?--commit-dirty=false/,
       )?.[0] ?? "";

    expect(workflow).toContain(
      "workingDirectory: ${{ steps.isolated-pages-deploy.outputs.directory }}",
    );
    expect(workflow).not.toContain("workingDirectory: release-candidate");
     expect(workflow).toContain('wranglerVersion: "4.86.0"');
     expect(deployCommand).toContain("--branch=main");
     expect(deployCommand).toContain(
       "--commit-hash=${{ needs.validate-source.outputs.release_sha }}",
    );
    expect(deployCommand).toContain("--commit-dirty=false");
  });

  it("runs a public API health check against the protected exact-SHA staging deployment", () => {
    const workflow = readFileSync(stageWorkflowPath, "utf8");

    expect(workflow).toContain("id: deploy");
    expect(workflow).toContain(
      "Verify immutable and canonical staging runtimes",
    );
    expect(workflow).toContain("steps.deployment.outputs.deployment_url");
    expect(workflow).toContain("CF_ACCESS_CLIENT_ID");
    expect(workflow).toContain("--public-api");
    expect(workflow).not.toContain("--public-api-allow-fail-open");
  });

  it("does not rebuild or inject environment-specific data after candidate creation", () => {
    const productionWorkflow = readFileSync(
      productionDeployWorkflowPath,
      "utf8",
    );
    const ciWorkflow = readFileSync(ciWorkflowPath, "utf8");
    const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
    const injector = readFileSync(homepageInitialScriptPath, "utf8");

    expect(packageJson.scripts["build:homepage-initial"]).toBe(
      "node scripts/inject-homepage-initial.mjs",
    );
    expect(injector).toContain("maiprop-homepage-initial");
    expect(injector).toContain('url.searchParams.set("section", section)');
    expect(injector).toContain('fetchHomepageSection(origin, "featured"');
    expect(injector).toContain("fetchInitialOpenHouses(origin");

    expect(productionWorkflow).not.toContain("build:homepage-initial");
    expect(productionWorkflow).not.toContain("npm run build");
    expect(productionWorkflow).toContain("pages deploy dist");
    expect(productionWorkflow).toContain('--commit-hash="$RELEASE_SHA"');
    expect(productionWorkflow).toContain("--commit-dirty=false");

    const candidateBuildIndex = ciWorkflow.indexOf("Type-check & build");
    const candidatePackageIndex = ciWorkflow.indexOf(
      "Package Cloudflare Pages Functions worker",
    );
    const candidateCreateIndex = ciWorkflow.indexOf(
      "Create immutable release candidate",
    );
    expect(candidatePackageIndex).toBeGreaterThan(candidateBuildIndex);
    expect(candidateCreateIndex).toBeGreaterThan(candidatePackageIndex);

     const stageWorkflow = readFileSync(stageWorkflowPath, "utf8");
     const stageDeployJob = JSON.stringify(
       yaml.load(stageWorkflow).jobs["cloudflare-staging"],
     );
     expect(stageWorkflow).not.toContain("build:homepage-initial");
     expect(stageDeployJob).not.toContain("npm run build");
     expect(stageWorkflow).toContain(
       "workingDirectory: ${{ steps.isolated-pages-deploy.outputs.directory }}",
     );
     expect(stageWorkflow).not.toContain("workingDirectory: release-candidate");
     expect(stageWorkflow).toContain("pages deploy dist");
   });
 });
