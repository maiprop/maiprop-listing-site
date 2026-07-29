import { useEffect, useMemo } from "react";
import type { MapListing } from "@/components/MapView";
import { useAuctionListings } from "@/hooks/useAuctionListings";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { getPlanLimits } from "@/hooks/usePlanLimits";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import {
  ownershipMatches,
  getAuctionRound,
  estimateYield,
  yieldRange,
} from "@/lib/auctionUtils";
import { getAuctionImageList } from "@/lib/auctionStreetView";

/** Inferred row type returned by `useAuctionListings()`. */
type Auction = NonNullable<ReturnType<typeof useAuctionListings>["data"]>[number];
const EMPTY_AUCTIONS: Auction[] = [];

/** Page-size and per-tier maximums match the previous inline constants. */
export const AUCTIONS_PAGE_SIZE = 20;
/** Free tier: up to 3 pages = 60 items. */
export const AUCTIONS_MAX_PAGES_FREE = 3;
/** Pro tier: up to 30 pages = 600 items. */
export const AUCTIONS_MAX_PAGES_PRO = 30;

export interface UseAuctionsPipelineOptions {
  /** "All Cities" or a city name from `cityOptions`. */
  selectedCity: string;
  /** "" or `<base>:<subtype>` tuple (e.g. `"land:plot"`, `"commercial:retail"`). */
  filterType: string;
  /** "" or `min-max` (numeric). */
  filterBidRange: string;
  /** "" or `min-max` (numeric, year). */
  filterYearRange: string;
  /** "" or `min-max` (numeric, square metres). Can be URL/AI-derived. */
  filterSqmRange?: string;
  /** Premium filters. Only applied when `isPro || isMaiPropOsUser`. */
  filterOwnership: string;
  /** Premium: `""`, `"1"`, `"2"`, `"3plus"`. */
  filterRound: string;
  /** Premium: yield-range key understood by `yieldRange()`. */
  filterYield: string;
  /** Optional polygon filter (set of auction IDs); `null` disables. */
  polygonFilterIds: Set<string> | null;
  /** Current 1-based page index. Caller's `useState`. */
  currentPage: number;
  /** Setter to call when filters change so caller can reset to page 1. */
  setCurrentPage: (page: number | ((p: number) => number)) => void;
}

/**
 * Encapsulates the data pipeline that powers `/auctions`:
 *
 *   plan-aware request -> canonical server filters -> entitlement cap
 *     -> server pagination -> current-page map transform
 *
 * The public API filters the complete scheduled DB revision before enforcing
 * the per-tier visibility limit (free=60, paid/high-trust=600).
 */
