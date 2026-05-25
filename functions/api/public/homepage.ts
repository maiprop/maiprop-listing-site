import {
  cachedJson,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeToken,
  supabaseCount,
  supabaseJson,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { publicAuctions } from "./auctions";

type ListingRow = Record<string, unknown> & {
  property_type?: string | null;
  cover_image_url?: string | null;
  listing_images?: Array<{ url: string; sort_order: number }>;
  city?: string | null;
  price_per_sqm?: number | string | null;
  created_at?: string | null;
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
const COUNTED_PROPERTY_TYPES = ["apartment", "land"] as const;
const PRICE_INDEX_FALLBACK = [
  { city: "Athens", avg_price_per_sqm: 2180, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Thessaloniki", avg_price_per_sqm: 1640, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Mykonos", avg_price_per_sqm: 6200, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Santorini", avg_price_per_sqm: 5100, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Crete", avg_price_per_sqm: 1890, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
  { city: "Rhodes", avg_price_per_sqm: 2340, listing_count: 0, is_live: false, trend_change_pct: null, trend_up: null, trend_is_live: false },
] as const;
const POPULAR_LOCATION_FALLBACK = [
  { name: "Athens", listings: 24860, trend: "+1.2%", trendUp: true },
  { name: "Thessaloniki", listings: 8240, trend: "+0.8%", trendUp: true },
  { name: "Mykonos", listings: 1820, trend: "+2.3%", trendUp: true },
  { name: "Santorini", listings: 1240, trend: "+1.9%", trendUp: true },
] as const;

const featuredSelect =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,listing_images(url,sort_order)";

const openHouseSelect =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,open_house_date,latitude,longitude,listing_images(url,sort_order)";

function sortByImagePresence<T extends ListingRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aHasImg = Boolean(a.cover_image_url || a.listing_images?.length);
    const bHasImg = Boolean(b.cover_image_url || b.listing_images?.length);
    return Number(bHasImg) - Number(aHasImg);
  });
}

async function fetchPopularLocations(env: PublicApiEnv) {
  const cities = POPULAR_LOCATION_FALLBACK.map((city) => city.name);
  const countEntries = await Promise.all(
    cities.map(async (city) => {
      const params = new URLSearchParams();
      params.set("select", "id");
      params.set("status", "eq.active");
      params.set("city", `eq.${city}`);
      return [city, await supabaseCount(env, "/rest/v1/listings", params)] as const;
    }),
  );
  const listingsByCity = Object.fromEntries(countEntries);

  const now = new Date();
  const currStart = new Date(now);
  currStart.setDate(currStart.getDate() - 30);
  const prevStart = new Date(now);
  prevStart.setDate(prevStart.getDate() - 60);

  const params = new URLSearchParams();
  params.set("select", "city,price_per_sqm,created_at");
  params.set("status", "eq.active");
  params.set("listing_type", "eq.sale");
  params.set("city", `in.(${cities.join(",")})`);
  params.append("price_per_sqm", "not.is.null");
  params.set("created_at", `gte.${prevStart.toISOString()}`);
  params.append("created_at", `lt.${now.toISOString()}`);
  params.set("limit", "1000");
  const priceRows = await supabaseJson<ListingRow>(env, "/rest/v1/listings", params);

  const currentPrices: Record<string, number[]> = {};
  const prevPrices: Record<string, number[]> = {};
  for (const row of priceRows) {
    const city = row.city?.trim();
    const price = row.price_per_sqm == null ? NaN : Number(row.price_per_sqm);
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    if (!city || !Number.isFinite(price) || !createdAt) continue;
    const bucket = createdAt >= currStart ? currentPrices : prevPrices;
    bucket[city] = bucket[city] ?? [];
    bucket[city].push(price);
  }

  return POPULAR_LOCATION_FALLBACK.map((fallback) => {
    const prev = prevPrices[fallback.name] ?? [];
    const curr = currentPrices[fallback.name] ?? [];
    let trend = fallback.trend;
    let trendUp = fallback.trendUp;
    if (prev.length >= 2 && curr.length >= 2) {
      const prevAvg = prev.reduce((sum, price) => sum + price, 0) / prev.length;
      const currAvg = curr.reduce((sum, price) => sum + price, 0) / curr.length;
      if (Number.isFinite(prevAvg) && prevAvg > 0 && Number.isFinite(currAvg)) {
        const pct = ((currAvg - prevAvg) / prevAvg) * 100;
        trendUp = pct >= 0;
        trend = `${trendUp ? "+" : "-"}${Math.abs(Math.round(pct * 10) / 10).toFixed(1)}%`;
      }
    }
    return {
      ...fallback,
      listings: listingsByCity[fallback.name] ?? fallback.listings,
      trend,
      trendUp,
    };
  });
}

