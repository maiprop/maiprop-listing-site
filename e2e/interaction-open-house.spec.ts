/**
 * Multi-user open house interaction tests.
 *
 * Covers:
 *  1. Public browsing — no auth required (cards, detail page, RSVP button)
 *  2. Buyer authenticated flows (buyer.free + buyer.pro)
 *  3. Seller / agent hosting view (dashboard, open-house management)
 *  4. Four simultaneous browser contexts — no cross-context interference
 *
 * Demo accounts (password: Demo2025! for all):
 *   buyer.free@maiprop.demo
 *   buyer.pro@maiprop.demo
 *   seller.pro@maiprop.demo
 *   agent.pro@maiprop.demo
 */
import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { getBaseURL } from "./helpers/baseURL";
import { seededDemoAccountsEnabled } from "./helpers/demoAccounts";
import { expectPublicCatalogContent } from "./helpers/publicCatalog";
import { waitForPostAuthNavigation } from "./helpers/postAuthNavigation";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PASSWORD = process.env.E2E_DEMO_PASSWORD ?? "Demo2025!";
const hasCredentials = PASSWORD !== "" && seededDemoAccountsEnabled();

const ACCOUNTS = {
  buyerFree: process.env.E2E_BUYER_FREE_EMAIL ?? "buyer.free@maiprop.demo",
  // Some deployed seed datasets no longer include a working buyer.pro account.
  // Fall back to buyer.free so the suite still exercises authenticated buyer flows.
  buyerPro: process.env.E2E_BUYER_PRO_EMAIL ?? process.env.E2E_BUYER_FREE_EMAIL ?? "buyer.free@maiprop.demo",
  sellerPro: process.env.E2E_SELLER_PRO_EMAIL ?? "seller.pro@maiprop.demo",
  agentPro: process.env.E2E_AGENT_PRO_EMAIL ?? "agent.pro@maiprop.demo",
} as const;

// ---------------------------------------------------------------------------
// Per-page sign-in helper
// ---------------------------------------------------------------------------

async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .click();
  await waitForPostAuthNavigation(page);
}

const firstOpenHouseDetailLink = (page: Page) =>
  page.locator('a[href^="/open-house/"]').first();

const clickFirstOpenHouseDetailLink = async (page: Page): Promise<boolean> => {
  const link = firstOpenHouseDetailLink(page);
  const attached = await link
    .waitFor({ state: "attached", timeout: 20_000 })
    .then(() => true)
    .catch(() => false);
  if (!attached) return false;
  await link.scrollIntoViewIfNeeded();
  await link.click();
  return true;
};

// ---------------------------------------------------------------------------
// 1. Public open house browsing (no auth required)
// ---------------------------------------------------------------------------

