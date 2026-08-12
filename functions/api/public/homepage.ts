import {
  cachedJson,
  isPublicCatalogueSnapshotExpiredError,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  publicCatalogueValidityHeaders,
  safeToken,
  supabaseRpcJson,
  upstreamUnavailable,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { publicAuctions } from "./auctions";
import { publicListingRows } from "./_fixture-content";
import { fetchPublicProfileSummaries, publicProfileDisplay } from "./_publicProfiles";
import { normalizePublicPromotionState } from "./_promotionState";

type HomepagePublicationRow = {
  publication_id?: unknown;
  published_at?: unknown;
  retain_until?: unknown;
  payload?: unknown;
};

type HomepagePayload = {
  publication_id?: unknown;
  featured?: unknown;
  open_houses?: unknown;
  property_type_counts?: unknown;
  popular_locations?: unknown;
  price_index?: unknown;
  auction_count?: unknown;
};

const SECTIONS = [
  "type-counts",
  "featured",
  "auctions",
  "open-houses",
  "popular-locations",
  "price-index",
  "auction-count",
] as const;
const HOMEPAGE_CACHE_VERSION = "catalogue-publication-v4";
const FEATURED_CACHE_VERSION = "catalogue-publication-featured-v6";
const FEATURED_CACHE_SECONDS = 60;
const HOMEPAGE_PRODUCER_TIMEOUT_MS = 4_500;
const COUNTED_PROPERTY_TYPES = ["apartment", "land"] as const;
const PRICE_INDEX_FALLBACK = [
  { city: "Athens", avg_price_per_sqm: 2180, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Thessaloniki", avg_price_per_sqm: 1640, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Mykonos", avg_price_per_sqm: 6200, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Santorini", avg_price_per_sqm: 5100, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Crete", avg_price_per_sqm: 1890, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Rhodes", avg_price_per_sqm: 2340, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
] as const;
const POPULAR_LOCATION_NAMES = ["Athens", "Thessaloniki", "Mykonos", "Santorini"] as const;

function recordValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function recordArray(value: unknown): Array<Record<string, unknown>> {
  return Array.isArray(value)
    ? value.map(recordValue).filter((row): row is Record<string, unknown> => row !== null)
    : [];
}

async function fetchHomepagePublication(env: PublicApiEnv): Promise<{
  publicationId: number;
  publishedAt: string;
  retainUntil: string;
  payload: HomepagePayload;
}> {
  const rows = await supabaseRpcJson<HomepagePublicationRow>(
    env,
    "get_public_catalogue_homepage",
    { p_publication_id: null },
    { failOnTransient: true },
  );
  const publicationId = Number(rows[0]?.publication_id);
  const publishedAt = rows[0]?.published_at;
  const retainUntil = rows[0]?.retain_until;
  const payload = recordValue(rows[0]?.payload) as HomepagePayload | null;
  if (
    !Number.isSafeInteger(publicationId) ||
    publicationId < 1 ||
    typeof publishedAt !== "string" ||
    !Number.isFinite(Date.parse(publishedAt)) ||
    typeof retainUntil !== "string" ||
    !Number.isFinite(Date.parse(retainUntil)) ||
    !payload ||
    Number(payload.publication_id) !== publicationId
  ) {
    throw new Error("Homepage catalogue publication is invalid");
  }
  return {
    publicationId,
    publishedAt: new Date(Date.parse(publishedAt)).toISOString(),
    retainUntil: new Date(Date.parse(retainUntil)).toISOString(),
    payload,
  };
}

async function fetchSection(
  env: PublicApiEnv,
  section: (typeof SECTIONS)[number],
): Promise<{ data: unknown; retainUntil: string }> {
  const { payload, publishedAt, publicationId, retainUntil } =
    await fetchHomepagePublication(env);
  const result = (data: unknown) => ({ data, retainUntil });
  if (section === "type-counts") {
    const counts = recordValue(payload.property_type_counts) ?? {};
    return result(Object.fromEntries(
      COUNTED_PROPERTY_TYPES.map((propertyType) => [
        propertyType,
        Number(counts[propertyType] ?? 0),
      ]),
    ));
  }

  if (section === "featured") {
    const nowMs = Date.parse(publishedAt);
    const rows = publicListingRows(recordArray(payload.featured), 4)
      .map((row) => normalizePublicPromotionState(row, nowMs));
    const ownerIds = rows
      .map((row) => row.owner_id)
      .filter((id): id is string => typeof id === "string");
    const profiles = await fetchPublicProfileSummaries(env, ownerIds);
    return result(rows.map((row) => {
      const ownerId = typeof row.owner_id === "string" ? row.owner_id : null;
      return {
        ...row,
        publicationId,
        profiles: publicProfileDisplay(
          ownerId ? profiles.get(ownerId) : null,
        ),
        ownerParticipantType: ownerId
          ? profiles.get(ownerId)?.owner_participant_type ?? null
          : null,
      };
    }));
  }

  if (section === "open-houses") {
    return result(
      publicListingRows(recordArray(payload.open_houses), 6)
        .map((row) => ({ ...row, publicationId })),
    );
  }

  if (section === "auction-count") {
    const count = Number(payload.auction_count ?? 0);
    return result(Number.isSafeInteger(count) && count >= 0 ? count : 0);
  }

  if (section === "popular-locations") {
    const liveCounts = new Map(
      recordArray(payload.popular_locations).map((row) => [
        String(row.city ?? ""),
        Number(row.listing_count ?? 0),
      ]),
    );
    return result(POPULAR_LOCATION_NAMES.map((name) => ({
      name,
      listings: liveCounts.get(name) ?? 0,
      trend: null,
      trendUp: null,
      trendIsLive: false,
    })));
  }

  if (section === "price-index") {
    const liveRows = new Map(
      recordArray(payload.price_index).map((row) => [
        String(row.city ?? ""),
        row,
      ]),
    );
    return result(PRICE_INDEX_FALLBACK.map((fallback) => {
      const live = liveRows.get(fallback.city);
      const average = Number(live?.avg_price_per_sqm);
      const count = Number(live?.listing_count);
      if (!Number.isFinite(average) || !Number.isSafeInteger(count) || count < 1) {
        return fallback;
      }
      return {
        city: fallback.city,
        avg_price_per_sqm: Math.round(average),
        listing_count: count,
        is_live: true,
        trend_change_pct: null,
        trend_up: null,
        trend_is_live: false,
      };
    }));
  }

  throw new Error(`Unsupported homepage section: ${section}`);
}

async function publicHomepage(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();
  const section = safeToken(requestUrl.searchParams.get("section"), SECTIONS);
  if (!section) {
    return jsonResponse(
      { error: "Invalid section" },
      {
        status: 400,
        headers: {
          "Cache-Control": "no-store",
          "CDN-Cache-Control": "no-store",
        },
      },
    );
  }
  if (section === "auctions") {
    const auctionUrl = new URL("/api/public/auctions", requestUrl.origin);
    auctionUrl.searchParams.set("limit", "6");
    return publicAuctions(ctx, auctionUrl);
  }
  const cacheParams = new URLSearchParams([
    ["section", section],
    ["v", section === "featured" ? FEATURED_CACHE_VERSION : HOMEPAGE_CACHE_VERSION],
  ]);
  const cacheKey = normalizedCacheUrl(requestUrl, "homepage", cacheParams);
  const cacheOptions = section === "featured"
    ? {
        edgeTtlSeconds: FEATURED_CACHE_SECONDS,
        browserTtlSeconds: FEATURED_CACHE_SECONDS,
        staleSeconds: FEATURED_CACHE_SECONDS,
        staleFallbackSeconds: FEATURED_CACHE_SECONDS,
        producerTimeoutMs: HOMEPAGE_PRODUCER_TIMEOUT_MS,
        disableCdnCache: true,
      }
    : {
        edgeTtlSeconds: 180,
        browserTtlSeconds: 60,
        staleSeconds: 600,
        producerTimeoutMs: HOMEPAGE_PRODUCER_TIMEOUT_MS,
      };
  return cachedJson(ctx, cacheKey, async () => {
    try {
      const result = await fetchSection(ctx.env, section);
      return jsonResponse(
        result.data,
        {
          headers: publicCatalogueValidityHeaders({
            retainUntil: result.retainUntil,
          }),
        },
      );
    } catch (error) {
      if (isPublicCatalogueSnapshotExpiredError(error)) {
        return jsonResponse(
          { error: "Homepage catalogue publication is no longer active" },
          {
            status: 409,
            headers: {
              "Cache-Control": "no-store",
              "CDN-Cache-Control": "no-store",
            },
          },
        );
      }
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  }, {
    ...cacheOptions,
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicHomepage(ctx, new URL(ctx.request.url));
};
