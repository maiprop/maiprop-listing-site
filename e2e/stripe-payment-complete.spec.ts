/**
 * Deliberate Stripe test-payment E2E.
 *
 * This creates a real Stripe test-mode subscription and waits for the app's
 * check-subscription function to observe the webhook-synced entitlement.
 * It is opt-in because it mutates billing state for the chosen account.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type APIRequestContext, type Locator, type Page } from "@playwright/test";
import { readCleanEnv } from "./helpers/env";

function readDotEnv(): Record<string, string> {
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
}

const dotEnv = readDotEnv();

function env(...keys: string[]): string {
  for (const key of keys) {
    const value = readCleanEnv(key) || readCleanEnv(`DOTENV_${key}`);
    if (value) return value;
    const dotEnvValue = dotEnv[key]?.trim();
    if (dotEnvValue) return dotEnvValue;
  }
  return "";
}

const SUPABASE_URL = env("VITE_SUPABASE_URL", "SUPABASE_URL");
const SUPABASE_ANON_KEY = env(
  "VITE_SUPABASE_PUBLISHABLE_KEY",
  "VITE_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
);
const COMPLETE_PAYMENT = env("E2E_COMPLETE_STRIPE_PAYMENT") === "true";
const TEST_EMAIL = env("E2E_STRIPE_PAYMENT_EMAIL", "E2E_TEST_EMAIL");
const TEST_PASSWORD = env("E2E_STRIPE_PAYMENT_PASSWORD", "E2E_TEST_PASSWORD", "E2E_DEMO_PASSWORD") || "Demo2025!";
const APP_ORIGIN = env("PLAYWRIGHT_BASE_URL") || "http://localhost:8080";
const PAID_ADDON_KEYS = (env("E2E_STRIPE_ADDON_KEYS") || "valuation_single,property_report_single")
  .split(",")
  .map((key) => key.trim())
  .filter(Boolean);
const API_SUBSCRIPTION_CYCLES = (env("E2E_STRIPE_API_SUBSCRIPTION_CYCLES") || "")
  .split(",")
  .map((cycle) => cycle.trim())
  .filter((cycle): cycle is "monthly" | "annual" => cycle === "monthly" || cycle === "annual");
const REQUIRE_STRIPE_TAX_AMOUNT = env("E2E_REQUIRE_STRIPE_TAX_AMOUNT") === "true";
const EXPECTED_STRIPE_TAX_RATE = Number(env("E2E_EXPECT_STRIPE_TAX_RATE") || "0.24");

const canRun = COMPLETE_PAYMENT && SUPABASE_URL.startsWith("https://") && Boolean(SUPABASE_ANON_KEY) && Boolean(TEST_EMAIL);
const SUPABASE_AUTH_ATTEMPTS = 3;

type SupabasePasswordSession = {
  access_token: string;
  refresh_token: string;
  user?: { id?: string };
};

type CheckoutPayload = {
  url?: string;
  session_id?: string | null;
  checkout_type?: string;
  mode?: string;
  error?: string;
};

async function fillFirstVisible(candidates: Locator[], value: string) {
  for (const candidate of candidates) {
    const count = await candidate.count().catch(() => 1);
    for (let index = 0; index < Math.max(count, 1); index += 1) {
      try {
        await candidate.nth(index).fill(value, { timeout: 4_000 });
        return;
      } catch {
        // Try the next Stripe Checkout variant.
      }
    }
  }
  throw new Error(`Could not fill Stripe Checkout field with value ${value}`);
}

async function fillStripeCheckoutCard(page: Page) {
  const secureFrame = page.frameLocator('iframe[title*="Secure"], iframe[name^="__privateStripeFrame"]').first();
  await fillFirstVisible([
    page.getByLabel(/card number/i),
    page.locator('input[name="cardNumber"]'),
    page.locator('input[autocomplete="cc-number"]'),
    page.getByPlaceholder(/1234 1234/i),
    secureFrame.getByLabel(/card number/i),
    secureFrame.locator('input[name="cardNumber"]'),
    secureFrame.locator('input[autocomplete="cc-number"]'),
    secureFrame.getByPlaceholder(/1234 1234/i),
  ], "4242424242424242");
  await fillFirstVisible([
    page.getByLabel(/expiration|expiry/i),
    page.locator('input[name="cardExpiry"]'),
    page.locator('input[autocomplete="cc-exp"]'),
    page.getByPlaceholder(/MM\s*\/\s*YY/i),
    secureFrame.getByLabel(/expiration|expiry/i),
    secureFrame.locator('input[name="cardExpiry"]'),
    secureFrame.locator('input[autocomplete="cc-exp"]'),
    secureFrame.getByPlaceholder(/MM\s*\/\s*YY/i),
  ], "1234");
  await fillFirstVisible([
    page.getByLabel(/security code|cvc|cvv/i),
    page.locator('input[name="cardCvc"]'),
    page.locator('input[autocomplete="cc-csc"]'),
    page.getByPlaceholder(/CVC|CVV/i),
    secureFrame.getByLabel(/security code|cvc|cvv/i),
    secureFrame.locator('input[name="cardCvc"]'),
    secureFrame.locator('input[autocomplete="cc-csc"]'),
    secureFrame.getByPlaceholder(/CVC|CVV/i),
  ], "123");

  await page.getByLabel(/cardholder name|name on card/i).fill("Codex Stripe Test", { timeout: 2_000 }).catch(() => undefined);
}

async function fillStripeBillingAddress(page: Page) {
  await page.getByLabel(/country|region/i).selectOption({ label: "Greece" }, { timeout: 2_000 }).catch(() => undefined);
  await fillFirstVisible([
    page.getByLabel(/address line 1/i),
    page.locator('input[name="billingAddressLine1"]'),
    page.locator('input[autocomplete="billing address-line1"]'),
    page.getByPlaceholder(/address line 1/i),
  ], "Syntagma Square 1");
  await fillFirstVisible([
    page.getByLabel(/postal code|postcode|zip/i),
    page.locator('input[name="billingPostalCode"]'),
    page.locator('input[autocomplete="billing postal-code"]'),
    page.getByPlaceholder(/postal code|postcode|zip/i),
  ], "10563");
  await fillFirstVisible([
    page.getByLabel(/^city$/i),
    page.locator('input[name="billingLocality"]'),
    page.locator('input[autocomplete="billing address-level2"]'),
    page.getByPlaceholder(/^city$/i),
  ], "Athens");
}

async function completeStripeCheckout(page: Page) {
  await fillStripeCheckoutCard(page);
  await fillStripeBillingAddress(page);
  await page.keyboard.press("Tab").catch(() => undefined);
  await page.waitForTimeout(1_500);
  const submitButton = page.getByRole("button", { name: /subscribe|pay|start trial/i });
  await expect(submitButton).toBeEnabled({ timeout: 10_000 });
  await submitButton.click();
  await page.waitForURL(/[?&]checkout=success/, { timeout: 120_000 });
}

async function accessTokenFromStorage(page: Page): Promise<string> {
  return await page.evaluate(() => {
    for (const [key, value] of Object.entries(localStorage)) {
      if (!key.startsWith("sb-") || !key.endsWith("-auth-token")) continue;
      try {
        const parsed = JSON.parse(String(value));
        if (parsed?.access_token) return parsed.access_token as string;
      } catch {
        // Continue scanning.
      }
    }
    return "";
  });
}

function authStorageKey(): string {
  return `sb-${new URL(SUPABASE_URL).hostname.split(".")[0]}-auth-token`;
}

async function requestSupabaseSession(request: APIRequestContext): Promise<SupabasePasswordSession> {
  let lastStatus = 0;
  let lastBody = "";

  for (let attempt = 1; attempt <= SUPABASE_AUTH_ATTEMPTS; attempt += 1) {
    try {
      const response = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        headers: {
          apikey: SUPABASE_ANON_KEY,
          Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
          "Content-Type": "application/json",
        },
        data: {
          email: TEST_EMAIL,
          password: TEST_PASSWORD,
        },
        failOnStatusCode: false,
        timeout: 30_000,
      });
      lastStatus = response.status();
      lastBody = await response.text();

      if (response.ok()) {
        const session = JSON.parse(lastBody) as Partial<SupabasePasswordSession>;
        expect(session.access_token, "access token").toBeTruthy();
        expect(session.refresh_token, "refresh token").toBeTruthy();
        expect(session.user?.id, "auth user id").toBeTruthy();
        return session as SupabasePasswordSession;
      }

      if (![408, 429, 500, 502, 503, 504, 520, 522, 524].includes(lastStatus)) break;
    } catch (error) {
      lastStatus = 0;
      lastBody = error instanceof Error ? error.message : String(error);
    }

    await new Promise((resolveRetry) => setTimeout(resolveRetry, attempt * 2_000));
  }

  throw new Error(`Supabase Auth login failed with HTTP ${lastStatus}: ${lastBody.slice(0, 240)}`);
}

async function installSupabaseSession(page: Page, session: SupabasePasswordSession): Promise<void> {
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
}

function authedHeaders(token: string): Record<string, string> {
  return {
    apikey: SUPABASE_ANON_KEY,
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function checkoutSessionIdFromUrl(url: string): string | null {
  return url.match(/(cs_test_[^/?#]+)/)?.[1] ?? null;
}

async function startAddonCheckout(
  request: APIRequestContext,
  token: string,
  addonKey: string,
): Promise<CheckoutPayload> {
  const response = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
    headers: {
      ...authedHeaders(token),
      Origin: APP_ORIGIN,
    },
    data: {
      addon_key: addonKey,
      success_url: `/dashboard/billing?checkout=success&e2e_addon=${addonKey}`,
      cancel_url: `/dashboard/billing?checkout=cancelled&e2e_addon=${addonKey}`,
    },
    failOnStatusCode: false,
    timeout: 30_000,
  });
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body.url, "Stripe Checkout URL").toContain("https://checkout.stripe.com/");
  expect(body.session_id, "Stripe Checkout Session id").toMatch(/^cs_test_/);
  expect(body.checkout_type).toBe("addon");
  return body as CheckoutPayload;
}

async function startSubscriptionCheckout(
  request: APIRequestContext,
  token: string,
  billingCycle: "monthly" | "annual",
): Promise<CheckoutPayload> {
  const response = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
    headers: {
      ...authedHeaders(token),
      Origin: APP_ORIGIN,
    },
    data: {
      plan: "pro",
      billing_cycle: billingCycle,
      success_url: `/dashboard/billing?checkout=success&e2e_cycle=${billingCycle}`,
      cancel_url: `/dashboard/billing?checkout=cancelled&e2e_cycle=${billingCycle}`,
    },
    failOnStatusCode: false,
    timeout: 30_000,
  });
  const body = await response.json().catch(() => ({}));
  expect(response.status(), JSON.stringify(body)).toBe(200);
  expect(body.url, "Stripe Checkout URL").toContain("https://checkout.stripe.com/");
  expect(body.session_id, "Stripe Checkout Session id").toMatch(/^cs_test_/);
  expect(body.checkout_type).toBe("subscription");
  expect(body.mode ?? "test").toBe("test");
  return body as CheckoutPayload;
}

async function pollSyncedSubscription(
  request: APIRequestContext,
  token: string,
) {
  await expect.poll(async () => {
    const response = await request.post(`${SUPABASE_URL}/functions/v1/check-subscription`, {
      headers: authedHeaders(token),
      data: { refresh: true },
      failOnStatusCode: false,
    });
    if (!response.ok()) return { subscribed: false, product_id: null, status: response.status() };
    const body = await response.json();
    return {
      subscribed: Boolean(body.subscribed),
      product_id: body.product_id ?? null,
      subscription_status: body.subscription_status ?? body.status ?? null,
      status: response.status(),
    };
  }, {
    intervals: [2_000, 4_000, 8_000, 12_000],
    timeout: 60_000,
  }).toMatchObject({ subscribed: true });
}

async function pollPaidInvoiceAndReceipt(
  request: APIRequestContext,
  token: string,
) {
  await expect.poll(async () => {
    const response = await request.post(`${SUPABASE_URL}/functions/v1/get-invoices`, {
      headers: authedHeaders(token),
      data: {},
      failOnStatusCode: false,
      timeout: 30_000,
    });
    if (!response.ok()) {
      return {
        paid_invoice: false,
        hosted_invoice_url: false,
        invoice_pdf: false,
        receipt_url: false,
        automatic_tax_enabled: false,
        status: response.status(),
      };
    }
    const body = await response.json();
    const invoice = (body.invoices ?? []).find((candidate: Record<string, unknown>) =>
      candidate.status === "paid" &&
      Number(candidate.amount_paid ?? 0) > 0 &&
      Boolean(candidate.hosted_invoice_url) &&
      Boolean(candidate.invoice_pdf)
    );
      return {
        paid_invoice: Boolean(invoice),
        hosted_invoice_url: Boolean(invoice?.hosted_invoice_url),
        invoice_pdf: Boolean(invoice?.invoice_pdf),
        receipt_url: Boolean(invoice?.receipt_url),
      automatic_tax_enabled: invoice?.automatic_tax
        ? (invoice.automatic_tax as { enabled?: boolean }).enabled === true
        : false,
      tax_amount_present: typeof invoice?.tax_amount === "number",
      tax_amount_positive: Number(invoice?.tax_amount ?? 0) > 0,
      status: response.status(),
    };
  }, {
    intervals: [4_000, 8_000, 12_000, 16_000],
    timeout: 90_000,
  }).toMatchObject({
    paid_invoice: true,
    hosted_invoice_url: true,
    invoice_pdf: true,
    receipt_url: true,
    automatic_tax_enabled: true,
    tax_amount_present: true,
  });

  if (REQUIRE_STRIPE_TAX_AMOUNT) {
    await expect.poll(async () => {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/get-invoices`, {
        headers: authedHeaders(token),
        data: {},
        failOnStatusCode: false,
        timeout: 30_000,
      });
      if (!response.ok()) return { tax_amount_positive: false, status: response.status() };
      const body = await response.json();
      const invoice = (body.invoices ?? []).find((candidate: Record<string, unknown>) =>
        candidate.status === "paid" &&
        Number(candidate.amount_paid ?? 0) > 0 &&
        Boolean(candidate.hosted_invoice_url) &&
        Boolean(candidate.invoice_pdf)
      );
      return {
        tax_amount_positive: Number(invoice?.tax_amount ?? 0) > 0,
        tax_amount: Number(invoice?.tax_amount ?? 0),
        tax_rate_matches: Number(invoice?.subtotal ?? 0) > 0 &&
          Math.abs(Number(invoice?.tax_amount ?? 0) - Number(invoice?.subtotal ?? 0) * EXPECTED_STRIPE_TAX_RATE) < 0.02,
        subtotal: Number(invoice?.subtotal ?? 0),
        automatic_tax_enabled: invoice?.automatic_tax
          ? (invoice.automatic_tax as { enabled?: boolean }).enabled === true
          : false,
        status: response.status(),
      };
    }, {
      intervals: [4_000, 8_000, 12_000],
      timeout: 60_000,
    }).toMatchObject({
      tax_amount_positive: true,
      tax_rate_matches: true,
    });
  }
}

async function pollAddonDelivery(
  request: APIRequestContext,
  token: string,
  sessionId: string,
  addonKey: string,
) {
  const query = new URLSearchParams({
    select: "addon_key,status,credits_granted,credits_consumed,stripe_session_id,checkout_mode",
    stripe_session_id: `eq.${sessionId}`,
    limit: "1",
  });
  await expect.poll(async () => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/addon_purchases?${query}`, {
      headers: authedHeaders(token),
      failOnStatusCode: false,
      timeout: 30_000,
    });
    if (!response.ok()) {
      return {
        delivered: false,
        addon_key: null,
        status: response.status(),
        credits_granted: 0,
        credits_remaining: 0,
      };
    }
    const rows = await response.json();
    const row = Array.isArray(rows) ? rows[0] : null;
    const granted = Number(row?.credits_granted ?? 0);
    const consumed = Number(row?.credits_consumed ?? 0);
    return {
      delivered: Boolean(row) && row.addon_key === addonKey && granted > consumed,
      addon_key: row?.addon_key ?? null,
      ledger_status: row?.status ?? null,
      checkout_mode: row?.checkout_mode ?? null,
      credits_granted: granted,
      credits_remaining: Math.max(granted - consumed, 0),
      status: response.status(),
    };
  }, {
    intervals: [2_000, 4_000, 8_000, 12_000],
    timeout: 60_000,
  }).toMatchObject({
    delivered: true,
    addon_key: addonKey,
    ledger_status: "paid",
    checkout_mode: "payment",
  });
}

test.describe("Stripe test payment completion", () => {
  test.describe.configure({ mode: "serial", retries: 0 });
  test.skip(!canRun, "Set E2E_COMPLETE_STRIPE_PAYMENT=true, Supabase URL/key, and E2E_STRIPE_PAYMENT_EMAIL to create a Stripe test subscription");

  test("completes test-card subscription checkout and observes synced entitlement", async ({ page, context, request }) => {
    test.setTimeout(240_000);
    const session = await requestSupabaseSession(request);
    await installSupabaseSession(page, session);

    await page.goto("/pricing?audience=participant");
    await page.waitForLoadState("networkidle");
    await page.getByRole("button", { name: /accept all|reject optional/i }).click({ timeout: 3_000 }).catch(() => {});

    const upgradeButton = page.locator("#main-content").getByRole("button", {
      name: /get pro plan|get started|get pro/i,
    }).first();
    await expect(upgradeButton).toBeVisible({ timeout: 10_000 });

    const checkoutResponsePromise = page.waitForResponse((response) =>
      response.url().includes("/functions/v1/create-checkout") &&
      response.request().method() === "POST",
      { timeout: 30_000 },
    );
    const [popup, checkoutResponse] = await Promise.all([
      context.waitForEvent("page", { timeout: 15_000 }).catch(() => null),
      checkoutResponsePromise,
      upgradeButton.click(),
    ]);
    const checkoutPayload = await checkoutResponse.json().catch(() => ({})) as CheckoutPayload;

    const checkoutPage = popup ?? page;
    await checkoutPage.waitForURL(/checkout\.stripe\.com/, { timeout: 25_000 });
    const checkoutUrl = checkoutPage.url();
    expect(checkoutUrl, "must be Stripe test-mode Checkout").toContain("cs_test_");
    const checkoutSessionId = checkoutPayload.session_id ??
      checkoutSessionIdFromUrl(checkoutPayload.url ?? checkoutUrl);
    expect(checkoutSessionId, JSON.stringify(checkoutPayload)).toMatch(/^cs_test_/);
    expect(checkoutPayload.checkout_type ?? "subscription").toBe("subscription");
    expect(checkoutPayload.mode ?? "test").toBe("test");

    await completeStripeCheckout(checkoutPage);

    const appPage = checkoutPage;
    const token = await accessTokenFromStorage(appPage);
    expect(token).toBeTruthy();

    await pollSyncedSubscription(request, token);
    await pollPaidInvoiceAndReceipt(request, token);
  });

  for (const billingCycle of API_SUBSCRIPTION_CYCLES) {
    test(`completes test-card ${billingCycle} subscription checkout via create-checkout`, async ({ page, request }) => {
      test.setTimeout(240_000);
      const session = await requestSupabaseSession(request);
      await installSupabaseSession(page, session);

      await page.goto("/dashboard/billing");
      await page.waitForLoadState("domcontentloaded");
      const token = await accessTokenFromStorage(page) || session.access_token;
      expect(token).toBeTruthy();

      const checkout = await startSubscriptionCheckout(request, token, billingCycle);
      await page.goto(checkout.url!);
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 25_000 });
      expect(page.url(), "must be Stripe test-mode Checkout").toContain("cs_test_");

      await completeStripeCheckout(page);
      await pollSyncedSubscription(request, token);
      await pollPaidInvoiceAndReceipt(request, token);
    });
  }

  for (const addonKey of PAID_ADDON_KEYS) {
    test(`completes test-card ${addonKey} add-on checkout and observes delivered credits`, async ({ page, request }) => {
      test.setTimeout(240_000);
      const session = await requestSupabaseSession(request);
      await installSupabaseSession(page, session);

      await page.goto("/dashboard/billing");
      await page.waitForLoadState("domcontentloaded");
      const token = await accessTokenFromStorage(page) || session.access_token;
      expect(token).toBeTruthy();

      const checkout = await startAddonCheckout(request, token, addonKey);
      await page.goto(checkout.url!);
      await page.waitForURL(/checkout\.stripe\.com/, { timeout: 25_000 });
      expect(page.url(), "must be Stripe test-mode Checkout").toContain("cs_test_");

      await completeStripeCheckout(page);
      expect(checkout.session_id).toBeTruthy();
      await pollAddonDelivery(request, token, checkout.session_id!, addonKey);
    });
  }
});
