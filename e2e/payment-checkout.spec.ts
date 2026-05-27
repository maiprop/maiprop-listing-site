/**
 * Stripe checkout E2E.
 *
 * Verifies the upgrade flow from Pricing → create-checkout edge function →
 * Stripe Checkout redirect. Does NOT complete payment (would require a real
 * Stripe test account with a known Price ID in test mode); we stop at the
 * redirect to checkout.stripe.com and assert the session was created.
 *
 * Skips gracefully when the real Supabase project is not reachable (e.g. on
 * PRs with only CI stub env).
 */
import { test, expect } from "@playwright/test";
import { readCleanEnv } from "./helpers/env";

const SUPABASE_URL = readCleanEnv("VITE_SUPABASE_URL");
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "buyer.free@maiprop.demo";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "Demo2025!";

const canRun =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("abcdefghijklmnop");

test.describe("Stripe checkout flow", () => {
  test.skip(!canRun, "Requires real Supabase project + seeded buyer.free account");

  test("free user can initiate Stripe checkout from pricing page", async ({ page, context }) => {
    // Sign in as a free-tier user.
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    await page.locator('button[type="submit"]').first().click();
    await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });

    // Navigate to pricing.
    await page.goto("/pricing");
    await page.waitForLoadState("networkidle");

    // Click the first "Upgrade" / "Subscribe" CTA. Button text varies by locale.
    const upgradeBtn = page
      .locator('button:has-text("Upgrade"), button:has-text("Subscribe"), a:has-text("Upgrade")')
      .first();
    await expect(upgradeBtn).toBeVisible({ timeout: 10_000 });

    // create-checkout returns a URL; the app either navigates to it or opens it
    // in a new tab. Handle both.
    const [popup] = await Promise.all([
      context.waitForEvent("page", { timeout: 15_000 }).catch(() => null),
      upgradeBtn.click(),
    ]);

    const target = popup ?? page;
    await target.waitForURL(/checkout\.stripe\.com|billing\.stripe\.com/, { timeout: 20_000 });
    expect(target.url()).toMatch(/stripe\.com/);
  });

  test("create-checkout rejects unauthenticated requests", async ({ request }) => {
    // Direct call to the edge function without an Authorization header must 401.
    const res = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      data: { plan: "pro" },
      failOnStatusCode: false,
    });
    expect([401, 403]).toContain(res.status());
  });
});
