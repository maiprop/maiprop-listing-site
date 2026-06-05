import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchPublicApi } from "@/lib/publicApi";
import { useAuctionListings } from "@/hooks/useAuctionListings";
import {
  publicHomepageRows,
  sortByImagePresence,
  type HomepageListing,
} from "@/lib/homepageListings";

/**
 * Homepage data hooks.
 *
 * These were previously inlined as queryFns in `src/pages/Index.tsx`. Moved
 * here so the page is presentational and the data fetching is reusable +
 * typed. No behaviour change: same query keys, same select strings, same
 * fallback / sort logic, same staleTime / retry config.
 */

const HOMEPAGE_AUCTION_SOURCE_LIMIT = 60;
const HOMEPAGE_AUCTION_DISPLAY_LIMIT = 6;
const HOMEPAGE_PROPERTY_TYPES = ["apartment", "land"] as const;
const FEATURED_DAILY_STALE_TIME_MS = 24 * 60 * 60 * 1000;

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
      if (cached) return publicHomepageRows(cached, 4);
      return [];
    },
    staleTime: FEATURED_DAILY_STALE_TIME_MS,
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
      if (cached) return sortByImagePresence(publicHomepageRows(cached));
      return [];
    },
    staleTime: 2 * 60 * 1000,
  });
}
