/**
 * Stripe checkout E2E.
 *
 * Verifies the upgrade flow from Pricing → create-checkout edge function →
 * checkout redirect. In real billing mode this reaches Stripe Checkout; in
 * safe mock billing mode this returns to the app with checkout=success.
 *
 * Skips gracefully when the real Supabase project is not reachable (e.g. on
 * PRs with only CI stub env).
 */
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readCleanEnv } from "./helpers/env";

const SUPABASE_URL = readCleanEnv("VITE_SUPABASE_URL");
const SUPABASE_PUBLISHABLE_KEY = readCleanEnv("VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY");
const SUPABASE_SERVICE_ROLE_KEY = [
  readCleanEnv("SUPABASE_SERVICE_ROLE_KEY"),
  readCleanEnv("SUPABASE_ANON_KEY"),
].find((key) => isProbablyServiceRoleKey(key)) ?? "";
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "buyer.free@maiprop.demo";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "Demo2025!";

const canRun =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("abcdefghijklmnop");

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

async function checkoutAccount() {
  if (
    process.env.E2E_USE_SEEDED_DEMO_ACCOUNTS === "true" ||
    !SUPABASE_SERVICE_ROLE_KEY ||
    !SUPABASE_PUBLISHABLE_KEY
  ) {
    return {
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      cleanup: async () => undefined,
    };
  }

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const email = `stripe-checkout-${Date.now()}-${Math.random().toString(16).slice(2)}@maiprop.demo`;
  const password = "StripeCheckoutE2E2026!";

  const { data: created, error: createError } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { created_by: "payment-checkout-e2e" },
  });
  expect(createError, `create checkout user: ${createError?.message ?? ""}`).toBeNull();

  const userId = created.user?.id;
  expect(userId, "created checkout user id").toBeTruthy();

  const { error: onboardingError } = await admin.rpc("complete_onboarding_role_for_user", {
    p_user_id: userId,
    p_role: "buyer",
    p_participant_type: "buyer",
    p_display_name: "Stripe Checkout E2E Buyer",
    p_city: "Athens",
    p_phone: "+30 6900000000",
  } as never);
  expect(onboardingError, `complete onboarding: ${onboardingError?.message ?? ""}`).toBeNull();

  return {
    email,
    password,
    cleanup: async () => {
      await admin.auth.admin.deleteUser(userId!).catch(() => undefined);
    },
  };
}

test.describe("Stripe checkout flow", () => {
  test.skip(!canRun, "Requires real Supabase project + seeded buyer.free account");

  test("free user can initiate checkout from pricing page", async ({ page, context }) => {
    const account = await checkoutAccount();
    await context.addInitScript(() => {
      localStorage.setItem("maiprop_cookie_consent", JSON.stringify({
        accepted: true,
        functional: true,
        analytics: false,
        mapping: false,
        timestamp: Date.now(),
      }));
    });

    try {
      // Sign in as a free-tier user.
      await page.goto("/login");
      await page.locator('input[type="email"], input[name="email"]').first().fill(account.email);
      await page.locator('input[type="password"]').first().fill(account.password);
      await page.locator('button[type="submit"]').first().click();
      await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });

      // Navigate to pricing.
      await page.goto("/pricing");
      await page.waitForLoadState("networkidle");

      await page
        .getByRole("button", { name: /^accept all$/i })
        .click({ timeout: 3_000 })
        .catch(() => {});

      // Click a pricing-card CTA, not the navbar "Upgrade" link.
      const upgradeBtn = page.locator("#main-content").getByRole("button", {
        name: /get pro plan|get agent pro|get developer pro|subscribe/i,
      }).first();
      await expect(upgradeBtn).toBeVisible({ timeout: 10_000 });

      // create-checkout returns a URL; the app either navigates to it or opens it
      // in a new tab. Handle both.
      const checkoutResponsePromise = page.waitForResponse((response) =>
        response.url().includes("/functions/v1/create-checkout") &&
        response.request().method() === "POST",
        { timeout: 30_000 },
      ).catch(() => null);
      const popupPromise = context.waitForEvent("page", { timeout: 15_000 }).catch(() => null);

      await upgradeBtn.click();
      const checkoutResponse = await checkoutResponsePromise;
      expect(checkoutResponse, "create-checkout response").not.toBeNull();

      const checkoutPayload = await checkoutResponse!.json().catch(() => ({}));
      if (
        checkoutResponse!.status() === 429 &&
        (checkoutPayload as { code?: unknown }).code === "rate_limited"
      ) {
        test.skip(true, "Live create-checkout rate limit reached; retry after the rate-limit window.");
      }
      expect(checkoutResponse!.status(), JSON.stringify(checkoutPayload)).toBe(200);

      const popup = await popupPromise;
      const target = popup ?? page;
      const checkoutUrl =
        typeof checkoutPayload.url === "string" ? checkoutPayload.url : null;
      const checkoutDestinationPattern =
        /checkout\.stripe\.com|billing\.stripe\.com|[?&]checkout=success/;

      if (!checkoutDestinationPattern.test(target.url())) {
        expect(checkoutUrl, JSON.stringify(checkoutPayload)).toMatch(checkoutDestinationPattern);
        await target.goto(checkoutUrl!);
      }
      if (checkoutPayload.session_id != null) {
        expect(checkoutPayload.session_id).toMatch(/^(cs_test_|mock_session)/);
      }
      await target.waitForURL(checkoutDestinationPattern, { timeout: 20_000 });
      expect(target.url()).toMatch(/stripe\.com|[?&]checkout=success/);
    } finally {
      await account.cleanup();
    }
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
