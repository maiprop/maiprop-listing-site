import { useEffect, useMemo, useRef } from "react";
import { useListings, useListingsPaginated, type ListingsFilters, type ListingWithJoins } from "@/hooks/useListings";
import { listingToCard, type ListingCardWithRaw } from "@/lib/listingsCardUtils";
import { toast } from "sonner";

/** Sort modes the listings UI exposes. Mirrors `selectedSort` in `useListingsFilters`. */
export type ListingsSort =
  | "featured"
  | "price-asc"
  | "price-desc"
  | "newest"
  | "ai-score"
  | "views"
  | (string & {}); // forward-compat for new sort options

export type ListingsViewMode = "grid" | "split" | "map";

export interface UseListingsPipelineOptions {
  /** Server-side filters constructed from `useListingsFilters()` URL state. */
  filters: ListingsFilters;
  /** Selected view — only `"grid"` paginates; `"split"` / `"map"` use the full-fetch (200 cap). */
  viewMode: ListingsViewMode;
  /** Selected sort, used as the final tiebreak inside the pipeline. */
  selectedSort: ListingsSort;
  /** Client-side filter: only listings with `_raw.has_video_tour === true`. */
  hasVideoViewing?: boolean;
  /** Client-side filter: only listings with `_raw.has_virtual_tour === true`. */
  hasVirtualTour?: boolean;
  /** Client-side filter: minimum AI score (0..100), 0 disables. */
  minAiScore?: number;
  /** Client-side filter: minimum walkability score (0..100), 0 disables. */
  minWalkability?: number;
}

const isPromoted = (p: ListingCardWithRaw) =>
  !!(p.isFeatured || (p.priorityPlacement ?? 0) > 0);

const byUserSort = (selectedSort: ListingsSort) =>
  (a: ListingCardWithRaw, b: ListingCardWithRaw) => {
    if (selectedSort === "featured") {
      const aF = a.isFeatured ? 1 : 0;
      const bF = b.isFeatured ? 1 : 0;
      if (bF !== aF) return bF - aF;
      const aPri = Number(a.priorityPlacement ?? 0);
      const bPri = Number(b.priorityPlacement ?? 0);
      if (bPri !== aPri) return bPri - aPri;
      return new Date(b._raw?.created_at || 0).getTime() - new Date(a._raw?.created_at || 0).getTime();
    }
    if (selectedSort === "price-asc") return a.price - b.price;
    if (selectedSort === "price-desc") return b.price - a.price;
    if (selectedSort === "newest") {
      return new Date(b._raw?.created_at || 0).getTime() - new Date(a._raw?.created_at || 0).getTime();
    }
    if (selectedSort === "ai-score") return (b.aiScore || 0) - (a.aiScore || 0);
    if (selectedSort === "views") return (b.views || 0) - (a.views || 0);
    return 0;
  };

const sortListings = (rows: ListingCardWithRaw[], selectedSort: ListingsSort): ListingCardWithRaw[] => {
  const userSort = byUserSort(selectedSort);
  return [...rows].sort((a, b) => {
    // "Spotlight First" sort: explicit spotlight ordering, skip automatic promo-first
    if (selectedSort === "featured") return userSort(a, b);
    const aPromo = isPromoted(a);
    const bPromo = isPromoted(b);
    if (aPromo && !bPromo) return -1;
    if (!aPromo && bPromo) return 1;
    if (aPromo && bPromo) {
      const pri = (b.priorityPlacement ?? 0) - (a.priorityPlacement ?? 0);
      if (pri !== 0) return pri;
      // Same priority bucket: featured beats non-featured. Mirrors the
      // server ORDER BY tiebreak in buildListingsQuery so that the client's
      // re-sort is a no-op on already-paginated server output.
      const aF = a.isFeatured ? 1 : 0;
      const bF = b.isFeatured ? 1 : 0;
      if (bF !== aF) return bF - aF;
    }
    return userSort(a, b);
  });
};

/**
 * Encapsulates the data pipeline that powers `/listings`:
 *
 *   server filters → dual fetch (paginated grid OR full-fetch map/split)
 *     → cards → client-side post-filter → promo-aware sort
 *
 * Also wires up the infinite-scroll `IntersectionObserver` and emits a single
 * toast on fetch error. Returns the pipeline output plus a `sentinelRef` the
 * caller mounts on the bottom-of-list sentinel `<div>`.
 */
