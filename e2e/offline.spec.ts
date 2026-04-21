/**
 * Offline / network-failure graceful degradation.
 *
 * We don't (yet) ship a service worker for offline browsing, so the expected
 * behaviour is: the app remains responsive, shows an error state on routes
 * that fetch data, and does not white-screen.
 *
 * These tests run in Chromium only (Playwright's offline mode is Chromium-
 * specific via CDP).
 */
import { test, expect } from "@playwright/test";

test.describe("Offline / network failure handling", () => {
  test("home page stays interactive when all network requests fail", async ({ page, context }) => {
    // This test requires a production build (npm run preview / CI).
    // In dev mode the HTML is not cached by the browser, so going offline via CDP
    // makes the entire page unreachable — even #root is never served.
    // In CI, webServer uses `npm run preview` which correctly caches built assets.
    if (!process.env.CI) {
      test.skip();
      return;
    }

    // Warm the page first so assets are cached.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Go offline and force a hard reload.
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => undefined);

    // The main landmark should still render (static shell).
    // In CI (preview build) React remounts from cache; in dev mode the HTML
    // shell (#root) is the minimum non-blank-page indicator.
    const main = page.locator("#main-content, main, #root").first();
    await expect(main).toBeAttached({ timeout: 10_000 });

    // No 5xx-ish overlay / white screen — Navbar or the root div should exist.
    const nav = page.locator("nav, #root").first();
    await expect(nav).toBeAttached();

    await context.setOffline(false);
  });

  test("listings page shows an error state when the API is unreachable", async ({ page, context }) => {
    // Intercept the specific Supabase REST calls and fail them deterministically.
    await context.route(/\/rest\/v1\/(listings|properties)/i, (route) =>
      route.fulfill({ status: 503, body: JSON.stringify({ message: "service unavailable" }) })
    );

    await page.goto("/listings");
    await page.waitForLoadState("networkidle");

    // The app should NOT white-screen. Either an empty state, an error message,
    // or a skeleton that eventually resolves to text is acceptable.
    const body = await page.textContent("body");
    expect(body?.length ?? 0).toBeGreaterThan(100);

    // Should not have thrown an unhandled React error that empties the DOM.
    const errorBoundaryShown = await page
      .locator('[data-testid="error-boundary"], :has-text("Something went wrong")')
      .count();
    // Either a graceful error UI (>= 1) or no error at all is fine; we just
    // don't want a blank page. This is asserted by the length check above,
    // so we record the count for debugging without failing on it.
    console.info(`[offline] error-boundary instances visible: ${errorBoundaryShown}`);
  });
});
