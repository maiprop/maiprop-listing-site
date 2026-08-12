import { createHash } from "node:crypto";
import { expect, test, type Page, type TestInfo } from "@playwright/test";

const RUN_STAGING_CATALOGUE_GATES =
  process.env.MAIPROP_RUN_STAGING_CATALOGUE_GATES === "1";
const STAGING_BASE_URL = process.env.PLAYWRIGHT_BASE_URL?.trim().replace(/\/$/, "") ?? "";
const EXPECTED_RELEASE_SHA = process.env.MAIPROP_STAGING_RELEASE_SHA?.trim().toLowerCase() ?? "";
const ALLOW_LOOPBACK_HTTP =
  process.env.MAIPROP_ALLOW_LOOPBACK_STAGING_CATALOGUE_GATE === "1";
const FULL_SHA = /^[0-9a-f]{40}$/;
const SHA256 = /^[0-9a-f]{64}$/;
const POSITIVE_INTEGER = /^[1-9][0-9]*$/;
const UUID_AUCTION_PATH = /^\/auction\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PRODUCTION_HOSTS = new Set([
  "maiprop.co",
  "www.maiprop.co",
  "portal.maiprop.co",
]);
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]"]);

const CATALOGUE_ROUTES = [
  {
    path: "/",
    label: "homepage auction catalogue",
    dataSelector: 'main a[href^="/auction/"]',
  },
  {
    path: "/listings",
    label: "listings catalogue",
    dataSelector:
      'main [data-testid="property-card"] a[href^="/property/"], main [data-testid="property-card"] a[href^="/new-build/"]',
  },
  {
    path: "/auctions",
    label: "auctions catalogue",
    dataSelector: 'main [data-testid="auction-card"] a[href^="/auction/"]',
  },
  {
    path: "/open-houses",
    label: "open houses catalogue",
    dataSelector: 'main [data-testid="open-house-card"] a[href^="/open-house/"]',
  },
] as const;

type RuntimeEvidence = {
  pageErrors: string[];
  consoleErrors: string[];
  forbiddenAuthorityRequests: string[];
};

type EvidenceCheckpoint = {
  pageErrors: number;
  consoleErrors: number;
  forbiddenAuthorityRequests: number;
};

type ReleaseMarker = {
  schema_version?: number;
  release_sha?: string;
  source_tree?: string;
  source_run_id?: string;
  source_run_attempt?: string;
  payload_sha256?: string;
};

function requireSafeStagingConfiguration(): void {
  if (!STAGING_BASE_URL) {
    throw new Error("PLAYWRIGHT_BASE_URL is required for the staging catalogue proof.");
  }
  if (!FULL_SHA.test(EXPECTED_RELEASE_SHA)) {
    throw new Error("MAIPROP_STAGING_RELEASE_SHA must be a full 40-character commit SHA.");
  }

  const target = new URL(STAGING_BASE_URL);
  const isExplicitLoopbackHttp =
    ALLOW_LOOPBACK_HTTP &&
    target.protocol === "http:" &&
    LOOPBACK_HOSTS.has(target.hostname.toLowerCase());
  if (target.protocol !== "https:" && !isExplicitLoopbackHttp) {
    throw new Error(
      "The staging catalogue proof requires HTTPS, except literal loopback HTTP with MAIPROP_ALLOW_LOOPBACK_STAGING_CATALOGUE_GATE=1.",
    );
  }
  if (PRODUCTION_HOSTS.has(target.hostname.toLowerCase())) {
    throw new Error(`Refusing to run staging catalogue proof against production host ${target.hostname}.`);
  }
  if (`${target.origin}${target.pathname.replace(/\/$/, "")}` !== STAGING_BASE_URL) {
    throw new Error("PLAYWRIGHT_BASE_URL must be a normalized deployment origin without query or fragment data.");
  }

  const accessId = process.env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
  const accessSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";
  if (Boolean(accessId) !== Boolean(accessSecret)) {
    throw new Error("CF_ACCESS_CLIENT_ID and CF_ACCESS_CLIENT_SECRET must be configured together.");
  }
}

function stagingHeaders(): Record<string, string> {
  const accessId = process.env.CF_ACCESS_CLIENT_ID?.trim() ?? "";
  const accessSecret = process.env.CF_ACCESS_CLIENT_SECRET?.trim() ?? "";
  return accessId && accessSecret
    ? {
        "CF-Access-Client-Id": accessId,
        "CF-Access-Client-Secret": accessSecret,
      }
    : {};
}

