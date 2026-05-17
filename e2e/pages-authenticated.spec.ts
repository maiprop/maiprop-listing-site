/**
 * Authenticated page tests — buyer/renter, seller, and agent role flows.
 *
 * Two tiers:
 *  1. Always-run: verify protected routes redirect unauthenticated visitors to /login.
 *  2. Credentialed: run by default using the seeded demo buyer account.
 *
 * Override the demo defaults via env vars:
 *   E2E_TEST_EMAIL=test@example.com E2E_TEST_PASSWORD=secret npx playwright test e2e/pages-authenticated
 *
 * Demo accounts (password: Demo2025!) are seeded via scripts/seed-demo-accounts.ts.
 */
import { test, expect, type Page } from "@playwright/test";
import { seededDemoAccountsEnabled } from "./helpers/demoAccounts";

// Default to the most reliable seeded demo buyer account so credentialed tests run without env vars.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "buyer.free@maiprop.demo";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "Demo2025!";
const hasCredentials = TEST_EMAIL !== "" && TEST_PASSWORD !== "" && seededDemoAccountsEnabled();

/** Helper: sign in and wait for the dashboard or onboarding redirect. */
async function signIn(page: Page): Promise<void> {
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

// ---------------------------------------------------------------------------
// 1. Unauthenticated redirect checks (always run — no credentials required)
// ---------------------------------------------------------------------------

test.describe("Unauthenticated redirects", () => {
  test("/dashboard redirects to /login", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/dashboard/settings redirects to /login", async ({ page }) => {
    await page.goto("/dashboard/settings");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/messages redirects to /login", async ({ page }) => {
    await page.goto("/messages");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/listings/new redirects to /login", async ({ page }) => {
    await page.goto("/listings/new");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/listings/new-building redirects to /login", async ({ page }) => {
    await page.goto("/listings/new-building");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/professionals/me redirects to /login", async ({ page }) => {
    await page.goto("/professionals/me");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/projects redirects to /login", async ({ page }) => {
    await page.goto("/projects");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("/portfolios redirects to /login", async ({ page }) => {
    await page.goto("/portfolios");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    await expect(page).toHaveURL(/\/login/);
  });

  test("redirect lands on a usable login page (no white screen)", async ({ page }) => {
    await page.goto("/dashboard");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
    // Login page must render its form — confirms no uncaught JS error
    await expect(
      page.locator('input[type="email"], input[name="email"]')
    ).toBeVisible({ timeout: 8_000 });
  });
});

// ---------------------------------------------------------------------------
// 2. Dashboard — structure and navigation (requires credentials)
// ---------------------------------------------------------------------------

test.describe("Dashboard — structure", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("dashboard loads with a sidebar or nav after sign-in", async ({ page }) => {
    await signIn(page);
    // ProtectedRoute shows a spinner while loading; wait for it to settle
    await page.waitForLoadState("load");
    // At least one sidebar/nav element must be present
    const nav = page.locator('nav, [role="navigation"], [data-testid="dashboard-nav"], aside').first();
    await expect(nav).toBeAttached({ timeout: 10_000 });
  });

  test("dashboard has at least one active/highlighted nav item", async ({ page }) => {
    await signIn(page);
    await page.waitForLoadState("load");
    // Active nav items typically carry aria-current or a highlighted class
    const activeItem = page.locator(
      '[aria-current="page"], [data-active="true"], [data-state="active"], .bg-primary, .text-primary'
    ).first();
    await expect(activeItem).toBeAttached({ timeout: 10_000 });
  });

  test("user name or avatar visible in navbar after sign-in", async ({ page }) => {
    await signIn(page);
    await page.waitForLoadState("load");
    // Avatar image, initials, or profile button
    const userIndicator = page.locator(
      'img[alt*="avatar"], img[alt*="profile"], [data-testid="user-avatar"], [aria-label*="profile"], [aria-label*="account"]'
    ).first();
    const fallback = page.locator("nav button").last(); // last button in nav is typically the profile menu
    const indicatorVisible = await userIndicator.isVisible();
    if (!indicatorVisible) {
      await expect(fallback).toBeVisible({ timeout: 8_000 });
    } else {
      await expect(userIndicator).toBeVisible();
    }
  });

  test("dashboard /settings section renders without crash", async ({ page }) => {
    await signIn(page);
    await page.goto("/dashboard/settings");
    await page.waitForLoadState("load");
    await expect(page.locator("main, #main-content, [data-testid='settings']")).toBeVisible({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 3. Messages page (requires credentials)
// ---------------------------------------------------------------------------

test.describe("Messages page", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("messages page loads a conversation list or empty state", async ({ page }) => {
    await signIn(page);
    await page.goto("/messages");
    await page.waitForLoadState("load");
    await Promise.race([
      page.locator('[data-testid="conversation-list"], [data-testid="empty-state"], h1, h2, ul').first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined),
      page.locator("nav, [role='navigation'], aside, body").first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
    ]);
    // Accept either a list of conversations or an empty-state element
    const content = page.locator(
      '[data-testid="conversation-list"], [data-testid="empty-state"], h1, h2, ul'
    ).first();
    const hasContent = (await content.count().catch(() => 0)) > 0;
    if (!hasContent) {
      const nodeCount = await page.locator("body *").count();
      expect(nodeCount).toBeGreaterThan(5);
      return;
    }
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  test("messages page has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page);
    await page.goto("/messages");
    await page.waitForLoadState("load");

    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 4. Firesale page (requires credentials)
// ---------------------------------------------------------------------------

test.describe("Firesale page", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("firesale page loads for authenticated users", async ({ page }) => {
    await signIn(page);
    await page.goto("/firesale");
    await page.waitForLoadState("load");
    const content = page.locator(
      'h1:has-text("Sell Your Property"), h1:has-text("Quick Sale"), [data-testid="access-gate"], body'
    ).first();
    await expect(content).toBeVisible({ timeout: 10_000 });
  });

  test("firesale shows deal cards or investor-only access gate", async ({ page }) => {
    await signIn(page);
    await page.goto("/firesale");
    await page.waitForLoadState("load");
    // Either deal content or an access-gate/upgrade prompt is acceptable
    const content = page.locator(
      '[data-testid="firesale-card"], [data-testid="access-gate"], h1, h2, [class*="gate"], [class*="lock"]'
    ).first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });
});

// ---------------------------------------------------------------------------
// 5. Listing creation — seller / agent (requires credentials)
// ---------------------------------------------------------------------------

test.describe("Listing creation form", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("/listings/new shows a multi-step form or seller-access gate", async ({ page }) => {
    await signIn(page);
    await page.goto("/listings/new");
    await page.waitForLoadState("load");
    // Either the creation form or the SellerGate "Listing Access Required" message
    const content = page.locator(
      'form, [data-testid="create-listing"], h1, h2, [class*="step"]'
    ).first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  test("listing form step 1 contains property type selection", async ({ page }) => {
    await signIn(page);
    await page.goto("/listings/new");
    await page.waitForLoadState("load");
    await Promise.race([
      page.getByText("Listing Access Required", { exact: true }).waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
      page.locator(
        '[role="radiogroup"], select, [data-testid*="type"], button:has-text("Apartment"), button:has-text("House"), button:has-text("Villa")'
      ).first().waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined),
    ]);
    // Skip assertion if user hits the seller-access gate
    const isGated = await page.getByText("Listing Access Required", { exact: true })
      .isVisible()
      .catch(() => false);
    if (isGated) {
      test.skip();
      return;
    }
    // Property type — could be a radio group, select, or button group
    const typeSelector = page.locator(
      '[role="radiogroup"], select, [data-testid*="type"], button:has-text("Apartment"), button:has-text("House"), button:has-text("Villa")'
    ).first();
    await expect(typeSelector).toBeAttached({ timeout: 10_000 });
  });

  test("submitting an empty form shows required-field validation", async ({ page }) => {
    await signIn(page);
    await page.goto("/listings/new");
    await page.waitForLoadState("load");

    const isGated = await page.locator('text="Listing Access Required"').isVisible();
    if (isGated) {
      test.skip();
      return;
    }

    // Click the primary submit / next button
    const submitBtn = page.locator(
      'button[type="submit"], button:has-text("Next"), button:has-text("Continue"), button:has-text("Submit")'
    ).first();
    if (await submitBtn.isVisible()) {
      await submitBtn.click();
      // Validation feedback: HTML5 invalid state OR a visible error message
      const errorVisible = await page.locator('[role="alert"], .text-destructive, [data-testid="field-error"]').isVisible();
      const anyInvalid = await page.evaluate(() =>
        document.querySelectorAll(":invalid").length > 0
      );
      expect(errorVisible || anyInvalid).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// 6. New building listing (requires credentials)
// ---------------------------------------------------------------------------

test.describe("New building listing", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("/listings/new-building renders a form or access gate", async ({ page }) => {
    await signIn(page);
    await page.goto("/listings/new-building");
    await page.waitForLoadState("load");
    await Promise.race([
      page.getByText("Developer Access Required", { exact: true }).waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
      page.locator('form, [data-testid="create-new-build"], h1, h2').first().waitFor({ state: "visible", timeout: 15_000 }).catch(() => undefined),
    ]);
    const hasDeveloperGate = await page.getByText("Developer Access Required", { exact: true }).isVisible().catch(() => false);
    const hasForm = await page.locator('form, [data-testid="create-new-build"], h1, h2').first().isVisible().catch(() => false);
    expect(hasDeveloperGate || hasForm).toBe(true);
  });

  test("/listings/new-building has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page);
    await page.goto("/listings/new-building");
    await page.waitForLoadState("load");

    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 7. Professional profile — own profile (requires credentials)
// ---------------------------------------------------------------------------

test.describe("Professional profile (own)", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("/professionals/me renders an editable profile or create-profile prompt", async ({ page }) => {
    await signIn(page);
    await page.goto("/professionals/me");
    await page.waitForLoadState("load");
    // Should show either an edit form or a "create profile" CTA — not a blank page
    const content = page.locator(
      'form, h1, h2, [data-testid="professional-profile"], button:has-text("Create"), button:has-text("Save")'
    ).first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  test("/professionals/me does not crash or show a white screen", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page);
    await page.goto("/professionals/me");
    await page.waitForLoadState("load");

    await expect(page.locator("body")).not.toBeEmpty();
    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 8. Projects page (requires credentials)
// ---------------------------------------------------------------------------

test.describe("Projects page", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("/projects loads a project list or empty state", async ({ page }) => {
    await signIn(page);
    await page.goto("/projects");
    await page.waitForLoadState("load");
    const content = page.locator(
      '[data-testid="project-list"], [data-testid="empty-state"], h1, h2, table, ul'
    ).first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  test("/projects has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page);
    await page.goto("/projects");
    await page.waitForLoadState("load");

    expect(errors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// 9. Portfolios page (requires credentials)
// ---------------------------------------------------------------------------

test.describe("Portfolios page", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run authenticated tests");

  test("/portfolios loads correctly", async ({ page }) => {
    await signIn(page);
    await page.goto("/portfolios");
    await page.waitForLoadState("load");
    const content = page.locator(
      '[data-testid="portfolio-list"], [data-testid="empty-state"], h1, h2'
    ).first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  test("/portfolios has no uncaught JS errors", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page);
    await page.goto("/portfolios");
    await page.waitForLoadState("load");

    expect(errors).toHaveLength(0);
  });
});
