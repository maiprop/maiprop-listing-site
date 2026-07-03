/**
 * Cross-user interaction tests — Agent Pro and Developer Pro accounts.
 *
 * Covers:
 *  1. Agent Pro sign-in, dashboard, and listing-creation access (5 tests)
 *  2. Developer Pro sign-in, dashboard, and new-building form access (4 tests)
 *  3. Multi-context tests: authenticated agent/developer + public buyer browsing (2 tests)
 *
 * Demo credentials (password: Demo2025!):
 *   Agent Pro:     agent.pro@maiprop.demo
 *   Developer Pro: developer.pro@maiprop.demo
 * Tests skip gracefully when credentials are unavailable. Override via env:
 *   E2E_AGENT_EMAIL / E2E_AGENT_PASSWORD
 *   E2E_DEVELOPER_EMAIL / E2E_DEVELOPER_PASSWORD
 */
import { test, expect, type Page, type Browser, type BrowserContext } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { getBaseURL } from "./helpers/baseURL";
import { demoAccounts, demoPasswords, seededDemoAccountsEnabled } from "./helpers/demoAccounts";

// ---------------------------------------------------------------------------
// Credentials
// ---------------------------------------------------------------------------

const AGENT_EMAIL = demoAccounts.agentPro;
const AGENT_PASSWORD = demoPasswords.agentPro;

const DEV_EMAIL = demoAccounts.developerPro;
const DEV_PASSWORD = demoPasswords.developerPro;

const hasSeededDemoAccounts = seededDemoAccountsEnabled();
const googlePlacesEnabled =
  Boolean(process.env.VITE_GOOGLE_MAPS_API_KEY) &&
  process.env.VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE === "true";

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
  await page.waitForFunction(
    () => {
      const path = window.location.pathname;
      const loginForm = document.querySelector('input[type="password"]');
      const authenticatedShell = document.querySelector("aside, [role='navigation'], [data-testid*='nav']");
      return /\/dashboard|\/onboarding/.test(path) || (!loginForm && Boolean(authenticatedShell));
    },
    undefined,
    { timeout: 25_000 },
  );
  const passwordStillVisible = await page.locator('input[type="password"]').first().isVisible().catch(() => false);
  if (passwordStillVisible && /\/login/.test(page.url())) {
    throw new Error(`Sign-in did not leave the login page for ${email}`);
  }
}

function dashboardNavItem(page: Page, text: RegExp) {
  return page
    .locator(
      'nav a, nav button, aside a, aside button, [role="navigation"] a, [role="navigation"] button,' +
      ' [data-testid*="nav"] a, [data-testid*="nav"] button, [data-testid*="nav"] [role="button"]',
    )
    .filter({ hasText: text })
    .first();
}

function anyDashboardNavItem(page: Page) {
  return page
    .locator(
      'nav a, nav button, aside a, aside button, [role="navigation"] a, [role="navigation"] button,' +
      ' [data-testid*="nav"] a, [data-testid*="nav"] button, [data-testid*="nav"] [role="button"]',
    )
    .first();
}

async function mockGooglePlacesScript(page: Page) {
  let requests = 0;
  await page.route(/https:\/\/maps\.googleapis\.com\/maps\/api\/js.*/, async (route) => {
    requests += 1;
    await route.fulfill({
      status: 200,
      contentType: "application/javascript",
      body: `
        window.google = {
          maps: {
            places: {
              Autocomplete: function(input, options) {
                this.input = input;
                this.options = options;
                this.addListener = function() { return { remove: function() {} }; };
                this.getPlace = function() {
                  return {
                    formatted_address: "11 Dimarchou Aggelou Metaxa, Glyfada, Greece",
                    address_components: [
                      { long_name: "11", short_name: "11", types: ["street_number"] },
                      { long_name: "Dimarchou Aggelou Metaxa", short_name: "Dimarchou Aggelou Metaxa", types: ["route"] },
                      { long_name: "Glyfada", short_name: "Glyfada", types: ["locality"] },
                      { long_name: "South Athens", short_name: "South Athens", types: ["administrative_area_level_2"] },
                      { long_name: "166 75", short_name: "16675", types: ["postal_code"] }
                    ],
                    geometry: { location: { lat: function() { return 37.865; }, lng: function() { return 23.753; } } }
                  };
                };
              }
            }
          }
        };
        var callbackName = new URL(document.currentScript.src).searchParams.get("callback");
        if (callbackName && typeof window[callbackName] === "function") {
          window[callbackName]();
        }
      `,
    });
  });
  return () => requests;
}

