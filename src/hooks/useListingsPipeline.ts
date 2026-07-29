import { useEffect, useMemo, useRef } from "react";
import { useListingsPaginated, type ListingsFilters, type ListingWithJoins } from "@/hooks/useListings";
import { listingToCard } from "@/lib/listingsCardUtils";
import { toast } from "sonner";

const MAP_AUTO_PAGE_BUDGET = 3;

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
  /** Selected view. All views use the same cursor-backed catalogue. */
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
  /** Current map viewport. Spatial filters are applied before catalogue ranking. */
  mapBounds?: {
    west: number;
    south: number;
    east: number;
    north: number;
  } | null;
}

/**
 * Encapsulates the data pipeline that powers `/listings`:
 *
 *   server filters → cursor-backed catalogue → cards → client-side post-filter
 *
 * Also wires up the infinite-scroll `IntersectionObserver` and emits a single
 * toast on fetch error. Returns the pipeline output plus a `sentinelRef` the
 * caller mounts on the bottom-of-list sentinel `<div>`.
 */
export function useListingsPipeline(opts: UseListingsPipelineOptions) {
  const {
    filters,
    viewMode,
    hasVideoViewing = false,
    hasVirtualTour = false,
    minAiScore = 0,
    minWalkability = 0,
    mapBounds = null,
  } = opts;

  const isGrid = viewMode === "grid";
  const serverFilters = useMemo<ListingsFilters>(() => ({
    ...filters,
    has_video_tour: hasVideoViewing || undefined,
    has_virtual_tour: hasVirtualTour || undefined,
    ai_score_min: minAiScore > 0 ? minAiScore : undefined,
    walkability_min: minWalkability > 0 ? minWalkability : undefined,
    boundsWest: !isGrid && mapBounds ? mapBounds.west : undefined,
    boundsSouth: !isGrid && mapBounds ? mapBounds.south : undefined,
    boundsEast: !isGrid && mapBounds ? mapBounds.east : undefined,
    boundsNorth: !isGrid && mapBounds ? mapBounds.north : undefined,
  }), [filters, hasVideoViewing, hasVirtualTour, isGrid, mapBounds, minAiScore, minWalkability]);

  const paginated = useListingsPaginated(serverFilters, { enabled: true });
  const loadedPageCount = paginated.data?.pages.length ?? 0;
  const fetchNextPage = paginated.fetchNextPage;
  const hasNextPage = !!paginated.hasNextPage;
  const isFetchingNextPage = !!paginated.isFetchingNextPage;
  const queryIsError = !!paginated.isError;

  const dbListings = useMemo<ListingWithJoins[]>(() => {
    return (paginated.data?.pages.flatMap((page) => page.data) ?? []) as ListingWithJoins[];
  }, [paginated.data]);

  const isLoading = paginated.isLoading;
  const isFetchNextPageError = !!paginated.isFetchNextPageError;
  const isError = queryIsError && !isFetchNextPageError;
  const error = paginated.error;

  useEffect(() => {
    if (
      viewMode !== "map" ||
      !mapBounds ||
      !hasNextPage ||
      isFetchingNextPage ||
      queryIsError ||
      loadedPageCount >= MAP_AUTO_PAGE_BUDGET
    ) {
      return;
    }
    void fetchNextPage();
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    mapBounds,
    queryIsError,
    loadedPageCount,
    viewMode,
  ]);

  // Infinite-scroll sentinel — load the next page when the user nears it.
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (
      viewMode === "map"
      || (viewMode === "split" && !mapBounds)
      || isFetchNextPageError
    ) return;
    const el = sentinelRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (
          entries[0]?.isIntersecting
          && hasNextPage
          && !isFetchingNextPage
          && !isFetchNextPageError
        ) {
          fetchNextPage();
        }
      },
      { rootMargin: "400px 0px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [
    fetchNextPage,
    hasNextPage,
    isFetchNextPageError,
    isFetchingNextPage,
    mapBounds,
    viewMode,
  ]);

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

    // Every view now preserves the canonical edge order. Re-sorting a bounded
    // map window would change paid-slot fairness and make it disagree with grid.
    return afterFilter;
  }, [sourceListings, hasVideoViewing, hasVirtualTour, minAiScore, minWalkability]);

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
    /** True while the active cursor query is loading its first page. */
    isLoading,
    /** True if the active fetch errored. */
    isError,
    /** True when a later cursor page failed after earlier rows loaded successfully. */
    isFetchNextPageError,
    /** Whether the cursor-backed fetch has more pages to load. */
    hasNextPage,
    /** True when the automatic map request budget was reached before exhausting the viewport. */
    isMapWindowIncomplete:
      viewMode === "map" &&
      hasNextPage &&
      loadedPageCount >= MAP_AUTO_PAGE_BUDGET,
    /** Whether the next-page fetch is currently in-flight. */
    isFetchingNextPage,
    /** Trigger fetching the next cursor page. */
    fetchNextPage,
    /** Mount on the bottom-of-list sentinel `<div>` so infinite-scroll auto-loads. */
    sentinelRef,
  };
}
