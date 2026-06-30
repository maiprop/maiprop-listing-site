import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequest as auctionsRequest, fetchPublicAuctionRows } from "./auctions";
import { onRequest as homepageRequest } from "./homepage";
import { onRequest as listingRequest } from "./listing";
import { onRequest as listingsRequest } from "./listings";
import { onRequest as openHousesRequest } from "./open-houses";
import { onRequest as similarListingsRequest } from "./similar-listings";
import {
  cachedJson,
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

      if (listingType === "eq.new_build") {
        return jsonRows([
          {
            id: "new-build-1",
            owner_id: "owner-1",
            title: "Canonical Project Listing",
            listing_type: "new_build",
            is_pre_sale: false,
          },
        ]);
      }

      if (
        (listingType === "eq.sale" || listingType === "in.(sale,new_build)") &&
        url.searchParams.get("listing_images.limit") === "3"
      ) {
        return jsonRows([
          { id: "listing-test", owner_id: "owner-1", title: "supervisor-177912 maisonette", address: "supervisor-177912 Test Street" },
          { id: "listing-e2e", owner_id: "owner-1", title: "E2E-FULL-PUBLISH-20260526T161856Z maisonette", tags: ["qa-full-publish"] },
          { id: "listing-1", owner_id: "owner-1", title: "Athens flat" },
          { id: "listing-2", owner_id: "owner-2", title: "Piraeus loft" },
          { id: "listing-3", owner_id: "owner-2", title: "Glyfada villa" },
          { id: "listing-4", owner_id: "owner-2", title: "Mykonos villa" },
          { id: "listing-5", owner_id: "owner-2", title: "Santorini hotel" },
          { id: "listing-6", owner_id: "owner-2", title: "Thessaloniki apartment" },
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

  it("supports estimated Supabase counts for high-traffic approximate counters", async () => {
    await expect(
      supabaseCount(env, "/rest/v1/listings", new URLSearchParams([["select", "id"]]), {
        countStrategy: "estimated",
      }),
    ).resolves.toBe(3);

    const init = initFor("/rest/v1/listings");
    expect(init.headers).toMatchObject({
      Prefer: "count=estimated",
    });
  });

  it("degrades transient Supabase public-read failures without hiding schema or auth errors", async () => {
    fetchMock().mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));
    await expect(supabaseJson(env, "/rest/v1/listings", new URLSearchParams([["select", "id"]]))).resolves.toEqual([]);

    fetchMock().mockResolvedValueOnce(new Response(null, { status: 504 }));
    await expect(supabaseCount(env, "/rest/v1/listings", new URLSearchParams([["select", "id"]]))).resolves.toBe(0);

    fetchMock().mockResolvedValueOnce(new Response("bad column", { status: 400 }));
    await expect(supabaseJson(env, "/rest/v1/listings", new URLSearchParams([["select", "missing_column"]]))).rejects.toThrow(
      "Supabase request failed with 400",
    );

    fetchMock().mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await expect(supabaseCount(env, "/rest/v1/listings", new URLSearchParams([["select", "id"]]))).rejects.toThrow(
      "Supabase count failed with 403",
    );
  });

  it("uses abortable Supabase fetches and treats aborts as transient public-read failures", async () => {
    fetchMock().mockRejectedValueOnce(new DOMException("Timeout", "AbortError"));
    await expect(supabaseJson(env, "/rest/v1/listings", new URLSearchParams([["select", "id"]]))).resolves.toEqual([]);

    fetchMock().mockRejectedValueOnce(new DOMException("Timeout", "AbortError"));
    await expect(supabaseCount(env, "/rest/v1/listings", new URLSearchParams([["select", "id"]]))).resolves.toBe(0);

    const jsonInit = fetchMock().mock.calls[0][1] as RequestInit;
    const countInit = fetchMock().mock.calls[1][1] as RequestInit;
    expect(jsonInit.signal).toBeInstanceOf(AbortSignal);
    expect(countInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries transient Supabase reads before failing a cold public cache miss", async () => {
    fetchMock().mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    await expect(
      supabaseJson(env, "/rest/v1/listings", new URLSearchParams([["select", "id"]]), {
        failOnTransient: true,
        retryDelayMs: 0,
      }),
    ).resolves.toEqual([
      { id: "listing-1", owner_id: "owner-1", title: "Athens flat" },
      { id: "listing-2", owner_id: "owner-2", title: "Piraeus loft" },
    ]);
    expect(fetchUrls("/rest/v1/listings")).toHaveLength(2);
  });

  it("recovers public open-house cold cache misses after one transient upstream failure", async () => {
    fetchMock().mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    const res = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(fetchUrls("/rest/v1/listings")).toHaveLength(2);
    await expect(res.json()).resolves.toEqual(expect.arrayContaining([
      { id: "open-1", cover_image_url: null, listing_images: [{ url: "img", sort_order: 1 }] },
      { id: "open-2", cover_image_url: "cover", listing_images: [] },
    ]));
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
    expect(cacheApi.put).toHaveBeenCalledTimes(2);
    expect(cacheApi.put.mock.calls.some(([request]) => request.url.includes("__maiprop_stale=1"))).toBe(true);
  });

  it("does not return successful public API misses before fresh and stale cache entries are committed", async () => {
    let releasePut!: () => void;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    cacheApi.put.mockImplementation(async (request: Request, response: Response) => {
      await putGate;
      cacheStore.set(request.url, response.clone());
    });

    const pending = Promise.resolve(openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2")));
    await Promise.resolve();
    const returnedBeforeCacheCommit = await Promise.race([
      pending.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
    ]);

    expect(returnedBeforeCacheCommit).toBe(false);
    releasePut();

    const response = await pending;
    expect(response.status).toBe(200);
    expect(cacheApi.put).toHaveBeenCalledTimes(2);
    expect([...cacheStore.keys()].some((key) => key.includes("__maiprop_stale=1"))).toBe(true);
  });

  it("coalesces concurrent cache misses for the same public API key", async () => {
    let releaseFetch!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/listings") {
        await gate;
        return jsonRows([{ id: "open-1", cover_image_url: "cover", listing_images: [] }]);
      }
      return jsonRows([]);
    });

    const first = openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));
    const second = openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));
    await Promise.resolve();
    releaseFetch();

    const [firstRes, secondRes] = await Promise.all([first, second]);

    expect(firstRes.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(secondRes.headers.get("X-Maiprop-Cache")).toBe("COALESCED");
    expect(fetchUrls("/rest/v1/listings")).toHaveLength(1);
    await expect(firstRes.json()).resolves.toEqual(await secondRes.clone().json());
  });

  it("bounds cold cache miss latency when a producer stalls", async () => {
    let releaseProducer!: () => void;
    const producerGate = new Promise<Response>((resolve) => {
      releaseProducer = () => resolve(jsonResponse({ late: true }));
    });
    const pending = cachedJson(
      makeCtx("https://portal.maiprop.co/api/public/open-houses?timeout-test=1"),
      new URL("https://portal.maiprop.co/api/public/open-houses?timeout-test=1"),
      () => producerGate,
      { producerTimeoutMs: 5 },
    );

    const result = await Promise.race([
      pending.then(async (res) => ({ status: res.status, body: await res.json() })),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
    ]);

    try {
      expect(result).toEqual({ status: 503, body: { error: "Supabase upstream unavailable" } });
      expect(cacheApi.put).not.toHaveBeenCalled();
    } finally {
      releaseProducer();
      await pending.catch(() => null);
    }
  });

  it("serves stale public cache instead of 503 when Supabase is transiently unavailable", async () => {
    const first = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));
    expect(first.headers.get("X-Maiprop-Cache")).toBe("MISS");

    for (const key of [...cacheStore.keys()]) {
      if (!key.includes("__maiprop_stale=1")) cacheStore.delete(key);
    }
    fetchMock().mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    const stale = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));

    expect(stale.status).toBe(200);
    expect(stale.headers.get("X-Maiprop-Cache")).toBe("STALE");
    expect(stale.headers.get("Warning")).toContain("Response is stale");
    await expect(stale.json()).resolves.toEqual(await first.clone().json());
    expect(fetchUrls("/rest/v1/listings")).toHaveLength(2);
  });

  it("serves stale public cache immediately while refreshing the expired fresh key in the background", async () => {
    const first = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));
    for (const key of [...cacheStore.keys()]) {
      if (!key.includes("__maiprop_stale=1")) cacheStore.delete(key);
    }

    let releaseFetch!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    fetchMock().mockImplementation(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/listings") {
        await gate;
        return jsonRows([{ id: "open-refreshed", cover_image_url: "new", listing_images: [] }]);
      }
      return jsonRows([]);
    });

    const waitUntil = vi.fn();
    const responsePromise = Promise.resolve(
      openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2", { waitUntil })),
    );
    const returnedImmediately = await Promise.race([
      responsePromise.then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 10)),
    ]);

    expect(returnedImmediately).toBe(true);
    const stale = await responsePromise;
    expect(stale.headers.get("X-Maiprop-Cache")).toBe("STALE");
    expect(stale.headers.get("Warning")).toContain("Response is stale");
    await expect(stale.json()).resolves.toEqual(await first.clone().json());
    expect(waitUntil).toHaveBeenCalled();

    releaseFetch();
    await Promise.all(waitUntil.mock.calls.map(([promise]) => promise));
    expect(fetchUrls("/rest/v1/listings")).toHaveLength(2);
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
    expect(cacheApi.put).toHaveBeenCalledTimes(2);
    expect(cacheApi.put.mock.calls.some(([request]) => request.url.includes("__maiprop_stale=1"))).toBe(true);
  });

  it("uses the default public catalogue scope unless auctions are explicitly included", async () => {
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?sort=price-desc"));
    let url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("listing_type")).toBe("in.(sale,rent,firesale,new_build)");
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.getAll("order")).toContain("price.desc");
    expect(url.searchParams.get("select")).not.toContain("project_units!project_units_project_id_fkey");

    fetchMock().mockClear();
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?includeAuctions=true&sort=views"));
    url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.has("listing_type")).toBe(false);
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.getAll("order")).toContain("views_count.desc.nullslast");
  });

  it("returns canonical new-build listings by listing_type instead of the legacy pre-sale flag", async () => {
    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?listing_type=new_build&limit=1"));
    const body = await res.json() as { data: Array<{ id: string; listing_type: string; is_pre_sale: boolean }> };

    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("listing_type")).toBe("eq.new_build");
    expect(url.searchParams.get("select")).toContain("project_units!project_units_project_id_fkey");
    expect(url.searchParams.has("pre_sale")).toBe(false);
    expect(url.searchParams.has("is_pre_sale")).toBe(false);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: "new-build-1",
        listing_type: "new_build",
        is_pre_sale: false,
      }),
    ]);
  });

  it("maps legacy is_pre_sale=true requests to canonical new-build listing_type", async () => {
    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?is_pre_sale=true&limit=1"));
    const body = await res.json() as { data: Array<{ id: string; listing_type: string; is_pre_sale: boolean }> };

    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("listing_type")).toBe("eq.new_build");
    expect(url.searchParams.has("is_pre_sale")).toBe(false);
    expect(body.data[0]).toMatchObject({
      id: "new-build-1",
      listing_type: "new_build",
      is_pre_sale: false,
    });
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

  it("returns 503 instead of an empty successful catalogue when the listings upstream is transiently unavailable", async () => {
    fetchMock()
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?limit=3"));

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
    expect(cacheApi.put).not.toHaveBeenCalled();
  });
});

