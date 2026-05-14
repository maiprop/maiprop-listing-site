/**
 * Live critical smoke checks.
 *
 * These checks are intentionally small and safe to run against staging or live:
 * they verify that critical surfaces are reachable and that protected actions
 * are rejected unless the caller has the right session/role. Destructive drills
 * still belong behind e2e/helpers/liveSafety.ts.
 */
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { demoAccounts, demoPasswords } from "./helpers/demoAccounts";

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
    const value = process.env[key] ?? dotEnv[key];
    if (value) return value;
  }
  return "";
}

const SUPABASE_URL = env("VITE_SUPABASE_URL", "SUPABASE_URL");
const ANON_KEY =
  env("VITE_SUPABASE_PUBLISHABLE_KEY", "VITE_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY");

const hasLiveSupabase =
  SUPABASE_URL.startsWith("https://") &&
  !SUPABASE_URL.includes("abcdefghijklmnop") &&
  ANON_KEY.length > 40;

function skipUnlessLiveSupabase() {
  test.skip(
    !hasLiveSupabase,
    "Requires live VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY/SUPABASE_ANON_KEY.",
  );
}

async function signInViaSupabase(
  request: APIRequestContext,
  email: string,
  password: string,
): Promise<string> {
  const res = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: {
      apikey: ANON_KEY,
      "Content-Type": "application/json",
    },
    data: { email, password },
    failOnStatusCode: false,
  });

  expect(res.status(), await res.text()).toBe(200);
  const body = (await res.json()) as { access_token?: string };
  expect(body.access_token).toBeTruthy();
  return body.access_token!;
}

async function signInViaUi(page: Page, email: string, password: string): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(email);
  await page.locator('input[type="password"]').first().fill(password);
  await page
    .locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")')
    .first()
    .click();
  await page.waitForURL(/\/dashboard|\/onboarding|\/admin/, { timeout: 25_000 });
}

async function expectRenderablePage(page: Page): Promise<void> {
  await expect(page.locator("body")).toContainText(/\S/, { timeout: 15_000 });
  await expect(page.locator("nav, header, main, [role='main']").first()).toBeAttached({
    timeout: 10_000,
  });
}

test.describe("Live critical smoke checks", () => {
  test.describe.configure({ mode: "serial" });

  test("account deletion edge function rejects anonymous callers", async ({ request }) => {
    skipUnlessLiveSupabase();

    const res = await request.post(`${SUPABASE_URL}/functions/v1/delete-account`, {
      headers: { apikey: ANON_KEY },
      data: {},
      failOnStatusCode: false,
    });

    expect([401, 403]).toContain(res.status());
  });

  test("checkout eligibility blocks invite-only investor plans for a regular buyer", async ({ request }) => {
    skipUnlessLiveSupabase();

    const token = await signInViaSupabase(
      request,
      demoAccounts.buyerFree,
      demoPasswords.buyerFree,
    );

    const res = await request.post(`${SUPABASE_URL}/functions/v1/create-checkout`, {
      headers: {
        apikey: ANON_KEY,
        Authorization: `Bearer ${token}`,
        Origin: "http://localhost:8080",
      },
      data: { plan: "investor_private" },
      failOnStatusCode: false,
    });

    expect(res.status(), await res.text()).toBe(403);
  });

  test("non-admin users cannot reach the role approval surface", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signInViaUi(page, demoAccounts.buyerFree, demoPasswords.buyerFree);
    await page.goto("/admin?tab=invitations");
    await page.waitForURL(/\/dashboard/, { timeout: 15_000 });

    expect(page.url()).not.toContain("/admin");
    expect(errors).toHaveLength(0);
  });

  test("admin can load the role approval queue without mutating requests", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signInViaUi(page, demoAccounts.admin, demoPasswords.admin);
    await page.goto("/admin?tab=invitations");
    await page.waitForLoadState("load", { timeout: 15_000 });

    expect(page.url()).toContain("/admin");
    await expect(page.locator("body")).toContainText(/Invitation|approved|pending|rejected/i, {
      timeout: 15_000,
    });
    await expectRenderablePage(page);
    expect(errors).toHaveLength(0);
  });

  test("firesale and investor access surfaces render for a regular buyer", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await signInViaUi(page, demoAccounts.buyerFree, demoPasswords.buyerFree);

    await page.goto("/firesale");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Quick Sale|Investor|Invitation/i, {
      timeout: 15_000,
    });

    await page.goto("/investor-dashboard");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await expect(page.locator("body")).toContainText(/Investor Access Required|deal flow|Quick Sale/i, {
      timeout: 15_000,
    });

    expect(errors).toHaveLength(0);
  });

  test("open-house browsing flow renders and detail navigation stays healthy", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));

    await page.goto("/open-houses");
    await page.waitForLoadState("load", { timeout: 15_000 });
    await expect(page.locator("h1, h2, [role='heading']").first()).toBeVisible({
      timeout: 10_000,
    });

    const cards = page.locator("article, [class*='card']");
    if ((await cards.count()) > 0) {
      await cards.first().click();
      await page.waitForLoadState("load", { timeout: 15_000 });
      await expectRenderablePage(page);
    }

    expect(errors).toHaveLength(0);
  });

  test("firesale and open-house mutation RPCs reject anonymous callers", async ({ request }) => {
    skipUnlessLiveSupabase();

    const protectedCalls = [
      request.post(`${SUPABASE_URL}/rest/v1/rpc/admin_update_firesale_interest_workflow`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        data: {
          p_interest_id: "00000000-0000-0000-0000-000000000000",
          p_status: "approved",
          p_reservation_hours: null,
          p_verify_pof: false,
          p_admin_note: "anonymous smoke check",
          p_proof_amount: null,
        },
        failOnStatusCode: false,
      }),
      request.post(`${SUPABASE_URL}/rest/v1/rpc/submit_open_house_offer`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        data: {
          p_listing_id: "00000000-0000-0000-0000-000000000000",
          p_amount: 1,
          p_message: "anonymous smoke check",
        },
        failOnStatusCode: false,
      }),
      request.post(`${SUPABASE_URL}/rest/v1/rpc/accept_open_house_offer`, {
        headers: { apikey: ANON_KEY, Authorization: `Bearer ${ANON_KEY}` },
        data: {
          p_offer_id: "00000000-0000-0000-0000-000000000000",
        },
        failOnStatusCode: false,
      }),
    ];

    const responses = await Promise.all(protectedCalls);
    for (const res of responses) {
      expect([400, 401, 403], await res.text()).toContain(res.status());
    }
  });
});
