/**
 * Live AI quota smoke.
 *
 * Non-destructive: signs in with seeded demo accounts, opens an existing public
 * listing, and verifies the AI quota UI communicates the correct free/pro caps.
 * It does not click "Load AI insights" and does not consume AI quota.
 */
import { expect, test, type Page } from "@playwright/test";
import { demoAccounts, demoPasswords } from "./helpers/demoAccounts";

type QuotaAccount = {
  label: string;
  email: string;
  password: string;
  expectedAllowance: RegExp;
};

const enabled =
  process.env.E2E_USE_SEEDED_DEMO_ACCOUNTS === "true" &&
  Boolean(process.env.PLAYWRIGHT_BASE_URL);
const LISTING_LOOKUP_ATTEMPTS = 6;
const LISTING_LOOKUP_DELAY_MS = 1_000;

const accounts: QuotaAccount[] = [
  {
    label: "buyer free",
    email: demoAccounts.buyerFree,
    password: demoPasswords.buyerFree,
    expectedAllowance: /\bFree\b.*AI insight requests remaining this month/i,
  },
  {
    label: "buyer pro",
    email: demoAccounts.buyerPro,
    password: demoPasswords.buyerPro,
    expectedAllowance: /\bPro\b.*AI insight requests remaining this month/i,
  },
];

async function signIn(page: Page, account: QuotaAccount) {
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

async function firstListingPath(page: Page): Promise<string> {
  let lastFailure = "not attempted";

  for (let attempt = 1; attempt <= LISTING_LOOKUP_ATTEMPTS; attempt += 1) {
    try {
      const response = await page.request.get("/api/public/listings?limit=1", { timeout: 10_000 });
      const text = await response.text();

      if (response.ok()) {
        const payload = JSON.parse(text);
        const listingId = payload?.data?.[0]?.id;
        if (typeof listingId === "string" && listingId.length > 0) return `/property/${listingId}`;
        lastFailure = `HTTP ${response.status()} without a listing id: ${text.slice(0, 240)}`;
      } else {
        lastFailure = `HTTP ${response.status()}: ${text.slice(0, 240)}`;
      }
    } catch (error) {
      lastFailure = error instanceof Error ? error.message : String(error);
    }

    if (attempt < LISTING_LOOKUP_ATTEMPTS) {
      await page.waitForTimeout(LISTING_LOOKUP_DELAY_MS * attempt);
    }
  }

  throw new Error(
    `public listings API did not return a listing after ${LISTING_LOOKUP_ATTEMPTS} attempts. Last response: ${lastFailure}`,
  );
}

test.describe("live AI quota smoke", () => {
  test.skip(!enabled, "Set PLAYWRIGHT_BASE_URL and E2E_USE_SEEDED_DEMO_ACCOUNTS=true to run live AI quota smoke.");

  for (const account of accounts) {
    test(`${account.label} sees the correct AI insight quota copy`, async ({ page }) => {
      test.setTimeout(90_000);
      await signIn(page, account);

      const listingPath = await firstListingPath(page);
      await page.goto(listingPath);
      await expect(page.locator("body")).toContainText(/AI Market Insights/i, { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(/Run AI analysis when you need it/i, { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(account.expectedAllowance, { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(/Load AI insights|Refresh AI insights/i);
    });
  }
});
