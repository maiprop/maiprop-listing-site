import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as auctionsRequest, fetchPublicAuctionRows } from "./auctions";
import { onRequest as homepageRequest } from "./homepage";
import { onRequest as listingsRequest } from "./listings";
import { onRequest as openHousesRequest } from "./open-houses";
import {
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeDecimal,
  safeInt,
  safeText,
  safeToken,
  supabaseCount,
  supabaseJson,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";

type FetchMock = ReturnType<typeof vi.fn>;
type CacheApi = {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};

const realFetch = globalThis.fetch;
const realCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
const PROJECT_ID = "abcdefghijklmnopqrst";
const env: PublicApiEnv = {
  SUPABASE_PROJECT_ID: PROJECT_ID,
  SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
};

let cacheStore: Map<string, Response>;
let cacheApi: CacheApi;

function installCache(): CacheApi {
  cacheStore = new Map();
  cacheApi = {
    match: vi.fn(async (request: Request) => cacheStore.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      cacheStore.set(request.url, response.clone());
    }),
  };
  Object.defineProperty(globalThis, "caches", {
    configurable: true,
    value: { default: cacheApi },
  });
  return cacheApi;
}

function restoreCache(): void {
  if (realCachesDescriptor) {
    Object.defineProperty(globalThis, "caches", realCachesDescriptor);
  } else {
    Reflect.deleteProperty(globalThis, "caches");
  }
}

function makeCtx(url: string, options: {
  method?: string;
  requestEnv?: PublicApiEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
} = {}): PublicApiCtx {
  return {
    request: new Request(url, { method: options.method ?? "GET" }),
    env: options.requestEnv ?? env,
    waitUntil: options.waitUntil ?? vi.fn(),
  } as unknown as PublicApiCtx;
}

function fetchMock(): FetchMock {
  return globalThis.fetch as unknown as FetchMock;
}

function fetchUrls(pathname?: string): URL[] {
  return fetchMock()
    .mock.calls.map(([input]) => new URL(String(input)))
    .filter((url) => !pathname || url.pathname === pathname);
}

function initFor(pathname: string): RequestInit {
  const call = fetchMock().mock.calls.find(([input]) => new URL(String(input)).pathname === pathname);
  return call?.[1] as RequestInit;
}

function jsonRows(rows: unknown[], init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(rows), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}

