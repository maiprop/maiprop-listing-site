import {
  cachedJson,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeInt,
  supabaseJson,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";

type AuctionRow = Record<string, unknown> & {
  id: string;
  is_featured?: boolean | null;
  priority_placement?: number | null;
  auction_date?: string | null;
  city?: string | null;
  region?: string | null;
};

const PUBLIC_AUCTION_LIMIT_MAX = 60;
const PUBLIC_AUCTION_CANDIDATE_LIMIT_MAX = 600;
const AUCTION_CACHE_VERSION = "national-sample-v5";
const UNKNOWN_LOCATION_KEY = "__unknown_location__";
const AUCTION_SELECT =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,auction_date,auction_starting_bid,latitude,longitude,auction_court,website_url,region,is_featured,priority_placement,construction_status,listing_images(url,sort_order)";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayAuctionPoolTag(): string {
  return `auction_pool:${todayIsoDate()}`;
}

function compareAuctionRows(a: AuctionRow, b: AuctionRow): number {
  const priorityDelta = Number(b.priority_placement ?? 0) - Number(a.priority_placement ?? 0);
  if (priorityDelta !== 0) return priorityDelta;
  const featuredDelta = (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
  if (featuredDelta !== 0) return featuredDelta;
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

function diversifyAuctionRows(rows: AuctionRow[], limit: number): AuctionRow[] {
  const sortedRows = sortAuctionRows(rows);
  const promotedRows = sortedRows.filter((row) => Boolean(row.is_featured) || Number(row.priority_placement ?? 0) > 0);
  const organicRows = sortedRows.filter((row) => !promotedRows.includes(row));
  return [...promotedRows, ...roundRobinAuctionRowsByLocation(organicRows)].slice(0, limit);
}

async function fetchCachedDbAuctions(env: PublicApiEnv, limit: number): Promise<AuctionRow[]> {
  const params = new URLSearchParams();
  params.set("select", AUCTION_SELECT);
  params.set("status", "eq.active");
  params.set("listing_type", "eq.auction");
  params.set("is_off_market", "eq.false");
  params.set("tags", `cs.{source:maiprop-os,${todayAuctionPoolTag()}}`);
  params.set("or", `(auction_date.gte.${todayIsoDate()},auction_date.is.null)`);
  params.append("order", "is_featured.desc");
  params.append("order", "priority_placement.desc.nullslast");
  params.append("order", "auction_date.asc.nullslast");
  params.set("limit", String(limit));
  params.set("listing_images.order", "sort_order.asc");
  params.set("listing_images.limit", "3");

  return supabaseJson<AuctionRow>(env, "/rest/v1/listings", params);
}

export async function fetchPublicAuctionRows(env: PublicApiEnv, limit: number): Promise<AuctionRow[]> {
  const cachedRows = await fetchCachedDbAuctions(env, getCachedCandidateLimit(limit));
  return cachedRows.length > 0 ? diversifyAuctionRows(cachedRows, limit) : [];
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

  return cachedJson(ctx, cacheKey, async () => jsonResponse({ data: await fetchPublicAuctionRows(ctx.env, limit) }), {
    edgeTtlSeconds: 3_600,
    browserTtlSeconds: 300,
    staleSeconds: 21_600,
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicAuctions(ctx, new URL(ctx.request.url));
};