describe("public listing detail endpoint", () => {
  it("fetches one active public listing, attaches the public owner profile, and caches by id", async () => {
    const res = await listingRequest(
      makeCtx("https://portal.maiprop.co/api/public/listing?id=11111111-1111-4111-8111-111111111111"),
    );
    const body = await res.json() as { data: { id: string; profiles: unknown } };

    expect(body.data.id).toBe("listing-1");
    expect(body.data.profiles).toMatchObject({ display_name: "Maria Agent" });

    const listingsUrl = fetchUrls("/rest/v1/listings")[0];
    expect(listingsUrl.searchParams.get("select")).not.toContain("*");
    expect(listingsUrl.searchParams.get("select")).toContain("description");
    expect(listingsUrl.searchParams.get("select")).toContain("listing_images(url,sort_order)");
    expect(listingsUrl.searchParams.get("id")).toBe("eq.11111111-1111-4111-8111-111111111111");
    expect(listingsUrl.searchParams.get("status")).toBe("eq.active");
    expect(listingsUrl.searchParams.get("is_off_market")).toBe("eq.false");
    expect(listingsUrl.searchParams.get("listing_images.order")).toBe("sort_order.asc");
    expect(fetchUrls("/rest/v1/profiles_public")[0].searchParams.get("select")).toBe("user_id,display_name,avatar_url,role");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=open-house-transaction-v1");
  });

  it("requests and returns the linked project, project units, and project media for new-build details", async () => {
    const projectPayload = {
      id: "project-1",
      name: "Marina Heights",
      developer_company: "Mai Developments",
      building_permit_number: "BP-2026-01",
      project_units: [
        {
          id: "unit-1",
          unit_number: "A101",
          availability_status: "available",
          floor: 1,
          internal_sqm: 82,
          bedrooms: 2,
          bathrooms: 2,
          price: 410000,
          price_per_sqm: 5000,
        },
      ],
      project_media: [
        {
          id: "media-1",
          media_type: "floor_plan",
          title: "A101 floor plan",
          url: "https://cdn.example/floor-plan.jpg",
          sort_order: 1,
        },
      ],
    };
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/listings") {
        return jsonRows([
          {
            id: "listing-1",
            owner_id: "owner-1",
            title: "Marina Heights A101",
            listing_type: "new_build",
            project_id: "project-1",
            project: projectPayload,
          },
        ]);
      }
      if (url.pathname === "/rest/v1/profiles_public") {
        return jsonRows([{ user_id: "owner-1", display_name: "Mai Developer", avatar_url: null, role: "developer" }]);
      }
      return jsonRows([]);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const res = await listingRequest(
      makeCtx("https://portal.maiprop.co/api/public/listing?id=11111111-1111-4111-8111-111111111111"),
    );
    const body = await res.json() as {
      data: {
        project_id: string;
        project: typeof projectPayload;
        profiles: unknown;
      };
    };

    expect(body.data.project_id).toBe("project-1");
    expect(body.data.project.project_units).toHaveLength(1);
    expect(body.data.project.project_media).toHaveLength(1);
    expect(body.data.profiles).toMatchObject({ display_name: "Mai Developer" });

    const listingsUrl = fetchUrls("/rest/v1/listings")[0];
    const select = listingsUrl.searchParams.get("select") ?? "";
    expect(select).not.toContain("(,");
    expect(select).not.toContain(",)");
    expect(select).toContain("project_id");
    expect(select).toContain("project:projects!listings_project_id_fkey(id,name");
    expect(select).toContain("project_units!project_units_project_id_fkey(id,listing_id");
    expect(select).toContain("cooling_system),project_media!project_media_project_id_fkey(id,url,media_type,title,sort_order)");
    expect(listingsUrl.searchParams.get("project.project_units.order")).toBe("floor.asc.nullslast,unit_number.asc.nullslast");
    expect(listingsUrl.searchParams.get("project.project_media.order")).toBe("media_type.asc,sort_order.asc");
  });

  it("rejects invalid detail ids before calling Supabase", async () => {
    const res = await listingRequest(makeCtx("https://portal.maiprop.co/api/public/listing?id=not valid"));

    expect(res.status).toBe(400);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("keeps owner-backed listings loadable when the optional public profile lookup fails", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/listings") {
        return jsonRows([{ id: "listing-1", owner_id: "owner-1", title: "Athens flat" }]);
      }
      if (url.pathname === "/rest/v1/profiles_public") {
        return new Response("bad column", { status: 400 });
      }
      return jsonRows([]);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const res = await listingRequest(
      makeCtx("https://portal.maiprop.co/api/public/listing?id=11111111-1111-4111-8111-111111111111"),
    );
    const body = await res.json() as { data: { id: string; profiles: unknown } };

    expect(res.status).toBe(200);
    expect(body.data).toMatchObject({ id: "listing-1", profiles: null });
  });

  it("returns 503 for transient exact-detail upstream failures", async () => {
    fetchMock()
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }))
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }))
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }));

    const res = await listingRequest(
      makeCtx("https://portal.maiprop.co/api/public/listing?id=11111111-1111-4111-8111-111111111111"),
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
  });
});

