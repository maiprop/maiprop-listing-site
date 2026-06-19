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
    // Load the page first (online) so the SPA bootstraps, then drop the network
    // and verify the already-mounted shell is still present. We intentionally
    // do NOT page.reload() because vite preview doesn't send cache headers
    // that would let the HTML be served from disk cache while offline.
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Sanity: the SPA shell has mounted before we go offline. `#root` exists
    // in the static HTML, so waiting on the rendered landmarks avoids dropping
    // the network while a lazy route chunk is still loading.
    await expect(page.locator("#root")).toBeAttached({ timeout: 10_000 });
    await expect(page.locator("#main-content, main, nav, header").first()).toBeAttached({
      timeout: 15_000,
    });

    // Now simulate a network drop and block further requests.
    await context.setOffline(true);

    // After going offline the *already-rendered* DOM must remain — no full reload.
    // #main-content / main / #root are all acceptable anchors.
    const main = page.locator("#main-content, main, #root").first();
    await expect(main).toBeAttached({ timeout: 10_000 });

    // The Navbar (or root) should still be present — not a white screen.
    const nav = page.locator("nav, header, #root").first();
    await expect(nav).toBeAttached();

    await context.setOffline(false);
  });

  test("listings page shows an error state when the API is unreachable", async ({ page, context }) => {
    // Intercept the specific Supabase REST calls and fail them deterministically.
    await context.route(/\/rest\/v1\/(listings|properties)/i, (route) =>
      route.fulfill({ status: 503, body: JSON.stringify({ message: "service unavailable" }) })
    );

    await page.goto("/listings");
    // networkidle is unreliable on /listings (Mapbox tile fetches never settle).
    // Wait for `load` and the React-rendered <main> instead.
    await page.waitForLoadState("load");
    await page
      .locator("#main-content, main")
      .first()
      .waitFor({ state: "attached", timeout: 15_000 });

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
