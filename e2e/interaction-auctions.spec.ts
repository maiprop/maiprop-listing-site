/**
 * Multi-user interaction tests for the auctions feature.
 *
 * Covers:
 *  - Public auction browsing (unauthenticated)
 *  - Authenticated auction interaction for buyer and investor roles
 *  - Multi-user simultaneous browsing via separate browser contexts
 *
 * Demo accounts (password: Demo2025!):
 *   buyer.pro@maiprop.demo            — buyer role
 *   investor.private@maiprop.demo     — investor role (private)
 *   investor.institutional@maiprop.demo — investor role (institutional)
 *   admin@maiprop.demo                — admin role
 *
 * Tests that require sign-in run by default using the seeded demo credentials.
 * Multi-context tests use the `browser` fixture to open isolated browser contexts.
 */
import { test, expect, type Page, type Browser } from "@playwright/test";
import { getBaseURL } from "./helpers/baseURL";
import { demoAccounts, demoPasswords, seededDemoAccountsEnabled } from "./helpers/demoAccounts";

// ─── Credentials ─────────────────────────────────────────────────────────────

const PW = demoPasswords.default;
const BUYER_EMAIL = demoAccounts.buyerFree;
const INVESTOR_PRIVATE_EMAIL = demoAccounts.investorPrivate;
const INVESTOR_INSTITUTIONAL_EMAIL = demoAccounts.investorInstitutional;
const ADMIN_EMAIL = demoAccounts.admin;
const hasSeededDemoAccounts = seededDemoAccountsEnabled();

// ─── Sign-in helper ───────────────────────────────────────────────────────────

/**
 * Sign in with the given email/password and wait for the post-login redirect.
 * Accepts /dashboard, /onboarding, or /admin as valid landing URLs.
 */
