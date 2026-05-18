/**
 * Live role/tier matrix smoke.
 *
 * This suite is intentionally non-destructive. It logs in with seeded demo
 * accounts, opens role/tier-specific modules, and verifies that the app renders
 * a real shell instead of a blank screen or preview lock page. It does not
 * submit forms, create listings, start checkout, or delete accounts.
 */
import { expect, test, type Page } from "@playwright/test";
import { demoAccounts, demoPasswords } from "./helpers/demoAccounts";

type AccountCase = {
  label: string;
  email: string;
  password: string;
  modules: string[];
  gatedModules?: string[];
  expectedNav?: RegExp[];
};

const enabled =
  process.env.E2E_USE_SEEDED_DEMO_ACCOUNTS === "true" &&
  Boolean(process.env.PLAYWRIGHT_BASE_URL);

const accountCases: AccountCase[] = [
  {
    label: "buyer free",
    email: demoAccounts.buyerFree,
    password: demoPasswords.buyerFree,
    modules: [
      "/dashboard",
      "/messages",
      "/dashboard?tab=saved",
      "/dashboard?tab=saved-searches",
      "/dashboard?tab=viewings",
      "/dashboard?tab=auctions",
      "/dashboard?tab=billing",
      "/dashboard?tab=profile",
      "/dashboard?tab=settings",
    ],
    gatedModules: ["/listings/new", "/admin", "/investor-dashboard"],
    expectedNav: [/Saved/i, /Saved Searches/i, /Messages/i, /Auction Alerts/i],
  },
  {
    label: "buyer pro",
    email: demoAccounts.buyerPro,
    password: demoPasswords.buyerPro,
    modules: [
      "/dashboard",
      "/messages",
      "/dashboard?tab=saved",
      "/dashboard?tab=saved-searches",
      "/dashboard?tab=open-houses",
      "/dashboard?tab=viewings",
      "/dashboard?tab=billing",
      "/open-houses",
    ],
    gatedModules: ["/listings/new", "/admin"],
    expectedNav: [/Open Houses/i, /Saved Searches/i, /Messages/i],
  },
  {
    label: "seller free",
    email: demoAccounts.sellerFree,
    password: demoPasswords.default,
    modules: [
      "/dashboard",
      "/messages",
      "/listings/new",
      "/dashboard?tab=listings",
      "/dashboard?tab=viewings",
      "/dashboard?tab=billing",
      "/dashboard?tab=settings",
    ],
    gatedModules: ["/admin", "/investor-dashboard", "/projects"],
    expectedNav: [/My Listings/i, /Messages/i, /Viewings/i],
  },
  {
    label: "seller pro",
    email: demoAccounts.sellerPro,
    password: demoPasswords.sellerPro,
    modules: [
      "/dashboard",
      "/messages",
      "/listings/new",
      "/dashboard?tab=listings",
      "/dashboard?tab=saved-searches",
      "/dashboard?tab=open-houses",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/investor-dashboard", "/projects"],
    expectedNav: [/My Listings/i, /Saved Searches/i, /Open Houses/i],
  },
  {
    label: "agent pro",
    email: demoAccounts.agentPro,
    password: demoPasswords.agentPro,
    modules: [
      "/dashboard",
      "/messages",
      "/listings/new",
      "/dashboard?tab=listings",
      "/dashboard?tab=analytics",
      "/dashboard?tab=data-input",
      "/dashboard?tab=leads",
      "/dashboard?tab=contacts",
      "/dashboard?tab=open-houses",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/projects", "/listings/new-building"],
    expectedNav: [/Analytics/i, /Data Input/i, /Leads/i, /Contacts/i],
  },
  {
    label: "developer pro",
    email: demoAccounts.developerPro,
    password: demoPasswords.developerPro,
    modules: [
      "/dashboard",
      "/messages",
      "/listings/new",
      "/listings/new-building",
      "/projects",
      "/portfolios",
      "/dashboard?tab=analytics",
      "/dashboard?tab=projects",
      "/dashboard?tab=portfolios",
      "/dashboard?tab=contacts",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/investor-dashboard"],
    expectedNav: [/Projects/i, /Portfolios/i, /Analytics/i, /Contacts/i],
  },
  {
    label: "investor private",
    email: demoAccounts.investorPrivate,
    password: demoPasswords.investorPrivate,
    modules: [
      "/dashboard",
      "/messages",
      "/investor-dashboard",
      "/firesale",
      "/dashboard?tab=saved",
      "/dashboard?tab=saved-searches",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/listings/new", "/projects"],
    expectedNav: [/Saved/i, /Messages/i, /Billing/i],
  },
  {
    label: "investor institutional",
    email: demoAccounts.investorInstitutional,
    password: demoPasswords.investorInstitutional,
    modules: [
      "/dashboard",
      "/messages",
      "/investor-dashboard",
      "/firesale",
      "/dashboard?tab=saved",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/projects"],
    expectedNav: [/Messages/i, /Billing/i],
  },
  {
    label: "professional architect pro",
    email: demoAccounts.professionalArchitect,
    password: demoPasswords.professionalArchitect,
    modules: [
      "/dashboard",
      "/messages",
      "/professionals/me",
      "/dashboard?tab=services",
      "/dashboard?tab=booking",
      "/dashboard?tab=leads",
      "/dashboard?tab=contacts",
      "/dashboard?tab=analytics",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/listings/new", "/projects", "/investor-dashboard"],
    expectedNav: [/My Services/i, /Booking/i, /Leads/i, /Analytics/i],
  },
  {
    label: "professional lawyer pro",
    email: demoAccounts.professionalLawyer,
    password: demoPasswords.professionalLawyer,
    modules: [
      "/dashboard",
      "/messages",
      "/professionals/me",
      "/dashboard?tab=services",
      "/dashboard?tab=leads",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/listings/new"],
    expectedNav: [/My Services/i, /Leads/i, /Billing/i],
  },
  {
    label: "professional valuer pro",
    email: demoAccounts.professionalValuer,
    password: demoPasswords.professionalValuer,
    modules: [
      "/dashboard",
      "/messages",
      "/professionals/me",
      "/dashboard?tab=services",
      "/dashboard?tab=billing",
    ],
    gatedModules: ["/admin", "/listings/new"],
    expectedNav: [/My Services/i, /Billing/i],
  },
  {
    label: "admin",
    email: demoAccounts.admin,
    password: demoPasswords.admin,
    modules: [
      "/dashboard",
      "/admin",
      "/platform-map",
      "/messages",
      "/dashboard?tab=data-input",
      "/dashboard?tab=billing",
      "/dashboard?tab=settings",
    ],
    expectedNav: [/Admin Dashboard/i, /Data Input/i, /Billing/i],
  },
];

const publicModules = [
  "/",
  "/listings",
  "/auctions",
  "/professionals",
  "/pricing",
  "/open-houses",
  "/ai-assistant",
  "/document-templates",
  "/contact",
  "/api-docs",
];

async function expectRenderablePage(page: Page): Promise<void> {
  await page.waitForLoadState("load", { timeout: 20_000 });
  await expect(page.locator("body")).toContainText(/\S/, { timeout: 20_000 });
  await expect(page.locator("body")).not.toContainText(/Private preview|passcode|Configuration Error/i);
  await page
    .waitForFunction(() => document.querySelectorAll("body *").length > 5, null, {
      timeout: 15_000,
    })
    .catch(() => undefined);
  const nodeCount = await page.locator("body *").count();
  expect(nodeCount).toBeGreaterThan(5);
}

async function signIn(page: Page, account: AccountCase): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(account.email);
  await page.locator('input[type="password"]').first().fill(account.password);
  await page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .click();
  await page.waitForURL(/\/dashboard|\/onboarding|\/admin/, { timeout: 30_000 });
  expect(page.url(), `${account.label} should not remain on login`).not.toContain("/login");
}

test.describe("live role/tier matrix", () => {
  test.skip(!enabled, "Set PLAYWRIGHT_BASE_URL and E2E_USE_SEEDED_DEMO_ACCOUNTS=true to run live matrix.");

  test("public modules render on the live origin", async ({ page }) => {
    const errors: string[] = [];
    let currentRoute = "initial";
    page.on("pageerror", (error) => errors.push(`${currentRoute}: ${error.message}`));

    for (const route of publicModules) {
      currentRoute = route;
      await page.goto(route);
      await expectRenderablePage(page);
    }

    expect(errors, "uncaught JS errors on public modules").toHaveLength(0);
  });

  for (const account of accountCases) {
    test(`${account.label} modules and gates render`, async ({ page }) => {
      test.setTimeout(180_000);
      const errors: string[] = [];
      let currentRoute = "login";
      page.on("pageerror", (error) => errors.push(`${currentRoute}: ${error.message}`));

      await signIn(page, account);
      await expectRenderablePage(page);

      for (const expected of account.expectedNav ?? []) {
        await expect(page.locator("body")).toContainText(expected, {
          timeout: 15_000,
        });
      }

      for (const route of account.modules) {
        currentRoute = route;
        await page.goto(route);
        await expectRenderablePage(page);
        expect(page.url(), `${account.label} ${route} should not bounce to login`).not.toContain("/login");
      }

      for (const route of account.gatedModules ?? []) {
        currentRoute = route;
        await page.goto(route);
        await expectRenderablePage(page);
        expect(page.url(), `${account.label} gated ${route} should not bounce to login`).not.toContain("/login");
      }

      expect(errors, `uncaught JS errors for ${account.label}`).toHaveLength(0);
    });
  }
});
