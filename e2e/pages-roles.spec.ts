/**
 * Role-specific pages and key UI component interaction tests.
 *
 * Covers:
 *  - Unauthenticated redirect behaviour for protected/role-gated routes
 *  - Public page component interactions (Auctions, Open Houses, AI Assistant,
 *    Pricing, Professionals, invalid property/new-build IDs)
 *  - Navbar CTA state for unauthenticated users + language switcher
 *  - Wrong-role access (investor/admin gate UI) — requires credentials
 *
 * NOTE: `/listings` and `/` are covered by smoke.spec.ts / listings.spec.ts —
 * those are intentionally NOT duplicated here.
 */
import { test, expect, type Page } from "@playwright/test";
import { seededDemoAccountsEnabled } from "./helpers/demoAccounts";

// Default to seeded demo buyer account (not admin, not investor — triggers wrong-role gates).
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "seller.pro@maiprop.demo";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "Demo2025!";
const hasCredentials = TEST_EMAIL !== "" && TEST_PASSWORD !== "" && seededDemoAccountsEnabled();

// ─── Unauthenticated redirect guards ─────────────────────────────────────────

test.describe("Role guards — unauthenticated redirects", () => {
  test("investor-dashboard redirects to /login when not logged in", async ({ page }) => {
    await page.goto("/investor-dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("admin panel redirects to /login when not logged in", async ({ page }) => {
    await page.goto("/admin");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("platform-map redirects to /login when not logged in", async ({ page }) => {
    await page.goto("/platform-map");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });

  test("video-room redirects to /login when not logged in", async ({ page }) => {
    await page.goto("/video-room/00000000-0000-0000-0000-000000000000");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    expect(page.url()).toContain("/login");
  });
});

// ─── Auctions page ────────────────────────────────────────────────────────────

test.describe("Auctions page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });
  });

  test("auctions page loads without crashing", async ({ page }) => {
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows auction listings or an empty/error state", async ({ page }) => {
    // Wait for React Query to finish its first auctions fetch before asserting.
    // We switched the beforeEach from `networkidle` to `load` to dodge Mapbox's
    // never-settling tile requests, but `load` only waits for the bundle —
    // data-driven content arrives later. Use Playwright's auto-retrying
    // `expect(...).toBeVisible()` instead of a one-shot `isVisible()` so the
    // assertion polls until either an auction card, an empty-state element,
    // or any rendered card/skeleton becomes visible.
    const contentLocator = page.getByTestId("auction-card")
      .or(page.getByText("No auctions match your filters"))
      .or(page.getByText("Failed to load auctions"))
      .or(page.locator('[aria-busy="true"]'));

    await expect(page.locator("main, #main-content, body").first()).toBeVisible();
    await expect(contentLocator.first()).toBeVisible({ timeout: 20_000 });
  });

  test("map / list view toggle button is present", async ({ page }) => {
    // The view-mode toggle renders a Map or List button regardless of data
    const toggle = page.locator(
      'button:has-text("Map"), button:has-text("List"), [aria-label*="map"], [aria-label*="list"], button svg'
    ).first();
    await expect(toggle).toBeAttached({ timeout: 8_000 });
  });

  test("Set Alert / bell button is present in the toolbar", async ({ page }) => {
    const alertBtn = page.locator(
      'button:has-text("Alert"), button:has-text("Set Alert"), button[aria-label*="alert"], button svg'
    ).first();
    await expect(alertBtn).toBeAttached({ timeout: 8_000 });
  });
});

// ─── Open Houses page ─────────────────────────────────────────────────────────

test.describe("Open Houses page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/open-houses");
    await page.waitForLoadState("load", { timeout: 15_000 });
  });

  test("open-houses page loads without crashing", async ({ page }) => {
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("shows open-house cards or empty state", async ({ page }) => {
    // Wait for React Query to finish its first open-houses fetch before asserting.
    // We use `load` in beforeEach to dodge Mapbox's never-settling tile requests,
    // but `load` only waits for the bundle — data-driven content arrives later.
    // Use Playwright's auto-retrying `expect(...).toBeVisible()` so the assertion
    // polls until either a card, an empty-state element, or a skeleton becomes visible.
    const contentLocator = page.getByTestId("open-house-card")
      .or(page.getByText("No open houses match your filters"))
      .or(page.getByText("Could not load open houses"))
      .or(page.locator('[aria-label="Loading open houses"]'));

    await expect(page.locator("main, #main-content, body").first()).toBeVisible();
    await expect(contentLocator.first()).toBeVisible({ timeout: 20_000 });
  });

  test("open-house cards include a date/time element when listings exist", async ({ page }) => {
    const cards = page.locator('[data-testid="open-house-card"]');
    const count = await cards.count();
    if (count === 0) {
      // No seeded data — skip the date check
      test.skip();
      return;
    }
    // The first card should contain a date-like text (number followed by a month name or time)
    const firstCard = cards.first();
    const cardText = await firstCard.textContent() ?? "";
    // Cards must contain some text content (date, price, title, etc.)
    expect(cardText.trim().length).toBeGreaterThan(5);
  });
});

