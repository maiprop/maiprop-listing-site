import { useState, useEffect, lazy, Suspense } from "react";
import { TrendingUp, AlertCircle, Loader2, Map as MapIcon, List, SlidersHorizontal, X, ChevronDown, Gavel, ExternalLink, MapPin } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
const MapView = lazy(() => import("@/components/MapView").then(m => ({ default: m.MapView })));
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { useAuth } from "@/contexts/AuthContext";
import { useToggleFavorite } from "@/hooks/useFavorites";
import {
  BID_RANGES, YEAR_RANGES,
  type ViewMode,
} from "@/lib/auctionUtils";
import { AuctionCard } from "@/components/auctions/AuctionCard";
import { AuctionHero } from "@/components/auctions/AuctionHero";
import { AuctionAlertBanner } from "@/components/auctions/AuctionAlertBanner";
import { AuctionFiltersPanel } from "@/components/auctions/AuctionFiltersPanel";
import { AuctionPagination } from "@/components/auctions/AuctionPagination";
import { formatPrice } from "@/lib/format";
import {
  useAuctionsPipeline,
  AUCTIONS_PAGE_SIZE,
  AUCTIONS_MAX_PAGES_FREE,
  AUCTIONS_MAX_PAGES_PRO,
} from "@/hooks/useAuctionsPipeline";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
const AuctionCardSkeleton = () => {
  return (
    <div className="glass-card rounded-xl overflow-hidden border border-border flex flex-col min-h-[382px]" aria-hidden="true">
      <div className="h-44 bg-muted animate-pulse" />
      <div className="p-4 space-y-3 flex-1 flex flex-col">
        <div className="h-4 w-5/6 rounded bg-muted animate-pulse" />
        <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
        <div className="flex gap-2">
          <div className="h-5 w-20 rounded-full bg-muted animate-pulse" />
          <div className="h-5 w-16 rounded-full bg-muted animate-pulse" />
        </div>
        <div className="h-6 w-28 rounded bg-muted animate-pulse" />
        <div className="mt-auto pt-3 border-t border-border flex gap-2">
          <div className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
          <div className="h-8 w-20 rounded-lg bg-muted animate-pulse" />
        </div>
      </div>
    </div>
  );
};

