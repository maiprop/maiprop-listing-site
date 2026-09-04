import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  onRequest as auctionsRequest,
  fetchPublicAuctionRows,
  projectAuctionPublicIdentity,
} from "./auctions";
import { onRequest as homepageRequest } from "./homepage";
import { onRequest as listingRequest } from "./listing";
import { onRequest as listingsRequest } from "./listings";
import { onRequest as openHousesRequest } from "./open-houses";
import { onRequest as similarListingsRequest } from "./similar-listings";
import {
  cachedJson,
  getPublicCataloguePublication,
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
  type PublicCatalogueQueryRpcRow,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";

type FetchMock = ReturnType<typeof vi.fn>;
type CacheApi = {
  match: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
};
type AuctionRowForTest = {
  id: string;
  listing_id?: string;
};

const realFetch = globalThis.fetch;
const realCachesDescriptor = Object.getOwnPropertyDescriptor(globalThis, "caches");
const PROJECT_ID = "abcdefghijklmnopqrst";
const PUBLICATION_ID = 42;
const env: PublicApiEnv = {
  SUPABASE_PROJECT_ID: PROJECT_ID,
  SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
  SUPABASE_SERVICE_ROLE_KEY: "service_role_test_key",
};

let cacheStore: Map<string, Response>;
let cacheApi: CacheApi;

function installCache(): CacheApi {
  cacheStore = new Map();
  cacheApi = {
    match: vi.fn(async (request: Request) => cacheStore.get(request.url)?.clone()),
    put: vi.fn(async (request: Request, response: Response) => {
      const cacheControl = response.headers.get("Cache-Control") ?? "";
      const cdnCacheControl = response.headers.get("CDN-Cache-Control") ?? "";
      if (/\bno-store\b/i.test(cacheControl) || /\bno-store\b/i.test(cdnCacheControl)) {
        throw new Error("Cloudflare Cache API rejected an uncacheable response");
      }
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
  headers?: HeadersInit;
  requestEnv?: PublicApiEnv;
  waitUntil?: (promise: Promise<unknown>) => void;
} = {}): PublicApiCtx {
  return {
    request: new Request(url, {
      method: options.method ?? "GET",
      headers: options.headers,
    }),
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

function jsonBodyFor(pathname: string): unknown {
  const body = initFor(pathname)?.body;
  return body ? JSON.parse(String(body)) : null;
}

function jsonBodiesFor(pathname: string): Array<Record<string, unknown>> {
  return fetchMock().mock.calls
    .filter(([input]) => new URL(String(input)).pathname === pathname)
    .map(([, init]) => requestJson(init));
}

function jsonRows(rows: unknown[], init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(rows), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers as Record<string, string> | undefined) },
  });
}

function auctionEnvelopeRows(
  rows: Array<Record<string, unknown>>,
  metadata: {
    poolExists?: boolean;
    totalRaw?: number;
    facetCities?: string[];
    facetRounds?: number[];
  } = {},
): Response {
  const facetCities = metadata.facetCities ?? [...new Set(
    rows
      .map((row) => typeof row.city === "string" ? row.city.trim() : "")
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
  const facetRounds = metadata.facetRounds ?? [...new Set(
    rows.flatMap((row) => {
      if (!Array.isArray(row.tags)) return [];
      const raw = row.tags.find(
        (tag): tag is string => typeof tag === "string" && tag.startsWith("round:"),
      );
      const parsed = Number(raw?.slice("round:".length));
      return Number.isSafeInteger(parsed) && parsed >= 1 ? [parsed] : [];
    }),
  )].sort((a, b) => a - b);
  return jsonRows([{
    pool_exists: metadata.poolExists ?? rows.length > 0,
    total_raw: metadata.totalRaw ?? rows.length,
    facet_cities: facetCities,
    facet_rounds: facetRounds,
    visible_rows: rows,
  }]);
}

function delayedJsonBody(
  payload: unknown,
  delayMs: number,
  signal: AbortSignal | null | undefined,
): Response {
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let abortBody: (() => void) | undefined;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      abortBody = () => {
        if (timer) clearTimeout(timer);
        controller.error(signal?.reason ?? new DOMException("Aborted", "AbortError"));
      };
      if (signal?.aborted) {
        abortBody();
        return;
      }
      signal?.addEventListener("abort", abortBody, { once: true });
      timer = setTimeout(() => {
        signal?.removeEventListener("abort", abortBody!);
        controller.enqueue(bytes);
        controller.close();
      }, delayMs);
    },
    cancel() {
      if (timer) clearTimeout(timer);
      if (abortBody) signal?.removeEventListener("abort", abortBody);
    },
  });
  return new Response(body, { headers: { "Content-Type": "application/json" } });
}

function publicationTimestamp(): string {
  const timestamp = new Date();
  timestamp.setUTCSeconds(0, 0);
  return timestamp.toISOString();
}

function cataloguePublicationMetadata(
  publicationId = PUBLICATION_ID,
  snapshotMinute = publicationTimestamp(),
) {
  return {
    publication_id: publicationId,
    snapshot_minute: snapshotMinute,
    published_at: snapshotMinute,
    retain_until: new Date(Date.parse(snapshotMinute) + 40 * 60_000).toISOString(),
    row_count: 8,
  };
}

function cataloguePublicationRows(
  publicationId = PUBLICATION_ID,
  snapshotMinute = publicationTimestamp(),
): Response {
  return jsonRows([cataloguePublicationMetadata(publicationId, snapshotMinute)]);
}

function deterministicUuid(namespace: number, index: number): string {
  return `00000000-0000-4000-8000-${String(namespace * 10_000 + index).padStart(12, "0")}`;
}

function requestJson(init?: RequestInit): Record<string, unknown> {
  return init?.body
    ? JSON.parse(String(init.body)) as Record<string, unknown>
    : {};
}

function defaultCatalogueRows(): Array<Record<string, unknown>> {
  const now = Date.now();
  return [
    { id: deterministicUuid(10, 1), owner_id: "owner-1", title: "supervisor-177912 maisonette", address: "supervisor-177912 Test Street", city: "Athens", listing_type: "sale" },
    { id: deterministicUuid(10, 2), owner_id: "owner-1", title: "E2E-FULL-PUBLISH-20260526T161856Z maisonette", tags: ["qa-full-publish"], city: "Athens", listing_type: "sale" },
    { id: deterministicUuid(10, 3), owner_id: "owner-1", title: "Athens flat", city: "Athens", listing_type: "sale", priority_placement: 1, priority_until: "2099-01-01T00:00:00.000Z", price: 210000 },
    { id: deterministicUuid(10, 4), owner_id: "owner-2", title: "Piraeus loft", city: "Piraeus", listing_type: "sale", priority_placement: 1, priority_until: "2099-01-01T00:00:00.000Z", price: 230000 },
    { id: deterministicUuid(10, 5), owner_id: "owner-2", title: "Glyfada villa", city: "Glyfada", listing_type: "sale", price: 450000 },
    { id: deterministicUuid(10, 6), owner_id: "owner-2", title: "Mykonos villa", city: "Mykonos", listing_type: "sale", price: 650000 },
    { id: deterministicUuid(10, 7), owner_id: "owner-2", title: "Santorini hotel", city: "Santorini", listing_type: "sale", property_type: "hotel", price: 850000 },
    { id: deterministicUuid(10, 8), owner_id: "owner-2", title: "Thessaloniki apartment", city: "Thessaloniki", listing_type: "new_build", price: 280000, project: { name: "Marina Heights", delivery_date: "2026-10-01" } },
  ].map((row, index) => ({
    status: "active",
    property_type: "apartment",
    created_at: new Date(now - index * 60_000).toISOString(),
    price: 200000 + index * 10000,
    sqm: 80 + index,
    bedrooms: 2,
    bathrooms: 1,
    ai_score: 90 - index,
    views_count: 100 - index,
    listing_images: [{ url: `https://img.example/${index}.jpg`, sort_order: 0 }],
    ...row,
  }));
}

function defaultOpenHouseRows(): Array<Record<string, unknown>> {
  const openHouseDate = "2026-08-01T10:00:00.000Z";
  return [
    { id: deterministicUuid(20, 3), title: "Athens Open House", city: "Athens", open_house_date: openHouseDate, cover_image_url: null, listing_images: [{ url: "img", sort_order: 1 }] },
    { id: deterministicUuid(20, 4), title: "Piraeus Open House", city: "Piraeus", open_house_date: openHouseDate, cover_image_url: "cover", listing_images: [] },
    { id: deterministicUuid(20, 5), title: "Athens Penthouse Open House", city: "Athens", open_house_date: openHouseDate, cover_image_url: "penthouse", listing_images: [] },
    { id: deterministicUuid(20, 6), title: "Glyfada Open House", city: "Glyfada", open_house_date: openHouseDate, cover_image_url: "glyfada", listing_images: [] },
  ].map((row, index) => ({
    status: "active",
    listing_type: "open_house",
    property_type: "apartment",
    open_house_transaction_type: index === 3 ? "rent" : "sale",
    price: 250000 + index * 10000,
    sqm: 90,
    bedrooms: 2,
    energy_class: "A",
    ...row,
  }));
}

function catalogueRpcRows(init?: RequestInit): Response {
  const body = requestJson(init);
  const listingTypes = typeof body.p_listing_type === "string"
    ? body.p_listing_type.split(",")
    : [];
  let rows = listingTypes.includes("open_house")
    ? defaultOpenHouseRows()
    : defaultCatalogueRows();
  if (listingTypes.length > 0) {
    rows = rows.filter((row) => listingTypes.includes(String(row.listing_type)));
  }
  if (typeof body.p_property_type === "string") {
    rows = rows.filter((row) => row.property_type === body.p_property_type);
  }
  if (typeof body.p_location === "string" && body.p_location) {
    const location = body.p_location.toLowerCase();
    rows = rows.filter((row) =>
      `${row.title ?? ""} ${row.address ?? ""} ${row.city ?? ""}`
        .toLowerCase()
        .includes(location)
    );
  }
  if (Array.isArray(body.p_location_groups)) {
    rows = rows.filter((row) => {
      const haystack = `${row.title ?? ""} ${row.address ?? ""} ${row.city ?? ""}`
        .toLowerCase();
      return (body.p_location_groups as unknown[]).every((group) =>
        Array.isArray(group) &&
        group.some((token) =>
          typeof token === "string" && haystack.includes(token.toLowerCase())
        )
      );
    });
  }
  if (typeof body.p_transaction_type === "string") {
    rows = rows.filter((row) =>
      row.open_house_transaction_type === body.p_transaction_type
    );
  }
  if (body.p_priority_mode === "priority") {
    rows = rows.filter((row) => Number(row.priority_placement ?? 0) > 0);
  } else if (body.p_priority_mode === "organic") {
    rows = rows.filter((row) => Number(row.priority_placement ?? 0) <= 0);
  }
  if (typeof body.p_cursor_listing_id === "string") {
    const anchorIndex = rows.findIndex((row) => row.id === body.p_cursor_listing_id);
    rows = anchorIndex >= 0 ? rows.slice(anchorIndex + 1) : [];
  }
  const offset = Number(body.p_offset ?? 0);
  const limit = Number(body.p_limit ?? rows.length);
  rows = rows.slice(offset, offset + limit);
  const publishedAt = publicationTimestamp();
  return jsonRows(rows.map((row) => ({
    publication_id: PUBLICATION_ID,
    published_at: publishedAt,
    listing_id: row.id,
    priority_rank: Number(row.priority_placement ?? 0) > 0 ? 1 : 0,
    created_at: row.created_at ?? publishedAt,
    price: row.price ?? null,
    ai_score: row.ai_score ?? null,
    views_count: row.views_count ?? 0,
    open_house_date: row.open_house_date ?? null,
    card_payload: row,
  })));
}

function catalogueCardRows(
  rows: Array<Record<string, unknown>>,
  init?: RequestInit,
): Response {
  const body = requestJson(init);
  const stream = body.p_priority_mode;
  const publishedAt = publicationTimestamp();
  return jsonRows(rows.map((row) => ({
    publication_id: PUBLICATION_ID,
    published_at: publishedAt,
    listing_id: row.id,
    priority_rank: stream === "priority" ? 1 : 0,
    created_at: row.created_at ?? publishedAt,
    price: row.price ?? null,
    ai_score: row.ai_score ?? null,
    views_count: row.views_count ?? 0,
    open_house_date: row.open_house_date ?? null,
    card_payload: row,
  })));
}

function catalogueDetailRows(
  detailPayload: Record<string, unknown>,
  init?: RequestInit,
): Response {
  const body = requestJson(init);
  const requestedId = typeof body.p_listing_id === "string" ? body.p_listing_id : null;
  const requestedOsTag = typeof body.p_os_tag === "string" ? body.p_os_tag : null;
  const payload = requestedId
    ? { ...detailPayload, id: requestedId }
    : requestedOsTag
      ? {
          ...detailPayload,
          listing_type: "auction",
          tags: [
            ...(
              Array.isArray(detailPayload.tags)
                ? detailPayload.tags.filter((tag): tag is string => typeof tag === "string")
                : []
            ),
            `os_auction:${requestedOsTag}`,
          ],
        }
      : detailPayload;
  return jsonRows([{
    publication_id: Number(body.p_publication_id ?? PUBLICATION_ID),
    published_at: publicationTimestamp(),
    detail_payload: payload,
  }]);
}

function isCataloguePublication(url: URL): boolean {
  return url.pathname === "/rest/v1/rpc/get_public_catalogue_publication";
}

function isCatalogueQuery(url: URL): boolean {
  return url.pathname === "/rest/v1/rpc/query_public_catalogue";
}

function isCatalogueDetail(url: URL): boolean {
  return url.pathname === "/rest/v1/rpc/get_public_catalogue_listing";
}

function isCatalogueAuctionExact(url: URL): boolean {
  return url.pathname === "/rest/v1/rpc/get_public_catalogue_auctions";
}

function homepageCatalogueRows(): Response {
  const featured = defaultCatalogueRows().filter((row) =>
    Number(row.priority_placement ?? 0) > 0
  );
  const publication = cataloguePublicationMetadata();
  const payload = {
    publication_id: PUBLICATION_ID,
    featured,
    open_houses: defaultOpenHouseRows(),
    property_type_counts: { apartment: 7, land: 3 },
    popular_locations: [
      { city: "Athens", listing_count: 7 },
      { city: "Thessaloniki", listing_count: 3 },
    ],
    price_index: [
      { city: "Athens", avg_price_per_sqm: 2200, listing_count: 4 },
      { city: "Thessaloniki", avg_price_per_sqm: 1600, listing_count: 1 },
    ],
    auction_count: 3,
  };
  return jsonRows([{
    publication_id: PUBLICATION_ID,
    published_at: publication.published_at,
    retain_until: publication.retain_until,
    payload,
  }]);
}

function encodeCursorPayload(payload: Record<string, unknown>): string {
  const base64 = btoa(JSON.stringify(payload))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return `v3.${base64}`;
}

function decodeCursorPayload(cursor: string): Record<string, unknown> {
  const encoded = cursor.slice(3).replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (encoded.length % 4)) % 4);
  return JSON.parse(atob(`${encoded}${padding}`)) as Record<string, unknown>;
}

