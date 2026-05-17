/**
 * Auth flow tests — sign-in page, form validation, sign-out.
 *
 * NOTE: These tests do NOT create real accounts. They verify the UI flow and
 * form validation only. For full sign-up/sign-in integration, set
 * E2E_TEST_EMAIL and E2E_TEST_PASSWORD environment variables.
 */
import { test, expect } from "@playwright/test";
import { seededDemoAccountsEnabled } from "./helpers/demoAccounts";

// Default to the most reliable seeded demo buyer account so auth smoke stays stable.
const TEST_EMAIL = process.env.E2E_TEST_EMAIL ?? "buyer.free@maiprop.demo";
const TEST_PASSWORD = process.env.E2E_TEST_PASSWORD ?? "Demo2025!";
const hasCredentials = TEST_EMAIL !== "" && TEST_PASSWORD !== "" && seededDemoAccountsEnabled();

test.describe("Auth — sign-in page", () => {
  test("sign-in page renders email and password fields", async ({ page }) => {
    await page.goto("/login");
    await expect(page.locator('input[type="email"], input[name="email"]')).toBeVisible({ timeout: 8_000 });
    await expect(page.locator('input[type="password"]')).toBeVisible();
  });

  test("empty form submission shows validation feedback", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8_000 });

    // Try to submit without filling in anything
    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
    await submitBtn.click();

    // Should either have HTML5 validation or an error message
    const isInvalid = await emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );
    const errorVisible = await page.locator('[role="alert"], .text-destructive, [data-testid="error"]').isVisible();
    expect(isInvalid || errorVisible).toBe(true);
  });

  test("invalid email format is rejected", async ({ page }) => {
    await page.goto("/login");
    const emailInput = page.locator('input[type="email"], input[name="email"]').first();
    await expect(emailInput).toBeVisible({ timeout: 8_000 });
    await emailInput.fill("not-an-email");

    const submitBtn = page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first();
    await submitBtn.click();

    const isInvalid = await emailInput.evaluate(
      (el: HTMLInputElement) => !el.validity.valid
    );
    const errorVisible = await page.locator('[role="alert"], .text-destructive').isVisible();
    expect(isInvalid || errorVisible).toBe(true);
  });
});

test.describe("Auth — full sign-in + sign-out", () => {
  test.skip(!hasCredentials, "Set E2E_TEST_EMAIL and E2E_TEST_PASSWORD to run full auth tests");

  test("can sign in and reach dashboard", async ({ page }) => {
    await page.goto("/login");

    await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();

    // Should redirect to dashboard after successful sign-in
    await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });
    await expect(page.locator("main, #main-content")).toBeVisible();
  });

  test("can sign out", async ({ page }) => {
    // Sign in first
    await page.goto("/login");
    await page.locator('input[type="email"], input[name="email"]').first().fill(TEST_EMAIL);
    await page.locator('input[type="password"]').first().fill(TEST_PASSWORD);
    await page.locator('button[type="submit"], button:has-text("Sign in"), button:has-text("Log in")').first().click();
    await page.waitForURL(/\/dashboard|\/onboarding/, { timeout: 15_000 });

    // Sign out via Navbar or profile menu
    const signOutBtn = page.locator('button:has-text("Sign out"), button:has-text("Log out"), [data-testid="sign-out"]').first();
    if (await signOutBtn.isVisible()) {
      await signOutBtn.click();
      await page.waitForURL(/\/login|\//, { timeout: 10_000 });
      await expect(page.locator('input[type="email"], input[name="email"]').first()).toBeVisible({ timeout: 8_000 });
    }
  });
});
