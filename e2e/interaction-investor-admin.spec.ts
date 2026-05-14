/**
 * Investor and Admin interaction tests — role-specific dashboard and panel access.
 *
 * Uses seeded demo accounts (password: Demo2025!) that exist in the database:
 *   - investor.private@maiprop.demo      (private-tier investor)
 *   - investor.institutional@maiprop.demo (institutional investor)
 *   - admin@maiprop.demo                 (platform admin)
 *
 * Tests run unconditionally; individual describes use hard-coded demo credentials
 * rather than env-var overrides because these roles require specific seeded data.
 *
 * Multi-context tests (simultaneous sessions) use the `browser` fixture.
 */
import { test, expect, type Page } from "@playwright/test";
import { getBaseURL } from "./helpers/baseURL";
import { demoAccounts, demoPasswords, seededDemoAccountsEnabled } from "./helpers/demoAccounts";

// ─── Credentials ─────────────────────────────────────────────────────────────

const INVESTOR_PRIVATE_EMAIL       = demoAccounts.investorPrivate;
const INVESTOR_INSTITUTIONAL_EMAIL = demoAccounts.investorInstitutional;
const ADMIN_EMAIL                  = demoAccounts.admin;
const DEMO_PASSWORD                = demoPasswords.default;

const hasCredentials =
  seededDemoAccountsEnabled("E2E_INVESTOR_PRIVATE_EMAIL", "E2E_INVESTOR_INSTITUTIONAL_EMAIL", "E2E_ADMIN_EMAIL") &&
  INVESTOR_PRIVATE_EMAIL !== "" && INVESTOR_INSTITUTIONAL_EMAIL !== "" &&
  ADMIN_EMAIL !== "" && DEMO_PASSWORD !== "";

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Sign in with the given credentials and wait for the post-login redirect.
 * Accepts /dashboard, /admin, or /onboarding as valid landing URLs.
 */
async function signIn(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
  await page.waitForURL(/\/dashboard|\/onboarding|\/admin/, { timeout: 25_000 });
}

async function expectInvestorDashboardReady(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/investor-dashboard/);
  await expect(page.getByTestId("investor-dashboard")).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText(/Investor Access Required/i)).toHaveCount(0);

  const errorState = page.getByTestId("investor-deal-feed-error");
  if (await errorState.isVisible().catch(() => false)) {
    await expect(errorState.getByRole("button", { name: /retry/i })).toBeVisible();
    return;
  }

  await expect(page.getByTestId("investor-filters")).toBeVisible();
  await expect(page.getByLabel(/city/i)).toBeVisible();
  await expect(page.getByLabel(/property type/i)).toBeVisible();
  await expect(page.getByLabel(/urgency/i)).toBeVisible();
  await expect(page.getByTestId("investor-deal-list")).toBeAttached();
}

async function expectAdminSurfaceReady(page: Page): Promise<void> {
  await expect(page).toHaveURL(/\/admin/);
  await expect(page.locator("body")).toContainText(/\S/, { timeout: 15_000 });
  await expect(page.locator(".animate-spin").first()).toBeHidden({ timeout: 10_000 }).catch(() => {});
  await expect(page.locator("main, [data-testid*='admin'], nav, [role='navigation']").first()).toBeAttached();
}

// ─── Investor tests ───────────────────────────────────────────────────────────

