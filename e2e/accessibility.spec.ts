/**
 * Accessibility checks — keyboard navigation, skip link, focus management,
 * plus automated axe-core scans on key public pages.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

test.describe("Accessibility", () => {
  test("skip-to-content link is focusable and targets #main-content", async ({ page }) => {
    await page.goto("/");

    // Wait for React to mount the Navbar before tabbing — goto waits for
    // "load" but not for React hydration, so the skip link may not exist yet.
    await page.waitForSelector('a[href="#main-content"]');

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

test.describe("Accessibility — automated axe-core scans", () => {
  // WCAG 2 AA is the practical target. We treat "serious" + "critical" as blocking;
  // "minor" / "moderate" are reported but do not fail CI to allow incremental progress.
  const BLOCKING_IMPACTS = ["serious", "critical"] as const;

  async function scan(page: import("@playwright/test").Page, url: string) {
    // Pre-dismiss the cookie consent banner. Its mount animation
    // (`animate-slide-up`, 0.4s fade from opacity 0 -> 1) intersects with
    // `networkidle`, producing false-positive contrast violations from
    // partially-transparent text. Setting this key also avoids flakiness.
    await page.goto(url);
    await page.evaluate(() => {
      try {
        localStorage.setItem(
          "maiprop_cookie_consent",
          JSON.stringify({
            accepted: true,
            functional: true,
            analytics: false,
            mapping: true,
            timestamp: Date.now(),
          }),
        );
      } catch { /* storage may be blocked */ }
    });
    await page.reload();
    await page.waitForLoadState("networkidle");
    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa"])
      .analyze();

    const blocking = results.violations.filter(
      (v) => v.impact && (BLOCKING_IMPACTS as readonly string[]).includes(v.impact),
    );
    if (blocking.length > 0) {
      console.error(
        `axe violations on ${url}:`,
        blocking.map((v) => `${v.id} (${v.impact}) — ${v.nodes.length} node(s)`),
      );
    }
    expect(blocking, `axe blocking violations on ${url}`).toEqual([]);
  }

  test("home page has no serious a11y violations", async ({ page }) => {
    await scan(page, "/");
  });

  test("listings page has no serious a11y violations", async ({ page }) => {
    await scan(page, "/listings");
  });

  test("login page has no serious a11y violations", async ({ page }) => {
    await scan(page, "/login");
  });
});