describe("public similar listings endpoint", () => {
  it("fetches bounded related public rows and forwards safe filters", async () => {
    const res = await similarListingsRequest(
      makeCtx(
        "https://portal.maiprop.co/api/public/similar-listings?excludeId=11111111-1111-4111-8111-111111111111&city=Athens&propertyType=apartment&listingType=sale&price=320000&limit=1",
      ),
    );
    const body = await res.json() as { data: Array<{ id: string; profiles: unknown }> };

    expect(body.data).toHaveLength(1);
    expect(body.data[0].profiles).toMatchObject({ display_name: "Maria Agent" });

    const listingsUrl = fetchUrls("/rest/v1/listings")[0];
    expect(listingsUrl.searchParams.get("id")).toBe("neq.11111111-1111-4111-8111-111111111111");
    expect(listingsUrl.searchParams.get("city")).toBe("ilike.*Athens*");
    expect(listingsUrl.searchParams.get("property_type")).toBe("eq.apartment");
    expect(listingsUrl.searchParams.get("listing_type")).toBe("eq.sale");
    expect(listingsUrl.searchParams.get("limit")).toBe("48");
    expect(listingsUrl.searchParams.get("listing_images.limit")).toBe("3");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("responseLimit=1");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=similar-v1");
  });

  it("deduplicates cloned OS auction rows before slicing related deals", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/listings") {
        return jsonRows([
          {
            id: "auction-a",
            owner_id: "owner-1",
            listing_type: "auction",
            title: "Πλειστηριασμός Διαμέρισμα | Διόνυσου – €435.920",
            address: "Παιανίας 9",
            city: "Διονύσου",
            property_type: "apartment",
            price: 435920,
            sqm: 281.42,
            auction_date: "2026-06-17",
            tags: ["source:maiprop-os", "os_auction:auction-123"],
          },
          {
            id: "auction-b",
            owner_id: "owner-1",
            listing_type: "auction",
            title: "Πλειστηριασμός Διαμέρισμα | Διόνυσου – €435.920",
            address: "Παιανίας 9",
            city: "Διονύσου",
            property_type: "apartment",
            price: 435920,
            sqm: 281.42,
            auction_date: "2026-06-17",
            tags: ["source:maiprop-os", "os_auction:auction-123"],
          },
          {
            id: "auction-c",
            owner_id: "owner-2",
            listing_type: "auction",
            title: "Different auction",
            address: "Other 1",
            city: "Διονύσου",
            property_type: "apartment",
            price: 500000,
            sqm: 140,
            auction_date: "2026-06-20",
            tags: ["source:maiprop-os", "os_auction:auction-456"],
          },
        ]);
      }
      if (url.pathname === "/rest/v1/profiles_public") {
        return jsonRows([
          { user_id: "owner-1", display_name: "Maria Agent", avatar_url: null, role: "agent" },
          { user_id: "owner-2", display_name: "Nikos Owner", avatar_url: null, role: "seller" },
        ]);
      }
      return jsonRows([]);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const res = await similarListingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/similar-listings?city=Διονύσου&propertyType=apartment&listingType=auction&limit=6"),
    );
    const body = await res.json() as { data: Array<{ id: string }> };

    expect(body.data.map((row) => row.id)).toEqual(["auction-a", "auction-c"]);
  });

  it("returns an empty successful response when no similarity anchors are provided", async () => {
    const res = await similarListingsRequest(makeCtx("https://portal.maiprop.co/api/public/similar-listings"));

    expect(res.status).toBe(200);
    await expect(res.json()).resolves.toEqual({ data: [] });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("returns 503 for transient similar-listing upstream failures", async () => {
    fetchMock()
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }))
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }))
      .mockResolvedValueOnce(new Response("timeout", { status: 504 }));

    const res = await similarListingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/similar-listings?city=Athens"),
    );

    expect(res.status).toBe(503);
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
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

  it("filters open houses by sale or rental transaction subcategory", async () => {
    await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?transactionType=rent&limit=24"));

    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("limit")).toBe("24");
    expect(url.searchParams.get("listing_type")).toBe("eq.open_house");
    expect(url.searchParams.get("open_house_transaction_type")).toBe("eq.rent");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("transactionType=rent");
  });

  it("supports past open houses using a separate cache key", async () => {
    await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?showPast=true&limit=12"));

    const url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.get("open_house_date")).toMatch(/^lt\./);
    expect(url.searchParams.get("order")).toBe("open_house_date.desc");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("showPast=1");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=open-house-subcategory-v2");
  });

  it("returns 503 instead of caching an empty open-house window on transient upstream failure", async () => {
    fetchMock()
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    const res = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=12"));

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
    expect(cacheApi.put).not.toHaveBeenCalled();
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

    expect(fetchUrls("/rest/v1/listings")[0].searchParams.get("limit")).toBe("600");
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("keeps public auction reads local even when the cached DB window is municipality-clustered", async () => {
    fetchMock().mockResolvedValueOnce(jsonRows(
      Array.from({ length: 48 }, (_, i) => ({
        id: `cached-agrinio-${i}`,
        city: "Agrinio",
        is_featured: false,
        priority_placement: 0,
        auction_date: "2026-06-01",
      })),
    ));
    const rows = await fetchPublicAuctionRows(env, 60);
    expect(rows).toHaveLength(48);
    expect(rows.every((row) => row.city === "Agrinio")).toBe(true);

    expect(fetchUrls("/rest/v1/listings")[0].searchParams.get("limit")).toBe("600");
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("falls back to source auctions when the daily cached DB window is empty", async () => {
    fetchMock().mockResolvedValueOnce(jsonRows([]));

    const rows = await fetchPublicAuctionRows(env, 2);
    expect(rows).toHaveLength(2);

    const dbCalls = fetchUrls("/rest/v1/listings");
    expect(dbCalls).toHaveLength(2);
    expect(dbCalls[0].searchParams.get("tags")).toMatch(/^cs\.\{source:maiprop-os,auction_pool:\d{4}-\d{2}-\d{2}\}$/);
    expect(dbCalls[1].searchParams.get("tags")).toBe("cs.{source:maiprop-os}");
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("returns an empty list when both local DB auction windows are empty", async () => {
    fetchMock().mockResolvedValueOnce(jsonRows([])).mockResolvedValueOnce(jsonRows([]));
    await expect(fetchPublicAuctionRows(env, 1)).resolves.toEqual([]);

    fetchMock().mockClear();
    fetchMock().mockResolvedValueOnce(jsonRows([])).mockResolvedValueOnce(jsonRows([]));
    await expect(fetchPublicAuctionRows(env, 2)).resolves.toEqual([]);
  });

  it("queries cached DB auctions with bounded image payloads", async () => {
    await expect(fetchPublicAuctionRows(env, 1)).resolves.toMatchObject([{ id: "db-2" }]);

    const dbUrl = fetchUrls("/rest/v1/listings")[0];
    expect(dbUrl.searchParams.get("listing_type")).toBe("eq.auction");
    expect(dbUrl.searchParams.get("is_off_market")).toBe("eq.false");
    expect(dbUrl.searchParams.get("tags")).toMatch(/^cs\.\{source:maiprop-os,auction_pool:\d{4}-\d{2}-\d{2}\}$/);
    expect(dbUrl.searchParams.get("listing_images.limit")).toBe("3");
    expect(dbUrl.searchParams.get("limit")).toBe("1");
  });

  it("clamps public auction requests and caches by day", async () => {
    const res = await auctionsRequest(makeCtx("https://portal.maiprop.co/api/public/auctions?limit=999"));
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(2);

    const dbUrl = fetchUrls("/rest/v1/listings")[0];
    expect(dbUrl.searchParams.get("limit")).toBe("600");
    const cacheKey = new URL(cacheApi.put.mock.calls[0][0].url);
    expect(cacheKey.searchParams.get("limit")).toBe("600");
    expect(cacheKey.searchParams.has("day")).toBe(true);
    expect(cacheKey.searchParams.get("v")).toBe("national-sample-v6");
  });

  it("returns 503 instead of falling back to empty auctions on transient upstream failure", async () => {
    fetchMock()
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }))
      .mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    const res = await auctionsRequest(makeCtx("https://portal.maiprop.co/api/public/auctions?limit=12"));

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
    expect(cacheApi.put).not.toHaveBeenCalled();
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
    expect(dbUrl.searchParams.get("limit")).toBe("600");
  });

  it("fetches lightweight featured and open-house homepage sections", async () => {
    const featured = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=featured"));
    const featuredRows = await featured.json() as Array<{ id: string }>;
    expect(featuredRows.map((row) => row.id)).toEqual(["listing-1", "listing-2", "listing-3", "listing-4"]);
    let url = fetchUrls("/rest/v1/listings")[0];
    expect(url.searchParams.get("limit")).toBe("12");
    expect(url.searchParams.get("listing_type")).toBe("in.(sale,new_build)");
    expect(url.searchParams.get("is_off_market")).toBe("eq.false");
    expect(url.searchParams.get("select")).toContain("project_id");
    expect(url.searchParams.get("select")).toContain("project:projects!listings_project_id_fkey");
    expect(url.searchParams.get("select")).toContain("delivery_date");
    expect(url.searchParams.get("select")).toContain("project_units!project_units_project_id_fkey(id,availability_status,internal_sqm)");
    expect(url.searchParams.get("listing_images.limit")).toBe("3");
    const featuredCacheKey = new URL(cacheApi.put.mock.calls[0][0].url);
    expect(featuredCacheKey.searchParams.get("day")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(featuredCacheKey.searchParams.get("v")).toBe("featured-card-v5");
    expect(featured.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=300");
    expect(featured.headers.get("CDN-Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=300");

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
    expect(fetchMock().mock.calls.every(([, init]) => (init?.headers as Record<string, string>)?.Prefer === "count=estimated")).toBe(true);

    fetchMock().mockClear();
    await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=auction-count"));
    expect((initFor("/rest/v1/listings").headers as Record<string, string>).Prefer).toBe("count=estimated");

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

  it("returns 503 instead of caching zero homepage counts on transient upstream failure", async () => {
    fetchMock()
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }))
      .mockResolvedValueOnce(new Response(null, { status: 504 }));

    const res = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=type-counts"));

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
    expect(cacheApi.put).not.toHaveBeenCalled();
  });
});