export function useListingsPipeline(opts: UseListingsPipelineOptions) {
  const {
    filters,
    viewMode,
    selectedSort,
    hasVideoViewing = false,
    hasVirtualTour = false,
    minAiScore = 0,
    minWalkability = 0,
  } = opts;

  // Grid view paginates 24 at a time (infinite scroll). Map / split views need
  // every visible marker at once, so they use the bounded full-fetch (200 cap).
  // Only one query is enabled at a time to avoid wasting bandwidth.
  const isGrid = viewMode === "grid";
  const paginated = useListingsPaginated(filters, { enabled: isGrid });
  const fullFetch = useListings(filters, { enabled: !isGrid });

  const dbListings = useMemo<ListingWithJoins[]>(() => {
    // Both paths produce rows with the same shape that listingToCard() reads.
    // The type cast matches how useListings() casts its enriched rows internally
    // (ownerIsPro / ownerParticipantType are only set by the single-listing path).
    if (isGrid) return (paginated.data?.pages.flatMap((p) => p.data) ?? []) as ListingWithJoins[];
    return fullFetch.data ?? [];
  }, [isGrid, paginated.data, fullFetch.data]);

  const isLoading = isGrid ? paginated.isLoading : fullFetch.isLoading;
  const isError = isGrid ? paginated.isError : fullFetch.isError;
  const error = isGrid ? paginated.error : fullFetch.error;

  // Infinite-scroll sentinel — load the next 24 when the user nears it.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!isGrid) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && paginated.hasNextPage && !paginated.isFetchingNextPage) {
          paginated.fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isGrid, paginated]);

  useEffect(() => {
    if (isError && error) {
      toast.error("Could not load listings. Please try again.");
    }
  }, [isError, error]);

  const sourceListings = useMemo(() => dbListings.map(listingToCard), [dbListings]);

  const filtered = useMemo(() => {
    // Client-side filtering — only for fields not supported server-side
    const afterFilter = sourceListings.filter((p) => {
      const raw = p._raw;
      if (hasVideoViewing && !raw?.has_video_tour) return false;
      if (hasVirtualTour && !raw?.has_virtual_tour) return false;
      // The `hasMessaging` filter previously checked `raw.messaging_disabled`,
      // a field that doesn't exist on the listings schema — it was always
      // undefined and the predicate never excluded anything. Removed when
      // tightening types; revisit when a real "messaging disabled" column
      // ships (or move to an opt-out flag on profiles).
      if (minAiScore > 0 && !(Number(raw?.ai_score) >= minAiScore)) return false;
      if (minWalkability > 0 && !(Number(raw?.walkability_score) >= minWalkability)) return false;
      return true;
    });

    // User sort must NOT override paid prioritization unless "featured" is explicitly chosen.
    return sortListings(afterFilter, selectedSort);
  }, [sourceListings, hasVideoViewing, hasVirtualTour, minAiScore, minWalkability, selectedSort]);

  return {
    /** Final post-filter, post-sort listings cards — what the UI iterates. */
    filtered,
    /**
     * Number of rows actually returned by the server *before* client-side
     * post-filtering. Use this to distinguish "server returned nothing" from
     * "server returned rows but client filters excluded all of them" — e.g.
     * when deciding whether to show a "No listings matched your filters"
     * empty-state vs. a "still searching, fetching more pages" state.
     */
    totalLoaded: dbListings.length,
    /** True while the active fetch (paginated or full) is loading its first page. */
    isLoading,
    /** True if the active fetch errored. */
    isError,
    /** Whether the paginated fetch has more pages to load. Always false in non-grid views. */
    hasNextPage: !!paginated.hasNextPage,
    /** Whether the next-page fetch is currently in-flight. */
    isFetchingNextPage: !!paginated.isFetchingNextPage,
    /** Trigger fetching the next page (no-op in non-grid views). */
    fetchNextPage: paginated.fetchNextPage,
    /** Mount on the bottom-of-list sentinel `<div>` so infinite-scroll auto-loads. */
    sentinelRef,
  };
}
