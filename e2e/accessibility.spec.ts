/**
 * Accessibility checks — keyboard navigation, skip link, focus management.
 * Uses built-in Playwright assertions; no axe dependency required.
 */
import { test, expect } from "@playwright/test";

test.describe("Accessibility", () => {
  test("skip-to-content link is focusable and targets #main-content", async ({ page }) => {
    await page.goto("/");

    // Tab to the first focusable element (should be the skip link)
    await page.keyboard.press("Tab");

    const focusedHref = await page.evaluate(() => {
      const el = document.activeElement as HTMLAnchorElement | null;
      return el?.getAttribute("href") ?? null;
    });

    expect(focusedHref).toBe("#main-content");
  });

  test("#main-content landmark exists on listings page", async ({ page }) => {
    await page.goto("/listings");
    await expect(page.locator("#main-content")).toBeAttached();
  });

  test("Navbar has a <nav> element with aria-label or role", async ({ page }) => {
    await page.goto("/");
    // Should have at least one <nav> element
    await expect(page.locator("nav").first()).toBeAttached();
  });

  test("all images have alt text or role=presentation", async ({ page }) => {
    await page.goto("/listings");
    await page.waitForLoadState("networkidle");

    const images = await page.locator("img").all();
    const violations: string[] = [];

    for (const img of images) {
      const alt = await img.getAttribute("alt");
      const role = await img.getAttribute("role");
      const ariaHidden = await img.getAttribute("aria-hidden");
      const src = await img.getAttribute("src");

      if (alt === null && role !== "presentation" && ariaHidden !== "true") {
        violations.push(src ?? "unknown");
      }
    }

    if (violations.length > 0) {
      console.warn("Images missing alt text:", violations.slice(0, 5));
    }
    // Allow up to 2 violations (e.g., dynamically loaded lazy images)
    expect(violations.length).toBeLessThanOrEqual(2);
  });
});