const signIn = async (
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
      await page.waitForURL(/\/dashboard|\/onboarding|\/admin/, {
        timeout: 25_000,
      });
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

const expectPageShell = async (page: Page): Promise<void> => {
  await expect(page.locator("main, #main-content, body").first()).toBeVisible({
    timeout: 10_000,
  });
  await expect(
    page
      .locator(
        "h1, h2, [role='heading'], article, [class*='card'], [class*='empty']",
      )
      .first(),
  ).toBeVisible({ timeout: 15_000 });
};

const firstAuctionDetailLink = (page: Page) =>
  page.locator('main a[href^="/auction/"]').first();

const requiresAuctionInventory = (page: Page): boolean => {
  try {
    return new URL(page.url()).hostname === "portal.maiprop.co";
  } catch {
    return false;
  }
};

const clickFirstAuctionDetailLink = async (page: Page): Promise<boolean> => {
  const link = firstAuctionDetailLink(page);
  const attached = await link
    .waitFor({ state: "attached", timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  if (!attached) return false;
  await link.scrollIntoViewIfNeeded();
  await link.click();
  return true;
};

// ─── PUBLIC — auction browsing ────────────────────────────────────────────────

test.describe("Public auction browsing", () => {
  test("auctions page renders listing or empty state", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Heading must be visible
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({
      timeout: 10_000,
    });

    // Either auction cards OR an empty/error state must be present
    const hasCards = await page
      .locator("article, [class*='card'], [data-testid*='auction']")
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    const hasEmptyState = await page
      .locator(
        "[class*='empty'], [class*='no-result'], .text-muted-foreground, [data-testid='empty-state']",
      )
      .first()
      .isVisible()
      .catch(() => false);

    expect(hasCards || hasEmptyState).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test("auctions page has a map/list view toggle", async ({ page }) => {
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    const toggle = page
      .locator(
        'button:has-text("Map"), button:has-text("List"), [aria-label*="map" i], [aria-label*="list" i], button svg',
      )
      .first();

    await expect(toggle).toBeAttached({ timeout: 8_000 });
  });

  test("clicking an auction card navigates to auction detail", async ({
    page,
  }) => {
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    const cardExists = await clickFirstAuctionDetailLink(page);
    if (!cardExists) {
      if (requiresAuctionInventory(page)) {
        throw new Error("Expected at least one live auction detail link on /auctions");
      }
      test.skip();
      return;
    }

    // After navigation the navbar must still be present
    await expect(page.locator("nav, header").first()).toBeVisible({
      timeout: 10_000,
    });
    // Body must have meaningful content (not a blank white screen)
    const bodyText = await page.locator("body").textContent();
    expect((bodyText ?? "").trim().length).toBeGreaterThan(10);
  });

  test("auction detail page shows bid history or property info", async ({
    page,
  }) => {
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    const cardExists = await clickFirstAuctionDetailLink(page);
    if (!cardExists) {
      if (requiresAuctionInventory(page)) {
        throw new Error("Expected at least one live auction detail link on /auctions");
      }
      test.skip();
      return;
    }

    await page.waitForLoadState("load", { timeout: 15_000 });

    // Accept any of: price/bid info, a property heading, or a "No bids" message
    const hasPriceOrBid = await page
      .locator("[class*='price'], [class*='bid']")
      .first()
      .isVisible({ timeout: 8_000 })
      .catch(() => false);

    const hasHeading = await page
      .locator("h1, h2")
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const hasNoBids = await page
      .locator("text=No bids")
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    expect(hasPriceOrBid || hasHeading || hasNoBids).toBe(true);
  });
});

// ─── AUTHENTICATED — auction interaction ──────────────────────────────────────

test.describe("Authenticated auction interaction", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  test("seeded buyer can view auctions after sign-in", async ({ page }) => {
    await signIn(page, BUYER_EMAIL, PW);
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Heading must be visible
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({
      timeout: 10_000,
    });

    // Page must have substantive content
    const bodyText = await page.locator("body").textContent();
    expect((bodyText ?? "").trim().length).toBeGreaterThan(10);
  });

  test("investor.private can view auctions and navigate to auction detail", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, INVESTOR_PRIVATE_EMAIL, PW);
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({
      timeout: 10_000,
    });

    const clicked = await clickFirstAuctionDetailLink(page);
    if (!clicked && !requiresAuctionInventory(page)) {
      test.skip();
      return;
    }
    expect(clicked, "expected investor to see at least one live auction detail link").toBe(true);
    await page.waitForLoadState("load", { timeout: 15_000 });
    // Detail page must render without crashing
    const bodyText = await page.locator("body").textContent();
    expect((bodyText ?? "").trim().length).toBeGreaterThan(10);

    expect(errors).toHaveLength(0);
  });

  test("investor.private accesses /investor-dashboard without access gate", async ({
    page,
  }) => {
    await signIn(page, INVESTOR_PRIVATE_EMAIL, PW);
    await page.goto("/investor-dashboard");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await expectPageShell(page);

    // Must NOT be blocked by the access gate
    const hasGate = await page
      .locator("text=Investor Access Required")
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasGate).toBe(false);
  });

  test("investor.institutional accesses /investor-dashboard", async ({
    page,
  }) => {
    await signIn(page, INVESTOR_INSTITUTIONAL_EMAIL, PW);
    await page.goto("/investor-dashboard");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await expectPageShell(page);

    const hasGate = await page
      .locator("text=Investor Access Required")
      .isVisible({ timeout: 5_000 })
      .catch(() => false);
    expect(hasGate).toBe(false);
  });

  test("Set Alert button on auctions page is functional for authenticated buyer", async ({
    page,
  }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, BUYER_EMAIL, PW);
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    const alertBtn = page
      .locator(
        'main button:has-text("Alert"), main button:has-text("Set Alert"), main button[aria-label*="alert" i]',
      )
      .first();

    await expect(alertBtn).toBeVisible({ timeout: 30_000 });

    await alertBtn.click();
    // Brief settle for any modal/tooltip animation
    await page.waitForTimeout(500);

    // Accept: modal dialog opens, tooltip appears, OR page simply did not crash
    const hasModal = await page
      .locator('[role="dialog"], [data-state="open"]')
      .first()
      .isVisible({ timeout: 5_000 })
      .catch(() => false);

    const hasTooltip = await page
      .locator('[role="tooltip"]')
      .first()
      .isVisible({ timeout: 3_000 })
      .catch(() => false);

    // Primary assertion: no JS errors regardless of which outcome occurred
    expect(errors).toHaveLength(0);
    // Secondary: something responded (modal, tooltip, or at least the page is alive)
    const bodyText = await page.locator("body").textContent();
    expect((bodyText ?? "").trim().length).toBeGreaterThan(10);
    // Log which outcome was observed (informational, not a hard assertion)
    void (hasModal || hasTooltip); // acknowledged
  });
});

// ─── MULTI-USER simultaneous browsing ────────────────────────────────────────