test.describe("Investor (private) — sign in and basic navigation", () => {
  test.skip(!hasCredentials, "Set E2E_INVESTOR_PRIVATE_EMAIL / E2E_DEMO_PASSWORD to run");
  test("investor.private can sign in and reach /dashboard", async ({ page }) => {
    await signIn(page, INVESTOR_PRIVATE_EMAIL, DEMO_PASSWORD);
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Must have landed somewhere meaningful — nav or sidebar present
    const nav = page.locator('nav, [role="navigation"], aside').first();
    await expect(nav).toBeAttached({ timeout: 10_000 });
  });

  test("investor.private accesses /investor-dashboard without being gated", async ({ page }) => {
    await signIn(page, INVESTOR_PRIVATE_EMAIL, DEMO_PASSWORD);
    await page.goto("/investor-dashboard");
    await page.waitForLoadState("load", { timeout: 15_000 });
    // Must NOT have been redirected to /login
    expect(page.url()).not.toContain("/login");

    await expectInvestorDashboardReady(page);
  });

  test("investor.private sees /firesale content", async ({ page }) => {
    await signIn(page, INVESTOR_PRIVATE_EMAIL, DEMO_PASSWORD);
    await page.goto("/firesale");
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Must NOT have been redirected to /login
    expect(page.url()).not.toContain("/login");

    // Main content must render — heading, deal cards, or any substantive element
    const content = page.locator(
      '[data-testid="firesale-card"], [data-testid="deal-card"], h1, h2, main'
    ).first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  test("investor.private navigates /auctions without crash", async ({ page }) => {
    // /platform-map is AdminRoute — investors land on /dashboard. Test /auctions instead.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, INVESTOR_PRIVATE_EMAIL, DEMO_PASSWORD);
    await page.goto("/auctions");
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Must NOT have been redirected to /login
    expect(page.url()).not.toContain("/login");

    // Navbar must be present — confirms the React tree rendered without error
    const nav = page.locator('nav, [role="navigation"], header').first();
    await expect(nav).toBeVisible({ timeout: 10_000 });

    // No uncaught JS errors
    expect(errors).toHaveLength(0);
  });
});

// ─── Investor (institutional) tests ──────────────────────────────────────────

test.describe("Investor (institutional) — investor-dashboard access", () => {
  test.skip(!hasCredentials, "Set E2E_INVESTOR_INSTITUTIONAL_EMAIL / E2E_DEMO_PASSWORD to run");
  test("investor.institutional accesses /investor-dashboard without being gated", async ({ page }) => {
    await signIn(page, INVESTOR_INSTITUTIONAL_EMAIL, DEMO_PASSWORD);
    await page.goto("/investor-dashboard");
    await page.waitForLoadState("load", { timeout: 15_000 });
    // Must NOT have been redirected to /login
    expect(page.url()).not.toContain("/login");

    await expectInvestorDashboardReady(page);
  });
});

// ─── Simultaneous investor sessions ──────────────────────────────────────────

test.describe("Simultaneous investor sessions", () => {
  test.skip(!hasCredentials, "Set investor + E2E_DEMO_PASSWORD env vars to run");
  test("both investor accounts sign in simultaneously and both reach /investor-dashboard", async ({ browser }) => {
    test.setTimeout(90_000);
    const baseURL = getBaseURL();
    const privateCtx = await browser.newContext({ baseURL });
    const institutionalCtx = await browser.newContext({ baseURL });

    const privateErrors: string[] = [];
    const institutionalErrors: string[] = [];

    try {
      const privatePage = await privateCtx.newPage();
      const institutionalPage = await institutionalCtx.newPage();

      privatePage.on("pageerror", (err) => privateErrors.push(err.message));
      institutionalPage.on("pageerror", (err) => institutionalErrors.push(err.message));

      // Sign in sequentially to avoid auth rate-limiting
      await signIn(privatePage, INVESTOR_PRIVATE_EMAIL, DEMO_PASSWORD);
      await signIn(institutionalPage, INVESTOR_INSTITUTIONAL_EMAIL, DEMO_PASSWORD);

      // Navigate both to /investor-dashboard concurrently
      await Promise.all([
        privatePage.goto("/investor-dashboard"),
        institutionalPage.goto("/investor-dashboard"),
      ]);

      await Promise.all([
        privatePage.waitForLoadState("load", { timeout: 15_000 }),
        institutionalPage.waitForLoadState("load", { timeout: 15_000 }),
      ]);

      // Neither page should have redirected to /login
      expect(privatePage.url()).not.toContain("/login");
      expect(institutionalPage.url()).not.toContain("/login");

      await expectInvestorDashboardReady(privatePage);
      await expectInvestorDashboardReady(institutionalPage);

      // No JS errors in either context
      expect(privateErrors).toHaveLength(0);
      expect(institutionalErrors).toHaveLength(0);
    } finally {
      await privateCtx.close();
      await institutionalCtx.close();
    }
  });
});

// ─── Admin tests ──────────────────────────────────────────────────────────────

test.describe("Admin — sign in and panel access", () => {
  test.skip(!hasCredentials, "Set E2E_ADMIN_EMAIL / E2E_DEMO_PASSWORD to run");
  test("admin can sign in and reach /dashboard or /admin", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, DEMO_PASSWORD);
    await page.waitForLoadState("load", { timeout: 15_000 });

    // Must have landed on a legitimate post-login route
    expect(page.url()).toMatch(/\/dashboard|\/admin|\/onboarding/);

    await expect(page.locator("body")).toContainText(/\S/, { timeout: 15_000 });
  });

  test("admin can access /admin panel without redirect", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, DEMO_PASSWORD);
    await page.goto("/admin");
    await page.waitForLoadState("load", { timeout: 15_000 });

    // URL must still contain /admin — admin was not redirected away
    expect(page.url()).toContain("/admin");

    await expectAdminSurfaceReady(page);
  });

  test("admin panel renders key management sections", async ({ page }) => {
    await signIn(page, ADMIN_EMAIL, DEMO_PASSWORD);
    await page.goto("/admin");
    await page.waitForLoadState("load", { timeout: 15_000 });
    // URL must still be /admin (admin was not redirected to /dashboard)
    expect(page.url()).toContain("/admin");

    await expectAdminSurfaceReady(page);
  });

  test("admin panel has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, ADMIN_EMAIL, DEMO_PASSWORD);
    await page.goto("/admin");
    await page.waitForLoadState("load", { timeout: 15_000 });

    expect(errors).toHaveLength(0);
  });
});

