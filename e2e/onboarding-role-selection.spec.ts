import { test, expect, type Page } from "@playwright/test";

const ONBOARDING_TEST_EMAIL = process.env.ONBOARDING_TEST_EMAIL ?? "";
const ONBOARDING_TEST_PASSWORD = process.env.ONBOARDING_TEST_PASSWORD ?? "";
const hasCredentials = ONBOARDING_TEST_EMAIL !== "" && ONBOARDING_TEST_PASSWORD !== "";

async function signIn(page: Page): Promise<void> {
  await page.goto("/login");
  await page.locator('input[type="email"], input[name="email"]').first().fill(ONBOARDING_TEST_EMAIL);
  await page.locator('input[type="password"]').first().fill(ONBOARDING_TEST_PASSWORD);
  await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
  try {
    await page.waitForFunction(
      () => /\/(dashboard|onboarding|admin)(\/|$)/.test(window.location.pathname),
      undefined,
      { timeout: 30_000 },
    );
  } catch (error) {
    const visibleError = await page
      .locator('[role="alert"], .text-destructive, [data-testid="error"]')
      .first()
      .textContent({ timeout: 1_000 })
      .catch(() => "");

    throw new Error(
      `Onboarding test sign-in did not reach an authenticated route. url=${page.url()} error=${visibleError || "none"}`,
      { cause: error },
    );
  }

  if (!/\/onboarding/.test(page.url())) {
    await page.waitForURL(/\/onboarding/, { timeout: 10_000 }).catch(() => undefined);
  }
  await page.getByRole("button", { name: "Reject optional" }).click({ timeout: 2_000 }).catch(() => undefined);
}

test.describe("Onboarding role-selection guards", () => {
  test.describe.configure({ mode: "serial" });

  test.skip(!hasCredentials, "Set ONBOARDING_TEST_EMAIL and ONBOARDING_TEST_PASSWORD to run onboarding flow tests");

  test("developer onboarding requires mandatory profile fields", async ({ page }) => {
    await signIn(page);

    if (!/\/onboarding/.test(page.url())) {
      test.skip(true, "Provided account is already fully onboarded; supply an incomplete onboarding account.");
    }

    await page.getByText("Developer / Builder", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "Developer Profile" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Set Up My Account" }).click();

    await expect(page.getByText("Company name is required")).toBeVisible();
    await expect(page.getByText("City is required")).toBeVisible();
    await expect(page.getByText("Please select development type")).toBeVisible();
  });

  test("professional onboarding requires verification fields", async ({ page }) => {
    await signIn(page);

    if (!/\/onboarding/.test(page.url())) {
      test.skip(true, "Provided account is already fully onboarded; supply an incomplete onboarding account.");
    }

    await page.getByText("Service Professional", { exact: true }).click();
    await expect(page.getByRole("heading", { name: "What's your discipline?" })).toBeVisible({ timeout: 10_000 });

    const architectCategory = page.getByRole("button", { name: "Architect" });
    await architectCategory.click();
    await expect(architectCategory).toHaveClass(/border-primary/);
    await page.getByRole("button", { name: "Continue" }).click();

    await expect(page.getByRole("heading", { name: "Business Verification" })).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Verify & Continue" }).click();

    await expect(page.getByText("Business name is required")).toBeVisible();
    await expect(page.getByText("Phone number is required")).toBeVisible();
    await expect(page.getByText("Enter a valid 9-digit AFM")).toBeVisible();
  });
});