function installSupabaseFetch(): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));

    if (url.pathname === "/functions/v1/fetch-os-auctions") {
      return new Response(JSON.stringify({ data: [] }), {
        headers: { "Content-Type": "application/json" },
      });
    }

    if (init?.method === "HEAD") {
      const total = url.searchParams.get("city") === "eq.Athens" ? "7" : "3";
      return new Response(null, {
        headers: { "Content-Range": `0-0/${total}` },
      });
    }

    if (url.pathname === "/rest/v1/profiles_public") {
      return jsonRows([
        { user_id: "owner-1", display_name: "Maria Agent", avatar_url: "https://img.example/maria.png", role: "agent" },
        { user_id: "owner-2", display_name: "Nikos Owner", avatar_url: null, role: "seller" },
      ]);
    }

    if (url.pathname === "/rest/v1/listings") {
      const listingType = url.searchParams.get("listing_type");
      const select = url.searchParams.get("select") ?? "";

      if (listingType === "eq.auction") {
        return jsonRows([
          { id: "db-2", is_featured: false, priority_placement: 5, auction_date: "2026-06-03" },
          { id: "db-1", is_featured: true, priority_placement: 1, auction_date: "2026-06-01" },
        ]);
      }

      if (select === "city,price_per_sqm,created_at") {
        const previousWindow = new Date();
        previousWindow.setDate(previousWindow.getDate() - 45);
        return jsonRows([
          { city: "Athens", price_per_sqm: 2000, created_at: new Date().toISOString() },
          { city: "Athens", price_per_sqm: 2200, created_at: new Date().toISOString() },
          { city: "Athens", price_per_sqm: 1800, created_at: previousWindow.toISOString() },
          { city: "Athens", price_per_sqm: 1900, created_at: previousWindow.toISOString() },
        ]);
      }

      if (select === "id,city,price_per_sqm,created_at") {
        const previousWindow = new Date();
        previousWindow.setDate(previousWindow.getDate() - 45);
        return jsonRows([
          { id: "p1", city: "Athens", price_per_sqm: 2100, created_at: new Date().toISOString() },
          { id: "p2", city: "Athens", price_per_sqm: "2300", created_at: new Date().toISOString() },
          { id: "p3", city: "Athens", price_per_sqm: 1800, created_at: previousWindow.toISOString() },
          { id: "p4", city: "Athens", price_per_sqm: 1900, created_at: previousWindow.toISOString() },
          { id: "p5", city: "Thessaloniki", price_per_sqm: 1600, created_at: new Date().toISOString() },
        ]);
      }

      if (select === "city,price_per_sqm") {
        return jsonRows([
          { city: "Athens", price_per_sqm: 2100 },
          { city: "Athens", price_per_sqm: "2300" },
          { city: "Thessaloniki", price_per_sqm: 1600 },
        ]);
      }

      if (listingType === "eq.open_house") {
        return jsonRows([
          { id: "open-test", title: "supervisor-177912 open house", cover_image_url: "test", listing_images: [] },
          { id: "open-e2e", title: "E2E-FULL-PUBLISH-20260526T161856Z open house", tags: ["qa-full-publish"], cover_image_url: "test", listing_images: [] },
          { id: "open-1", cover_image_url: null, listing_images: [{ url: "img", sort_order: 1 }] },
          { id: "open-2", cover_image_url: "cover", listing_images: [] },
        ]);
      }

      if (
        listingType === "eq.sale" &&
        url.searchParams.get("limit") === "12" &&
        url.searchParams.get("listing_images.limit") === "3"
      ) {
        return jsonRows([
          { id: "listing-test", owner_id: "owner-1", title: "supervisor-177912 maisonette", address: "supervisor-177912 Test Street" },
          { id: "listing-e2e", owner_id: "owner-1", title: "E2E-FULL-PUBLISH-20260526T161856Z maisonette", tags: ["qa-full-publish"] },
          { id: "listing-1", owner_id: "owner-1", title: "Athens flat" },
          { id: "listing-2", owner_id: "owner-2", title: "Piraeus loft" },
        ]);
      }

      return jsonRows([
        { id: "listing-1", owner_id: "owner-1", title: "Athens flat" },
        { id: "listing-2", owner_id: "owner-2", title: "Piraeus loft" },
      ]);
    }

    return jsonRows([], { status: 404 });
  }) as unknown as FetchMock;
  globalThis.fetch = mock as unknown as typeof fetch;
  return mock;
}

beforeEach(() => {
  installCache();
  installSupabaseFetch();
});

afterEach(() => {
  globalThis.fetch = realFetch;
  restoreCache();
  vi.restoreAllMocks();
});