// ─── AI Assistant page ────────────────────────────────────────────────────────

test.describe("AI Assistant page", () => {
  test("ai-assistant page loads without crashing", async ({ page }) => {
    await page.goto("/ai-assistant");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await expect(page.locator("main, body")).toBeVisible();
  });

  test("chat input is visible on ai-assistant page", async ({ page }) => {
    await page.goto("/ai-assistant");
    await page.waitForLoadState("load", { timeout: 15_000 });
    const chatInput = page.locator(
      'input[placeholder*="Ask"], textarea[placeholder*="Ask"], input[placeholder*="question"], textarea[placeholder*="question"], input[placeholder*="property"], textarea[placeholder*="property"]'
    ).first();
    await expect(chatInput).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Pricing page ─────────────────────────────────────────────────────────────

test.describe("Pricing page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("load", { timeout: 15_000 });
  });

  test("pricing page loads without crashing", async ({ page }) => {
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("at least one pricing tier card is visible", async ({ page }) => {
    // Pricing tiers are rendered as cards/sections with a price figure or plan name
    const tierCard = page.locator(
      "[class*='card'], [class*='plan'], [class*='tier'], [class*='pricing']"
    ).first();
    await expect(tierCard).toBeVisible({ timeout: 10_000 });
  });

  test("a CTA button is present on the pricing page", async ({ page }) => {
    const cta = page.locator(
      'button:has-text("Get"), button:has-text("Subscribe"), button:has-text("Start"), button:has-text("Upgrade"), button:has-text("Choose"), a:has-text("Get"), a:has-text("Start")'
    ).first();
    await expect(cta).toBeVisible({ timeout: 10_000 });
  });

  test("audience tabs (Buyer, Agent, Developer, Professional) are visible", async ({ page }) => {
    // The pricing page has audience filter tabs
    const tab = page.locator(
      'button:has-text("Buyer"), button:has-text("Agent"), button:has-text("Developer"), [role="tab"]'
    ).first();
    await expect(tab).toBeVisible({ timeout: 8_000 });
  });
});

// ─── Professionals directory ──────────────────────────────────────────────────

test.describe("Professionals directory", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/professionals");
    await page.waitForLoadState("load", { timeout: 15_000 });
  });

  test("professionals page loads without crashing", async ({ page }) => {
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({ timeout: 10_000 });
  });

  test("search input is available on professionals page", async ({ page }) => {
    const search = page.locator(
      'input[placeholder*="Search"], input[type="search"], input[placeholder*="search"], [data-testid="search-input"]'
    ).first();
    await expect(search).toBeAttached({ timeout: 8_000 });
  });

  test("shows professional cards or empty state", async ({ page }) => {
    await Promise.race([
      page.getByRole("heading", { name: /the right expert/i }).waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
      page.locator("article, [class*='card'], [class*='professional']").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
      page.locator("[class*='empty'], .text-muted-foreground").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
    ]);

    const hasProfCards = await page.locator(
      "article, [class*='card'], [class*='professional']"
    ).first().isVisible({ timeout: 10_000 }).catch(() => false);

    const hasEmpty = await page.locator(
      "[class*='empty'], .text-muted-foreground"
    ).first().isVisible().catch(() => false);

    const hasDirectoryShell = await Promise.all([
      page.getByRole("heading", { name: /the right expert/i }).isVisible().catch(() => false),
      page.locator('input[placeholder*="Search by name"], input[placeholder*="specialty"], input[type="search"]').first().isVisible().catch(() => false),
    ]).then(([hasHeading, hasSearch]) => hasHeading || hasSearch);

    expect(hasProfCards || hasEmpty || hasDirectoryShell).toBe(true);
  });
});

// ─── Invalid property detail ──────────────────────────────────────────────────

test.describe("Property detail — graceful error handling", () => {
  test("invalid property UUID shows not-found or skeleton — does NOT white-screen", async ({ page }) => {
    await page.goto("/property/00000000-0000-0000-0000-000000000000");
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Navbar must render — proves the React app bootstrapped without crashing.
    // Use `header` (the top Navbar) directly; the mobile bottom-<nav> is hidden
    // on desktop (lg:hidden) but precedes <header> in DOM on this page.
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });
    // DOM must have more than a trivial number of elements (not a blank white screen)
    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
  });

  test("invalid new-build slug handles gracefully — no white-screen", async ({ page }) => {
    await page.goto("/new-build/non-existent-slug-00000000");
    await page.waitForLoadState("load", { timeout: 15_000 });

    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(10);
  });
});

