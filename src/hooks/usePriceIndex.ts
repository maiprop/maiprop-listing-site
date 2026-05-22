import { useQuery } from "@tanstack/react-query";
import { fetchPublicApi } from "@/lib/publicApi";

export interface PriceIndexItem {
  city: string;
  avg_price_per_sqm: number;
  listing_count: number;
  is_live: boolean;
}

const FALLBACK: PriceIndexItem[] = [
  { city: "Athens", avg_price_per_sqm: 2180, listing_count: 0, is_live: false },
  { city: "Thessaloniki", avg_price_per_sqm: 1640, listing_count: 0, is_live: false },
  { city: "Mykonos", avg_price_per_sqm: 6200, listing_count: 0, is_live: false },
  { city: "Santorini", avg_price_per_sqm: 5100, listing_count: 0, is_live: false },
  { city: "Crete", avg_price_per_sqm: 1890, listing_count: 0, is_live: false },
  { city: "Rhodes", avg_price_per_sqm: 2340, listing_count: 0, is_live: false },
];

const CITY_TRENDS: Record<string, string> = {
  Athens: "+4.2%",
  Thessaloniki: "+2.8%",
  Mykonos: "+7.1%",
  Santorini: "+5.3%",
  Crete: "+1.4%",
  Rhodes: "+3.6%",
};

export function usePriceIndex() {
  return useQuery({
    queryKey: ["price-index"],
    queryFn: async () => {
      return await fetchPublicApi<PriceIndexItem[]>("/api/public/homepage?section=price-index") ?? FALLBACK;
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchOnWindowFocus: false,
  });
}

export { CITY_TRENDS };