async function configureProtectedPagesContext(page: Page): Promise<void> {
  const accessHeaders = stagingHeaders();
  if (Object.keys(accessHeaders).length > 0) {
    await page.context().route(`${STAGING_BASE_URL}/**`, async (route) => {
      const response = await route.fetch({
        headers: { ...route.request().headers(), ...accessHeaders },
        maxRedirects: 0,
      });
      await route.fulfill({ response });
    });
  }

  const siteLockPassword = process.env.STAGING_SITE_LOCK_PASSWORD?.trim() ?? "";
  if (siteLockPassword) {
    await page.context().addCookies([{
      name: "maiprop_unlock",
      value: createHash("sha256").update(siteLockPassword).digest("hex"),
      url: STAGING_BASE_URL,
      httpOnly: true,
      secure: new URL(STAGING_BASE_URL).protocol === "https:",
      sameSite: "Lax",
    }]);
  }
}

function collectRuntimeEvidence(page: Page): RuntimeEvidence {
  const evidence: RuntimeEvidence = {
    pageErrors: [],
    consoleErrors: [],
    forbiddenAuthorityRequests: [],
  };

  page.on("pageerror", (error) => evidence.pageErrors.push(error.message));
  page.on("console", (message) => {
    if (message.type() === "error") evidence.consoleErrors.push(message.text());
  });
  page.on("request", (request) => {
    const pathname = new URL(request.url()).pathname;
    if (
      pathname.endsWith("/rest/v1/listings") ||
      pathname.endsWith("/functions/v1/fetch-os-auctions")
    ) {
      evidence.forbiddenAuthorityRequests.push(request.url());
    }
  });

  return evidence;
}

function checkpoint(evidence: RuntimeEvidence): EvidenceCheckpoint {
  return {
    pageErrors: evidence.pageErrors.length,
    consoleErrors: evidence.consoleErrors.length,
    forbiddenAuthorityRequests: evidence.forbiddenAuthorityRequests.length,
  };
}

function expectCleanRuntimeSince(
  evidence: RuntimeEvidence,
  since: EvidenceCheckpoint,
  label: string,
): void {
  expect(evidence.pageErrors.slice(since.pageErrors), `${label} page errors`).toEqual([]);
  expect(evidence.consoleErrors.slice(since.consoleErrors), `${label} console errors`).toEqual([]);
  expect(
    evidence.forbiddenAuthorityRequests.slice(since.forbiddenAuthorityRequests),
    `${label} direct catalogue-authority fallbacks`,
  ).toEqual([]);
}

async function attachJson(testInfo: TestInfo, name: string, value: unknown): Promise<void> {
  await testInfo.attach(name, {
    body: JSON.stringify(value, null, 2),
    contentType: "application/json",
  });
}

async function gotoCatalogueRoute(
  page: Page,
  path: string,
  dataSelector: string,
): Promise<string> {
  await page.goto(path, { waitUntil: "domcontentloaded", timeout: 30_000 });
  await expect(page.locator("#main-content, main").first()).toBeVisible({ timeout: 20_000 });

  if (path === "/") {
    await page.locator('main a[href="/auctions"]').last().scrollIntoViewIfNeeded();
  }

  const dataLink = page.locator(dataSelector).first();
  await expect(dataLink).toBeVisible({ timeout: 30_000 });
  const href = await dataLink.getAttribute("href");
  expect(href, `${path} catalogue data link`).toBeTruthy();
  expect((await page.locator("main").innerText()).trim().length, `${path} meaningful content`).toBeGreaterThan(100);
  return href ?? "";
}

async function uniqueAuctionHrefs(page: Page): Promise<string[]> {
  return page.locator('main a[href^="/auction/"]').evaluateAll((links) => (
    [...new Set(
      links
        .map((link) => link.getAttribute("href"))
        .filter((href): href is string => Boolean(href)),
    )]
  ));
}

async function waitForAuctionHrefs(page: Page): Promise<string[]> {
  await expect.poll(
    async () => (await uniqueAuctionHrefs(page)).length,
    { message: "auction detail links become available", timeout: 30_000 },
  ).toBeGreaterThan(0);
  return uniqueAuctionHrefs(page);
}