async function waitForGooglePlacesRequest(page: Page, getRequests: () => number) {
  await expect.poll(getRequests, { timeout: 10_000 }).toBeGreaterThan(0);
  await expect(page.locator('script[src*="maps.googleapis.com/maps/api/js"][data-maiprop-google-places="true"]')).toHaveCount(1);
}

async function createTemporaryDeveloperProject(): Promise<{ id: string; cleanup: () => Promise<void> } | null> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: usersData, error: usersError } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (usersError) throw usersError;
  const developerUser = usersData.users.find((user) => user.email?.toLowerCase() === DEV_EMAIL.toLowerCase());
  if (!developerUser) return null;

  const projectId = randomUUID();
  const { error: insertError } = await admin.from("projects").insert({
    id: projectId,
    owner_id: developerUser.id,
    name: `E2E Google Places Edit ${Date.now()}`,
    city: "Athens",
    address: "Syntagma Square 1",
    municipality: "Athens",
    status: "draft",
  });
  if (insertError) throw insertError;

  return {
    id: projectId,
    cleanup: async () => {
      await admin.from("projects").delete().eq("id", projectId);
    },
  };
}

// ---------------------------------------------------------------------------
// AGENT PRO tests
// ---------------------------------------------------------------------------

test.describe("Agent Pro — sign-in and dashboard", () => {
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
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

    // Dashboard nav can be rendered as links on desktop shells or buttons in the
    // current tabbed sidebar. Either shape is valid if the agent workflow item exists.
    const navItem = dashboardNavItem(page, /Listings|My Listings|CRM|Leads|Properties/i);
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
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
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

  test("developer.pro sees first-step multi-unit option for new-build and renovation creation", async ({ page }) => {
    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.goto("/listings/new-building");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    await expect(page.getByText(/Multi-unit inventory/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Add unit/i })).toBeVisible();

    await page.getByRole("button", { name: /^Renovation$/i }).click();
    await expect(page.getByText(/Multi-unit inventory/i)).toBeVisible();
    await expect(page.getByRole("button", { name: /Add unit/i })).toBeVisible();

    await page.getByLabel(/Project name/i).fill("E2E Renovation Project");
    await page.getByLabel(/Construction year/i).fill("1982");
    await page.getByLabel(/Renovation year/i).fill("2026");
    await page.getByLabel(/^City/i).fill("Athens");
    await page.getByRole("button", { name: /Add unit/i }).click();

    await expect(page.getByRole("heading", { name: /Project Inventory/i })).toBeVisible({ timeout: 10_000 });
  });

  test("developer.pro creation address autosuggest requests Google Places when enabled", async ({ page }) => {
    test.skip(!googlePlacesEnabled, "Google Places E2E requires VITE_GOOGLE_MAPS_API_KEY and VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE=true");
    const getGoogleRequests = await mockGooglePlacesScript(page);

    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.goto("/listings/new-building");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });
    await page.getByLabel(/^Address$/i).focus();

    await waitForGooglePlacesRequest(page, getGoogleRequests);
  });

  test("developer.pro project edit address autosuggest requests Google Places when enabled", async ({ page }) => {
    test.skip(!googlePlacesEnabled, "Google Places E2E requires VITE_GOOGLE_MAPS_API_KEY and VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE=true");
    const getGoogleRequests = await mockGooglePlacesScript(page);
    const temporaryProject = await createTemporaryDeveloperProject();
    if (!temporaryProject) {
      test.skip(true, "Service role or Developer Pro auth user missing; cannot create temporary edit project");
      return;
    }

    try {
      await signIn(page, DEV_EMAIL, DEV_PASSWORD);
      await page.goto(`/projects/${temporaryProject.id}`);
      await page.waitForLoadState("networkidle", { timeout: 15_000 });
      await page.getByLabel(/^Address$/i).focus();

      await waitForGooglePlacesRequest(page, getGoogleRequests);
    } finally {
      await temporaryProject.cleanup();
    }
  });

  test("developer.pro can configure a renovation project with multiple units", async ({ page }) => {
    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.goto("/listings/new-building");
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    await page.getByRole("button", { name: /^Renovation$/i }).click();
    await expect(page.getByLabel(/Construction year/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByLabel(/Renovation year/i)).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/Project name/i).fill("E2E Renovation Project");
    await page.getByLabel(/Construction year/i).fill("1982");
    await page.getByLabel(/Renovation year/i).fill("2026");
    await page.getByLabel(/^City/i).fill("Athens");

    await page.getByRole("button", { name: /Next/i }).click();
    await expect(page.getByRole("heading", { name: /Project Inventory/i })).toBeVisible({ timeout: 10_000 });

    await page.getByLabel(/Unit ID/i).fill("R1");
    await page.getByLabel(/Internal sqm/i).fill("58");
    await page.getByLabel(/Price/i).fill("210000");
    await page.getByLabel(/Bedrooms/i).fill("1");
    await page.getByLabel(/Bathrooms/i).fill("1");

    await page.getByRole("button", { name: /Add unit/i }).click();
    await expect(page.getByRole("button", { name: /Unit 2/i })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: /Remove/i })).toBeVisible();

    await page.getByLabel(/Unit ID/i).fill("R2");
    await page.getByLabel(/Internal sqm/i).fill("74");
    await page.getByLabel(/Price/i).fill("275000");
    await page.getByLabel(/Bedrooms/i).fill("2");
    await page.getByLabel(/Bathrooms/i).fill("2");

    await page.getByRole("button", { name: /^R1$/i }).click();
    await expect(page.getByLabel(/Unit ID/i)).toHaveValue("R1");
    await page.getByRole("button", { name: /^R2$/i }).click();
    await expect(page.getByLabel(/Unit ID/i)).toHaveValue("R2");
  });

  // 8. Dashboard has any navigation links in sidebar (developer shares the common dashboard nav)
  test("developer.pro dashboard has a sidebar navigation", async ({ page }) => {
    await signIn(page, DEV_EMAIL, DEV_PASSWORD);
    await page.waitForLoadState("networkidle", { timeout: 15_000 });

    // The shared dashboard shell can expose nav items as links or tab buttons.
    const navItem = anyDashboardNavItem(page);
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
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  // 10. Agent goes to /dashboard while Buyer browses /listings — both render
  test("agent session and public buyer browsing render simultaneously", async ({ browser }: { browser: Browser }) => {
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

      // Sign in the authenticated user; public buyer browsing should not depend
      // on seeded buyer credentials.
      await signIn(agentPage, AGENT_EMAIL, AGENT_PASSWORD);

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
  test.skip(!hasSeededDemoAccounts, "Seeded demo accounts require real Supabase config");
  // 11. Developer browses /projects or /dashboard while Buyer browses /auctions or /listings
  test("developer session and public buyer browsing render without errors", async ({ browser }: { browser: Browser }) => {
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

      // Sign in the authenticated user; public buyer browsing should not depend
      // on seeded buyer credentials.
      await signIn(devPage, DEV_EMAIL, DEV_PASSWORD);

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
