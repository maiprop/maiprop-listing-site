import { useQuery } from "@tanstack/react-query";
import { fetchPublicApi, isPublicApiAbort } from "@/lib/publicApi";
import { supabase } from "@/integrations/supabase/client";
import type { Enums } from "@/integrations/supabase/types";
import { logger } from "@/lib/logger";

export type SimilarListingRow = {
  id: string;
  profiles?: Record<string, unknown> | null;
  listing_type?: unknown;
  title?: unknown;
  address?: unknown;
  city?: unknown;
  property_type?: unknown;
  price?: unknown;
  sqm?: unknown;
  auction_date?: unknown;
  auction_starting_bid?: unknown;
  tags?: unknown;
  [key: string]: unknown;
};

type SimilarListingsResponse<T = SimilarListingRow> = {
  data: T[];
};

const normalizeIdentityPart = (value: unknown): string =>
  String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

const getOsAuctionTag = (tags: unknown): string | null => {
  if (!Array.isArray(tags)) return null;
  const tag = tags.find((value): value is string =>
    typeof value === "string" && /^os_auction:/i.test(value.trim()),
  );
  return tag ? normalizeIdentityPart(tag) : null;
};

export function similarListingIdentity(row: SimilarListingRow): string {
  const id = normalizeIdentityPart(row.id);
  const listingType = normalizeIdentityPart(row.listing_type);
  if (listingType !== "auction") return `id:${id}`;

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

export function dedupeSimilarListings<T extends SimilarListingRow>(
  rows: T[],
  exclude?: SimilarListingRow | null,
): T[] {
  const excludedIdentity = exclude ? similarListingIdentity(exclude) : null;
  const seen = new Set<string>();
  return rows.filter((row) => {
    const identity = similarListingIdentity(row);
    if (excludedIdentity && identity === excludedIdentity) return false;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

const SIMILAR_LISTINGS_SELECT =
  "id,title,address,city,price,price_per_sqm,bedrooms,bathrooms,sqm,floor,total_floors,year_built,energy_class,property_type,listing_type,open_house_transaction_type,open_house_date,auction_date,auction_starting_bid,cover_image_url,owner_id,tags,has_video_tour,has_virtual_tour,is_featured,featured_until,priority_placement,priority_until,is_pre_sale,construction_status,walkability_score,safety_score,noise_score,listing_images(url,sort_order)";

type AbortableQuery<T> = T & { abortSignal?: (signal: AbortSignal) => T };

const withAbortSignal = <T>(query: T, signal?: AbortSignal): T => {
  const abortable = query as AbortableQuery<T>;
  return signal && typeof abortable.abortSignal === "function"
    ? abortable.abortSignal(signal)
    : query;
};

async function fetchSimilarListingsFallback({
  excludeId,
  city,
  propertyType,
  listingType,
  price,
  limit,
  signal,
}: {
  excludeId?: string;
  city?: string;
  propertyType?: string;
  listingType?: string;
  price?: number;
  limit: number;
  signal?: AbortSignal;
}): Promise<SimilarListingRow[]> {
  let query = supabase
    .from("listings")
    .select(SIMILAR_LISTINGS_SELECT)
    .eq("status", "active")
    .eq("is_off_market", false)
    .order("created_at", { ascending: false })
    .order("sort_order", { referencedTable: "listing_images", ascending: true })
    .limit(3, { referencedTable: "listing_images" })
    .limit(48);

  if (excludeId) query = query.neq("id", excludeId);
  if (city) query = query.ilike("city", `%${city}%`);
  if (propertyType) query = query.eq("property_type", propertyType as Enums<"property_type">);
  if (listingType) query = query.eq("listing_type", listingType as Enums<"listing_type">);

  const { data, error } = await withAbortSignal(query, signal);
  if (error) throw error;

  const rows = (data ?? []) as SimilarListingRow[];
  const ownerIds = [...new Set(rows.map((row) => row.owner_id).filter((id): id is string => typeof id === "string"))];
  let profileMap = new Map<string, Record<string, unknown>>();
  if (ownerIds.length > 0) {
    const { data: profiles = [] } = await withAbortSignal(supabase
      .from("profiles_public")
      .select("user_id, display_name, avatar_url")
      .in("user_id", ownerIds), signal);
    profileMap = new Map((profiles ?? []).map((profile) => [profile.user_id, profile as Record<string, unknown>]));
  }

  const withProfiles = rows.map((row) => ({
    ...row,
    profiles: typeof row.owner_id === "string" ? profileMap.get(row.owner_id) ?? null : null,
  }));
  const sorted = price != null && price > 0
    ? [...withProfiles].sort((a, b) => Math.abs(Number(a.price ?? 0) - price) - Math.abs(Number(b.price ?? 0) - price))
    : withProfiles;
  return dedupeSimilarListings(sorted).slice(0, limit);
}

/**
 * Fetches similar listings/deals from the database (includes OS-synced auctions).
 * Matches by city, property_type, listing_type; sorts by price proximity.
 */
export function useSimilarListings(params: {
  excludeId?: string;
  city?: string;
  propertyType?: string;
  listingType?: string;
  price?: number;
  limit?: number;
}) {
  const { excludeId, city, propertyType, listingType, price, limit = 8 } = params;

  return useQuery({
    queryKey: ["similar-listings", excludeId, city, propertyType, listingType, price],
    queryFn: async ({ signal }) => {
      if (!city && !propertyType) return [];

      const params = new URLSearchParams();
      if (excludeId) params.set("excludeId", excludeId);
      if (city) params.set("city", city);
      if (propertyType) params.set("propertyType", propertyType);
      if (listingType) params.set("listingType", listingType);
      if (price != null) params.set("price", String(price));
      params.set("limit", String(limit));

      try {
        const response = await fetchPublicApi<SimilarListingsResponse>(
          `/api/public/similar-listings?${params.toString()}`,
          { throwOnError: true, signal },
        );
        if (!response) throw new Error("Public similar listings API returned no data");
        return dedupeSimilarListings(response.data);
      } catch (error) {
        if (isPublicApiAbort(error)) throw error;
        logger.warn("Public similar listings API failed; falling back to constrained Supabase read:", error);
        return fetchSimilarListingsFallback({ excludeId, city, propertyType, listingType, price, limit, signal });
      }
    },
    enabled: !!(city || propertyType),
  });
}
