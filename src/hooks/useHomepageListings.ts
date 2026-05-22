import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchPublicApi } from "@/lib/publicApi";
import type { Property } from "@/components/PropertyCard";
import { useAuctionListings } from "@/hooks/useAuctionListings";

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

const openHouseSelect =
  "id, title, address, city, price, price_per_sqm, bedrooms, bathrooms, sqm, floor, total_floors, year_built, energy_class, cover_image_url, property_type, listing_type, ai_score, views_count, tags, open_house_date, latitude, longitude, listing_images(url, sort_order)";

const HOMEPAGE_AUCTION_SOURCE_LIMIT = 60;
const HOMEPAGE_AUCTION_DISPLAY_LIMIT = 6;
const HOMEPAGE_PROPERTY_TYPES = ["apartment", "land"] as const;

const queryTimeout = <T,>(p: Promise<T>, ms: number): Promise<T> =>
  Promise.race([p, new Promise<T>((_, rej) => setTimeout(() => rej(new Error("Request timeout")), ms))]);

type HasCoverOrImages = { cover_image_url?: string | null; listing_images?: { url: string; sort_order: number }[] };
type HomepageListing = HasCoverOrImages & {
  id: string;
  title: string;
  address?: string | null;
  city: string;
  price?: number | string | null;
  price_per_sqm?: number | string | null;
  bedrooms?: number | null;
  bathrooms?: number | null;
  sqm?: number | string | null;
  floor?: number | null;
  total_floors?: number | null;
  year_built?: number | null;
  energy_class?: string | null;
  property_type?: Property["type"] | null;
  listing_type?: Property["listingType"] | null;
  auction_date?: string | null;
  auction_starting_bid?: number | string | null;
  open_house_date?: string | null;
  ai_score?: number | null;
  views_count?: number | null;
  tags?: string[] | null;
  is_pre_sale?: boolean | null;
  construction_status?: string | null;
  latitude?: number | string | null;
  longitude?: number | string | null;
  region?: string | null;
};

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
      const cached = await fetchPublicApi<Record<string, number>>("/api/public/homepage?section=type-counts");
      if (cached) return cached;

      return Object.fromEntries(HOMEPAGE_PROPERTY_TYPES.map((propertyType) => [propertyType, 0]));
    },
  });
}

/** 4 most recent active sale listings for the FeaturedProperties section. */
export function useHomepageFeaturedListings() {
  return useQuery({
    queryKey: ["homepage-featured"],
    queryFn: async () => {
      const cached = await fetchPublicApi<HomepageListing[]>("/api/public/homepage?section=featured");
      if (cached) return cached;

      const run = async () => {
        const { data, error } = await supabase
          .from("listings")
          .select(`${featuredSelect}, listing_images(url, sort_order)`)
          .order("sort_order", { referencedTable: "listing_images", ascending: true })
          .limit(3, { referencedTable: "listing_images" })
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

/** Uses the same 60-row auction window as the public /auctions page, then displays the leading homepage slice. */
export function useHomepageAuctionListings() {
  const query = useAuctionListings(HOMEPAGE_AUCTION_SOURCE_LIMIT);
  const data = useMemo(
    () => (query.data ?? []).slice(0, HOMEPAGE_AUCTION_DISPLAY_LIMIT) as HomepageListing[],
    [query.data],
  );
  return { ...query, data };
}

/** Up to 6 upcoming open-house listings, sorted with image-having ones first. */
export function useHomepageOpenHouseListings() {
  return useQuery({
    queryKey: ["homepage-open-houses"],
    queryFn: async () => {
      const cached = await fetchPublicApi<HomepageListing[]>("/api/public/homepage?section=open-houses");
      if (cached) return sortByImagePresence(cached);

      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("listings")
        .select(openHouseSelect)
        .order("sort_order", { referencedTable: "listing_images", ascending: true })
        .limit(3, { referencedTable: "listing_images" })
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