export function useAuctionsPipeline(opts: UseAuctionsPipelineOptions) {
  const {
    selectedCity,
    filterType,
    filterBidRange,
    filterYearRange,
    filterSqmRange = "",
    filterOwnership,
    filterRound,
    filterYield,
    polygonFilterIds,
    currentPage,
    setCurrentPage,
  } = opts;

  const { profile } = useAuth();
  const { isPro } = useSubscription();
  const isMaiPropOsUser = isPlatformAdmin(profile);

  /** Per-plan auction cap. The canonical scheduled pool is bounded at 600. */
  const participantType = getParticipantTypeFromProfile(profile);
  const configuredAuctionLimit = isMaiPropOsUser
    ? AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE
    : getPlanLimits(participantType, isPro ? "pro" : "free").auctionListingsVisible;
  const maxItems = configuredAuctionLimit ?? AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE;
  const serverFilters = useMemo(() => ({
    city: selectedCity === "All Cities" ? undefined : selectedCity,
    propertyType: filterType || undefined,
    bidRange: filterBidRange || undefined,
    yearRange: filterYearRange || undefined,
    sqmRange: filterSqmRange || undefined,
    ownership: isPro || isMaiPropOsUser ? filterOwnership || undefined : undefined,
    round: isPro || isMaiPropOsUser ? filterRound || undefined : undefined,
    yield: isPro || isMaiPropOsUser ? filterYield || undefined : undefined,
    ids: polygonFilterIds ? [...polygonFilterIds].sort() : undefined,
  }), [
    filterBidRange,
    filterOwnership,
    filterRound,
    filterSqmRange,
    filterType,
    filterYearRange,
    filterYield,
    isMaiPropOsUser,
    isPro,
    polygonFilterIds,
    selectedCity,
  ]);
  const auctionQuery = useAuctionListings(maxItems, {
    page: currentPage,
    pageSize: AUCTIONS_PAGE_SIZE,
    filters: serverFilters,
  });
  const auctions = auctionQuery.data ?? EMPTY_AUCTIONS;
  const pageMeta = auctionQuery.auctionPage;
  const isLoading = auctionQuery.isLoading && auctionQuery.data == null;
  const error = auctionQuery.error;
  const visibleCount = pageMeta?.total ?? auctions.length;
  const totalRaw = pageMeta?.totalRaw ?? visibleCount;

  /** Distinct city list seeded with "All Cities". */
  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(
      pageMeta?.facets.cities.filter(Boolean) ??
      auctions.map((auction) => auction.city).filter((city): city is string => Boolean(city)),
    )).sort();
    return ["All Cities", ...cities];
  }, [auctions, pageMeta?.facets.cities]);

  /** Round dropdown options inferred from the data so we don't show "3rd+ Auction" if no row matches. */
  const roundOptions = useMemo(() => {
    const rounds = pageMeta?.facets.rounds ??
      auctions.map((auction) => getAuctionRound(auction.tags)).filter((round): round is number => round != null);
    const result: { value: string; label: string }[] = [{ value: "", label: "All Rounds" }];
    if (rounds.some((n) => n === 1)) result.push({ value: "1", label: "1st Auction" });
    if (rounds.some((n) => n === 2)) result.push({ value: "2", label: "2nd Auction" });
    if (rounds.some((n) => n >= 3)) result.push({ value: "3plus", label: "3rd+ Auction" });
    return result;
  }, [auctions, pageMeta?.facets.rounds]);

  // The API has already filtered, applied the entitlement cap, and paginated.
  const visibleFiltered = auctions;
  const paginated = auctions;
  const polygonFilteredCount = visibleCount;
  const totalPages = pageMeta?.totalPages ?? Math.max(
    1,
    Math.ceil(visibleCount / AUCTIONS_PAGE_SIZE),
  );

  /** Reset to first page whenever any filter or the cap (tier change) flips. */
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCity, filterType, filterBidRange, filterYearRange, filterSqmRange, filterOwnership, filterRound, filterYield, polygonFilterIds, maxItems, setCurrentPage]);

  /** Clamp current page to total when filters reduce the result set. */
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, setCurrentPage]);

  const activeFilterCount = [
    filterType,
    filterBidRange,
    filterYearRange,
    filterSqmRange,
    ...(isPro || isMaiPropOsUser ? [filterOwnership, filterRound, filterYield] : []),
  ].filter(Boolean).length;

  /** Derived stats cover the complete server-filtered entitlement window. */
  const thisWeek = pageMeta?.stats.thisWeek ?? 0;
  const avgBid = pageMeta?.stats.avgBid ?? 0;

  /** Map markers for the current server page. */
  const mapListings: MapListing[] = useMemo(() => {
    return visibleFiltered
      .filter((a) => a.latitude != null && a.longitude != null)
      .map((a) => ({
        id: a.id,
        title: a.title,
        price: a.auction_starting_bid ?? a.price ?? 0,
        sqm: a.sqm ?? 0,
        latitude: a.latitude,
        longitude: a.longitude,
        images: (() => {
          const streetViewImages = getAuctionImageList(a);
          if (streetViewImages.length) return streetViewImages;
          return [...(a.listing_images ?? [])]
            .sort((x, y) => x.sort_order - y.sort_order)
            .map((img) => img.url)
            .filter(Boolean);
        })(),
        listingType: "auction",
        city: a.city,
        _raw: a,
      }));
  }, [visibleFiltered]);

  const mappableCount = mapListings.length;

  return {
    /** Raw tier flags consumed by upsell banners and premium-filter rendering. */
    isPro,
    isMaiPropOsUser,
    /** Loading / error from the underlying React Query. */
    isLoading,
    error,
    /** Distinct city list. */
    cityOptions,
    /** Round dropdown options inferred from the data. */
    roundOptions,
    /** Current canonical server page. */
    visibleFiltered,
    visibleCount,
    /** Total count after filters and the entitlement cap. */
    polygonFilteredCount,
    /** Current page slice — what the list view renders. */
    paginated,
    /** Total page count (≥1). */
    totalPages,
    /** Derived stats. */
    thisWeek,
    avgBid,
    activeFilterCount,
    /** Filtered count before the entitlement cap. */
    totalRaw,
    /** Map markers for the current page. */
    mapListings,
    mappableCount,
  };
}