async function clickMatchingAuctionLink(page: Page, href: string): Promise<void> {
  const link = page.locator(`main a[href="${href}"]`).first();
  await expect(link).toBeVisible({ timeout: 20_000 });
  await Promise.all([
    page.waitForURL((url) => url.pathname === href, { timeout: 20_000 }),
    link.click(),
  ]);
  expect(new URL(page.url()).pathname).toBe(href);
}

async function expectVerifiedAuctionDetail(page: Page, href: string): Promise<string> {
  expect(new URL(page.url()).pathname).toBe(href);
  const main = page.locator("main");
  const heading = main.locator("h1").first();
  await expect(heading).toBeVisible({ timeout: 30_000 });
  await expect(
    main.getByText(/AI Market Insights|AI ανάλυση αγοράς/i).first(),
  ).toBeVisible({ timeout: 30_000 });
  await expect(main).not.toContainText(/auction may have ended|link is invalid|ο σύνδεσμος να μην είναι έγκυρος/i);
  await expect(page.getByTestId("auction-verification-status")).toHaveCount(0, { timeout: 30_000 });
  expect((await main.innerText()).trim().length, `${href} meaningful detail content`).toBeGreaterThan(250);
  const title = (await heading.innerText()).trim();
  expect(title, `${href} detail title`).not.toBe("");
  return title;
}

async function openAuctionFromCatalogue(
  page: Page,
  cataloguePath: "/" | "/auctions",
  href: string,
): Promise<string> {
  await page.goto(cataloguePath, { waitUntil: "domcontentloaded", timeout: 30_000 });
  if (cataloguePath === "/") {
    await page.locator('main a[href="/auctions"]').last().scrollIntoViewIfNeeded();
  }
  await waitForAuctionHrefs(page);
  await clickMatchingAuctionLink(page, href);
  return expectVerifiedAuctionDetail(page, href);
}