describe("public API cache helpers", () => {
  it("emits JSON cache headers and preserves explicit no-store errors", async () => {
    const cached = jsonResponse({ ok: true }, { headers: { "X-Test": "1" } });
    expect(cached.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(cached.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=300");
    expect(cached.headers.get("CDN-Cache-Control")).toBe("public, max-age=120, stale-while-revalidate=300");
    expect(cached.headers.get("Strict-Transport-Security")).toContain("max-age=63072000");
    expect(cached.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(cached.headers.get("X-Test")).toBe("1");
    expect(await cached.json()).toEqual({ ok: true });

    const method = methodNotAllowed();
    expect(method.status).toBe(405);
    expect(method.headers.get("Allow")).toBe("GET");
    expect(method.headers.get("Cache-Control")).toBe("no-store");

    const missing = missingRuntime();
    expect(missing.status).toBe(503);
    expect(missing.headers.get("CDN-Cache-Control")).toBe("no-store");
  });

  it("normalizes cache keys and rejects unsafe query values", () => {
    const key = normalizedCacheUrl(
      new URL("https://portal.maiprop.co/api/public/listings?b=2&a=1"),
      "listings",
      new URLSearchParams([
        ["z", "last"],
        ["a", "first"],
      ]),
    );

    expect(key.toString()).toBe("https://portal.maiprop.co/api/public/listings?a=first&z=last");
    expect(safeInt("5000", 24, 1, 200)).toBe(200);
    expect(safeInt("bad", 24, 1, 200)).toBe(24);
    expect(safeDecimal("12.34")).toBe("12.34");
    expect(safeDecimal("12.345")).toBeNull();
    expect(safeText(" *Athens% ", 20)).toBe("Athens");
    expect(safeText("x".repeat(21), 20)).toBeNull();
    expect(safeToken("sale", ["sale", "rent"] as const)).toBe("sale");
    expect(safeToken("delete", ["sale", "rent"] as const)).toBeNull();
  });

  it("calls Supabase with anon auth headers and parses count ranges", async () => {
    const params = new URLSearchParams([["select", "id"]]);
    await expect(supabaseJson(env, "/rest/v1/listings", params)).resolves.toHaveLength(2);

    const count = await supabaseCount(env, "/rest/v1/listings", new URLSearchParams([["city", "eq.Athens"]]));
    expect(count).toBe(7);

    const init = initFor("/rest/v1/listings");
    expect(init.headers).toMatchObject({
      apikey: "publishable_test_key",
      Authorization: "Bearer publishable_test_key",
      Accept: "application/json",
    });
    expect((init as RequestInit & { cf?: unknown }).cf).toEqual({ cacheTtl: 120, cacheEverything: true });
  });

  it("returns cached edge responses without making another upstream request", async () => {
    const ctx = makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2");

    const first = await openHousesRequest(ctx);
    expect(first.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(fetchUrls("/rest/v1/listings")).toHaveLength(1);

    const second = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));
    expect(second.headers.get("X-Maiprop-Cache")).toBe("HIT");
    expect(second.headers.get("X-Frame-Options")).toBe("DENY");
    expect(second.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(await second.json()).toEqual(await first.clone().json());
    expect(fetchUrls("/rest/v1/listings")).toHaveLength(1);
    expect(cacheApi.put).toHaveBeenCalledTimes(1);
  });
});

describe("public listings endpoint", () => {
  it("clamps page size, keeps listing images capped, attaches public owner profiles, and caches the response", async () => {
    const res = await listingsRequest(
      makeCtx(
        "https://portal.maiprop.co/api/public/listings?page=2&pageSize=999&city=*Athens%25&listing_type=sale&features=has_pool,has_alarm,unsafe&energy_class=A,BAD&A%5B%5D=ignored",
      ),
    );
    const body = await res.json() as { data: Array<{ profiles: unknown }>; hasMore: boolean; page: number; pageSize: number };

    expect(res.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(200);
    expect(body.hasMore).toBe(false);
    expect(body.data[0].profiles).toMatchObject({ display_name: "Maria Agent" });

    const listingsUrl = fetchUrls("/rest/v1/listings")[0];
    expect(listingsUrl.searchParams.get("limit")).toBe("200");
    expect(listingsUrl.searchParams.get("offset")).toBe("200");
    expect(listingsUrl.searchParams.get("city")).toBe("ilike.*Athens*");
    expect(listingsUrl.searchParams.get("listing_type")).toBe("eq.sale");
    expect(listingsUrl.searchParams.get("is_off_market")).toBe("eq.false");
    expect(listingsUrl.searchParams.get("listing_images.limit")).toBe("3");
    expect(listingsUrl.searchParams.get("has_pool")).toBe("eq.true");
    expect(listingsUrl.searchParams.get("has_alarm")).toBe("eq.true");
    expect(listingsUrl.searchParams.has("unsafe")).toBe(false);

    const profilesUrl = fetchUrls("/rest/v1/profiles_public")[0];
    expect(profilesUrl.searchParams.get("user_id")).toBe("in.(owner-1,owner-2)");
    expect(cacheApi.put).toHaveBeenCalledTimes(1);
  });

  it("uses the default public catalogue scope unless auctions are explicitly included", async () => {
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?sort=price-desc"));
    expect(fetchUrls("/rest/v1/listings")[0].searchParams.get("listing_type")).toBe("in.(sale,rent,firesale)");
    expect(fetchUrls("/rest/v1/listings")[0].searchParams.get("is_off_market")).toBe("eq.false");
    expect(fetchUrls("/rest/v1/listings")[0].searchParams.getAll("order")).toContain("price.desc");

    fetchMock().mockClear();
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?includeAuctions=true&sort=views"));
    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.has("listing_type")).toBe(false);
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.getAll("order")).toContain("views_count.desc.nullslast");
  });

  it("does not expose off-market rows through public listing search", async () => {
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?is_off_market=true"));

    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.get("id")).toBe("eq.00000000-0000-0000-0000-000000000000");
  });

  it("filters production-blocked fixture records before attaching public owner profiles", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/listings") {
        return jsonRows([
          { id: "listing-supervisor", owner_id: "owner-fixture", title: "supervisor-177912 smoke" },
          { id: "listing-e2e", owner_id: "owner-fixture", title: "E2E-FULL-PUBLISH-20260526T161856Z test", tags: ["qa-full-publish"] },
          { id: "listing-clean", owner_id: "owner-clean", title: "Athens flat" },
        ]);
      }
      if (url.pathname === "/rest/v1/profiles_public") {
        return jsonRows([
          { user_id: "owner-clean", display_name: "Maria Agent", avatar_url: null, role: "agent" },
        ]);
      }
      return jsonRows([]);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?limit=3"));
    const body = await res.json() as { data: Array<{ id: string; profiles: unknown }> };

    expect(body.data.map((row) => row.id)).toEqual(["listing-clean"]);
    expect(body.data[0].profiles).toMatchObject({ display_name: "Maria Agent" });
    expect(fetchUrls("/rest/v1/profiles_public")[0].searchParams.get("user_id")).toBe("in.(owner-clean)");
  });

  it("rejects non-GET requests and missing runtime bindings", async () => {
    const method = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings", { method: "POST" }));
    expect(method.status).toBe(405);

    const missing = await listingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/listings", { requestEnv: {} }),
    );
    expect(missing.status).toBe(503);
    expect(fetchMock()).not.toHaveBeenCalled();
  });
});

