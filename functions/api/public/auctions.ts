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
};

type EdgeAuctionPayload = {
  data?: AuctionRow[];
};

const PUBLIC_AUCTION_LIMIT_MAX = 60;
const OS_PROXY_TIMEOUT_MS = 2_500;
const AUCTION_SELECT =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,auction_date,auction_starting_bid,latitude,longitude,auction_court,website_url,region,is_featured,priority_placement,construction_status,listing_images(url,sort_order)";

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function timeoutSignal(ms: number): AbortSignal {
  const controller = new AbortController();
  setTimeout(() => controller.abort(), ms);
  return controller.signal;
}

function sortAuctionRows(rows: AuctionRow[]): AuctionRow[] {
  return [...rows].sort((a, b) => {
    const priorityDelta = Number(b.priority_placement ?? 0) - Number(a.priority_placement ?? 0);
    if (priorityDelta !== 0) return priorityDelta;
    const featuredDelta = (b.is_featured ? 1 : 0) - (a.is_featured ? 1 : 0);
    if (featuredDelta !== 0) return featuredDelta;
    const aDate = typeof a.auction_date === "string" ? a.auction_date : "9999-12-31";
    const bDate = typeof b.auction_date === "string" ? b.auction_date : "9999-12-31";
    const dateDelta = aDate.localeCompare(bDate);
    if (dateDelta !== 0) return dateDelta;
    return String(a.id).localeCompare(String(b.id));
  });
}

async function fetchOsAuctions(env: PublicApiEnv, limit: number): Promise<AuctionRow[]> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("missing-runtime");

  const res = await fetch(new URL("/functions/v1/fetch-os-auctions", runtime.url), {
    method: "POST",
    headers: {
      apikey: runtime.key,
      Authorization: `Bearer ${runtime.key}`,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      auctionDateFrom: todayIsoDate(),
      page: 0,
      pageSize: limit,
      sampleAcrossGreece: true,
      sortBy: "AUCTION_DATE",
      order: "ASC",
    }),
    signal: timeoutSignal(OS_PROXY_TIMEOUT_MS),
  });

  if (!res.ok) throw new Error(`OS proxy failed with ${res.status}`);
  const payload = (await res.json()) as EdgeAuctionPayload;
  return Array.isArray(payload.data) ? payload.data : [];
}

async function fetchCachedDbAuctions(env: PublicApiEnv, limit: number): Promise<AuctionRow[]> {
  const params = new URLSearchParams();
  params.set("select", AUCTION_SELECT);
  params.set("status", "eq.active");
  params.set("listing_type", "eq.auction");
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
  const cachedRows = await fetchCachedDbAuctions(env, limit);
  if (cachedRows.length > 0) return sortAuctionRows(cachedRows).slice(0, limit);

  try {
    const osRows = await fetchOsAuctions(env, limit);
    if (osRows.length > 0) return sortAuctionRows(osRows).slice(0, limit);
  } catch {
    // Keep the public route responsive even when the live OS proxy is slow.
  }

  return [];
}

export async function publicAuctions(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const limit = safeInt(requestUrl.searchParams.get("limit"), PUBLIC_AUCTION_LIMIT_MAX, 1, PUBLIC_AUCTION_LIMIT_MAX);
  const cacheParams = new URLSearchParams([
    ["limit", String(limit)],
    ["day", todayIsoDate()],
  ]);
  const cacheKey = normalizedCacheUrl(requestUrl, "auctions", cacheParams);

  return cachedJson(ctx, cacheKey, async () => jsonResponse({ data: await fetchPublicAuctionRows(ctx.env, limit) }), {
    edgeTtlSeconds: 300,
    browserTtlSeconds: 90,
    staleSeconds: 900,
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicAuctions(ctx, new URL(ctx.request.url));
};
