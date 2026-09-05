import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { BUDGETS_KB } from "./check-bundle-size.mjs";

const lighthouseConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), ".lighthouserc.json"), "utf8"),
);
const publicLighthouseConfig = JSON.parse(
  readFileSync(resolve(process.cwd(), ".lighthouserc.public.json"), "utf8"),
);
const performanceGateSpec = readFileSync(
  resolve(process.cwd(), "e2e/performance-gates.spec.ts"),
  "utf8",
);
const queryBudgetGateSpec = readFileSync(
  resolve(process.cwd(), "e2e/query-budget-gates.spec.ts"),
  "utf8",
);
const stagingCatalogueGatePath = resolve(
  process.cwd(),
  "e2e/staging-catalogue-gates.spec.ts",
);
const stagingCatalogueGateSpec = existsSync(stagingCatalogueGatePath)
  ? readFileSync(stagingCatalogueGatePath, "utf8")
  : "";
const ciWorkflow = readFileSync(
  resolve(process.cwd(), ".github/workflows/ci.yml"),
  "utf8",
);
const lighthouseDoc = readFileSync(
  resolve(process.cwd(), "docs/LIGHTHOUSE_CI_SETUP.md"),
  "utf8",
);

const lighthouseAssertion = (key) =>
  lighthouseConfig.ci.assert.assertions[key]?.[1] ?? {};

const sourceConstant = (source, name) =>
  source.match(new RegExp(`const ${name}(?::[^=]+)? = ([\\s\\S]*?);`))?.[1] ?? "";

