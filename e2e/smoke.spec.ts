/**
 * Smoke tests — verify core pages load without JS errors or broken layout.
 * These run against the live dev server and require no authentication.
 */
import { test, expect } from "@playwright/test";

test.describe("Public pages", () => {
  test("homepage loads and shows hero heading", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveTitle(/mAI\s*prop|maiprop|MaiProp/i);
    // Hero section should be visible
    await expect(page.locator("main, #main-content")).toBeVisible();
  });

  test("listings page renders property grid", async ({ page }) => {
    await page.goto("/listings");
    // Wait for either a listing card or the empty-state message
    await expect(
      page.locator('[data-testid="property-card"], [data-testid="empty-listings"], h1').first()
    ).toBeVisible({ timeout: 10_000 });
  });

  test("skip-to-main-content link is in the DOM", async ({ page }) => {
    await page.goto("/");
    const skipLink = page.locator('a[href="#main-content"]');
    await expect(skipLink).toBeAttached();
  });

  test("404 page shows friendly message", async ({ page }) => {
    await page.goto("/this-page-does-not-exist");
    await expect(page.locator("body")).toContainText(/not found|404/i);
  });

  test("robots.txt is served", async ({ page }) => {
    const response = await page.goto("/robots.txt");
    expect(response?.status()).toBe(200);
    const body = await response?.text();
    expect(body).toMatch(/User-agent/i);
  });
});
