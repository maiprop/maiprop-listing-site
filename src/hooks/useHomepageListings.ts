import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchPublicApi, isPublicApiAbort } from "@/lib/publicApi";
import { logger } from "@/lib/logger";
import {
  fetchHomepageFeaturedFallback,
  fetchHomepageOpenHousesFallback,
} from "@/lib/publicListingFallbacks";
import { useAuctionListings } from "@/hooks/useAuctionListings";
import {
  publicHomepageRows,
  sortByImagePresence,
  type HomepageListing,
} from "@/lib/homepageListings";
import {
  HOMEPAGE_FEATURED_SNAPSHOT_KEY,
  HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY,
  readHomepageSnapshot,
  writeHomepageSnapshot,
} from "@/lib/homepageSnapshotCache";

/**
 * Homepage data hooks.
 *
 * These were previously inlined as queryFns in `src/pages/Index.tsx`. Moved
 * here so the page is presentational and the data fetching is reusable +
 * typed. No behaviour change: same query keys, same select strings, same
 * fallback / sort logic, same staleTime / retry config.
 */

const HOMEPAGE_AUCTION_SOURCE_LIMIT = 6;
const HOMEPAGE_AUCTION_DISPLAY_LIMIT = 6;
const FEATURED_STALE_TIME_MS = 5 * 60 * 1000;
const HOMEPAGE_SECTION_TIMEOUT_MS = 2_500;

type HomepageQueryOptions = {
  enabled?: boolean;
};

/** 4 most recent active sale listings for the FeaturedProperties section. */
export function useHomepageFeaturedListings(options: HomepageQueryOptions = {}) {
  return useQuery<HomepageListing[]>({
    queryKey: ["homepage-featured"],
    queryFn: async ({ signal }) => {
      try {
        const cached = await fetchPublicApi<HomepageListing[]>(
          "/api/public/homepage?section=featured",
          { throwOnError: true, timeoutMs: HOMEPAGE_SECTION_TIMEOUT_MS, signal },
        );
        if (cached) {
          const rows = publicHomepageRows(cached, 4);
          writeHomepageSnapshot(HOMEPAGE_FEATURED_SNAPSHOT_KEY, rows);
          return rows;
        }
        throw new Error("Public homepage featured API returned no data");
      } catch (error) {
        if (isPublicApiAbort(error)) throw error;
        logger.warn("Public homepage featured API failed; falling back to constrained Supabase read:", error);
        const rows = await fetchHomepageFeaturedFallback(signal);
        writeHomepageSnapshot(HOMEPAGE_FEATURED_SNAPSHOT_KEY, rows);
        return rows;
      }
    },
    placeholderData: () => readHomepageSnapshot<HomepageListing[]>(HOMEPAGE_FEATURED_SNAPSHOT_KEY),
    enabled: options.enabled ?? true,
    staleTime: FEATURED_STALE_TIME_MS,
    retry: 1,
  });
}

/** Requests only the compact auction preview window needed by the homepage. */
export function useHomepageAuctionListings(options: HomepageQueryOptions = {}) {
  const query = useAuctionListings(HOMEPAGE_AUCTION_SOURCE_LIMIT, { enabled: options.enabled ?? true });
  const data = useMemo(
    () => (query.data ?? []).slice(0, HOMEPAGE_AUCTION_DISPLAY_LIMIT) as HomepageListing[],
    [query.data],
  );
  return { ...query, data };
}

/** Up to 6 upcoming open-house listings, sorted with image-having ones first. */
export function useHomepageOpenHouseListings(options: HomepageQueryOptions = {}) {
  return useQuery<HomepageListing[]>({
    queryKey: ["homepage-open-houses"],
    queryFn: async ({ signal }) => {
      try {
        const cached = await fetchPublicApi<HomepageListing[]>(
          "/api/public/homepage?section=open-houses",
          { throwOnError: true, timeoutMs: HOMEPAGE_SECTION_TIMEOUT_MS, signal },
        );
        if (cached) {
          const rows = sortByImagePresence(publicHomepageRows(cached));
          writeHomepageSnapshot(HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY, rows);
          return rows;
        }
        throw new Error("Public homepage open houses API returned no data");
      } catch (error) {
        if (isPublicApiAbort(error)) throw error;
        logger.warn("Public homepage open houses API failed; falling back to constrained Supabase read:", error);
        const rows = await fetchHomepageOpenHousesFallback(signal);
        writeHomepageSnapshot(HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY, rows);
        return rows;
      }
    },
    placeholderData: () => readHomepageSnapshot<HomepageListing[]>(HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY),
    enabled: options.enabled ?? true,
    staleTime: 2 * 60 * 1000,
  });
}
