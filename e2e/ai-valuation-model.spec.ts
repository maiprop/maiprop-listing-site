/**
 * AI valuation model e2e coverage.
 *
 * Scenario coverage for the sourced-evidence (V2) valuation model:
 * 1. Auction detail AI insights prefer auctionAdjustedValue as primary.
 * 2. Auction detail valuation panel keeps the OS auction estimate separate.
 * 3. New-build detail shows the primary clean-market valuation response.
 * 4. Compare drawer shows clean-market values and marks sparse payloads unavailable.
 * 5. Quick Sale shows Unavailable when the valuation comes back empty.
 * 6. Quick Sale shows the AI estimate when the valuation succeeds.
 * 7. Quick Sale provider errors surface the unavailable toast and keep Unavailable.
 * 8. Supabase auth/profile/function/storage calls are mocked, so no live data is mutated.
 * 7. Quick Sale sparse success falls back to asking price and applies the 5% discount.
 * 8. Quick Sale provider errors surface a fallback-estimate toast.
 * 9. Supabase auth/profile/function/storage calls are mocked, so no live data is mutated.
 *
 * The only deliberately uncovered e2e branch is the live mAI Prop OS/OpenAI secret path;
 * that should remain in live smoke tests because it spends quota and depends on real secrets.
 */
import { expect, test, type Page } from "@playwright/test";
import fs from "node:fs";

const AUCTION_ID = "0308050d-8d62-4fc8-b421-7c74116343b3";
const NEW_BUILD_ID = "1308050d-8d62-4fc8-b421-7c74116343b3";
const COMPARE_CLEAN_ID = "2308050d-8d62-4fc8-b421-7c74116343b3";
const COMPARE_SPARSE_ID = "3308050d-8d62-4fc8-b421-7c74116343b3";
const LOCAL_E2E_SUPABASE_URL = "https://abcdefghijklmnopqrst.supabase.co";
const CI_E2E_SUPABASE_PROJECT_ID = "abcdefghijklmnop";

const fixtureImage =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'%3E%3Crect width='640' height='360' fill='%23f3eee8'/%3E%3Crect x='120' y='120' width='400' height='180' fill='%238160d8'/%3E%3C/svg%3E";

const tinyPng = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=",
  "base64",
);

type ListingRow = Record<string, unknown>;
type ValuationHandler = (body: Record<string, unknown>) => Record<string, unknown>;

const numberPattern = (value: number) => {
  const text = value.toLocaleString("en-US").replace(/,/g, "[,.]");
  return new RegExp(text);
};

const makeListing = (overrides: ListingRow = {}): ListingRow => ({
  id: "listing-1",
  owner_id: "owner-1",
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
  status: "active",
  title: "Hybrid Model Test Home",
  description: "A deterministic listing for valuation model e2e coverage.",
  address: "44 Aris Street",
  city: "Athens",
  region: "Attica",
  postal_code: "10000",
  price: 275000,
  price_per_sqm: 3056,
  sqm: 90,
  bedrooms: 2,
  bathrooms: 1,
  wc_count: 0,
  kitchens: 1,
  living_rooms: 1,
  floor: 1,
  total_floors: 3,
  levels: 1,
  year_built: 1975,
  energy_class: "B",
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
  has_storage: false,
  has_balcony: true,
  has_view: false,
  has_furnished: false,
  listing_images: [{ url: fixtureImage, sort_order: 1 }],
  profiles: {
    user_id: "owner-1",
    display_name: "mAI Prop Owner",
    avatar_url: null,
    verified: true,
    role: "agent",
  },
  ownerIsPro: true,
  ownerParticipantType: "agent",
  ...overrides,
});

const fakeJwt = () => {
  const header = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url");
  const payload = Buffer.from(JSON.stringify({
    sub: "e2e-user",
    aud: "authenticated",
    role: "authenticated",
    exp: Math.floor(Date.now() / 1000) + 3600,
  })).toString("base64url");
  return `${header}.${payload}.e2e`;
};