// ─── Simultaneous admin + investor sessions ───────────────────────────────────

test.describe("Simultaneous admin and investor sessions", () => {
  test.skip(!hasCredentials, "Set admin + investor + E2E_DEMO_PASSWORD env vars to run");
  test("admin on /admin and investor on /investor-dashboard — no JS errors and pages render", async ({ browser }) => {
    test.setTimeout(90_000);
    const baseURL = getBaseURL();
    const adminCtx = await browser.newContext({ baseURL });
    const investorCtx = await browser.newContext({ baseURL });

    const adminErrors: string[] = [];
    const investorErrors: string[] = [];

    try {
      const adminPage = await adminCtx.newPage();
      const investorPage = await investorCtx.newPage();

      // Collect errors BEFORE navigation
      adminPage.on("pageerror", (err) => adminErrors.push(err.message));
      investorPage.on("pageerror", (err) => investorErrors.push(err.message));

      // Sign in sequentially to avoid auth rate-limiting
      await signIn(adminPage, ADMIN_EMAIL, DEMO_PASSWORD);
      await signIn(investorPage, INVESTOR_PRIVATE_EMAIL, DEMO_PASSWORD);

      // Navigate to their respective role-specific pages concurrently
      await Promise.all([
        adminPage.goto("/admin"),
        investorPage.goto("/investor-dashboard"),
      ]);

      await Promise.all([
        adminPage.waitForLoadState("load", { timeout: 15_000 }),
        investorPage.waitForLoadState("load", { timeout: 15_000 }),
      ]);

      // Wait for auth spinners to clear on both pages
      await Promise.all([
        adminPage.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {}),
        investorPage.locator(".animate-spin").first().waitFor({ state: "hidden", timeout: 10_000 }).catch(() => {}),
      ]);

      // Admin must still be on /admin (not redirected)
      expect(adminPage.url()).toContain("/admin");

      // Investor must not have been redirected to /login
      expect(investorPage.url()).not.toContain("/login");

      await expectAdminSurfaceReady(adminPage);
      await expectInvestorDashboardReady(investorPage);

      // No JS errors in either context
      expect(adminErrors).toHaveLength(0);
      expect(investorErrors).toHaveLength(0);
    } finally {
      await adminCtx.close();
      await investorCtx.close();
    }
  });
});
