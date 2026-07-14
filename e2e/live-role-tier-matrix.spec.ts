/**
 * Live role/tier matrix smoke.
 *
 * This suite is intentionally non-destructive. It logs in with seeded demo
 * accounts, opens role/tier-specific modules, and verifies that the app renders
 * a real shell instead of a blank screen or preview lock page. It does not
 * submit forms, create listings, start checkout, or delete accounts.
 */
import { expect, test, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { demoAccounts, demoPasswords } from "./helpers/demoAccounts";
import { cleanEnvValue } from "./helpers/env";

type AccountCase = {
  label: string;
  email: string;
  password: string;
  modules: string[];
  gatedModules?: string[];
  expectedNav?: RegExp[];
};

const readDotEnv = (): Record<string, string> => {
  const envPath = resolve(process.cwd(), ".env");
  if (!existsSync(envPath)) return {};

  return readFileSync(envPath, "utf8")
    .split(/\r?\n/)
    .reduce<Record<string, string>>((acc, line) => {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith("#")) return acc;
      const separator = trimmed.indexOf("=");
      if (separator <= 0) return acc;
      const key = trimmed.slice(0, separator).trim();
      const rawValue = trimmed.slice(separator + 1).trim();
      acc[key] = rawValue.replace(/^['"]|['"]$/g, "");
      return acc;
    }, {});
};

const dotEnv = readDotEnv();
const env = (...keys: string[]): string => {
  for (const key of keys) {
    const value = cleanEnvValue(process.env[key] ?? dotEnv[key]);
    if (value) return value;
  }
  return "";
};

const enabled =
  process.env.E2E_USE_SEEDED_DEMO_ACCOUNTS === "true" &&
  Boolean(process.env.PLAYWRIGHT_BASE_URL);
const supabaseUrl = env("SUPABASE_URL", "VITE_SUPABASE_URL");
const anonKey = env(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
);
const includeAdminAccount =
  process.env.E2E_ADMIN_SMOKE_ENABLED === "true" &&
  Boolean(process.env.E2E_ADMIN_EMAIL);
const SUPABASE_AUTH_TIMEOUT_MS = 30_000;
const SUPABASE_AUTH_ATTEMPTS = 5;
const PROFILE_NAV_ATTEMPTS = 4;
const FALLBACK_BUYER_NAV = /Buyer \/ Renter/;

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
    expectedNav: [/Analytics/i, /Data Input/i, /CRM/i],
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
    expectedNav: [/Projects/i, /Portfolios/i, /Analytics/i, /CRM/i],
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
].filter((account) => account.label !== "admin" || includeAdminAccount);

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

function authStorageKey(): string {
  try {
    return `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  } catch (_error) {
    return "sb-localhost-auth-token";
  }
}

async function requestSupabaseSession(page: Page, account: AccountCase): Promise<unknown> {
  expect(supabaseUrl, "live role matrix requires SUPABASE_URL or VITE_SUPABASE_URL").toBeTruthy();
  expect(anonKey, "live role matrix requires a Supabase publishable/anon key").toBeTruthy();

  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= SUPABASE_AUTH_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await page.request.post(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
        headers: {
          apikey: anonKey,
          "Content-Type": "application/json",
        },
        data: {
          email: account.email,
          password: account.password,
        },
        failOnStatusCode: false,
        timeout: SUPABASE_AUTH_TIMEOUT_MS,
      });
    } catch (error) {
      lastStatus = 0;
      lastBody = error instanceof Error ? error.message : String(error);
      await page.waitForTimeout(attempt * 2_000);
      continue;
    }

    lastStatus = response.status();
    lastBody = await response.text();

    if (response.ok()) {
      const session = JSON.parse(lastBody) as {
        access_token?: string;
        refresh_token?: string;
        user?: { id?: string };
      };
      expect(session.access_token, `${account.label} access token`).toBeTruthy();
      expect(session.refresh_token, `${account.label} refresh token`).toBeTruthy();
      expect(session.user?.id, `${account.label} auth user id`).toBeTruthy();
      return session;
    }

    if (![408, 429, 500, 502, 503, 504, 520, 522, 524].includes(lastStatus)) break;
    await page.waitForTimeout(attempt * 2_000);
  }

  throw new Error(
    `${account.label} Supabase session request failed with HTTP ${lastStatus}: ${lastBody.slice(0, 240)}`,
  );
}

async function signIn(page: Page, account: AccountCase): Promise<void> {
  const session = await requestSupabaseSession(page, account);
  await page.addInitScript(({ key, value }) => {
    localStorage.clear();
    localStorage.setItem(key, JSON.stringify(value));
    localStorage.setItem("maiprop_lang", "en");
    localStorage.setItem("maiprop_cookie_consent", JSON.stringify({
      accepted: true,
      functional: true,
      analytics: false,
      mapping: false,
      timestamp: Date.now(),
    }));
  }, { key: authStorageKey(), value: session });

  await page.goto("/dashboard");
  await page.waitForURL(/\/dashboard|\/onboarding|\/admin/, { timeout: 30_000 });
  expect(page.url(), `${account.label} should not remain on login`).not.toContain("/login");
}

async function expectExpectedNavigation(page: Page, account: AccountCase): Promise<void> {
  let lastError: unknown;

  for (let attempt = 1; attempt <= PROFILE_NAV_ATTEMPTS; attempt += 1) {
    try {
      for (const expected of account.expectedNav ?? []) {
        await expect(page.locator("body")).toContainText(expected, {
          timeout: 15_000,
        });
      }
      return;
    } catch (error) {
      lastError = error;
      if (attempt === PROFILE_NAV_ATTEMPTS) break;
      const bodyText = await page.locator("body").innerText().catch(() => "");
      if (FALLBACK_BUYER_NAV.test(bodyText) && account.label !== "buyer free" && account.label !== "buyer pro") {
        console.warn(
          `Dashboard rendered fallback buyer navigation for ${account.label}; reloading before retry ${attempt + 1}/${PROFILE_NAV_ATTEMPTS}.`,
        );
      }
      await page.reload({ waitUntil: "load" });
      await expectRenderablePage(page);
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`${account.label} expected navigation did not render.`);
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

      await expectExpectedNavigation(page, account);

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