const authStorageKeys = () => {
  const readDotEnvUrl = () => {
    for (const file of [".env.local", ".env"]) {
      if (!fs.existsSync(file)) continue;
      const match = fs.readFileSync(file, "utf8").match(/^VITE_SUPABASE_(?:URL|PROJECT_URL)=(.+)$/m);
      if (match?.[1]) return match[1].trim().replace(/^['"]|['"]$/g, "");
    }
    return null;
  };
  const configuredUrls = [
    process.env.VITE_SUPABASE_URL,
    process.env.VITE_SUPABASE_PROJECT_URL,
    readDotEnvUrl(),
    LOCAL_E2E_SUPABASE_URL,
  ].filter((value): value is string => Boolean(value));
  const projectIds = [
    process.env.VITE_SUPABASE_PROJECT_ID,
    CI_E2E_SUPABASE_PROJECT_ID,
  ].filter((value): value is string => Boolean(value));
  const keys = new Set(projectIds.map((projectId) => `sb-${projectId}-auth-token`));
  for (const configuredUrl of configuredUrls) {
    try {
      keys.add(`sb-${new URL(configuredUrl).hostname.split(".")[0]}-auth-token`);
    } catch (_error) {
      keys.add("sb-localhost-auth-token");
    }
  }
  if (keys.size === 0) keys.add("sb-localhost-auth-token");
  return [...keys];
};

const makeProfile = (role: "buyer" | "seller") => ({
  user_id: "e2e-user",
  id: "e2e-profile",
  display_name: role === "seller" ? "E2E Seller" : "E2E Buyer",
  avatar_url: null,
  role,
  participant_type: role,
  first_name: "E2E",
  last_name: role,
  city: "Athens",
  country: "Greece",
  phone: null,
  website_url: null,
  is_platform_admin: false,
  verified: true,
  created_at: "2026-06-01T10:00:00Z",
  updated_at: "2026-06-01T10:00:00Z",
  bio: null,
  investor_mode: null,
  subscription_product_id: null,
  force_pro_access: true,
  role_switch_in_progress_at: null,
  account_status: "active",
  account_moderation_reason: null,
  account_moderated_at: null,
  account_moderated_by: null,
});

const mockAuth = async (page: Page, role: "buyer" | "seller") => {
  const token = fakeJwt();
  const user = {
    id: "e2e-user",
    aud: "authenticated",
    role: "authenticated",
    email: `${role}@e2e.test`,
    app_metadata: { provider: "email", providers: ["email"] },
    user_metadata: { full_name: `E2E ${role}` },
    created_at: "2026-06-01T10:00:00Z",
  };
  const session = {
    access_token: token,
    refresh_token: "e2e-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  const profile = makeProfile(role);

  await page.addInitScript(({ keys, value }) => {
    localStorage.clear();
    const sessionJson = JSON.stringify(value);
    for (const key of keys) localStorage.setItem(key, sessionJson);
    const originalGetItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function getItemWithE2ESupabaseSession(key) {
      if (
        typeof key === "string" &&
        key.startsWith("sb-") &&
        key.endsWith("-auth-token")
      ) {
        return originalGetItem.call(this, key) ?? sessionJson;
      }
      return originalGetItem.call(this, key);
    };
    localStorage.setItem("maiprop_lang", "en");
    localStorage.setItem("maiprop_cookie_consent", JSON.stringify({
      accepted: true,
      functional: true,
      analytics: false,
      mapping: false,
      timestamp: Date.now(),
    }));
  }, { keys: authStorageKeys(), value: session });

  await page.route("**/auth/v1/**", async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.endsWith("/user")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(user) });
      return;
    }
    if (url.pathname.endsWith("/token")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(session) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route("**/rest/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const accept = request.headers().accept ?? "";
    const wantsObject = accept.includes("vnd.pgrst.object");

    if (url.pathname.includes("/profiles")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(profile) });
      return;
    }
    if (url.pathname.includes("/firesale_requests") && request.method() === "POST") {
      await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ id: "firesale-e2e" }) });
      return;
    }
    if (url.pathname.includes("/rpc/record_user_auth_activity")) {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify("ok") });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify(wantsObject ? null : []),
    });
  });
};