describe("public open houses endpoint", () => {
  it("serves upcoming open houses with capped payloads and bounded limits", async () => {
    await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=999"));

    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("limit")).toBe("200");
    expect(url.searchParams.get("listing_type")).toBe("eq.open_house");
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.get("open_house_date")).toMatch(/^gte\./);
    expect(url.searchParams.get("order")).toBe("open_house_date.asc");
    expect(url.searchParams.get("listing_images.limit")).toBe("3");
  });

  it("supports past open houses using a separate cache key", async () => {
    await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?showPast=true&limit=12"));

    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.get("open_house_date")).toMatch(/^lt\./);
    expect(url.searchParams.get("order")).toBe("open_house_date.desc");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("showPast=1");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=off-market-v2");
  });
});

describe("public auctions endpoint", () => {
  it("serves cached DB auctions first, sorts deterministically, and slices to the requested limit", async () => {
    const rows = await fetchPublicAuctionRows(env, 1);
    expect(rows.map((row) => row.id)).toEqual(["db-2"]);

    expect(fetchUrls("/rest/v1/listings")[0]).toBeDefined();
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("samples a wider cached DB window and diversifies organic auctions by municipality", async () => {
    fetchMock().mockResolvedValueOnce(jsonRows([
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `agrinio-${String(i).padStart(2, "0")}`,
        city: "Agrinio",
        is_featured: false,
        priority_placement: 0,
        auction_date: "2026-06-01",
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `athens-${String(i).padStart(2, "0")}`,
        city: "Athens",
        is_featured: false,
        priority_placement: 0,
        auction_date: "2026-06-01",
      })),
      ...Array.from({ length: 30 }, (_, i) => ({
        id: `patras-${String(i).padStart(2, "0")}`,
        city: "Patras",
        is_featured: false,
        priority_placement: 0,
        auction_date: "2026-06-01",
      })),
    ]));

    const rows = await fetchPublicAuctionRows(env, 60);
    expect(rows).toHaveLength(60);
    expect(rows.slice(0, 6).map((row) => row.city)).toEqual([
      "Agrinio",
      "Athens",
      "Patras",
      "Agrinio",
      "Athens",
      "Patras",
    ]);

    expect(fetchUrls("/rest/v1/listings")[0].searchParams.get("limit")).toBe("240");
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("uses the OS proxy when the cached DB window is municipality-clustered", async () => {
    fetchMock().mockResolvedValueOnce(jsonRows(
      Array.from({ length: 48 }, (_, i) => ({
        id: `cached-agrinio-${i}`,
        city: "Agrinio",
        is_featured: false,
        priority_placement: 0,
        auction_date: "2026-06-01",
      })),
    ));
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: "os-athens", city: "Athens", is_featured: false, priority_placement: 0, auction_date: "2026-06-01" },
          { id: "os-patras", city: "Patras", is_featured: false, priority_placement: 0, auction_date: "2026-06-01" },
          { id: "os-chania", city: "Chania", is_featured: false, priority_placement: 0, auction_date: "2026-06-01" },
        ],
      }), { headers: { "Content-Type": "application/json" } }),
    );

    const rows = await fetchPublicAuctionRows(env, 60);
    expect(rows.map((row) => row.id)).toEqual(["os-athens", "os-chania", "os-patras"]);

    expect(fetchUrls("/rest/v1/listings")[0].searchParams.get("limit")).toBe("240");
    const osCall = fetchUrls("/functions/v1/fetch-os-auctions")[0];
    expect(osCall).toBeDefined();
    expect(JSON.parse(String(initFor("/functions/v1/fetch-os-auctions").body))).toMatchObject({
      page: 80,
      pageSize: 55,
      sampleAcrossGreece: false,
    });
  });

  it("uses the OS proxy only when the cached DB window is empty", async () => {
    fetchMock().mockResolvedValueOnce(jsonRows([]));
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify({
        data: [
          { id: "low", is_featured: false, priority_placement: 0, auction_date: "2026-06-01" },
          { id: "high", is_featured: false, priority_placement: 8, auction_date: "2026-06-03" },
          { id: "featured", is_featured: true, priority_placement: 0, auction_date: "2026-05-30" },
        ],
      }), { headers: { "Content-Type": "application/json" } }),
    );

    const rows = await fetchPublicAuctionRows(env, 2);
    expect(rows.map((row) => row.id)).toEqual(["high", "featured"]);

    const dbCall = fetchUrls("/rest/v1/listings")[0];
    expect(dbCall).toBeDefined();
    const osCall = fetchUrls("/functions/v1/fetch-os-auctions")[0];
    expect(osCall).toBeDefined();
    const init = initFor("/functions/v1/fetch-os-auctions");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      page: 80,
      pageSize: 2,
      sampleAcrossGreece: false,
      sortBy: "AUCTION_DATE",
    });
  });

  it("returns an empty list when both the DB cache and OS proxy are empty or unavailable", async () => {
    fetchMock().mockResolvedValueOnce(jsonRows([]));
    await expect(fetchPublicAuctionRows(env, 1)).resolves.toEqual([]);

    fetchMock().mockClear();
    fetchMock().mockResolvedValueOnce(jsonRows([]));
    fetchMock().mockRejectedValueOnce(new Error("timeout"));
    await expect(fetchPublicAuctionRows(env, 2)).resolves.toEqual([]);
  });

  it("queries cached DB auctions with bounded image payloads", async () => {
    await expect(fetchPublicAuctionRows(env, 1)).resolves.toMatchObject([{ id: "db-2" }]);

    const dbUrl = fetchUrls("/rest/v1/listings")[0];
    expect(dbUrl.searchParams.get("listing_type")).toBe("eq.auction");
    expect(dbUrl.searchParams.get("is_off_market")).toBe("eq.false");
    expect(dbUrl.searchParams.get("listing_images.limit")).toBe("3");
    expect(dbUrl.searchParams.get("limit")).toBe("1");
  });

  it("clamps public auction requests and caches by day", async () => {
    const res = await auctionsRequest(makeCtx("https://portal.maiprop.co/api/public/auctions?limit=999"));
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(2);

    const dbUrl = fetchUrls("/rest/v1/listings")[0];
    expect(dbUrl.searchParams.get("limit")).toBe("240");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("limit=60");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("day=");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=municipality-rotation-v4");
  });
});

