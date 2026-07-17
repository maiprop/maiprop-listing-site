/**
 * Cross-user interaction tests: professionals (own profile) ↔ buyer (directory + detail).
 *
 * Covers:
 *  1. Professional own-profile access (/professionals/me) — architect.pro, lawyer.pro
 *  2. Simultaneous multi-context sessions — two professionals, buyer + professional
 *  3. Buyer browsing /professionals directory and clicking into a detail page
 *  4. Consultation / contact button presence on a professional detail page
 *  5. Buyer navigating to /video-room (authenticated, no crash)
 *
 * Demo accounts (password: Demo2025!) are seeded via scripts/seed-demo-accounts.ts.
 * Tests run without env-var overrides using the seeded credentials below.
 */
import { test, expect, type Page, type Browser, type BrowserContext } from "@playwright/test";
import { getBaseURL } from "./helpers/baseURL";
import { demoAccounts, demoPasswords, seededDemoAccountsEnabled } from "./helpers/demoAccounts";
import { waitForPostAuthNavigation } from "./helpers/postAuthNavigation";

// ─── Credentials ─────────────────────────────────────────────────────────────

const PASSWORD = demoPasswords.default;

const ACCOUNTS = {
  buyer: demoAccounts.buyerFree,
  architect: demoAccounts.professionalArchitect,
  lawyer: demoAccounts.professionalLawyer,
  valuer: demoAccounts.professionalValuer,
} as const;
const hasSeededDemoAccounts = seededDemoAccountsEnabled();

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Sign in on a given page and wait for the post-auth redirect. */
async function signIn(page: Page, email: string, password = PASSWORD): Promise<void> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(email);
    await page.locator('input[type="password"]').first().fill(password);
    await page
      .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
      .first()
      .click();
    try {
      await waitForPostAuthNavigation(page);
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

/**
 * Sign in inside a fresh browser context and return the signed-in page.
 * The caller is responsible for closing the context.
 */
async function signInContext(
  browser: Browser,
  email: string,
  password = PASSWORD,
): Promise<{ ctx: BrowserContext; page: Page }> {
  const ctx = await browser.newContext({ baseURL: getBaseURL() });
  const page = await ctx.newPage();
  await signIn(page, email, password);
  return { ctx, page };
}

async function waitForAppContent(page: Page, timeout = 15_000): Promise<void> {
  await page.waitForLoadState("load", { timeout });
  await expect(page.locator("body")).toContainText(/\S/, { timeout: 10_000 });
}

async function waitForProfessionalProfile(page: Page): Promise<void> {
  await waitForAppContent(page);
  await page.waitForURL(/\/professionals\/[0-9a-f-]{36}/i, { timeout: 30_000 });
  await expect(page.locator("body")).toContainText(
    /Back to Directory|Professional Details|Book Consultation|Contact/i,
    { timeout: 30_000 },
  );
}

// ─── 1. Professional own-profile access ──────────────────────────────────────

test.describe("Professional own-profile (/professionals/me)", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  test("architect.pro signs in and can access /professionals/me", async ({ page }) => {
    await signIn(page, ACCOUNTS.architect);
    await page.goto("/professionals/me");
    await waitForProfessionalProfile(page);

    // Page must render some recognisable UI — not a blank white screen.
    const content = page
      .locator("h1, h2, form, [data-testid='professional-profile'], [class*='profile']")
      .first();
    await expect(content).toBeAttached({ timeout: 10_000 });
  });

  test("architect.pro profile page shows edit form or profile UI", async ({ page }) => {
    await signIn(page, ACCOUNTS.architect);
    await page.goto("/professionals/me");
    await waitForProfessionalProfile(page);

    // Prefer edit-form presence; fall back to display-mode profile elements.
    const hasForm = (await page.locator("input, textarea, select").count()) > 0;

    const hasProfileDisplay =
      (await page.locator("h1, h2, [class*='profile'], [class*='bio']").count()) > 0;

    expect(hasForm || hasProfileDisplay).toBe(true);
  });

  test("lawyer.pro signs in and /professionals/me does not crash", async ({ page }) => {
    // Collect page-level JS errors BEFORE any navigation.
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signIn(page, ACCOUNTS.lawyer);
    await page.goto("/professionals/me");
    await waitForProfessionalProfile(page);

    // Body must contain meaningful content and no uncaught JS errors.
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.trim().length ?? 0).toBeGreaterThan(10);
    expect(errors).toHaveLength(0);
  });

  test("multiple professionals sign in simultaneously", async ({ browser }) => {
    // Two independent browser contexts — architect and lawyer, both on /professionals/me.
    let archCtx: BrowserContext | undefined;
    let lawyerCtx: BrowserContext | undefined;

    try {
      const archErrors: string[] = [];
      const lawyerErrors: string[] = [];

      // Sign in sequentially to avoid Supabase auth rate-limiting under parallel worker load.
      const arch = await signInContext(browser, ACCOUNTS.architect);
      const lawyer = await signInContext(browser, ACCOUNTS.lawyer);

      archCtx = arch.ctx;
      lawyerCtx = lawyer.ctx;

      arch.page.on("pageerror", (err) => archErrors.push(err.message));
      lawyer.page.on("pageerror", (err) => lawyerErrors.push(err.message));

      // Both navigate to their own profile pages.
      await Promise.all([
        arch.page.goto("/professionals/me"),
        lawyer.page.goto("/professionals/me"),
      ]);

      await Promise.all([
        waitForProfessionalProfile(arch.page),
        waitForProfessionalProfile(lawyer.page),
      ]);

      // Each profile page must render some content.
      await expect(
        arch.page.locator("h1, h2, form, input, [class*='profile']").first(),
      ).toBeAttached({ timeout: 10_000 });

      await expect(
        lawyer.page.locator("h1, h2, form, input, [class*='profile']").first(),
      ).toBeAttached({ timeout: 10_000 });

      // No JS errors in either session.
      expect(archErrors).toHaveLength(0);
      expect(lawyerErrors).toHaveLength(0);
    } finally {
      await archCtx?.close();
      await lawyerCtx?.close();
    }
  });
});

