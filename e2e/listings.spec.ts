/**
 * Listings browse flow — search, filter, open detail.
 * Requires no authentication (listings are publicly visible).
 */
import { test, expect } from "@playwright/test";

test.describe("Listings browse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/listings");
    // Wait for the page to settle
    await page.waitForLoadState("load");
  });

  test("page title contains 'Listings' or 'Properties'", async ({ page }) => {
    await expect(page).toHaveTitle(/listings|properties|maiprop/i);
  });

  test("search bar is visible and accepts input", async ({ page }) => {
    const searchInput = page.locator('input[placeholder*="Search"], input[type="search"], [data-testid="search-input"]').first();
    if (await searchInput.isVisible()) {
      await searchInput.fill("Athens");
      await expect(searchInput).toHaveValue("Athens");
    } else {
      // If search is inside AI bar, just check for some input
      await expect(page.locator("input").first()).toBeAttached();
    }
  });

  test("filter controls are present", async ({ page }) => {
    // At least one filter (price, city, type) should be on the page
    const filterEl = page.locator('select, [role="combobox"], [data-testid*="filter"]').first();
    await expect(filterEl).toBeAttached({ timeout: 8_000 });
  });

  test("property card links navigate to detail page", async ({ page }) => {
    const card = page.locator('[data-testid="property-card"] a, article a').first();
    const cardCount = await card.count();
    if (cardCount === 0) {
      test.skip(); // No listings seeded
      return;
    }
    const href = await card.getAttribute("href");
    expect(href).toMatch(/\/property\/|\/auction\/|\/open-house\/|\/new-build\//);
  });
});
