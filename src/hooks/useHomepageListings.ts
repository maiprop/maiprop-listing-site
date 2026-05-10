import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Homepage data hooks.
 *
 * These were previously inlined as queryFns in `src/pages/Index.tsx`. Moved
 * here so the page is presentational and the data fetching is reusable +
 * typed. No behaviour change: same query keys, same select strings, same
 * fallback / sort logic, same staleTime / retry config.
 */

const featuredSelect =
  "id, title, address, city, price, price_per_sqm, bedrooms, bathrooms, sqm, floor, total_floors, year_built, energy_class, cover_image_url, property_type, listing_type, ai_score, views_count, tags";

const auctionSelect =
  "id, title, address, city, price, price_per_sqm, bedrooms, bathrooms, sqm, floor, total_floors, year_built, energy_class, cover_image_url, property_type, listing_type, ai_score, views_count, tags, auction_date, auction_starting_bid, latitude, longitude";

const openHouseSelect =
  "id, title, address, city, price, price_per_sqm, bedrooms, bathrooms, sqm, floor, total_floors, year_built, energy_class, cover_image_url, property_type, listing_type, ai_score, views_count, tags, open_house_date, latitude, longitude, listing_images(url, sort_order)";

const queryTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Request timeout")), ms))]);

type HasCoverOrImages = { cover_image_url?: string | null; listing_images?: { url: string; sort_order: number }[] };

const sortByImagePresence = <T extends HasCoverOrImages>(rows: T[]): T[] =>
  [...rows].sort((a, b) => {
    const aHasImg = !!(a.cover_image_url || a.listing_images?.length);
    const bHasImg = !!(b.cover_image_url || b.listing_images?.length);
    return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
  });

/** Counts of active listings grouped by `property_type` for the BrowseByType section. */
export function useHomepageTypeCounts() {
  return useQuery({
    queryKey: ["homepage-type-counts"],
    staleTime: 10 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("listings")
        .select("property_type")
        .eq("status", "active");
      if (error) throw error;
      const counts: Record<string, number> = {};
      (data ?? []).forEach((row) => {
        const k = row.property_type;
        counts[k] = (counts[k] || 0) + 1;
      });
      return counts;
    },
  });
}

/** 4 most recent active sale listings for the FeaturedProperties section. */
export function useHomepageFeaturedListings() {
  return useQuery({
    queryKey: ["homepage-featured"],
    queryFn: async () => {
      const run = async () => {
        const { data, error } = await supabase
          .from("listings")
          .select(`${featuredSelect}, listing_images(url, sort_order)`)
          .eq("status", "active")
          .eq("listing_type", "sale")
          .order("created_at", { ascending: false })
          .limit(4);
        if (error) {
          // Fallback without the join in case the embedded relation breaks
          const fallback = await supabase
            .from("listings")
            .select(featuredSelect)
            .eq("status", "active")
            .eq("listing_type", "sale")
            .order("created_at", { ascending: false })
            .limit(4);
          if (fallback.error) throw fallback.error;
          return fallback.data ?? [];
        }
        return data ?? [];
      };
      return queryTimeout(run(), 12_000);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Up to 6 upcoming-or-undated active auction listings, sorted with image-having ones first. */
export function useHomepageAuctionListings() {
  const today = new Date().toISOString().split("T")[0];
  return useQuery({
    queryKey: ["homepage-auctions"],
    queryFn: async () => {
      const run = async () => {
        const { data, error } = await supabase
          .from("listings")
          .select(`${auctionSelect}, listing_images(url, sort_order)`)
          .eq("status", "active")
          .eq("listing_type", "auction")
          .or(`auction_date.gte.${today},auction_date.is.null`)
          .order("auction_date", { ascending: true, nullsFirst: false })
          .limit(6);
        if (error) {
          const fallback = await supabase
            .from("listings")
            .select(auctionSelect)
            .eq("status", "active")
            .eq("listing_type", "auction")
            .or(`auction_date.gte.${today},auction_date.is.null`)
            .order("auction_date", { ascending: true, nullsFirst: false })
            .limit(6);
          if (fallback.error) throw fallback.error;
          return sortByImagePresence(fallback.data ?? []);
        }
        return sortByImagePresence(data ?? []);
      };
      return queryTimeout(run(), 12_000);
    },
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });
}

/** Up to 6 upcoming open-house listings, sorted with image-having ones first. */
export function useHomepageOpenHouseListings() {
  return useQuery({
    queryKey: ["homepage-open-houses"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("listings")
        .select(openHouseSelect)
        .eq("status", "active")
        .eq("listing_type", "open_house")
        .gte("open_house_date", now)
        .order("open_house_date", { ascending: true })
        .limit(6);
      if (error) return [];
      return sortByImagePresence(data ?? []);
    },
    staleTime: 2 * 60 * 1000,
  });
}