describe("public homepage endpoint", () => {
  it("rejects invalid sections without caching and delegates auctions to the bounded public auction handler", async () => {
    const invalid = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=invalid"));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Cache-Control")).toBe("no-store");

    await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=auctions"));
    const dbUrl = fetchUrls("/rest/v1/listings")[0];
    expect(dbUrl.searchParams.get("listing_type")).toBe("eq.auction");
    expect(dbUrl.searchParams.get("is_off_market")).toBe("eq.false");
    expect(dbUrl.searchParams.get("limit")).toBe("240");
  });

  it("fetches lightweight featured and open-house homepage sections", async () => {
    const featured = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=featured"));
    const featuredRows = await featured.json() as Array<{ id: string }>;
    expect(featuredRows.map((row) => row.id)).toEqual(["listing-1", "listing-2"]);
    let url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("listing_type")).toBe("eq.sale");
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.get("listing_images.limit")).toBe("3");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=off-market-v2");

    fetchMock().mockClear();
    const openHouses = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=open-houses"));
    const openHouseRows = await openHouses.json() as Array<{ id: string }>;
    expect(openHouseRows.map((row) => row.id)).toEqual(["open-1", "open-2"]);
    url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("listing_type")).toBe("eq.open_house");
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.get("open_house_date")).toMatch(/^gte\./);
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("listing_images.limit")).toBe("3");
  });

  it("fetches count and price-index sections without exposing uncapped listing payloads", async () => {
    const typeCounts = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=type-counts"));
    await expect(typeCounts.json()).resolves.toEqual({ apartment: 3, land: 3 });
    expect(fetchMock().mock.calls.every(([, init]) => init?.method === "HEAD")).toBe(true);

    fetchMock().mockClear();
    const priceIndex = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=price-index"));
    const rows = await priceIndex.json() as Array<{ city: string; avg_price_per_sqm: number; is_live: boolean; trend_change_pct: number | null; trend_up: boolean | null; trend_is_live: boolean }>;
    expect(rows.find((row) => row.city === "Athens")).toMatchObject({
      avg_price_per_sqm: 2200,
      is_live: true,
      trend_change_pct: 18.9,
      trend_up: true,
      trend_is_live: true,
    });
    const priceIndexUrl = fetchUrls("/rest/v1/listings")[0];
    expect(priceIndexUrl.searchParams.get("limit")).toBe("1000");
    expect(priceIndexUrl.searchParams.get("select")).toBe("id,city,price_per_sqm,created_at");
    expect(priceIndexUrl.searchParams.get("is_off_market")).toBe("eq.false");
    expect(priceIndexUrl.searchParams.get("city")).toContain("Athens");
  });

  it("builds popular location trends from counts and bounded recent price samples", async () => {
    const res = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=popular-locations"));
    const rows = await res.json() as Array<{ name: string; listings: number; trend: string; trendUp: boolean }>;
    expect(rows[0]).toMatchObject({ name: "Athens", listings: 7, trend: "+13.5%", trendUp: true });

    const listingsSample = fetchUrls("/rest/v1/listings").find((url) => url.searchParams.get("select") === "city,price_per_sqm,created_at");
    expect(listingsSample?.searchParams.get("limit")).toBe("1000");
    expect(listingsSample?.searchParams.get("is_off_market")).toBe("eq.false");
  });
});