describe("performance budget configuration", () => {
  it("launches Lighthouse Chrome with the supported Linux sandbox setting", () => {
    for (const config of [lighthouseConfig, publicLighthouseConfig]) {
      expect(config.ci.collect.puppeteerLaunchOptions).toBeUndefined();
      expect(config.ci.collect.settings.chromeFlags).toContain("--no-sandbox");
    }
  });

  it("keeps Lighthouse budgets closer to Core Web Vitals good thresholds", () => {
    expect(lighthouseAssertion("categories:performance").minScore).toBeGreaterThanOrEqual(0.75);
    expect(lighthouseAssertion("first-contentful-paint").maxNumericValue).toBeLessThanOrEqual(2200);
    expect(lighthouseAssertion("largest-contentful-paint").maxNumericValue).toBeLessThanOrEqual(3500);
    expect(lighthouseAssertion("cumulative-layout-shift").maxNumericValue).toBeLessThanOrEqual(0.1);
  });

  it("keeps Playwright web-vitals route budgets stricter than the old 4s LCP gate", () => {
    expect(performanceGateSpec).toContain("lcp: 3000");
    expect(performanceGateSpec).toContain("cls: 0.1");
    expect(performanceGateSpec).toContain("inp: 200");

    const routes = sourceConstant(performanceGateSpec, "WEB_VITAL_ROUTES");
    expect(routes).toContain('"/auctions"');
    expect(routes).toContain('"/open-houses"');
  });

  it("keeps catalogue routes inside explicit query budgets without direct authority fallbacks", () => {
    const budgets = sourceConstant(queryBudgetGateSpec, "QUERY_BUDGETS");
    expect(budgets).toContain('"/auctions"');
    expect(budgets).toContain('"/open-houses"');
    expect(queryBudgetGateSpec).toContain("rest/v1/listings");
    expect(queryBudgetGateSpec).toContain("functions/v1/fetch-os-auctions");
    expect(queryBudgetGateSpec).toContain("forbiddenAuthorityRequests");
  });

  it("requires an exact-SHA, non-production staging catalogue proof", () => {
    expect(stagingCatalogueGateSpec).toContain("MAIPROP_RUN_STAGING_CATALOGUE_GATES");
    expect(stagingCatalogueGateSpec).toContain("MAIPROP_STAGING_RELEASE_SHA");
    expect(stagingCatalogueGateSpec).toContain("MAIPROP_ALLOW_LOOPBACK_STAGING_CATALOGUE_GATE");
    expect(stagingCatalogueGateSpec).toContain("MAIPROP_STAGING_AUCTION_ROUTE_COMPATIBILITY");
    expect(stagingCatalogueGateSpec).toContain(
      "N-1 auction-route compatibility is allowed only for the explicit loopback runtime.",
    );
    expect(stagingCatalogueGateSpec).toContain("PLAYWRIGHT_BASE_URL");
    expect(stagingCatalogueGateSpec).toContain("PRODUCTION_HOSTS");
    expect(stagingCatalogueGateSpec).toContain("LOOPBACK_HOSTS");
    expect(stagingCatalogueGateSpec).toContain("SHA256");
    expect(stagingCatalogueGateSpec).toContain("/api/release");
    expect(stagingCatalogueGateSpec).toContain('"/open-houses"');
    expect(stagingCatalogueGateSpec).toContain('a[href^="/auction/"]');
    expect(stagingCatalogueGateSpec).toContain("AI Market Insights");
    expect(stagingCatalogueGateSpec).toContain("rest/v1/listings");
    expect(stagingCatalogueGateSpec).toContain("functions/v1/fetch-os-auctions");
  });

  it("emits machine-verifiable route measurements when evidence paths are configured", () => {
    expect(performanceGateSpec).toContain("MAIPROP_CWV_EVIDENCE_PATH");
    expect(performanceGateSpec).toContain("maiprop-cwv-route-measurements");
    expect(performanceGateSpec).toContain("release_sha");
    expect(performanceGateSpec).toContain("measurements");
    expect(performanceGateSpec).toContain("budgets");

    expect(queryBudgetGateSpec).toContain("MAIPROP_QUERY_EVIDENCE_PATH");
    expect(queryBudgetGateSpec).toContain("maiprop-query-route-measurements");
    expect(queryBudgetGateSpec).toContain("forbidden_authority_fallbacks");
    expect(queryBudgetGateSpec).toContain("release_sha");
    expect(queryBudgetGateSpec).toContain("measurements");
    expect(queryBudgetGateSpec).toContain("budgets");
  });

  it("fails closed on partial Cloudflare Access credentials in every staging proof suite", () => {
    for (const spec of [
      performanceGateSpec,
      queryBudgetGateSpec,
      stagingCatalogueGateSpec,
    ]) {
      expect(spec).toContain("CF_ACCESS_CLIENT_ID");
      expect(spec).toContain("CF_ACCESS_CLIENT_SECRET");
      expect(spec).toContain("CF-Access-Client-Id");
      expect(spec).toContain("CF-Access-Client-Secret");
      expect(spec).toContain("must be configured together");
      expect(spec).toContain("page.context().route");
    }
  });

  it("never forwards Cloudflare Access secrets across redirects", () => {
    for (const spec of [
      performanceGateSpec,
      queryBudgetGateSpec,
      stagingCatalogueGateSpec,
    ]) {
      expect(spec).toContain("route.fetch");
      expect(spec).toContain("maxRedirects: 0");
      expect(spec).toContain("route.fulfill");
      expect(spec).not.toContain("route.continue({");
    }
  });

  it("unlocks the Pages site lock without writing credentials into evidence", () => {
    for (const spec of [
      performanceGateSpec,
      queryBudgetGateSpec,
      stagingCatalogueGateSpec,
    ]) {
      expect(spec).toContain("STAGING_SITE_LOCK_PASSWORD");
      expect(spec).toContain('name: "maiprop_unlock"');
      expect(spec).toContain('createHash("sha256")');
      expect(spec).toContain("addCookies");
      expect(spec).not.toContain("site_lock_password:");
      expect(spec).not.toContain("access_client_secret:");
    }
  });

  it("gates high-impact initial chunks explicitly instead of hiding behind catch-all budgets", () => {
    expect(BUDGETS_KB.index).toBeLessThanOrEqual(500);
    expect(BUDGETS_KB["vendor-supabase"]).toBeLessThanOrEqual(225);
    expect(BUDGETS_KB["vendor-i18n"]).toBeLessThanOrEqual(80);
    expect(BUDGETS_KB.lib).toBeLessThanOrEqual(140);
    expect(BUDGETS_KB["*"]).toBeLessThanOrEqual(300);
  });

  it("persists Lighthouse reports as CI artifacts for trend review", () => {
    expect(ciWorkflow).toContain("name: Upload Lighthouse reports");
    expect(ciWorkflow).toContain("path: .lighthouseci/");
    expect(lighthouseDoc).toContain("GitHub Actions artifact");
    expect(lighthouseDoc).toContain("trend review");
  });
});
