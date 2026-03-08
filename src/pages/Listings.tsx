import { useState, useCallback, useRef, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search, SlidersHorizontal, MapPin, LayoutGrid, Map, ChevronDown,
  X, Gavel, ArrowUpDown, Loader2, Building2, Check, Bookmark, GitCompare,
  Columns2, ChevronRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { MarketTicker } from "@/components/MarketTicker";
import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { MapView } from "@/components/MapView";
import { CompareDrawer } from "@/components/CompareDrawer";
import { SaveSearchModal } from "@/components/SaveSearchModal";
import { AISearchBar } from "@/components/AISearchBar";
import { mockProperties } from "@/data/mockProperties";
import { useListings } from "@/hooks/useListings";
import { useAuth } from "@/contexts/AuthContext";
import { PROPERTY_TYPES, PROPERTY_TYPE_MAP, getTypeLabel, getSubtypeLabel, type PropertyTypeKey } from "@/lib/propertyTypes";

// ─── Constants ────────────────────────────────────────────────────────────────

const priceRanges = [
  { label: "Any Price", value: "" },
  { label: "Under €100k", value: "0-100000" },
  { label: "€100k – €300k", value: "100000-300000" },
  { label: "€300k – €600k", value: "300000-600000" },
  { label: "€600k – €1M", value: "600000-1000000" },
  { label: "€1M+", value: "1000000-9999999" },
];

const listingTypeOptions = [
  { label: "All", value: "", icon: "🏘️" },
  { label: "For Sale", value: "sale", icon: "🏷️" },
  { label: "For Rent", value: "rent", icon: "🔑" },
  { label: "Auction", value: "auction", icon: "⚖️" },
];

const sortOptions = [
  { label: "Most Relevant", value: "relevant" },
  { label: "Price: Low → High", value: "price-asc" },
  { label: "Price: High → Low", value: "price-desc" },
  { label: "Newest First", value: "newest" },
  { label: "AI Score", value: "ai-score" },
  { label: "Most Viewed", value: "views" },
];

const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G"];
const HEATING_TYPES = ["autonomous", "central", "floor", "none"];
const CONSTRUCTION_STATUSES = ["new", "under_construction", "renovated", "needs_renovation", "preserved", "neoclassical"];

const FEATURE_OPTIONS = [
  { key: "has_parking", label: "🚗 Parking" },
  { key: "has_elevator", label: "🛗 Elevator" },
  { key: "has_balcony", label: "🏞️ Balcony" },
  { key: "has_pool", label: "🏊 Pool" },
  { key: "pets_allowed", label: "🐾 Pet Friendly" },
  { key: "has_furnished", label: "🛋️ Furnished" },
  { key: "has_garden", label: "🌿 Garden" },
  { key: "has_ac", label: "❄️ Air Conditioning" },
  { key: "has_fireplace", label: "🔥 Fireplace" },
  { key: "has_storage", label: "📦 Storage" },
  { key: "has_view", label: "👁️ View" },
  { key: "has_smart_home", label: "🏡 Smart Home" },
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function dbListingToCard(l: any) {
  return {
    id: l.id,
    title: l.title,
    address: l.address || l.city,
    city: l.city,
    price: Number(l.price),
    pricePerSqm: l.price_per_sqm ? Number(l.price_per_sqm) : undefined,
    bedrooms: l.bedrooms ?? undefined,
    bathrooms: l.bathrooms ?? undefined,
    sqm: Number(l.sqm),
    floor: l.floor ?? undefined,
    totalFloors: l.total_floors ?? undefined,
    yearBuilt: l.year_built ?? undefined,
    energyClass: l.energy_class ?? undefined,
    latitude: l.latitude,
    longitude: l.longitude,
    images: [
      ...(l.cover_image_url ? [l.cover_image_url] : []),
      ...(l.listing_images?.map((img: any) => img.url) || []),
      "https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=60",
    ].filter(Boolean).slice(0, 3),
    type: l.property_type as any,
    listingType: l.listing_type as any,
    auctionDate: l.auction_date ? new Date(l.auction_date).toLocaleDateString("en-GB") : undefined,
    auctionStartingBid: l.auction_starting_bid ? Number(l.auction_starting_bid) : undefined,
    aiScore: l.ai_score ?? undefined,
    views: l.views_count ?? undefined,
    agent: l.profiles ? {
      name: l.profiles.display_name || "Owner",
      verified: l.profiles.verified || false,
      avatar: l.profiles.avatar_url,
    } : undefined,
    tags: l.tags || [
      l.has_parking && "Parking",
      l.has_pool && "Pool",
      l.has_elevator && "Elevator",
      l.has_garden && "Garden",
      l.has_smart_home && "Smart Home",
    ].filter(Boolean) as string[],
    hasVideo: l.has_video_tour,
    hasVirtualTour: l.has_virtual_tour,
    _raw: l,
  };
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function RangeSelector({
  label, value, onChange, options,
}: {
  label: string;
  value: [string, string];
  onChange: (v: [string, string]) => void;
  options: { label: string; value: string }[];
}) {
  return (
    <div>
      <label className="text-xs text-muted-foreground font-medium mb-2 block">{label}</label>
      <div className="flex items-center gap-1">
        <select
          value={value[0]}
          onChange={e => onChange([e.target.value, value[1]])}
          className="flex-1 bg-secondary border border-border rounded-lg px-2 py-2 text-xs text-foreground outline-none focus:border-primary appearance-none"
        >
          <option value="">Min</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
        <span className="text-muted-foreground text-xs">–</span>
        <select
          value={value[1]}
          onChange={e => onChange([value[0], e.target.value])}
          className="flex-1 bg-secondary border border-border rounded-lg px-2 py-2 text-xs text-foreground outline-none focus:border-primary appearance-none"
        >
          <option value="">Max</option>
          {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>
    </div>
  );
}

function FilterChip({ active, onClick, children }: {
  active: boolean; onClick: () => void; children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-all ${
        active
          ? "border-primary bg-primary/10 text-primary"
          : "border-border bg-secondary text-muted-foreground hover:text-foreground hover:border-primary/40"
      }`}
    >
      {active && <Check className="w-3 h-3" />}
      {children}
    </button>
  );
}

// ─── ListingTypeButton ────────────────────────────────────────────────────────

function ListingTypeButton({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const current = listingTypeOptions.find(o => o.value === value) || listingTypeOptions[0];

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-secondary text-foreground hover:border-primary/40"
        }`}
      >
        <span>{current.icon}</span>
        <span>{current.label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]">
          {listingTypeOptions.map(o => (
            <button
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${
                value === o.value ? "text-primary bg-primary/10" : "text-foreground"
              }`}
            >
              <span>{o.icon}</span>
              <span>{o.label}</span>
              {value === o.value && <Check className="w-3.5 h-3.5 ml-auto" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── PropertyTypeButton ───────────────────────────────────────────────────────

function PropertyTypeButton({
  value, subtype, onTypeChange, onSubtypeChange,
}: {
  value: string; subtype: string;
  onTypeChange: (v: string) => void;
  onSubtypeChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const currentType = value ? PROPERTY_TYPE_MAP[value as PropertyTypeKey] : null;
  const currentSubtype = currentType?.subtypes.find(s => s.value === subtype);

  const label = currentSubtype
    ? `${currentType!.emoji} ${currentSubtype.label}`
    : currentType
    ? `${currentType.emoji} ${currentType.label}`
    : "🏘️ All Types";

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        onClick={() => setOpen(o => !o)}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-secondary text-foreground hover:border-primary/40"
        }`}
      >
        <span>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute top-full mt-1 left-0 z-50 bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[220px]">
          {/* All types option */}
          <button
            onClick={() => { onTypeChange(""); onSubtypeChange(""); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${
              !value ? "text-primary bg-primary/10" : "text-foreground"
            }`}
          >
            <span>🏘️</span><span className="font-medium">All Types</span>
            {!value && <Check className="w-3.5 h-3.5 ml-auto" />}
          </button>
          <div className="h-px bg-border mx-2" />
          {PROPERTY_TYPES.map(pt => (
            <div key={pt.value}>
              {/* Main type row */}
              <button
                onClick={() => { onTypeChange(pt.value); onSubtypeChange(""); if (!pt.subtypes.length) setOpen(false); }}
                className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${
                  value === pt.value && !subtype ? "text-primary bg-primary/10" : "text-foreground"
                }`}
              >
                <span>{pt.emoji}</span>
                <span className="font-medium">{pt.label}</span>
                {value === pt.value && !subtype && <Check className="w-3.5 h-3.5 ml-auto" />}
              </button>
              {/* Subtypes — show when this type is selected */}
              {value === pt.value && pt.subtypes.map(st => (
                <button
                  key={st.value}
                  onClick={() => { onSubtypeChange(st.value); setOpen(false); }}
                  title={st.description}
                  className={`w-full flex items-center gap-2.5 pl-8 pr-3 py-2 text-xs text-left transition-colors hover:bg-secondary ${
                    subtype === st.value ? "text-primary bg-primary/10" : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  <ChevronRight className="w-3 h-3 shrink-0" />
                  <span>{st.label}</span>
                  {subtype === st.value && <Check className="w-3 h-3 ml-auto" />}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Listings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<"grid" | "split" | "map">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [compareList, setCompareList] = useState<any[]>([]);
  const [viewportIds, setViewportIds] = useState<Set<string> | null>(null);
  const [polygonFilterIds, setPolygonFilterIds] = useState<Set<string> | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const { user } = useAuth();

  // AI search filter applier — maps AI-parsed filters back to URL params
  const applyAIFilters = useCallback((filters: Record<string, any>) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      // City
      if (filters.city) next.set("city", filters.city); 
      // Types
      if (filters.listing_type) next.set("listing_type", filters.listing_type); else next.delete("listing_type");
      if (filters.property_type) next.set("type", filters.property_type); else next.delete("type");
      // Price
      if (filters.price_min || filters.price_max) {
        const min = filters.price_min ?? 0;
        const max = filters.price_max ?? 9999999;
        next.set("price", `${min}-${max}`);
      }
      // Beds
      if (filters.beds_min) next.set("beds_min", String(filters.beds_min)); else next.delete("beds_min");
      if (filters.beds_max) next.set("beds_max", String(filters.beds_max)); else next.delete("beds_max");
      // Sqm
      if (filters.sqm_min) next.set("sqm_min", String(filters.sqm_min)); else next.delete("sqm_min");
      if (filters.sqm_max) next.set("sqm_max", String(filters.sqm_max)); else next.delete("sqm_max");
      // Features
      if (filters.features?.length) next.set("features", filters.features.join(","));
      // Energy
      if (filters.energy?.length) next.set("energy", filters.energy.join(","));
      // Heating
      if (filters.heating) next.set("heating", filters.heating); else next.delete("heating");
      return next;
    }, { replace: true });
  }, [setSearchParams]);

  // URL-based filter state helpers
  const getParam = (key: string, fallback = "") => searchParams.get(key) || fallback;
  const setParam = useCallback((key: string, value: string) => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set(key, value); else next.delete(key);
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

  const getMulti = (key: string): string[] =>
    (searchParams.get(key) || "").split(",").filter(Boolean);

  // Read filter state
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

  const { data: dbListings = [], isLoading } = useListings({
    city: searchQuery || undefined,
    listing_type: selectedListingType || undefined,
    property_type: selectedType || undefined,
  });

  const sourceListings = dbListings.length > 0
    ? dbListings.map(dbListingToCard)
    : mockProperties.map(p => ({ ...p, _raw: p }));

  // Client-side filtering
  let filtered = sourceListings.filter((p: any) => {
    const raw = p._raw || p;
    if (selectedPrice) {
      const [min, max] = selectedPrice.split("-").map(Number);
      if (p.price < min || p.price > max) return false;
    }
    if (bedsRange[0] && p.bedrooms != null && p.bedrooms < Number(bedsRange[0])) return false;
    if (bedsRange[1] && p.bedrooms != null && p.bedrooms > Number(bedsRange[1])) return false;
    if (bathsRange[0] && p.bathrooms != null && p.bathrooms < Number(bathsRange[0])) return false;
    if (bathsRange[1] && p.bathrooms != null && p.bathrooms > Number(bathsRange[1])) return false;
    if (floorRange[0] && raw.floor != null && raw.floor < Number(floorRange[0])) return false;
    if (floorRange[1] && raw.floor != null && raw.floor > Number(floorRange[1])) return false;
    const yearBuilt = p.yearBuilt ?? raw.year_built;
    if (yearRange[0] && yearBuilt && yearBuilt < Number(yearRange[0])) return false;
    if (yearRange[1] && yearBuilt && yearBuilt > Number(yearRange[1])) return false;
    if (minSqm && p.sqm < Number(minSqm)) return false;
    if (maxSqm && p.sqm > Number(maxSqm)) return false;
    if (selectedEnergyClasses.length > 0) {
      const ec = p.energyClass ?? raw.energy_class;
      if (!ec || !selectedEnergyClasses.includes(ec)) return false;
    }
    for (const feat of selectedFeatures) {
      if (!raw[feat]) return false;
    }
    if (selectedHeating && raw.heating_system !== selectedHeating) return false;
    if (selectedConstruction && raw.construction_status !== selectedConstruction) return false;
    // Subtype filter (stored in commercial_subtype for DB listings, or matched via tags/type for mock)
    if (selectedSubtype && raw.commercial_subtype && raw.commercial_subtype !== selectedSubtype) return false;
    return true;
  });

  if (selectedSort === "price-asc") filtered = [...filtered].sort((a: any, b: any) => a.price - b.price);
  if (selectedSort === "price-desc") filtered = [...filtered].sort((a: any, b: any) => b.price - a.price);
  if (selectedSort === "ai-score") filtered = [...filtered].sort((a: any, b: any) => (b.aiScore || 0) - (a.aiScore || 0));
  if (selectedSort === "views") filtered = [...filtered].sort((a: any, b: any) => (b.views || 0) - (a.views || 0));

  const activeFilterCount = [
    selectedType, selectedSubtype, selectedListingType, selectedPrice,
    bedsRange[0], bedsRange[1], bathsRange[0], bathsRange[1],
    floorRange[0], floorRange[1], yearRange[0], yearRange[1],
    minSqm, maxSqm, selectedHeating, selectedConstruction,
    ...selectedEnergyClasses, ...selectedFeatures,
  ].filter(Boolean).length;

  const clearAllFilters = () => {
    setSearchParams(prev => {
      const next = new URLSearchParams();
      if (prev.get("city")) next.set("city", prev.get("city")!);
      return next;
    }, { replace: true });
  };

  // Current filter object for saving
  const currentFilters = Object.fromEntries(
    [...searchParams.entries()].filter(([, v]) => v)
  );

  // Compare helpers
  const toggleCompare = (listing: any) => {
    setCompareList(prev => {
      const exists = prev.find(l => l.id === listing.id);
      if (exists) return prev.filter(l => l.id !== listing.id);
      if (prev.length >= 3) return prev; // max 3
      return [...prev, listing];
    });
  };
  const isComparing = (id: string) => compareList.some(l => l.id === id);

  const bedsOpts = ["1", "2", "3", "4", "5"].map(v => ({ label: v, value: v }));
  const bathsOpts = ["1", "2", "3", "4"].map(v => ({ label: v, value: v }));
  const floorOpts = ["-1", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"].map(v => ({ label: v === "-1" ? "Basement" : v === "0" ? "Ground" : v, value: v }));
  const yearOpts = ["1950", "1960", "1970", "1980", "1990", "2000", "2005", "2010", "2015", "2018", "2020", "2022", "2024"].map(v => ({ label: v, value: v }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <MarketTicker />

      <div className="pt-16">
        {/* Sticky search bar */}
        <div className="bg-card border-b border-border sticky top-16 z-40">
          <div className="container py-4">
            {/* Top row */}
            <div className="flex gap-2 flex-wrap items-center">
              {/* Search */}
              <div className="flex-1 min-w-[200px] flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border focus-within:border-primary transition-colors">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="City, area, address..."
                  value={searchQuery}
                  onChange={e => setParam("city", e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                {searchQuery && (
                  <button onClick={() => setParam("city", "")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                )}
              </div>

              {/* Listing type button */}
              <ListingTypeButton
                value={selectedListingType}
                onChange={v => setParam("listing_type", v)}
              />

              {/* Property type button */}
              <PropertyTypeButton
                value={selectedType}
                subtype={selectedSubtype}
                onTypeChange={v => { setParam("type", v); setParam("subtype", ""); }}
                onSubtypeChange={v => setParam("subtype", v)}
              />

              {/* Price */}
              <div className="relative">
                <select value={selectedPrice} onChange={e => setParam("price", e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {priceRanges.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              {/* Sort */}
              <div className="relative">
                <select value={selectedSort} onChange={e => setParam("sort", e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {sortOptions.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
                </select>
                <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>

              {/* More filters */}
              <Button variant="outline"
                className={`border-border gap-2 shrink-0 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
                onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal className="w-4 h-4" />
                More Filters
                {activeFilterCount > 0 && (
                  <span className="w-5 h-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">{activeFilterCount}</span>
                )}
              </Button>

              {/* AI Search */}
              <AISearchBar onFiltersApplied={applyAIFilters} />

              {/* Save search – logged-in only */}
              {user && (
                <Button variant="outline" className="border-border gap-2 shrink-0"
                  onClick={() => setShowSaveModal(true)}>
                  <Bookmark className="w-4 h-4" />
                  Save Search
                </Button>
              )}

              {/* View toggle */}
              <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                <button onClick={() => setViewMode("grid")}
                  title="Grid view"
                  className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("split")}
                  title="Split view"
                  className={`p-2.5 transition-colors ${viewMode === "split" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <Columns2 className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("map")}
                  title="Map view"
                  className={`p-2.5 transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <Map className="w-4 h-4" />
                </button>
              </div>
            </div>



            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 mt-3 flex-wrap">
                <span className="text-xs text-muted-foreground">Active:</span>
                {selectedType && <button onClick={() => { setParam("type", ""); setParam("subtype", ""); }} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{PROPERTY_TYPE_MAP[selectedType as PropertyTypeKey]?.emoji} {getTypeLabel(selectedType)} <X className="w-3 h-3" /></button>}
                {selectedSubtype && selectedType && <button onClick={() => setParam("subtype", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{getSubtypeLabel(selectedType, selectedSubtype)} <X className="w-3 h-3" /></button>}
                
                {selectedPrice && <button onClick={() => setParam("price", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{priceRanges.find(r => r.value === selectedPrice)?.label} <X className="w-3 h-3" /></button>}
                {bedsRange[0] && <button onClick={() => setParam("beds_min", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{bedsRange[0]}+ beds <X className="w-3 h-3" /></button>}
                {selectedEnergyClasses.map(ec => <button key={ec} onClick={() => toggleMulti("energy", ec)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">Energy {ec} <X className="w-3 h-3" /></button>)}
                {selectedFeatures.map(f => <button key={f} onClick={() => toggleMulti("features", f)} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{FEATURE_OPTIONS.find(o => o.key === f)?.label.replace(/^[^\s]+ /, "") || f} <X className="w-3 h-3" /></button>)}
                {selectedHeating && <button onClick={() => setParam("heating", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">Heating: {selectedHeating} <X className="w-3 h-3" /></button>}
                {selectedConstruction && <button onClick={() => setParam("construction", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors">{selectedConstruction.replace("_", " ")} <X className="w-3 h-3" /></button>}
                <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1">Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Filters Panel */}
        {showFilters && (
          <div className="bg-card border-b border-border shadow-sm">
            <div className="container py-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                <RangeSelector label="Bedrooms" value={bedsRange}
                  onChange={([min, max]) => { setParam("beds_min", min); setParam("beds_max", max); }}
                  options={bedsOpts} />
                <RangeSelector label="Bathrooms" value={bathsRange}
                  onChange={([min, max]) => { setParam("baths_min", min); setParam("baths_max", max); }}
                  options={bathsOpts} />
                <RangeSelector label="Floor" value={floorRange}
                  onChange={([min, max]) => { setParam("floor_min", min); setParam("floor_max", max); }}
                  options={floorOpts} />
                <RangeSelector label="Year Built" value={yearRange}
                  onChange={([min, max]) => { setParam("year_min", min); setParam("year_max", max); }}
                  options={yearOpts} />

                {/* Size range */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Size (m²)</label>
                  <div className="flex items-center gap-1">
                    <input type="number" placeholder="Min" value={minSqm} onChange={e => setParam("sqm_min", e.target.value)}
                      className="flex-1 bg-secondary border border-border rounded-lg px-2 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
                    <span className="text-muted-foreground text-xs">–</span>
                    <input type="number" placeholder="Max" value={maxSqm} onChange={e => setParam("sqm_max", e.target.value)}
                      className="flex-1 bg-secondary border border-border rounded-lg px-2 py-2 text-xs text-foreground placeholder:text-muted-foreground outline-none focus:border-primary" />
                  </div>
                </div>

                {/* Heating type */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Heating Type</label>
                  <div className="relative">
                    <select value={selectedHeating} onChange={e => setParam("heating", e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-2 py-2 text-xs text-foreground outline-none focus:border-primary appearance-none">
                      <option value="">Any</option>
                      {HEATING_TYPES.map(h => <option key={h} value={h} className="capitalize">{h.replace("_", " ")}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Construction status */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Construction Status</label>
                  <div className="relative">
                    <select value={selectedConstruction} onChange={e => setParam("construction", e.target.value)}
                      className="w-full bg-secondary border border-border rounded-lg px-2 py-2 text-xs text-foreground outline-none focus:border-primary appearance-none">
                      <option value="">Any</option>
                      {CONSTRUCTION_STATUSES.map(s => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
                    </select>
                    <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
                  </div>
                </div>

                {/* Energy class */}
                <div>
                  <label className="text-xs text-muted-foreground font-medium mb-2 block">Energy Class</label>
                  <div className="flex flex-wrap gap-1">
                    {ENERGY_CLASSES.map(ec => (
                      <button key={ec} onClick={() => toggleMulti("energy", ec)}
                        className={`px-2 py-1 rounded text-xs font-bold border transition-all ${
                          selectedEnergyClasses.includes(ec)
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-secondary border-border text-muted-foreground hover:border-primary/40"
                        }`}>{ec}</button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Features */}
              <div className="mt-5">
                <label className="text-xs text-muted-foreground font-medium mb-3 block">Features</label>
                <div className="flex flex-wrap gap-2">
                  {FEATURE_OPTIONS.map(feat => (
                    <FilterChip key={feat.key} active={selectedFeatures.includes(feat.key)}
                      onClick={() => toggleMulti("features", feat.key)}>
                      {feat.label}
                    </FilterChip>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div className="flex items-center gap-3 mt-5 pt-4 border-t border-border">
                <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground" onClick={() => setShowFilters(false)}>
                  Show {filtered.length} Results
                </Button>
                <Button size="sm" variant="outline" className="border-border" onClick={clearAllFilters}>
                  Reset All
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div className={`${viewMode === "split" ? "" : "container"} py-8`}>
          {/* Stats bar */}
          <div className={`flex items-center justify-between mb-6 flex-wrap gap-3 ${viewMode === "split" ? "container" : ""}`}>
            <div className="flex items-center gap-3">
              {isLoading ? (
                <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
              ) : (
                <span className="font-display font-semibold">
                  {viewMode === "split" && polygonFilterIds !== null
                    ? `${filtered.filter(p => polygonFilterIds.has(p.id)).length} in area`
                    : viewMode === "split" && viewportIds !== null
                    ? `${filtered.filter(p => viewportIds.has(p.id)).length} in view`
                    : `${filtered.length} properties`}
                </span>
              )}
              <span className="text-muted-foreground text-sm">
                {dbListings.length > 0 ? "from database" : "· showing demo listings"}
              </span>
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
              <div className="hidden md:flex items-center gap-2 px-3 py-2 rounded-xl bg-brand-gold/10 border border-brand-gold/20">
                <Gavel className="w-4 h-4 text-brand-gold" />
                <span className="text-sm text-brand-gold font-medium">47 auctions this week</span>
                <Button size="sm" variant="ghost" className="text-brand-gold hover:bg-brand-gold/10 h-6 px-2 text-xs" asChild>
                  <Link to="/auctions">View →</Link>
                </Button>
              </div>
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
              splitDisplayList.map((property: any) => (
                <div key={property.id} className="relative group">
                  <PropertyCard property={property as any} />
                  <button
                    onClick={() => toggleCompare(property)}
                    disabled={!isComparing(property.id) && compareList.length >= 3}
                    className={`absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all shadow-card ${
                      isComparing(property.id)
                        ? "bg-accent/90 border-accent text-accent-foreground"
                        : compareList.length >= 3
                        ? "bg-secondary/80 border-border text-muted-foreground opacity-50 cursor-not-allowed"
                        : "bg-card/80 border-border text-muted-foreground hover:border-accent/60 hover:text-accent backdrop-blur-sm opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <GitCompare className="w-3 h-3" />
                    {isComparing(property.id) ? "✓" : "Compare"}
                  </button>
                </div>
              ))
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
                    ? <div className="flex items-center justify-center py-20"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>
                    : gridCards
                  }
                </div>

                {/* Right: map — hidden on mobile when list tab active */}
                <div className={`flex-1 ${mobileTab === "list" ? "hidden md:block" : "block"} md:h-full h-[calc(100vh-12rem)]`}>
                  <MapView
                    listings={filtered}
                    onVisibleListingsChange={setViewportIds}
                    onPolygonFilter={ids => { setPolygonFilterIds(ids); }}
                    height="100%"
                  />
                </div>
              </div>
            );
          })() : viewMode === "grid" ? (
            isLoading ? (
              <div className="flex items-center justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-primary" />
              </div>
            ) : filtered.length === 0 ? (
              <div className="glass-card rounded-xl p-16 text-center">
                <Building2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold">No properties found</p>
                <p className="text-sm text-muted-foreground mt-1">Try adjusting your filters</p>
                {activeFilterCount > 0 && (
                  <Button size="sm" variant="outline" className="mt-4" onClick={clearAllFilters}>
                    Clear Filters
                  </Button>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {filtered.map((property: any) => (
                  <div key={property.id} className="relative group">
                    <PropertyCard property={property as any} />
                    <button
                      onClick={() => toggleCompare(property)}
                      disabled={!isComparing(property.id) && compareList.length >= 3}
                      className={`absolute top-2 left-2 z-10 flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-all shadow-card ${
                        isComparing(property.id)
                          ? "bg-accent/90 border-accent text-accent-foreground"
                          : compareList.length >= 3
                          ? "bg-secondary/80 border-border text-muted-foreground opacity-50 cursor-not-allowed"
                          : "bg-card/80 border-border text-muted-foreground hover:border-accent/60 hover:text-accent backdrop-blur-sm opacity-0 group-hover:opacity-100"
                      }`}
                    >
                      <GitCompare className="w-3 h-3" />
                      {isComparing(property.id) ? "✓" : "Compare"}
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Full map view */
            <MapView
              listings={filtered}
              onVisibleListingsChange={setViewportIds}
              onPolygonFilter={setPolygonFilterIds}
            />
          )}
        </div>
      </div>

      <Footer />

      {/* Compare drawer */}
      <CompareDrawer
        listings={compareList}
        onRemove={id => setCompareList(prev => prev.filter(l => l.id !== id))}
        onClear={() => setCompareList([])}
      />

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
