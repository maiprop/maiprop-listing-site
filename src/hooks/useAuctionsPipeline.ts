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
 *   raw fetch → tier-aware page cap → filter chain → polygon filter
 *     → pagination → derived stats (thisWeek / avgBid / mappableCount)
 *     → mapListings transform
 *
 * The cap is applied **before** filtering so that narrowing filters cannot be
 * used to bypass the per-tier item limit (free=60, pro=600, OS=∞).
 */
export function useAuctionsPipeline(opts: UseAuctionsPipelineOptions) {
  const {
    selectedCity,
    filterType,
    filterBidRange,
    filterYearRange,
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

  /** Per-plan auction cap. OS users and high-trust plans have no cap. */
  const participantType = getParticipantTypeFromProfile(profile);
  const configuredAuctionLimit = isMaiPropOsUser
    ? null
    : getPlanLimits(participantType, isPro ? "pro" : "free").auctionListingsVisible;
  const maxItems = configuredAuctionLimit ?? Infinity;
  const fetchLimit = Number.isFinite(maxItems) ? maxItems : undefined;

  const { data: auctions = [], isLoading, error } = useAuctionListings(fetchLimit);

  /** Distinct city list seeded with "All Cities". */
  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(auctions.map((a) => a.city).filter(Boolean))).sort();
    return ["All Cities", ...cities];
  }, [auctions]);

  /** Round dropdown options inferred from the data so we don't show "3rd+ Auction" if no row matches. */
  const roundOptions = useMemo(() => {
    const rounds = auctions.map((a) => getAuctionRound(a.tags)).filter((n): n is number => n != null);
    const result: { value: string; label: string }[] = [{ value: "", label: "All Rounds" }];
    if (rounds.some((n) => n === 1)) result.push({ value: "1", label: "1st Auction" });
    if (rounds.some((n) => n === 2)) result.push({ value: "2", label: "2nd Auction" });
    if (rounds.some((n) => n >= 3)) result.push({ value: "3plus", label: "3rd+ Auction" });
    return result;
  }, [auctions]);

  /**
   * Cap is applied on the RAW auctions list BEFORE filtering so that
   * narrowing filters cannot be used to bypass the per-tier item limit.
   * This is the same security boundary the inline pipeline maintained.
   */
  const cappedAuctions = useMemo(
    () => Number.isFinite(maxItems) ? auctions.slice(0, maxItems) : auctions,
    [auctions, maxItems]
  );
  const totalRaw = auctions.length; // full count for upsell copy

  const visibleFiltered = useMemo(() => {
    const predicate = buildAuctionFilter(
      { selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield },
      isPro,
      isMaiPropOsUser,
    );
    return cappedAuctions.filter(predicate);
  }, [cappedAuctions, selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield, isPro, isMaiPropOsUser]);

  const polygonFiltered = useMemo(() => {
    if (!polygonFilterIds) return visibleFiltered;
    return visibleFiltered.filter((a) => polygonFilterIds.has(a.id));
  }, [visibleFiltered, polygonFilterIds]);

  const totalPages = Math.max(1, Math.ceil(polygonFiltered.length / AUCTIONS_PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * AUCTIONS_PAGE_SIZE;
    return polygonFiltered.slice(start, start + AUCTIONS_PAGE_SIZE);
  }, [polygonFiltered, currentPage]);

  /** Reset to first page whenever any filter or the cap (tier change) flips. */
  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield, maxItems, setCurrentPage]);

  /** Clamp current page to total when filters reduce the result set. */
  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages, setCurrentPage]);

  const activeFilterCount = [
    filterType,
    filterBidRange,
    filterYearRange,
    ...(isPro || isMaiPropOsUser ? [filterOwnership, filterRound, filterYield] : []),
  ].filter(Boolean).length;

  /** Derived stats (rendered in the page hero / toolbar). */
  const thisWeek = useMemo(() => {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(todayStart);
    weekEnd.setDate(weekEnd.getDate() + 7);
    return visibleFiltered.filter((a) => {
      if (!a.auction_date) return false;
      const d = new Date(a.auction_date);
      const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
      return dayOnly >= todayStart && dayOnly <= weekEnd;
    }).length;
  }, [visibleFiltered]);

  const avgBid = useMemo(() => {
    if (!visibleFiltered.length) return 0;
    return Math.round(
      visibleFiltered.reduce((sum, a) => sum + (a.auction_starting_bid ?? a.price ?? 0), 0) /
      visibleFiltered.length
    );
  }, [visibleFiltered]);

  /** Map markers built from the *filtered* (not paginated) list so the map shows every visible result. */
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
    /** Capped, filtered, polygon-filtered list (length used for "Visible Auctions" stat). */
    visibleFiltered,
    /** Total count after polygon filter (used by "Showing X–Y of Z" copy in pagination). */
    polygonFilteredCount: polygonFiltered.length,
    /** Current page slice — what the list view renders. */
    paginated,
    /** Total page count (≥1). */
    totalPages,
    /** Derived stats. */
    thisWeek,
    avgBid,
    activeFilterCount,
    /** Pre-cap counts used by upsell banner copy. */
    totalRaw,
    /** Map markers (filtered, not paginated). */
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
