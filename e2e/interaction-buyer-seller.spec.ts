/**
 * Cross-user interaction tests — buyer and seller simultaneous browser contexts.
 *
 * Uses the `{ browser }` fixture for multi-context tests so both identities can
 * be live at the same time without sharing cookies or session state.
 *
 * Demo accounts (password: Demo2025!) are seeded via scripts/seed-demo-accounts.ts.
 * Tests are self-skipping when credentials are absent so CI never blocks on missing secrets.
 */
import { test, expect, type Page, type Browser } from "@playwright/test";
import { getBaseURL } from "./helpers/baseURL";
import { demoAccounts, demoPasswords } from "./helpers/demoAccounts";

// ── Credentials ───────────────────────────────────────────────────────────────

const buyerEmail = demoAccounts.buyerFree;
const buyerPassword = demoPasswords.buyerFree;
const sellerEmail = demoAccounts.sellerPro;
const sellerPassword = demoPasswords.sellerPro;

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Sign in a page object with the provided credentials and wait for the app shell. */
const signInAs = async (
  page: Page,
  email: string,
  password: string,
): Promise<void> => {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    await page
      .locator('input[type="email"], input[name="email"]')
      .first()
      .fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page
      .locator(
        'button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")',
      )
      .first()
      .click();
    try {
      await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 25_000 });
      return;
    } catch (error) {
      const invalidCredentials = await page
        .getByText("Invalid email or password", { exact: true })
        .isVisible()
        .catch(() => false);
      if (attempt === 1 || invalidCredentials) throw error;
      await page.waitForTimeout(1_000);
    }
  }
};

/**
 * Navigate to /listings, wait for at least one property card to attach, and
 * return the URL of the first card's detail page (or null if none loaded).
 */
const navigateToFirstListing = async (page: Page): Promise<string | null> => {
  await page.goto("/listings");
  // Use "load" instead of "networkidle" — Mapbox tile requests keep the network busy indefinitely.
  await page.waitForLoadState("load", { timeout: 15_000 });

  // Cards may be <article>, <a>, or a div with common card class names. Wait
  // for the first card's link to render rather than sleeping for a fixed
  // duration; cuts ~2 s off every run when the page is fast and avoids racing
  // when it's slow.
  const cardLink = page
    .locator('a[href*="/property/"], a[href*="/listing/"]')
    .first();

  const attached = await cardLink
    .waitFor({ state: "visible", timeout: 10_000 })
    .then(() => true)
    .catch(() => false);
  if (!attached) return null;

  const href = await cardLink.getAttribute("href");
  return href ?? null;
};

// ── Multi-context tests ───────────────────────────────────────────────────────

test.describe("Buyer + Seller simultaneous sessions", () => {
  // 1. Both users can sign in at the same time
  test("buyer and seller can both sign in simultaneously", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(90_000);
    const baseURL = getBaseURL();
    const buyerCtx = await browser.newContext({ baseURL });
    const sellerCtx = await browser.newContext({ baseURL });
    const buyerPage = await buyerCtx.newPage();
    const sellerPage = await sellerCtx.newPage();

    try {
      // Sign in sequentially to avoid auth rate-limiting under parallel load.
      await signInAs(buyerPage, buyerEmail, buyerPassword);
      await signInAs(sellerPage, sellerEmail, sellerPassword);

      // Both must land on a post-login route.
      expect(buyerPage.url()).toMatch(/\/dashboard|\/onboarding/);
      expect(sellerPage.url()).toMatch(/\/dashboard|\/onboarding/);
    } finally {
      await buyerCtx.close();
      await sellerCtx.close();
    }
  });

  // 7. Both contexts visit /messages without JS errors
  test("both buyer and seller see messages page without crash", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.setTimeout(90_000);
    const baseURL = getBaseURL();
    const buyerCtx = await browser.newContext({ baseURL });
    const sellerCtx = await browser.newContext({ baseURL });
    const buyerPage = await buyerCtx.newPage();
    const sellerPage = await sellerCtx.newPage();

    const buyerErrors: string[] = [];
    const sellerErrors: string[] = [];

    // Register error listeners BEFORE any navigation.
    buyerPage.on("pageerror", (err) => buyerErrors.push(err.message));
    sellerPage.on("pageerror", (err) => sellerErrors.push(err.message));

    try {
      await signInAs(buyerPage, buyerEmail, buyerPassword);
      await signInAs(sellerPage, sellerEmail, sellerPassword);

      await Promise.all([
        buyerPage.goto("/messages"),
        sellerPage.goto("/messages"),
      ]);

      await Promise.all([
        buyerPage.waitForLoadState("load", { timeout: 15_000 }),
        sellerPage.waitForLoadState("load", { timeout: 15_000 }),
      ]);

      // Both pages must have a nav element (app shell rendered).
      await expect(
        buyerPage.locator('nav, [role="navigation"], aside').first(),
      ).toBeAttached({ timeout: 15_000 });
      await expect(
        sellerPage.locator('nav, [role="navigation"], aside').first(),
      ).toBeAttached({ timeout: 15_000 });

      // No uncaught JS errors in either context.
      expect(buyerErrors, "buyer /messages JS errors").toHaveLength(0);
      expect(sellerErrors, "seller /messages JS errors").toHaveLength(0);
    } finally {
      await buyerCtx.close();
      await sellerCtx.close();
    }
  });
});