// ─── 2. Buyer browsing the professionals directory ────────────────────────────

test.describe("Buyer — professionals directory (/professionals)", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  test("seeded buyer can browse /professionals directory", async ({ page }) => {
    await signIn(page, ACCOUNTS.buyer);
    await page.goto("/professionals");
    await waitForAppContent(page);

    // Heading must be visible to confirm the page mounted correctly.
    await expect(
      page.locator("h1, h2, [role='heading']").first(),
    ).toBeVisible({ timeout: 10_000 });

    // At least one professional card OR an empty-state element must exist.
    const hasCards =
      (await page.locator("article, [class*='card'], [class*='professional']").count()) > 0;

    const hasEmpty =
      (await page
        .locator("[class*='empty'], .text-muted-foreground, [data-testid='empty-state']")
        .count()) > 0;

    expect(hasCards || hasEmpty).toBe(true);
  });

  test("buyer sees search input on /professionals page", async ({ page }) => {
    await signIn(page, ACCOUNTS.buyer);
    await page.goto("/professionals");
    await waitForAppContent(page);

    // Use toBeAttached (not toBeVisible) — input may be in a collapsed header.
    const search = page
      .locator(
        'input[type="search"], input[placeholder*="Search" i], [data-testid="search-input"]',
      )
      .first();
    await expect(search).toBeAttached({ timeout: 8_000 });
  });

  test("buyer can click into a professional profile from directory", async ({ page }) => {
    await signIn(page, ACCOUNTS.buyer);
    await page.goto("/professionals");
    await waitForAppContent(page);

    // Only attempt click-through if at least one profile link is rendered.
    const firstProfileLink = page.getByRole("link", { name: /view profile/i }).first();
    await firstProfileLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

    const profileLinkAttached = (await firstProfileLink.count()) > 0;
    if (!profileLinkAttached) {
      // No professionals seeded yet — directory is empty; skip click-through check.
      test.skip();
      return;
    }

    await firstProfileLink.click();
    await waitForAppContent(page);

    // Navbar / header must still be visible — rules out a white-screen crash.
    await expect(page.locator("nav, header").first()).toBeVisible({ timeout: 10_000 });

    // Page body must contain meaningful content.
    const bodyText = await page.locator("body").textContent();
    expect(bodyText?.trim().length ?? 0).toBeGreaterThan(10);
  });

  test(
    "buyer and architect signed in simultaneously — buyer on directory, professional on own profile",
    async ({ browser }) => {
      let buyerCtx: BrowserContext | undefined;
      let archCtx: BrowserContext | undefined;

      try {
        const buyerErrors: string[] = [];
        const archErrors: string[] = [];

        // Sign in sequentially to avoid Supabase auth rate-limiting under parallel worker load.
        const buyer = await signInContext(browser, ACCOUNTS.buyer);
        const arch = await signInContext(browser, ACCOUNTS.architect);

        buyerCtx = buyer.ctx;
        archCtx = arch.ctx;

        buyer.page.on("pageerror", (err) => buyerErrors.push(err.message));
        arch.page.on("pageerror", (err) => archErrors.push(err.message));

        // Navigate concurrently to their respective pages.
        await Promise.all([
          buyer.page.goto("/professionals"),
          arch.page.goto("/professionals/me"),
        ]);

        await Promise.all([
          waitForAppContent(buyer.page),
          waitForAppContent(arch.page),
        ]);

        // Both pages must render a heading or recognisable content.
        await expect(
          buyer.page.locator("h1, h2, [role='heading']").first(),
        ).toBeVisible({ timeout: 10_000 });

        await expect(
          arch.page.locator("h1, h2, form, input, [class*='profile']").first(),
        ).toBeAttached({ timeout: 10_000 });

        // No uncaught JS errors in either session.
        expect(buyerErrors).toHaveLength(0);
        expect(archErrors).toHaveLength(0);
      } finally {
        await buyerCtx?.close();
        await archCtx?.close();
      }
    },
  );
});

