import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
      // Query avg price_per_sqm grouped by city for active sale listings
      const { data, error } = await supabase
        .from("listings")
        .select("city, price_per_sqm")
        .eq("status", "active")
        .eq("listing_type", "sale")
        .not("price_per_sqm", "is", null)
        .gt("price_per_sqm", 100); // filter out data errors

      if (error || !data || data.length === 0) return FALLBACK;

      // Group by city and compute avg
      const grouped: Record<string, number[]> = {};
      for (const row of data) {
        const c = row.city?.trim();
        if (!c) continue;
        if (!grouped[c]) grouped[c] = [];
        grouped[c].push(Number(row.price_per_sqm));
      }

      // Build results for known cities, fall back to static if no data
      return FALLBACK.map(fb => {
        const prices = grouped[fb.city];
        if (!prices || prices.length < 2) return fb; // need at least 2 data points
        const avg = Math.round(prices.reduce((a, b) => a + b, 0) / prices.length);
        return {
          city: fb.city,
          avg_price_per_sqm: avg,
          listing_count: prices.length,
          is_live: true,
        };
      });
    },
    staleTime: 5 * 60 * 1000, // 5 min cache
    refetchOnWindowFocus: false,
  });
}

export { CITY_TRENDS };
