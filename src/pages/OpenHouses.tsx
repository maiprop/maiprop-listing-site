import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Calendar, MapPin, Loader2, DoorOpen, SlidersHorizontal, X,
  ChevronDown, Clock, Flame, Search, BedDouble, LayoutGrid, Map as MapIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import { PropertyCard } from "@/components/PropertyCard";
import { MapView, MapListing } from "@/components/MapView";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { getStreetViewProxyUrl } from "@/lib/config";
import { cn } from "@/lib/utils";
import { ENERGY_CLASSES, FEATURES_RESIDENTIAL } from "@/lib/filterConfig";

// ── Helpers ──────────────────────────────────────────────────────────────────

function getCountdown(dateStr: string): { label: string; urgent: boolean } | null {
  const diff = new Date(dateStr).getTime() - Date.now();
  if (diff <= 0) return null;
  const hours = Math.floor(diff / 3_600_000);
  const mins = Math.floor((diff % 3_600_000) / 60_000);
  if (hours > 48) return null;
  if (hours === 0) return { label: `${mins}m`, urgent: true };
  return { label: `${hours}h ${mins}m`, urgent: hours < 6 };
}

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", {
    weekday: "short", day: "numeric", month: "short",
  });
}
function fmtTime(iso: string) {
  return new Date(iso).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
}

// ── Pill button ───────────────────────────────────────────────────────────────
function Pill({
  active, children, onClick,
}: { active?: boolean; children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "px-3 py-1.5 rounded-full text-xs font-medium border transition-colors whitespace-nowrap",
        active
          ? "bg-primary text-primary-foreground border-primary"
          : "bg-secondary text-muted-foreground border-border hover:border-primary/40 hover:text-foreground"
      )}
    >
      {children}
    </button>
  );
}

