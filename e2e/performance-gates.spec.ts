import { expect, test, type Page, type Route } from "@playwright/test";

const SUPABASE_ORIGIN = "https://abcdefghijklmnop.supabase.co";
const APP_ORIGIN = process.env.CI ? "http://localhost:4173" : "http://localhost:8080";
const AUTH_STORAGE_KEY = "sb-abcdefghijklmnop-auth-token";
const PERF_USER_ID = "00000000-0000-4000-8000-000000000001";
const PERF_LISTING_ID = "00000000-0000-4000-8000-000000000101";

const ROUTE_JS_BUDGET_KB: Record<string, number> = {
  [`/property/${PERF_LISTING_ID}`]: 2600,
  "/dashboard": 2200,
  "/admin": 2300,
  "/platform-map": 2200,
};

const LAZY_ONLY_CHUNK_RE = /(?:LazyRecharts|recharts|d3-|BarChart|LineChart|AreaChart|PieChart|ResponsiveContainer|mapbox-gl|react-map-gl|vendor-mapbox|vendor-charts)/i;
const CHART_CHUNK_RE = /(?:LazyRecharts|recharts|d3-|BarChart|LineChart|AreaChart|PieChart|ResponsiveContainer|vendor-charts)/i;

const perfProfile = {
  id: "perf-profile",
  user_id: PERF_USER_ID,
  email: "perf-admin@example.test",
  display_name: "Performance Admin",
  avatar_url: null,
  role: "admin",
  onboarding_completed: true,
  verified: true,
  bio: null,
  phone: null,
};

const perfListing = {
  id: PERF_LISTING_ID,
  title: "Performance Gate Apartment",
  city: "Athens",
  address: "1 Performance Street",
  price: 320000,
  sqm: 92,
  bedrooms: 2,
  bathrooms: 2,
  listing_type: "sale",
  property_type: "apartment",
  status: "active",
  description: "Deterministic listing used by authenticated performance gates.",
  owner_id: PERF_USER_ID,
  cover_image_url: null,
  listing_images: [],
  latitude: 37.9838,
  longitude: 23.7275,
  floor: 2,
  year_built: 2018,
  energy_class: "B",
  tags: [],
  is_pre_sale: false,
  is_off_market: false,
  construction_status: null,
  open_house_date: null,
  auction_date: null,
  auction_starting_bid: null,
  price_per_sqm: 3478,
  views_count: 12,
  ai_score: 82,
  priority_placement: 0,
  is_featured: false,
};

function json(route: Route, data: unknown) {
  return route.fulfill({
    status: 200,
    headers: {
      "access-control-allow-origin": "*",
      "content-type": "application/json",
      "content-range": "0-0/1",
    },
    body: JSON.stringify(data),
  });
}

async function installAuthenticatedSupabaseMocks(page: Page) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  await page.addInitScript(({ key, userId, expiresAtValue }) => {
    const token = `perf.${btoa(JSON.stringify({ sub: userId, role: "authenticated", exp: expiresAtValue }))}.signature`;
    localStorage.setItem(key, JSON.stringify({
      access_token: token,
      refresh_token: "perf-refresh-token",
      expires_at: expiresAtValue,
      expires_in: 3600,
      token_type: "bearer",
      user: {
        id: userId,
        aud: "authenticated",
        role: "authenticated",
        email: "perf-admin@example.test",
        app_metadata: { provider: "email", providers: ["email"] },
        user_metadata: {},
      },
    }));
  }, { key: AUTH_STORAGE_KEY, userId: PERF_USER_ID, expiresAtValue: expiresAt });

  await page.route(`${SUPABASE_ORIGIN}/functions/v1/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/owner-pro-status")) return json(route, { isPro: true });
    if (path.endsWith("/check-subscription")) return json(route, { subscribed: false, product_id: null, subscription_end: null });
    return json(route, {});
  });

  await page.route(`${SUPABASE_ORIGIN}/auth/v1/**`, async (route) => {
    return json(route, {
      id: PERF_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "perf-admin@example.test",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
    });
  });

  await page.route(`${SUPABASE_ORIGIN}/rest/v1/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const wantsObject = request.headers().accept?.includes("vnd.pgrst.object+json") ?? false;

    if (url.pathname.includes("/profiles_public")) return json(route, wantsObject ? perfProfile : [perfProfile]);
    if (url.pathname.includes("/profiles")) return json(route, wantsObject ? perfProfile : [perfProfile]);
    if (url.pathname.includes("/listings")) {
      if (url.search.includes(`id=eq.${PERF_LISTING_ID}`) || wantsObject) return json(route, perfListing);
      return json(route, [perfListing]);
    }
    if (url.pathname.includes("/listing_images")) return json(route, []);
    if (url.pathname.includes("/pricing_configs")) return json(route, []);

    return json(route, []);
  });
}

test.describe("authenticated performance gates @perf", () => {
  test("protected and property routes stay within JS budgets and keep chart/map chunks lazy", async ({ page }) => {
    await installAuthenticatedSupabaseMocks(page);

    for (const [path, budgetKb] of Object.entries(ROUTE_JS_BUDGET_KB)) {
      const loadedJs = new Map<string, number>();
      page.on("response", async (response) => {
        const url = new URL(response.url());
        if (url.origin !== APP_ORIGIN || !url.pathname.endsWith(".js")) return;
        const body = await response.body().catch(() => null);
        loadedJs.set(url.pathname, body?.byteLength ?? Number(response.headers()["content-length"] ?? 0));
      });

      await page.goto(path, { waitUntil: "networkidle" });
      await expect(page.locator("body")).toBeVisible();

      const loaded = Array.from(loadedJs.entries());
      const totalKb = loaded.reduce((sum, [, bytes]) => sum + bytes, 0) / 1024;
      expect(totalKb, `${path} loaded ${totalKb.toFixed(1)} kB of JS`).toBeLessThanOrEqual(budgetKb);

      const forbidden = loaded
        .map(([chunk]) => chunk)
        .filter((chunk) => path === `/property/${PERF_LISTING_ID}` ? CHART_CHUNK_RE.test(chunk) : LAZY_ONLY_CHUNK_RE.test(chunk));
      expect(forbidden, `${path} loaded lazy-only chunks`).toEqual([]);
    }
  });
});
