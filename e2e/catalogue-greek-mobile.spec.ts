import { mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Locator, type Page, type Route, type TestInfo } from "@playwright/test";

const VIEWPORTS = [
  { width: 320, height: 568 },
  { width: 320, height: 800 },
] as const;

const UUID_AUCTION_ID = "11111111-1111-4111-8111-111111111111";
const OS_TAG_AUCTION_ID = "OS-AUG-2030-002";
const EVIDENCE_DIR = resolve(
  process.env.PLAYWRIGHT_OUTPUT_DIR?.trim() || "test-results",
  "ux-acceptance",
);
const FIXTURE_IMAGE =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23ece8df'/%3E%3Cpath d='M80 292h480V132L320 56 80 132z' fill='%236f4b96'/%3E%3Crect x='164' y='166' width='312' height='126' fill='%23fff'/%3E%3C/svg%3E";

const makeAuction = (overrides: Record<string, unknown>) => ({
  id: UUID_AUCTION_ID,
  title: "Διαμέρισμα στο κέντρο της Αθήνας",
  address: "Οδός Αθηνάς 12",
  city: "Αθήνα",
  region: "Αττική",
  price: 185000,
  auction_starting_bid: 126000,
  auction_date: "2030-08-15T10:00:00+03:00",
  auction_court: "Ηλεκτρονική πλατφόρμα",
  property_type: "apartment",
  listing_type: "auction",
  cover_image_url: FIXTURE_IMAGE,
  listing_images: [{ url: FIXTURE_IMAGE, sort_order: 1 }],
  sqm: 78,
  bedrooms: 2,
  bathrooms: 1,
  floor: 3,
  total_floors: 6,
  latitude: 37.9838,
  longitude: 23.7275,
  tags: ["round:1", "ownership:full"],
  year_built: 2008,
  construction_status: "renovated",
  website_url: "https://example.test/eauction/athens",
  is_featured: true,
  featured_until: "2035-01-01T00:00:00Z",
  priority_placement: 1,
  priority_until: "2035-01-01T00:00:00Z",
  ...overrides,
});

const AUCTIONS = [
  makeAuction({}),
  makeAuction({
    id: OS_TAG_AUCTION_ID,
    title: "Μεζονέτα κοντά στο λιμάνι του Πειραιά",
    address: "Ακτή Μιαούλη 48",
    city: "Πειραιάς",
    price: 240000,
    auction_starting_bid: 171500,
    auction_date: "2030-08-22T12:00:00+03:00",
    property_type: "maisonette",
    sqm: 112,
    bedrooms: 3,
    bathrooms: 2,
    floor: 5,
    year_built: 2016,
    latitude: 37.9429,
    longitude: 23.6469,
    tags: ["round:2", "ownership:full", OS_TAG_AUCTION_ID],
    website_url: "https://example.test/eauction/piraeus",
    is_featured: false,
    priority_placement: 0,
  }),
];

function json(route: Route, body: unknown, status = 200): Promise<void> {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function auctionEnvelope(data: typeof AUCTIONS) {
  return {
    data,
    revision: "greek-mobile-fixture",
    page: 1,
    pageSize: Math.max(data.length, 1),
    total: data.length,
    totalRaw: data.length,
    totalPages: 1,
    facets: { cities: ["Αθήνα", "Πειραιάς"], rounds: [1, 2] },
    stats: { thisWeek: 0, avgBid: 148750, mappableCount: data.length },
  };
}

async function installGreekCatalogueFixture(page: Page): Promise<void> {
  await page.addInitScript(() => {
    localStorage.setItem("maiprop_lang", "el");
    localStorage.setItem("maiprop_cookie_consent", JSON.stringify({
      accepted: true,
      functional: true,
      analytics: false,
      mapping: false,
      timestamp: Date.now(),
    }));
  });

  await page.route("**/api/public/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/auctions")) {
      const ids = url.searchParams.get("ids")?.split(",").filter(Boolean) ?? [];
      const osTag = url.searchParams.get("osTag");
      const data = ids.length > 0
        ? AUCTIONS.filter((auction) => ids.includes(String(auction.id)))
        : osTag
          ? AUCTIONS.filter((auction) => auction.id === osTag || auction.tags.includes(osTag))
          : AUCTIONS;
      await json(route, auctionEnvelope(data));
      return;
    }
    if (url.pathname.endsWith("/homepage")) {
      const section = url.searchParams.get("section");
      await json(route, section === "auction-count" ? AUCTIONS.length : section === "type-counts" ? {} : []);
      return;
    }
    if (url.pathname.endsWith("/open-houses")) {
      await json(route, { data: [], hasMore: false, nextCursor: null, limit: 60 });
      return;
    }
    if (url.pathname.endsWith("/listings")) {
      await json(route, { data: [], hasMore: false, page: 1, pageSize: 24 });
      return;
    }
    await json(route, { data: [] });
  });

  await page.route("**/functions/v1/**", async (route) => {
    const pathname = new URL(route.request().url()).pathname;
    await json(route, pathname.endsWith("/owner-pro-status") ? { isPro: false } : {});
  });
  await page.route("**/rest/v1/**", async (route) => json(route, []));
  await page.route("https://api.mapbox.com/**", async (route) => route.fulfill({ status: 204, body: "" }));
  await page.route("https://events.mapbox.com/**", async (route) => route.fulfill({ status: 204, body: "" }));
}

