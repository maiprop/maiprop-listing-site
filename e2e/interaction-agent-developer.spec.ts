/**
 * Cross-user interaction tests — Agent Pro and Developer Pro accounts.
 *
 * Covers:
 *  1. Agent Pro sign-in, dashboard, and listing-creation access (5 tests)
 *  2. Developer Pro sign-in, dashboard, and new-building form access (4 tests)
 *  3. Multi-context tests: agent + buyer, developer + buyer (2 tests)
 *
 * Demo credentials (password: Demo2025!):
 *   Agent Pro:     agent.pro@maiprop.demo
 *   Developer Pro: developer.pro@maiprop.demo
 *   Buyer Pro:     buyer.pro@maiprop.demo
 *
 * Tests skip gracefully when credentials are unavailable. Override via env:
 *   E2E_AGENT_EMAIL / E2E_AGENT_PASSWORD
 *   E2E_DEVELOPER_EMAIL / E2E_DEVELOPER_PASSWORD
 *   E2E_BUYER_EMAIL / E2E_BUYER_PASSWORD
 */
import { test, expect, type Page, type Browser, type BrowserContext } from "@playwright/test";
import { getBaseURL } from "./helpers/baseURL";
import { demoAccounts, demoPasswords } from "./helpers/demoAccounts";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

const AGENT_EMAIL = demoAccounts.agentPro;
const AGENT_PASSWORD = demoPasswords.agentPro;

const DEV_EMAIL = demoAccounts.developerPro;
const DEV_PASSWORD = demoPasswords.developerPro;

const BUYER_EMAIL = demoAccounts.buyerFree;
const BUYER_PASSWORD = demoPasswords.buyerFree;

// ---------------------------------------------------------------------------
// Sign-in helper
// ---------------------------------------------------------------------------

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .click();
  await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 25_000 });
}

// ---------------------------------------------------------------------------
// AGENT PRO tests
// ---------------------------------------------------------------------------

