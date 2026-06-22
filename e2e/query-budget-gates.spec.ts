import { expect, test, type Page, type Route } from "@playwright/test";

const RUNNING_QUERY_BUDGET_GATE =
  process.env.MAIPROP_RUNNING_PERF_GATE === "1" ||
  process.env.CI ||
  process.env.npm_lifecycle_event === "test:perf" ||
  process.argv.some((arg) => arg.includes("query-budget-gates.spec.ts"));

const AUTH_STORAGE_KEY = "sb-abcdefghijklmnop-auth-token";
const PERF_USER_ID = "00000000-0000-4000-8000-000000000001";
const PERF_LISTING_ID = "00000000-0000-4000-8000-000000000101";
const PERF_NEW_BUILD_ID = "00000000-0000-4000-8000-000000000201";
const PERF_OPEN_HOUSE_ID = "00000000-0000-4000-8000-000000000301";

type RequestCounts = {
  auth: number;
  rest: number;
  functions: number;
};

type QueryBudget = RequestCounts & {
  total: number;
};

const QUERY_BUDGETS: Record<string, QueryBudget> = {
  "/": { auth: 2, rest: 8, functions: 2, total: 12 },
  "/listings": { auth: 2, rest: 10, functions: 2, total: 14 },
  "/pricing": { auth: 2, rest: 8, functions: 3, total: 13 },
  [`/property/${PERF_LISTING_ID}`]: { auth: 2, rest: 14, functions: 6, total: 20 },
  [`/new-build/${PERF_NEW_BUILD_ID}`]: { auth: 3, rest: 14, functions: 6, total: 22 },
  [`/open-house/${PERF_OPEN_HOUSE_ID}`]: { auth: 3, rest: 18, functions: 8, total: 28 },
  "/dashboard": { auth: 3, rest: 22, functions: 8, total: 30 },
  "/admin": { auth: 3, rest: 26, functions: 8, total: 34 },
};

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

const perfNewBuildListing = {
  ...perfListing,
  id: PERF_NEW_BUILD_ID,
  title: "Performance Gate New Build",
  listing_type: "new_build",
  property_type: "apartment",
  price: 275000,
  sqm: 52,
  bedrooms: 1,
  bathrooms: 1,
  construction_status: "under_construction",
  project_id: "00000000-0000-4000-8000-000000000202",
  project: {
    id: "00000000-0000-4000-8000-000000000202",
    name: "Performance Gate Project",
    city: "Athens",
    municipality: "Athens",
    address: "2 Performance Avenue",
    latitude: 37.9838,
    longitude: 23.7275,
    delivery_date: "2027-06-01",
    project_units: [
      {
        id: "00000000-0000-4000-8000-000000000203",
        project_id: "00000000-0000-4000-8000-000000000202",
        listing_id: PERF_NEW_BUILD_ID,
        unit_number: "1",
        floor: 1,
        price: 275000,
        internal_sqm: 52,
        bedrooms: 1,
        bathrooms: 1,
        availability_status: "available",
        energy_class: "A",
        vat_included: true,
      },
    ],
    project_media: [
      {
        id: "00000000-0000-4000-8000-000000000204",
        project_id: "00000000-0000-4000-8000-000000000202",
        url: "https://images.example.test/new-build.jpg",
        media_type: "image",
        title: "Hero",
        sort_order: 0,
      },
    ],
  },
};

const perfOpenHouseListing = {
  ...perfListing,
  id: PERF_OPEN_HOUSE_ID,
  title: "Performance Gate Open House",
  listing_type: "open_house",
  open_house_transaction_type: "sale",
  open_house_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
  price: 410000,
  sqm: 104,
  bedrooms: 3,
  bathrooms: 2,
  cover_image_url: "https://images.example.test/open-house.jpg",
};

function emptyCounts(): RequestCounts {
  return { auth: 0, rest: 0, functions: 0 };
}

function totalCounts(counts: RequestCounts): number {
  return counts.auth + counts.rest + counts.functions;
}

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