export type Auction_ = Auction; // re-export for callers if needed

// ─────────────────────────────────────────────────────────────────────────────
// Pure filter predicate — extracted to reduce cyclomatic complexity of the hook
// ─────────────────────────────────────────────────────────────────────────────

interface BuildAuctionFilterOpts {
  selectedCity: string;
  filterType: string;
  filterBidRange: string;
  filterYearRange: string;
  filterSqmRange?: string;
  filterOwnership: string;
  filterRound: string;
  filterYield: string;
}

/**
 * Returns a predicate function that tests a single auction against the
 * current filter state.  Extracted here (outside the hook body) so that
 * the per-call `useMemo` callback stays simple and DeepSource's cyclomatic-
 * complexity analyser sees two small functions instead of one large one.
 */
export function buildAuctionFilter(
  opts: BuildAuctionFilterOpts,
  isPro: boolean,
  isMaiPropOsUser: boolean,
): (a: Auction) => boolean {
  const {
    selectedCity,
    filterType,
    filterBidRange,
    filterYearRange,
    filterSqmRange = "",
    filterOwnership,
    filterRound,
    filterYield,
  } = opts;

  return (a: Auction): boolean => {
    if (selectedCity !== "All Cities" && !a.city?.toLowerCase().includes(selectedCity.toLowerCase())) return false;

    if (filterType) {
      const [base, subtype] = filterType.split(":");
      if (base && a.property_type !== base) return false;
      if (subtype && base === "land" && !a.tags?.includes(`land_type:${subtype}`)) return false;
      if (subtype && base === "commercial" && !a.tags?.includes(`commercial_type:${subtype}`)) return false;
    }

    if (filterBidRange) {
      const [min, max] = filterBidRange.split("-").map(Number);
      const bid = a.auction_starting_bid ?? a.price ?? 0;
      if (bid < min || bid > max) return false;
    }

    if (filterYearRange && a.year_built) {
      const [min, max] = filterYearRange.split("-").map(Number);
      if (a.year_built < min || a.year_built > max) return false;
    }

    if (filterSqmRange) {
      const [min, max] = filterSqmRange.split("-").map(Number);
      const sqm = Number(a.sqm ?? 0);
      if (!Number.isFinite(sqm) || sqm < min || sqm > max) return false;
    }

    if (isPro || isMaiPropOsUser) {
      if (filterOwnership && !ownershipMatches(filterOwnership, a.tags)) return false;
      if (filterRound) {
        const round = getAuctionRound(a.tags);
        if (filterRound === "3plus") {
          if (!round || round < 3) return false;
        } else {
          if (!round || round !== Number(filterRound)) return false;
        }
      }
      if (filterYield) {
        const range = yieldRange(filterYield);
        if (range) {
          const est = estimateYield(a);
          if (est === null || est < range[0] || est > range[1]) return false;
        }
      }
    }

    return true;
  };
}
