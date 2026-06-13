/**
 * Listings browse flow — search, filter, open detail.
 * Requires no authentication (listings are publicly visible).
 */
import { test, expect } from "@playwright/test";

const fixtureImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23ece8df'/%3E%3Cpath d='M90 290h460V120L320 58 90 120z' fill='%238160d8'/%3E%3Crect x='160' y='158' width='320' height='132' fill='%23fffaf2'/%3E%3C/svg%3E";

const makeListing = (overrides: Record<string, unknown> = {}) => ({
  id: "sale-1",
  owner_id: "owner-1",
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
  status: "active",
  title: "Canonical Sale Home",
  description: "A test listing used by the public listings E2E suite.",
  address: "1 Test Street",
  city: "Athens",
  region: "Attica",
  postal_code: "10000",
  price: 250000,
  price_per_sqm: 5000,
  sqm: 50,
  bedrooms: 1,
  bathrooms: 1,
  wc_count: 0,
  kitchens: 1,
  living_rooms: 1,
  floor: 1,
  total_floors: 4,
  levels: 1,
  year_built: 2026,
  energy_class: "A",
  cover_image_url: fixtureImage,
  property_type: "apartment",
  listing_type: "sale",
  commercial_subtype: null,
  heating_system: null,
  construction_status: "renovated",
  open_house_date: null,
  auction_date: null,
  auction_starting_bid: null,
  auction_court: null,
  website_url: null,
  ai_score: null,
  views_count: 0,
  tags: [],
  has_video_tour: false,
  has_virtual_tour: false,
  is_featured: false,
  priority_placement: 0,
  is_pre_sale: false,
  latitude: 37.9838,
  longitude: 23.7275,
  has_ac: true,
  has_elevator: true,
  has_parking: false,
  has_pool: false,
  has_garden: false,
  has_smart_home: false,
  listing_images: [{ url: fixtureImage, sort_order: 1 }],
  profiles: {
    user_id: "owner-1",
    display_name: "Test Developer",
    avatar_url: null,
    role: "developer",
  },
  ...overrides,
});

const mockPublicListingApis = async (
  page: import("@playwright/test").Page,
  listings: Array<Record<string, unknown>>,
) => {
  const listingRequests: string[] = [];

  await page.route(/\/api\/public\/similar-listings(?:\?|$)/, async (route) => {
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data: [] }),
    });
  });

  await page.route(/\/api\/public\/listings(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    listingRequests.push(url.toString());
    const listingType = url.searchParams.get("listing_type");
    const data = listingType
      ? listings.filter((listing) => listing.listing_type === listingType)
      : listings;

    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        data,
        hasMore: false,
        page: 1,
        pageSize: data.length,
      }),
    });
  });

  await page.route(/\/api\/public\/listing(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const id = url.searchParams.get("id");
    const listing = listings.find((row) => row.id === id) ?? null;
    await route.fulfill({
      status: listing ? 200 : 404,
      contentType: "application/json",
      body: JSON.stringify({ data: listing }),
    });
  });

  await page.route(/\/functions\/v1\//, async (route) => {
    const url = new URL(route.request().url());
    const body = url.pathname.endsWith("/owner-pro-status") ? { isPro: false } : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(body),
    });
  });

  await page.route("https://api.mapbox.com/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  await page.route("https://events.mapbox.com/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });

  return listingRequests;
};