test.describe("exact-SHA staging catalogue proof", () => {
  test.skip(
    !RUN_STAGING_CATALOGUE_GATES,
    "Set MAIPROP_RUN_STAGING_CATALOGUE_GATES=1 with an explicit staging origin and release SHA.",
  );
  test.describe.configure({ mode: "serial" });

  test.beforeAll(() => {
    requireSafeStagingConfiguration();
  });

  test.beforeEach(async ({ page }) => {
    await configureProtectedPagesContext(page);
  });

  test("serves the expected immutable release marker", async ({ page }, testInfo) => {
    const headers = stagingHeaders();
    const liveResponse = await page.request.get(`${STAGING_BASE_URL}/api/release`, { headers });
    const staticResponse = await page.request.get(`${STAGING_BASE_URL}/deploy-version.json`, { headers });

    expect(liveResponse.status(), "live release marker status").toBe(200);
    expect(staticResponse.status(), "static release marker status").toBe(200);

    const liveMarker = await liveResponse.json() as ReleaseMarker;
    const staticMarker = await staticResponse.json() as ReleaseMarker;
    expect(liveMarker.schema_version).toBe(1);
    expect(liveMarker.release_sha?.toLowerCase()).toBe(EXPECTED_RELEASE_SHA);
    expect(staticMarker.release_sha?.toLowerCase()).toBe(EXPECTED_RELEASE_SHA);
    expect(liveMarker.source_tree).toMatch(FULL_SHA);
    expect(staticMarker.source_tree).toMatch(FULL_SHA);
    expect(liveMarker.source_run_id).toMatch(POSITIVE_INTEGER);
    expect(liveMarker.source_run_attempt).toMatch(POSITIVE_INTEGER);
    expect(staticMarker.source_run_id).toMatch(POSITIVE_INTEGER);
    expect(staticMarker.source_run_attempt).toMatch(POSITIVE_INTEGER);
    expect(liveMarker.payload_sha256).toMatch(SHA256);
    expect(staticMarker.payload_sha256).toMatch(SHA256);
    expect(liveMarker.payload_sha256).toBe(staticMarker.payload_sha256);

    await attachJson(testInfo, "exact-sha-release-marker", {
      expected_release_sha: EXPECTED_RELEASE_SHA,
      live: liveMarker,
      static: staticMarker,
    });
  });

  test("renders all public catalogues with data and a clean runtime", async ({ page }, testInfo) => {
    const evidence = collectRuntimeEvidence(page);
    const routeEvidence: Array<{ path: string; first_data_href: string }> = [];

    for (const route of CATALOGUE_ROUTES) {
      const since = checkpoint(evidence);
      const href = await gotoCatalogueRoute(page, route.path, route.dataSelector);
      expectCleanRuntimeSince(evidence, since, route.label);
      routeEvidence.push({ path: route.path, first_data_href: href });
    }

    await attachJson(testInfo, "staging-catalogue-routes", {
      release_sha: EXPECTED_RELEASE_SHA,
      routes: routeEvidence,
      runtime: evidence,
    });
  });

  test("keeps every homepage auction ordered, clickable, and reload-safe against the canonical catalogue", async ({ page }, testInfo) => {
    test.setTimeout(5 * 60_000);
    const evidence = collectRuntimeEvidence(page);
    const since = checkpoint(evidence);

    await page.goto("/", { waitUntil: "domcontentloaded", timeout: 30_000 });
    await page.locator('main a[href="/auctions"]').last().scrollIntoViewIfNeeded();
    const homepageHrefs = await waitForAuctionHrefs(page);
    expect(homepageHrefs.length, "homepage featured auction count").toBeGreaterThan(1);
    expect(new Set(homepageHrefs).size, "homepage auction links must be unique").toBe(homepageHrefs.length);

    await page.goto("/auctions", { waitUntil: "domcontentloaded", timeout: 30_000 });
    const catalogueHrefs = await waitForAuctionHrefs(page);
    expect(
      catalogueHrefs.slice(0, homepageHrefs.length),
      "homepage auctions must be the canonical catalogue prefix in identical order",
    ).toEqual(homepageHrefs);
    expect(new Set(catalogueHrefs).size, "catalogue auction links must be unique").toBe(
      catalogueHrefs.length,
    );

    const clickEvidence: Array<{ href: string; homepage_title: string; catalogue_title: string }> = [];
    for (const href of homepageHrefs) {
      const homepageTitle = await openAuctionFromCatalogue(page, "/", href);
      const catalogueTitle = await openAuctionFromCatalogue(page, "/auctions", href);
      expect(catalogueTitle, `${href} title parity`).toBe(homepageTitle);
      clickEvidence.push({ href, homepage_title: homepageTitle, catalogue_title: catalogueTitle });
    }

    const uuidHref = catalogueHrefs.find((href) => UUID_AUCTION_PATH.test(href));
    const osTagHref = catalogueHrefs.find((href) => !UUID_AUCTION_PATH.test(href));
    expect(uuidHref, "staging catalogue must expose a UUID auction for hard-reload proof").toBeTruthy();
    expect(osTagHref, "staging catalogue must expose an OS-tag auction for hard-reload proof").toBeTruthy();

    const deepLinkEvidence: Array<{ kind: "uuid" | "os-tag"; href: string; title: string }> = [];
    for (const target of [
      { kind: "uuid" as const, href: uuidHref ?? "" },
      { kind: "os-tag" as const, href: osTagHref ?? "" },
    ]) {
      await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
      const directTitle = await expectVerifiedAuctionDetail(page, target.href);

      await page.reload({ waitUntil: "domcontentloaded", timeout: 30_000 });
      expect(await expectVerifiedAuctionDetail(page, target.href), `${target.kind} hard reload title`).toBe(directTitle);

      const freshPage = await page.context().newPage();
      try {
        const freshEvidence = collectRuntimeEvidence(freshPage);
        const freshSince = checkpoint(freshEvidence);
        await freshPage.goto(target.href, { waitUntil: "domcontentloaded", timeout: 30_000 });
        expect(await expectVerifiedAuctionDetail(freshPage, target.href), `${target.kind} fresh page title`).toBe(directTitle);
        expectCleanRuntimeSince(freshEvidence, freshSince, `${target.kind} fresh-page detail`);
      } finally {
        await freshPage.close();
      }

      await testInfo.attach(`staging-${target.kind}-auction-detail`, {
        body: await page.screenshot({ fullPage: true }),
        contentType: "image/png",
      });
      deepLinkEvidence.push({ kind: target.kind, href: target.href, title: directTitle });
    }

    expectCleanRuntimeSince(evidence, since, "auction catalogue navigation");

    await attachJson(testInfo, "staging-auction-navigation", {
      release_sha: EXPECTED_RELEASE_SHA,
      homepage_auction_hrefs: homepageHrefs,
      catalogue_auction_hrefs: catalogueHrefs,
      click_evidence: clickEvidence,
      deep_link_evidence: deepLinkEvidence,
      runtime: evidence,
    });
  });
});