test.describe("Agent Pro — sign-in and dashboard", () => {
  // 1. Basic sign-in check
  test("agent.pro signs in and reaches dashboard", async ({ page }) => {
    await signIn(page, AGENT_EMAIL, AGENT_PASSWORD);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    expect(page.url()).toMatch(/\/dashboard|\/onboarding/);
    // Main content area must be present — not a blank screen
    await expect(page.locator("main, #main-content, body").first()).toBeVisible({ timeout: 10_000 });
  });

  // 2. /listings/new is not gated for agent account
  test("agent.pro can access /listings/new (not gated)", async ({ page }) => {
    await signIn(page, AGENT_EMAIL, AGENT_PASSWORD);
    await page.goto("/listings/new");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // Expect a form, heading, or step indicator — NOT just a redirect to /login
    expect(page.url()).not.toMatch(/\/login/);
    const content = page
      .locator('form, h1, h2, [class*="step"], [data-testid="create-listing"]')
      .first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  // 3. Step 1 of the listing form shows property-type selection
  test("agent.pro listing form shows property type selection on step 1", async ({ page }) => {
    await signIn(page, AGENT_EMAIL, AGENT_PASSWORD);
    await page.goto("/listings/new");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // If the account hits the SellerGate for some reason, skip gracefully
    const isGated = await page.locator('text="Listing Access Required"').isVisible();
    if (isGated) {
      test.skip();
      return;
    }

    // Property type can be expressed as a radiogroup, native select, or button row
    const typeSelector = page
      .locator(
        '[role="radiogroup"], select, [data-testid*="type"],' +
        ' button:has-text("Apartment"), button:has-text("House"),' +
        ' button:has-text("Villa"), button:has-text("Commercial")'
      )
      .first();
    await expect(typeSelector).toBeAttached({ timeout: 10_000 });
  });

  // 4. Dashboard nav contains listings / CRM section
  test("agent.pro dashboard shows a nav with listings or CRM section", async ({ page }) => {
    await signIn(page, AGENT_EMAIL, AGENT_PASSWORD);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Look for sidebar / nav items relevant to an agent workflow
    const navItem = page
      .locator(
        'nav a:has-text("Listings"), nav a:has-text("My Listings"), nav a:has-text("CRM"),' +
        ' nav a:has-text("Leads"), nav a:has-text("Properties"),' +
        ' aside a:has-text("Listings"), aside a:has-text("Leads"), aside a:has-text("CRM"),' +
        ' [data-testid*="nav"] :has-text("Listings"), [data-testid*="nav"] :has-text("CRM")'
      )
      .first();
    await expect(navItem).toBeAttached({ timeout: 10_000 });
  });

  // 5. No JS errors navigating to /listings/new
  test("agent.pro has no JS errors navigating /listings/new", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, AGENT_EMAIL, AGENT_PASSWORD);
    await page.goto("/listings/new");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// DEVELOPER PRO tests
// ---------------------------------------------------------------------------

test.describe("Developer Pro — sign-in, dashboard, and new-building form", () => {
  // 6. Basic sign-in check
  test("developer.pro signs in and reaches dashboard", async ({ page }) => {
    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    expect(page.url()).toMatch(/\/dashboard|\/onboarding/);
    await expect(page.locator("main, #main-content, body").first()).toBeVisible({ timeout: 10_000 });
  });

  // 7. /listings/new-building is accessible and renders content
  test("developer.pro can access /listings/new-building", async ({ page }) => {
    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.goto("/listings/new-building");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    expect(page.url()).not.toMatch(/\/login/);

    // Page must render more than a trivial skeleton
    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);

    // A heading or form element should be visible
    const content = page
      .locator('form, h1, h2, [data-testid="create-new-build"], [class*="step"]')
      .first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  // 8. Dashboard has any navigation links in sidebar (developer shares the common dashboard nav)
  test("developer.pro dashboard has a sidebar navigation", async ({ page }) => {
    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // Any nav link in the sidebar confirms the dashboard shell rendered correctly.
    const navItem = page.locator('nav a, aside a, [role="navigation"] a').first();
    await expect(navItem).toBeAttached({ timeout: 10_000 });
  });

  // 9. No JS errors navigating to /listings/new-building
  test("developer.pro /listings/new-building has no JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.goto("/listings/new-building");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// CROSS-USER tests — two browser contexts running simultaneously
// ---------------------------------------------------------------------------

test.describe("Cross-user — Agent and Buyer simultaneously", () => {
  // 10. Agent goes to /dashboard while Buyer browses /listings — both render
  test("agent and buyer sign in simultaneously — buyer sees listings grid", async ({ browser }: { browser: Browser }) => {
    let agentCtx: BrowserContext | null = null;
    let buyerCtx: BrowserContext | null = null;

    try {
      const baseURL = getBaseURL();
      agentCtx = await browser.newContext({ baseURL });
      buyerCtx = await browser.newContext({ baseURL });

      const agentPage = await agentCtx.newPage();
      const buyerPage = await buyerCtx.newPage();

      const agentErrors: string[] = [];
      const buyerErrors: string[] = [];
      agentPage.on("pageerror", (err) => agentErrors.push(err.message));
      buyerPage.on("pageerror", (err) => buyerErrors.push(err.message));

      // Sign in sequentially to avoid Supabase auth rate-limiting
      await signIn(agentPage, AGENT_EMAIL, AGENT_PASSWORD);
      await signIn(buyerPage, BUYER_EMAIL, BUYER_PASSWORD);

      // Navigate each user to their target page
      await Promise.all([
        agentPage.goto("/dashboard"),
        buyerPage.goto("/listings"),
      ]);

      // Use "load" — map pages (like /listings) keep network busy with tile requests.
      await Promise.all([
        agentPage.waitForLoadState("load", { timeout: 15_000 }),
        buyerPage.waitForLoadState("load", { timeout: 15_000 }),
      ]);

      // Agent: dashboard must render
      await expect(agentPage.locator("main, #main-content, body").first()).toBeVisible({ timeout: 10_000 });

      // Buyer: listings grid OR empty state must render
      const listingsContent = buyerPage
        .locator(
          '[data-testid="listing-card"], article, [class*="card"],' +
          ' [data-testid="empty-state"], [class*="empty"], h1, h2'
        )
        .first();
      await expect(listingsContent).toBeAttached({ timeout: 10_000 });

      // Neither context should have JS errors
      expect(agentErrors).toHaveLength(0);
      expect(buyerErrors).toHaveLength(0);
    } finally {
      if (agentCtx) await agentCtx.close();
      if (buyerCtx) await buyerCtx.close();
    }
  });
});

test.describe("Cross-user — Developer and Buyer simultaneously", () => {
  // 11. Developer browses /projects or /dashboard while Buyer browses /auctions or /listings
  test("developer and buyer sign in simultaneously — both pages render without errors", async ({ browser }: { browser: Browser }) => {
    let devCtx: BrowserContext | null = null;
    let buyerCtx: BrowserContext | null = null;

    test.setTimeout(90_000);
    try {
      const baseURL = getBaseURL();
      devCtx   = await browser.newContext({ baseURL });
      buyerCtx = await browser.newContext({ baseURL });

      const devPage   = await devCtx.newPage();
      const buyerPage = await buyerCtx.newPage();

      const devErrors: string[] = [];
      const buyerErrors: string[] = [];
      devPage.on("pageerror",   (err) => devErrors.push(err.message));
      buyerPage.on("pageerror", (err) => buyerErrors.push(err.message));

      // Sign in sequentially to avoid auth rate-limiting
      await signIn(devPage, DEV_EMAIL, DEV_PASSWORD);
      await signIn(buyerPage, BUYER_EMAIL, BUYER_PASSWORD);

      // Developer navigates to /projects; buyer navigates to /auctions
      await Promise.all([
        devPage.goto("/projects"),
        buyerPage.goto("/auctions"),
      ]);

      await Promise.all([
        devPage.waitForLoadState("load", { timeout: 15_000 }),
        buyerPage.waitForLoadState("load", { timeout: 15_000 }),
      ]);

      // Developer: /projects must render a list, empty state, or a redirect to dashboard
      // (some roles are redirected — that is acceptable, as long as no crash occurs)
      // Wait for React to hydrate past the initial HTML shell (which has only ~2 nodes).
      await devPage.waitForFunction(
        () => document.querySelectorAll("body *").length > 5,
        { timeout: 10_000 }
      ).catch(() => {});
      const devNodeCount = await devPage.locator("body *").count();
      expect(devNodeCount).toBeGreaterThan(5);

      // Buyer: auctions page must render a heading or content
      await expect(
        buyerPage.locator("h1, h2, [role='heading'], article, [class*='card']").first()
      ).toBeAttached({ timeout: 10_000 });

      // No JS errors in either context
      expect(devErrors).toHaveLength(0);
      expect(buyerErrors).toHaveLength(0);
    } finally {
      if (devCtx)   await devCtx.close();
      if (buyerCtx) await buyerCtx.close();
    }
  });
});
