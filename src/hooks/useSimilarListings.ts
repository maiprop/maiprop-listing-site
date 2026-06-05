import { useQuery } from "@tanstack/react-query";
import { fetchPublicApi } from "@/lib/publicApi";

type SimilarListingRow = {
  id: string;
  profiles?: Record<string, unknown> | null;
  [key: string]: unknown;
};

type SimilarListingsResponse<T = SimilarListingRow> = {
  data: T[];
};

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
      return response.data;
    },
    enabled: !!(city || propertyType),
  });
}