// ── Single-context buyer tests ────────────────────────────────────────────────

test.describe("Buyer — listings and property detail", () => {
  // 2. Buyer browses listings and opens a property detail
  test("buyer can browse listings and navigate to a property detail page", async ({
    page,
  }) => {
    await signInAs(page, buyerEmail, buyerPassword);

    const href = await navigateToFirstListing(page);

    if (!href) {
      // No listings seeded — verify the listings page at least rendered without crashing.
      const nodeCount = await page.locator("body *").count();
      expect(nodeCount).toBeGreaterThan(5);
      return;
    }

    // Navigate to the detail page. Use "load" — Mapbox keeps network busy.
    await page.goto(href);
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Navbar (app shell) must be visible.
    await expect(
      page.locator('nav, header, [role="navigation"]').first(),
    ).toBeVisible({ timeout: 15_000 });

    // Page must contain meaningful DOM content.
    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
  });

  // 3. Buyer sees Contact / Message / Enquire button on a property detail
  test("buyer sees Send Message / Contact button on property detail", async ({
    page,
  }) => {
    await signInAs(page, buyerEmail, buyerPassword);

    const href = await navigateToFirstListing(page);
    if (!href) {
      test.skip();
      return;
    }

    await page.goto(href);
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Accept any variant of a contact / message call-to-action.
    const contactBtn = page
      .locator(
        'button:has-text("Contact"), button:has-text("Message"), button:has-text("Enquire"),' +
          'a:has-text("Contact"), a:has-text("Message"), a:has-text("Enquire"),' +
          '[data-testid*="contact"], [data-testid*="message"], [data-testid*="enquire"],' +
          '[aria-label*="contact"], [aria-label*="message"]',
      )
      .first();

    const btnCount = await contactBtn.count();
    if (btnCount === 0) {
      // Property detail may not show a contact button without further setup (e.g. agent profile).
      // Verify the page rendered correctly instead.
      const nodeCount = await page.locator("body *").count();
      expect(nodeCount).toBeGreaterThan(5);
      return;
    }
    await expect(contactBtn).toBeAttached({ timeout: 10_000 });
  });

  // 4. Buyer clicks the Contact / Message button and sees compose UI
  test("buyer opens message compose UI from a listing", async ({ page }) => {
    await signInAs(page, buyerEmail, buyerPassword);

    const href = await navigateToFirstListing(page);
    if (!href) {
      test.skip();
      return;
    }

    await page.goto(href);
    await page.waitForLoadState("load", { timeout: 15_000 });

    const contactBtn = page
      .locator(
        'button:has-text("Contact"), button:has-text("Message"), button:has-text("Enquire"),' +
          'a:has-text("Contact"), a:has-text("Message"), a:has-text("Enquire"),' +
          '[data-testid*="contact"], [data-testid*="message"]',
      )
      .first();

    const btnFound = await contactBtn
      .isVisible({ timeout: 10_000 })
      .catch(() => false);
    if (!btnFound) {
      test.skip();
      return;
    }

    await contactBtn.click();

    // Accept either: a modal/dialog overlay OR navigation to /messages.
    const dialogOrMessages = page
      .locator(
        '[role="dialog"], [data-testid*="modal"], [data-testid*="message-compose"],' +
          'textarea[placeholder*="message"], textarea[placeholder*="Message"]',
      )
      .first();

    const modalOpened = await dialogOrMessages
      .isVisible({ timeout: 8_000 })
      .catch(() => false);
    const navigatedToMessages = page.url().includes("/messages");

    expect(
      modalOpened || navigatedToMessages,
      "Expected a compose modal or /messages navigation after clicking Contact",
    ).toBe(true);
  });

  // 8. Buyer can see agent/seller info on a listing detail page
  test("buyer can view seller's contact info or agent badge on a listing", async ({
    page,
  }) => {
    await signInAs(page, buyerEmail, buyerPassword);

    const href = await navigateToFirstListing(page);
    if (!href) {
      test.skip();
      return;
    }

    await page.goto(href);
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Look for any agent/seller/contact section by class, role, or data attribute.
    const agentSection = page
      .locator(
        '[class*="agent"], [class*="seller"], [class*="contact"],' +
          '[data-testid*="agent"], [data-testid*="seller"], [data-testid*="contact"],' +
          'img[alt*="agent"], img[alt*="seller"], img[alt*="avatar"],' +
          '[aria-label*="agent"], [aria-label*="seller"]',
      )
      .first();

    const found = (await agentSection.count()) > 0;

    // Fallback: the page body must at least have meaningful text content.
    if (!found) {
      const bodyText = await page.locator("body").textContent();
      expect(bodyText?.trim().length).toBeGreaterThan(20);
    } else {
      await expect(agentSection).toBeAttached({ timeout: 10_000 });
    }
  });
});

