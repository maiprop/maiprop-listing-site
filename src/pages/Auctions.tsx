/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useMemo, useEffect, lazy, Suspense } from "react";
import { TrendingUp, Bell, AlertCircle, Loader2, Map, List, SlidersHorizontal, X, ChevronDown, Gavel, ExternalLink, Lock, MapPin } from "lucide-react";
import { Helmet } from "react-helmet-async";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import type { MapListing } from "@/components/MapView";
const MapView = lazy(() => import("@/components/MapView").then(m => ({ default: m.MapView })));
import { AuctionAlertModal } from "@/components/AuctionAlertModal";
import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";
import { useToggleFavorite } from "@/hooks/useFavorites";
import { useAuctionListings } from "@/hooks/useAuctionListings";
import {
  PROPERTY_TYPES, BID_RANGES, YEAR_RANGES, OWNERSHIP_STATUSES,
  ownershipMatches, getAuctionRound, estimateYield, yieldRange, streetViewImg,
  type ViewMode,
} from "@/lib/auctionUtils";
import { AuctionCard, PremiumBadge } from "@/components/auctions/AuctionCard";
import { isPlatformAdmin } from "@/lib/authUtils";

const PAGE_SIZE = 20;
const MAX_PAGES_FREE = 3;  // free: up to 3 pages = 60 items
const MAX_PAGES_PRO = 30;  // pro:  up to 30 pages = 600 items

