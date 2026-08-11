import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 320, height: 800 },
] as const;
const EVIDENCE_DIR = resolve(
  process.env.PLAYWRIGHT_OUTPUT_DIR?.trim() || "test-results",
  "ux-acceptance",
);

function json(route: Route, body: unknown): Promise<void> {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installCookiePageFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("maiprop_lang", "el");
    localStorage.removeItem("maiprop_cookie_consent");
  });

  await page.route("**/api/public/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auctions")) {
      await json(route, {
        data: [],
        revision: "cookie-mobile-fixture",
        page: 1,
        pageSize: 60,
        total: 0,
        totalRaw: 0,
        totalPages: 1,
        facets: { cities: [], rounds: [] },
        stats: { thisWeek: 0, avgBid: 0, mappableCount: 0 },
      });
      return;
    }
    if (url.pathname.endsWith("/open-houses")) {
      await json(route, { data: [], hasMore: false, nextCursor: null, limit: 60 });
      return;
    }
    if (url.pathname.endsWith("/homepage")) {
      const section = url.searchParams.get("section");
      await json(route, section === "auction-count" ? 0 : section === "type-counts" ? {} : []);
      return;
    }
    await json(route, { data: [] });
  });
}

async function expectInsideViewport(locator: Locator, width: number, height: number): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, "expected visible element geometry").not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(-1);
  expect(box?.y ?? -1).toBeGreaterThanOrEqual(-1);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1);
  expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height + 1);
}

async function attachScreenshot(testInfo: TestInfo, name: string, page: Page): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path });
  await testInfo.attach(name, {
    path,
    contentType: "image/png",
  });
}

for (const viewport of VIEWPORTS) {
  test(`Greek cookie preferences stay reachable at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    await page.setViewportSize(viewport);
    await installCookiePageFixture(page);
    await page.goto("/", { waitUntil: "domcontentloaded" });

    const banner = page.getByTestId("cookie-consent-banner");
    await expect(banner).toBeVisible({ timeout: 5_000 });
    await expectInsideViewport(banner, viewport.width, viewport.height);

    await page.getByRole("button", { name: "Διαχείριση προτιμήσεων" }).click();
    const panel = page.getByTestId("cookie-preferences-panel");
    const actions = page.getByTestId("cookie-actions");
    await expect(panel).toBeVisible();
    await expect(actions).toBeVisible();
    await expectInsideViewport(banner, viewport.width, viewport.height);
    await expectInsideViewport(actions, viewport.width, viewport.height);

    const switches = [
      page.getByRole("switch", { name: "Απαραίτητα Cookies" }),
      page.getByRole("switch", { name: "Λειτουργικά Cookies" }),
      page.getByRole("switch", { name: "Cookies Analytics" }),
      page.getByRole("switch", { name: "Cookies Χαρτών" }),
    ];
    for (const control of switches) {
      await control.scrollIntoViewIfNeeded();
      await expect(control).toBeVisible();
      await expectInsideViewport(control, viewport.width, viewport.height);
      await expect(actions).toBeVisible();
    }

    for (const name of ["Απόρριψη προαιρετικών", "Αποθήκευση προτιμήσεων", "Αποδοχή όλων"]) {
      const button = page.getByRole("button", { name });
      await expect(button).toBeVisible();
      await expectInsideViewport(button, viewport.width, viewport.height);
    }

    const overflow = await page.evaluate(() => ({
      document: document.documentElement.scrollWidth - window.innerWidth,
      body: document.body.scrollWidth - window.innerWidth,
    }));
    expect(overflow.document).toBeLessThanOrEqual(1);
    expect(overflow.body).toBeLessThanOrEqual(1);

    await attachScreenshot(testInfo, `greek-cookie-preferences-${viewport.width}x${viewport.height}`, page);

    await switches[2].click();
    await switches[3].click();
    await page.getByRole("button", { name: "Αποθήκευση προτιμήσεων" }).click();
    await expect(banner).toHaveCount(0);
    const storedConsent = await page.evaluate(() => JSON.parse(
      localStorage.getItem("maiprop_cookie_consent") ?? "null",
    ));
    expect(storedConsent).toMatchObject({
      accepted: true,
      functional: true,
      analytics: true,
      mapping: false,
    });
  });
}