function installSupabaseFetch(): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));

    if (url.pathname === "/rest/v1/rpc/get_public_catalogue_publication") {
      return cataloguePublicationRows();
    }

    if (url.pathname === "/rest/v1/rpc/query_public_catalogue") {
      return catalogueRpcRows(init);
    }

    if (url.pathname === "/rest/v1/rpc/get_public_catalogue_listing") {
      return catalogueDetailRows({
        id: "listing-1",
        owner_id: "owner-1",
        title: "Athens flat",
        city: "Athens",
        status: "active",
        listing_type: "sale",
        property_type: "apartment",
        price: 220000,
        sqm: 85,
        listing_images: [],
      }, init);
    }

    if (url.pathname === "/rest/v1/rpc/get_public_catalogue_auctions") {
      return jsonRows([]);
    }

    if (url.pathname === "/rest/v1/rpc/get_public_catalogue_homepage") {
      return homepageCatalogueRows();
    }

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

    if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") {
      return jsonRows([
        { user_id: "owner-1", display_name: "Maria Agent", avatar_url: "https://img.example/maria.png", owner_participant_type: "agent" },
        { user_id: "owner-2", display_name: "Nikos Owner", avatar_url: null, owner_participant_type: "seller" },
      ]);
    }

    if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
      if (url.searchParams.get("p_stream") === "priority") {
        return auctionEnvelopeRows([{
          id: "db-2",
          is_featured: false,
          priority_placement: 1,
          priority_until: "2099-01-01T00:00:00.000Z",
          auction_date: "2026-06-03",
        }]);
      }
      return auctionEnvelopeRows([{
        id: "db-1",
        is_featured: true,
        featured_until: "2099-01-01T00:00:00.000Z",
        priority_placement: 0,
        priority_until: null,
        auction_date: "2026-06-01",
      }]);
    }

    if (
      url.pathname === "/rest/v1/rpc/get_public_listing_catalogue" ||
      url.pathname === "/rest/v1/public_listing_catalogue"
    ) {
      const listingType = url.searchParams.get("listing_type");
      const select = url.searchParams.get("select") ?? "";

      if (listingType === "eq.auction") {
        if (url.searchParams.get("priority_placement") === "gt.0") {
          return jsonRows([{
            id: "db-2",
            is_featured: false,
            priority_placement: 1,
            priority_until: "2099-01-01T00:00:00.000Z",
            auction_date: "2026-06-03",
          }]);
        }
        return jsonRows([{
          id: "db-1",
          is_featured: true,
          featured_until: "2099-01-01T00:00:00.000Z",
          priority_placement: 0,
          priority_until: null,
          auction_date: "2026-06-01",
        }]);
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
        const openHouseDate = "2026-08-01T10:00:00.000Z";
        const openHouseRows = [
          { id: deterministicUuid(20, 1), title: "supervisor-177912 open house", open_house_date: openHouseDate, cover_image_url: "test", listing_images: [] },
          { id: deterministicUuid(20, 2), title: "E2E-FULL-PUBLISH-20260526T161856Z open house", open_house_date: openHouseDate, tags: ["qa-full-publish"], cover_image_url: "test", listing_images: [] },
          { id: deterministicUuid(20, 3), open_house_date: openHouseDate, cover_image_url: null, listing_images: [{ url: "img", sort_order: 1 }] },
          { id: deterministicUuid(20, 4), open_house_date: openHouseDate, cover_image_url: "cover", listing_images: [] },
        ];
        const cursorClause = url.searchParams.getAll("or").find((value) => value.includes("id.gt."));
        const anchor = cursorClause?.match(/id\.gt\.([A-Za-z0-9_-]+)/)?.[1];
        const start = anchor ? openHouseRows.findIndex((row) => row.id === anchor) + 1 : 0;
        const limit = Number(url.searchParams.get("limit") ?? openHouseRows.length);
        return jsonRows(openHouseRows.slice(start, start + limit));
      }

      if (listingType === "eq.new_build") {
        return jsonRows([
          {
            id: "new-build-1",
            owner_id: "owner-1",
            title: "Canonical Project Listing",
            listing_type: "new_build",
            is_pre_sale: false,
            project: { name: "Marina Heights", delivery_date: "2026-10-01", project_units: [] },
          },
        ]);
      }

      if (
        (listingType === "eq.sale" || listingType === "in.(sale,new_build)") &&
        select.includes("listing_images")
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

function installCatalogueQueryRows(
  rows: Array<Record<string, unknown>>,
  profiles: Array<Record<string, unknown>> = [],
): FetchMock {
  const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (isCataloguePublication(url)) return cataloguePublicationRows();
    if (isCatalogueQuery(url)) return catalogueCardRows(rows, init);
    if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") {
      return jsonRows(profiles);
    }
    return jsonRows([]);
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
  it("keeps nullable catalogue RPC fields explicit at the worker boundary", () => {
    const row: PublicCatalogueQueryRpcRow = {
      publication_id: PUBLICATION_ID,
      published_at: publicationTimestamp(),
      listing_id: deterministicUuid(99, 1),
      priority_rank: 0,
      created_at: publicationTimestamp(),
      price: 250000,
      ai_score: null,
      views_count: 0,
      open_house_date: null,
      card_payload: { id: deterministicUuid(99, 1) },
    };

    expect(row.ai_score).toBeNull();
    expect(row.open_house_date).toBeNull();
  });

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

  it("caps browser and Worker cache lifetimes at business validity and does not cache expired responses", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-07-29T12:00:00.000Z"));
      const validUntil = "2026-07-29T12:00:45.000Z";
      const backgroundTasks: Promise<unknown>[] = [];
      const url = new URL("https://portal.maiprop.co/api/public/listings?deadline-test=1");
      const response = await cachedJson(
        makeCtx(url.toString(), {
          waitUntil: (promise) => backgroundTasks.push(promise),
        }),
        url,
        async () => jsonResponse(
          { version: 1 },
          { headers: { "X-Maiprop-Cache-Valid-Until": validUntil } },
        ),
        {
          browserTtlSeconds: 60,
          edgeTtlSeconds: 120,
          staleSeconds: 60,
          staleFallbackSeconds: 600,
        },
      );
      await Promise.all(backgroundTasks);

      expect(response.headers.get("Cache-Control"))
        .toBe("public, max-age=45, stale-while-revalidate=0");
      expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
      expect(cacheStore).toHaveLength(2);
      for (const cachedResponse of cacheStore.values()) {
        expect(cachedResponse.headers.get("Cache-Control")).toBe("public, max-age=45");
      }

      vi.setSystemTime(new Date("2026-07-29T12:00:46.000Z"));
      const expiredUrl = new URL("https://portal.maiprop.co/api/public/listings?deadline-test=expired");
      const writesBeforeExpiredResponse = cacheApi.put.mock.calls.length;
      const expired = await cachedJson(
        makeCtx(expiredUrl.toString()),
        expiredUrl,
        async () => jsonResponse(
          { version: 2 },
          { headers: { "X-Maiprop-Cache-Valid-Until": validUntil } },
        ),
        {
          browserTtlSeconds: 60,
          edgeTtlSeconds: 120,
          staleSeconds: 60,
          staleFallbackSeconds: 600,
        },
      );

      expect(expired.headers.get("Cache-Control")).toBe("no-store");
      expect(expired.headers.get("CDN-Cache-Control")).toBe("no-store");
      expect(cacheApi.put).toHaveBeenCalledTimes(writesBeforeExpiredResponse);
    } finally {
      vi.useRealTimers();
    }
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
    await expect(supabaseJson(env, "/rest/v1/rpc/get_public_listing_catalogue", params)).resolves.toHaveLength(2);

    const count = await supabaseCount(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["city", "eq.Athens"]]));
    expect(count).toBe(7);

    const init = initFor("/rest/v1/rpc/get_public_listing_catalogue");
    expect(init.headers).toMatchObject({
      apikey: "publishable_test_key",
      Authorization: "Bearer publishable_test_key",
      Accept: "application/json",
    });
    expect((init as RequestInit & { cf?: unknown }).cf).toEqual({ cacheTtl: 120, cacheEverything: true });
  });

  it("resolves immutable catalogue publications with the public credential", async () => {
    await expect(
      getPublicCataloguePublication(env, PUBLICATION_ID),
    ).resolves.toMatchObject({ publicationId: PUBLICATION_ID });

    const init = initFor("/rest/v1/rpc/get_public_catalogue_publication");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({
      apikey: "publishable_test_key",
      Authorization: "Bearer publishable_test_key",
      "Content-Type": "application/json",
    });
    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_publication"))
      .toEqual({ p_publication_id: PUBLICATION_ID });
  });

  it("lets the database select the current publication for a cold first page", async () => {
    await expect(
      getPublicCataloguePublication(env, null),
    ).resolves.toMatchObject({ publicationId: PUBLICATION_ID });

    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_publication"))
      .toEqual({ p_publication_id: null });
  });

  it("supports estimated Supabase counts for high-traffic approximate counters", async () => {
    await expect(
      supabaseCount(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "id"]]), {
        countStrategy: "estimated",
      }),
    ).resolves.toBe(3);

    const init = initFor("/rest/v1/rpc/get_public_listing_catalogue");
    expect(init.headers).toMatchObject({
      Prefer: "count=estimated",
    });
  });

  it("degrades transient Supabase public-read failures without hiding schema or auth errors", async () => {
    fetchMock().mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));
    await expect(supabaseJson(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "id"]]))).resolves.toEqual([]);

    fetchMock().mockResolvedValueOnce(new Response(null, { status: 504 }));
    await expect(supabaseCount(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "id"]]))).resolves.toBe(0);

    fetchMock().mockResolvedValueOnce(new Response("bad column", { status: 400 }));
    await expect(supabaseJson(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "missing_column"]]))).rejects.toThrow(
      "Supabase request failed with 400",
    );

    fetchMock().mockResolvedValueOnce(new Response("forbidden", { status: 403 }));
    await expect(supabaseCount(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "id"]]))).rejects.toThrow(
      "Supabase count failed with 403",
    );
  });

  it("uses abortable Supabase fetches and treats aborts as transient public-read failures", async () => {
    fetchMock().mockRejectedValueOnce(new DOMException("Timeout", "AbortError"));
    await expect(supabaseJson(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "id"]]))).resolves.toEqual([]);

    fetchMock().mockRejectedValueOnce(new DOMException("Timeout", "AbortError"));
    await expect(supabaseCount(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "id"]]))).resolves.toBe(0);

    const jsonInit = fetchMock().mock.calls[0][1] as RequestInit;
    const countInit = fetchMock().mock.calls[1][1] as RequestInit;
    expect(jsonInit.signal).toBeInstanceOf(AbortSignal);
    expect(countInit.signal).toBeInstanceOf(AbortSignal);
  });

  it("retries transient Supabase reads before failing a cold public cache miss", async () => {
    fetchMock().mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    await expect(
      supabaseJson(env, "/rest/v1/rpc/get_public_listing_catalogue", new URLSearchParams([["select", "id"]]), {
        failOnTransient: true,
        retryDelayMs: 0,
      }),
    ).resolves.toEqual([
      { id: "listing-1", owner_id: "owner-1", title: "Athens flat" },
      { id: "listing-2", owner_id: "owner-2", title: "Piraeus loft" },
    ]);
    expect(fetchUrls("/rest/v1/rpc/get_public_listing_catalogue")).toHaveLength(2);
  });

  it("recovers public open-house cold cache misses after one transient upstream failure", async () => {
    fetchMock().mockResolvedValueOnce(new Response("cloudflare timeout", { status: 522 }));

    const res = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));

    expect(res.status).toBe(200);
    expect(res.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);
    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_publication")).toHaveLength(2);
    await expect(res.json()).resolves.toEqual(expect.arrayContaining([
      expect.objectContaining({ id: deterministicUuid(20, 3), cover_image_url: null, listing_images: [{ url: "img", sort_order: 1 }] }),
      expect.objectContaining({ id: deterministicUuid(20, 4), cover_image_url: "cover", listing_images: [] }),
    ]));
  });

  it("returns cached edge responses without making another upstream request", async () => {
    const ctx = makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2");

    const first = await openHousesRequest(ctx);
    expect(first.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(first.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(first.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=600");
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);

    const second = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));
    expect(second.headers.get("X-Maiprop-Cache")).toBe("HIT");
    expect(second.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(second.headers.get("X-Frame-Options")).toBe("DENY");
    expect(second.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(await second.json()).toEqual(await first.clone().json());
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);
    expect(cacheApi.put).toHaveBeenCalledTimes(2);
    expect(cacheApi.put.mock.calls.some(([request]) => request.url.includes("__maiprop_stale=1"))).toBe(true);
  });

  it("returns a bounded open-house failure before the homepage client deadline", async () => {
    vi.useFakeTimers();
    try {
      cacheApi.match.mockImplementation(() => new Promise((resolve) => {
        setTimeout(() => resolve(undefined), 100);
      }));
      fetchMock().mockImplementation(() => new Promise<Response>(() => undefined));
      let settled = false;
      const pending = Promise.resolve(openHousesRequest(
        makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=6&deadline-test=1"),
      )).then((response) => {
        settled = true;
        return response;
      });

      await vi.advanceTimersByTimeAsync(2_000);
      const settledBeforeClientDeadline = settled;
      if (!settled) await vi.advanceTimersByTimeAsync(1_000);

      const response = await pending;
      expect(settledBeforeClientDeadline).toBe(true);
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("no-store");
      await vi.advanceTimersByTimeAsync(10_000);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns successful public API misses before fresh and stale cache entries are committed", async () => {
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

    expect(returnedBeforeCacheCommit).toBe(true);
    const response = await pending;
    expect(response.status).toBe(200);
    expect(cacheApi.put).toHaveBeenCalledTimes(2);
    expect([...cacheStore.keys()].some((key) => key.includes("__maiprop_stale=1"))).toBe(false);

    const coalesced = await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=2"));
    expect(coalesced.headers.get("X-Maiprop-Cache")).toBe("COALESCED");
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);

    releasePut();
    await Promise.resolve();
    expect([...cacheStore.keys()].some((key) => key.includes("__maiprop_stale=1"))).toBe(true);
  });

  it("coalesces concurrent cache misses for the same public API key", async () => {
    let releaseFetch!: () => void;
    const gate = new Promise<void>((resolve) => {
      releaseFetch = resolve;
    });
    fetchMock().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (isCatalogueQuery(url)) {
        await gate;
        return catalogueCardRows(
          [{ id: deterministicUuid(20, 3), cover_image_url: "cover", listing_images: [] }],
          init,
        );
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
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);
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

  it("seeds the edge cache when a late producer succeeds", async () => {
    const url = new URL("https://portal.maiprop.co/api/public/open-houses?late-producer=success");
    const backgroundTasks: Promise<unknown>[] = [];
    let resolveProducer!: (response: Response) => void;
    const producerGate = new Promise<Response>((resolve) => {
      resolveProducer = resolve;
    });

    const timedOut = await cachedJson(
      makeCtx(url.toString(), { waitUntil: (promise) => backgroundTasks.push(promise) }),
      url,
      () => producerGate,
      { producerTimeoutMs: 5 },
    );

    expect(timedOut.status).toBe(503);
    expect(cacheStore).toHaveLength(0);

    resolveProducer(jsonResponse({ source: "late producer" }));
    await Promise.all(backgroundTasks);

    expect(cacheStore.has(url.toString())).toBe(true);
    expect(cacheStore.has(`${url.toString()}&__maiprop_stale=1`)).toBe(true);

    const secondProducer = vi.fn(async () => jsonResponse({ source: "second producer" }));
    const cached = await cachedJson(makeCtx(url.toString()), url, secondProducer);

    expect(cached.headers.get("X-Maiprop-Cache")).toBe("HIT");
    await expect(cached.json()).resolves.toEqual({ source: "late producer" });
    expect(secondProducer).not.toHaveBeenCalled();
  });

  it("keeps a stale refresh alive until its cache seed settles", async () => {
    const url = new URL("https://portal.maiprop.co/api/public/open-houses?stale-refresh-seed=1");
    const cacheOptions = { staleFallbackSeconds: 600 };
    const initialTasks: Promise<unknown>[] = [];
    await cachedJson(
      makeCtx(url.toString(), { waitUntil: (promise) => initialTasks.push(promise) }),
      url,
      async () => jsonResponse({ version: 1 }),
      cacheOptions,
    );
    await Promise.all(initialTasks);
    cacheStore.delete(url.toString());

    let releaseProducer!: (response: Response) => void;
    const producerGate = new Promise<Response>((resolve) => {
      releaseProducer = resolve;
    });
    let releasePut!: () => void;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    cacheApi.put.mockImplementation(async (request: Request, response: Response) => {
      await putGate;
      cacheStore.set(request.url, response.clone());
    });
    const refreshTasks: Promise<unknown>[] = [];

    const stale = await cachedJson(
      makeCtx(url.toString(), { waitUntil: (promise) => refreshTasks.push(promise) }),
      url,
      () => producerGate,
      cacheOptions,
    );
    expect(stale.headers.get("X-Maiprop-Cache")).toBe("STALE");

    releaseProducer(jsonResponse({ version: 2 }));
    const refreshSettledBeforeSeed = await Promise.race([
      Promise.all(refreshTasks).then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 20)),
    ]);

    expect(refreshSettledBeforeSeed).toBe(false);
    releasePut();
    await Promise.all(refreshTasks);
    await expect(cacheStore.get(url.toString())?.json()).resolves.toEqual({ version: 2 });
  });

  it("keeps a stale refresh coalesced until the creator's late seed settles", async () => {
    const url = new URL("https://portal.maiprop.co/api/public/open-houses?stale-refresh-joiner=1");
    const cacheOptions = { producerTimeoutMs: 5, staleFallbackSeconds: 600 };
    const initialTasks: Promise<unknown>[] = [];
    await cachedJson(
      makeCtx(url.toString(), { waitUntil: (promise) => initialTasks.push(promise) }),
      url,
      async () => jsonResponse({ version: 1 }),
      cacheOptions,
    );
    await Promise.all(initialTasks);
    cacheStore.delete(url.toString());

    let resolveCreator!: (response: Response) => void;
    const creatorGate = new Promise<Response>((resolve) => {
      resolveCreator = resolve;
    });
    let releasePut!: () => void;
    const putGate = new Promise<void>((resolve) => {
      releasePut = resolve;
    });
    let markPutStarted!: () => void;
    const putStarted = new Promise<void>((resolve) => {
      markPutStarted = resolve;
    });
    cacheApi.put.mockImplementation(async (request: Request, response: Response) => {
      markPutStarted();
      await putGate;
      cacheStore.set(request.url, response.clone());
    });
    const creatorTasks: Promise<unknown>[] = [];

    const creator = await cachedJson(
      makeCtx(url.toString(), { waitUntil: (promise) => creatorTasks.push(promise) }),
      url,
      () => creatorGate,
      cacheOptions,
    );
    expect(creator.headers.get("X-Maiprop-Cache")).toBe("STALE");

    const joiner = await cachedJson(makeCtx(url.toString()), url, async () => jsonResponse({ version: 3 }), cacheOptions);
    expect(joiner.headers.get("X-Maiprop-Cache")).toBe("STALE");

    resolveCreator(jsonResponse({ version: 2 }));
    await putStarted;

    const duplicateProducer = vi.fn(async () => jsonResponse({ version: 4 }));
    const third = await cachedJson(makeCtx(url.toString()), url, duplicateProducer, cacheOptions);

    try {
      expect(third.headers.get("X-Maiprop-Cache")).toBe("STALE");
      expect(duplicateProducer).not.toHaveBeenCalled();
    } finally {
      releasePut();
      await Promise.all(creatorTasks);
    }
  });

  it("preserves no-store headers for a coalesced timed-out producer", async () => {
    const url = new URL("https://portal.maiprop.co/api/public/open-houses?coalesced-timeout=1");
    const backgroundTasks: Promise<unknown>[] = [];
    let resolveProducer!: (response: Response) => void;
    const producerGate = new Promise<Response>((resolve) => {
      resolveProducer = resolve;
    });

    const first = await cachedJson(
      makeCtx(url.toString(), { waitUntil: (promise) => backgroundTasks.push(promise) }),
      url,
      () => producerGate,
      { producerTimeoutMs: 5 },
    );
    const coalesced = await cachedJson(
      makeCtx(url.toString()),
      url,
      async () => jsonResponse({ source: "second producer" }),
      { producerTimeoutMs: 5 },
    );

    try {
      expect(first.status).toBe(503);
      expect(coalesced.status).toBe(503);
      expect(coalesced.headers.get("X-Maiprop-Cache")).toBe("COALESCED");
      expect(coalesced.headers.get("Cache-Control")).toBe("no-store");
      expect(coalesced.headers.get("CDN-Cache-Control")).toBe("no-store");
    } finally {
      resolveProducer(jsonResponse({ source: "late producer" }));
      await Promise.all(backgroundTasks);
    }
  });

  it("does not seed the edge cache for late unsuccessful producers", async () => {
    const late503Url = new URL("https://portal.maiprop.co/api/public/open-houses?late-producer=503");
    const late503Tasks: Promise<unknown>[] = [];
    let resolveLate503!: (response: Response) => void;
    const late503Producer = new Promise<Response>((resolve) => {
      resolveLate503 = resolve;
    });

    const late503 = await cachedJson(
      makeCtx(late503Url.toString(), { waitUntil: (promise) => late503Tasks.push(promise) }),
      late503Url,
      () => late503Producer,
      { producerTimeoutMs: 5 },
    );
    expect(late503.status).toBe(503);
    resolveLate503(new Response("late upstream failure", { status: 503 }));
    await Promise.all(late503Tasks);
    expect(cacheStore).toHaveLength(0);

    const rejectedUrl = new URL("https://portal.maiprop.co/api/public/open-houses?late-producer=rejected");
    const rejectedTasks: Promise<unknown>[] = [];
    const unhandledRejections: unknown[] = [];
    const onUnhandledRejection = (event: PromiseRejectionEvent) => {
      unhandledRejections.push(event.reason);
    };
    globalThis.addEventListener("unhandledrejection", onUnhandledRejection);
    let rejectLateProducer!: (reason?: unknown) => void;
    const rejectedProducer = new Promise<Response>((_resolve, reject) => {
      rejectLateProducer = reject;
    });

    try {
      const rejected = await cachedJson(
        makeCtx(rejectedUrl.toString(), { waitUntil: (promise) => rejectedTasks.push(promise) }),
        rejectedUrl,
        () => rejectedProducer,
        { producerTimeoutMs: 5 },
      );
      expect(rejected.status).toBe(503);
      rejectLateProducer(new Error("late producer rejected"));
      await Promise.all(rejectedTasks);
      await Promise.resolve();
      expect(cacheStore).toHaveLength(0);
      expect(unhandledRejections).toEqual([]);
    } finally {
      globalThis.removeEventListener("unhandledrejection", onUnhandledRejection);
    }
  });

  it("bypasses a stalled edge-cache read instead of blocking the producer", async () => {
    cacheApi.match.mockImplementation(() => new Promise(() => undefined));

    const pending = cachedJson(
      makeCtx("https://portal.maiprop.co/api/public/open-houses?cache-read-timeout=1"),
      new URL("https://portal.maiprop.co/api/public/open-houses?cache-read-timeout=1"),
      async () => jsonResponse({ ok: true }),
      { cacheReadTimeoutMs: 5, producerTimeoutMs: 100 },
    );

    const result = await Promise.race([
      pending.then(async (res) => ({
        status: res.status,
        cache: res.headers.get("X-Maiprop-Cache"),
        body: await res.json(),
      })),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
    ]);

    expect(result).toEqual({ status: 200, cache: "MISS", body: { ok: true } });
  });

  it("bypasses a cached response whose body never completes", async () => {
    cacheApi.match.mockImplementation(async () => new Response(new ReadableStream({
      start() {
        // A poisoned Cloudflare cache entry can resolve the match while leaving
        // its body stream open indefinitely.
      },
    })));

    const pending = cachedJson(
      makeCtx("https://portal.maiprop.co/api/public/open-houses?cache-body-timeout=1"),
      new URL("https://portal.maiprop.co/api/public/open-houses?cache-body-timeout=1"),
      async () => jsonResponse({ ok: true }),
      { cacheReadTimeoutMs: 5, producerTimeoutMs: 100 },
    );

    const result = await Promise.race([
      pending.then(async (res) => ({
        status: res.status,
        cache: res.headers.get("X-Maiprop-Cache"),
        body: await res.json(),
      })),
      new Promise<null>((resolve) => setTimeout(() => resolve(null), 150)),
    ]);

    expect(result).toEqual({ status: 200, cache: "MISS", body: { ok: true } });
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
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);
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
    fetchMock().mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (isCatalogueQuery(url)) {
        await gate;
        return catalogueCardRows(
          [{ id: deterministicUuid(20, 5), cover_image_url: "new", listing_images: [] }],
          init,
        );
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
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(2);
  });

  it("rejects stale cache entries after their business-validity deadline", async () => {
    const url = new URL("https://portal.maiprop.co/api/public/listings?validity-test=1");
    const backgroundTasks: Promise<unknown>[] = [];
    const cacheOptions = { staleFallbackSeconds: 600 };

    await cachedJson(
      makeCtx(url.toString(), { waitUntil: (promise) => backgroundTasks.push(promise) }),
      url,
      async () => jsonResponse(
        { version: 1 },
        { headers: { "X-Maiprop-Cache-Valid-Until": "2000-01-01T00:00:00.000Z" } },
      ),
      cacheOptions,
    );
    await Promise.all(backgroundTasks);
    for (const key of [...cacheStore.keys()]) {
      if (!key.includes("__maiprop_stale=1")) cacheStore.delete(key);
    }

    const producer = vi.fn(async () => jsonResponse({ version: 2 }));
    const response = await cachedJson(makeCtx(url.toString()), url, producer, cacheOptions);

    expect(response.headers.get("X-Maiprop-Cache")).toBe("MISS");
    await expect(response.json()).resolves.toEqual({ version: 2 });
    expect(producer).toHaveBeenCalledTimes(1);
  });
});

