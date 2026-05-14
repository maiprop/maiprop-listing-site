import { useState, useMemo, lazy, Suspense, useCallback } from "react";
import { Helmet } from "react-helmet-async";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import {
  Search, SlidersHorizontal, MapPin, LayoutGrid, Map,
  X, ArrowUpDown, Loader2, Bookmark, GitCompare,
  Columns2, ChevronDown, Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { PropertyCard } from "@/components/PropertyCard";
import { PropertyCardSkeleton } from "@/components/PropertyCardSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { Footer } from "@/components/Footer";
const MapView = lazy(() => import("@/components/MapView").then(m => ({ default: m.MapView })));
const CompareDrawer = lazy(() => import("@/components/CompareDrawer").then(m => ({ default: m.CompareDrawer })));
import { SaveSearchModal } from "@/components/SaveSearchModal";
import { AISearchBar } from "@/components/AISearchBar";
import { ListingsAdvancedFilters } from "@/components/listings/ListingsAdvancedFilters";
import { ListingTypeButton } from "@/components/listings/ListingTypeButton";
import { PropertyTypeButton } from "@/components/listings/PropertyTypeButton";
import { MapGate } from "@/components/listings/MapGate";
import { ListingCompareButton } from "@/components/listings/ListingCompareButton";
import { VirtualizedListingGrid } from "@/components/listings/VirtualizedListingGrid";

import type { ListingsFilters } from "@/hooks/useListings";
import { useListingsFilters } from "@/hooks/useListingsFilters";
import { useListingsPipeline } from "@/hooks/useListingsPipeline";
import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";
import { useAuth } from "@/contexts/AuthContext";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { getTypeLabel, getSubtypeLabel, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { HEATING_TYPES, CONSTRUCTION_STATUSES } from "@/lib/filterConfig";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import {
  buyPriceRanges, rentPriceRanges, listingTypeOptions, sortOptions,
} from "@/lib/listingsConfig";
import { mapListingFromCard } from "@/lib/listingsPerformance";

export default function Listings() {
  const { t } = useTranslation();

  const [viewMode, setViewMode] = useState<"grid" | "split" | "map">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [compareList, setCompareList] = useState<ListingCardWithRaw[]>([]);
  const [viewportIds, setViewportIds] = useState<Set<string> | null>(null);
  const [polygonFilterIds, setPolygonFilterIds] = useState<Set<string> | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const { user } = useAuth();
  const { consent, accept } = useCookieConsent();

  const {
    searchQuery, selectedListingType, selectedType, selectedSubtype,
    selectedPrice, selectedSort, bedsRange, bathsRange, floorRange,
    yearRange, minSqm, maxSqm, selectedEnergyClasses, selectedFeatures,
    selectedHeating, selectedConstruction, preSaleOnly, offMarketOnly,
    hasVideoViewing, hasVirtualTour, hasMessaging, minAiScore, minWalkability,
    activeFilterCount, currentFilters,
    setParam, setParams, toggleMulti, clearAllFilters, applyAIFilters,
  } = useListingsFilters();

  // AI-powered smart filters — fetch once per type/subtype combo, cached in memory
  const { config: aiFilterConfig } = useSmartFilters(
    selectedType, selectedSubtype, selectedListingType
  );

  // Parse selectedPrice range string "100000-500000" → min/max numbers
  const [priceMin, priceMax] = selectedPrice
    ? selectedPrice.split("-").map(Number)
    : [undefined, undefined];

  const filters = useMemo<ListingsFilters>(() => ({
    city: searchQuery || undefined,
    listing_type: preSaleOnly ? "sale" : (selectedListingType || undefined),
    property_type: selectedType || undefined,
    is_pre_sale: preSaleOnly || undefined,
    is_off_market: offMarketOnly || undefined,
    price_min: priceMin || undefined,
    price_max: priceMax || undefined,
    beds_min: bedsRange[0] ? Number(bedsRange[0]) : undefined,
    beds_max: bedsRange[1] ? Number(bedsRange[1]) : undefined,
    baths_min: bathsRange[0] ? Number(bathsRange[0]) : undefined,
    baths_max: bathsRange[1] ? Number(bathsRange[1]) : undefined,
    floor_min: floorRange[0] ? Number(floorRange[0]) : undefined,
    floor_max: floorRange[1] ? Number(floorRange[1]) : undefined,
    year_min: yearRange[0] ? Number(yearRange[0]) : undefined,
    year_max: yearRange[1] ? Number(yearRange[1]) : undefined,
    sqm_min: minSqm ? Number(minSqm) : undefined,
    sqm_max: maxSqm ? Number(maxSqm) : undefined,
    energy_class: selectedEnergyClasses.length > 0 ? selectedEnergyClasses : undefined,
    heating_system: selectedHeating || undefined,
    construction_status: selectedConstruction || undefined,
    commercial_subtype: selectedSubtype || undefined,
    features: selectedFeatures.length > 0 ? selectedFeatures : undefined,
    sort: (selectedSort as ListingsFilters["sort"]) || undefined,
  }), [
    searchQuery, preSaleOnly, selectedListingType, selectedType, offMarketOnly,
    priceMin, priceMax, bedsRange, bathsRange, floorRange, yearRange,
    minSqm, maxSqm, selectedEnergyClasses, selectedHeating, selectedConstruction,
    selectedSubtype, selectedFeatures, selectedSort,
  ]);

  const {
    filtered,
    totalLoaded,
    isLoading,
    isError,
    hasNextPage,
    isFetchingNextPage,
    sentinelRef,
  } = useListingsPipeline({
    filters,
    viewMode,
    selectedSort,
    hasVideoViewing,
    hasVirtualTour,
    minAiScore,
    minWalkability,
  });

  const mapListings = useMemo(() => filtered.map(mapListingFromCard), [filtered]);

  // Compare helpers
  const toggleCompare = useCallback((listing: ListingCardWithRaw) => {
    setCompareList(prev => {
      const exists = prev.find(l => l.id === listing.id);
      if (exists) return prev.filter(l => l.id !== listing.id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, listing];
    });
  }, []);
  const isComparing = useCallback((id: string) => compareList.some(l => l.id === id), [compareList]);
  const renderListingCard = useCallback((property: ListingCardWithRaw) => (
    <div key={property.id} className="relative group">
      <PropertyCard property={property} />
      <ListingCompareButton
        listing={property}
        isSelected={isComparing(property.id)}
        isLimitReached={compareList.length >= 3}
        onToggle={toggleCompare}
      />
    </div>
  ), [compareList, isComparing, toggleCompare]);

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>Properties for Sale &amp; Rent in Greece — maiProp</title>
        <meta name="description" content="Search thousands of properties for sale and rent across Greece. Filter by city, type, price and more." />
        <link rel="canonical" href="https://maiprop.co/listings" />
        <meta property="og:title" content="Properties for Sale &amp; Rent in Greece — maiProp" />
        <meta property="og:description" content="Search thousands of properties for sale and rent across Greece." />
        <meta property="og:url" content="https://maiprop.co/listings" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SearchResultsPage",
          "name": "Properties for Sale & Rent in Greece",
          "description": "Search thousands of properties for sale and rent across Greece.",
          "url": "https://maiprop.co/listings",
          "provider": { "@type": "Organization", "name": "maiProp", "url": "https://maiprop.co" },
        })}</script>
      </Helmet>
      <Navbar />

      <main id="main-content" className="pt-16">
        <h1 className="sr-only">{t("listings.pageTitle", "Properties for Sale & Rent")}</h1>
        {/* Filter bar — sticky only on sm+ to avoid consuming 104px of viewport on mobile */}
        <div className="bg-card border-b border-border sm:sticky sm:top-16 z-40">
          <div className="container py-2 sm:py-4 space-y-2 sm:space-y-0">

            {/* ── MOBILE FILTER BAR ── */}
            <div className="sm:hidden space-y-2">
              {/* Row 1: Buy/Rent tabs + view toggle + filter button */}
              <div className="flex gap-2 items-center">
                {/* Buy / Rent pills */}
                <div className="flex gap-1 bg-secondary border border-border rounded-xl p-1 shrink-0">
                  {listingTypeOptions.map(o => (
                    <button
                      key={o.value}
                      onClick={() => setParam("listing_type", o.value)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                        selectedListingType === o.value
                          ? "bg-primary text-primary-foreground shadow-sm"
                          : "text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {t(o.labelKey)}
                    </button>
                  ))}
                </div>
                {/* Search */}
                <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors min-w-0">
                  <Search className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
                  <input
                    type="text"
                    placeholder="City…"
                    aria-label="Search by city"
                    value={searchQuery}
                    onChange={e => setParam("city", e.target.value)}
                    className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                  />
                  {searchQuery && (
                    <button onClick={() => setParam("city", "")}><X className="w-3 h-3 text-muted-foreground" /></button>
                  )}
                </div>
                {/* View toggle */}
                <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                  <button
                    onClick={() => setViewMode("grid")}
                    aria-label="Grid view"
                    aria-pressed={viewMode === "grid"}
                    className={`p-2 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    <LayoutGrid className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setViewMode("map")}
                    aria-label="Map view"
                    aria-pressed={viewMode === "map" || viewMode === "split"}
                    className={`p-2 transition-colors ${viewMode === "map" || viewMode === "split" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    <Map className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                {/* Filters button */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  aria-label={activeFilterCount > 0 ? `Filters (${activeFilterCount} active)` : "Filters"}
                  aria-expanded={showFilters}
                  className={`shrink-0 flex items-center gap-1 px-2.5 py-2 rounded-xl border text-xs font-medium transition-colors ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>
                  <SlidersHorizontal className="w-4 h-4" aria-hidden="true" />
                  {activeFilterCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center" aria-hidden="true">{activeFilterCount}</span>
                  )}
                </button>
              </div>

              {/* Filters dropdown panel */}
              {showFilters && (
                <div className="border border-border rounded-xl bg-card/95 p-4 space-y-4">
                  {/* Property type */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("listings.filters.propertyType")}</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {[
                        { value: "", label: t("listings.filters.allTypes") },
                        { value: "apartment", label: t("listings.propertyTypes.apartment") },
                        { value: "house", label: t("listings.propertyTypes.house") },
                        { value: "villa", label: t("listings.propertyTypes.villa") },
                        { value: "land", label: t("listings.propertyTypes.land") },
                        { value: "commercial", label: t("listings.propertyTypes.commercial") },
                        { value: "office", label: t("listings.propertyTypes.office") },
                      ].map(typeOpt => (
                        <button key={typeOpt.value}
                          onClick={() => { setParam("type", typeOpt.value); setParam("subtype", ""); }}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                            selectedType === typeOpt.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                          }`}>{typeOpt.label}</button>
                      ))}
                    </div>
                  </div>
                  {/* Price */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("listings.filters.priceRange")}</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {(selectedListingType === "rent" ? rentPriceRanges : buyPriceRanges).map(o => (
                        <button key={o.value}
                          onClick={() => setParam("price", o.value)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${
                            selectedPrice === o.value
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                          }`}>{o.label}</button>
                      ))}
                    </div>
                  </div>
                  {/* Size */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Size (m²)</span>
                    <div className="flex gap-2">
                      <input type="number" placeholder="Min m²" value={minSqm}
                        onChange={e => setParam("sqm_min", e.target.value)}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground outline-none focus:border-primary" />
                      <input type="number" placeholder="Max m²" value={maxSqm}
                        onChange={e => setParam("sqm_max", e.target.value)}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground outline-none focus:border-primary" />
                    </div>
                  </div>
                  {/* Bedrooms */}
                  <div className="space-y-1.5">
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{t("listings.filters.bedrooms")}</span>
                    <div className="flex gap-1.5 flex-wrap">
                      {["", "1", "2", "3", "4", "5"].map(b => (
                        <button key={b}
                          onClick={() => setParam("beds_min", b)}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                            bedsRange[0] === b
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                          }`}>{b === "" ? t("listings.filters.allTypes") : `${b}+`}</button>
                      ))}
                    </div>
                  </div>
                  {/* Listing status */}
                  {(selectedListingType === "sale" || !selectedListingType) && (
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</span>
                      <div className="flex gap-3 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={offMarketOnly}
                            onChange={e => setParam("off_market", e.target.checked ? "1" : "")}
                            className="rounded border-border accent-primary" />
                          <span className="text-sm">🔒 Off-market</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={preSaleOnly}
                            onChange={e => setParam("pre_sale", e.target.checked ? "1" : "")}
                            className="rounded border-border accent-primary" />
                          <span className="text-sm">🏗️ Pre-sale</span>
                        </label>
                      </div>
                    </div>
                  )}
                  {activeFilterCount > 0 && (
                    <button onClick={clearAllFilters}
                      className="w-full py-2 text-xs text-muted-foreground border border-border rounded-lg hover:text-foreground hover:border-primary/30 transition-colors">
                      Clear all filters
                    </button>
                  )}
                </div>
              )}

              {/* Active filter chips — shown when panel is closed */}
              {activeFilterCount > 0 && !showFilters && (
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                  {selectedType && <button onClick={() => { setParam("type", ""); setParam("subtype", ""); }} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{selectedType} <X className="w-3 h-3" /></button>}
                  {selectedPrice && <button onClick={() => setParam("price", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{[...buyPriceRanges, ...rentPriceRanges].find(r => r.value === selectedPrice)?.label || selectedPrice} <X className="w-3 h-3" /></button>}
                  {bedsRange[0] && <button onClick={() => setParam("beds_min", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{bedsRange[0]}+ beds <X className="w-3 h-3" /></button>}
                  {(minSqm || maxSqm) && <button onClick={() => { setParam("sqm_min", ""); setParam("sqm_max", ""); }} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">Size <X className="w-3 h-3" /></button>}
                  {hasVideoViewing && <button onClick={() => setParam("video_viewing", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🎥 Video <X className="w-3 h-3" /></button>}
                  {hasVirtualTour && <button onClick={() => setParam("virtual_tour", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🔮 Virtual <X className="w-3 h-3" /></button>}
                  {hasMessaging && <button onClick={() => setParam("messaging", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">💬 Messaging <X className="w-3 h-3" /></button>}
                  {minAiScore > 0 && <button onClick={() => setParam("min_ai_score", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🤖 AI {minAiScore}+ <X className="w-3 h-3" /></button>}
                  {minWalkability > 0 && <button onClick={() => setParam("min_walkability", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🚶 Walk {minWalkability}+ <X className="w-3 h-3" /></button>}
                  <button onClick={clearAllFilters} className="text-xs text-muted-foreground shrink-0 ml-1">Clear all</button>
                </div>
              )}
            </div>

            {/* ── DESKTOP FILTER BAR (unchanged) ── */}
            <div className="hidden sm:flex gap-2 items-center overflow-x-auto scrollbar-none sm:flex-wrap">
              {/* Search */}
              <div className="shrink-0 flex-1 min-w-[200px] flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border focus-within:border-primary transition-colors">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="City, area, address..."
                  aria-label="Search by city or area"
                  value={searchQuery}
                  onChange={e => setParam("city", e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                {searchQuery && (
                  <button onClick={() => setParam("city", "")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                )}
              </div>
              <ListingTypeButton value={selectedListingType} onChange={v => setParam("listing_type", v)} />
              <PropertyTypeButton
                value={selectedType}
                subtype={selectedSubtype}
                onChange={(type, sub) => setParams([["type", type || ""], ["subtype", sub || ""]])}
              />
              <div className="relative">
                <select value={selectedPrice} onChange={e => setParam("price", e.target.value)}
                  aria-label="Price range"
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {(selectedListingType === "rent" ? rentPriceRanges : buyPriceRanges).map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select value={selectedSort} onChange={e => setParam("sort", e.target.value)}
                  aria-label="Sort by"
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {sortOptions.map(o => <option key={o.value} value={o.value} className="bg-card">{t(o.labelKey)}</option>)}
                </select>
                <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <Button variant="outline"
                className={`border-border gap-2 shrink-0 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
                onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal className="w-4 h-4" />
                More Filters
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilterCount}</span>
                )}
              </Button>
              <AISearchBar onFiltersApplied={applyAIFilters as (filters: { city?: string | null; listing_type?: string | null; property_type?: string | null; }) => void} />
              {user && (
                <Button variant="outline" className="border-border gap-2 shrink-0"
                  onClick={() => setShowSaveModal(true)}>
                  <Bookmark className="w-4 h-4" />
                  {t("listings.saveSearch")}
                </Button>
              )}
              <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                <button onClick={() => setViewMode("grid")} aria-label="Grid view" aria-pressed={viewMode === "grid"}
                  className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("split")} aria-label="Split view" aria-pressed={viewMode === "split"}
                  className={`p-2.5 transition-colors ${viewMode === "split" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <Columns2 className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("map")} aria-label="Map view" aria-pressed={viewMode === "map"}
                  className={`p-2.5 transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <Map className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Desktop active filter chips */}
            {activeFilterCount > 0 && (
              <div className="hidden sm:flex items-center gap-2 mt-3 flex-wrap overflow-x-auto scrollbar-none pb-0.5">
                <span className="text-xs text-muted-foreground shrink-0">Active:</span>
                {selectedType && <button onClick={() => { setParam("type", ""); setParam("subtype", ""); }} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">{PROPERTY_TYPE_MAP[selectedType as PropertyTypeKey]?.emoji} {getTypeLabel(selectedType)} <X className="w-3 h-3" /></button>}
                {selectedSubtype && selectedType && <button onClick={() => setParam("subtype", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">{getSubtypeLabel(selectedType, selectedSubtype)} <X className="w-3 h-3" /></button>}
                {selectedPrice && <button onClick={() => setParam("price", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">{[...buyPriceRanges, ...rentPriceRanges].find(r => r.value === selectedPrice)?.label || selectedPrice} <X className="w-3 h-3" /></button>}
                {bedsRange[0] && <button onClick={() => setParam("beds_min", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">{bedsRange[0]}+ beds <X className="w-3 h-3" /></button>}
                {selectedEnergyClasses.map(ec => <button key={ec} onClick={() => toggleMulti("energy", ec)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">Energy {ec} <X className="w-3 h-3" /></button>)}
                {selectedFeatures.map(f => {
                  return <button key={f} onClick={() => toggleMulti("features", f)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">{aiFilterConfig.features.find(o => o.key === f)?.label.replace(/^[^\s]+ /, "") || f} <X className="w-3 h-3" /></button>;
                })}
                {selectedHeating && <button onClick={() => setParam("heating", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">Heating: {HEATING_TYPES.find(h => h.value === selectedHeating)?.label || selectedHeating} <X className="w-3 h-3" /></button>}
                {selectedConstruction && <button onClick={() => setParam("construction", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">{CONSTRUCTION_STATUSES.find(s => s.value === selectedConstruction)?.label || selectedConstruction} <X className="w-3 h-3" /></button>}
                {offMarketOnly && <button onClick={() => setParam("off_market", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">🔒 Off-market <X className="w-3 h-3" /></button>}
                {preSaleOnly && <button onClick={() => setParam("pre_sale", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0">🏗️ Pre-sale <X className="w-3 h-3" /></button>}
                {hasVideoViewing && <button onClick={() => setParam("video_viewing", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">🎥 Video Viewing <X className="w-3 h-3" /></button>}
                {hasVirtualTour && <button onClick={() => setParam("virtual_tour", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">🔮 Virtual Tour <X className="w-3 h-3" /></button>}
                {hasMessaging && <button onClick={() => setParam("messaging", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">💬 Messaging <X className="w-3 h-3" /></button>}
                {minAiScore > 0 && <button onClick={() => setParam("min_ai_score", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">🤖 AI score {minAiScore}+ <X className="w-3 h-3" /></button>}
                {minWalkability > 0 && <button onClick={() => setParam("min_walkability", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0">🚶 Walk {minWalkability}+ <X className="w-3 h-3" /></button>}
                <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1 shrink-0">Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Filters Panel — AI-powered */}
        {showFilters && (
          <ListingsAdvancedFilters filteredCount={filtered.length} onClose={() => setShowFilters(false)} />
        )}

        {/* Results */}
        <div className={`${viewMode === "split" ? "" : "container"} py-4 sm:py-8 pb-28 lg:pb-8`}>
          {/* Stats bar */}
          <div className={`flex items-center justify-between mb-6 flex-wrap gap-3 ${viewMode === "split" ? "container" : ""}`}>
            <div className="flex items-center gap-3">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label="Loading listings" />
              ) : (
                <span className="font-display font-semibold" aria-live="polite" aria-atomic="true">
                  {viewMode === "split" && polygonFilterIds !== null
                    ? `${filtered.filter(p => polygonFilterIds.has(p.id)).length} in area`
                    : viewMode === "split" && viewportIds !== null
                    ? `${filtered.filter(p => viewportIds.has(p.id)).length} in view`
                    : `${filtered.length} properties`}
                </span>
              )}
              {totalLoaded === 0 && !isLoading && (
                <span className="text-muted-foreground text-sm">No listings matched your filters</span>
              )}
              {viewMode === "split" && polygonFilterIds !== null && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Area filter
                </span>
              )}
              {viewMode === "split" && viewportIds !== null && polygonFilterIds === null && (
                <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                  Map synced
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {compareList.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-xs text-accent font-medium">
                  <GitCompare className="w-3.5 h-3.5" />
                  {compareList.length} selected to compare
                </div>
              )}
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-1.5" asChild>
                <Link to="/listings/new"><Building2 className="w-3.5 h-3.5" /> Post Listing</Link>
              </Button>
            </div>
          </div>

          {/* ── Split view ── */}
          {viewMode === "split" ? (() => {
            const splitDisplayList = polygonFilterIds !== null
              ? filtered.filter(p => polygonFilterIds.has(p.id))
              : viewportIds !== null
              ? filtered.filter(p => viewportIds.has(p.id))
              : filtered;
            const gridCards = splitDisplayList.length === 0 ? (
              <div className="glass-card rounded-xl p-10 text-center mt-4">
                <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold text-sm">No properties here</p>
                <p className="text-xs text-muted-foreground mt-1">Pan the map or clear any area filter</p>
              </div>
            ) : (
              <VirtualizedListingGrid
                items={splitDisplayList}
                columns={1}
                gap={12}
                estimateItemHeight={380}
                className="grid grid-cols-1 gap-3"
                renderItem={renderListingCard}
                data-testid="split-listing-grid"
              />
            );

            return (
              <div className="flex flex-col md:flex-row gap-0 md:h-[calc(100vh-16rem)]">
                {/* Mobile tab bar (split mode only) */}
                <div className="md:hidden flex border-b border-border shrink-0">
                  <button
                    onClick={() => setMobileTab("list")}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === "list" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
                  >
                    List ({splitDisplayList.length})
                  </button>
                  <button
                    onClick={() => setMobileTab("map")}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === "map" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
                  >
                    Map
                  </button>
                </div>

                {/* Left: scrollable grid — hidden on mobile when map tab active */}
                <div className={`md:w-[420px] shrink-0 overflow-y-auto px-4 space-y-3 pb-8 border-r border-border
                  ${mobileTab === "map" ? "hidden md:block" : "block"}
                  md:h-full h-[60vh]`}
                >
                  {isLoading
                    ? <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={i} />)}</div>
                    : isError
                    ? <EmptyState icon={Building2} title="Failed to load listings" subtitle="Please try again" action={{ label: "Retry", onClick: () => window.location.reload() }} />
                    : gridCards
                  }
                </div>

                {/* Right: map — hidden on mobile when list tab active */}
                <div className={`flex-1 ${mobileTab === "list" ? "hidden md:block" : "block"} md:h-full h-[calc(100vh-12rem)]`}>
                  <MapGate consent={consent} accept={accept} height="100%">
                    <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                      <MapView
                        listings={mapListings}
                        onVisibleListingsChange={setViewportIds}
                        onPolygonFilter={ids => { setPolygonFilterIds(ids); }}
                        height="100%"
                      />
                    </Suspense>
                  </MapGate>
                </div>
              </div>
            );
          })() : viewMode === "grid" ? (
            isLoading ? (
              <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                {Array.from({ length: 8 }).map((_, i) => <PropertyCardSkeleton key={i} />)}
              </div>
            ) : isError ? (
              <EmptyState
                icon={Building2}
                title="Could not load listings"
                subtitle="Please try again later"
                action={{ label: "Retry", onClick: () => window.location.reload() }}
                testId="empty-listings"
              />
            ) : filtered.length === 0 && !hasNextPage ? (
              /* Show "no results" only when we have actually exhausted the
               * paginated source. Client-side filters (hasVideoViewing,
               * hasVirtualTour, minAiScore, minWalkability) may exclude every
               * row in the first 24-row page even though later pages would
               * match — keep the sentinel rendered (next branch) so
               * fetchNextPage continues until either we get a hit or
               * hasNextPage flips to false. */
              <EmptyState
                icon={Building2}
                title={t("listings.noResults")}
                subtitle={t("listings.noResultsSubtitle")}
                action={activeFilterCount > 0 ? { label: t("listings.filters.reset"), onClick: clearAllFilters } : undefined}
                testId="empty-listings"
              />
            ) : (
              <>
                {filtered.length > 0 && (
                  <VirtualizedListingGrid
                    items={filtered}
                    className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4"
                    gap={16}
                    estimateItemHeight={430}
                    renderItem={renderListingCard}
                    data-testid="listing-grid"
                  />
                )}
                {hasNextPage && !isFetchingNextPage && (
                  <div ref={sentinelRef} aria-hidden="true" className="h-8 mt-2" />
                )}
                {/* Searching state: every loaded row was excluded by the
                 * client-side filters but more pages exist. Render a few
                 * skeletons so the user sees progress while the sentinel
                 * keeps fetching pages. */}
                {filtered.length === 0 && hasNextPage && (
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
                    {Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={`searching-${i}`} />)}
                  </div>
                )}
                {isFetchingNextPage && filtered.length > 0 && (
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 mt-3 sm:mt-4">
                    {Array.from({ length: 4 }).map((_, i) => <PropertyCardSkeleton key={`more-${i}`} />)}
                  </div>
                )}
                {!hasNextPage && filtered.length > 0 && (
                  <div className="text-center text-xs text-muted-foreground mt-6 pb-2">
                    {t("listings.endOfResults", "No more results")}
                  </div>
                )}
              </>
            )
          ) : (
            /* Full map view */
            <MapGate consent={consent} accept={accept}>
              <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                <MapView
                  listings={mapListings}
                  onVisibleListingsChange={setViewportIds}
                  onPolygonFilter={setPolygonFilterIds}
                />
              </Suspense>
            </MapGate>
          )}
        </div>
      </main>

      <Footer />

      {/* Floating Map / List pill — mobile only, above bottom nav */}
      <div
        className="md:hidden fixed left-1/2 -translate-x-1/2 z-50 animate-fade-in"
        style={{ bottom: "calc(var(--bottom-nav-h, 56px) + env(safe-area-inset-bottom, 0px) + 12px)" }}
      >
        {viewMode === "map" ? (
          <button
            onClick={() => setViewMode("grid")}
            className="flex items-center gap-2 pl-4 pr-5 py-3 rounded-full shadow-elevated bg-foreground text-background text-sm font-semibold transition-all active:scale-95"
            style={{ boxShadow: "0 4px 24px 0 hsl(var(--foreground) / 0.18)" }}
          >
            <LayoutGrid className="w-4 h-4" />
            Show List
          </button>
        ) : (
          <button
            onClick={() => setViewMode("map")}
            className="flex items-center gap-2 pl-4 pr-5 py-3 rounded-full shadow-elevated bg-foreground text-background text-sm font-semibold transition-all active:scale-95"
            style={{ boxShadow: "0 4px 24px 0 hsl(var(--foreground) / 0.18)" }}
          >
            <Map className="w-4 h-4" />
            Show Map
            {filtered.length > 0 && (
              <span className="ml-0.5 bg-primary text-primary-foreground text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                {filtered.length > 99 ? "99+" : filtered.length}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Compare drawer */}
      <Suspense fallback={null}>
        <CompareDrawer
          listings={compareList}
          onRemove={id => setCompareList(prev => prev.filter(l => l.id !== id))}
          onClear={() => setCompareList([])}
        />
      </Suspense>

      {/* Save search modal */}
      {showSaveModal && (
        <SaveSearchModal
          currentFilters={currentFilters}
          onClose={() => setShowSaveModal(false)}
        />
      )}
    </div>
  );
}