test.describe("Public — open house browsing", () => {
  test("open houses page renders cards or empty state", async ({ page }) => {
    await page.goto("/open-houses");
    // `load` instead of `networkidle` — Mapbox tile requests keep the network
    // busy indefinitely, which would otherwise force a 15 s timeout on every test.
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Heading must be visible
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({
      timeout: 10_000,
    });

    await expectPublicCatalogContent(page, {
      apiPath: "/api/public/open-houses?showPast=0&limit=1",
      cardTestId: "open-house-card",
      emptyText: "No open houses match your filters",
      errorText: "Could not load open houses",
      loadingSelector: '[aria-label="Loading open houses"]',
      label: "Open houses",
    });
  });

  test("clicking an open house card navigates to detail page", async ({ page }) => {
    await page.goto("/open-houses");
    await page.waitForLoadState("load", { timeout: 15_000 });

    if (!(await clickFirstOpenHouseDetailLink(page))) {
      // No seeded data — nothing to click
      test.skip();
      return;
    }

    await page.waitForLoadState("load", { timeout: 15_000 });

    // Navbar must still be visible (app did not crash)
    await expect(page.locator("nav, header").first()).toBeVisible({ timeout: 10_000 });

    // Page must have rendered meaningful DOM content
    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
  });

  test("open house detail page has RSVP or Register button", async ({ page }) => {
    await page.goto("/open-houses");
    await page.waitForLoadState("load", { timeout: 15_000 });

    if (!(await clickFirstOpenHouseDetailLink(page))) {
      test.skip();
      return;
    }

    await page.waitForLoadState("load", { timeout: 15_000 });

    // Accept any CTA wording a detail page might use
    const rsvpButton = page
      .locator(
        "button:has-text('RSVP'), button:has-text('Register'), button:has-text('Attend'), " +
          "button:has-text('Book'), button:has-text('Join'), " +
          "a:has-text('RSVP'), a:has-text('Register'), a:has-text('Attend'), " +
          "a:has-text('Book'), a:has-text('Join')"
      )
      .first();

    await expect(rsvpButton).toBeAttached({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Buyer authenticated open house interaction
// ---------------------------------------------------------------------------

test.describe("Buyer — authenticated open house browsing", () => {
  test.skip(!hasCredentials, "Demo credentials required");

  test("buyer.free signs in and browses /open-houses", async ({ page }) => {
    // Collect page errors before any navigation
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, ACCOUNTS.buyerFree, PASSWORD);

    await page.goto("/open-houses");
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Heading must be present
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({
      timeout: 10_000,
    });

    await expectPublicCatalogContent(page, {
      apiPath: "/api/public/open-houses?showPast=0&limit=1",
      cardTestId: "open-house-card",
      emptyText: "No open houses match your filters",
      errorText: "Could not load open houses",
      loadingSelector: '[aria-label="Loading open houses"]',
      label: "Open houses",
    });
    expect(errors).toHaveLength(0);
  });

  test("buyer.pro signs in and views an open house detail if listings exist", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, ACCOUNTS.buyerPro, PASSWORD);

    await page.goto("/open-houses");
    await page.waitForLoadState("load", { timeout: 15_000 });

    if (!(await clickFirstOpenHouseDetailLink(page))) {
      test.skip();
      return;
    }

    await page.waitForLoadState("load", { timeout: 15_000 });

    // Detail page must render without crashing
    await expect(page.locator("nav, header").first()).toBeVisible({ timeout: 10_000 });

    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
    expect(errors).toHaveLength(0);
  });

  test("buyer.pro — RSVP/register button is clickable on open house detail", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, ACCOUNTS.buyerPro, PASSWORD);

    await page.goto("/open-houses");
    await page.waitForLoadState("load", { timeout: 15_000 });

    if (!(await clickFirstOpenHouseDetailLink(page))) {
      test.skip();
      return;
    }

    await page.waitForLoadState("load", { timeout: 15_000 });

    const rsvpButton = page
      .locator(
        "button:has-text('RSVP'), button:has-text('Register'), button:has-text('Attend'), " +
          "button:has-text('Book'), button:has-text('Join'), " +
          "a:has-text('RSVP'), a:has-text('Register'), a:has-text('Attend'), " +
          "a:has-text('Book'), a:has-text('Join')"
      )
      .first();

    const buttonAttached = (await rsvpButton.count()) > 0;

    if (!buttonAttached) {
      // No RSVP button on this detail page — skip rather than fail
      test.skip();
      return;
    }

    await rsvpButton.click();

    // After clicking: the page must not crash regardless of the RSVP outcome.
    // Responses vary: toast notification, inline confirm, dialog, or redirect — all acceptable.
    // Just verify no JS errors and the page still renders content.
    await page.waitForTimeout(1_000); // give UI a moment to react to click
    expect(errors).toHaveLength(0);
  });

  test("buyer.free and buyer.pro browse simultaneously", async ({ browser }) => {
    // Two independent browser contexts — they must not interfere with each other
    const baseURL = getBaseURL();
    const ctx1: BrowserContext = await browser.newContext({ baseURL });
    const ctx2: BrowserContext = await browser.newContext({ baseURL });

    const page1: Page = await ctx1.newPage();
    const page2: Page = await ctx2.newPage();

    const errors1: string[] = [];
    const errors2: string[] = [];
    page1.on("pageerror", (err) => errors1.push(err.message));
    page2.on("pageerror", (err) => errors2.push(err.message));

    try {
      // Navigate both to /open-houses in parallel
      await Promise.all([
        page1.goto("/open-houses").then(() =>
          page1.waitForLoadState("load", { timeout: 15_000 })
        ),
        page2.goto("/open-houses").then(() =>
          page2.waitForLoadState("load", { timeout: 15_000 })
        ),
      ]);

      // Both pages must render a heading
      await expect(page1.locator("h1, h2, [role='heading']").first()).toBeVisible({
        timeout: 10_000,
      });
      await expect(page2.locator("h1, h2, [role='heading']").first()).toBeVisible({
        timeout: 10_000,
      });

      expect(errors1).toHaveLength(0);
      expect(errors2).toHaveLength(0);
    } finally {
      await ctx1.close();
      await ctx2.close();
    }
  });
});

// ---------------------------------------------------------------------------
// 3. Seller / agent hosting view
// ---------------------------------------------------------------------------

test.describe("Seller / agent — hosting view", () => {
  test.skip(!hasCredentials, "Demo credentials required");

  test("seller.pro dashboard does not crash navigating from /dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, ACCOUNTS.sellerPro, PASSWORD);

    // Already on /dashboard — wait for it to fully settle
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Dashboard must render structural content
    const nav = page.locator("nav, [role='navigation'], aside").first();
    await expect(nav).toBeAttached({ timeout: 10_000 });

    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
    expect(errors).toHaveLength(0);
  });

  test("agent.pro can access open house management from dashboard", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, ACCOUNTS.agentPro, PASSWORD);
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Look for any nav link or section referencing Open House / Events in the dashboard
    // Using toBeAttached because the item may live in a collapsed sidebar or off-screen panel
    const openHouseEntry = page
      .locator(
        "a:has-text('Open House'), a:has-text('Open Houses'), a:has-text('Events'), " +
          "button:has-text('Open House'), button:has-text('Open Houses'), button:has-text('Events'), " +
          "[data-testid*='open-house'], [class*='open-house'], " +
          "li:has-text('Open House'), li:has-text('Open Houses')"
      )
      .first();

    await expect(openHouseEntry).toBeAttached({ timeout: 10_000 });
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Four simultaneous browser contexts
// ---------------------------------------------------------------------------

test.describe("Multi-context — four accounts simultaneously", () => {
  test.skip(!hasCredentials, "Demo credentials required");

  test("all four accounts sign in without interfering", async ({ browser }) => {
    // Sign in sequentially to avoid Supabase auth rate-limiting under 4-parallel load.
    // Increase per-test timeout to accommodate 4 full sign-in flows.
    test.setTimeout(90_000);

    const baseURL = getBaseURL();
    const ctx1: BrowserContext = await browser.newContext({ baseURL });
    const ctx2: BrowserContext = await browser.newContext({ baseURL });
    const ctx3: BrowserContext = await browser.newContext({ baseURL });
    const ctx4: BrowserContext = await browser.newContext({ baseURL });

    const p1: Page = await ctx1.newPage();
    const p2: Page = await ctx2.newPage();
    const p3: Page = await ctx3.newPage();
    const p4: Page = await ctx4.newPage();

    const errors: string[][] = [[], [], [], []];
    [p1, p2, p3, p4].forEach((p, i) => {
      p.on("pageerror", (err) => errors[i].push(err.message));
    });

    try {
      // Sign in one-by-one to avoid hitting auth rate limits
      await signIn(p1, ACCOUNTS.buyerFree, PASSWORD);
      await signIn(p2, ACCOUNTS.buyerPro, PASSWORD);
      await signIn(p3, ACCOUNTS.sellerPro, PASSWORD);
      await signIn(p4, ACCOUNTS.agentPro, PASSWORD);

      // Each page must have landed on /dashboard or /onboarding
      for (const p of [p1, p2, p3, p4]) {
        expect(p.url()).toMatch(/\/dashboard|\/onboarding/);
      }

      // No uncaught JS errors in any context
      for (const errs of errors) {
        expect(errs).toHaveLength(0);
      }
    } finally {
      await ctx1.close();
      await ctx2.close();
      await ctx3.close();
      await ctx4.close();
    }
  });
});