test.describe("Listings browse", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/listings");
    // networkidle is unreliable on /listings — Mapbox tile fetches keep the
    // network busy past the 30s default timeout. Wait for `load` (initial
    // resources finished) plus the React-rendered <main> landmark so the
    // page has actually mounted before assertions run.
    await page.waitForLoadState("load");
    await page
      .locator("#main-content, main")
      .first()
      .waitFor({ state: "attached", timeout: 15_000 });
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

  test("new-build catalogue uses listing_type and links to the new-build layout", async ({ page }) => {
    const newBuild = makeListing({
      id: "new-build-1",
      title: "Canonical Project Home",
      listing_type: "new_build",
      is_pre_sale: false,
      construction_status: "under_construction",
    });
    const requests = await mockPublicListingApis(page, [newBuild]);

    await page.goto("/listings?listing_type=new_build");
    await page.waitForLoadState("load");

    await expect(page.getByText("Canonical Project Home").first()).toBeVisible();
    await expect(page.locator('[data-testid="property-card"] a[href="/new-build/new-build-1"]').first()).toBeVisible();
    expect(requests.some((requestUrl) => {
      const url = new URL(requestUrl);
      return url.searchParams.get("listing_type") === "new_build" && !url.searchParams.has("pre_sale");
    })).toBe(true);
  });

  test("canonical redirects use listing_type instead of the legacy is_pre_sale flag", async ({ page }) => {
    const newBuild = makeListing({
      id: "canonical-new-build",
      title: "Canonical New Build Detail",
      listing_type: "new_build",
      is_pre_sale: false,
      construction_status: "under_construction",
    });
    const staleSale = makeListing({
      id: "stale-pre-sale-sale",
      title: "Legacy Flagged Sale Detail",
      listing_type: "sale",
      is_pre_sale: true,
    });
    await mockPublicListingApis(page, [newBuild, staleSale]);

    await page.goto("/property/canonical-new-build");
    await page.waitForURL("**/new-build/canonical-new-build");
    await expect(page.getByText("Canonical New Build Detail").first()).toBeVisible();
    await expect(page.getByText("New Build").first()).toBeVisible();

    await page.goto("/new-build/stale-pre-sale-sale");
    await page.waitForURL("**/property/stale-pre-sale-sale");
    await expect(page.getByText("Legacy Flagged Sale Detail").first()).toBeVisible();
    expect(page.url()).toContain("/property/stale-pre-sale-sale");
  });

  test("new-build detail merges the linked project, inventory, and media into one listing page", async ({ page }) => {
    const newBuild = makeListing({
      id: "merged-new-build",
      title: "Aegean Residences",
      listing_type: "new_build",
      is_pre_sale: false,
      construction_status: "under_construction",
      address: null,
      city: null,
      region: null,
      project_id: "project-1",
      project: {
        id: "project-1",
        name: "Marina Heights",
        description: "Waterfront homes with shared amenities.",
        address: "Marina Avenue 10",
        city: "Piraeus",
        municipality: "Piraeus Municipality",
        latitude: 37.94,
        longitude: 23.64,
        cover_image_url: fixtureImage,
        developer_company: "Mai Developments",
        architect_group: "Aegean Studio",
        construction_company: "BuildCo",
        building_permit_number: "BP-2026-01",
        area_description: "New waterfront regeneration zone.",
        permit_approval_date: "2026-01-15",
        construction_start_date: "2026-03-01",
        structural_completion_date: "2026-10-15",
        delivery_date: "2027-06-30",
        status: "active",
        project_units: [
          {
            id: "unit-1",
            unit_number: "A101",
            unit_id: "A101",
            floor: 1,
            availability_status: "available",
            internal_sqm: 82,
            balcony_sqm: 14,
            bedrooms: 2,
            bathrooms: 2,
            price: 410000,
            price_per_sqm: 5000,
            vat_included: true,
            energy_class: "A",
          },
        ],
        project_media: [
          {
            id: "media-1",
            media_type: "floor_plan",
            title: "A101 floor plan",
            url: fixtureImage,
            sort_order: 1,
          },
          {
            id: "media-2",
            media_type: "brochure_pdf",
            title: "Project brochure",
            url: "https://cdn.example/project-brochure.pdf",
            sort_order: 2,
          },
        ],
      },
    });
    await mockPublicListingApis(page, [newBuild]);

    await page.goto("/new-build/merged-new-build");
    await page.waitForLoadState("load");

    await expect(page.getByRole("heading", { name: "Marina Heights" }).first()).toBeVisible();
    await expect(page.getByText("Aegean Residences", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Marina Avenue 10, Piraeus, Piraeus Municipality").first()).toBeVisible();
    await expect(page.getByText("Mai Developments").first()).toBeVisible();
    await expect(page.getByText("Aegean Studio").first()).toBeVisible();
    await expect(page.getByText("BuildCo").first()).toBeVisible();
    await expect(page.getByText("BP-2026-01").first()).toBeVisible();
    await expect(page.getByText("A101").first()).toBeVisible();
    await expect(page.getByText("82 m2 internal").first()).toBeVisible();
    await expect(page.getByText("A101 floor plan").first()).toBeVisible();
    await expect(page.getByRole("link", { name: /project brochure/i }).first()).toBeVisible();
  });
});