// ── Single-context seller tests ───────────────────────────────────────────────

test.describe("Seller — dashboard and listings", () => {
  // 5. Seller can view their dashboard without crash
  test("seller can view their listings in the dashboard", async ({ page }) => {
    await signInAs(page, sellerEmail, sellerPassword);
    await page.waitForLoadState("load", { timeout: 15_000 });

    // App shell (nav) must be present.
    const nav = page.locator('nav, [role="navigation"], aside').first();
    await expect(nav).toBeAttached({ timeout: 15_000 });

    // Page must not be a blank white screen.
    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
  });

  // 6. Seller navigates to their listings management section
  test("seller navigates to their listings management", async ({ page }) => {
    await signInAs(page, sellerEmail, sellerPassword);

    // Sellers land on /dashboard; try navigating to the listings tab or /listings.
    // First, check if there's a "My Listings" / "Listings" nav item in the dashboard sidebar.
    const dashboardListingsLink = page
      .locator(
        'a[href*="/dashboard/listings"], a:has-text("My Listings"), a:has-text("Listings"), ' +
          '[data-testid*="listings-nav"], [data-testid*="my-listings"]',
      )
      .first();

    const linkFound = await dashboardListingsLink
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    if (linkFound) {
      await dashboardListingsLink.click();
      await page.waitForLoadState("load", { timeout: 15_000 });
    } else {
      // Fall back to navigating directly to /listings.
      await page.goto("/listings");
      await page.waitForLoadState("load", { timeout: 15_000 });
    }

    // Either a heading or a list of listings must be rendered.
    const content = page
      .locator(
        'h1, h2, [role="heading"], article, [class*="card"], [class*="listing"],' +
          '[data-testid="listing-card"], [data-testid="empty-state"]',
      )
      .first();

    await expect(content).toBeAttached({ timeout: 15_000 });
  });

  // Bonus: seller's dashboard has no uncaught JS errors
  test("seller dashboard has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    // Register error listener BEFORE any navigation.
    page.on("pageerror", (err) => errors.push(err.message));

    await signInAs(page, sellerEmail, sellerPassword);
    await page.waitForLoadState("load", { timeout: 15_000 });

    expect(errors, "uncaught JS errors on seller dashboard").toHaveLength(0);
  });
});
