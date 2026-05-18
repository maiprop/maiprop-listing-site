import {
  cachedJson,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeToken,
  supabaseJson,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";

type ListingRow = Record<string, unknown> & {
  property_type?: string | null;
  cover_image_url?: string | null;
  listing_images?: Array<{ url: string; sort_order: number }>;
};

const SECTIONS = ["type-counts", "featured", "auctions", "open-houses"] as const;

const featuredSelect =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,listing_images(url,sort_order)";

const auctionSelect =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,auction_date,auction_starting_bid,latitude,longitude,listing_images(url,sort_order)";

const openHouseSelect =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,cover_image_url,property_type,listing_type,ai_score,views_count,tags,open_house_date,latitude,longitude,listing_images(url,sort_order)";

function sortByImagePresence<T extends ListingRow>(rows: T[]): T[] {
  return [...rows].sort((a, b) => {
    const aHasImg = Boolean(a.cover_image_url || a.listing_images?.length);
    const bHasImg = Boolean(b.cover_image_url || b.listing_images?.length);
    return Number(bHasImg) - Number(aHasImg);
  });
}

async function fetchSection(env: PublicApiEnv, section: (typeof SECTIONS)[number]): Promise<unknown> {
  if (section === "type-counts") {
    const params = new URLSearchParams();
    params.set("select", "property_type");
    params.set("status", "eq.active");
    params.set("limit", "1000");
    const rows = await supabaseJson<ListingRow>(env, "/rest/v1/listings", params);
    return rows.reduce<Record<string, number>>((counts, row) => {
      const key = typeof row.property_type === "string" ? row.property_type : "";
      if (key) counts[key] = (counts[key] ?? 0) + 1;
      return counts;
    }, {});
  }

  const params = new URLSearchParams();
  params.set("status", "eq.active");
  params.set("limit", "6");

  if (section === "featured") {
    params.set("select", featuredSelect);
    params.set("listing_type", "eq.sale");
    params.set("order", "created_at.desc");
    return supabaseJson<ListingRow>(env, "/rest/v1/listings", params);
  }

  if (section === "auctions") {
    const today = new Date().toISOString().slice(0, 10);
    params.set("select", auctionSelect);
    params.set("listing_type", "eq.auction");
    params.set("or", `(auction_date.gte.${today},auction_date.is.null)`);
    params.set("order", "auction_date.asc.nullslast");
    return sortByImagePresence(await supabaseJson<ListingRow>(env, "/rest/v1/listings", params));
  }

  const now = new Date().toISOString();
  params.set("select", openHouseSelect);
  params.set("listing_type", "eq.open_house");
  params.set("open_house_date", `gte.${now}`);
  params.set("order", "open_house_date.asc");
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