describe("public listings endpoint", () => {
  it("keeps a ten-minute stale catalogue seed for immediate background revalidation", async () => {
    const backgroundTasks: Promise<unknown>[] = [];

    const response = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?listing_type=sale&page=1&pageSize=12",
      { waitUntil: (promise) => backgroundTasks.push(promise) },
    ));
    await Promise.all(backgroundTasks);

    const staleSeed = cacheApi.put.mock.calls.find(([request]) =>
      new URL(request.url).searchParams.get("__maiprop_stale") === "1"
    );

    expect(response.status).toBe(200);
    expect(staleSeed).toBeDefined();
    expect((staleSeed?.[1] as Response).headers.get("Cache-Control")).toBe("public, max-age=600");
  });

  it("reads active Priority and organic streams in parallel without ranking Spotlight or using default offsets", async () => {
    const catalogueBodies: Array<Record<string, unknown>> = [];
    let listingReadsInFlight = 0;
    let maxListingReadsInFlight = 0;
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (isCatalogueQuery(url)) {
        const body = requestJson(init);
        catalogueBodies.push(body);
        listingReadsInFlight += 1;
        maxListingReadsInFlight = Math.max(maxListingReadsInFlight, listingReadsInFlight);
        await new Promise((resolve) => setTimeout(resolve, 10));
        listingReadsInFlight -= 1;

        if (body.p_priority_mode === "priority") {
          return catalogueCardRows([
            {
              id: "priority-1",
              created_at: "2026-07-14T12:00:03.000Z",
              is_featured: true,
              featured_until: "2000-01-01T00:00:00.000Z",
              priority_placement: 1,
              priority_until: "2099-01-01T00:00:00.000Z",
            },
          ], init);
        }
        return catalogueCardRows([
          { id: "organic-new", created_at: "2026-07-14T12:00:02.000Z", is_featured: false, priority_placement: 0 },
          {
            id: "organic-spotlight",
            created_at: "2026-07-14T12:00:01.000Z",
            is_featured: true,
            featured_until: "2099-01-01T00:00:00.000Z",
            priority_placement: 1,
            priority_until: "2000-01-01T00:00:00.000Z",
          },
        ], init);
      }
      return jsonRows([]);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const res = await listingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/listings?pageSize=4"),
    );
    const listingCacheUrls = cacheApi.match.mock.calls
      .map(([request]) => new URL(request.url))
      .filter((url) => url.pathname.endsWith("/api/public/listings"));
    const body = await res.json() as {
      data: Array<{ id: string; is_featured: boolean; priority_placement: number }>;
      nextCursor: string | null;
    };

    expect(listingCacheUrls.some((url) =>
      url.searchParams.get("v") === "catalogue-publication-cursor-v7"
    )).toBe(true);
    expect(res.headers.get("X-Maiprop-Cache-Valid-Until")).toBe(
      cataloguePublicationMetadata().retain_until,
    );
    expect(maxListingReadsInFlight).toBe(2);
    expect(catalogueBodies).toHaveLength(2);
    expect(catalogueBodies.map((body) => body.p_priority_mode).sort())
      .toEqual(["organic", "priority"]);
    for (const rpcBody of catalogueBodies) {
      expect(rpcBody.p_publication_id).toBe(PUBLICATION_ID);
      expect(rpcBody.p_offset).toBe(0);
      expect(rpcBody.p_sort).toBe("newest");
      expect(rpcBody.p_limit).toBe(5);
    }
    expect(body.data.map((row) => row.id)).toEqual([
      "priority-1",
      "organic-new",
      "organic-spotlight",
    ]);
    expect(body.data.find((row) => row.id === "priority-1")).toMatchObject({
      is_featured: false,
      priority_placement: 1,
    });
    expect(body.data.find((row) => row.id === "organic-spotlight")).toMatchObject({
      is_featured: true,
      priority_placement: 0,
    });
    expect(body.nextCursor).toBeNull();
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
    expect(res.headers.get("CDN-Cache-Control")).toBe("no-store");
  });

  it("returns a keyset cursor with no duplicates or skips across stable consecutive pages", async () => {
    const priorityRows = Array.from({ length: 6 }, (_, index) => ({
      id: deterministicUuid(30, index + 1),
      created_at: new Date(Date.UTC(2026, 6, 14, 12, 0, 20 - index)).toISOString(),
      priority_placement: 1,
    }));
    const organicRows = Array.from({ length: 6 }, (_, index) => ({
      id: deterministicUuid(31, index + 1),
      created_at: new Date(Date.UTC(2026, 6, 14, 12, 0, 10 - index)).toISOString(),
      priority_placement: 0,
    }));
    const catalogueBodies: Array<Record<string, unknown>> = [];
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (!isCatalogueQuery(url)) return jsonRows([]);
      const body = requestJson(init);
      catalogueBodies.push(body);

      const isPriority = body.p_priority_mode === "priority";
      const source = isPriority ? priorityRows : organicRows;
      const anchorId = typeof body.p_cursor_listing_id === "string"
        ? body.p_cursor_listing_id
        : null;
      const anchorIndex = anchorId
        ? source.findIndex((row) => row.id === anchorId)
        : -1;
      const start = anchorIndex >= 0 ? anchorIndex + 1 : 0;
      const limit = Number(body.p_limit ?? source.length);
      return catalogueCardRows(source.slice(start, start + limit), init);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const first = await listingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/listings?pageSize=4"),
    );
    const firstBody = await first.json() as {
      data: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(firstBody.data.map((row) => row.id)).toEqual([
      priorityRows[0].id,
      priorityRows[1].id,
      priorityRows[2].id,
      organicRows[0].id,
    ]);
    expect(firstBody.hasMore).toBe(true);
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await listingsRequest(
      makeCtx(`https://portal.maiprop.co/api/public/listings?pageSize=4&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`),
    );
    const secondBody = await second.json() as { data: Array<{ id: string }>; nextCursor: string | null };
    const combinedIds = [...firstBody.data, ...secondBody.data].map((row) => row.id);

    expect(secondBody.data.map((row) => row.id)).toEqual([
      organicRows[1].id,
      organicRows[2].id,
      organicRows[3].id,
      organicRows[4].id,
    ]);
    expect(combinedIds).toEqual([
      priorityRows[0].id,
      priorityRows[1].id,
      priorityRows[2].id,
      organicRows[0].id,
      organicRows[1].id,
      organicRows[2].id,
      organicRows[3].id,
      organicRows[4].id,
    ]);
    expect(new Set(combinedIds)).toHaveLength(combinedIds.length);
    const secondPageBodies = catalogueBodies.slice(2);
    expect(secondPageBodies).toHaveLength(2);
    expect(secondPageBodies.every((body) => body.p_offset === 0)).toBe(true);
    expect(secondPageBodies.find((body) => body.p_priority_mode === "priority")
      ?.p_cursor_listing_id).toBe(priorityRows[2].id);
    expect(secondPageBodies.find((body) => body.p_priority_mode === "organic")
      ?.p_cursor_listing_id).toBe(organicRows[0].id);
  });

  it("applies arbitrary map bounds before ranking either catalogue stream", async () => {
    await listingsRequest(
      makeCtx(
        "https://portal.maiprop.co/api/public/listings?pageSize=40&boundsWest=23.70&boundsSouth=37.90&boundsEast=23.80&boundsNorth=38.05",
      ),
    );

    const catalogueBodies = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue");
    expect(catalogueBodies).toHaveLength(2);
    for (const body of catalogueBodies) {
      expect(body).toMatchObject({
        p_bounds_west: 23.7,
        p_bounds_south: 37.9,
        p_bounds_east: 23.8,
        p_bounds_north: 38.05,
      });
    }
  });

  it("clamps page size, keeps listing images capped, attaches public owner profiles, and caches the response", async () => {
    const res = await listingsRequest(
      makeCtx(
        "https://portal.maiprop.co/api/public/listings?page=1&pageSize=999&city=Athens&listing_type=sale&features=has_pool,has_alarm,unsafe&energy_class=A,BAD&A%5B%5D=ignored",
      ),
    );
    const body = await res.json() as { data: Array<{ profiles: unknown; ownerParticipantType: string | null }>; hasMore: boolean; page: number; pageSize: number; offset: number };

    expect(res.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(body.page).toBe(1);
    expect(body.pageSize).toBe(200);
    expect(body.offset).toBe(0);
    expect(body.hasMore).toBe(false);
    expect(body.data[0].profiles).toMatchObject({ display_name: "Maria Agent" });
    expect(body.data[0].profiles).not.toHaveProperty("owner_participant_type");
    expect(body.data[0].ownerParticipantType).toBe("agent");

    const catalogueBodies = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue");
    expect(catalogueBodies).toHaveLength(2);
    for (const rpcBody of catalogueBodies) {
      expect(rpcBody).toMatchObject({
        p_publication_id: PUBLICATION_ID,
        p_listing_type: "sale,new_build",
        p_location: null,
        p_location_groups: [["athens"]],
        p_energy_classes: ["A"],
        p_features: ["has_alarm", "has_pool"],
        p_limit: 201,
        p_offset: 0,
      });
    }

    expect(initFor("/rest/v1/rpc/get_public_profile_summaries").method).toBe("POST");
    expect(jsonBodyFor("/rest/v1/rpc/get_public_profile_summaries")).toEqual({ p_user_ids: ["owner-1"] });
    expect(cacheApi.put).toHaveBeenCalledTimes(2);
    expect(cacheApi.put.mock.calls.some(([request]) => request.url.includes("__maiprop_stale=1"))).toBe(true);
  });

  it.each([
    [200, false],
    [201, true],
  ])(
    "uses the 201st row only as a has-more sentinel when the organic stream has %i rows",
    async (rowCount, expectedHasMore) => {
      const rows = Array.from({ length: rowCount }, (_, index) => ({
        id: deterministicUuid(55, index + 1),
        created_at: new Date(Date.UTC(2026, 6, 28, 12, 0, 0) - index * 1_000).toISOString(),
        title: `Sentinel listing ${index + 1}`,
        listing_type: "sale",
      }));
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (isCataloguePublication(url)) return cataloguePublicationRows();
        if (isCatalogueQuery(url)) {
          const body = requestJson(init);
          const limit = Number(body.p_limit ?? rows.length);
          return body.p_priority_mode === "priority"
            ? catalogueCardRows([], init)
            : catalogueCardRows(rows.slice(0, limit), init);
        }
        return jsonRows([]);
      }) as unknown as typeof fetch;

      const response = await listingsRequest(makeCtx(
        `https://portal.maiprop.co/api/public/listings?pageSize=200&sentinel=${rowCount}`,
      ));
      const body = await response.json() as {
        data: Array<{ id: string }>;
        hasMore: boolean;
      };
      const organicRequest = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")
        .find((request) => request.p_priority_mode === "organic");

      expect(response.status).toBe(200);
      expect(body.data).toHaveLength(200);
      expect(body.hasMore).toBe(expectedHasMore);
      expect(organicRequest?.p_limit).toBe(201);
    },
  );

  it("keeps the catalogue available when optional public profile enrichment is unavailable", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (isCatalogueQuery(url)) {
        return catalogueCardRows(
          [{ id: "listing-1", owner_id: "owner-1", title: "Athens flat" }],
          init,
        );
      }
      if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") {
        return new Response("missing function", { status: 404 });
      }
      return jsonRows([]);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const res = await listingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/listings?listing_type=sale&limit=1"),
    );
    const body = await res.json() as {
      data: Array<{ id: string; profiles: unknown; ownerParticipantType: unknown }>;
    };

    expect(res.status).toBe(200);
    expect(body.data).toEqual([
      expect.objectContaining({
        id: "listing-1",
        profiles: null,
        ownerParticipantType: null,
      }),
    ]);
  });

  it("resolves explicit offsets from sparse Priority inventory without duplicates or omissions", async () => {
    const priorityRows = [{
      id: "priority-1",
      created_at: "2026-07-14T12:00:30.000Z",
      priority_placement: 1,
      priority_until: "2099-01-01T00:00:00.000Z",
    }];
    const organicRows = Array.from({ length: 30 }, (_, index) => ({
      id: `organic-${index + 1}`,
      created_at: new Date(Date.UTC(2026, 6, 14, 12, 0, 29 - index)).toISOString(),
      priority_placement: 0,
    }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (
        url.pathname === "/rest/v1/rpc/get_public_listing_catalogue" &&
        init?.method === "HEAD"
      ) {
        const source = url.searchParams.get("priority_placement") === "gt.0"
          ? priorityRows
          : organicRows;
        return new Response(null, {
          headers: { "Content-Range": `0-0/${source.length}` },
        });
      }
      if (!isCatalogueQuery(url)) return jsonRows([]);
      const rpcBody = requestJson(init);
      const source = rpcBody.p_priority_mode === "priority"
        ? priorityRows
        : organicRows;
      const offset = Number(rpcBody.p_offset ?? 0);
      const limit = Number(rpcBody.p_limit ?? source.length);
      return catalogueCardRows(source.slice(offset, offset + limit), init);
    }) as unknown as typeof fetch;

    const res = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?listing_type=sale&page=1&pageSize=4&offset=12",
    ));
    const body = await res.json() as { data: Array<{ id: string }>; page: number; pageSize: number; offset: number };

    expect(body).toMatchObject({ page: 1, pageSize: 4, offset: 12 });
    expect(body.data.map((row) => row.id)).toEqual([
      "organic-12",
      "organic-13",
      "organic-14",
      "organic-15",
    ]);
    expect(fetchMock().mock.calls.filter(([, init]) => init?.method === "HEAD"))
      .toHaveLength(2);
    const catalogueBodies = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue");
    expect(catalogueBodies).toHaveLength(2);
    expect(catalogueBodies.every((rpcBody) => rpcBody.p_limit === 5)).toBe(true);
    expect(catalogueBodies.map((rpcBody) => rpcBody.p_offset).sort())
      .toEqual([1, 11]);
  });

  it("uses exact stream counts for legacy offsets above the PostgREST row cap", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") return jsonRows([]);
      if (
        url.pathname === "/rest/v1/rpc/get_public_listing_catalogue" &&
        init?.method === "HEAD"
      ) {
        const priority = url.searchParams.get("priority_placement") === "gt.0";
        const available = priority ? 500 : 3_000;
        return new Response(null, { headers: { "Content-Range": `0-0/${available}` } });
      }
      if (!isCatalogueQuery(url)) return jsonRows([]);
      const rpcBody = requestJson(init);
      const priority = rpcBody.p_priority_mode === "priority";
      const available = priority ? 500 : 3_000;
      const limit = Number(rpcBody.p_limit ?? available);
      const offset = Number(rpcBody.p_offset ?? 0);
      return catalogueCardRows(Array.from(
        { length: Math.min(limit, Math.max(0, available - offset)) },
        (_, index) => ({
          id: `${priority ? "priority" : "organic"}-${offset + index + 1}`,
          created_at: new Date(Date.UTC(2026, 6, 14, 12, 0, 0 - offset - index)).toISOString(),
          priority_placement: priority ? 1 : 0,
          priority_until: priority ? "2099-01-01T00:00:00.000Z" : null,
        }),
      ), init);
    }) as unknown as typeof fetch;

    const response = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?pageSize=4&offset=1500",
    ));

    expect(response.status).toBe(200);
    const catalogueOffsets = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")
      .map((rpcBody) => rpcBody.p_offset)
      .sort((left, right) => Number(left) - Number(right));
    expect(catalogueOffsets).toEqual([375, 1125]);
    expect(fetchMock().mock.calls.filter(([, init]) => init?.method === "HEAD")).toHaveLength(2);
  });

  it.each([
    ["featured", "created_at"],
    ["newest", "created_at"],
    ["price-asc", "price"],
    ["price-desc", "price"],
    ["ai-score", "ai_score"],
    ["views", "views_count"],
  ])("keeps the %s sort field in exact RPC offset counts", async (sort, field) => {
    const res = await listingsRequest(makeCtx(
      `https://portal.maiprop.co/api/public/listings?listing_type=sale&pageSize=1&offset=1&sort=${sort}`,
    ));

    expect(res.status).toBe(200);
    const countCalls = fetchMock().mock.calls.filter(([input, init]) => {
      const url = new URL(String(input));
      return url.pathname === "/rest/v1/rpc/get_public_listing_catalogue" &&
        url.searchParams.get("select") === `id,${field}` &&
        init?.method === "HEAD";
    });
    expect(countCalls).toHaveLength(2);
    expect(countCalls.every(([input, init]) => {
      const url = new URL(String(input));
      return !url.searchParams.has("order") &&
        !url.searchParams.has("limit") &&
        (init?.headers as Record<string, string>)?.Prefer === "count=exact";
    })).toBe(true);
  });

  it("uses a coordinate bounding box for selected address suggestions", async () => {
    await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?listing_type=sale&city=Kalimnou%2027&location_lat=38.0301&location_lng=23.7241&location_radius_m=750",
    ));

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_location).toBeNull();
    expect(Number(rpcBody.p_bounds_south)).toBeLessThan(38.0301);
    expect(Number(rpcBody.p_bounds_north)).toBeGreaterThan(38.0301);
    expect(Number(rpcBody.p_bounds_west)).toBeLessThan(23.7241);
    expect(Number(rpcBody.p_bounds_east)).toBeGreaterThan(23.7241);
  });

  it("applies tour and score filters before selecting the bounded map window", async () => {
    await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?listing_type=sale&pageSize=200&has_video_tour=true&has_virtual_tour=true&ai_score_min=80&walkability_min=70",
    ));

    const catalogueBodies = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue");
    expect(catalogueBodies).toHaveLength(2);
    for (const body of catalogueBodies) {
      expect(body.p_features).toEqual(["has_video_tour", "has_virtual_tour"]);
      expect(body.p_ai_score_min).toBe(80);
      expect(body.p_walkability_min).toBe(70);
      expect(body.p_limit).toBe(201);
    }
  });

  it("intersects an active city filter with map bounds", async () => {
    await listingsRequest(
      makeCtx(
        "https://portal.maiprop.co/api/public/listings?pageSize=40&city=Athens&boundsWest=23.70&boundsSouth=37.90&boundsEast=23.80&boundsNorth=38.05",
      ),
    );

    const catalogueBodies = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue");
    expect(catalogueBodies).toHaveLength(2);
    for (const body of catalogueBodies) {
      expect(body).toMatchObject({
        p_location: null,
        p_location_groups: [["athens"]],
        p_bounds_west: 23.7,
        p_bounds_south: 37.9,
        p_bounds_east: 23.8,
        p_bounds_north: 38.05,
      });
    }
  });

  it("rejects partial or malformed listing map bounds instead of widening the scope", async () => {
    const partial = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?boundsWest=23.7123&boundsSouth=37.9123&boundsEast=23.8123",
    ));
    const reversed = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?boundsWest=23.8123&boundsSouth=37.9123&boundsEast=23.7123&boundsNorth=38.0123",
    ));

    expect(partial.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("rejects a listing cursor reused with a different filter scope", async () => {
    const first = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?pageSize=1&city=Athens",
    ));
    const firstBody = await first.json() as { nextCursor: string | null };
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await listingsRequest(makeCtx(
      `https://portal.maiprop.co/api/public/listings?pageSize=1&city=Piraeus&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
    ));

    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toEqual({ error: "Invalid catalogue cursor" });
  });

  it("rejects forged listing cursor anchors and snapshot times before querying Supabase", async () => {
    const createdAt = "2026-07-14T12:00:00.000Z";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") return jsonRows([]);
      if (!isCatalogueQuery(url)) return jsonRows([]);
      const rpcBody = requestJson(init);
      const priority = rpcBody.p_priority_mode === "priority";
      return catalogueCardRows(Array.from({ length: 2 }, (_, index) => ({
        id: deterministicUuid(priority ? 32 : 33, index + 1),
        created_at: createdAt,
        priority_placement: priority ? 1 : 0,
      })), init);
    }) as unknown as typeof fetch;

    const first = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?pageSize=1",
    ));
    const firstBody = await first.json() as { nextCursor: string | null };
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    const base = decodeCursorPayload(firstBody.nextCursor ?? "");
    const upstreamCalls = fetchMock().mock.calls.length;
    const priority = base.priority as Record<string, unknown>;
    const candidates = [
      { ...base, priority: { ...priority, id: "not-a-uuid" } },
      { ...base, priority: { ...priority, value: "not-an-iso-timestamp" } },
      { ...base, v: 1 },
      { ...base, asOf: undefined },
      { ...base, asOf: new Date(Date.now() + 5 * 60_000).toISOString() },
      { ...base, asOf: new Date(Date.now() - 46 * 60_000).toISOString() },
    ];

    for (const candidate of candidates) {
      const response = await listingsRequest(makeCtx(
        `https://portal.maiprop.co/api/public/listings?pageSize=1&cursor=${encodeURIComponent(encodeCursorPayload(candidate))}`,
      ));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid catalogue cursor" });
    }
    expect(fetchMock().mock.calls).toHaveLength(upstreamCalls);
  });

  it("pins listing eligibility and promotion projection to the first-page timestamp", async () => {
    const first = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?pageSize=1",
    ));
    const firstBody = await first.json() as { nextCursor: string | null };
    const firstPublication = jsonBodyFor(
      "/rest/v1/rpc/get_public_catalogue_publication",
    ) as Record<string, unknown>;
    const firstCalls = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue");
    const firstCursor = decodeCursorPayload(firstBody.nextCursor ?? "");
    const asOf = firstCursor.asOf;

    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(firstPublication).toEqual({ p_publication_id: null });
    expect(asOf).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(firstCursor.publicationId).toBe(PUBLICATION_ID);
    expect(firstCalls.every((body) => body.p_publication_id === PUBLICATION_ID))
      .toBe(true);

    fetchMock().mockClear();
    await listingsRequest(makeCtx(
      `https://portal.maiprop.co/api/public/listings?pageSize=1&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
    ));
    const secondCalls = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue");
    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_publication"))
      .toEqual({ p_publication_id: PUBLICATION_ID });
    expect(secondCalls.every((body) => body.p_publication_id === PUBLICATION_ID))
      .toBe(true);
  });

  it("ORs Greek short-locality synonyms so Latin-stored listings can match selected Google suggestions", async () => {
    await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings?listing_type=sale&city=%CE%86%CE%B3%CE%B9%CE%BF%CE%B9%20%CE%91%CE%BD%CE%AC%CF%81%CE%B3%CF%85%CF%81%CE%BF%CE%B9",
    ));

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_location_groups).toEqual([
      expect.arrayContaining(["αγιοι", "agioi"]),
      expect.arrayContaining(["αναργυροι", "anargiroi"]),
    ]);
  });

  it("uses the default public catalogue scope unless auctions are explicitly included", async () => {
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?sort=price-desc"));
    let rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_listing_type).toBe("sale,rent,firesale,new_build");
    expect(rpcBody.p_sort).toBe("price_desc");
    expect(rpcBody).not.toHaveProperty("p_is_off_market");

    fetchMock().mockClear();
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?includeAuctions=true&sort=views"));
    rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_listing_type).toBeNull();
    expect(rpcBody.p_sort).toBe("views");
  });

  it("includes canonical new-build project ads on sale pages, while rent stays rent-only", async () => {
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?listing_type=sale"));
    let rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_listing_type).toBe("sale,new_build");

    fetchMock().mockClear();
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?listing_type=rent"));
    rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_listing_type).toBe("rent");
  });

  it("returns canonical new-build listings by listing_type instead of the legacy pre-sale flag", async () => {
    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?listing_type=new_build&limit=1"));
    const body = await res.json() as { data: Array<{ id: string; listing_type: string; is_pre_sale: boolean; project?: { name?: string } }> };

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_listing_type).toBe("new_build");
    expect(rpcBody).not.toHaveProperty("p_is_pre_sale");
    expect(body.data).toEqual([
      expect.objectContaining({
        id: deterministicUuid(10, 8),
        listing_type: "new_build",
        project: expect.objectContaining({ name: "Marina Heights" }),
      }),
    ]);
  });

  it("maps legacy is_pre_sale=true requests to canonical new-build listing_type", async () => {
    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?is_pre_sale=true&limit=1"));
    const body = await res.json() as { data: Array<{ id: string; listing_type: string; is_pre_sale: boolean }> };

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_listing_type).toBe("new_build");
    expect(body.data[0]).toMatchObject({
      id: deterministicUuid(10, 8),
      listing_type: "new_build",
    });
  });

  it("does not expose off-market rows through public listing search", async () => {
    await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?is_off_market=true"));

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody.p_publication_id).toBe(PUBLICATION_ID);
    expect(rpcBody).not.toHaveProperty("p_is_off_market");
    expect(rpcBody).not.toHaveProperty("p_listing_id");
  });

  it("filters production-blocked fixture records before attaching public owner profiles", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (isCatalogueQuery(url)) {
        return catalogueCardRows([
          { id: "listing-supervisor", owner_id: "owner-fixture", title: "supervisor-177912 smoke" },
          { id: "listing-e2e", owner_id: "owner-fixture", title: "E2E-FULL-PUBLISH-20260526T161856Z test", tags: ["qa-full-publish"] },
          { id: "listing-clean", owner_id: "owner-clean", title: "Athens flat" },
        ], init);
      }
      if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") {
        return jsonRows([
          { user_id: "owner-clean", display_name: "Maria Agent", avatar_url: null, owner_participant_type: "agent" },
        ]);
      }
      return jsonRows([]);
    }) as unknown as FetchMock;
    globalThis.fetch = mock as unknown as typeof fetch;

    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?limit=3"));
    const body = await res.json() as { data: Array<{ id: string; profiles: unknown }> };

    expect(body.data.map((row) => row.id)).toEqual(["listing-clean"]);
    expect(body.data[0].profiles).toMatchObject({ display_name: "Maria Agent" });
    expect(jsonBodyFor("/rest/v1/rpc/get_public_profile_summaries")).toEqual({ p_user_ids: ["owner-clean"] });
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

  it("serves immutable catalogue publications without a service credential", async () => {
    const response = await listingsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/listings",
      {
        requestEnv: {
          SUPABASE_PROJECT_ID: PROJECT_ID,
          SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_publication")).toHaveLength(1);
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(2);
    expect(fetchMock().mock.calls.every(([, init]) => {
      const headers = new Headers(init?.headers);
      return headers.get("Authorization") !== "Bearer service_role_test_key";
    })).toBe(true);
  });

  it("returns 503 instead of an empty successful catalogue when the listings upstream is transiently unavailable", async () => {
    fetchMock().mockResolvedValue(new Response("cloudflare timeout", { status: 522 }));

    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/api/public/listings?limit=3"));

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
    expect(cacheApi.put).not.toHaveBeenCalled();
  });
});

describe("public listing detail endpoint", () => {
  it("fetches one active public listing, attaches the public owner profile, and caches by id", async () => {
    const requestedId = "11111111-1111-4111-8111-111111111111";
    const res = await listingRequest(
      makeCtx(`https://portal.maiprop.co/api/public/listing?id=${requestedId}`),
    );
    const body = await res.json() as { data: { id: string; profiles: unknown } };

    expect(body.data.id).toBe(requestedId);
    expect(body.data.profiles).toMatchObject({ display_name: "Maria Agent" });
    expect(res.headers.get("X-Maiprop-Cache-Valid-Until")).toBe(
      cataloguePublicationMetadata().retain_until,
    );

    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_listing")).toEqual({
      p_publication_id: PUBLICATION_ID,
      p_listing_id: "11111111-1111-4111-8111-111111111111",
      p_os_tag: null,
    });
    expect(initFor("/rest/v1/rpc/get_public_profile_summaries").method).toBe("POST");
    expect(jsonBodyFor("/rest/v1/rpc/get_public_profile_summaries")).toEqual({ p_user_ids: ["owner-1"] });
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=publication-detail-v3");
    expect(cacheApi.put).toHaveBeenCalledTimes(1);
    expect([...cacheStore.keys()].some((key) => key.includes("__maiprop_stale=1"))).toBe(false);
  });

  it("pins exact detail reads and cache identity to the requested publication", async () => {
    const pinnedPublicationId = 41;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        expect(requestJson(init)).toEqual({ p_publication_id: pinnedPublicationId });
        return cataloguePublicationRows(pinnedPublicationId);
      }
      if (isCatalogueDetail(url)) {
        return catalogueDetailRows({
          id: "11111111-1111-4111-8111-111111111111",
          title: "Pinned Athens flat",
          city: "Athens",
        }, init);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await listingRequest(makeCtx(
      `https://portal.maiprop.co/api/public/listing?id=11111111-1111-4111-8111-111111111111&publicationId=${pinnedPublicationId}`,
    ));
    const body = await response.json() as {
      data: { id: string; publicationId: number };
      publicationId: number;
    };

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      data: {
        id: "11111111-1111-4111-8111-111111111111",
        publicationId: pinnedPublicationId,
      },
      publicationId: pinnedPublicationId,
    });
    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_listing")).toEqual({
      p_publication_id: pinnedPublicationId,
      p_listing_id: "11111111-1111-4111-8111-111111111111",
      p_os_tag: null,
    });
    expect(cacheApi.put.mock.calls[0][0].url).toContain(
      `publicationId=${pinnedPublicationId}`,
    );
  });

  it("suppresses expired paid flags on exact listing responses", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) return cataloguePublicationRows();
      if (isCatalogueDetail(url)) {
        return catalogueDetailRows({
          id: "listing-expired",
          is_featured: true,
          featured_until: "2000-01-01T00:00:00.000Z",
          priority_placement: 1,
          priority_until: "2000-01-01T00:00:00.000Z",
        }, init);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await listingRequest(
      makeCtx("https://portal.maiprop.co/api/public/listing?id=11111111-1111-4111-8111-111111111111"),
    );
    const body = await response.json() as {
      data: { is_featured: boolean; priority_placement: number };
    };

    expect(body.data).toMatchObject({ is_featured: false, priority_placement: 0 });
  });

  it("normalizes exact-detail promotion state at the publication timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:30:00.000Z"));
    try {
      const snapshotMinute = "2026-07-29T12:00:00.000Z";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (isCataloguePublication(url)) {
          return cataloguePublicationRows(PUBLICATION_ID, snapshotMinute);
        }
        if (isCatalogueDetail(url)) {
          return catalogueDetailRows({
            id: "11111111-1111-4111-8111-111111111111",
            is_featured: true,
            featured_until: "2026-07-29T12:15:00.000Z",
            priority_placement: 1,
            priority_until: "2026-07-29T12:15:00.000Z",
          }, init);
        }
        return jsonRows([]);
      }) as unknown as typeof fetch;

      const response = await listingRequest(makeCtx(
        "https://portal.maiprop.co/api/public/listing?id=11111111-1111-4111-8111-111111111111",
      ));
      const body = await response.json() as {
        data: { is_featured: boolean; priority_placement: number };
      };

      expect(body.data).toMatchObject({ is_featured: true, priority_placement: 1 });
      expect(response.headers.get("X-Maiprop-Cache-Valid-Until"))
        .toBe("2026-07-29T12:40:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it.each([
    [
      "id=11111111-1111-4111-8111-111111111111",
      { id: "22222222-2222-4222-8222-222222222222" },
    ],
    [
      "osTag=expected-tag",
      { id: "22222222-2222-4222-8222-222222222222", listing_type: "auction", tags: ["os_auction:other-tag"] },
    ],
  ])("fails closed when exact detail identity does not match %s", async (query, payload) => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) return cataloguePublicationRows();
      if (isCatalogueDetail(url)) {
        return jsonRows([{
          publication_id: PUBLICATION_ID,
          published_at: publicationTimestamp(),
          detail_payload: payload,
        }]);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await listingRequest(makeCtx(
      `https://portal.maiprop.co/api/public/listing?${query}`,
    ));

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Catalogue detail identity mismatch",
    });
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
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) return cataloguePublicationRows();
      if (isCatalogueDetail(url)) {
        return catalogueDetailRows({
          id: "listing-1",
          owner_id: "owner-1",
          title: "Marina Heights A101",
          listing_type: "new_build",
          project_id: "project-1",
          project: projectPayload,
        }, init);
      }
      if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") {
        return jsonRows([{ user_id: "owner-1", display_name: "Mai Developer", avatar_url: null, owner_participant_type: "agent" }]);
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

    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_listing")).toEqual({
      p_publication_id: PUBLICATION_ID,
      p_listing_id: "11111111-1111-4111-8111-111111111111",
      p_os_tag: null,
    });
  });

  it("rejects invalid detail ids before calling Supabase", async () => {
    const res = await listingRequest(makeCtx("https://portal.maiprop.co/api/public/listing?id=not valid"));

    expect(res.status).toBe(400);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("keeps owner-backed listings loadable when the optional public profile lookup fails", async () => {
    const mock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) return cataloguePublicationRows();
      if (isCatalogueDetail(url)) {
        return catalogueDetailRows(
          { id: "listing-1", owner_id: "owner-1", title: "Athens flat" },
          init,
        );
      }
      if (url.pathname === "/rest/v1/rpc/get_public_profile_summaries") {
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
    expect(body.data).toMatchObject({
      id: "11111111-1111-4111-8111-111111111111",
      profiles: null,
    });
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

    expect(jsonBodyFor("/rest/v1/rpc/query_public_catalogue")).toMatchObject({
      p_publication_id: PUBLICATION_ID,
      p_location: "Athens",
      p_property_type: "apartment",
      p_listing_type: "sale",
      p_sort: "newest",
      p_limit: 48,
    });
    expect(cacheApi.put.mock.calls[0][0].url).toContain("limit=1");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("publicationId=current");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=publication-similar-v3");
  });

  it("keeps price relevance ahead of Priority and uses active Priority only for exact relevance ties", async () => {
    installCatalogueQueryRows([
        {
          id: "priority-far",
          price: 500_000,
          created_at: "2026-07-14T12:00:04.000Z",
          priority_placement: 1,
          priority_until: "2099-01-01T00:00:00.000Z",
        },
        {
          id: "organic-near",
          price: 305_000,
          created_at: "2026-07-14T12:00:03.000Z",
          priority_placement: 0,
        },
        {
          id: "organic-tie",
          price: 290_000,
          created_at: "2026-07-14T12:00:02.000Z",
          priority_placement: 0,
        },
        {
          id: "priority-tie",
          price: 310_000,
          created_at: "2026-07-14T12:00:01.000Z",
          priority_placement: 1,
          priority_until: "2099-01-01T00:00:00.000Z",
        },
      ]);

    const res = await similarListingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/similar-listings?city=Athens&price=300000&limit=4"),
    );
    const body = await res.json() as { data: Array<{ id: string }> };

    expect(body.data.map((row) => row.id)).toEqual([
      "organic-near",
      "priority-tie",
      "organic-tie",
      "priority-far",
    ]);
  });

  it("pins related listings to the requested publication", async () => {
    const pinnedPublicationId = 41;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        expect(requestJson(init)).toEqual({ p_publication_id: pinnedPublicationId });
        return cataloguePublicationRows(pinnedPublicationId);
      }
      if (isCatalogueQuery(url)) {
        const body = requestJson(init);
        expect(body.p_publication_id).toBe(pinnedPublicationId);
        return jsonRows([{
          publication_id: pinnedPublicationId,
          published_at: publicationTimestamp(),
          listing_id: "similar-pinned",
          priority_rank: 0,
          created_at: publicationTimestamp(),
          price: 300000,
          ai_score: null,
          views_count: 0,
          open_house_date: null,
          card_payload: {
            id: "similar-pinned",
            title: "Pinned related listing",
            city: "Athens",
            price: 300000,
          },
        }]);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await similarListingsRequest(makeCtx(
      `https://portal.maiprop.co/api/public/similar-listings?city=Athens&publicationId=${pinnedPublicationId}`,
    ));
    const body = await response.json() as {
      data: Array<{ id: string; publicationId: number }>;
      publicationId: number;
    };

    expect(response.status).toBe(200);
    expect(body.publicationId).toBe(pinnedPublicationId);
    expect(body.data[0]).toMatchObject({
      id: "similar-pinned",
      publicationId: pinnedPublicationId,
    });
    expect(jsonBodyFor("/rest/v1/rpc/query_public_catalogue")).toMatchObject({
      p_publication_id: pinnedPublicationId,
    });
    expect(response.headers.get("X-Maiprop-Cache-Valid-Until")).toBe(
      cataloguePublicationMetadata(pinnedPublicationId).retain_until,
    );
  });

  it("normalizes related-listing promotion state at the publication timestamp", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-29T12:30:00.000Z"));
    try {
      const snapshotMinute = "2026-07-29T12:00:00.000Z";
      globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(String(input));
        if (isCataloguePublication(url)) {
          return cataloguePublicationRows(PUBLICATION_ID, snapshotMinute);
        }
        if (isCatalogueQuery(url)) {
          return catalogueCardRows([{
            id: "priority-at-publication",
            price: 300000,
            priority_placement: 1,
            priority_until: "2026-07-29T12:15:00.000Z",
          }], init);
        }
        return jsonRows([]);
      }) as unknown as typeof fetch;

      const response = await similarListingsRequest(makeCtx(
        "https://portal.maiprop.co/api/public/similar-listings?city=Athens&price=300000",
      ));
      const body = await response.json() as {
        data: Array<{ priority_placement: number }>;
      };

      expect(body.data[0]?.priority_placement).toBe(1);
      expect(response.headers.get("X-Maiprop-Cache-Valid-Until"))
        .toBe("2026-07-29T12:40:00.000Z");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not let Spotlight affect similarity order and only exposes active visual state", async () => {
    installCatalogueQueryRows([
        {
          id: "spotlight-older",
          price: 300_000,
          created_at: "2026-07-14T12:00:01.000Z",
          is_featured: true,
          featured_until: "2099-01-01T00:00:00.000Z",
        },
        {
          id: "organic-newer",
          price: 300_000,
          created_at: "2026-07-14T12:00:02.000Z",
          is_featured: false,
        },
      ]);

    const res = await similarListingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/similar-listings?city=Athens&price=300000&limit=2"),
    );
    const body = await res.json() as {
      data: Array<{ id: string; is_featured: boolean }>;
    };

    expect(body.data.map((row) => row.id)).toEqual(["organic-newer", "spotlight-older"]);
    expect(body.data.find((row) => row.id === "spotlight-older")?.is_featured).toBe(true);
  });

  it("treats expired Priority and Spotlight flags as organic response state", async () => {
    installCatalogueQueryRows([
        {
          id: "expired-flags",
          price: 300_000,
          created_at: "2026-07-14T12:00:01.000Z",
          is_featured: true,
          featured_until: "2000-01-01T00:00:00.000Z",
          priority_placement: 1,
          priority_until: "2000-01-01T00:00:00.000Z",
        },
        {
          id: "organic-newer",
          price: 300_000,
          created_at: "2026-07-14T12:00:02.000Z",
          is_featured: false,
          priority_placement: 0,
        },
      ]);

    const res = await similarListingsRequest(
      makeCtx("https://portal.maiprop.co/api/public/similar-listings?city=Athens&price=300000&limit=2"),
    );
    const body = await res.json() as {
      data: Array<{ id: string; is_featured: boolean; priority_placement: number }>;
    };

    expect(body.data.map((row) => row.id)).toEqual(["organic-newer", "expired-flags"]);
    expect(body.data.find((row) => row.id === "expired-flags")).toMatchObject({
      is_featured: false,
      priority_placement: 0,
    });
  });

  it("deduplicates cloned OS auction rows before slicing related deals", async () => {
    installCatalogueQueryRows(
      [
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
      ],
      [
          { user_id: "owner-1", display_name: "Maria Agent", avatar_url: null, owner_participant_type: "agent" },
          { user_id: "owner-2", display_name: "Nikos Owner", avatar_url: null, owner_participant_type: "seller" },
      ],
    );

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
  it("keeps the homepage preview as the exact prefix of the canonical Open House window", async () => {
    const rows = Array.from({ length: 10 }, (_, index) => ({
      id: deterministicUuid(40, index + 1),
      title: `Open House ${index + 1}`,
      open_house_date: new Date(Date.UTC(2026, 7, 1, 10 + index)).toISOString(),
    }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (!isCatalogueQuery(url)) return jsonRows([]);
      const rpcBody = requestJson(init);
      const limit = Number(rpcBody.p_limit ?? rows.length);
      return catalogueCardRows(rows.slice(0, limit), init);
    }) as unknown as typeof fetch;

    const preview = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?limit=6",
    ));
    const canonical = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?limit=60",
    ));
    const previewRows = await preview.json() as Array<{ id: string }>;
    const canonicalRows = await canonical.json() as Array<{ id: string }>;

    expect(previewRows.map((row) => row.id)).toEqual(
      canonicalRows.slice(0, 6).map((row) => row.id),
    );
  });

  it("serves upcoming open houses with capped payloads and bounded limits", async () => {
    const response = await openHousesRequest(
      makeCtx("https://portal.maiprop.co/api/public/open-houses?limit=999"),
    );

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody).toMatchObject({
      p_publication_id: PUBLICATION_ID,
      p_limit: 201,
      p_listing_type: "open_house",
      p_open_house_mode: "upcoming",
      p_sort: "newest",
    });
    expect(response.headers.get("X-Maiprop-Cache-Valid-Until")).toBe(
      cataloguePublicationMetadata().retain_until,
    );
  });

  it("filters open houses by sale or rental transaction subcategory", async () => {
    await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?transactionType=rent&limit=24"));

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody).toMatchObject({
      p_limit: 25,
      p_listing_type: "open_house",
      p_transaction_type: "rent",
      p_open_house_mode: "upcoming",
    });
    expect(cacheApi.put.mock.calls[0][0].url).toContain("transactionType=rent");
  });

  it("supports past open houses using a separate cache key", async () => {
    await openHousesRequest(makeCtx("https://portal.maiprop.co/api/public/open-houses?showPast=true&limit=12"));

    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];
    expect(rpcBody).toMatchObject({
      p_limit: 13,
      p_listing_type: "open_house",
      p_open_house_mode: "past",
    });
    expect(cacheApi.put.mock.calls[0][0].url).toContain("showPast=1");
    expect(cacheApi.put.mock.calls[0][0].url).toContain("v=open-house-publication-cursor-v8");
  });

  it("filters before the 200-row window and discloses additional matches", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (isCatalogueQuery(url)) {
        const rpcBody = requestJson(init);
        const limit = Number(rpcBody.p_limit ?? 0);
        return catalogueCardRows(Array.from({ length: limit }, (_, index) => ({
          id: deterministicUuid(41, index + 1),
          title: `Filtered Open House ${index + 1}`,
          city: "Athens",
        })), init);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?limit=200&includeMeta=1&city=Athens&propertyType=apartment&priceMin=200000&priceMax=600000&sqmMin=80&sqmMax=120&bedroomsMin=3&energyClass=A&yearMin=2010&yearMax=2020&features=has_parking&features=has_balcony",
    ));
    const body = await response.json() as {
      data: Array<{ id: string }>;
      hasMore: boolean;
      limit: number;
    };
    const rpcBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(200);
    expect(body.data.at(-1)?.id).toBe(deterministicUuid(41, 200));
    expect(body.hasMore).toBe(true);
    expect(body.limit).toBe(200);
    expect(rpcBody).toMatchObject({
      p_limit: 201,
      p_location: "Athens",
      p_property_type: "apartment",
      p_price_min: 200000,
      p_price_max: 600000,
      p_sqm_min: 80,
      p_sqm_max: 120,
      p_bedrooms_min: 3,
      p_energy_classes: ["A"],
      p_year_min: 2010,
      p_year_max: 2020,
      p_features: ["has_balcony", "has_parking"],
    });
  });

  it("accepts signed four-decimal map bounds and rejects incomplete or reversed scopes", async () => {
    const valid = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?boundsWest=-0.1276&boundsSouth=51.4874&boundsEast=-0.0876&boundsNorth=51.5274",
    ));
    const validBody = jsonBodiesFor("/rest/v1/rpc/query_public_catalogue")[0];

    expect(valid.status).toBe(200);
    expect(validBody).toMatchObject({
      p_bounds_west: -0.1276,
      p_bounds_south: 51.4874,
      p_bounds_east: -0.0876,
      p_bounds_north: 51.5274,
    });

    fetchMock().mockClear();
    const partial = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?boundsWest=23.7123&boundsSouth=37.9123&boundsEast=23.8123",
    ));
    const reversed = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?boundsWest=23.8123&boundsSouth=37.9123&boundsEast=23.7123&boundsNorth=38.0123",
    ));

    expect(partial.status).toBe(400);
    expect(reversed.status).toBe(400);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("paginates equal-date open houses with an id tie-breaker and stable snapshot", async () => {
    const eventDate = "2026-08-01T10:00:00.000Z";
    const rows = Array.from({ length: 201 }, (_, index) => ({
      id: deterministicUuid(42, index + 1),
      title: `Open House ${index + 1}`,
      open_house_date: eventDate,
      city: "Athens",
    }));
    const requests: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (!isCatalogueQuery(url)) return jsonRows([]);
      const rpcBody = requestJson(init);
      requests.push(rpcBody);
      const anchor = typeof rpcBody.p_cursor_listing_id === "string"
        ? rpcBody.p_cursor_listing_id
        : null;
      const start = anchor ? rows.findIndex((row) => row.id === anchor) + 1 : 0;
      const limit = Number(rpcBody.p_limit ?? rows.length);
      return catalogueCardRows(rows.slice(start, start + limit), init);
    }) as unknown as typeof fetch;

    const first = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?limit=200&includeMeta=1&boundsWest=23.7&boundsSouth=37.9&boundsEast=23.8&boundsNorth=38.05",
    ));
    const firstBody = await first.json() as {
      data: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(firstBody.data).toHaveLength(200);
    expect(firstBody.data.at(-1)?.id).toBe(rows[199].id);
    expect(firstBody.hasMore).toBe(true);
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    expect(requests[0]).toMatchObject({
      p_open_house_mode: "upcoming",
      p_sort: "newest",
      p_bounds_west: 23.7,
      p_bounds_south: 37.9,
      p_bounds_east: 23.8,
      p_bounds_north: 38.05,
    });

    const second = await openHousesRequest(makeCtx(
      `https://portal.maiprop.co/api/public/open-houses?limit=200&includeMeta=1&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}&boundsWest=23.7&boundsSouth=37.9&boundsEast=23.8&boundsNorth=38.05`,
    ));
    const secondBody = await second.json() as {
      data: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(secondBody.data.map((row) => row.id)).toEqual([rows[200].id]);
    expect(secondBody.hasMore).toBe(false);
    expect(secondBody.nextCursor).toBeNull();
    expect(requests[1].p_cursor_timestamp).toBe(eventDate);
    expect(requests[1].p_cursor_listing_id).toBe(rows[199].id);
    expect(requests[1].p_publication_id).toBe(requests[0].p_publication_id);
  });

  it("reads fixture-free publication rows in one bounded query", async () => {
    const eventDate = "2026-08-01T10:00:00.000Z";
    const rows = [
      { id: deterministicUuid(43, 4), title: "Valid Open House 1", open_house_date: eventDate },
      { id: deterministicUuid(43, 5), title: "Valid Open House 2", open_house_date: eventDate },
      { id: deterministicUuid(43, 6), title: "Valid Open House 3", open_house_date: eventDate },
    ];
    const requests: Array<Record<string, unknown>> = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) {
        return cataloguePublicationRows();
      }
      if (!isCatalogueQuery(url)) return jsonRows([]);
      const rpcBody = requestJson(init);
      requests.push(rpcBody);
      const anchor = typeof rpcBody.p_cursor_listing_id === "string"
        ? rpcBody.p_cursor_listing_id
        : null;
      const start = anchor ? rows.findIndex((row) => row.id === anchor) + 1 : 0;
      const limit = Number(rpcBody.p_limit ?? rows.length);
      return catalogueCardRows(rows.slice(start, start + limit), init);
    }) as unknown as typeof fetch;

    const response = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?limit=2&includeMeta=1",
    ));
    const body = await response.json() as {
      data: Array<{ id: string }>;
      hasMore: boolean;
      nextCursor: string | null;
    };

    expect(body.data.map((row) => row.id)).toEqual([rows[0].id, rows[1].id]);
    expect(body.hasMore).toBe(true);
    expect(body.nextCursor).toEqual(expect.any(String));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({ p_limit: 3, p_offset: 0 });
  });

  it("rejects an Open House cursor reused with a different filter scope", async () => {
    const first = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?limit=1&includeMeta=1&city=Athens",
    ));
    const firstBody = await first.json() as { nextCursor: string | null };
    expect(firstBody.nextCursor).toEqual(expect.any(String));

    const second = await openHousesRequest(makeCtx(
      `https://portal.maiprop.co/api/public/open-houses?limit=1&includeMeta=1&city=Piraeus&cursor=${encodeURIComponent(firstBody.nextCursor ?? "")}`,
    ));

    expect(second.status).toBe(400);
    await expect(second.json()).resolves.toEqual({ error: "Invalid open house cursor" });
  });

  it("rejects forged Open House cursor IDs, dates, and snapshot times before querying Supabase", async () => {
    const first = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?limit=1&includeMeta=1&city=Athens",
    ));
    const firstBody = await first.json() as { nextCursor: string | null };
    expect(firstBody.nextCursor).toEqual(expect.any(String));
    const base = decodeCursorPayload(firstBody.nextCursor ?? "");
    const upstreamCalls = fetchMock().mock.calls.length;
    const candidates = [
      { ...base, id: "not-a-uuid" },
      { ...base, date: "not-an-iso-timestamp" },
      { ...base, v: 1 },
      { ...base, asOf: undefined },
      { ...base, asOf: new Date(Date.now() + 5 * 60_000).toISOString() },
      { ...base, asOf: new Date(Date.now() - 46 * 60_000).toISOString() },
    ];

    for (const candidate of candidates) {
      const response = await openHousesRequest(makeCtx(
        `https://portal.maiprop.co/api/public/open-houses?limit=1&includeMeta=1&city=Athens&cursor=${encodeURIComponent(encodeCursorPayload(candidate))}`,
      ));
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid open house cursor" });
    }
    expect(fetchMock().mock.calls).toHaveLength(upstreamCalls);
  });

  it("serves immutable Open House publications without a service credential", async () => {
    const response = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses",
      {
        requestEnv: {
          SUPABASE_PROJECT_ID: PROJECT_ID,
          SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
        },
      },
    ));

    expect(response.status).toBe(200);
    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_publication")).toHaveLength(1);
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);
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
  it("projects canonical OS identities while preserving the database listing id", () => {
    expect(projectAuctionPublicIdentity({
      id: "5a7a9000-0000-4000-8000-000000000002",
      tags: ["source:maiprop-os", "os_auction:stage-proof-os-auction"],
    })).toMatchObject({
      id: "stage-proof-os-auction",
      listing_id: "5a7a9000-0000-4000-8000-000000000002",
    });
  });

  it("keeps UUID routing for explicitly UUID-routed staging proof auctions", () => {
    expect(projectAuctionPublicIdentity({
      id: "5a7a9000-0000-4000-8000-000000000001",
      tags: [
        "source:maiprop-os",
        "os_auction:stage-proof-uuid-auction",
        "staging-auction-route:uuid",
      ],
    })).toMatchObject({
      id: "5a7a9000-0000-4000-8000-000000000001",
      listing_id: "5a7a9000-0000-4000-8000-000000000001",
    });
  });

  it.each([
    "osTag=bad%2Ftag",
    "ids=valid-id,bad%21",
    "ids=valid-id",
    "ids=",
    `ids=${deterministicUuid(87, 1)}&osTag=duplicate-identity`,
  ])("rejects malformed exact auction filters before any upstream read: %s", async (query) => {
    const response = await auctionsRequest(makeCtx(
      `https://portal.maiprop.co/api/public/auctions?${query}`,
    ));

    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Invalid exact auction filter",
    });
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it("serves cached DB auctions first, sorts deterministically, and slices to the requested limit", async () => {
    const rows = await fetchPublicAuctionRows(env, 1);
    expect(rows.map((row) => row.id)).toEqual(["db-2"]);

    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")[0]).toBeDefined();
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("keeps Spotlight visual-only when ordering auctions", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") return jsonRows([]);
      if (url.searchParams.get("p_stream") === "priority") return auctionEnvelopeRows([]);
      return auctionEnvelopeRows([
        {
          id: "spotlight-later",
          city: "Athens",
          auction_date: "2026-08-02",
          is_featured: true,
          featured_until: "2099-01-01T00:00:00.000Z",
          priority_placement: 0,
        },
        {
          id: "organic-sooner",
          city: "Athens",
          auction_date: "2026-08-01",
          is_featured: false,
          priority_placement: 0,
        },
      ]);
    }) as unknown as typeof fetch;

    const rows = await fetchPublicAuctionRows(env, 2);

    expect(rows.map((row) => row.id)).toEqual(["organic-sooner", "spotlight-later"]);
    expect(rows.find((row) => row.id === "spotlight-later")?.is_featured).toBe(true);
  });

  it("treats expired auction promotion flags as organic response state", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") return jsonRows([]);
      if (url.searchParams.get("p_stream") === "priority") return auctionEnvelopeRows([]);
      return auctionEnvelopeRows([
        {
          id: "expired-flags",
          city: "Athens",
          auction_date: "2026-08-02",
          is_featured: true,
          featured_until: "2000-01-01T00:00:00.000Z",
          priority_placement: 1,
          priority_until: "2000-01-01T00:00:00.000Z",
        },
        {
          id: "organic-sooner",
          city: "Athens",
          auction_date: "2026-08-01",
          is_featured: false,
          priority_placement: 0,
        },
      ]);
    }) as unknown as typeof fetch;

    const rows = await fetchPublicAuctionRows(env, 2);

    expect(rows.map((row) => row.id)).toEqual(["organic-sooner", "expired-flags"]);
    expect(rows.find((row) => row.id === "expired-flags")).toMatchObject({
      is_featured: false,
      priority_placement: 0,
    });
  });

  it("limits active Priority auctions to three per 12 while preserving stream order", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") return jsonRows([]);
      const priority = url.searchParams.get("p_stream") === "priority";
      const prefix = priority ? "priority" : "organic";
      const count = priority ? 5 : 12;
      return auctionEnvelopeRows(Array.from({ length: count }, (_, index) => ({
        id: `${prefix}-${String(count - index).padStart(2, "0")}`,
        city: "Athens",
        auction_date: "2026-08-01",
        is_featured: index % 2 === 0,
        featured_until: "2099-01-01T00:00:00.000Z",
        priority_placement: priority ? 1 : 0,
        priority_until: priority ? "2099-01-01T00:00:00.000Z" : null,
      })));
    }) as unknown as typeof fetch;

    const rows = await fetchPublicAuctionRows(env, 12);

    expect(rows.map((row) => row.id)).toEqual([
      "priority-01",
      "priority-02",
      "priority-03",
      "organic-01",
      "organic-02",
      "organic-03",
      "organic-04",
      "organic-05",
      "organic-06",
      "organic-07",
      "organic-08",
      "organic-09",
    ]);
    expect(rows.filter((row) => Number(row.priority_placement) > 0)).toHaveLength(3);

    const listingUrls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    const priorityUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "priority");
    const organicUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "organic");
    expect(priorityUrl?.searchParams.get("p_now")).toMatch(/T/);
    expect(organicUrl?.searchParams.get("p_now")).toMatch(/T/);
    expect(priorityUrl?.searchParams.get("p_today")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(organicUrl?.searchParams.get("p_today")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("fills a requested auction window when organic inventory is scarce", async () => {
    const priorityRows = Array.from({ length: 8 }, (_, index) => ({
      id: `priority-only-${index + 1}`,
      city: "Athens",
      auction_date: "2026-08-01",
      priority_placement: 1,
      priority_until: "2099-01-01T00:00:00.000Z",
    }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") return jsonRows([]);
      const limit = Number(url.searchParams.get("p_limit") ?? priorityRows.length);
      return url.searchParams.get("p_stream") === "priority"
        ? auctionEnvelopeRows(priorityRows.slice(0, limit))
        : auctionEnvelopeRows([]);
    }) as unknown as typeof fetch;

    const rows = await fetchPublicAuctionRows(env, 6);

    expect(rows.map((row) => row.id)).toEqual([
      "priority-only-1",
      "priority-only-2",
      "priority-only-3",
      "priority-only-4",
      "priority-only-5",
      "priority-only-6",
    ]);
    const priorityLimits = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")
      .filter((url) => url.searchParams.get("p_stream") === "priority")
      .map((url) => url.searchParams.get("p_limit"));
    expect(priorityLimits).toEqual(["600"]);
  });

  it("samples a wider cached DB window and diversifies organic auctions by municipality", async () => {
    const rowsByMunicipality = [
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
    ];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") return jsonRows([]);
      return url.searchParams.get("p_stream") === "priority"
        ? auctionEnvelopeRows([])
        : auctionEnvelopeRows(rowsByMunicipality);
    }) as unknown as typeof fetch;

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

    const listingUrls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    const priorityUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "priority");
    const organicUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "organic");
    expect(priorityUrl?.searchParams.get("p_limit")).toBe("600");
    expect(organicUrl?.searchParams.get("p_limit")).toBe("600");
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("keeps public auction reads local even when the cached DB window is municipality-clustered", async () => {
    const clusteredRows = Array.from({ length: 48 }, (_, i) => ({
        id: `cached-agrinio-${i}`,
        city: "Agrinio",
        is_featured: false,
        priority_placement: 0,
        auction_date: "2026-06-01",
      }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") return jsonRows([]);
      return url.searchParams.get("p_stream") === "priority"
        ? auctionEnvelopeRows([])
        : auctionEnvelopeRows(clusteredRows);
    }) as unknown as typeof fetch;
    const rows = await fetchPublicAuctionRows(env, 60);
    expect(rows).toHaveLength(48);
    expect(rows.every((row) => row.city === "Agrinio")).toBe(true);

    const listingUrls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    const priorityUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "priority");
    const organicUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "organic");
    expect(priorityUrl?.searchParams.get("p_limit")).toBe("600");
    expect(organicUrl?.searchParams.get("p_limit")).toBe("600");
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("falls back to source auctions when the daily cached DB window is empty", async () => {
    fetchMock()
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }))
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }));

    const rows = await fetchPublicAuctionRows(env, 2);
    expect(rows).toHaveLength(2);

    const dbCalls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    expect(dbCalls).toHaveLength(4);
    expect(dbCalls[0].searchParams.get("p_pool_tag")).toMatch(/^auction_pool:\d{4}-\d{2}-\d{2}$/);
    expect(dbCalls[1].searchParams.get("p_pool_tag")).toMatch(/^auction_pool:\d{4}-\d{2}-\d{2}$/);
    expect(dbCalls[2].searchParams.has("p_pool_tag")).toBe(false);
    expect(dbCalls[3].searchParams.has("p_pool_tag")).toBe(false);
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("returns an empty list when both local DB auction windows are empty", async () => {
    fetchMock()
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }))
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }))
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }))
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }));
    await expect(fetchPublicAuctionRows(env, 1)).resolves.toEqual([]);

    fetchMock().mockClear();
    fetchMock()
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }))
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }))
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }))
      .mockResolvedValueOnce(auctionEnvelopeRows([], { poolExists: false }));
    await expect(fetchPublicAuctionRows(env, 2)).resolves.toEqual([]);
  });

  it("queries the narrow auction RPC with bounded candidate arguments", async () => {
    await expect(fetchPublicAuctionRows(env, 1)).resolves.toMatchObject([{ id: "db-2" }]);

    const dbUrl = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")[0];
    expect(dbUrl.searchParams.get("p_stream")).toBe("priority");
    expect(dbUrl.searchParams.get("p_pool_tag")).toMatch(/^auction_pool:\d{4}-\d{2}-\d{2}$/);
    expect(dbUrl.searchParams.get("p_limit")).toBe("600");
    expect(dbUrl.searchParams.get("p_today")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(dbUrl.searchParams.get("p_now")).toMatch(/T/);
    expect(new Headers(initFor("/rest/v1/rpc/get_visible_auction_candidate_envelope").headers).get("apikey"))
      .toBe("publishable_test_key");
    expect(
      new Headers(initFor("/rest/v1/rpc/get_visible_auction_candidate_envelope").headers)
        .get("Authorization"),
    ).toBe("Bearer publishable_test_key");
  });

  it("physically aborts timed-out canonical candidate reads", async () => {
    vi.useFakeTimers();
    const candidateSignals: AbortSignal[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") return jsonRows([]);
      const signal = init?.signal;
      if (signal) candidateSignals.push(signal);
      return await new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    }) as unknown as typeof fetch;

    try {
      const pending = fetchPublicAuctionRows(env, 1);
      const rejection = expect(pending).rejects.toMatchObject({
        name: "SupabaseTransientError",
        path: "/rest/v1/rpc/get_visible_auction_candidate_envelope",
      });
      await vi.advanceTimersByTimeAsync(2_500);

      await rejection;
      expect(candidateSignals).toHaveLength(2);
      expect(candidateSignals.every((signal) => signal.aborted)).toBe(true);
      expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("ranks one canonical pool so compact auction windows are exact prefixes", async () => {
    const priorityRows = Array.from({ length: 17 }, (_, index) => ({
      id: `priority-${String(index + 1).padStart(2, "0")}`,
      city: "Athens",
      auction_date: "2026-08-01",
      priority_placement: 1,
      priority_until: "2099-01-01T00:00:00.000Z",
    }));
    const organicRows = [
      ...Array.from({ length: 180 }, (_, index) => ({
        id: `a-athens-${String(index + 1).padStart(3, "0")}`,
        city: "Athens",
        auction_date: "2026-08-01",
        priority_placement: 0,
        priority_until: null,
      })),
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `z-larissa-${String(index + 1).padStart(3, "0")}`,
        city: "Larissa",
        auction_date: "2026-08-01",
        priority_placement: 0,
        priority_until: null,
      })),
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `z-patras-${String(index + 1).padStart(3, "0")}`,
        city: "Patras",
        auction_date: "2026-08-01",
        priority_placement: 0,
        priority_until: null,
      })),
    ];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      const limit = Number(url.searchParams.get("p_limit") ?? 600);
      return url.searchParams.get("p_stream") === "priority"
        ? auctionEnvelopeRows(priorityRows.slice(0, limit))
        : auctionEnvelopeRows(organicRows.slice(0, limit));
    }) as unknown as typeof fetch;

    const compact = await fetchPublicAuctionRows(env, 6);
    const canonical = await fetchPublicAuctionRows(env, 60);

    expect(compact.map((row) => row.id)).toEqual(
      canonical.slice(0, 6).map((row) => row.id),
    );
    const requestedLimits = fetchUrls(
      "/rest/v1/rpc/get_visible_auction_candidate_envelope",
    ).map((url) => url.searchParams.get("p_limit"));
    expect(new Set(requestedLimits)).toEqual(new Set(["600"]));
  });

  it("keeps the homepage prefix identical to the paginated catalogue for the same revision", async () => {
    const priorityRows = Array.from({ length: 30 }, (_, index) => ({
      id: `shared-priority-${String(index + 1).padStart(3, "0")}`,
      city: "Athens",
      auction_date: "2026-08-01",
      priority_placement: 1,
      priority_until: "2099-01-01T00:00:00.000Z",
    }));
    const organicRows = [
      ...Array.from({ length: 180 }, (_, index) => ({
        id: `shared-athens-${String(index + 1).padStart(3, "0")}`,
        city: "Athens",
        auction_date: "2026-08-01",
        priority_placement: 0,
      })),
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `shared-larissa-${String(index + 1).padStart(3, "0")}`,
        city: "Larissa",
        auction_date: "2026-08-01",
        priority_placement: 0,
      })),
      ...Array.from({ length: 60 }, (_, index) => ({
        id: `shared-patras-${String(index + 1).padStart(3, "0")}`,
        city: "Patras",
        auction_date: "2026-08-01",
        priority_placement: 0,
      })),
    ];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      const limit = Number(url.searchParams.get("p_limit") ?? 600);
      return url.searchParams.get("p_stream") === "priority"
        ? auctionEnvelopeRows(priorityRows.slice(0, limit))
        : auctionEnvelopeRows(organicRows.slice(0, limit));
    }) as unknown as typeof fetch;

    const homepageRows = await fetchPublicAuctionRows(env, 60);
    const catalogueResponse = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=60&page=1&pageSize=60",
    ));
    const catalogue = await catalogueResponse.json() as {
      data: AuctionRowForTest[];
      revision: string;
    };

    expect(catalogue.revision).toMatch(/^auction_pool:\d{4}-\d{2}-\d{2}$/);
    expect(catalogue.data.map((row) => row.id)).toEqual(
      homepageRows.map((row) => row.id),
    );
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("clamps public auction requests and caches by day", async () => {
    const res = await auctionsRequest(makeCtx("https://portal.maiprop.co/api/public/auctions?limit=999"));
    const body = await res.json() as { data: unknown[] };
    expect(body.data).toHaveLength(2);

    const listingUrls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    const priorityUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "priority");
    const organicUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "organic");
    expect(priorityUrl?.searchParams.get("p_limit")).toBe("600");
    expect(organicUrl?.searchParams.get("p_limit")).toBe("600");
    expect(cacheApi.match).toHaveBeenCalled();
    expect(cacheApi.put).toHaveBeenCalledTimes(2);
    const cacheKey = new URL(cacheApi.put.mock.calls[0][0].url);
    expect(cacheKey.searchParams.get("limit")).toBe("60");
    expect(cacheKey.searchParams.has("day")).toBe(true);
    expect(cacheKey.searchParams.get("v")).toBe("canonical-server-filtered-v15");
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=30, stale-while-revalidate=60");
    expect(res.headers.get("CDN-Cache-Control")).toBe("no-store");
    const staleSeed = cacheApi.put.mock.calls.find(([request]) =>
      new URL((request as Request).url).searchParams.get("__maiprop_stale") === "1"
    );
    expect((staleSeed?.[1] as Response | undefined)?.headers.get("Cache-Control")).toBe(
      "public, max-age=120",
    );
  });

  it.each([
    "Bearer low-limit-token",
    "Bearer",
  ])("bypasses shared cache for low-limit bearer presence: %s", async (authorization) => {
    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=12",
      { headers: { Authorization: authorization } },
    ));

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(response.headers.get("Vary")).toContain("Authorization");
    expect(cacheApi.match).not.toHaveBeenCalled();
    expect(cacheApi.put).not.toHaveBeenCalled();
  });

  it("defaults omitted auction limits to the first-paint window", async () => {
    const res = await auctionsRequest(makeCtx("https://portal.maiprop.co/api/public/auctions"));
    expect(res.status).toBe(200);

    const listingUrls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    const priorityUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "priority");
    const organicUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "organic");
    expect(priorityUrl?.searchParams.get("p_limit")).toBe("600");
    expect(organicUrl?.searchParams.get("p_limit")).toBe("600");

    const cacheKey = new URL(cacheApi.put.mock.calls[0][0].url);
    expect(cacheKey.searchParams.get("limit")).toBe("60");
  });

  it("forwards every canonical filter to the bounded database scan before the visible cap", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_current_auction_listing_visible_limit") {
        expect(requestJson(init)).toEqual({});
        return new Response("600", { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        const expectedParams = {
          p_city: "Athens",
          p_property_base: "commercial",
          p_property_subtype: "office",
          p_bid_min: "100000",
          p_bid_max: "200000",
          p_year_min: "1990",
          p_year_max: "2010",
          p_sqm_min: "80",
          p_sqm_max: "120",
          p_ownership: "common",
          p_round: "3plus",
          p_yield: "high",
        };
        const hasAllFilters = Object.entries(expectedParams).every(
          ([key, value]) => url.searchParams.get(key) === value,
        );
        if (!hasAllFilters || url.searchParams.get("p_stream") === "priority") {
          return auctionEnvelopeRows([], { poolExists: true });
        }
        return auctionEnvelopeRows([{
          id: "match-beyond-old-60-row-prefix",
          city: "Athens",
          property_type: "commercial",
          auction_date: "2026-08-01",
          auction_starting_bid: 150_000,
          year_built: 2000,
          sqm: 100,
          priority_placement: 0,
          tags: ["commercial_type:office", "ownership:common", "round:3"],
        }]);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions" +
        "?limit=600&page=1&pageSize=60&city=Athens&propertyType=commercial:office" +
        "&bidRange=100000-200000&yearRange=1990-2010&sqmRange=80-120" +
        "&ownership=common&round=3plus&yield=high",
      { headers: { Authorization: "Bearer paid-user-token" } },
    ));
    const body = await response.json() as { data: AuctionRowForTest[]; total: number };

    expect(response.status).toBe(200);
    expect(body.total).toBe(1);
    expect(body.data.map((row) => row.id)).toEqual(["match-beyond-old-60-row-prefix"]);
    const candidateUrls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    expect(candidateUrls).toHaveLength(2);
    expect(candidateUrls.every((url) => url.searchParams.get("p_limit") === "600")).toBe(true);
  });

  it("does not fall back outside today's scheduled pool when filters match zero scheduled rows", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([{
          pool_exists: url.searchParams.has("p_pool_tag"),
          total_raw: 0,
          facet_cities: ["Patras"],
          facet_rounds: [2],
          visible_rows: [],
        }]);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?city=Athens&propertyType=villa",
    ));
    const body = await response.json() as {
      data: AuctionRowForTest[];
      totalRaw: number;
      facets: { cities: string[]; rounds: number[] };
    };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
    expect(body.totalRaw).toBe(0);
    expect(body.facets).toEqual({ cities: ["Patras"], rounds: [2] });
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")).toHaveLength(2);
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")
      .every((url) => url.searchParams.has("p_pool_tag"))).toBe(true);
  });

  it("uses full bounded-pool metadata when the visible filtered rows are entitlement-capped", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      const priorityRows = Array.from({ length: 5 }, (_, index) => ({
        id: `visible-priority-${String(index + 1).padStart(3, "0")}`,
        city: "Athens",
        property_type: "villa",
        auction_date: "2026-08-01",
        priority_placement: 1,
        priority_until: "2099-01-01T00:00:00.000Z",
        tags: ["round:2"],
      }));
      const organicRows = Array.from({ length: 55 }, (_, index) => ({
        id: `visible-organic-${String(index + 1).padStart(3, "0")}`,
        city: "Athens",
        property_type: "villa",
        auction_date: "2026-08-02",
        priority_placement: 0,
        tags: ["round:2"],
      }));
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return url.searchParams.get("p_stream") === "priority"
          ? jsonRows([{
            pool_exists: true,
            total_raw: 5,
            facet_cities: ["Athens", "Larissa"],
            facet_rounds: [2, 4],
            visible_rows: priorityRows,
          }])
          : jsonRows([{
            pool_exists: true,
            total_raw: 120,
            facet_cities: ["Athens", "Patras"],
            facet_rounds: [2, 4],
            visible_rows: organicRows,
          }]);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=60&propertyType=villa&page=3&pageSize=20",
    ));
    const body = await response.json() as {
      data: AuctionRowForTest[];
      total: number;
      totalRaw: number;
      totalPages: number;
      facets: { cities: string[]; rounds: number[] };
    };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(20);
    expect(body.data.every((row) => (row as { city?: string }).city === "Athens")).toBe(true);
    expect(body.totalRaw).toBe(125);
    expect(body.total).toBe(60);
    expect(body.totalPages).toBe(3);
    expect(body.facets).toEqual({
      cities: ["Athens", "Larissa", "Patras"],
      rounds: [2, 4],
    });
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")).toHaveLength(2);
  });

  it("preserves full metadata on the non-canonical first-paint route without disclosing extra rows", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      const priority = url.searchParams.get("p_stream") === "priority";
      const visibleRows = Array.from({ length: priority ? 5 : 55 }, (_, index) => ({
        id: `${priority ? "first-paint-priority" : "first-paint-organic"}-${index + 1}`,
        city: "Athens",
        auction_date: priority ? "2026-08-01" : "2026-08-02",
        priority_placement: priority ? 1 : 0,
        priority_until: priority ? "2099-01-01T00:00:00.000Z" : null,
        tags: ["round:2"],
      }));
      return auctionEnvelopeRows(visibleRows, {
        poolExists: true,
        totalRaw: priority ? 5 : 120,
        facetCities: priority ? ["Athens", "Larissa"] : ["Athens", "Patras"],
        facetRounds: priority ? [2, 4] : [2, 4],
      });
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=60",
    ));
    const body = await response.json() as {
      data: AuctionRowForTest[];
      total: number;
      totalRaw: number;
      facets: { cities: string[]; rounds: number[] };
    };

    expect(response.status).toBe(200);
    expect(body.data).toHaveLength(60);
    expect(body.total).toBe(60);
    expect(body.totalRaw).toBe(125);
    expect(body.facets).toEqual({
      cities: ["Athens", "Larissa", "Patras"],
      rounds: [2, 4],
    });
    expect(body.data.every((row) => (row as { city?: string }).city === "Athens")).toBe(true);
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")).toHaveLength(2);
  });

  it("starts both bounded stream reads before awaiting either response", async () => {
    const started: Array<"priority" | "organic"> = [];
    const releases = new Map<"priority" | "organic", (response: Response) => void>();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      const stream = url.searchParams.get("p_stream") as "priority" | "organic";
      started.push(stream);
      return await new Promise<Response>((resolve) => releases.set(stream, resolve));
    }) as unknown as typeof fetch;

    let settled = false;
    const pending = fetchPublicAuctionRows(env, 2).finally(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(new Set(started)).toEqual(new Set(["priority", "organic"])));
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")).toHaveLength(2);

    releases.get("priority")?.(auctionEnvelopeRows([{
      id: "concurrent-priority",
      city: "Athens",
      auction_date: "2026-08-01",
      priority_placement: 1,
      priority_until: "2099-01-01T00:00:00.000Z",
    }]));
    await Promise.resolve();
    expect(settled).toBe(false);

    releases.get("organic")?.(auctionEnvelopeRows([{
      id: "concurrent-organic",
      city: "Athens",
      auction_date: "2026-08-02",
      priority_placement: 0,
    }]));
    await expect(pending).resolves.toHaveLength(2);
  });

  it.each([
    {
      label: "missing envelope row",
      payload: [],
    },
    {
      label: "metadata on a missing pool",
      payload: [{
        pool_exists: false,
        total_raw: 0,
        facet_cities: ["Athens"],
        facet_rounds: [],
        visible_rows: [],
      }],
    },
    {
      label: "more visible rows than total_raw",
      payload: [{
        pool_exists: true,
        total_raw: 0,
        facet_cities: [],
        facet_rounds: [],
        visible_rows: [{ id: "over-disclosed" }],
      }],
    },
  ])("fails closed with 503 for a malformed auction envelope: $label", async ({ payload }) => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      return url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope"
        ? jsonRows(payload)
        : jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=60",
    ));

    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
    expect(cacheApi.put).not.toHaveBeenCalled();
  });

  it("ignores a decimal construction-year range instead of sending decimals to INTEGER RPC parameters", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      expect(url.searchParams.has("p_year_min")).toBe(false);
      expect(url.searchParams.has("p_year_max")).toBe(false);
      return url.searchParams.get("p_stream") === "priority"
        ? auctionEnvelopeRows([])
        : auctionEnvelopeRows([{
          id: "decimal-year-filter-ignored",
          city: "Athens",
          year_built: 1980,
          auction_date: "2026-08-01",
          priority_placement: 0,
        }]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?yearRange=1990.5-2010",
    ));
    const body = await response.json() as { data: AuctionRowForTest[] };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual(["decimal-year-filter-ignored"]);
  });

  it("matches SQL yield normalization for decomposed Greek city text", async () => {
    const decomposedAthens = "αθη\u0301να";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_current_auction_listing_visible_limit") {
        expect(requestJson(init)).toEqual({});
        return new Response("600", { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return url.searchParams.get("p_stream") === "priority"
          ? auctionEnvelopeRows([])
          : auctionEnvelopeRows([{
            id: "decomposed-greek-city",
            city: decomposedAthens,
            auction_date: "2026-08-01",
            auction_starting_bid: 100_000,
            sqm: 100,
            priority_placement: 0,
          }]);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=600&yield=high",
      { headers: { Authorization: "Bearer paid-user-token" } },
    ));
    const body = await response.json() as { data: AuctionRowForTest[] };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual(["decomposed-greek-city"]);
  });

  it("treats auction round tags as positive integers in the TypeScript defense layer", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_current_auction_listing_visible_limit") {
        expect(requestJson(init)).toEqual({});
        return new Response("600", { headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return url.searchParams.get("p_stream") === "priority"
          ? auctionEnvelopeRows([])
          : auctionEnvelopeRows([{
            id: "decimal-round",
            city: "Athens",
            auction_date: "2026-08-01",
            priority_placement: 0,
            tags: ["round:2.5"],
          }], { totalRaw: 1, facetRounds: [] });
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=600&round=2",
      { headers: { Authorization: "Bearer paid-user-token" } },
    ));
    const body = await response.json() as { data: AuctionRowForTest[] };

    expect(response.status).toBe(200);
    expect(body.data).toEqual([]);
  });

  it("excludes auctions with an unknown construction year when a year filter is active", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      if (url.searchParams.get("p_stream") === "priority") return auctionEnvelopeRows([]);
      return auctionEnvelopeRows([
        {
          id: "unknown-year",
          city: "Athens",
          property_type: "apartment",
          auction_date: "2026-08-01",
          auction_starting_bid: 100_000,
          year_built: null,
          priority_placement: 0,
        },
        {
          id: "known-year",
          city: "Athens",
          property_type: "apartment",
          auction_date: "2026-08-02",
          auction_starting_bid: 110_000,
          year_built: 1990,
          priority_placement: 0,
        },
      ]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?yearRange=0-2200",
    ));
    const body = await response.json() as { data: AuctionRowForTest[] };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual(["known-year"]);
  });

  it("filters the complete canonical DB pool before applying the anonymous cap and pagination", async () => {
    const organicRows = [
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `apartment-${String(index + 1).padStart(3, "0")}`,
        city: "Athens",
        property_type: "apartment",
        auction_date: "2026-08-01",
        auction_starting_bid: 100_000,
        priority_placement: 0,
      })),
      ...Array.from({ length: 25 }, (_, index) => ({
        id: `villa-${String(index + 1).padStart(3, "0")}`,
        city: "Athens",
        property_type: "villa",
        auction_date: "2026-08-01",
        auction_starting_bid: 120_000,
        priority_placement: 0,
      })),
    ];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      if (url.searchParams.get("p_stream") === "priority") {
        return auctionEnvelopeRows([]);
      }
      const visibleRows = organicRows.filter((row) => row.property_type === "villa");
      return auctionEnvelopeRows(visibleRows, {
        poolExists: true,
        totalRaw: visibleRows.length,
        facetCities: ["Athens"],
      });
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=60&propertyType=villa&page=2&pageSize=10",
    ));
    const body = await response.json() as {
      data: AuctionRowForTest[];
      revision: string;
      page: number;
      pageSize: number;
      total: number;
      totalRaw: number;
      totalPages: number;
      facets: { cities: string[] };
      stats: { mappableCount: number };
    };

    expect(response.status).toBe(200);
    expect(body.revision).toMatch(/^auction_pool:\d{4}-\d{2}-\d{2}$/);
    expect(body.page).toBe(2);
    expect(body.pageSize).toBe(10);
    expect(body.totalRaw).toBe(25);
    expect(body.total).toBe(25);
    expect(body.totalPages).toBe(3);
    expect(body.data.map((row) => row.id)).toEqual(
      Array.from({ length: 10 }, (_, index) => `villa-${String(index + 11).padStart(3, "0")}`),
    );
    expect(body.facets.cities).toEqual(["Athens"]);
    expect(body.stats.mappableCount).toBe(0);
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")
      .map((url) => url.searchParams.get("p_limit"))).toEqual(["600", "600"]);
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("resolves an exact OS tag through the indexed snapshot reader without scanning the 600-row streams", async () => {
    const listingId = deterministicUuid(88, 1);
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) return cataloguePublicationRows();
      if (isCatalogueAuctionExact(url)) {
        return jsonRows([{
          publication_id: PUBLICATION_ID,
          published_at: publicationTimestamp(),
          listing_id: listingId,
          detail_payload: {
            id: listingId,
            listing_type: "auction",
            city: "Athens",
            tags: ["os_auction:external-999"],
            auction_date: "2026-08-02",
            priority_placement: 0,
          },
        }]);
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        throw new Error("exact lookup must not scan bounded auction streams");
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=60&page=1&pageSize=1&osTag=external-999",
    ));
    const body = await response.json() as {
      data: AuctionRowForTest[];
      total: number;
      revision: string;
    };

    expect(body.data).toMatchObject([{ id: "external-999", listing_id: listingId }]);
    expect(body.total).toBe(1);
    expect(body.revision).toMatch(/^auction_pool:\d{4}-\d{2}-\d{2}$/);
    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_auctions")).toEqual({
      p_publication_id: PUBLICATION_ID,
      p_listing_ids: null,
      p_os_tag: "external-999",
    });
    expect(response.headers.get("X-Maiprop-Cache-Valid-Until"))
      .toBe(cataloguePublicationMetadata().retain_until);
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")).toHaveLength(0);
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it("resolves exact auction IDs through the indexed snapshot reader", async () => {
    const listingId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) return cataloguePublicationRows();
      if (isCatalogueAuctionExact(url)) {
        const body = requestJson(init);
        return jsonRows([{
          publication_id: Number(body.p_publication_id),
          published_at: publicationTimestamp(),
          listing_id: listingId,
          detail_payload: {
            id: listingId,
            listing_type: "auction",
            tags: ["os_auction:id-reader"],
            auction_date: "2026-08-03",
          },
        }]);
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        throw new Error("exact lookup must not scan bounded auction streams");
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      `https://portal.maiprop.co/api/public/auctions?limit=60&page=1&pageSize=1&ids=${listingId.toUpperCase()}`,
    ));
    const body = await response.json() as { data: AuctionRowForTest[] };

    expect(response.status).toBe(200);
    expect(body.data.map((row) => row.id)).toEqual([listingId]);
    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_auctions")).toEqual({
      p_publication_id: PUBLICATION_ID,
      p_listing_ids: [listingId],
      p_os_tag: null,
    });
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")).toHaveLength(0);
  });

  it("fails closed when an exact OS tag resolves more than one auction", async () => {
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (isCataloguePublication(url)) return cataloguePublicationRows();
      if (isCatalogueAuctionExact(url)) {
        return new Response(JSON.stringify({
          code: "23505",
          message: "public_catalogue_duplicate_os_tag",
        }), {
          status: 409,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        throw new Error("duplicate exact lookup must fail at the snapshot reader");
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?page=1&pageSize=1&osTag=duplicate-os",
    ));

    expect(response.status).toBe(502);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      error: "Auction catalogue identity mismatch",
    });
    expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")).toHaveLength(0);
  });

  it("returns identical IDs and order for the same canonical revision", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-28T08:00:00.000Z"));
    const organicRows = Array.from({ length: 30 }, (_, index) => ({
      id: `stable-${String(index + 1).padStart(3, "0")}`,
      city: ["Athens", "Patras", "Larissa"][index % 3],
      auction_date: "2026-08-01",
      priority_placement: 0,
    }));
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = new URL(String(input));
      if (url.pathname !== "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return jsonRows([]);
      }
      return url.searchParams.get("p_stream") === "priority"
        ? auctionEnvelopeRows([{
          id: "promoted-until-noon",
          city: "Athens",
          auction_date: "2026-08-02",
          priority_placement: 1,
          priority_until: "2026-07-28T12:00:00.000Z",
        }])
        : auctionEnvelopeRows(organicRows);
    }) as unknown as typeof fetch;

    try {
      const first = await auctionsRequest(makeCtx(
        "https://portal.maiprop.co/api/public/auctions?limit=60&page=1&pageSize=20",
      ));
      const firstBody = await first.json() as { data: AuctionRowForTest[]; revision: string };
      vi.setSystemTime(new Date("2026-07-28T16:00:00.000Z"));
      const second = await auctionsRequest(makeCtx(
        `https://portal.maiprop.co/api/public/auctions?limit=60&page=1&pageSize=20&revision=${encodeURIComponent(firstBody.revision)}`,
      ));
      const secondBody = await second.json() as { data: AuctionRowForTest[]; revision: string };

      expect(second.status).toBe(200);
      expect(secondBody.revision).toBe(firstBody.revision);
      expect(secondBody.data.map((row) => row.id)).toEqual(firstBody.data.map((row) => row.id));
      expect(firstBody.data[0]?.id).toBe("promoted-until-noon");
      expect(fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope")
        .map((url) => url.searchParams.get("p_now")))
        .toEqual(Array(4).fill("2026-07-28T00:00:00.000Z"));

      const stale = await auctionsRequest(makeCtx(
        "https://portal.maiprop.co/api/public/auctions?limit=60&page=1&pageSize=20&revision=auction_pool:2000-01-01",
      ));
      expect(stale.status).toBe(409);
      expect(stale.headers.get("Cache-Control")).toBe("no-store");
      expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("validates a paid caller and forwards its bearer token to entitlement and candidates", async () => {
    const organicRows = Array.from({ length: 100 }, (_, index) => ({
      id: `paid-${String(index + 1).padStart(3, "0")}`,
      city: "Athens",
      auction_date: "2026-08-01",
      priority_placement: 0,
    }));
    const candidateHeaders: Headers[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        const headers = new Headers(init?.headers);
        expect(headers.get("apikey")).toBe("publishable_test_key");
        expect(headers.get("Authorization")).toBe("Bearer paid-user-token");
        return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_current_auction_listing_visible_limit") {
        const headers = new Headers(init?.headers);
        expect(headers.get("apikey")).toBe("publishable_test_key");
        expect(headers.get("Authorization")).toBe("Bearer paid-user-token");
        expect(requestJson(init)).toEqual({});
        return new Response("600", {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        candidateHeaders.push(new Headers(init?.headers));
        return url.searchParams.get("p_stream") === "priority"
          ? auctionEnvelopeRows([])
          : auctionEnvelopeRows(organicRows);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const expanded = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=600&page=4&pageSize=20",
      {
        headers: { Authorization: "Bearer paid-user-token" },
        requestEnv: {
          SUPABASE_URL: `https://${PROJECT_ID}.supabase.co`,
          SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
        },
      },
    ));
    const expandedBody = await expanded.json() as {
      data: AuctionRowForTest[];
      total: number;
      totalRaw: number;
    };

    expect(expanded.status).toBe(200);
    expect(expandedBody.data).toHaveLength(20);
    expect(expandedBody.totalRaw).toBe(100);
    expect(expandedBody.total).toBe(100);
    expect(expanded.headers.get("Cache-Control")).toBe("private, no-store");
    expect(expanded.headers.get("Vary")).toContain("Authorization");
    expect(cacheApi.match).not.toHaveBeenCalled();
    expect(cacheApi.put).not.toHaveBeenCalled();
    expect(candidateHeaders).toHaveLength(2);
    expect(candidateHeaders.every((headers) => headers.get("apikey") === "publishable_test_key"))
      .toBe(true);
    expect(candidateHeaders.every((headers) =>
      headers.get("Authorization") === "Bearer paid-user-token"
    )).toBe(true);
    expect(candidateHeaders.some((headers) =>
      headers.get("Authorization")?.includes("service_role_test_key")
    )).toBe(false);
    expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
  });

  it.each([
    { label: "missing", headers: undefined },
    { label: "invalid", headers: { Authorization: "Bearer invalid-user-token" } },
  ])("keeps a $label caller at the anonymous 60-row limit", async ({ headers }) => {
    const candidateHeaders: Headers[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        return jsonRows([], { status: 401 });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        candidateHeaders.push(new Headers(init?.headers));
        const rows = Array.from({ length: 80 }, (_, index) => ({
          id: `anonymous-${String(index + 1).padStart(3, "0")}`,
          city: "Athens",
          auction_date: "2026-08-01",
          priority_placement: 0,
        }));
        return url.searchParams.get("p_stream") === "priority"
          ? auctionEnvelopeRows([])
          : auctionEnvelopeRows(rows.slice(0, 60), { totalRaw: rows.length });
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=600&page=1&pageSize=60",
      {
        headers,
        requestEnv: {
          SUPABASE_URL: `https://${PROJECT_ID}.supabase.co`,
          SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
        },
      },
    ));
    const body = await response.json() as { data: AuctionRowForTest[]; total: number };

    expect(response.status).toBe(200);
    expect(body.total).toBe(60);
    expect(body.data).toHaveLength(60);
    expect(candidateHeaders).toHaveLength(2);
    expect(candidateHeaders.every((candidateHeader) =>
      candidateHeader.get("Authorization") === "Bearer publishable_test_key"
    )).toBe(true);
    if (headers) {
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(cacheApi.match).not.toHaveBeenCalled();
      expect(cacheApi.put).not.toHaveBeenCalled();
    } else {
      expect(response.headers.get("Cache-Control")).toContain("public");
      expect(cacheApi.match).toHaveBeenCalled();
      expect(cacheApi.put).toHaveBeenCalled();
    }
  });

  it("keeps the subordinate DB timeout active through candidate response-body reads", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return delayedJsonBody([{
          pool_exists: true,
          total_raw: 1,
          facet_cities: ["Athens"],
          facet_rounds: [],
          visible_rows: [{
            id: "late-body-row",
            city: "Athens",
            auction_date: "2026-08-01",
            priority_placement: 0,
          }],
        }], 6_000, init?.signal);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    let settledResponse: Response | undefined;
    let settledError: unknown;
    const tracked = Promise.resolve(auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=12",
      { headers: { Authorization: "Bearer body-timeout-token" } },
    ))).then(
      (response) => {
        settledResponse = response;
        return response;
      },
      (error: unknown) => {
        settledError = error;
        throw error;
      },
    );

    try {
      await vi.advanceTimersByTimeAsync(2_500);
      await Promise.resolve();
      expect(settledError).toBeUndefined();
      expect(settledResponse).toBeDefined();
      const response = await tracked;
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    } finally {
      if (!settledResponse && settledError === undefined) {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      await tracked.catch(() => undefined);
      vi.useRealTimers();
    }
  });

  it("maps an exact-publication body timeout to a private upstream response", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/rpc/get_public_catalogue_publication") {
        return delayedJsonBody([], 6_000, init?.signal);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    let settledResponse: Response | undefined;
    let settledError: unknown;
    const listingId = "abcdefab-cdef-4abc-8def-abcdefabcdef";
    const tracked = Promise.resolve(auctionsRequest(makeCtx(
      `https://portal.maiprop.co/api/public/auctions?limit=12&ids=${listingId}`,
      { headers: { Authorization: "Bearer exact-body-timeout-token" } },
    ))).then(
      (response) => {
        settledResponse = response;
        return response;
      },
      (error: unknown) => {
        settledError = error;
        throw error;
      },
    );

    try {
      await vi.advanceTimersByTimeAsync(2_500);
      await Promise.resolve();
      expect(settledError).toBeUndefined();
      expect(settledResponse).toBeDefined();
      const response = await tracked;
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
      expect(cacheApi.match).not.toHaveBeenCalled();
      expect(cacheApi.put).not.toHaveBeenCalled();
    } finally {
      if (!settledResponse && settledError === undefined) {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      await tracked.catch(() => undefined);
      vi.useRealTimers();
    }
  });

  it("keeps a validated caller private when entitlement falls back to 60", async () => {
    const candidateHeaders: Headers[] = [];
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        return new Response(JSON.stringify({ id: "00000000-0000-4000-8000-000000000001" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_current_auction_listing_visible_limit") {
        return jsonRows([], { status: 503 });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        candidateHeaders.push(new Headers(init?.headers));
        const rows = Array.from({ length: 80 }, (_, index) => ({
          id: `fallback-${String(index + 1).padStart(3, "0")}`,
          city: "Athens",
          auction_date: "2026-08-01",
          priority_placement: 0,
        }));
        return url.searchParams.get("p_stream") === "priority"
          ? auctionEnvelopeRows([])
          : auctionEnvelopeRows(rows.slice(0, 60), { totalRaw: rows.length });
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    const response = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=600&page=1&pageSize=60",
      {
        headers: { Authorization: "Bearer paid-user-token" },
        requestEnv: {
          SUPABASE_URL: `https://${PROJECT_ID}.supabase.co`,
          SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
        },
      },
    ));
    const body = await response.json() as { data: AuctionRowForTest[]; total: number };

    expect(body.total).toBe(60);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(cacheApi.match).not.toHaveBeenCalled();
    expect(cacheApi.put).not.toHaveBeenCalled();
    expect(candidateHeaders.every((candidateHeader) =>
      candidateHeader.get("Authorization") === "Bearer paid-user-token"
    )).toBe(true);
  });

  it("aborts a timed-out entitlement fetch and fails closed to the anonymous DB window", async () => {
    vi.useFakeTimers();
    let authSignal: AbortSignal | undefined;
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        authSignal = init?.signal ?? undefined;
        return await new Promise<Response>((_resolve, reject) => {
          authSignal?.addEventListener("abort", () => {
            reject(new DOMException("Aborted", "AbortError"));
          }, { once: true });
        });
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        const rows = Array.from({ length: 80 }, (_, index) => ({
          id: `timeout-${String(index + 1).padStart(3, "0")}`,
          city: "Athens",
          auction_date: "2026-08-01",
          priority_placement: 0,
        }));
        return url.searchParams.get("p_stream") === "priority"
          ? auctionEnvelopeRows([])
          : auctionEnvelopeRows(rows.slice(0, 60), { totalRaw: rows.length });
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    try {
      const pending = auctionsRequest(makeCtx(
        "https://portal.maiprop.co/api/public/auctions?limit=600&page=1&pageSize=60",
        { headers: { Authorization: "Bearer slow-token" } },
      ));
      await vi.advanceTimersByTimeAsync(2_500);
      const response = await pending;
      const body = await response.json() as { data: AuctionRowForTest[]; total: number };

      expect(authSignal?.aborted).toBe(true);
      expect(body.total).toBe(60);
      expect(body.data).toHaveLength(60);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(cacheApi.match).not.toHaveBeenCalled();
      expect(cacheApi.put).not.toHaveBeenCalled();
      expect(fetchUrls("/functions/v1/fetch-os-auctions")).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns 503 instead of falling back to empty auctions on transient upstream failure", async () => {
    fetchMock().mockResolvedValue(new Response("cloudflare timeout", { status: 522 }));

    const res = await auctionsRequest(makeCtx("https://portal.maiprop.co/api/public/auctions?limit=12"));

    expect(res.status).toBe(503);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({ error: "Supabase upstream unavailable" });
    expect(cacheApi.put).not.toHaveBeenCalled();
  });

  it("serves auctions with only the public runtime and never sends a service-role bearer", async () => {
    const res = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=6",
      {
        requestEnv: {
          SUPABASE_URL: `https://${PROJECT_ID}.supabase.co`,
          SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
        },
      },
    ));

    expect(res.status).toBe(200);
    const candidateCalls = fetchMock().mock.calls.filter(([input]) =>
      new URL(String(input)).pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope"
    );
    expect(candidateCalls).toHaveLength(2);
    for (const [, init] of candidateCalls) {
      const headers = new Headers((init as RequestInit | undefined)?.headers);
      expect(headers.get("apikey")).toBe("publishable_test_key");
      expect(headers.get("Authorization")).toBe("Bearer publishable_test_key");
      expect(headers.get("Authorization")).not.toContain("service_role_test_key");
    }
  });

  it("applies one aggregate deadline across auth bodies, entitlement, and candidate bodies", async () => {
    vi.useFakeTimers();
    globalThis.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = new URL(String(input));
      if (url.pathname === "/auth/v1/user") {
        return delayedJsonBody(
          { id: "00000000-0000-4000-8000-000000000001" },
          2_000,
          init?.signal,
        );
      }
      if (url.pathname === "/rest/v1/rpc/get_current_auction_listing_visible_limit") {
        return delayedJsonBody(600, 2_000, init?.signal);
      }
      if (url.pathname === "/rest/v1/rpc/get_visible_auction_candidate_envelope") {
        return delayedJsonBody([{
          pool_exists: true,
          total_raw: 1,
          facet_cities: ["Athens"],
          facet_rounds: [],
          visible_rows: [{
            id: "aggregate-late-row",
            city: "Athens",
            auction_date: "2026-08-01",
            priority_placement: 0,
          }],
        }], 2_000, init?.signal);
      }
      return jsonRows([]);
    }) as unknown as typeof fetch;

    let settledResponse: Response | undefined;
    let settledError: unknown;
    const tracked = Promise.resolve(auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=600&page=1&pageSize=60",
      { headers: { Authorization: "Bearer aggregate-timeout-token" } },
    ))).then(
      (response) => {
        settledResponse = response;
        return response;
      },
      (error: unknown) => {
        settledError = error;
        throw error;
      },
    );

    try {
      await vi.advanceTimersByTimeAsync(5_000);
      await Promise.resolve();
      expect(settledError).toBeUndefined();
      expect(settledResponse).toBeDefined();
      const response = await tracked;
      expect(response.status).toBe(503);
      expect(response.headers.get("Cache-Control")).toBe("private, no-store");
      expect(response.headers.get("CDN-Cache-Control")).toBe("no-store");
      expect(cacheApi.match).not.toHaveBeenCalled();
      expect(cacheApi.put).not.toHaveBeenCalled();
    } finally {
      if (!settledResponse && settledError === undefined) {
        await vi.advanceTimersByTimeAsync(10_000);
      }
      await tracked.catch(() => undefined);
      vi.useRealTimers();
    }
  });

  it("returns the existing 503 contract when the public runtime is absent", async () => {
    const res = await auctionsRequest(makeCtx(
      "https://portal.maiprop.co/api/public/auctions?limit=6",
      {
        requestEnv: {
          SUPABASE_PROJECT_ID: PROJECT_ID,
          SUPABASE_SERVICE_ROLE_KEY: "service_role_test_key",
        },
      },
    ));

    expect(res.status).toBe(503);
    expect(fetchMock()).not.toHaveBeenCalled();
    await expect(res.json()).resolves.toEqual({
      error: "Supabase runtime is not configured",
    });
  });
});