async function expectInsideViewport(locator: Locator, width: number, height?: number): Promise<void> {
  const box = await locator.boundingBox();
  expect(box, "expected visible element geometry").not.toBeNull();
  expect(box?.x ?? -1).toBeGreaterThanOrEqual(-1);
  expect((box?.x ?? 0) + (box?.width ?? 0)).toBeLessThanOrEqual(width + 1);
  if (height != null) {
    expect(box?.y ?? -1).toBeGreaterThanOrEqual(-1);
    expect((box?.y ?? 0) + (box?.height ?? 0)).toBeLessThanOrEqual(height + 1);
  }
}

async function expectNoHorizontalOverflow(page: Page, label: string): Promise<void> {
  const overflow = await page.evaluate(() => {
    const offenders = Array.from(document.body.querySelectorAll<HTMLElement>("*"))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === "string" ? element.className : "",
          text: (element.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
        };
      })
      .filter((element) => element.left < -1 || element.right > window.innerWidth + 1)
      .slice(0, 12);
    return {
      document: document.documentElement.scrollWidth - window.innerWidth,
      body: document.body.scrollWidth - window.innerWidth,
      offenders,
    };
  });
  const diagnostics = JSON.stringify(overflow.offenders);
  expect(overflow.document, `${label} document overflow; offenders=${diagnostics}`).toBeLessThanOrEqual(1);
  expect(overflow.body, `${label} body overflow; offenders=${diagnostics}`).toBeLessThanOrEqual(1);
}

async function attachScreenshot(testInfo: TestInfo, name: string, page: Page): Promise<void> {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  const path = resolve(EVIDENCE_DIR, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  await testInfo.attach(name, {
    path,
    contentType: "image/png",
  });
}

for (const viewport of VIEWPORTS) {
  test(`Greek catalogue remains ordered, clickable, and contained at ${viewport.width}x${viewport.height}`, async ({ page }, testInfo) => {
    test.setTimeout(90_000);
    await page.setViewportSize(viewport);
    await installGreekCatalogueFixture(page);

    await page.goto("/", { waitUntil: "domcontentloaded" });
    const allAuctionsLink = page.getByRole("link", { name: "Όλοι οι πλειστηριασμοί" });
    await allAuctionsLink.scrollIntoViewIfNeeded();
    await expect(allAuctionsLink).toBeVisible();
    await expect(page.getByRole("heading", { name: "Οι πλειστηριασμοί αυτής της εβδομάδας" })).toBeVisible();
    await expect(page.getByText(/Αυγ/i).first()).toBeVisible();

    const homepageHrefs = await page.locator('main a[href^="/auction/"]').evaluateAll((links) => (
      [...new Set(
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      )]
    ));
    expect(homepageHrefs).toEqual(AUCTIONS.map((auction) => `/auction/${auction.id}`));
    await expectInsideViewport(allAuctionsLink, viewport.width);
    await expectNoHorizontalOverflow(page, "Greek homepage auction section");
    await attachScreenshot(testInfo, `greek-homepage-auctions-${viewport.width}x${viewport.height}`, page);

    await allAuctionsLink.click();
    await expect(page).toHaveURL(/\/auctions$/);
    const cards = page.locator('[data-testid="auction-card"]:visible');
    await expect(cards).toHaveCount(AUCTIONS.length);
    await expect(cards.first()).toContainText("Τιμή πρώτης προσφοράς");
    await expect(cards.first()).toContainText(/Αυγ/i);
    await expect(cards.first()).toContainText("Έτος");
    await expect(page.getByRole("button", { name: "Αποθήκευση" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Κοινοποίηση" }).first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Αναφορά" }).first()).toBeVisible();

    const catalogueHrefs = await cards.locator('a[href^="/auction/"]').evaluateAll((links) => (
      [...new Set(
        links
          .map((link) => link.getAttribute("href"))
          .filter((href): href is string => Boolean(href)),
      )]
    ));
    expect(catalogueHrefs).toEqual(homepageHrefs);
    for (const card of await cards.all()) await expectInsideViewport(card, viewport.width);
    await expectNoHorizontalOverflow(page, "Greek auctions catalogue");
    await attachScreenshot(testInfo, `greek-auctions-catalogue-${viewport.width}x${viewport.height}`, page);

    for (const href of catalogueHrefs) {
      const link = page.locator(`[data-testid="auction-card"] a[href="${href}"]:visible`).last();
      await link.scrollIntoViewIfNeeded();
      await link.click();
      await expect(page).toHaveURL(new RegExp(`${href.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`));
      await expect(page.locator("main h1").first()).toBeVisible();
      await expect(page.getByTestId("auction-verification-status")).toHaveCount(0, { timeout: 10_000 });
      await expectNoHorizontalOverflow(page, `Greek auction detail ${href}`);
      await page.goto("/auctions", { waitUntil: "domcontentloaded" });
      await expect(page.locator('[data-testid="auction-card"]:visible')).toHaveCount(AUCTIONS.length);
    }
  });
}
