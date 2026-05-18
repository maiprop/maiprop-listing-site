/**
 * useListingsFilters — URL-based filter state for the listings page.
 *
 * All filter state lives in the URL (searchParams) so filters are:
 * - shareable (copy the URL and the same filters apply)
 * - bookmarkable
 * - preserved on back-navigation
 *
 * This hook owns reading and writing filter state only.
 * The actual client-side filter logic (the .filter() call over listings) stays
 * in the consuming component since it depends on the listing data shape.
 */

import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";

export interface ListingsFilterState {
  // Filter values
  searchQuery: string;
  selectedListingType: string;
  selectedType: string;
  selectedSubtype: string;
  selectedPrice: string;
  selectedSort: string;
  bedsRange: [string, string];
  bathsRange: [string, string];
  floorRange: [string, string];
  yearRange: [string, string];
  minSqm: string;
  maxSqm: string;
  selectedEnergyClasses: string[];
  selectedFeatures: string[];
  selectedHeating: string;
  selectedConstruction: string;
  preSaleOnly: boolean;
  offMarketOnly: boolean;
  // Pro filters
  hasVideoViewing: boolean;
  hasVirtualTour: boolean;
  hasMessaging: boolean;
  minAiScore: number;
  minWalkability: number;
  // Derived
  activeFilterCount: number;
  proFilterCount: number;
  isRent: boolean;
  /** Serialised filter state for saving as a saved search */
  currentFilters: Record<string, string>;
}

export interface ListingsFilterActions {
  setParam: (key: string, value: string) => void;
  /** Set multiple params in a single history entry (avoids two-step URL flicker). */
  setParams: (pairs: Array<[string, string]>) => void;
  toggleMulti: (key: string, value: string) => void;
  clearAllFilters: () => void;
  applyAIFilters: (filters: Record<string, unknown> | { [key: string]: unknown }) => void;
  /** Read an arbitrary URL param not covered by the typed state above. */
  getParam: (key: string, fallback?: string) => string;
  /** Read a multi-value URL param not covered by the typed state above. */
  getMulti: (key: string) => string[];
}

export function useListingsFilters(): ListingsFilterState & ListingsFilterActions {
  const [searchParams, setSearchParams] = useSearchParams();

  // ── Primitive readers ──────────────────────────────────────────────────────

  const getParam = (key: string, fallback = "") => searchParams.get(key) || fallback;
  const getMulti = (key: string): string[] =>
    (searchParams.get(key) || "").split(",").filter(Boolean);

  // ── Filter values ──────────────────────────────────────────────────────────

  const searchQuery = getParam("city");
  const selectedListingType = getParam("listing_type");
  const selectedType = getParam("type");
  const selectedSubtype = getParam("subtype");
  const selectedPrice = getParam("price");
  const selectedSort = getParam("sort", "relevant");
  const bedsRange: [string, string] = [getParam("beds_min"), getParam("beds_max")];
  const bathsRange: [string, string] = [getParam("baths_min"), getParam("baths_max")];
  const floorRange: [string, string] = [getParam("floor_min"), getParam("floor_max")];
  const yearRange: [string, string] = [getParam("year_min"), getParam("year_max")];
  const minSqm = getParam("sqm_min");
  const maxSqm = getParam("sqm_max");
  const selectedEnergyClasses = getMulti("energy");
  const selectedFeatures = getMulti("features");
  const selectedHeating = getParam("heating");
  const selectedConstruction = getParam("construction");
  const preSaleOnly = searchParams.get("pre_sale") === "1";
  const offMarketOnly = searchParams.get("off_market") === "1";
  const hasVideoViewing = searchParams.get("video_viewing") === "1";
  const hasVirtualTour = searchParams.get("virtual_tour") === "1";
  const hasMessaging = searchParams.get("messaging") === "1";
  const minAiScore = Number(searchParams.get("min_ai_score") || "0");
  const minWalkability = Number(searchParams.get("min_walkability") || "0");

  // ── Derived ────────────────────────────────────────────────────────────────

  const proFilterCount = [
    hasVideoViewing, hasVirtualTour, hasMessaging,
    minAiScore > 0, minWalkability > 0,
  ].filter(Boolean).length;

  const activeFilterCount = [
    selectedType, selectedSubtype, selectedPrice,
    bedsRange[0], bedsRange[1], bathsRange[0], bathsRange[1],
    floorRange[0], floorRange[1], yearRange[0], yearRange[1],
    minSqm, maxSqm, selectedHeating, selectedConstruction,
    preSaleOnly || undefined,
    offMarketOnly || undefined,
    ...selectedEnergyClasses, ...selectedFeatures,
    hasVideoViewing || undefined, hasVirtualTour || undefined,
    hasMessaging || undefined,
    minAiScore > 0 ? minAiScore : undefined,
    minWalkability > 0 ? minWalkability : undefined,
  ].filter(Boolean).length;

  const isRent = selectedListingType === "rent";

  const currentFilters = Object.fromEntries(
    [...searchParams.entries()].filter(([, v]) => v)
  );

  // ── Actions ────────────────────────────────────────────────────────────────

  const setParam = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const setParams = useCallback((pairs: Array<[string, string]>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      for (const [key, value] of pairs) {
        if (value) next.set(key, value); else next.delete(key);
      }
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const toggleMulti = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      const current = (next.get(key) || "").split(",").filter(Boolean);
      const idx = current.indexOf(value);
      if (idx >= 0) current.splice(idx, 1); else current.push(value);
      if (current.length) next.set(key, current.join(",")); else next.delete(key);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const clearAllFilters = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams();
      // Preserve city (user typed it in the search bar, not a filter)
      const city = prev.get("city");
      if (city) next.set("city", city);
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  const applyAIFilters = useCallback((filters: Record<string, unknown>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (filters.city) next.set("city", String(filters.city));
      if (filters.listing_type) next.set("listing_type", String(filters.listing_type));
      else next.delete("listing_type");
      if (filters.property_type) next.set("type", String(filters.property_type));
      else next.delete("type");
      if (filters.price_min != null || filters.price_max != null) {
        const min = Number(filters.price_min ?? 0);
        const max = Number(filters.price_max ?? 9999999);
        next.set("price", `${min}-${max}`);
      }
      const maybeSet = (key: string, val: unknown) => {
        if (val != null && val !== "") next.set(key, String(val));
        else next.delete(key);
      };
      maybeSet("beds_min", filters.beds_min);
      maybeSet("beds_max", filters.beds_max);
      maybeSet("sqm_min", filters.sqm_min);
      maybeSet("sqm_max", filters.sqm_max);
      maybeSet("heating", filters.heating);
      if (Array.isArray(filters.features) && filters.features.length)
        next.set("features", (filters.features as string[]).join(","));
      if (Array.isArray(filters.energy) && filters.energy.length)
        next.set("energy", (filters.energy as string[]).join(","));
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  return {
    // State
    searchQuery, selectedListingType, selectedType, selectedSubtype,
    selectedPrice, selectedSort, bedsRange, bathsRange, floorRange,
    yearRange, minSqm, maxSqm, selectedEnergyClasses, selectedFeatures,
    selectedHeating, selectedConstruction, preSaleOnly, offMarketOnly,
    hasVideoViewing, hasVirtualTour, hasMessaging, minAiScore, minWalkability,
    // Derived
    activeFilterCount, proFilterCount, isRent, currentFilters,
    // Actions
    setParam, setParams, toggleMulti, clearAllFilters, applyAIFilters,
    // Raw accessors (for params not in the named state above)
    getParam, getMulti,
  };
}