const Auctions = () => { // skipcq: JS-R1005 - The auction route shell coordinates filter state, map/list view state, pagination, and Pro upsells.
  const { user } = useAuth();
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [selectedCity, setSelectedCity] = useState(() => searchParams.get("city") || "All Cities");
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showFilters, setShowFilters] = useState(false);
  const [alertModalOpen, setAlertModalOpen] = useState(false);
  const [favoritedIds, setFavoritedIds] = useState<Set<string>>(new Set());

  // Standard filters
  const [filterType, setFilterType] = useState(searchParams.get("type") || "");
  const [filterBidRange, setFilterBidRange] = useState("");
  const [filterYearRange, setFilterYearRange] = useState("");

  // Premium filters (functional for Pro, locked/redirect for free users)
  const [filterOwnership, setFilterOwnership] = useState("");
  const [filterRound, setFilterRound] = useState("");
  const [filterYield, setFilterYield] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const [polygonFilterIds, setPolygonFilterIds] = useState<Set<string> | null>(null);

  // Prefill city from URL when data loads
  useEffect(() => {
    const cityParam = searchParams.get("city");
    if (cityParam) setSelectedCity(cityParam);
  }, [searchParams]);

  const toggleFav = useToggleFavorite();

  const {
    isPro,
    isMaiPropOsUser,
    isLoading,
    error,
    cityOptions,
    roundOptions,
    visibleFiltered,
    polygonFilteredCount,
    paginated,
    totalPages,
    thisWeek,
    avgBid,
    activeFilterCount,
    totalRaw,
    mapListings,
    mappableCount,
  } = useAuctionsPipeline({
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
  });

  const handleToggleFav = (id: string, isFav: boolean) => {
    if (!user) {navigate("/login");return;}
    toggleFav.mutate({ listing_id: id, isFavorited: isFav });
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(id);else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setFilterType("");
    setFilterBidRange("");
    setFilterYearRange("");
    setFilterOwnership("");
    setFilterRound("");
    setFilterYield("");
    setPolygonFilterIds(null);
  };

  const metaTitle = isGreek ? "Πλειστηριασμοί Ακινήτων στην Ελλάδα — mAI prop" : "Property Auctions in Greece — mAI prop";
  const metaDescription = isGreek
    ? "Περιηγηθείτε σε ηλεκτρονικούς πλειστηριασμούς ακινήτων στην Ελλάδα. Φιλτράρετε ανά πόλη, τύπο και τιμή πρώτης προσφοράς."
    : "Browse Greek electronic property auctions. Filter by city, type, and first offer price.";
  const metaName = isGreek ? "Πλειστηριασμοί Ακινήτων στην Ελλάδα" : "Greek Property Auctions";
  const auctionStats = [
  { value: isLoading ? "—" : String(thisWeek), label: isGreek ? "Αυτή την εβδομάδα" : "This Week", icon: Gavel },
  { value: isLoading ? "—" : visibleFiltered.length.toLocaleString(), label: isGreek ? "Ορατοί πλειστηριασμοί" : "Visible Auctions", icon: TrendingUp },
  { value: isLoading ? "—" : avgBid > 0 ? formatPrice(avgBid) : "—", label: isGreek ? "Μέση τιμή πρώτης προσφοράς" : "Avg First Offer Price", icon: TrendingUp }];
  const mobileTypeLabels: Record<string, string> = {
    apartment: "Διαμέρισμα",
    house: "Μονοκατοικία",
    villa: "Βίλα",
    land: "Οικόπεδο / Αγροτεμάχιο",
    commercial: "Επαγγελματικό ακίνητο",
    office: "Γραφείο",
  };
  const mobileFilterTypeLabel = isGreek ? mobileTypeLabels[filterType] ?? filterType : filterType;
  const localizeBidRangeLabel = (label?: string) => {
    if (!isGreek || !label) return label;
    if (label === "Any First Offer Price") return "Οποιαδήποτε τιμή πρώτης προσφοράς";
    if (label.startsWith("Under")) return label.replace("Under", "Κάτω από");
    return label;
  };
  const localizeYearRangeLabel = (label?: string) => {
    if (!isGreek || !label) return label;
    if (label === "Any Year") return "Οποιοδήποτε έτος";
    if (label === "Pre-1980") return "Πριν το 1980";
    if (label === "Post-2020") return "Μετά το 2020";
    return label;
  };

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href="https://maiprop.co/auctions" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content="https://maiprop.co/auctions" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": metaName,
          "description": metaDescription,
          "url": "https://maiprop.co/auctions",
          "provider": { "@type": "Organization", "name": "mAI prop", "url": "https://maiprop.co" },
        })}</script>
      </Helmet>
      <Navbar />
      <main id="main-content" className="pt-16">
        <AuctionHero stats={auctionStats} />
        <AuctionAlertBanner
          isAuthenticated={Boolean(user)}
          onOpenAlert={() => setAlertModalOpen(true)}
          onSignInRedirect={() => navigate("/login", { state: { from: "/auctions" } })}
        />

        {/* Toolbar */}
        <div className="container pb-3 sm:pb-4">
          {/* ── MOBILE TOOLBAR ── */}
          <div className="sm:hidden space-y-2 mb-3">
            {/* Single row: city search + filter button + view toggle */}
            <div className="flex gap-2 items-center">
              <div className="relative flex-1 min-w-0">
                <select
                  value={selectedCity}
                  onChange={(e) => setSelectedCity(e.target.value)}
                  className="w-full h-9 appearance-none bg-secondary border border-border rounded-xl pl-3 pr-8 text-sm text-foreground outline-none focus:border-primary cursor-pointer"
                >
                  {cityOptions.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <button
                onClick={() => setShowFilters((v) => !v)}
                className={`shrink-0 h-9 flex items-center gap-1.5 px-3 rounded-xl border text-sm font-medium transition-colors ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : "bg-secondary border-border text-muted-foreground"}`}>
                <SlidersHorizontal className="w-4 h-4" />
                {isGreek ? "Φίλτρα" : "Filters"}
                {activeFilterCount > 0 && <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">{activeFilterCount}</span>}
              </button>
              <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 border border-border shrink-0" role="group" aria-label={isGreek ? "Τρόπος προβολής" : "View mode"}>
                <button onClick={() => setViewMode("list")} aria-label={isGreek ? "Προβολή λίστας" : "List view"} aria-pressed={viewMode === "list"}
                  className={`px-2.5 py-1.5 rounded-lg transition-all ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <List className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("map")} aria-label={isGreek ? "Προβολή χάρτη" : "Map view"} aria-pressed={viewMode === "map"}
                  className={`px-2.5 py-1.5 rounded-lg transition-all ${viewMode === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <MapIcon className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Mobile filter dropdown panel */}
            {showFilters && (
              <div className="border border-border rounded-xl bg-card/95 p-4 space-y-4">
                {/* Property type */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isGreek ? "Τύπος ακινήτου" : "Property Type"}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[
                      { value: "", label: isGreek ? "Όλοι οι τύποι" : "All Types" },
                      { value: "apartment", label: isGreek ? "Διαμέρισμα" : "Apartment" },
                      { value: "house", label: isGreek ? "Μονοκατοικία" : "House" },
                      { value: "villa", label: isGreek ? "Βίλα" : "Villa" },
                      { value: "land", label: isGreek ? "Οικόπεδο / Αγροτεμάχιο" : "Land / Plot" },
                      { value: "commercial", label: isGreek ? "Επαγγελματικό ακίνητο" : "Commercial" },
                      { value: "office", label: isGreek ? "Γραφείο" : "Office" },
                    ].map(t => (
                      <button key={t.value} onClick={() => setFilterType(t.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${filterType === t.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary/40"}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* First offer price */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isGreek ? "Τιμή πρώτης προσφοράς" : "First Offer Price"}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {BID_RANGES.map(r => (
                      <button key={r.value} onClick={() => setFilterBidRange(filterBidRange === r.value ? "" : r.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${filterBidRange === r.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary/40"}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Construction year */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isGreek ? "Έτος κατασκευής" : "Construction Year"}</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {YEAR_RANGES.map(r => (
                      <button key={r.value} onClick={() => setFilterYearRange(filterYearRange === r.value ? "" : r.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${filterYearRange === r.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary/40"}`}>
                        {r.label}
                      </button>
                    ))}
                  </div>
                </div>
                {activeFilterCount > 0 && (
                  <button onClick={clearFilters}
                    className="w-full py-2 text-xs text-muted-foreground border border-border rounded-lg hover:text-foreground hover:border-primary/30 transition-colors">
                    {isGreek ? "Εκκαθάριση φίλτρων" : "Clear all filters"}
                  </button>
                )}
              </div>
            )}

            {/* Active filter chips — shown when panel is closed */}
            {activeFilterCount > 0 && !showFilters && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                {filterType && <button onClick={() => setFilterType("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{mobileFilterTypeLabel} <X className="w-3 h-3" /></button>}
                {filterBidRange && <button onClick={() => setFilterBidRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{localizeBidRangeLabel(BID_RANGES.find(r => r.value === filterBidRange)?.label)} <X className="w-3 h-3" /></button>}
                {filterYearRange && <button onClick={() => setFilterYearRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{localizeYearRangeLabel(YEAR_RANGES.find(r => r.value === filterYearRange)?.label)} <X className="w-3 h-3" /></button>}
                <button onClick={clearFilters} className="text-xs text-muted-foreground shrink-0 ml-1">{isGreek ? "Εκκαθάριση" : "Clear all"}</button>
              </div>
            )}
          </div>

          {/* ── DESKTOP TOOLBAR ── */}
          <div className="hidden sm:flex items-center justify-end gap-2">
            <Button
              variant="outline"
              size="sm"
              className={`border-border gap-1.5 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
              onClick={() => setShowFilters((v) => !v)}>
              <SlidersHorizontal className="w-3.5 h-3.5" />
              {isGreek ? "Φίλτρα" : "Filters"}
              {activeFilterCount > 0 &&
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>
              }
            </Button>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border border-border" role="group" aria-label={isGreek ? "Τρόπος προβολής" : "View mode"}>
              <button onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="w-3.5 h-3.5" aria-hidden="true" /> {isGreek ? "Λίστα" : "List"}
              </button>
              <button onClick={() => setViewMode("map")} aria-pressed={viewMode === "map"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <MapIcon className="w-3.5 h-3.5" aria-hidden="true" /> {isGreek ? "Χάρτης" : "Map"}
                {!isLoading && mappableCount > 0 && <span className="ml-0.5 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold" aria-label={isGreek ? `${mappableCount} με τοποθεσία` : `${mappableCount} mappable`}>{mappableCount}</span>}
              </button>
            </div>
          </div>

          <AuctionFiltersPanel
            showFilters={showFilters}
            selectedCity={selectedCity}
            setSelectedCity={setSelectedCity}
            cityOptions={cityOptions}
            filterType={filterType}
            setFilterType={setFilterType}
            filterBidRange={filterBidRange}
            setFilterBidRange={setFilterBidRange}
            filterYearRange={filterYearRange}
            setFilterYearRange={setFilterYearRange}
            filterOwnership={filterOwnership}
            setFilterOwnership={setFilterOwnership}
            filterRound={filterRound}
            setFilterRound={setFilterRound}
            filterYield={filterYield}
            setFilterYield={setFilterYield}
            roundOptions={roundOptions}
            isPro={isPro}
            isMaiPropOsUser={isMaiPropOsUser}
            activeFilterCount={activeFilterCount}
            clearFilters={clearFilters}
          />
        </div>

        {/* ── MAP VIEW ── */}
        {viewMode === "map" &&
        <div className="container pb-6">
            {isLoading ?
          <div className="flex items-center justify-center h-[560px] rounded-2xl bg-card border border-border">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
              </div> :
          mappableCount === 0 ?
          <div className="flex flex-col items-center justify-center h-[560px] rounded-2xl bg-card border border-border gap-3">
                <MapPin className="w-10 h-10 text-muted-foreground/30" />
                <p className="text-sm text-muted-foreground">
                  {visibleFiltered.length === 0
                    ? (isGreek ? "Δεν υπάρχουν πλειστηριασμοί που ταιριάζουν στα φίλτρα." : "No auctions match the current filters.")
                    : (isGreek ? `${visibleFiltered.length} πλειστηριασμοί βρέθηκαν, αλλά δεν έχουν συντεταγμένες.` : `${visibleFiltered.length} auction(s) found but none have coordinates.`)}
                </p>
              </div> :

          <div>
                <p className="text-xs text-muted-foreground mb-3 flex items-center gap-2 flex-wrap">
                  <span>
                    {isGreek ? "Εμφάνιση" : "Showing"} <span className="font-semibold text-foreground">{polygonFilterIds ? polygonFilteredCount : mappableCount}</span>{" "}
                    {isGreek
                      ? (polygonFilterIds ? "πλειστηριασμών στην επιλεγμένη περιοχή" : "πλειστηριασμών στον χάρτη")
                      : `${polygonFilterIds ? "auction" : "pinned auction"}${(polygonFilterIds ? polygonFilteredCount : mappableCount) !== 1 ? "s" : ""} ${polygonFilterIds ? "in selected area" : "on map"}`}
                    {!polygonFilterIds && visibleFiltered.length > mappableCount && (isGreek ? ` (${visibleFiltered.length - mappableCount} χωρίς συντεταγμένες δεν εμφανίζονται)` : ` (${visibleFiltered.length - mappableCount} without coordinates hidden)`)}
                  </span>
                  {polygonFilterIds && (
                    <button type="button" onClick={() => setPolygonFilterIds(null)} className="text-primary hover:underline">
                      {isGreek ? "Εκκαθάριση περιοχής" : "Clear area"}
                    </button>
                  )}
                </p>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                  <MapView
                    listings={mapListings}
                    height="560px"
                    itemLabelSingular={isGreek ? "πλειστηριασμός" : "auction"}
                    itemLabelPlural={isGreek ? "πλειστηριασμοί" : "auctions"}
                    onPolygonFilter={(ids) => { setPolygonFilterIds(ids); setCurrentPage(1); }}
                  />
                </Suspense>
              </div>
          }
          </div>
        }

        {/* ── LIST VIEW ── */}
        {viewMode === "list" &&
        <div className="container pb-24 lg:pb-16">
            <div className="mb-4">
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">
                {isGreek ? "Αγγελίες πλειστηριασμών ακινήτων" : "Greek Property Auction Listings"}
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                {isGreek
                  ? "Περιηγηθείτε σε ηλεκτρονικούς πλειστηριασμούς με ζωντανά φίλτρα και καθημερινή τυχαία εναλλαγή αποτελεσμάτων."
                  : "Browse electronic auction opportunities with live filters and daily randomized rotation."}
              </p>
            </div>
            {isLoading &&
          <div className="space-y-4" aria-busy="true" aria-live="polite">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">{isGreek ? "Φόρτωση πλειστηριασμών..." : "Loading auctions..."}</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {Array.from({ length: AUCTIONS_PAGE_SIZE }).map((_, i) => <AuctionCardSkeleton key={i} />)}
                </div>
              </div>
          }

            {error &&
          <div className="text-center py-20">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">{isGreek ? "Δεν ήταν δυνατή η φόρτωση των πλειστηριασμών. Παρακαλώ δοκιμάστε ξανά." : "Failed to load auctions. Please try again."}</p>
              </div>
          }

            {!isLoading && !error && visibleFiltered.length === 0 &&
          <div className="text-center py-20">
                <Gavel className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                <p className="font-display font-semibold text-lg mb-2">{isGreek ? "Δεν υπάρχουν πλειστηριασμοί που ταιριάζουν στα φίλτρα" : "No auctions match your filters"}</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  {isGreek ? "Δοκιμάστε να αλλάξετε φίλτρα ή να επιλέξετε «Όλες οι πόλεις»." : "Try adjusting your filters or selecting \"All Cities\"."}
                </p>
                {activeFilterCount > 0 &&
            <Button variant="outline" className="border-border mt-4" onClick={clearFilters}>{isGreek ? "Εκκαθάριση φίλτρων" : "Clear Filters"}</Button>
            }
              </div>
          }

            {!isLoading && visibleFiltered.length > 0 &&
          <>
                 <p className="text-xs text-muted-foreground mb-4">
                   {isGreek ? "Εμφάνιση" : "Showing"} <span className="font-semibold text-foreground">{(currentPage - 1) * AUCTIONS_PAGE_SIZE + 1}–{Math.min(currentPage * AUCTIONS_PAGE_SIZE, polygonFilteredCount)}</span>
                   {" "}
                   {isGreek ? "από" : "of"}{" "}
                   <span className="font-semibold text-foreground">{polygonFilteredCount}</span> {isGreek ? "πλειστηριασμούς" : "auctions"}
                   {polygonFilterIds && <span className="text-primary"> · {isGreek ? "ενεργό φίλτρο περιοχής" : "area filter active"}</span>}
                   {selectedCity !== "All Cities" ? (isGreek ? ` σε ${selectedCity}` : ` in ${selectedCity}`) : ""}
                   {" · "}{isGreek ? "καθημερινή τυχαία εναλλαγή" : "daily randomized rotation"}
                 </p>
                 <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                   {paginated.map((a) =>
              <AuctionCard
                key={a.id}
                a={a}
                favoritedIds={favoritedIds}
                onToggleFav={handleToggleFav} />

              )}
                 </div>
                 <AuctionPagination
                   currentPage={currentPage}
                   totalPages={totalPages}
                   polygonFilteredCount={polygonFilteredCount}
                   setCurrentPage={setCurrentPage}
                 />
                 {/* Banner when Pro user hits 10-page cap */}
                 {isPro && !isMaiPropOsUser && totalRaw > AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE &&
                   <div className="mt-8 p-4 rounded-2xl bg-secondary border border-border flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
                     <ExternalLink className="w-5 h-5 text-muted-foreground shrink-0" />
                     <div className="flex-1">
                       <p className="text-sm font-medium text-foreground">{isGreek ? `Εμφάνιση ${AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE} από ${totalRaw} πλειστηριασμούς` : `Showing ${AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE} of ${totalRaw} auctions`}</p>
                       <p className="text-xs text-muted-foreground mt-0.5">{isGreek ? "Επισκεφθείτε το mAI Prop OS για την πλήρη, μη φιλτραρισμένη βάση πλειστηριασμών." : "Visit mAI Prop OS for the complete, unfiltered auction database."}</p>
                     </div>
                     <Button size="sm" variant="outline" className="shrink-0 border-border" asChild>
                       <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                         {isGreek ? "Άνοιγμα mAI Prop OS" : "Visit mAI Prop OS"} <ExternalLink className="w-3 h-3 ml-1.5" />
                       </a>
                     </Button>
                   </div>
                 }
                 {/* Upsell when free user hits page cap */}
                 {!isPro && !isMaiPropOsUser && totalRaw > AUCTIONS_MAX_PAGES_FREE * AUCTIONS_PAGE_SIZE &&
                   <div className="mt-8 p-5 rounded-2xl bg-primary/8 border border-primary/25 flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
                     <Gavel className="w-8 h-8 text-primary shrink-0" />
                     <div className="flex-1">
                       <p className="font-display font-semibold text-sm">
                         {isGreek ? "Δείτε 300% περισσότερα αποτελέσματα με Pro" : "See 300% more results with Pro"}
                       </p>
                       <p className="text-xs text-muted-foreground mt-0.5">
                         {isGreek ? "Το Pro εμφανίζει 3× περισσότερα αποτελέσματα από το δωρεάν πλάνο. Για την πλήρη βάση, χρησιμοποιήστε το mAI Prop OS." : "Pro shows 3× the free results — not all future auctions. For the full database, use mAI Prop OS."}
                       </p>
                     </div>
                     <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground font-semibold shrink-0" asChild>
                       <Link to="/pricing">{isGreek ? "Αναβάθμιση σε Pro" : "Upgrade to Pro"}</Link>
                     </Button>
                   </div>
                 }
               </>
           }
            {/* CTA */}
            <div className="mt-10 p-6 glass-card rounded-xl border border-primary/20 text-center">
              <Gavel className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-display font-semibold mb-2">{isGreek ? "Πλήρης βάση πλειστηριασμών" : "Full Auction Database"}</h3>
              <p className="text-sm text-muted-foreground mb-4">
                {isGreek ? "Αποκτήστε πρόσβαση σε 3.200+ μηνιαίους πλειστηριασμούς με AI προανάλυση. Διαθέσιμο στο mAI Prop OS." : "Access 3,200+ monthly auctions with AI pre-analysis reports. Available on mAI Prop OS."}
              </p>
              <Button className="bg-gradient-primary border-0 text-primary-foreground font-semibold" asChild>
                <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                  {isGreek ? "Άνοιγμα mAI Prop OS" : "Open mAI Prop OS"} <ExternalLink className="w-4 h-4 ml-2" />
                </a>
              </Button>
            </div>
          </div>
        }
      </main>
      <Footer />
      {alertModalOpen && (
        <AuctionAlertModal
          open={alertModalOpen}
          onClose={() => setAlertModalOpen(false)}
        />
      )}
    </div>
  );
};

export default Auctions;
