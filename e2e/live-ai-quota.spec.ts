/**
 * Live AI quota smoke.
 *
 * Non-destructive: signs in with seeded demo accounts, opens an existing public
 * listing, and verifies the AI quota UI communicates the correct free/pro caps.
 * It does not click "Load AI insights" and does not consume AI quota.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { demoAccounts, demoPasswords } from "./helpers/demoAccounts";
import { readCleanEnv } from "./helpers/env";

type QuotaAccount = {
  label: string;
  email: string;
  password: string;
  minimumLimit: number;
};

type QuotaStatus = {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number;
};

const SUPABASE_URL = readCleanEnv("VITE_SUPABASE_URL", "SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = readCleanEnv(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_ANON_KEY",
);
const QUOTA_BUCKETS = [
  "property-valuation",
  "neighbourhood-report",
  "property-pois",
] as const;

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
    minimumLimit: 5,
  },
  {
    label: "buyer pro",
    email: demoAccounts.buyerPro,
    password: demoPasswords.buyerPro,
    minimumLimit: 50,
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

async function quotaSnapshot(
  request: APIRequestContext,
  account: QuotaAccount,
): Promise<Record<string, QuotaStatus>> {
  const authResponse = await request.post(
    `${SUPABASE_URL}/auth/v1/token?grant_type=password`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        "Content-Type": "application/json",
      },
      data: { email: account.email, password: account.password },
      failOnStatusCode: false,
    },
  );
  expect(authResponse.status(), `${account.label} auth preflight`).toBe(200);
  const authBody = (await authResponse.json()) as { access_token?: unknown };
  expect(typeof authBody.access_token).toBe("string");

  const quotaResponse = await request.post(
    `${SUPABASE_URL}/functions/v1/ai-quota-status`,
    {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${String(authBody.access_token)}`,
        Origin: process.env.PLAYWRIGHT_BASE_URL ?? "https://portal.maiprop.co",
      },
      data: { buckets: QUOTA_BUCKETS },
      failOnStatusCode: false,
    },
  );
  expect(quotaResponse.status(), `${account.label} quota status`).toBe(200);
  const quotaBody = (await quotaResponse.json()) as {
    quotas?: Record<string, QuotaStatus>;
  };
  expect(quotaBody.quotas).toBeTruthy();
  return quotaBody.quotas ?? {};
}

function expectValidQuotaSnapshot(
  snapshot: Record<string, QuotaStatus>,
  account: QuotaAccount,
) {
  for (const bucket of QUOTA_BUCKETS) {
    const quota = snapshot[bucket];
    expect(quota, `${account.label} ${bucket} quota`).toBeTruthy();
    expect(quota.limit, `${account.label} ${bucket} limit`).toBeGreaterThanOrEqual(
      account.minimumLimit,
    );
    expect(quota.used, `${account.label} ${bucket} usage`).toBeGreaterThanOrEqual(0);
    expect(quota.used, `${account.label} ${bucket} usage`).toBeLessThanOrEqual(quota.limit);
    expect(quota.allowed).toBe(quota.used < quota.limit);
  }
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
    test(`${account.label} sees lazy AI copy and quota checks do not consume usage`, async ({ page, request }) => {
      test.setTimeout(90_000);
      const before = await quotaSnapshot(request, account);
      expectValidQuotaSnapshot(before, account);
      await signIn(page, account);

      const listingPath = await firstListingPath(page);
      await page.goto(listingPath);
      await expect(page.locator("body")).toContainText(/AI Market Insights/i, { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(/Run AI analysis when you need it/i, { timeout: 20_000 });
      await expect(page.locator("body")).toContainText(
        /AI request allowance will be checked before loading/i,
        { timeout: 20_000 },
      );
      await expect(page.locator("body")).toContainText(/Load AI insights|Refresh AI insights/i);

      const after = await quotaSnapshot(request, account);
      expectValidQuotaSnapshot(after, account);
      expect(after).toEqual(before);
    });
  }
});