// ─── 3. Consultation / contact button on professional detail page ─────────────

test.describe("Professional detail page — consultation / contact button", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  test(
    "professional profile detail page has a contact or book button",
    async ({ page }) => {
      await signIn(page, ACCOUNTS.buyer);
      await page.goto("/professionals");
      await waitForAppContent(page);

      const firstProfileLink = page.getByRole("link", { name: /view profile/i }).first();
      await firstProfileLink.waitFor({ state: "visible", timeout: 15_000 }).catch(() => {});

      const profileLinkAttached = (await firstProfileLink.count()) > 0;
      if (!profileLinkAttached) {
        // No professionals in directory — cannot follow through to detail page.
        test.skip();
        return;
      }

      await firstProfileLink.click();
      await waitForAppContent(page);

      // Check for any consultation / contact action button using toBeAttached.
      const actionButton = page
        .locator(
          [
            "button:has-text('Book')",
            "button:has-text('Contact')",
            "button:has-text('Consult')",
            "button:has-text('Enquire')",
            "button:has-text('Message')",
            "button:has-text('Video')",
            "a:has-text('Book')",
            "a:has-text('Contact')",
            "a:has-text('Consult')",
            "a:has-text('Enquire')",
            "a:has-text('Message')",
            "[data-testid*='book'], [data-testid*='contact'], [data-testid*='consult']",
          ].join(", "),
        )
        .first();

      await expect(actionButton).toBeAttached({ timeout: 10_000 });
    },
  );
});

// ─── 4. Video room — authenticated no-crash check ────────────────────────────

test.describe("Video room — authenticated buyer", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  test(
    "seeded buyer navigating to /video-room lands on valid page (not crash)",
    async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (err) => errors.push(err.message));

      await signIn(page, ACCOUNTS.buyer);
      await page.goto("/video-room/00000000-0000-0000-0000-000000000000");
      await waitForAppContent(page);

      // Navbar / header must still be rendered — proves the React tree didn't crash.
      await expect(page.locator("nav, header").first()).toBeVisible({ timeout: 10_000 });

      // Either body text is substantial, OR the DOM has enough nodes to show real UI.
      const bodyText = await page.locator("body").textContent();
      const nodeCount = await page.locator("body *").count();

      const hasContent =
        (bodyText?.trim().length ?? 0) > 10 || nodeCount > 5;

      expect(hasContent).toBe(true);
      // No uncaught JS errors.
      expect(errors).toHaveLength(0);
    },
  );
});
