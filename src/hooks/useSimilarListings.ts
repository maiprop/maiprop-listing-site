import { useQuery } from "@tanstack/react-query";
import { fetchPublicApi } from "@/lib/publicApi";

type SimilarListingRow = {
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
    queryFn: async () => {
      if (!city && !propertyType) return [];

      const params = new URLSearchParams();
      if (excludeId) params.set("excludeId", excludeId);
      if (city) params.set("city", city);
      if (propertyType) params.set("propertyType", propertyType);
      if (listingType) params.set("listingType", listingType);
      if (price != null) params.set("price", String(price));
      params.set("limit", String(limit));

      const response = await fetchPublicApi<SimilarListingsResponse>(
        `/api/public/similar-listings?${params.toString()}`,
        { throwOnError: true },
      );
      if (!response) throw new Error("Public similar listings API returned no data");
      return dedupeSimilarListings(response.data);
    },
    enabled: !!(city || propertyType),
  });
}
