/**
 * Accessibility checks — keyboard navigation, skip link, focus management,
 * plus automated axe-core scans on key public pages.
 */
import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

const LANDMARK_ROUTES = [
  "/auctions",
  "/pricing",
  "/firesale",
  "/open-houses",
  "/professionals",
  "/contact",
  "/privacy-policy",
  "/terms-of-service",
  "/cookie-policy",
  "/missing-route-for-a11y-check",
];

const AXE_SCAN_ROUTES = [
  "/",
  "/listings",
  "/auctions",
  "/open-houses",
  "/firesale",
  "/professionals",
  "/pricing",
  "/login",
  "/contact",
  "/privacy-policy",
  "/terms-of-service",
  "/cookie-policy",
  "/api-docs",
  "/property/00000000-0000-0000-0000-000000000000",
];

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

  test("public routes with the global skip link expose #main-content", async ({ page }) => {
    for (const route of LANDMARK_ROUTES) {
      await page.goto(route);
      await page.waitForLoadState("load");
      await expect(page.locator('a[href="#main-content"]'), `${route} skip link`).toBeAttached();
      await expect(page.locator("#main-content"), `${route} main content target`).toBeAttached();
    }
  });

  test("API docs route exposes a documentation shell", async ({ page }) => {
    await page.goto("/api-docs");
    await page.waitForLoadState("load");

    await expect(
      page.getByRole("heading", { name: /mAI prop Supabase Edge Functions|maiProp Platform API/i }).first(),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Navbar has a <nav> element with aria-label or role", async ({ page }) => {
    await page.goto("/");
    // Should have at least one <nav> element
    await expect(page.locator("nav").first()).toBeAttached();
  });

  test("homepage links expose accessible names", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("load");
    await page.locator("#main-content, main, header, nav").first().waitFor({ state: "attached", timeout: 20_000 });

    const unnamedLinks = await page.locator("a").evaluateAll((links) =>
      links
        .filter((link) => {
          const element = link as HTMLElement;
          const rect = element.getBoundingClientRect();
          const style = window.getComputedStyle(element);
          return (
            element.getAttribute("aria-hidden") !== "true" &&
            rect.width > 0 &&
            rect.height > 0 &&
            style.visibility !== "hidden" &&
            style.display !== "none"
          );
        })
        .map((link) => {
          const imageAlt = Array.from(link.querySelectorAll("img"))
            .map((img) => img.getAttribute("alt")?.trim())
            .filter(Boolean)
            .join(" ");
          const label = [
            link.getAttribute("aria-label"),
            link.getAttribute("title"),
            link.textContent,
            imageAlt,
          ]
            .map((value) => value?.replace(/\s+/g, " ").trim())
            .find(Boolean);
          return {
            href: link.getAttribute("href") ?? "",
            html: link.outerHTML.slice(0, 240),
            label: label ?? "",
          };
        })
        .filter((link) => link.label.length === 0),
    );

    expect(unnamedLinks).toEqual([]);
  });

  test("all images have alt text or role=presentation", async ({ page }) => {
    await page.goto("/listings");
    // networkidle is unreliable on /listings (Mapbox tile fetches never settle).
    // Wait for `load` and the React <main> landmark instead.
    await page.waitForLoadState("load");
    await page
      .locator("#main-content, main")
      .first()
      .waitFor({ state: "attached", timeout: 15_000 });

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
    if (url !== "/api-docs") {
      await page.addInitScript(() => {
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
    }
    await page.goto(url);
    // networkidle is unreliable on Mapbox-using pages; wait for `load` and
    // a React-rendered landmark instead. The Navbar (header) is rendered
    // by every scanned page (/, /listings, /login), and none of these
    // landmarks exist in the static index.html shell, so this is a
    // reliable post-mount signal. Suitable for axe-core, which reads the
    // rendered DOM + computed styles (CSS is loaded by `load`).
    await page.waitForLoadState("load");
    if (url === "/api-docs") {
      await page
        .getByRole("heading", { name: /mAI prop Supabase Edge Functions|maiProp Platform API/i })
        .first()
        .waitFor({ state: "visible", timeout: 30_000 });
    } else {
      await page
        .locator("#main-content, main, header, nav")
        .first()
        .waitFor({ state: "attached", timeout: 20_000 });
    }
    // Snap all scroll-reveal elements to their final state so axe doesn't
    // catch them mid-transition (opacity ~0.5 → computed blended colour fails
    // contrast even though the fully-rendered colour would pass).
    await page.addStyleTag({
      content: [
        ".reveal { opacity: 1 !important; transform: none !important; transition: none !important; }",
        "*, *::before, *::after { transition-duration: 0ms !important; animation-duration: 0ms !important; }",
      ].join(" "),
    });
    // One rAF tick so any pending IntersectionObserver callbacks flush.
    await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => r())));
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

  for (const route of AXE_SCAN_ROUTES) {
    test(`${route} has no serious a11y violations`, async ({ page }) => {
      await scan(page, route);
    });
  }
});