async function installAuthenticatedSupabaseMocks(page: Page, counts: RequestCounts) {
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60;
  await page.addInitScript(({ key, userId, expiresAtValue }) => {
    const token = `perf.${btoa(JSON.stringify({ sub: userId, role: "authenticated", exp: expiresAtValue }))}.signature`;
    const authSession = JSON.stringify({
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
    });

    localStorage.setItem("maiprop_cookie_consent", JSON.stringify({
      accepted: true,
      functional: true,
      analytics: false,
      mapping: true,
      timestamp: Date.now(),
    }));
    localStorage.setItem(key, authSession);

    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItem(storageKey: string) {
      const stored = originalGetItem.call(this, storageKey);
      if (
        stored === null &&
        this === window.localStorage &&
        /^sb-[a-z0-9]+-auth-token$/i.test(storageKey)
      ) {
        return authSession;
      }
      return stored;
    };
  }, { key: AUTH_STORAGE_KEY, userId: PERF_USER_ID, expiresAtValue: expiresAt });

  await page.route("**/api/public/**", async (route) => {
    const url = new URL(route.request().url());
    const section = url.searchParams.get("section");

    if (url.pathname.endsWith("/homepage")) {
      if (section === "auction-count") return json(route, 47);
      if (section === "type-counts") return json(route, { apartment: 1 });
      return json(route, []);
    }
    if (url.pathname.endsWith("/listings")) {
      return json(route, { data: [perfListing], hasMore: false, page: 1, pageSize: 24 });
    }
    if (url.pathname.endsWith("/listing")) {
      const id = url.searchParams.get("id");
      if (id === PERF_NEW_BUILD_ID) return json(route, { data: perfNewBuildListing });
      if (id === PERF_OPEN_HOUSE_ID) return json(route, { data: perfOpenHouseListing });
      return json(route, { data: perfListing });
    }
    if (url.pathname.endsWith("/auctions")) {
      return json(route, { data: [] });
    }
    if (url.pathname.endsWith("/open-houses")) {
      return json(route, []);
    }
    if (url.pathname.endsWith("/similar-listings")) {
      return json(route, { data: [] });
    }

    return json(route, {});
  });

  await page.route("**/functions/v1/**", async (route) => {
    counts.functions += 1;
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/owner-pro-status")) return json(route, { isPro: true });
    if (path.endsWith("/check-subscription")) return json(route, { subscribed: false, product_id: null, subscription_end: null });
    if (path.endsWith("/ai-quota-status")) return json(route, { used: 0, limit: 10, remaining: 10 });
    if (path.endsWith("/open-house-capacity")) return json(route, { capacity: 12, registrations: 0, remaining: 12, slots: [] });
    if (path.endsWith("/record-listing-view")) return json(route, { ok: true });
    return json(route, {});
  });

  await page.route("**/auth/v1/**", async (route) => {
    counts.auth += 1;
    return json(route, {
      id: PERF_USER_ID,
      aud: "authenticated",
      role: "authenticated",
      email: "perf-admin@example.test",
      app_metadata: { provider: "email", providers: ["email"] },
      user_metadata: {},
    });
  });

  await page.route("**/rest/v1/**", async (route) => {
    counts.rest += 1;
    const request = route.request();
    const url = new URL(request.url());
    const wantsObject = request.headers().accept?.includes("vnd.pgrst.object+json") ?? false;

    if (url.pathname.includes("/profiles_public")) return json(route, wantsObject ? perfProfile : [perfProfile]);
    if (url.pathname.includes("/profiles")) return json(route, wantsObject ? perfProfile : [perfProfile]);
    if (url.pathname.includes("/listings")) {
      if (url.search.includes(`id=eq.${PERF_NEW_BUILD_ID}`)) return json(route, wantsObject ? perfNewBuildListing : [perfNewBuildListing]);
      if (url.search.includes(`id=eq.${PERF_OPEN_HOUSE_ID}`)) return json(route, wantsObject ? perfOpenHouseListing : [perfOpenHouseListing]);
      if (url.search.includes(`id=eq.${PERF_LISTING_ID}`) || wantsObject) return json(route, perfListing);
      return json(route, [perfListing]);
    }
    if (url.pathname.includes("/listing_images")) return json(route, []);
    if (url.pathname.includes("/pricing_configs")) return json(route, []);
    if (url.pathname.includes("/subscriptions")) return json(route, []);
    if (url.pathname.includes("/contacts")) return json(route, []);
    if (url.pathname.includes("/viewings")) return json(route, []);
    if (url.pathname.includes("/projects")) return json(route, []);
    if (url.pathname.includes("/open_house")) return json(route, []);

    return json(route, []);
  });
}

test.describe("authenticated query budget gates @perf", () => {
  test.skip(!RUNNING_QUERY_BUDGET_GATE, "Run npm run test:perf or set MAIPROP_RUNNING_PERF_GATE=1 to measure query budgets.");

  for (const [path, budget] of Object.entries(QUERY_BUDGETS)) {
    test(`${path} stays within Supabase request budget`, async ({ page }) => {
      const counts = emptyCounts();
      await installAuthenticatedSupabaseMocks(page, counts);

      await page.goto(path, { waitUntil: "domcontentloaded" });
      await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
      await expect(page.locator("body")).toBeVisible();

      expect(counts.auth, `${path} auth requests`).toBeLessThanOrEqual(budget.auth);
      expect(counts.rest, `${path} REST queries`).toBeLessThanOrEqual(budget.rest);
      expect(counts.functions, `${path} function calls`).toBeLessThanOrEqual(budget.functions);
      expect(totalCounts(counts), `${path} total Supabase requests`).toBeLessThanOrEqual(budget.total);
    });
  }
});