const NUMERIC_V2_FIELDS: string[] = [
  "estimatedValue",
  "auctionAdjustedValue",
  "rangeLow",
  "rangeHigh",
  "executionValue",
  "pricePerSqmEstimate",
  "rentalYieldEstimate",
  "objectiveValueProxy",
  "confidence",
  "liquidityScore",
  "legalCleanliness",
  "planningCertainty",
  "taxFriction",
  "transferReadiness",
  "listingQualityScore",
  "marketComparisonPct"
];

type V2Overrides = Record<string, unknown>;

const v2ValuationResponse = (overrides: V2Overrides = {}): Record<string, unknown> => {
  const merged: Record<string, unknown> = {
    responseVersion: 2,
    status: "available",
    transaction: "sale",
    valueUnit: "EUR",
    estimateBasis: "market_value",
    providerPrediction: null,
    estimatedValue: 130000,
    auctionAdjustedValue: 154000,
    rangeLow: 120000,
    rangeHigh: 140000,
    rangeBasis: "estimatedValue",
    executionValue: 115000,
    pricePerSqmEstimate: 1711,
    rentalYieldEstimate: 4.5,
    objectiveValueProxy: null,
    confidence: 82,
    confidenceLabel: "High",
    liquidityScore: 50,
    legalCleanliness: null,
    planningCertainty: null,
    taxFriction: null,
    transferReadiness: null,
    listingQualityScore: null,
    marketComparison: "below_market",
    marketComparisonPct: -44,
    pricingPosition: "overpriced",
    summary: "Supported valuation evidence for e2e coverage.",
    legalSummary: null,
    taxSummary: null,
    renovationPotential: null,
    highestBestUseHint: null,
    keyFactors: [],
    redFlags: [],
    methodUsed: "E2E deterministic valuation fixture",
    ...overrides,
    evidence: {
      independentlyVerified: false,
      fields: {
        estimatedValue: "ai_estimate",
        auctionAdjustedValue: "ai_estimate",
        rangeLow: "derived_ai",
        rangeHigh: "derived_ai",
        executionValue: "derived_ai",
        pricePerSqmEstimate: "derived_ai",
        rentalYieldEstimate: "ai_estimate",
        objectiveValueProxy: "unavailable",
        confidence: "ai_estimate",
        liquidityScore: "ai_estimate",
        legalCleanliness: "unavailable",
        planningCertainty: "unavailable",
        taxFriction: "unavailable",
        transferReadiness: "unavailable",
        listingQualityScore: "unavailable",
        marketComparisonPct: "derived_ai",
      },
      analysis: "ai_estimate",
      limitations: ["Not a formal appraisal."],
    },
  };
  const evidence = merged.evidence as Record<string, unknown>;
  const fields = evidence.fields as Record<string, string>;
  for (const key of NUMERIC_V2_FIELDS) {
    if (merged[key] === null || merged[key] === undefined) fields[key] = "unavailable";
    else if (fields[key] === "unavailable") fields[key] = "ai_estimate";
  }
  return merged;
};

const defaultValuationFor = (body: Record<string, unknown>): Record<string, unknown> => {
  if (body.listingType === "auction") {
    return v2ValuationResponse({ transaction: "auction", estimateBasis: "auction_value" });
  }
  return v2ValuationResponse({});
};