export default function Auctions() {
  const { user, profile } = useAuth();
  const { isPro } = useSubscription();
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

  const { data: auctions = [], isLoading, error } = useAuctionListings();
  const toggleFav = useToggleFavorite();
  const isMaiPropOsUser = isPlatformAdmin(profile);
  // pageCap and maxItems computed below when cappedAuctions is built

  // Dynamic city list from actual data
  const cityOptions = useMemo(() => {
    const cities = Array.from(new Set(auctions.map((a) => a.city).filter(Boolean))).sort();
    return ["All Cities", ...cities];
  }, [auctions]);

  const roundOptions = useMemo(() => {
    const rounds = auctions.map((a: any) => getAuctionRound(a.tags)).filter((n): n is number => n != null);
    const opts: {value: string;label: string;}[] = [{ value: "", label: "All Rounds" }];
    if (rounds.some((n) => n === 1)) opts.push({ value: "1", label: "1st Auction" });
    if (rounds.some((n) => n === 2)) opts.push({ value: "2", label: "2nd Auction" });
    if (rounds.some((n) => n >= 3)) opts.push({ value: "3plus", label: "3rd+ Auction" });
    return opts;
  }, [auctions]);

  const handleToggleFav = (id: string, isFav: boolean) => {
    if (!user) {navigate("/login");return;}
    toggleFav.mutate({ listing_id: id, isFavorited: isFav });
    setFavoritedIds((prev) => {
      const next = new Set(prev);
      if (isFav) next.delete(id);else next.add(id);
      return next;
    });
  };

  // (filtering is applied inside visibleFiltered below, after the cap)

  const pageCap = isMaiPropOsUser ? Infinity : isPro ? MAX_PAGES_PRO : MAX_PAGES_FREE;
  const maxItems = Number.isFinite(pageCap) ? pageCap * PAGE_SIZE : Infinity;

  // Cap is applied on the RAW auctions list BEFORE filtering so that
  // narrowing filters cannot be used to bypass the page cap.
  const cappedAuctions = useMemo(
    () => Number.isFinite(maxItems) ? auctions.slice(0, maxItems) : auctions,
    [auctions, maxItems]
  );
  const totalRaw = auctions.length; // full count for upsell copy

  const visibleFiltered = useMemo(() => {
    return cappedAuctions.filter((a) => {
      if (selectedCity !== "All Cities" && !a.city?.toLowerCase().includes(selectedCity.toLowerCase())) return false;
      if (filterType) {
        const [base, subtype] = filterType.split(":");
        // Base property_type must always match
        if (base && a.property_type !== base) return false;
        // For land/commercial subtypes, also require the corresponding tag
        if (subtype && base === "land") {
          const targetTag = `land_type:${subtype}`;
          if (!a.tags?.includes(targetTag)) return false;
        }
        if (subtype && base === "commercial") {
          const targetTag = `commercial_type:${subtype}`;
          if (!a.tags?.includes(targetTag)) return false;
        }
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
      // Premium filters: only apply when user is Pro
      if (isPro || isMaiPropOsUser) {
        if (filterOwnership && !ownershipMatches(filterOwnership, a.tags)) return false;
        if (filterRound) {
          const round = getAuctionRound(a.tags);
          if (filterRound === "3plus") {
            if (!round || round < 3) return false;
          } else {
            const target = Number(filterRound);
            if (!round || round !== target) return false;
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
    });
  }, [cappedAuctions, selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield, isPro, isMaiPropOsUser]);

  const polygonFiltered = useMemo(() => {
    if (!polygonFilterIds) return visibleFiltered;
    return visibleFiltered.filter((a) => polygonFilterIds.has(a.id));
  }, [visibleFiltered, polygonFilterIds]);

  const totalPages = Math.max(1, Math.ceil(polygonFiltered.length / PAGE_SIZE));
  const paginated = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return polygonFiltered.slice(start, start + PAGE_SIZE);
  }, [polygonFiltered, currentPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [selectedCity, filterType, filterBidRange, filterYearRange, filterOwnership, filterRound, filterYield, maxItems]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const activeFilterCount = [
    filterType,
    filterBidRange,
    filterYearRange,
    ...(isPro || isMaiPropOsUser ? [filterOwnership, filterRound, filterYield] : []),
  ].filter(Boolean).length;

  const clearFilters = () => {
    setFilterType("");
    setFilterBidRange("");
    setFilterYearRange("");
    setFilterOwnership("");
    setFilterRound("");
    setFilterYield("");
  };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  const thisWeek = visibleFiltered.filter((a) => {
    if (!a.auction_date) return false;
    const d = new Date(a.auction_date);
    const dayOnly = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    return dayOnly >= todayStart && dayOnly <= weekEnd;
  }).length;

  const avgBid = visibleFiltered.length ?
  Math.round(visibleFiltered.reduce((sum, a) => sum + (a.auction_starting_bid ?? a.price ?? 0), 0) / visibleFiltered.length) :
  0;


  const auctionStats = [
  { value: isLoading ? "—" : String(thisWeek), label: "This Week", icon: Gavel },
  { value: isLoading ? "—" : visibleFiltered.length.toLocaleString(), label: "Visible Auctions", icon: TrendingUp },
  { value: isLoading ? "—" : avgBid > 0 ? `€${(avgBid / 1000).toFixed(0)}k` : "—", label: "Avg Starting Bid", icon: TrendingUp }];


  const mapListings: MapListing[] = visibleFiltered.
  filter((a) => a.latitude != null && a.longitude != null).
  map((a) => ({
    id: a.id,
    title: a.title,
    price: a.auction_starting_bid ?? a.price ?? 0,
    sqm: a.sqm ?? 0,
    latitude: a.latitude,
    longitude: a.longitude,
    images: (() => {
      const imgs: string[] = a.cover_image_url ? [a.cover_image_url] : [];
      if (!imgs.length && a.listing_images?.length) {
        const sorted = [...a.listing_images].sort((x: any, y: any) => x.sort_order - y.sort_order);
        sorted.forEach((img: any) => imgs.push(img.url));
      }
      if (!imgs.length) {
        const sv = streetViewImg(a.latitude, a.longitude);
        if (sv) imgs.push(sv);
      }
      return imgs;
    })(),
    listingType: "auction",
    city: a.city,
    _raw: a
  }));

  const mappableCount = mapListings.length;

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Property Auctions in Greece — maiProp</title>
        <meta name="description" content="Browse real-time Greek court property auctions. Filter by city, type, and bid range." />
        <link rel="canonical" href="https://maiprop.co/auctions" />
        <meta property="og:title" content="Property Auctions in Greece — maiProp" />
        <meta property="og:description" content="Real-time court auction data for Greek properties." />
        <meta property="og:url" content="https://maiprop.co/auctions" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "ItemList",
          "name": "Greek Property Auctions",
          "description": "Real-time court auction listings for properties across Greece.",
          "url": "https://maiprop.co/auctions",
          "provider": { "@type": "Organization", "name": "maiProp", "url": "https://maiprop.co" },
        })}</script>
      </Helmet>
      <Navbar />
      <div className="pt-16">
        {/* Hero */}
        <div className="border-b border-border py-6 sm:py-12" style={{background: "linear-gradient(135deg, hsl(var(--brand-navy)) 0%, hsl(var(--brand-purple-dark)) 55%, hsl(var(--brand-purple)) 100%)"}}>
          <div className="container">
            <div className="flex items-center gap-2 mb-2 sm:mb-3">
              <Gavel className="w-4 h-4 sm:w-5 sm:h-5 text-brand-indigo" />
              <span
                className="text-[10px] sm:text-xs font-bold uppercase tracking-widest bg-gradient-to-r from-brand-cyan via-primary-foreground to-brand-purple bg-clip-text text-transparent drop-shadow-[0_0_8px_rgba(255,255,255,0.35)]"
              >
                Greek Auctions · Live Data
              </span>
            </div>
            <h1 className="font-display text-xl sm:text-4xl font-bold mb-1.5 sm:mb-2 text-white">Property Auctions</h1>
            <p className="text-white/60 text-xs sm:text-base max-w-xl">
              Real-time court auction data powered by mAI Prop OS.
            </p>
            <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-4 sm:mt-8 max-w-2xl">
              {auctionStats.map((s) => (
                <div
                  key={s.label}
                  className="rounded-2xl p-2.5 sm:p-5 text-center flex flex-col items-center justify-center border border-white/15 bg-gradient-to-br from-white/18 via-white/6 to-transparent backdrop-blur-xl"
                >
                  <div className="font-display text-lg sm:text-3xl font-bold text-white drop-shadow-sm">
                    {s.value}
                  </div>
                  <div className="text-[9px] sm:text-xs text-white/80 mt-0.5 sm:mt-1.5 font-medium leading-tight">
                    {s.label}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Alert CTA */}
        <div className="container py-4 sm:py-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 p-4 rounded-xl bg-primary/8 border border-primary/20">
            <div className="flex items-start gap-3 flex-1">
              <Bell className="w-5 h-5 text-primary shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Get notified of new auctions matching your criteria</p>
                <p className="text-xs text-muted-foreground mt-0.5">Set custom alerts for location, price range, and property type</p>
              </div>
            </div>
            <Button
              size="sm"
              className="bg-gradient-primary border-0 text-primary-foreground font-semibold w-full sm:w-auto shrink-0"
              onClick={() => user ? setAlertModalOpen(true) : navigate("/login", { state: { from: "/auctions" } })}>
              {user ? "Set Alert" : "Sign in to Alert"}
            </Button>
          </div>
        </div>

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
                  <Map className="w-4 h-4" />
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
                <Map className="w-3.5 h-3.5" aria-hidden="true" /> Map
                {!isLoading && mappableCount > 0 && <span className="ml-0.5 text-[10px] bg-primary/15 text-primary px-1.5 py-0.5 rounded-full font-bold" aria-label={`${mappableCount} mappable`}>{mappableCount}</span>}
              </button>
            </div>
          </div>

          {/* Advanced Filters Panel */}
          {showFilters &&
          <div className="mt-4 p-5 bg-card/95 border border-border rounded-2xl space-y-5 backdrop-blur-sm">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold flex items-center gap-2">
                  <SlidersHorizontal className="w-4 h-4 text-primary" /> Auction Filters
                </span>
                {activeFilterCount > 0 &&
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <X className="w-3 h-3" /> Clear all
                  </button>
              }
              </div>

              {/* Standard filters */}
              <div>
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Standard Filters</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
                  {/* City */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">City</label>
                    <div className="relative">
                      <select
                      value={selectedCity}
                      onChange={(e) => setSelectedCity(e.target.value)}
                      className="w-full appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary cursor-pointer">
                      
                        {cityOptions.map((c) =>
                      <option key={c} value={c}>{c}</option>
                      )}
                      </select>
                      <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                    </div>
                  </div>

                  {/* Typology */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Property Type</label>
                    <select
                    value={filterType}
                    onChange={(e) => setFilterType(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                    
                      {PROPERTY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                  </div>

                  {/* Starting bid */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Starting Bid</label>
                    <select
                    value={filterBidRange}
                    onChange={(e) => setFilterBidRange(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                    
                      {BID_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>

                  {/* Construction year */}
                  <div>
                    <label className="text-xs text-muted-foreground font-medium block mb-1.5">Construction Year</label>
                    <select
                    value={filterYearRange}
                    onChange={(e) => setFilterYearRange(e.target.value)}
                    className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                    
                      {YEAR_RANGES.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
                    </select>
                  </div>
                </div>{/* end grid */}
              </div>{/* end standard filters */}

              {/* Auction filters: Ownership, Round, Yield — Pro only */}
              <div className="pt-4 border-t border-border -mx-5 px-5 pb-1 rounded-b-2xl">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-2">
                  More Filters
                  {!isPro && !isMaiPropOsUser && <PremiumBadge />}
                </p>
                {isPro || isMaiPropOsUser ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Ownership Status</label>
                      <select value={filterOwnership} onChange={(e) => setFilterOwnership(e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                        {OWNERSHIP_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">Auction Round</label>
                      <select value={filterRound} onChange={(e) => setFilterRound(e.target.value)} className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                        {roundOptions.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground font-medium block mb-1.5">
                        Est. Rental Yield
                        <span className="ml-1.5 text-[10px] text-muted-foreground/60">(city benchmark × sqm / bid)</span>
                      </label>
                      <select
                        value={filterYield}
                        onChange={(e) => setFilterYield(e.target.value)}
                        className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none">
                        <option value="">Any Yield</option>
                        <option value="low">Under 3% — Low yield</option>
                        <option value="medium">3% – 6% — Average</option>
                        <option value="high">6% – 9% — Good</option>
                        <option value="very_high">9%+ — High yield opportunity</option>
                      </select>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 p-4 rounded-xl bg-secondary/50 border border-border">
                    <Lock className="w-5 h-5 text-muted-foreground shrink-0" />
                    <div>
                      <p className="text-sm font-medium">Ownership Status, Auction Round & Est. Rental Yield</p>
                      <p className="text-xs text-muted-foreground mt-0.5">Upgrade to Pro to unlock these filters.</p>
                    </div>
                    <Button size="sm" variant="outline" className="border-primary/40 text-primary hover:bg-primary/10 shrink-0" asChild>
                      <Link to="/pricing">Upgrade to Pro</Link>
                    </Button>
                  </div>
                )}
              </div>
            </div>
          }

          {/* Active filter chips */}
          {activeFilterCount > 0 && !showFilters &&
          <div className="flex items-center gap-2 mt-3 flex-wrap">
              <span className="text-xs text-muted-foreground">Active:</span>
              {filterType && <button onClick={() => setFilterType("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors capitalize">{filterType} <X className="w-3 h-3" /></button>}
              {filterBidRange && <button onClick={() => setFilterBidRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{BID_RANGES.find((r) => r.value === filterBidRange)?.label} <X className="w-3 h-3" /></button>}
              {filterYearRange && <button onClick={() => setFilterYearRange("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{YEAR_RANGES.find((r) => r.value === filterYearRange)?.label} <X className="w-3 h-3" /></button>}
              {(isPro || isMaiPropOsUser) && filterOwnership && <button onClick={() => setFilterOwnership("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors">{OWNERSHIP_STATUSES.find((s) => s.value === filterOwnership)?.label} <X className="w-3 h-3" /></button>}
              {(isPro || isMaiPropOsUser) && filterRound && <button onClick={() => setFilterRound("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{roundOptions.find((o) => o.value === filterRound)?.label || `Round ${filterRound}`} <X className="w-3 h-3" /></button>}
              {(isPro || isMaiPropOsUser) && filterYield && <button onClick={() => setFilterYield("")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">Yield: {filterYield.replace("_", " ")} <X className="w-3 h-3" /></button>}
              <button onClick={clearFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1">Clear all</button>
            </div>
          }
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
            {isLoading &&
          <div className="flex items-center justify-center py-20 gap-3 text-muted-foreground">
                <Loader2 className="w-5 h-5 animate-spin" />
                <span className="text-sm">Loading auctions from OS…</span>
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
                   Showing <span className="font-semibold text-foreground">{(currentPage - 1) * PAGE_SIZE + 1}–{Math.min(currentPage * PAGE_SIZE, polygonFiltered.length)}</span>
                   {" of "}
                   <span className="font-semibold text-foreground">{polygonFiltered.length}</span> auctions
                   {polygonFilterIds && <span className="text-primary"> · area filter active</span>}
                   {selectedCity !== "All Cities" ? ` in ${selectedCity}` : ""}
                   {" · "}ordered by date
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
                 {totalPages > 1 &&
            <div className="flex items-center justify-center gap-2 mt-8 flex-wrap">
                     <Button
                variant="outline"
                size="sm"
                className="border-border"
                disabled={currentPage === 1}
                onClick={() => {setCurrentPage((p) => Math.max(1, p - 1));window.scrollTo({ top: 0, behavior: "smooth" });}}>
                ← Previous
              </Button>
              {(() => {
                const pages: (number | "…")[] = [];
                if (totalPages <= 7) {
                  for (let i = 1; i <= totalPages; i++) pages.push(i);
                } else {
                  pages.push(1);
                  if (currentPage > 4) pages.push("…");
                  const start = Math.max(2, currentPage - 2);
                  const end = Math.min(totalPages - 1, currentPage + 2);
                  for (let i = start; i <= end; i++) pages.push(i);
                  if (currentPage < totalPages - 3) pages.push("…");
                  pages.push(totalPages);
                }
                return pages.map((p, idx) =>
                  p === "…" ? (
                    <span key={`ellipsis-${idx}`} className="text-sm text-muted-foreground px-1 select-none">…</span>
                  ) : (
                       <Button
                  key={p}
                  variant={p === currentPage ? "default" : "outline"}
                  size="sm"
                  className={p === currentPage ? "bg-gradient-primary border-0 text-primary-foreground font-bold" : "border-border"}
                  onClick={() => {setCurrentPage(p as number);window.scrollTo({ top: 0, behavior: "smooth" });}}>
                       {p}
                     </Button>
                  )
                );
              })()}
              <Button
                size="sm"
                className="border-border"
                variant="outline"
                disabled={currentPage === totalPages}
                onClick={() => {setCurrentPage((p) => Math.min(totalPages, p + 1));window.scrollTo({ top: 0, behavior: "smooth" });}}>
                Next →
              </Button>
            </div>
                 }
                 {/* Banner when Pro user hits 10-page cap */}
                 {isPro && !isMaiPropOsUser && totalRaw > MAX_PAGES_PRO * PAGE_SIZE &&
                   <div className="mt-8 p-4 rounded-2xl bg-secondary border border-border flex flex-col sm:flex-row items-center gap-3 text-center sm:text-left">
                     <ExternalLink className="w-5 h-5 text-muted-foreground shrink-0" />
                     <div className="flex-1">
                       <p className="text-sm font-medium text-foreground">Showing {MAX_PAGES_PRO * PAGE_SIZE} of {totalRaw} auctions</p>
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
                 {!isPro && !isMaiPropOsUser && totalRaw > MAX_PAGES_FREE * PAGE_SIZE &&
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
      </div>
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