// ── Range input ───────────────────────────────────────────────────────────────
function RangeInput({
  label, minVal, maxVal, onMinChange, onMaxChange, prefix,
}: {
  label: string;
  minVal: string;
  maxVal: string;
  onMinChange: (v: string) => void;
  onMaxChange: (v: string) => void;
  prefix?: string;
}) {
  return (
    <div className="space-y-1">
      <span className="text-xs text-muted-foreground font-medium">{label}</span>
      <div className="flex gap-2">
        <input
          type="number"
          placeholder={`Min${prefix ? " " + prefix : ""}`}
          value={minVal}
          onChange={(e) => onMinChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
        <input
          type="number"
          placeholder={`Max${prefix ? " " + prefix : ""}`}
          value={maxVal}
          onChange={(e) => onMaxChange(e.target.value)}
          className="w-full px-2 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
        />
      </div>
    </div>
  );
}

// ── Open House Card wrapper ───────────────────────────────────────────────────
function OpenHouseCard({ listing, card }: { listing: any; card: any }) {
  const countdown = listing.open_house_date ? getCountdown(listing.open_house_date) : null;

  return (
    <div className="relative group">
      {/* Countdown badge */}
      {countdown && (
        <div
          className={cn(
            "absolute top-3 left-3 z-10 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-bold shadow-md",
            countdown.urgent
              ? "bg-destructive text-destructive-foreground"
              : "bg-brand-gold text-background"
          )}
        >
          {countdown.urgent ? <Flame className="w-3 h-3" /> : <Clock className="w-3 h-3" />}
          {countdown.label}
        </div>
      )}

      <PropertyCard property={card} />

      {/* Date/time banner below card */}
      {listing.open_house_date && (
        <div className="flex items-center gap-2 px-3 py-2 rounded-b-xl -mt-1 bg-emerald-500/10 border border-emerald-500/20 border-t-0">
          <Calendar className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
          <span className="text-xs font-semibold text-emerald-700">
            {fmtDate(listing.open_house_date)} · {fmtTime(listing.open_house_date)}
          </span>
          <MapPin className="w-3 h-3 text-muted-foreground ml-auto shrink-0" />
          <span className="text-xs text-muted-foreground truncate">{listing.city}</span>
        </div>
      )}
    </div>
  );
}

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
  const [selectedFeatures, setSelectedFeatures] = useState<string[]>([]);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [cityInput, setCityInput] = useState(cityParam);
  const [viewMode, setViewMode] = useState<"grid" | "map">("grid");

  const PROPERTY_TYPES = [
    { value: "", label: "All types" },
    { value: "apartment", label: "Apartment" },
    { value: "house", label: "House" },
    { value: "villa", label: "Villa" },
    { value: "commercial", label: "Commercial" },
    { value: "office", label: "Office" },
    { value: "land", label: "Land" },
  ];

  const { data: listings = [], isLoading } = useQuery({
    queryKey: ["open-houses"],
    queryFn: async () => {
      const now = new Date().toISOString();
      const { data, error } = await supabase
        .from("listings")
        .select("*, listing_images(url, sort_order)")
        .eq("status", "active")
        .eq("listing_type", "open_house")
        .gte("open_house_date", now)
        .order("open_house_date", { ascending: true })
        .limit(200);
      if (error) throw error;
      return (data || []).sort((a: any, b: any) => {
        const aHasImg = !!(a.cover_image_url || a.listing_images?.length);
        const bHasImg = !!(b.cover_image_url || b.listing_images?.length);
        return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
      });
    },
  });

  // Client-side filtering
  const filtered = useMemo(() => {
    return listings.filter((l: any) => {
      if (cityFilter && !l.city?.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (propertyType && l.property_type !== propertyType) return false;
      if (minPrice && Number(l.price) < Number(minPrice)) return false;
      if (maxPrice && Number(l.price) > Number(maxPrice)) return false;
      if (minSqm && Number(l.sqm) < Number(minSqm)) return false;
      if (maxSqm && Number(l.sqm) > Number(maxSqm)) return false;
      if (bedroomsMin !== null && (l.bedrooms == null || l.bedrooms < bedroomsMin)) return false;
      if (energyClass && l.energy_class !== energyClass) return false;
      for (const feat of selectedFeatures) {
        if (!l[feat]) return false;
      }
      return true;
    });
  }, [listings, cityFilter, propertyType, minPrice, maxPrice, minSqm, maxSqm, bedroomsMin, energyClass, selectedFeatures]);

  const hasActiveFilters =
    !!cityFilter || !!propertyType || !!minPrice || !!maxPrice || !!minSqm ||
    !!maxSqm || bedroomsMin !== null || !!energyClass || selectedFeatures.length > 0;

  function clearFilters() {
    setCityFilter(""); setCityInput("");
    setPropertyType(""); setMinPrice(""); setMaxPrice("");
    setMinSqm(""); setMaxSqm(""); setBedroomsMin(null);
    setEnergyClass(""); setSelectedFeatures([]);
  }

  function toggleFeature(key: string) {
    setSelectedFeatures(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
  }

  const cards = filtered.map((l: any) => {
    const imgs: string[] = l.cover_image_url ? [l.cover_image_url] : [];
    if (!imgs.length && l.listing_images?.length) {
      const sorted = [...l.listing_images].sort((a: any, b: any) => a.sort_order - b.sort_order);
      sorted.forEach((img: any) => imgs.push(img.url));
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
        aiScore: l.ai_score,
        views: l.views_count,
        tags: l.tags || [],
        latitude: l.latitude,
        longitude: l.longitude,
      },
    };
  });

  const mockData = [
    {
      listing: { id: "mock-open-1", city: "Athens", property_type: "apartment", open_house_date: new Date(Date.now() + 3 * 3600_000).toISOString(), price: 420000, sqm: 135, latitude: 37.9838, longitude: 23.7275 },
      card: {
        id: "mock-open-1", title: "Modern 2BR in Kifisia", address: "Kifisia Center", city: "Athens",
        price: 420000, pricePerSqm: 3100, bedrooms: 2, bathrooms: 2, sqm: 135,
        floor: 2, totalFloors: 4, yearBuilt: 2015, energyClass: "A",
        images: ["https://images.unsplash.com/photo-1505691938895-1758d7feb511?w=800&q=60"],
        type: "apartment" as const, listingType: "open_house" as const,
        auctionDate: "Sat 19 Apr · 11:00", aiScore: 87, views: 132, tags: ["Balcony", "Parking"],
        latitude: 37.9838, longitude: 23.7275,
      },
    },
    {
      listing: { id: "mock-open-2", city: "Athens Riviera", property_type: "house", open_house_date: new Date(Date.now() + 30 * 3600_000).toISOString(), price: 1450000, sqm: 280, latitude: 37.8113, longitude: 23.7742 },
      card: {
        id: "mock-open-2", title: "Sea-view Villa in Vouliagmeni", address: "Panorama Vouliagmeni", city: "Athens Riviera",
        price: 1450000, pricePerSqm: 5200, bedrooms: 4, bathrooms: 4, sqm: 280,
        floor: 0, totalFloors: 2, yearBuilt: 2020, energyClass: "A+",
        images: ["https://images.unsplash.com/photo-1507089947368-19c1da9775ae?w=800&q=60"],
        type: "house" as const, listingType: "open_house" as const,
        auctionDate: "Sun 20 Apr · 17:00", aiScore: 92, views: 89, tags: ["Pool", "Garden", "Parking"],
        latitude: 37.8113, longitude: 23.7742,
      },
    },
    {
      listing: { id: "mock-open-3", city: "Thessaloniki", property_type: "apartment", open_house_date: new Date(Date.now() + 72 * 3600_000).toISOString(), price: 310000, sqm: 107, latitude: 40.6401, longitude: 22.9444 },
      card: {
        id: "mock-open-3", title: "Loft Near Aristotelous Square", address: "City Center", city: "Thessaloniki",
        price: 310000, pricePerSqm: 2900, bedrooms: 1, bathrooms: 1, sqm: 107,
        floor: 5, totalFloors: 7, yearBuilt: 2010, energyClass: "B+",
        images: ["https://images.unsplash.com/photo-1502672023488-70e25813eb80?w=800&q=60"],
        type: "apartment" as const, listingType: "open_house" as const,
        auctionDate: "Thu 24 Apr · 19:30", aiScore: 84, views: 54, tags: ["City view", "Elevator"],
        latitude: 40.6401, longitude: 22.9444,
      },
    },
  ];

  const isEmpty = listings.length === 0;
  const displayData = isEmpty ? mockData : cards;

  // MapListing format for MapView
  const mapListings: MapListing[] = displayData
    .filter(({ card }) => card.latitude != null && card.longitude != null)
    .map(({ card }) => ({
      id: card.id,
      title: card.title,
      price: card.price,
      sqm: card.sqm,
      bedrooms: card.bedrooms,
      bathrooms: (card as any).bathrooms,
      latitude: card.latitude,
      longitude: card.longitude,
      images: card.images,
      listingType: "open_house",
      city: card.city,
    }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <div className="pt-16">
        {/* Hero header */}
        <div className="border-b border-border bg-card/60 py-8">
          <div className="container">
            <div className="flex items-center gap-2 mb-2">
              <DoorOpen className="w-5 h-5 text-emerald-600" />
              <span className="text-xs font-semibold text-emerald-600 uppercase tracking-widest">Open Houses</span>
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold">Upcoming Open Houses</h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {isEmpty
                    ? "Sample events — real open houses will appear as agents publish them."
                    : `${filtered.length} event${filtered.length !== 1 ? "s" : ""} found`}
                </p>
              </div>
              <Button asChild variant="outline" className="gap-2 shrink-0">
                <Link to="/dashboard?tab=open-houses">My Open Houses</Link>
              </Button>
            </div>
          </div>
        </div>

        {/* ── Filter Bar ─────────────────────────────────────────────────────── */}
        <div className="sticky top-16 z-30 bg-background/95 backdrop-blur border-b border-border shadow-sm">
          <div className="container py-3 space-y-3">
            {/* Row 1: city search + type pills + view toggle + advanced toggle */}
            <div className="flex flex-wrap items-center gap-2">
              {/* City search */}
              <div className="relative flex-1 min-w-[160px] max-w-[220px]">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                <input
                  type="text"
                  placeholder="City…"
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setCityFilter(cityInput)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* Property type pills */}
              <div className="flex gap-1.5 flex-wrap">
                {PROPERTY_TYPES.map((t) => (
                  <Pill key={t.value} active={propertyType === t.value} onClick={() => setPropertyType(t.value)}>
                    {t.label}
                  </Pill>
                ))}
              </div>

              <div className="flex items-center gap-2 ml-auto shrink-0">
                {/* View mode toggle */}
                <div className="flex rounded-lg border border-border overflow-hidden">
                  <button
                    onClick={() => setViewMode("grid")}
                    className={cn(
                      "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors",
                      viewMode === "grid"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <LayoutGrid className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">List</span>
                  </button>
                  <button
                    onClick={() => setViewMode("map")}
                    className={cn(
                      "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors border-l border-border",
                      viewMode === "map"
                        ? "bg-primary text-primary-foreground"
                        : "bg-secondary text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <MapIcon className="w-3.5 h-3.5" />
                    <span className="hidden sm:inline">Map</span>
                  </button>
                </div>

                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" /> Clear
                  </button>
                )}
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className={cn(
                    "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                    showAdvanced
                      ? "bg-primary/10 text-primary border-primary/40"
                      : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                  )}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  Filters
                  {hasActiveFilters && (
                    <span className="ml-1 bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full">
                      {[cityFilter, propertyType, minPrice, maxPrice, minSqm, maxSqm, bedroomsMin !== null ? "1" : "", energyClass, ...selectedFeatures].filter(Boolean).length}
                    </span>
                  )}
                  <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
                </button>
              </div>
            </div>

            {/* Advanced filters panel */}
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-border">
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
                  <div className="flex gap-1.5">
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
              <MapView
                listings={mapListings}
                height="100%"
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <MapPin className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">No open houses with location data to display on map.</p>
                <Button variant="outline" size="sm" onClick={() => setViewMode("grid")}>
                  Switch to list view
                </Button>
              </div>
            )
          ) : displayData.length === 0 ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <Calendar className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">No open houses match your filters</h2>
              <p className="text-sm text-muted-foreground mb-4">Try broadening your search criteria.</p>
              <Button variant="outline" onClick={clearFilters}>Clear filters</Button>
            </div>
          ) : (
            <>
              {isEmpty && (
                <div className="mb-6 px-4 py-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 font-medium">
                  📋 Sample events shown — real open houses will appear once agents publish them.
                </div>
              )}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {displayData.map(({ listing, card }) => (
                  <OpenHouseCard key={card.id} listing={listing} card={card} />
                ))}
              </div>
            </>
          )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