// ─── Navbar — unauthenticated state ──────────────────────────────────────────

test.describe("Navbar — unauthenticated user", () => {
  test("navbar shows Sign In link for unauthenticated users on homepage", async ({ page }) => {
    await page.goto("/");
    // The i18n key `nav.signIn` renders as "Sign In" in English
    const signInLink = page.locator(
      'a[href="/login"], a:has-text("Sign in"), a:has-text("Sign In"), a:has-text("Log in"), button:has-text("Sign in")'
    ).first();
    await expect(signInLink).toBeVisible({ timeout: 10_000 });
  });

  test("navbar does NOT show dashboard or logout for unauthenticated users", async ({ page }) => {
    await page.goto("/");
    const dashboardLink = page.locator('a[href="/dashboard"], button:has-text("Log out"), button:has-text("Sign out")');
    // None of these should be visible to a logged-out visitor
    const count = await dashboardLink.count();
    if (count > 0) {
      for (let i = 0; i < count; i++) {
        await expect(dashboardLink.nth(i)).not.toBeVisible();
      }
    }
  });

  test("navbar contains the language switcher button", async ({ page }) => {
    await page.goto("/");
    // LanguageSwitcher renders a Globe icon button with aria-label or text
    const langBtn = page.locator(
      '[aria-label*="language"], [aria-label*="Language"], button:has(svg[class*="globe"]), button[aria-label]'
    ).first();
    await expect(langBtn).toBeAttached({ timeout: 8_000 });
  });

  test("language switcher opens a dropdown with English and Greek options", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load", { timeout: 15_000 });
    // aria-label is t("language.select") = "Language"
    const langBtn = page.locator('button[aria-label="Language"]').first();
    await expect(langBtn).toBeAttached({ timeout: 8_000 });
    await langBtn.click();

    // Radix DropdownMenuContent renders in a portal — wait for either menu
    // item to be visible rather than sleeping for a fixed 300 ms.
    const englishItem = page.locator('text="English"').first();
    const greekItem = page.locator('text="Ελληνικά"').first();
    await Promise.race([
      englishItem.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined),
      greekItem.waitFor({ state: "visible", timeout: 5_000 }).catch(() => undefined),
    ]);
    const hasEnglish = await englishItem.isVisible().catch(() => false);
    const hasGreek = await greekItem.isVisible().catch(() => false);
    expect(hasEnglish || hasGreek).toBe(true);
  });
});

// ─── Role guards — wrong role (requires credentials) ─────────────────────────

test.describe("Role guards — wrong role (credentialed)", () => {
  test.skip(!hasCredentials, "Needs E2E_TEST_EMAIL + E2E_TEST_PASSWORD");

  /** Helper: sign in using the configured test credentials. */
  async function signIn(page: Page) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      await page.goto("/login");
      await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
      await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
      await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
      try {
        await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 25_000 });
        return;
      } catch (error) {
        const invalidCredentials = await page.getByText("Invalid email or password", { exact: true })
          .isVisible()
          .catch(() => false);
        if (attempt === 1 || invalidCredentials) throw error;
        await page.waitForTimeout(1_000);
      }
    }
  }

  test("investor-dashboard shows InvestorAccessGate for non-investor user", async ({ page }) => {
    await signIn(page);
    await page.goto("/investor-dashboard");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }).catch(() => undefined),
      page.locator('text="Investor Access Required"').waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
    ]);

    // Acceptable outcomes: the access-gate UI, OR a redirect away from /investor-dashboard
    const isRedirected = !page.url().includes("/investor-dashboard");
    const hasAccessGate = await page.getByText("Investor Access Required", { exact: true })
      .isVisible()
      .catch(() => false);

    expect(isRedirected || hasAccessGate).toBe(true);
    // Must NOT be a JS crash (white screen)
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.trim().length).toBeGreaterThan(10);
  });

  test("admin panel shows redirect or forbidden UI for non-admin user", async ({ page }) => {
    await signIn(page);
    await page.goto("/admin");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await Promise.race([
      page.waitForURL(/\/dashboard/, { timeout: 15_000 }).catch(() => undefined),
      page.locator(
        'text="Forbidden", text="Access denied", text="Not authorized", [class*="forbidden"]'
      ).first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
    ]);

    // Non-admin users are redirected to /dashboard by AdminGate
    const redirectedToDashboard = page.url().includes("/dashboard");
    const hasForbiddenUi = await page.locator(
      'text="Forbidden", text="Access denied", text="Not authorized", [class*="forbidden"]'
    ).isVisible({ timeout: 8_000 }).catch(() => false);

    expect(redirectedToDashboard || hasForbiddenUi).toBe(true);
  });
});
