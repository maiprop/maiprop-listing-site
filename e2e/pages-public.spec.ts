/**
 * Public pages & route-guard tests.
 *
 * Covers every public/unauthenticated page and verifies that protected routes
 * redirect to /login when accessed without a session.
 *
 * Deliberately avoids duplicating tests already in:
 *   smoke.spec.ts        — homepage load, listings grid, skip link, 404, robots.txt
 *   auth.spec.ts         — login form fields, form validation, sign-in flow
 *   listings.spec.ts     — listings search, filter, card navigation
 *   accessibility.spec.ts — skip link focus, #main-content, nav aria, img alt
 */
import { test, expect, type Page } from "@playwright/test";

const expectMeaningfulBodyText = async (page: Page): Promise<void> => {
  await expect(page.locator("#root, body").first()).toBeVisible({ timeout: 10_000 });
  await expect
    .poll(async () => (await page.locator("body").innerText()).trim().length, {
      message: "expected public route to render non-trivial body text",
      timeout: 10_000,
    })
    .toBeGreaterThan(10);
};

// ─── Homepage sections ────────────────────────────────────────────────────────

test.describe("Public — Homepage sections", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
  });

  test("navbar is visible on homepage", async ({ page }) => {
    await expect(page.locator("header, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("footer is visible on homepage", async ({ page }) => {
    await expect(page.locator("footer")).toBeVisible({ timeout: 10_000 });
  });

  test("homepage renders main content region", async ({ page }) => {
    // The root div renders the full app — confirms React bootstrapped correctly
    await expect(page.locator("#root").first()).toBeVisible({ timeout: 10_000 });
    // At least one heading should be visible (hero section always has h1)
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("at least one section heading is present", async ({ page }) => {
    const heading = page.locator("h1, h2").first();
    await expect(heading).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Auctions page ────────────────────────────────────────────────────────────

test.describe("Public — Auctions page", () => {
  test("auctions page loads and shows structural elements", async ({ page }) => {
    await page.goto("/auctions");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("auctions page has a heading or title element", async ({ page }) => {
    await page.goto("/auctions");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("auctions page does not crash with white screen", async ({ page }) => {
    await page.goto("/auctions");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // Body must have content — the error-boundary or actual page, not a blank div
    await expectMeaningfulBodyText(page);
  });
});

// ─── Property detail (unknown ID) ─────────────────────────────────────────────

test.describe("Public — Property / Auction detail with unknown ID", () => {
  test("navigating to /property/non-existent-id shows detail shell or not-found", async ({ page }) => {
    await page.goto("/property/non-existent-id-123");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // Navbar <header> must be visible — proves the React app bootstrapped and
    // didn't white-screen. Using just `header` avoids matching the hidden
    // mobile bottom-nav <nav class="lg:hidden"> which appears earlier in DOM.
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });
    // The DOM must have more than a trivial number of elements
    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
  });

  test("navigating to /auction/non-existent-id shows detail shell or not-found", async ({ page }) => {
    await page.goto("/auction/non-existent-id-123");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header").first()).toBeVisible({ timeout: 10_000 });
    const nodeCount = await page.locator("body *").count();
    expect(nodeCount).toBeGreaterThan(5);
  });
});

// ─── Professionals directory ──────────────────────────────────────────────────

test.describe("Public — Professionals directory", () => {
  test("professionals page loads with structural elements", async ({ page }) => {
    await page.goto("/professionals");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("professionals page has a heading", async ({ page }) => {
    await page.goto("/professionals");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /professionals/non-existent-id does not crash", async ({ page }) => {
    await page.goto("/professionals/non-existent-id-456");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, body, nav").first()).toBeVisible({ timeout: 10_000 });
    await expectMeaningfulBodyText(page);
  });
});

// ─── Open Houses ──────────────────────────────────────────────────────────────

test.describe("Public — Open Houses", () => {
  test("open houses page loads with structural elements", async ({ page }) => {
    await page.goto("/open-houses");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("open houses page has a heading", async ({ page }) => {
    await page.goto("/open-houses");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("navigating to /open-house/non-existent-id does not crash", async ({ page }) => {
    await page.goto("/open-house/non-existent-id-789");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, body, nav").first()).toBeVisible({ timeout: 10_000 });
    await expectMeaningfulBodyText(page);
  });
});

// ─── New-build detail (unknown ID) ────────────────────────────────────────────

test.describe("Public — New-build detail", () => {
  test("navigating to /new-build/non-existent-id does not crash", async ({ page }) => {
    await page.goto("/new-build/non-existent-id-abc");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, body, nav").first()).toBeVisible({ timeout: 10_000 });
    await expectMeaningfulBodyText(page);
  });
});

// ─── Auth-adjacent public pages ───────────────────────────────────────────────

test.describe("Public — Auth pages (sign-up, reset-password)", () => {
  test("signup page renders sign-up form elements", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // At minimum an email input or the confirmation view
    await expect(
      page.locator('input[type="email"], input[name="email"], input[type="text"]').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("signup page has a nav element", async ({ page }) => {
    await page.goto("/signup");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("reset-password page renders without crash", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, body, nav").first()).toBeVisible({ timeout: 10_000 });
    await expectMeaningfulBodyText(page);
  });

  test("reset-password page renders a password input or info message", async ({ page }) => {
    await page.goto("/reset-password");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // Without a recovery token the page shows an info state; with one it shows a form
    const main = page.locator("main, [role='main'], #main-content").first();
    const hasInput = await main.locator('input[type="password"]').isVisible();
    const hasInfoText = await main
      .getByText(/invalid reset link|expired or is invalid|reset your password|password reset/i)
      .first()
      .isVisible();
    expect(hasInput || hasInfoText).toBe(true);
  });
});

// ─── Pricing page ─────────────────────────────────────────────────────────────

test.describe("Public — Pricing page", () => {
  test("pricing page loads and renders main content", async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("pricing page has an h1 or h2 heading", async ({ page }) => {
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Legal pages ──────────────────────────────────────────────────────────────

test.describe("Public — Legal pages", () => {
  test("privacy policy page renders content", async ({ page }) => {
    await page.goto("/privacy-policy");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("terms of service page renders content", async ({ page }) => {
    await page.goto("/terms-of-service");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("cookie policy page renders content", async ({ page }) => {
    await page.goto("/cookie-policy");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.locator("h1, h2").first()).toBeVisible({ timeout: 10_000 });
  });

  test("legal pages have a footer", async ({ page }) => {
    await page.goto("/privacy-policy");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("footer")).toBeVisible({ timeout: 10_000 });
  });
});

// ─── Quick Sales / Firesale (public since v1.3) ───────────────────────────────

test.describe("Public — Firesale page", () => {
  test("/firesale loads without login for unauthenticated users", async ({ page }) => {
    await page.goto("/firesale");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // Must NOT redirect to login
    expect(page.url()).not.toContain("/login");
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
  });
});

// ─── AI Assistant page ────────────────────────────────────────────────────────

test.describe("Public — AI Assistant page", () => {
  test("ai-assistant page loads without crash", async ({ page }) => {
    await page.goto("/ai-assistant");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await expect(page.locator("header, main, nav").first()).toBeVisible({ timeout: 10_000 });
  });

  test("ai-assistant page renders a chat input or widget container", async ({ page }) => {
    await page.goto("/ai-assistant");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    // The AIAssistantWidget renders a textarea or input for the chat
    const hasInput = await page
      .locator('textarea, input[type="text"], [role="dialog"], [role="main"]')
      .first()
      .isVisible();
    expect(hasInput).toBe(true);
  });
});

// ─── Route guards — unauthenticated redirects ─────────────────────────────────

test.describe("Route guards — unauthenticated redirects", () => {
  /**
   * For each protected route we navigate, wait for the auth guard to resolve,
   * then assert the browser is on /login (or the body is the login page).
   * A generous timeout is used because ProtectedRoute waits for auth+profile loading.
   */

  async function assertRedirectsToLogin(page: Parameters<Parameters<typeof test>[1]>[0], path: string) {
    await page.goto(path);
    // Wait up to 8s for the redirect to complete
    await page.waitForURL(/\/login/, { timeout: 8_000 }).catch(() => {
      // If waitForURL times out the assertion below will catch the failure
    });
    expect(page.url()).toContain("/login");
  }

  test("/dashboard redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/dashboard");
  });

  test("/messages redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/messages");
  });

  test("/listings/new redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/listings/new");
  });

  test("/listings/new-building redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/listings/new-building");
  });

  test("/investor-dashboard redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/investor-dashboard");
  });

  test("/admin redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/admin");
  });

  test("/platform-map redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/platform-map");
  });

  test("/projects redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/projects");
  });

  test("/portfolios redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/portfolios");
  });

  test("/professionals/me redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/professionals/me");
  });

  test("/video-room/some-id redirects unauthenticated user to /login", async ({ page }) => {
    await assertRedirectsToLogin(page, "/video-room/some-professional-id");
  });
});
