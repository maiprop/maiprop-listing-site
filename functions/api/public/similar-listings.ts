import {
  cachedJson,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeDecimal,
  safeInt,
  safeText,
  safeToken,
  supabaseJson,
  upstreamUnavailable,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { publicListingRows } from "./_fixture-content";
import { fetchPublicProfileSummaries, publicProfileDisplay } from "./_publicProfiles";

type ListingRow = {
  id: string;
  owner_id?: string | null;
  price?: number | string | null;
  listing_type?: string | null;
  title?: string | null;
  address?: string | null;
  city?: string | null;
  property_type?: string | null;
  sqm?: number | string | null;
  auction_date?: string | null;
  auction_starting_bid?: number | string | null;
  tags?: unknown;
  [key: string]: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const LISTING_TYPES = ["sale", "rent", "firesale", "auction", "open_house", "new_build"] as const;
const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office", "warehouse", "hotel"] as const;
const SIMILAR_LISTINGS_CANDIDATE_LIMIT = 48;
const SIMILAR_LISTINGS_LIMIT_MAX = 24;
const SIMILAR_LISTINGS_CACHE_VERSION = "similar-v1";
const SIMILAR_LISTINGS_SELECT =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,property_type,listing_type,open_house_transaction_type,open_house_date,auction_date,auction_starting_bid,cover_image_url,owner_id,tags,has_video_tour,has_virtual_tour,is_featured,priority_placement,is_pre_sale,construction_status,walkability_score,safety_score,noise_score,listing_images(url,sort_order)";

function buildSimilarParams(requestUrl: URL): {
  params: URLSearchParams;
  limit: number;
  price: number | null;
} | null {
  const city = safeText(requestUrl.searchParams.get("city"));
  const propertyType = safeToken(requestUrl.searchParams.get("propertyType"), PROPERTY_TYPES);
  const listingType = safeToken(requestUrl.searchParams.get("listingType"), LISTING_TYPES);
  const excludeId = requestUrl.searchParams.get("excludeId")?.trim() ?? "";
  const priceValue = safeDecimal(requestUrl.searchParams.get("price"));
  const price = priceValue ? Number(priceValue) : null;
  const limit = safeInt(requestUrl.searchParams.get("limit"), 8, 1, SIMILAR_LISTINGS_LIMIT_MAX);

  if (!city && !propertyType) return null;

  const params = new URLSearchParams();
  params.set("select", SIMILAR_LISTINGS_SELECT);
  params.set("status", "eq.active");
  params.set("is_off_market", "eq.false");
  params.set("limit", String(SIMILAR_LISTINGS_CANDIDATE_LIMIT));
  params.set("listing_images.order", "sort_order.asc");
  params.set("listing_images.limit", "3");
  params.append("order", "priority_placement.desc.nullslast");
  params.append("order", "is_featured.desc");
  params.append("order", "created_at.desc");

  if (UUID_RE.test(excludeId)) params.set("id", `neq.${excludeId}`);
  if (city) params.set("city", `ilike.*${city}*`);
  if (propertyType) params.set("property_type", `eq.${propertyType}`);
  if (listingType) params.set("listing_type", `eq.${listingType}`);

  return { params, limit, price };
}

function sortByPriceProximity(rows: ListingRow[], price: number | null): ListingRow[] {
  if (price == null || price <= 0) return rows;
  return [...rows].sort((a, b) => {
    const aPrice = Math.abs(Number(a.price ?? 0) - price);
    const bPrice = Math.abs(Number(b.price ?? 0) - price);
    return aPrice - bPrice;
  });
}

function normalizeIdentityPart(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getOsAuctionTag(tags: unknown): string | null {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((value): value is string =>
    typeof value === "string" && /^os_auction:/i.test(value.trim()),
  );
  return tag ? normalizeIdentityPart(tag) : null;
}

function similarListingIdentity(row: ListingRow): string {
  const id = normalizeIdentityPart(row.id);
  if (normalizeIdentityPart(row.listing_type) !== "auction") return `id:${id}`;

  const osAuctionTag = getOsAuctionTag(row.tags);
  if (osAuctionTag) return `auction:${osAuctionTag}`;

  const parts = [
    row.title,
    row.address,
    row.city,
    row.property_type,
    row.price,
    row.sqm,
    row.auction_date,
    row.auction_starting_bid,
  ].map(normalizeIdentityPart);
  const hasEnoughAuctionShape = parts.slice(0, 3).every(Boolean) && (parts[4] || parts[5] || parts[6]);
  return hasEnoughAuctionShape ? `auction:${parts.join("|")}` : `id:${id}`;
}

function dedupeSimilarRows<T extends ListingRow>(rows: T[]): T[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    const identity = similarListingIdentity(row);
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

async function publicSimilarListings(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const built = buildSimilarParams(requestUrl);
  if (!built) return jsonResponse({ data: [] });

  const cacheParams = new URLSearchParams(built.params);
  cacheParams.set("responseLimit", String(built.limit));
  if (built.price != null) cacheParams.set("price", String(built.price));
  cacheParams.set("v", SIMILAR_LISTINGS_CACHE_VERSION);
  const cacheKey = normalizedCacheUrl(requestUrl, "similar-listings", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      const rows = publicListingRows(
        await supabaseJson<ListingRow>(ctx.env, "/rest/v1/listings", built.params, { failOnTransient: true }),
      );
      const ownerIds = rows.map((row) => row.owner_id).filter((id): id is string => typeof id === "string");
      const profiles = await fetchPublicProfileSummaries(ctx.env, ownerIds);
      const withProfiles = rows.map((row) => ({
        ...row,
        profiles: publicProfileDisplay(row.owner_id ? profiles.get(row.owner_id) : null),
        ownerParticipantType: row.owner_id ? profiles.get(row.owner_id)?.owner_participant_type ?? null : null,
      }));

      return jsonResponse({
        data: dedupeSimilarRows(sortByPriceProximity(withProfiles, built.price)).slice(0, built.limit),
      });
    } catch (error) {
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicSimilarListings(ctx, new URL(ctx.request.url));
};