const mockBackend = async (
  page: Page,
  listings: ListingRow[],
  options: {
    role?: "buyer" | "seller";
    valuation?: ValuationHandler;
  } = {},
) => {
  await mockAuth(page, options.role ?? "buyer");

  const valuation = options.valuation ?? defaultValuationFor;

  await page.route(/\/api\/public\/similar-listings(?:\?|$)/, async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ data: [] }) });
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

  await page.route(/\/api\/public\/listings(?:\?|$)/, async (route) => {
    const url = new URL(route.request().url());
    const listingType = url.searchParams.get("listing_type");
    const data = listingType ? listings.filter((listing) => listing.listing_type === listingType) : listings;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({ data, hasMore: false, page: 1, pageSize: data.length }),
    });
  });

  await page.route("**/functions/v1/**", async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const functionName = url.pathname.split("/functions/v1/")[1]?.split("/")[0] ?? "";
    const body = request.postData() ? JSON.parse(request.postData() ?? "{}") as Record<string, unknown> : {};

    if (functionName === "property-valuation") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(valuation(body)) });
      return;
    }
    if (functionName === "ai-quota-status") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ allowed: true, used: 0, limit: 999999 }),
      });
      return;
    }
    if (functionName === "check-subscription") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ subscribed: true, product_id: null, subscription_end: null }),
      });
      return;
    }
    if (functionName === "owner-pro-status") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ isPro: true }) });
      return;
    }
    if (functionName === "neighbourhood-report") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({ safetyScore: { score: 88 }, noiseLevel: { label: "Quiet" } }),
      });
      return;
    }
    if (functionName === "property-pois") {
      await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ pois: [] }) });
      return;
    }
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({}) });
  });

  await page.route("**/storage/v1/object/**", async (route) => {
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ Key: "e2e/photo.png" }) });
  });

  await page.route("https://api.mapbox.com/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
  await page.route("https://events.mapbox.com/**", async (route) => {
    await route.fulfill({ status: 204, body: "" });
  });
};

const collectPageErrors = (page: Page) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  return errors;
};

const uploadFivePhotos = async (page: Page) => {
  await page.locator('input[type="file"]').setInputFiles(
    Array.from({ length: 5 }, (_, index) => ({
      name: `quick-sale-${index + 1}.png`,
      mimeType: "image/png",
      buffer: tinyPng,
    })),
  );
};

const fillQuickSaleForm = async (page: Page) => {
  await page.getByPlaceholder(/Kifisia/i).fill("Kifisia, Dekelia 24, Athens");
  await page.getByPlaceholder(/050240601001/i).fill("050240601001/0/1");
  await page.locator("select").first().selectOption("apartment");
  await page.getByPlaceholder(/120/).fill("100");
  await page.getByPlaceholder(/target EUR/i).fill("350000");
  await page.getByPlaceholder(/1998/).fill("2005");
  await uploadFivePhotos(page);
  await page.getByPlaceholder(/Legal issues/i).fill("Clean title package available for review.");
};

