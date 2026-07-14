import {
  cachedJson,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeInt,
  supabaseJson,
  upstreamUnavailable,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { interleaveCatalogueStreams } from "./_listingRank";
import { normalizePublicPromotionState } from "./_promotionState";

type AuctionRow = Record<string, unknown> & {
  id: string;
  is_featured?: boolean | null;
  featured_until?: string | null;
  priority_placement?: number | null;
  priority_until?: string | null;
  auction_date?: string | null;
  city?: string | null;
  region?: string | null;
};

const PUBLIC_AUCTION_LIMIT_MAX = 600;
const PUBLIC_AUCTION_CANDIDATE_LIMIT_MAX = 600;
const AUCTION_CACHE_VERSION = "national-sample-promotions-v7";
const UNKNOWN_LOCATION_KEY = "__unknown_location__";
const AUCTION_SELECT =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,auction_date,auction_starting_bid,latitude,longitude,auction_court,website_url,region,is_featured,featured_until,priority_placement,priority_until,construction_status,listing_images(url,sort_order)";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayAuctionPoolTag(): string {
  return `auction_pool:${todayIsoDate()}`;
}

function compareAuctionRows(a: AuctionRow, b: AuctionRow): number {
  const aDate = typeof a.auction_date === "string" ? a.auction_date : "9999-12-31";
  const bDate = typeof b.auction_date === "string" ? b.auction_date : "9999-12-31";
  const dateDelta = aDate.localeCompare(bDate);
  if (dateDelta !== 0) return dateDelta;
  return String(a.id).localeCompare(String(b.id));
}

function sortAuctionRows(rows: AuctionRow[]): AuctionRow[] {
  return [...rows].sort(compareAuctionRows);
}

function getCachedCandidateLimit(limit: number): number {
  if (limit <= 12) return limit;
  return PUBLIC_AUCTION_CANDIDATE_LIMIT_MAX;
}

function getAuctionLocationKey(row: AuctionRow): string {
  const city = typeof row.city === "string" ? row.city.trim() : "";
  if (city) return city;
  const region = typeof row.region === "string" ? row.region.trim() : "";
  return region || UNKNOWN_LOCATION_KEY;
}

function roundRobinAuctionRowsByLocation(rows: AuctionRow[]): AuctionRow[] {
  const buckets = new Map<string, AuctionRow[]>();
  for (const row of sortAuctionRows(rows)) {
    const key = getAuctionLocationKey(row);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const locationKeys = [...buckets.keys()].sort((a, b) => {
    const aTop = buckets.get(a)?.[0];
    const bTop = buckets.get(b)?.[0];
    if (!aTop || !bTop) return a.localeCompare(b);
    const rowDelta = compareAuctionRows(aTop, bTop);
    return rowDelta !== 0 ? rowDelta : a.localeCompare(b);
  });

  const rowsByLocation: AuctionRow[] = [];
  let hasRemainingRows = true;
  while (hasRemainingRows) {
    hasRemainingRows = false;
    for (const key of locationKeys) {
      const bucket = buckets.get(key);
      const next = bucket?.shift();
      if (next) {
        rowsByLocation.push(next);
        hasRemainingRows = true;
      }
    }
  }

  return rowsByLocation;
}

function rankAuctionRows(
  priorityRows: AuctionRow[],
  organicRows: AuctionRow[],
  limit: number,
  nowMs: number,
): AuctionRow[] {
  const seen = new Set<string>();
  const normalizedRows = [...priorityRows, ...organicRows]
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .map((row) => normalizePublicPromotionState(row, nowMs));
  const activePriorityRows = sortAuctionRows(
    normalizedRows.filter((row) => row.priority_placement > 0),
  );
  const activeOrganicRows = roundRobinAuctionRowsByLocation(
    normalizedRows.filter((row) => row.priority_placement === 0),
  );

  return interleaveCatalogueStreams(activePriorityRows, activeOrganicRows, limit, 0).data;
}

type AuctionStreams = {
  priorityRows: AuctionRow[];
  organicRows: AuctionRow[];
};

async function fetchDbAuctionStream(
  env: PublicApiEnv,
  limit: number,
  stream: "priority" | "organic",
  now: string,
  poolTag?: string,
): Promise<AuctionRow[]> {
  const params = new URLSearchParams();
  params.set("select", AUCTION_SELECT);
  params.set("status", "eq.active");
  params.set("listing_type", "eq.auction");
  params.set("is_off_market", "eq.false");
  params.set("tags", poolTag ? `cs.{source:maiprop-os,${poolTag}}` : "cs.{source:maiprop-os}");
  params.set("or", `(auction_date.gte.${todayIsoDate()},auction_date.is.null)`);
  if (stream === "priority") {
    params.set("priority_placement", "gt.0");
    params.set("priority_until", `gt.${now}`);
  } else {
    params.append(
      "or",
      `(priority_placement.lte.0,priority_placement.is.null,priority_until.lte.${now},priority_until.is.null)`,
    );
  }
  params.append("order", "auction_date.asc.nullslast");
  params.append("order", "id.asc");
  params.set("limit", String(limit));
  params.set("listing_images.order", "sort_order.asc");
  params.set("listing_images.limit", "3");

  return supabaseJson<AuctionRow>(env, "/rest/v1/listings", params, { failOnTransient: true });
}

async function fetchDbAuctionStreams(
  env: PublicApiEnv,
  limit: number,
  now: string,
  poolTag?: string,
): Promise<AuctionStreams> {
  const [priorityRows, organicRows] = await Promise.all([
    fetchDbAuctionStream(env, limit, "priority", now, poolTag),
    fetchDbAuctionStream(env, limit, "organic", now, poolTag),
  ]);
  return { priorityRows, organicRows };
}

export async function fetchPublicAuctionRows(env: PublicApiEnv, limit: number): Promise<AuctionRow[]> {
  const candidateLimit = getCachedCandidateLimit(limit);
  const nowMs = Date.now();
  const now = new Date(nowMs).toISOString();
  const cachedStreams = await fetchDbAuctionStreams(env, candidateLimit, now, todayAuctionPoolTag());
  const hasCachedRows = cachedStreams.priorityRows.length > 0 || cachedStreams.organicRows.length > 0;
  const streams = hasCachedRows
    ? cachedStreams
    : await fetchDbAuctionStreams(env, candidateLimit, now);
  return rankAuctionRows(streams.priorityRows, streams.organicRows, limit, nowMs);
}

export async function publicAuctions(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const limit = safeInt(requestUrl.searchParams.get("limit"), PUBLIC_AUCTION_LIMIT_MAX, 1, PUBLIC_AUCTION_LIMIT_MAX);
  const cacheParams = new URLSearchParams([
    ["limit", String(limit)],
    ["day", todayIsoDate()],
    ["v", AUCTION_CACHE_VERSION],
  ]);
  const cacheKey = normalizedCacheUrl(requestUrl, "auctions", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      return jsonResponse({ data: await fetchPublicAuctionRows(ctx.env, limit) });
    } catch (error) {
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  }, {
    edgeTtlSeconds: 3_600,
    browserTtlSeconds: 300,
    staleSeconds: 21_600,
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicAuctions(ctx, new URL(ctx.request.url));
};
