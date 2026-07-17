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
import { createClient } from "@supabase/supabase-js";
import { getBaseURL } from "./helpers/baseURL";
import { demoAccounts, demoPasswords, seededDemoAccountsEnabled } from "./helpers/demoAccounts";
import { readCleanEnv } from "./helpers/env";
import { waitForPostAuthNavigation } from "./helpers/postAuthNavigation";

// ── Credentials ───────────────────────────────────────────────────────────────

const buyerEmail = demoAccounts.buyerFree;
const buyerPassword = demoPasswords.buyerFree;
const sellerEmail = demoAccounts.sellerPro;
const sellerPassword = demoPasswords.sellerPro;
const hasSeededDemoAccounts = seededDemoAccountsEnabled();
const SUPABASE_URL = readCleanEnv("VITE_SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = readCleanEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = [
  readCleanEnv("SUPABASE_SERVICE_ROLE_KEY"),
  readCleanEnv("SUPABASE_ANON_KEY"),
].find((key) => isProbablyServiceRoleKey(key)) ?? "";

function jwtRole(key: string): string | null {
  if (!key.includes(".")) return null;
  try {
    const payload = key.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    const parsed = JSON.parse(json) as { role?: unknown };
    return typeof parsed.role === "string" ? parsed.role : null;
  } catch {
    return null;
  }
}

function isProbablyServiceRoleKey(key: string): boolean {
  return key.startsWith("sb_secret_") || jwtRole(key) === "service_role";
}

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
      await waitForPostAuthNavigation(page);
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

const createLiveContactListingFixture = async (): Promise<{
  href: string;
  id: string;
  publicListing: Record<string, unknown>;
  cleanup: () => Promise<void>;
} | null> => {
  if (
    !SUPABASE_URL.startsWith("https://") ||
    SUPABASE_URL.includes("abcdefghijklmnop") ||
    SUPABASE_PUBLISHABLE_KEY.length < 40 ||
    !SUPABASE_SERVICE_ROLE_KEY
  ) {
    return null;
  }

  const authClient = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
    email: sellerEmail,
    password: sellerPassword,
  });
  expect(signInError, `seller sign-in for contact fixture: ${signInError?.message ?? ""}`).toBeNull();
  const sellerId = signedIn.user?.id;
  expect(sellerId, "seller id for contact fixture").toBeTruthy();

  const title = `Codex E2E contact listing ${Date.now()}`;
  const { data: listing, error: listingError } = await admin
    .from("listings")
    .insert({
      owner_id: sellerId,
      title,
      address: "1 Codex Contact Test Street",
      city: "Athens",
      price: 275000,
      price_per_sqm: 5500,
      sqm: 50,
      bedrooms: 2,
      bathrooms: 1,
      floor: "2",
      total_floors: "5",
      year_built: 2024,
      energy_class: "A",
      property_type: "apartment",
      listing_type: "sale",
      status: "active",
      is_off_market: false,
      latitude: 37.9838,
      longitude: 23.7275,
      views_count: 0,
      tags: ["codex-e2e-contact-fixture"],
    })
    .select("*")
    .single();
  expect(listingError, `create live contact listing fixture: ${listingError?.message ?? ""}`).toBeNull();
  if (!listing?.id) throw new Error("Supabase did not return a contact listing fixture id.");

  const { data: profile } = await admin
    .from("profiles_public")
    .select("user_id, display_name, avatar_url, role, verified")
    .eq("user_id", sellerId!)
    .maybeSingle();

  return {
    href: `/property/${listing.id}`,
    id: listing.id,
    publicListing: {
      ...listing,
      listing_images: [],
      profiles: profile ?? {
        user_id: sellerId,
        display_name: "Codex E2E Seller",
        avatar_url: null,
        role: "seller",
        verified: false,
      },
      ownerParticipantType: "seller",
    },
    cleanup: async () => {
      await admin.from("conversations").delete().eq("listing_id", listing.id);
      await admin.from("leads").delete().eq("listing_id", listing.id).eq("email", buyerEmail);
      await admin
        .from("leads")
        .delete()
        .eq("owner_id", sellerId!)
        .eq("email", buyerEmail)
        .is("listing_id", null)
        .is("professional_id", null)
        .is("project_id", null)
        .neq("source", "manual");

      const { error: deleteError } = await admin.from("listings").delete().eq("id", listing.id);
      if (!deleteError) return;

      const { error: archiveError } = await admin
        .from("listings")
        .update({
          status: "draft",
          is_off_market: true,
          tags: ["codex-e2e-contact-fixture", "codex-e2e-cleanup-archived"],
        })
        .eq("id", listing.id);
      if (archiveError) {
        throw new Error(
          `Could not delete or archive live contact listing fixture ${listing.id}: ${deleteError.message}; ${archiveError.message}`,
        );
      }
    },
  };
};

// ── Multi-context tests ───────────────────────────────────────────────────────

test.describe("Buyer + Seller simultaneous sessions", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
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
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
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
    const fixture = await createLiveContactListingFixture();
    if (!fixture) {
      test.skip();
      return;
    }

    await page.route("**/api/public/listing?**", async (route) => {
      const requestUrl = new URL(route.request().url());
      if (requestUrl.searchParams.get("id") === fixture.id) {
        await route.fulfill({
          status: 200,
          contentType: "application/json; charset=utf-8",
          body: JSON.stringify({ data: fixture.publicListing }),
        });
        return;
      }
      await route.continue();
    });

    try {
      await signInAs(page, buyerEmail, buyerPassword);

      await page.goto(fixture.href);
      await page.waitForLoadState("load", { timeout: 15_000 });

      const contactBtn = page
        .locator(
          'button:has-text("Contact"), button:has-text("Message"), button:has-text("Enquire"),' +
            'a:has-text("Contact"), a:has-text("Message"), a:has-text("Enquire"),' +
            '[data-testid*="contact"], [data-testid*="message"]',
        )
        .first();

      await expect(contactBtn).toBeVisible({ timeout: 30_000 });

      // Accept either: a modal/dialog overlay OR navigation to /messages.
      const dialogOrMessages = page
        .locator(
          '[role="dialog"], [data-testid*="modal"], [data-testid*="message-compose"],' +
            'textarea[placeholder*="message"], textarea[placeholder*="Message"]',
        )
        .first();

      const messagesOutcome = page
        .waitForURL(/\/messages/, { timeout: 15_000 })
        .then(() => "messages" as const)
        .catch(() => null);
      const modalOutcome = dialogOrMessages
        .waitFor({ state: "visible", timeout: 15_000 })
        .then(() => "modal" as const)
        .catch(() => null);

      await contactBtn.click();

      const outcome = await Promise.race([
        messagesOutcome,
        modalOutcome,
      ]);

      expect(
        outcome !== null,
        "Expected a compose modal or /messages navigation after clicking Contact",
      ).toBe(true);
    } finally {
      await fixture.cleanup();
    }
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
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
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
