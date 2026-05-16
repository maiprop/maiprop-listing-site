import { useState, useMemo, lazy, Suspense } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import {
  Calendar, MapPin, Loader2, DoorOpen, SlidersHorizontal, X,
  ChevronDown, Search, BedDouble, LayoutGrid, Map as MapIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import type { MapListing } from "@/components/MapView";
const MapView = lazy(() => import("@/components/MapView").then(m => ({ default: m.MapView })));
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStreetViewProxyUrl } from "@/lib/config";
import { ENERGY_CLASSES, FEATURES_RESIDENTIAL } from "@/lib/filterConfig";
import { fmtDate, fmtTime, Pill, RangeInput, OpenHouseCard } from "@/components/open-houses/OpenHousePrimitives";
import { cn } from "@/lib/utils";

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function OpenHouses() {
  const [searchParams] = useSearchParams();
  const cityParam = searchParams.get("city") || "";

  // Filter state
  const [cityFilter, setCityFilter] = useState(cityParam);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [minSqm, setMinSqm] = useState("");
  const [maxSqm, setMaxSqm] = useState("");
  const [propertyType, setPropertyType] = useState("");
  const [bedroomsMin, setBedroomsMin] = useState<number | null>(null);
  const [energyClass, setEnergyClass] = useState("");
  const [filterYearRange, setFilterYearRange] = useState("");
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cityInput, setCityInput] = useState(cityParam);
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");
  const [showPast, setShowPast] = useState(false);

  const YEAR_RANGES = [
    { label: "Any Year", value: "" },
    { label: "Pre-1980", value: "0-1979" },
    { label: "1980–2000", value: "1980-2000" },
    { label: "2000–2010", value: "2000-2010" },
    { label: "2010–2020", value: "2010-2020" },
    { label: "Post-2020", value: "2020-2100" },
  ];

  const PROPERTY_TYPES = [
    { value: "", label: "All types" },
    { value: "apartment", label: "Apartment" },
    { value: "house", label: "House" },
    { value: "villa", label: "Villa" },
    { value: "commercial", label: "Commercial" },
    { value: "office", label: "Office" },
    { value: "land", label: "Land" },
  ];

  const { data: listings = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["open-houses", showPast],
    queryFn: async () => {
      const now = new Date().toISOString();
      let q = supabase
        .from("listings")
        .select("*, listing_images(url, sort_order)")
        .eq("status", "active")
        .eq("listing_type", "open_house");
      if (showPast) {
        q = q.lt("open_house_date", now).order("open_house_date", { ascending: false });
      } else {
        q = q.gte("open_house_date", now).order("open_house_date", { ascending: true });
      }
      const { data, error } = await q.limit(200);
      if (error) throw error;
      return (data || []).sort((a, b) => {
        const aHasImg = !!(a.cover_image_url || a.listing_images?.length);
        const bHasImg = !!(b.cover_image_url || b.listing_images?.length);
        return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
      });
    },
  });

  // Client-side filtering
  const filtered = useMemo(() => {
    return listings.filter((l) => {
      if (cityFilter && !l.city?.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (propertyType && l.property_type !== propertyType) return false;
      if (minPrice && Number(l.price) < Number(minPrice)) return false;
      if (maxPrice && Number(l.price) > Number(maxPrice)) return false;
      if (minSqm && Number(l.sqm) < Number(minSqm)) return false;
      if (maxSqm && Number(l.sqm) > Number(maxSqm)) return false;
      if (bedroomsMin !== null && (l.bedrooms == null || l.bedrooms < bedroomsMin)) return false;
      if (energyClass && l.energy_class !== energyClass) return false;
      if (filterYearRange) {
        const [minY, maxY] = filterYearRange.split("-").map(Number);
        const y = l.year_built != null ? Number(l.year_built) : null;
        if (y == null) return false;
        if (y < minY || y > maxY) return false;
      }
      for (const feat of selectedFeatures) {
        if (!(l as Record<string, unknown>)[feat]) return false;
      }
      return true;
    });
  }, [listings, cityFilter, propertyType, minPrice, maxPrice, minSqm, maxSqm, bedroomsMin, energyClass, filterYearRange, selectedFeatures]);

  const hasActiveFilters =
    !!cityFilter || !!propertyType || !!minPrice || !!maxPrice || !!minSqm ||
    !!maxSqm || bedroomsMin !== null || !!energyClass || !!filterYearRange || selectedFeatures.length > 0;

  function clearFilters() {
    setCityFilter(""); setCityInput("");
    setPropertyType(""); setMinPrice(""); setMaxPrice("");
    setMinSqm(""); setMaxSqm(""); setBedroomsMin(null);
    setEnergyClass(""); setFilterYearRange(""); setSelectedFeatures([]);
  }

  function toggleFeature(key: string) {
    setSelectedFeatures(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
  }

  const cards = filtered.map((l) => {
    const imgs: string[] = l.cover_image_url ? [l.cover_image_url] : [];
    if (!imgs.length && l.listing_images?.length) {
      const sorted = [...l.listing_images].sort((a, b) => a.sort_order - b.sort_order);
      sorted.forEach((img) => imgs.push(img.url));
    }
    const svFallback =
      l.latitude != null && l.longitude != null
        ? getStreetViewProxyUrl({ lat: Number(l.latitude), lng: Number(l.longitude) })
        : null;
    if (!imgs.length && svFallback) imgs.push(svFallback);
    return {
      listing: l,
      card: {
        id: l.id,
        title: l.title,
        address: l.address || l.city,
        city: l.city,
        price: Number(l.price),
        pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqm: Number(l.sqm),
        floor: l.floor,
        totalFloors: l.total_floors,
        yearBuilt: l.year_built,
        energyClass: l.energy_class,
        images: imgs,
        type: l.property_type,
        listingType: "open_house" as const,
        auctionDate: l.open_house_date
          ? `${fmtDate(l.open_house_date)} · ${fmtTime(l.open_house_date)}`
          : undefined,
        openHouseDateIso: l.open_house_date || undefined,
        aiScore: l.ai_score,
        views: l.views_count,
        tags: l.tags || [],
        latitude: l.latitude,
        longitude: l.longitude,
      },
    };
  });

  const isEmpty = listings.length === 0;
  const displayData = isError ? [] : cards;

  // MapListing format for MapView
  const mapListings: MapListing[] = displayData
    .filter(({ card }) => card.latitude != null && card.longitude != null)
    .map(({ card }) => ({
      id: card.id,
      title: card.title,
      price: card.price,
      sqm: card.sqm,
      bedrooms: card.bedrooms ?? undefined,
      bathrooms: card.bathrooms ?? undefined,
      latitude: card.latitude,
      longitude: card.longitude,
      images: card.images,
      listingType: "open_house",
      city: card.city,
    }));

  return (
    <div className="min-h-screen bg-background">
      <Helmet>
        <title>Open Houses - mAI prop</title>
        <meta property="og:title" content="Open Houses - mAI prop" />
      </Helmet>
      <Navbar />
      <div className="pt-16">
        {/* Hero header */}
        <div className="border-b border-border bg-card/60 py-8">
          <div className="container">
            <div className="flex items-center gap-2 mb-2">
              <DoorOpen className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">Open Houses</span>
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold">{showPast ? "Past Open Houses" : "Upcoming Open Houses"}</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {isError
                    ? "Could not load open houses."
                    : isEmpty
                    ? showPast ? "No past open houses found." : "No upcoming open houses. Agents can publish from the dashboard."
                    : `${filtered.length} event${filtered.length !== 1 ? "s" : ""} found`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center rounded-lg border border-border overflow-hidden text-sm">
                  <button
                    onClick={() => setShowPast(false)}
                    className={`px-4 py-2 font-medium transition-colors ${!showPast ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}
                  >
                    Upcoming
                  </button>
                  <button
                    onClick={() => setShowPast(true)}
                    className={`px-4 py-2 font-medium transition-colors ${showPast ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}
                  >
                    Past
                  </button>
                </div>
                <Button asChild variant="outline" className="gap-2 shrink-0">
                  <Link to="/dashboard?tab=open-houses">My Open Houses</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
        <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border shadow-sm">
          <div className="container py-3 space-y-3">
            {/* Row 1: city search + view toggle + filters button */}
            <div className="flex items-center gap-2">
              {/* City search */}
              <div className="relative flex-1 min-w-0">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" aria-hidden="true" />
                <input
                  type="text"
                  placeholder="City…"
                  aria-label="Search open houses by city"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setCityFilter(cityInput)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* View mode toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label="View mode">
                <button
                  onClick={() => setViewMode("grid")}
                  aria-label="Show as list"
                  aria-pressed={viewMode === "grid"}
                  className={cn(
                    "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors",
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">List</span>
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  aria-label="Show on map"
                  aria-pressed={viewMode === "map"}
                  className={cn(
                    "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors border-l border-border",
                    viewMode === "map"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">Map</span>
                </button>
              </div>

              {/* Filters button */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                aria-label="Toggle filters"
                aria-expanded={showAdvanced}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0",
                  showAdvanced
                    ? "bg-primary/10 text-primary border-primary/40"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xs:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full">
                    {[cityFilter, propertyType, minPrice, maxPrice, minSqm, maxSqm, bedroomsMin !== null ? "1" : "", energyClass, filterYearRange, ...selectedFeatures].filter(Boolean).length}
                  </span>
                )}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
              </button>
            </div>

            {/* Advanced filters panel */}
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-border">

                {/* Property Type */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                  <span className="text-xs text-muted-foreground font-medium">Property Type</span>
                  <div className="flex gap-1.5 flex-wrap">
                    {PROPERTY_TYPES.map((t) => (
                      <Pill key={t.value} active={propertyType === t.value} onClick={() => setPropertyType(t.value)}>
                        {t.label}
                      </Pill>
                    ))}
                  </div>
                </div>

                {/* Price */}
                <RangeInput
                  label="Price (€)"
                  minVal={minPrice}
                  maxVal={maxPrice}
                  onMinChange={setMinPrice}
                  onMaxChange={setMaxPrice}
                  prefix="€"
                />

                {/* Size */}
                <RangeInput
                  label="Size (m²)"
                  minVal={minSqm}
                  maxVal={maxSqm}
                  onMinChange={setMinSqm}
                  onMaxChange={setMaxSqm}
                  prefix="m²"
                />

                {/* Bedrooms */}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <BedDouble className="w-3.5 h-3.5" /> Min Bedrooms
                  </span>
                  <div className="flex gap-1.5 flex-wrap">
                    {[null, 1, 2, 3, 4, 5].map((b) => (
                      <button
                        key={b ?? "any"}
                        onClick={() => setBedroomsMin(b)}
                        className={cn(
                          "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                          bedroomsMin === b
                            ? "bg-primary text-primary-foreground border-primary"
                            : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                        )}
                      >
                        {b === null ? "Any" : `${b}+`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Construction year */}
                <div className="space-y-1">
                  <label htmlFor="oh-year-range" className="text-xs text-muted-foreground font-medium">Construction Year</label>
                  <select
                    id="oh-year-range"
                    value={filterYearRange}
                    onChange={(e) => setFilterYearRange(e.target.value)}
                    className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    {YEAR_RANGES.map((r) => (
                      <option key={r.value} value={r.value}>{r.label}</option>
                    ))}
                  </select>
                </div>

                {/* Energy class */}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Energy Class</span>
                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={() => setEnergyClass("")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                        !energyClass ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                      )}
                    >Any</button>
                    {ENERGY_CLASSES.slice(0, 6).map((ec) => (
                      <button
                        key={ec}
                        onClick={() => setEnergyClass(ec === energyClass ? "" : ec)}
                        className={cn(
                          "px-2 py-1 rounded-lg text-xs font-medium border transition-colors",
                          energyClass === ec ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                        )}
                      >{ec}</button>
                    ))}
                  </div>
                </div>

                {/* Features */}
                <div className="sm:col-span-2 lg:col-span-4 space-y-1">
                  <span className="text-xs text-muted-foreground font-medium">Features</span>
                  <div className="flex flex-wrap gap-1.5">
                    {FEATURES_RESIDENTIAL.slice(0, 12).map((f) => (
                      <button
                        key={f.key}
                        onClick={() => toggleFeature(f.key)}
                        className={cn(
                          "px-2.5 py-1 rounded-full text-xs font-medium border transition-colors",
                          selectedFeatures.includes(f.key)
                            ? "bg-primary/10 text-primary border-primary/40"
                            : "bg-secondary text-muted-foreground border-border hover:border-primary/40"
                        )}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Clear all */}
                {hasActiveFilters && (
                  <div className="sm:col-span-2 lg:col-span-4 flex justify-end">
                    <button
                      onClick={clearFilters}
                      className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" /> Clear all filters
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        <div className={viewMode === "map" ? "h-[calc(100vh-13rem)]" : "container py-8"}>
          {isLoading ? (
            <div className="flex justify-center py-20">
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            </div>
          ) : viewMode === "map" ? (
            /* ── Map view ── */
            mapListings.length > 0 ? (
              <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                <MapView
                  listings={mapListings}
                  height="100%"
                />
              </Suspense>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <MapPin className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">No open houses with location data to display on map.</p>
                <Button variant="outline" size="sm" onClick={() => setViewMode("grid")}>
                  Switch to list view
                </Button>
              </div>
            )
          ) : isError ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <AlertCircle className="w-14 h-14 text-destructive mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">Could not load open houses</h2>
              <p className="text-sm text-muted-foreground mb-4">Please try again.</p>
              <Button variant="outline" onClick={() => refetch()}>Retry</Button>
            </div>
          ) : displayData.length === 0 ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <Calendar className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">No open houses match your filters</h2>
              <p className="text-sm text-muted-foreground mb-4">Try broadening your search criteria.</p>
              <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
              {displayData.map(({ listing, card }) => (
                <OpenHouseCard key={card.id} listing={listing} card={card} />
              ))}
            </div>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