describe("public homepage endpoint", () => {
  it("rejects invalid sections without caching and delegates auctions to the bounded public auction handler", async () => {
    const invalid = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=invalid"));
    expect(invalid.status).toBe(400);
    expect(invalid.headers.get("Cache-Control")).toBe("no-store");

    await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=auctions"));
    const listingUrls = fetchUrls("/rest/v1/rpc/get_visible_auction_candidate_envelope");
    const priorityUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "priority");
    const organicUrl = listingUrls.find((url) => url.searchParams.get("p_stream") === "organic");
    expect(priorityUrl?.searchParams.get("p_limit")).toBe("600");
    expect(organicUrl?.searchParams.get("p_limit")).toBe("600");
    expect(new Headers(initFor("/rest/v1/rpc/get_visible_auction_candidate_envelope").headers)
      .get("Authorization")).toBe("Bearer publishable_test_key");
    expect(fetchUrls("/rest/v1/rpc/get_public_auction_candidates")).toHaveLength(0);
  });

  it("fetches lightweight featured and open-house homepage sections", async () => {
    const featured = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=featured"));
    const featuredRows = await featured.json() as Array<{ id: string; profiles?: { display_name?: string | null }; is_featured?: boolean; has_video_tour?: boolean; has_virtual_tour?: boolean }>;
    expect(featuredRows.map((row) => row.id)).toEqual([
      deterministicUuid(10, 3),
      deterministicUuid(10, 4),
    ]);
    expect(featuredRows[0]?.profiles?.display_name).toBe("Maria Agent");
    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_homepage"))
      .toEqual({ p_publication_id: null });
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(0);
    expect(initFor("/rest/v1/rpc/get_public_profile_summaries").method).toBe("POST");
    expect(jsonBodyFor("/rest/v1/rpc/get_public_profile_summaries")).toEqual({ p_user_ids: ["owner-1", "owner-2"] });
    const featuredCacheKey = new URL(cacheApi.put.mock.calls[0][0].url);
    expect(featuredCacheKey.searchParams.get("v")).toBe("catalogue-publication-featured-v6");
    expect(featured.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=60");
    expect(featured.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(featured.headers.get("X-Maiprop-Cache-Valid-Until"))
      .toBe(cataloguePublicationMetadata().retain_until);
    const featuredCacheEntries = [...cacheStore.entries()].filter(([key]) => (
      key.includes("/api/public/homepage") && key.includes("section=featured")
    ));
    expect(featuredCacheEntries).toHaveLength(2);
    for (const [key, cachedResponse] of featuredCacheEntries) {
      const isStaleSeed = new URL(key).searchParams.has("__maiprop_stale");
      expect(cachedResponse.headers.get("CDN-Cache-Control")).toBeNull();
      expect(cachedResponse.headers.get("Cache-Control")).toBe("public, max-age=60");
      expect(cachedResponse.headers.get("X-Maiprop-Cache")).toBe(isStaleSeed ? "STALE_SEED" : "MISS");
      await expect(cachedResponse.clone().json()).resolves.toEqual(featuredRows);
    }

    fetchMock().mockClear();
    const cachedFeatured = await homepageRequest(
      makeCtx("https://portal.maiprop.co/api/public/homepage?section=featured"),
    );
    expect(cachedFeatured.headers.get("X-Maiprop-Cache")).toBe("HIT");
    expect(cachedFeatured.headers.get("CDN-Cache-Control")).toBe("no-store");
    expect(cachedFeatured.headers.get("Cache-Control")).toBe("public, max-age=60, stale-while-revalidate=60");
    await expect(cachedFeatured.json()).resolves.toEqual(featuredRows);
    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_homepage")).toHaveLength(0);

    fetchMock().mockClear();
    const openHouses = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=open-houses"));
    const openHouseRows = await openHouses.json() as Array<{ id: string }>;
    expect(openHouseRows.map((row) => row.id)).toEqual([
      deterministicUuid(20, 3),
      deterministicUuid(20, 4),
      deterministicUuid(20, 5),
      deterministicUuid(20, 6),
    ]);
    expect(jsonBodyFor("/rest/v1/rpc/get_public_catalogue_homepage"))
      .toEqual({ p_publication_id: null });

    fetchMock().mockClear();
    const canonicalOpenHouses = await openHousesRequest(makeCtx(
      "https://portal.maiprop.co/api/public/open-houses?showPast=0&limit=60&includeMeta=1",
    ));
    const canonicalWindow = await canonicalOpenHouses.json() as { data: Array<{ id: string }> };
    expect(canonicalOpenHouses.headers.get("X-Maiprop-Cache")).toBe("MISS");
    expect(canonicalWindow.data.slice(0, 6).map((row) => row.id)).toEqual(
      openHouseRows.map((row) => row.id),
    );
    expect(fetchUrls("/rest/v1/rpc/query_public_catalogue")).toHaveLength(1);
  });

  it("fetches count and price-index sections without exposing uncapped listing payloads", async () => {
    const typeCounts = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=type-counts"));
    await expect(typeCounts.json()).resolves.toEqual({ apartment: 7, land: 3 });
    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_homepage")).toHaveLength(1);

    fetchMock().mockClear();
    const auctionCount = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=auction-count"));
    await expect(auctionCount.json()).resolves.toBe(3);
    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_homepage")).toHaveLength(1);

    fetchMock().mockClear();
    const priceIndex = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=price-index"));
    const rows = await priceIndex.json() as Array<{ city: string; avg_price_per_sqm: number; is_live: boolean; trend_change_pct: number | null; trend_up: boolean | null; trend_is_live: boolean }>;
    expect(rows.find((row) => row.city === "Athens")).toMatchObject({
      avg_price_per_sqm: 2200,
      is_live: true,
      trend_change_pct: null,
      trend_up: null,
      trend_is_live: false,
    });
    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_homepage")).toHaveLength(1);
  });

  it("builds popular location trends from counts and bounded recent price samples", async () => {
    const res = await homepageRequest(makeCtx("https://portal.maiprop.co/api/public/homepage?section=popular-locations"));
    const rows = await res.json() as Array<{ name: string; listings: number; trend: string | null; trendUp: boolean | null; trendIsLive: boolean }>;
    expect(rows[0]).toMatchObject({ name: "Athens", listings: 7, trend: null, trendUp: null, trendIsLive: false });
    expect(rows.find((row) => row.name === "Mykonos")).toMatchObject({
      listings: 0,
      trend: null,
      trendUp: null,
      trendIsLive: false,
    });

    expect(fetchUrls("/rest/v1/rpc/get_public_catalogue_homepage")).toHaveLength(1);
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

  it("returns a no-store response when the homepage publication has expired", async () => {
    fetchMock().mockResolvedValueOnce(new Response(
      JSON.stringify({ message: "public_catalogue_publication_expired" }),
      {
        status: 400,
        headers: { "Content-Type": "application/json" },
      },
    ));

    const res = await homepageRequest(
      makeCtx("https://portal.maiprop.co/api/public/homepage?section=type-counts"),
    );

    expect(res.status).toBe(409);
    expect(res.headers.get("Cache-Control")).toBe("no-store");
    expect(res.headers.get("CDN-Cache-Control")).toBe("no-store");
    await expect(res.json()).resolves.toEqual({
      error: "Homepage catalogue publication is no longer active",
    });
    expect(cacheApi.put).not.toHaveBeenCalled();
  });
});