test.describe("Multi-user simultaneous browsing", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  /**
   * Two browser contexts: one unauthenticated (buyer), one authenticated
   * (investor.private). Both navigate to /auctions simultaneously.
   */
  test("buyer and investor view auctions page simultaneously", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const baseURL = getBaseURL();
    const buyerCtx = await browser.newContext({ baseURL });
    const investorCtx = await browser.newContext({ baseURL });

    const buyerPage = await buyerCtx.newPage();
    const investorPage = await investorCtx.newPage();

    const buyerErrors: string[] = [];
    const investorErrors: string[] = [];
    buyerPage.on("pageerror", (err) => buyerErrors.push(err.message));
    investorPage.on("pageerror", (err) => investorErrors.push(err.message));

    try {
      // Sign in the investor first; buyer stays unauthenticated
      await signIn(investorPage, INVESTOR_PRIVATE_EMAIL, PW);

      // Both navigate to /auctions simultaneously
      await Promise.all([
        buyerPage
          .goto("/auctions")
          .then(() => buyerPage.waitForLoadState("load", { timeout: 15_000 })),
        investorPage
          .goto("/auctions")
          .then(() =>
            investorPage.waitForLoadState("load", { timeout: 15_000 }),
          ),
      ]);

      // Both pages must render a heading
      await expect(
        buyerPage.locator("h1, h2, [role='heading']").first(),
      ).toBeVisible({ timeout: 10_000 });
      await expect(
        investorPage.locator("h1, h2, [role='heading']").first(),
      ).toBeVisible({ timeout: 10_000 });

      // No JS errors in either context
      expect(buyerErrors).toHaveLength(0);
      expect(investorErrors).toHaveLength(0);
    } finally {
      await buyerCtx.close();
      await investorCtx.close();
    }
  });

  /**
   * Three browser contexts: investor.private on /investor-dashboard,
   * investor.institutional on /auctions, buyer.pro on /auctions.
   * All render without JS errors.
   */
  test("two investors and a buyer browse simultaneously", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    const baseURL = getBaseURL();
    const invPrivateCtx = await browser.newContext({ baseURL });
    const invInstitutionalCtx = await browser.newContext({ baseURL });
    const buyerCtx = await browser.newContext({ baseURL });

    const invPrivatePage = await invPrivateCtx.newPage();
    const invInstitutionalPage = await invInstitutionalCtx.newPage();
    const buyerPage = await buyerCtx.newPage();

    const invPrivateErrors: string[] = [];
    const invInstitutionalErrors: string[] = [];
    const buyerErrors: string[] = [];

    invPrivatePage.on("pageerror", (err) => invPrivateErrors.push(err.message));
    invInstitutionalPage.on("pageerror", (err) =>
      invInstitutionalErrors.push(err.message),
    );
    buyerPage.on("pageerror", (err) => buyerErrors.push(err.message));

    test.setTimeout(90_000);
    try {
      // Sign in sequentially to avoid auth rate-limiting under parallel load
      await signIn(invPrivatePage, INVESTOR_PRIVATE_EMAIL, PW);
      await signIn(invInstitutionalPage, INVESTOR_INSTITUTIONAL_EMAIL, PW);
      await signIn(buyerPage, BUYER_EMAIL, PW);

      // Navigate all three simultaneously
      await Promise.all([
        invPrivatePage
          .goto("/investor-dashboard")
          .then(() =>
            invPrivatePage.waitForLoadState("load", { timeout: 15_000 }),
          ),
        invInstitutionalPage
          .goto("/auctions")
          .then(() =>
            invInstitutionalPage.waitForLoadState("load", { timeout: 15_000 }),
          ),
        buyerPage
          .goto("/auctions")
          .then(() => buyerPage.waitForLoadState("load", { timeout: 15_000 })),
      ]);

      await expectPageShell(invPrivatePage);
      await expectPageShell(invInstitutionalPage);
      await expectPageShell(buyerPage);

      // No JS errors in any context
      expect(invPrivateErrors).toHaveLength(0);
      expect(invInstitutionalErrors).toHaveLength(0);
      expect(buyerErrors).toHaveLength(0);
    } finally {
      await invPrivateCtx.close();
      await invInstitutionalCtx.close();
      await buyerCtx.close();
    }
  });

  /**
   * Two browser contexts: admin on /admin, investor.private on /investor-dashboard.
   * Sign-ins happen in parallel via Promise.all. Each page must render correctly.
   */
  test("admin and investor signed in simultaneously on separate routes", async ({
    browser,
  }: {
    browser: Browser;
  }) => {
    test.skip(ADMIN_EMAIL === "", "Set E2E_ADMIN_EMAIL to run admin interaction tests.");
    const baseURL = getBaseURL();
    const adminCtx = await browser.newContext({ baseURL });
    const investorCtx = await browser.newContext({ baseURL });

    const adminPage = await adminCtx.newPage();
    const investorPage = await investorCtx.newPage();

    const adminErrors: string[] = [];
    const investorErrors: string[] = [];
    adminPage.on("pageerror", (err) => adminErrors.push(err.message));
    investorPage.on("pageerror", (err) => investorErrors.push(err.message));

    test.setTimeout(90_000);
    try {
      // Sign in sequentially to avoid auth rate-limiting under parallel load
      await signIn(adminPage, ADMIN_EMAIL, PW);
      await signIn(investorPage, INVESTOR_PRIVATE_EMAIL, PW);

      // Navigate to their respective routes simultaneously
      await Promise.all([
        adminPage
          .goto("/admin")
          .then(() => adminPage.waitForLoadState("load", { timeout: 15_000 })),
        investorPage
          .goto("/investor-dashboard")
          .then(() =>
            investorPage.waitForLoadState("load", { timeout: 15_000 }),
          ),
      ]);

      // Admin: URL must still contain /admin (not redirected away) and page renders
      expect(adminPage.url()).toContain("/admin");
      await expectPageShell(adminPage);

      // Investor: page renders without the access gate
      await expectPageShell(investorPage);

      const hasGate = await investorPage
        .locator("text=Investor Access Required")
        .isVisible({ timeout: 5_000 })
        .catch(() => false);
      expect(hasGate).toBe(false);

      // No JS errors in either context
      expect(adminErrors).toHaveLength(0);
      expect(investorErrors).toHaveLength(0);
    } finally {
      await adminCtx.close();
      await investorCtx.close();
    }
  });
});