test.describe("AI valuation model e2e coverage", () => {
  test("auction detail prefers the auction-adjusted value in insights and valuation panel", async ({ page }) => {
    const errors = collectPageErrors(page);
    const auction = makeListing({
      id: AUCTION_ID,
      title: "Auction Hybrid Apartment",
      listing_type: "auction",
      auction_date: "2026-08-01T10:00:00Z",
      auction_starting_bid: 130000,
      price: 275000,
    });
    await mockBackend(page, [auction]);

    await page.goto(`/property/${AUCTION_ID}`);
    await page.waitForURL(`**/auction/${AUCTION_ID}`);
    await expect(page.getByText("Auction Hybrid Apartment").first()).toBeVisible();

    await page.getByRole("button", { name: /Load AI insights/i }).click();
    await expect(page.getByText(numberPattern(154000)).first()).toBeVisible();

    await page.getByRole("button", { name: /Run valuation analysis/i }).click();
    await expect(page.getByText(/Primary estimate/i)).toBeVisible();
    await expect(page.getByText(numberPattern(154000)).first()).toBeVisible();
    await expect(page.getByText(/Separate OS auction-model estimate/i)).toBeVisible();
    await expect(page.getByText(numberPattern(130000)).first()).toBeVisible();
    expect(errors).toEqual([]);
  });

  test("new-build detail shows the primary clean-market valuation response", async ({ page }) => {
    const newBuild = makeListing({
      id: NEW_BUILD_ID,
      title: "Clean Market New Build",
      listing_type: "new_build",
      is_pre_sale: false,
      construction_status: "foundation",
      price: 420000,
    });
    await mockBackend(page, [newBuild], {
    valuation: () => v2ValuationResponse({
      estimatedValue: 430000,
      auctionAdjustedValue: null,
      rangeLow: null,
      rangeHigh: null,
      rangeBasis: null,
      marketComparisonPct: 19,
      marketComparison: "above_market",
      rentalYieldEstimate: 4.4,
      confidenceLabel: "High",
    }),
    });

    await page.goto(`/new-build/${NEW_BUILD_ID}`);
    await expect(page.getByText("Clean Market New Build").first()).toBeVisible();
    await expect(page.getByText("AI Market Insights").first()).toBeVisible();
    await page.getByRole("button", { name: /Load AI insights/i }).click();
    await expect(page.getByText(numberPattern(430000)).first()).toBeVisible();
  });

  test("compare drawer shows clean-market values and marks sparse payloads unavailable", async ({ page }) => {
    // The compare drawer is a desktop/table interaction; mobile cards expose
    // detail-first navigation and the hover compare affordance is not reliable
    // under touch emulation.
    await page.setViewportSize({ width: 1280, height: 900 });
    const errors = collectPageErrors(page);
    const listings = [
      makeListing({ id: COMPARE_CLEAN_ID, title: "Compare Clean Market", price: 250000 }),
      makeListing({ id: COMPARE_SPARSE_ID, title: "Compare Sparse Market", price: 250000 }),
    ];
    await mockBackend(page, listings, {
      valuation: (body) => body.listingId === COMPARE_SPARSE_ID
        ? {}
        : v2ValuationResponse({
          estimatedValue: 240000,
          auctionAdjustedValue: null,
          rangeLow: null,
          rangeHigh: null,
          rangeBasis: null,
          confidence: 80,
          marketComparison: "above_market",
          marketComparisonPct: 20,
          rentalYieldEstimate: 4.5,
        }),
    });

    await page.goto("/listings");
    await expect(page.getByText("Compare Clean Market").first()).toBeVisible();
    await page.getByTestId(`listing-compare-${COMPARE_CLEAN_ID}`).click();
    await page.getByTestId(`listing-compare-${COMPARE_SPARSE_ID}`).click();
    const compareDrawer = page.getByTestId("compare-drawer").filter({ hasText: "2/3 properties" });
    await expect(compareDrawer).toBeVisible();
    await compareDrawer.getByTestId("open-compare-modal").click();

    const dialog = page.getByRole("dialog", { name: /Property comparison/i });
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: /Run AI Analysis/i }).click();
    const aiValueCells = dialog.locator('tr:has-text("AI Value") td');
    await expect(aiValueCells.nth(1)).toContainText(numberPattern(240000));
    await expect(aiValueCells.nth(2)).toContainText("—");
    expect(errors).toEqual([]);
  });

  test("quick sale shows Unavailable when the valuation comes back empty", async ({ page }) => {
    await mockBackend(page, [], { role: "seller", valuation: () => ({}) });

    await page.goto("/firesale");
    await expect(page.getByText("Property Details").first()).toBeVisible();
    await fillQuickSaleForm(page);
    await page.getByRole("button", { name: /Get AI Estimate/i }).click();

    await expect(page.getByText(/Market estimate/i).first()).toBeVisible();
    await expect(page.getByText("Unavailable").first()).toBeVisible();
  });

  test("quick sale shows the AI estimate when the valuation succeeds", async ({ page }) => {
    await mockBackend(page, [], { role: "seller", valuation: () => v2ValuationResponse({ estimatedValue: 340000 }) });

    await page.goto("/firesale");
    await expect(page.getByText("Property Details").first()).toBeVisible();
    await fillQuickSaleForm(page);
    await page.getByRole("button", { name: /Get AI Estimate/i }).click();

    await expect(page.getByText(/Market estimate/i).first()).toBeVisible();
    await expect(page.getByText(numberPattern(340000)).first()).toBeVisible();
  });

  test("quick sale provider errors surface the unavailable toast and keep the estimate unavailable", async ({ page }) => {
    await mockBackend(page, [], { role: "seller", valuation: () => ({ error: "provider_down" }) });

    await page.goto("/firesale");
    await expect(page.getByText("Property Details").first()).toBeVisible();
    await fillQuickSaleForm(page);
    await page.getByRole("button", { name: /Get AI Estimate/i }).click();

    await expect(page.getByText("AI estimate is temporarily unavailable.").first()).toBeVisible();
    await expect(page.getByText(/Market estimate/i).first()).toBeVisible();
    await expect(page.getByText("Unavailable").first()).toBeVisible();
  });
});
