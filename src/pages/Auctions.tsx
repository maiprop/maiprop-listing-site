import { useState, useEffect, lazy, Suspense } from "react";
import { TrendingUp, AlertCircle, Loader2, Map as MapIcon, List, SlidersHorizontal, X, ChevronDown, Gavel, ExternalLink, MapPin } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
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
function AuctionCardSkeleton() {
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
}

export default function Auctions() {
  const { user } = useAuth();
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
  };

  const auctionStats = [
  { value: isLoading ? "—" : String(thisWeek), label: "This Week", icon: Gavel },
  { value: isLoading ? "—" : visibleFiltered.length.toLocaleString(), label: "Visible Auctions", icon: TrendingUp },
  { value: isLoading ? "—" : avgBid > 0 ? formatPrice(avgBid) : "—", label: "Avg Starting Bid", icon: TrendingUp }];

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Property Auctions in Greece — mAI prop</title>
        <meta name="description" content="Browse real-time Greek court property auctions. Filter by city, type, and bid range." />
        <link rel="canonical" href="https://maiprop.co/auctions" />
        <meta property="og:title" content="Property Auctions in Greece — mAI prop" />
        <meta property="og:description" content="Real-time court auction data for Greek properties." />
        <meta property="og:url" content="https://maiprop.co/auctions" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Greek Property Auctions",
          "description": "Real-time court auction listings for properties across Greece.",
          "url": "https://maiprop.co/auctions",
          "provider": { "@type": "Organization", "name": "mAI prop", "url": "https://maiprop.co" },
        })}</script>
      </Helmet>
      <Navbar />
      <main id="main-content" className="pt-16">
        <AuctionHero stats={auctionStats} />
        <AuctionAlertBanner
          isAuthenticated={!!user}
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
                Filters
                {activeFilterCount > 0 && <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center">{activeFilterCount}</span>}
              </button>
              <div className="flex items-center gap-1 bg-secondary rounded-xl p-1 border border-border shrink-0" role="group" aria-label="View mode">
                <button onClick={() => setViewMode("list")} aria-label="List view" aria-pressed={viewMode === "list"}
                  className={`px-2.5 py-1.5 rounded-lg transition-all ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"}`}>
                  <List className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("map")} aria-label="Map view" aria-pressed={viewMode === "map"}
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
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Property Type</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[{ value: "", label: "All Types" }, { value: "apartment", label: "Apartment" }, { value: "house", label: "House" }, { value: "villa", label: "Villa" }, { value: "land", label: "Land" }, { value: "commercial", label: "Commercial" }, { value: "office", label: "Office" }].map(t => (
                      <button key={t.value} onClick={() => setFilterType(t.value)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors whitespace-nowrap ${filterType === t.value ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border hover:border-primary/40"}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
                {/* Starting bid */}
                <div className="space-y-1.5">
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Starting Bid</span>
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
                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Construction Year</span>
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
                    Clear all filters
                  </button>
                )}
              </div>
            )}

            {/* Active filter chips — shown when panel is closed */}
            {activeFilterCount > 0 && !showFilters && (
              <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                {filterType && <button onClick={() => setFilterType("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{filterType} <X className="w-3 h-3" /></button>}
                {filterBidRange && <button onClick={() => setFilterBidRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{BID_RANGES.find(r => r.value === filterBidRange)?.label} <X className="w-3 h-3" /></button>}
                {filterYearRange && <button onClick={() => setFilterYearRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{YEAR_RANGES.find(r => r.value === filterYearRange)?.label} <X className="w-3 h-3" /></button>}
                <button onClick={clearFilters} className="text-xs text-muted-foreground shrink-0 ml-1">Clear all</button>
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
              Filters
              {activeFilterCount > 0 &&
              <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center font-bold">{activeFilterCount}</span>
              }
            </Button>
            <div className="flex items-center gap-1 bg-secondary rounded-lg p-1 border border-border" role="group" aria-label="View mode">
              <button onClick={() => setViewMode("list")} aria-pressed={viewMode === "list"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "list" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <List className="w-3.5 h-3.5" aria-hidden="true" /> List
              </button>
              <button onClick={() => setViewMode("map")} aria-pressed={viewMode === "map"}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all ${viewMode === "map" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                <MapIcon className="w-3.5 h-3.5" aria-hidden="true" /> Map
                {!isLoading && mappableCount > 0 && <span className="ml-0.5 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold" aria-label={`${mappableCount} mappable`}>{mappableCount}</span>}
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
                  {visibleFiltered.length === 0 ?
              "No auctions match the current filters." :
              `${visibleFiltered.length} auction(s) found but none have coordinates.`}
                </p>
              </div> :

          <div>
                <p className="text-xs text-muted-foreground mb-3">
                  Showing <span className="font-semibold text-foreground">{mappableCount}</span> pinned auction{mappableCount !== 1 ? "s" : ""} on map
                  {visibleFiltered.length > mappableCount && ` (${visibleFiltered.length - mappableCount} without coordinates hidden)`}
                </p>
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                  <MapView
                    listings={mapListings}
                    height="560px"
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
              <h2 className="font-display text-3xl sm:text-4xl font-bold text-foreground">Greek Property Auction Listings</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Browse court auction opportunities with live filters and daily randomized rotation.
              </p>
            </div>
            {isLoading &&
          <div className="space-y-4" aria-busy="true" aria-live="polite">
                <div className="flex items-center gap-3 text-muted-foreground">
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span className="text-sm">Loading auctions from OS…</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                  {Array.from({ length: AUCTIONS_PAGE_SIZE }).map((_, i) => <AuctionCardSkeleton key={i} />)}
                </div>
              </div>
          }

            {error &&
          <div className="text-center py-20">
                <AlertCircle className="w-8 h-8 text-destructive mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Failed to load auctions. Please try again.</p>
              </div>
          }

            {!isLoading && !error && visibleFiltered.length === 0 &&
          <div className="text-center py-20">
                <Gavel className="w-12 h-12 text-primary/30 mx-auto mb-4" />
                <p className="font-display font-semibold text-lg mb-2">No auctions match your filters</p>
                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                  Try adjusting your filters or selecting "All Cities".
                </p>
                {activeFilterCount > 0 &&
            <Button variant="outline" className="border-border mt-4" onClick={clearFilters}>Clear Filters</Button>
            }
              </div>
          }

            {!isLoading && visibleFiltered.length > 0 &&
          <>
                 <p className="text-xs text-muted-foreground mb-4">
                   Showing <span className="font-semibold text-foreground">{(currentPage - 1) * AUCTIONS_PAGE_SIZE + 1}–{Math.min(currentPage * AUCTIONS_PAGE_SIZE, polygonFilteredCount)}</span>
                   {" of "}
                   <span className="font-semibold text-foreground">{polygonFilteredCount}</span> auctions
                   {polygonFilterIds && <span className="text-primary"> · area filter active</span>}
                   {selectedCity !== "All Cities" ? ` in ${selectedCity}` : ""}
                   {" · "}daily randomized rotation
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
                       <p className="text-sm font-medium text-foreground">Showing {AUCTIONS_MAX_PAGES_PRO * AUCTIONS_PAGE_SIZE} of {totalRaw} auctions</p>
                       <p className="text-xs text-muted-foreground mt-0.5">Visit mAI Prop OS for the complete, unfiltered auction database.</p>
                     </div>
                     <Button size="sm" variant="outline" className="shrink-0 border-border" asChild>
                       <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                         Visit mAI Prop OS <ExternalLink className="w-3 h-3 ml-1.5" />
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
                         See 300% more results with Pro
                       </p>
                       <p className="text-xs text-muted-foreground mt-0.5">
                         Pro shows 3× the free results — not all future auctions. For the full database, use mAI Prop OS.
                       </p>
                     </div>
                     <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground font-semibold shrink-0" asChild>
                       <Link to="/pricing">Upgrade to Pro</Link>
                     </Button>
                   </div>
                 }
               </>
           }
            {/* CTA */}
            <div className="mt-10 p-6 glass-card rounded-xl border border-primary/20 text-center">
              <Gavel className="w-8 h-8 text-primary mx-auto mb-3" />
              <h3 className="font-display font-semibold mb-2">Full Auction Database</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Access 3,200+ monthly auctions with AI pre-analysis reports. Available on mAI Prop OS.
              </p>
              <Button className="bg-gradient-primary border-0 text-primary-foreground font-semibold" asChild>
                <a href="https://os.maiprop.co" target="_blank" rel="noreferrer">
                  Open mAI Prop OS <ExternalLink className="w-4 h-4 ml-2" />
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
}