async function fetchPriceIndex(env: PublicApiEnv) {
  const now = new Date();
  const currStart = new Date(now);
  currStart.setDate(currStart.getDate() - 30);
  const prevStart = new Date(now);
  prevStart.setDate(prevStart.getDate() - 60);
  const cities = PRICE_INDEX_FALLBACK.map((fallback) => fallback.city);
  const params = new URLSearchParams();
  params.set("select", "id,city,price_per_sqm,created_at");
  params.set("status", "eq.active");
  params.set("listing_type", "eq.sale");
  params.set("city", `in.(${cities.join(",")})`);
  params.append("price_per_sqm", "not.is.null");
  params.append("price_per_sqm", "gt.100");
  params.set("created_at", `gte.${prevStart.toISOString()}`);
  params.append("created_at", `lt.${now.toISOString()}`);
  params.set("limit", "1000");
  const rows = await supabaseJson<ListingRow>(env, "/rest/v1/listings", params);

  const currentPrices: Record<string, number[]> = {};
  const previousPrices: Record<string, number[]> = {};
  for (const row of rows) {
    const city = row.city?.trim();
    const price = row.price_per_sqm == null ? NaN : Number(row.price_per_sqm);
    const createdAt = row.created_at ? new Date(row.created_at) : null;
    if (!city || !Number.isFinite(price) || !createdAt) continue;
    const bucket = createdAt >= currStart ? currentPrices : previousPrices;
    bucket[city] = bucket[city] ?? [];
    bucket[city].push(price);
  }

  return PRICE_INDEX_FALLBACK.map((fallback) => {
    const current = currentPrices[fallback.city] ?? [];
    const previous = previousPrices[fallback.city] ?? [];
    if (current.length < 2) return fallback;
    const currentAvg = current.reduce((sum, price) => sum + price, 0) / current.length;
    let trendChangePct: number | null = null;
    let trendUp: boolean | null = null;
    if (previous.length >= 2) {
      const previousAvg = previous.reduce((sum, price) => sum + price, 0) / previous.length;
      if (Number.isFinite(previousAvg) && previousAvg > 0) {
        trendChangePct = Math.round(((currentAvg - previousAvg) / previousAvg) * 1000) / 10;
        trendUp = trendChangePct >= 0;
      }
    }
    return {
      city: fallback.city,
      avg_price_per_sqm: Math.round(currentAvg),
      listing_count: current.length,
      is_live: true,
      trend_change_pct: trendChangePct,
      trend_up: trendUp,
      trend_is_live: trendChangePct !== null,
    };
  });
}

async function fetchSection(env: PublicApiEnv, section: (typeof SECTIONS)[number]): Promise<unknown> {
  if (section === "type-counts") {
    const counts = await Promise.all(
      COUNTED_PROPERTY_TYPES.map(async (propertyType) => {
        const params = new URLSearchParams();
        params.set("select", "id");
        params.set("status", "eq.active");
        params.set("property_type", `eq.${propertyType}`);
        return [propertyType, await supabaseCount(env, "/rest/v1/listings", params)] as const;
      }),
    );
    return Object.fromEntries(counts);
  }

  const params = new URLSearchParams();
  params.set("status", "eq.active");
  params.set("limit", "6");

  if (section === "featured") {
    params.set("select", featuredSelect);
    params.set("listing_type", "eq.sale");
    params.set("order", "created_at.desc");
    params.set("listing_images.order", "sort_order.asc");
    params.set("listing_images.limit", "3");
    return supabaseJson<ListingRow>(env, "/rest/v1/listings", params);
  }

  if (section === "auction-count") {
    params.set("select", "id");
    params.set("listing_type", "eq.auction");
    return supabaseCount(env, "/rest/v1/listings", params);
  }

  if (section === "popular-locations") {
    return fetchPopularLocations(env);
  }

  if (section === "price-index") {
    return fetchPriceIndex(env);
  }

  const now = new Date().toISOString();
  params.set("select", openHouseSelect);
  params.set("listing_type", "eq.open_house");
  params.set("open_house_date", `gte.${now}`);
  params.set("order", "open_house_date.asc");
  params.set("listing_images.order", "sort_order.asc");
  params.set("listing_images.limit", "3");
  return sortByImagePresence(await supabaseJson<ListingRow>(env, "/rest/v1/listings", params));
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
    auctionUrl.searchParams.set("limit", "60");
    return publicAuctions(ctx, auctionUrl);
  }

  const cacheParams = new URLSearchParams([["section", section]]);
  const cacheKey = normalizedCacheUrl(requestUrl, "homepage", cacheParams);
  return cachedJson(ctx, cacheKey, async () => jsonResponse(await fetchSection(ctx.env, section)), {
    edgeTtlSeconds: 180,
    browserTtlSeconds: 60,
    staleSeconds: 600,
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicHomepage(ctx, new URL(ctx.request.url));
};
