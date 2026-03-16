import { useState, useCallback, useRef, useEffect, forwardRef } from "react";
import { createPortal } from "react-dom";
import { useSearchParams, Link } from "react-router-dom";
import {
  Search, SlidersHorizontal, MapPin, LayoutGrid, Map, ChevronDown,
  X, Gavel, ArrowUpDown, Loader2, Building2, Check, Bookmark, GitCompare,
  Columns2, Sparkles, Lock, Store
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";

import { PropertyCard } from "@/components/PropertyCard";
import { Footer } from "@/components/Footer";
import { MapView } from "@/components/MapView";
import { CompareDrawer } from "@/components/CompareDrawer";
import { SaveSearchModal } from "@/components/SaveSearchModal";
import { AISearchBar } from "@/components/AISearchBar";

import { useListings } from "@/hooks/useListings";
import { useAuth } from "@/contexts/AuthContext";
import { useCookieConsent } from "@/hooks/useCookieConsent";
import { PROPERTY_GROUPS, PROPERTY_TYPE_MAP, TYPE_STYLE_FILTERS, getTypeLabel, getSubtypeLabel, type PropertyTypeKey } from "@/lib/propertyTypes";
import {
  ENERGY_CLASSES, HEATING_TYPES, CONSTRUCTION_STATUSES, ROAD_TYPES, SLOPE_TYPES,
} from "@/lib/filterConfig";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import { dbListingToCard } from "@/lib/listingUtils";
import { toast } from "sonner";

// Price ranges adapt to listing type — buy uses purchase price, rent uses monthly rent
const buyPriceRanges = [
  { label: "Any Price", value: "" },
  { label: "Under €80k", value: "0-80000" },
  { label: "€80k – €150k", value: "80000-150000" },
  { label: "€150k – €300k", value: "150000-300000" },
  { label: "€300k – €600k", value: "300000-600000" },
  { label: "€600k – €1M", value: "600000-1000000" },
  { label: "€1M+", value: "1000000-9999999" },
];
const rentPriceRanges = [
  { label: "Any Rent", value: "" },
  { label: "Under €400/mo", value: "0-400" },
  { label: "€400 – €700/mo", value: "400-700" },
  { label: "€700 – €1,200/mo", value: "700-1200" },
  { label: "€1,200 – €2,500/mo", value: "1200-2500" },
  { label: "€2,500+/mo", value: "2500-99999" },
];

const listingTypeOptions = [
  { label: "All", value: "", icon: "🏘️" },
  { label: "Buy", value: "sale", icon: "🏷️" },
  { label: "Rent", value: "rent", icon: "🔑" },
];

const sortOptions = [
  { label: "Most Relevant", value: "relevant" },
  { label: "⭐ Featured First", value: "featured" },
  { label: "Price: Low → High", value: "price-asc" },
  { label: "Price: High → Low", value: "price-desc" },
  { label: "Newest First", value: "newest" },
  { label: "AI Score", value: "ai-score" },
  { label: "Most Viewed", value: "views" },
];



// ─── Helpers ──────────────────────────────────────────────────────────────────

function listingToCard(l: any) {
  return dbListingToCard(l, {
    includeOwnership: true,
    includeCoordinates: true,
    filterDisplayTags: true,
    includeRaw: true,
    maxImages: 3,
  });
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

const FilterChip = forwardRef<HTMLButtonElement, {
  active: boolean; onClick: () => void; children: React.ReactNode;
}>(function FilterChip({ active, onClick, children }, ref) {
  return (
    <button
      ref={ref}
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
});

// ─── ListingTypeButton ────────────────────────────────────────────────────────

function usePortalDropdown() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const portalRef = useRef<HTMLDivElement>(null);

  const toggle = () => {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
    setOpen(o => !o);
  };

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        portalRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return { open, setOpen, pos, triggerRef, portalRef, toggle };
}

function ListingTypeButton({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const { open, setOpen, pos, triggerRef, portalRef, toggle } = usePortalDropdown();
  const current = listingTypeOptions.find(o => o.value === value) || listingTypeOptions[0];

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        onClick={toggle}
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
      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-lg overflow-hidden min-w-[160px]"
        >
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
        </div>,
        document.body
      )}
    </div>
  );
}

// ─── PropertyTypeButton ───────────────────────────────────────────────────────

function PropertyTypeButton({
  value, subtype, onChange,
}: {
  value: string; subtype: string;
  onChange: (type: string, subtype: string) => void;
}) {
  const { open, setOpen, pos, triggerRef, portalRef, toggle } = usePortalDropdown();
  const commercialType = PROPERTY_TYPE_MAP["commercial"];
  const currentType = value ? PROPERTY_TYPE_MAP[value as PropertyTypeKey] : null;
  const currentSubtype = currentType?.subtypes.find(s => s.value === subtype);
  const label = currentSubtype
    ? `${currentType!.emoji} ${currentSubtype.label}`
    : currentType
    ? `${currentType.emoji} ${currentType.label}`
    : "🏘️ All Types";

  return (
    <div ref={triggerRef} className="relative shrink-0">
      <button
        onClick={toggle}
        className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-sm font-medium transition-all whitespace-nowrap ${
          value
            ? "border-primary bg-primary/10 text-primary"
            : "border-border bg-secondary text-foreground hover:border-primary/40"
        }`}
      >
        <span>{label}</span>
        <ChevronDown className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && createPortal(
        <div
          ref={portalRef}
          style={{ position: "absolute", top: pos.top, left: pos.left, zIndex: 9999 }}
          className="bg-card border border-border rounded-xl shadow-lg min-w-[220px] max-h-[480px] overflow-y-auto"
        >
          <button
            onClick={() => { onChange("", ""); setOpen(false); }}
            className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-left transition-colors hover:bg-secondary ${
              !value ? "text-primary bg-primary/10" : "text-foreground"
            }`}
          >
            <Building2 className="w-4 h-4 shrink-0" /><span className="font-medium">All Types</span>
            {!value && <Check className="w-3.5 h-3.5 ml-auto" />}
          </button>
          <div className="h-px bg-border mx-2" />
          {PROPERTY_GROUPS.map((group, gi) => (
            <div key={group.id}>
              <div className="flex items-center gap-2 px-3 pt-2.5 pb-1">
                <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{group.label}</span>
              </div>
              {group.id === "commercial" ? (
                commercialType.subtypes.map(st => {
                  const Icon = st.icon ?? Store;
                  return (
                    <button
                      key={st.value}
                      onClick={() => { onChange("commercial", st.value); setOpen(false); }}
                      title={st.description}
                      className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${
                        value === "commercial" && subtype === st.value ? "text-primary bg-primary/10" : "text-foreground"
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0 text-muted-foreground" />
                      <span>{st.label}</span>
                      {value === "commercial" && subtype === st.value && <Check className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                  );
                })
              ) : (
                group.types.map(typeKey => {
                  const pt = PROPERTY_TYPE_MAP[typeKey];
                  const Icon = pt.icon;
                  return (
                    <button
                      key={pt.value}
                      onClick={() => { onChange(pt.value, ""); setOpen(false); }}
                      className={`w-full flex items-center gap-2.5 pl-5 pr-3 py-2 text-sm text-left transition-colors hover:bg-secondary ${
                        value === pt.value && !subtype ? "text-primary bg-primary/10" : "text-foreground"
                      }`}
                    >
                      <Icon className={`w-4 h-4 shrink-0 ${value === pt.value && !subtype ? "text-primary" : "text-muted-foreground"}`} />
                      <span className="font-medium">{pt.label}</span>
                      {value === pt.value && !subtype && <Check className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                  );
                })
              )}
              {gi < PROPERTY_GROUPS.length - 1 && <div className="h-px bg-border mx-2 mt-1.5" />}
            </div>
          ))}
        </div>,
        document.body
      )}
    </div>
  );
}






// ── MapGate — only renders map if user accepted mapping cookies ─────────────────
function MapGate({ consent, accept, children, height }: {
  consent: { mapping: boolean; accepted: boolean };
  accept: (overrides?: any) => void;
  children: React.ReactNode;
  height?: string;
}) {
  if (!consent.mapping) {
    return (
      <div className="flex-1 flex items-center justify-center bg-secondary rounded-xl min-h-[400px]" style={height ? { height } : undefined}>
        <div className="text-center max-w-xs px-6">
          <Lock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="font-display font-semibold mb-1">Map requires cookies</p>
          <p className="text-sm text-muted-foreground mb-4">
            Interactive maps use Mapbox which sets third-party cookies. Enable mapping cookies to continue.
          </p>
          <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-2"
            onClick={() => accept({ mapping: true })}>
            Enable Map
          </Button>
        </div>
      </div>
    );
  }
  return <>{children}</>;
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
  const { consent, accept } = useCookieConsent();

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
  const preSaleOnly = searchParams.get("pre_sale") === "1";
  const offMarketOnly = searchParams.get("off_market") === "1";

  // AI-powered smart filters — fetch once per type/subtype combo, cached in memory
  const { config: aiFilterConfig, loading: aiFiltersLoading } = useSmartFilters(
    selectedType, selectedSubtype, selectedListingType
  );

  const { data: dbListings = [], isLoading } = useListings({
    city: searchQuery || undefined,
    listing_type: preSaleOnly ? "sale" : (selectedListingType || undefined),
    property_type: selectedType || undefined,
  });

  const hasActiveFilters = !!(searchQuery || selectedListingType || selectedType);
  const sourceListings = dbListings.map(listingToCard);

  // Client-side filtering
  let filtered = sourceListings.filter((p: any) => {
    const raw = p._raw || p;
    if (preSaleOnly && !raw.is_pre_sale) return false;
    if (offMarketOnly && !raw.is_off_market) return false;
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
    // Only filter by feature keys that exist on the listing (avoids over-filtering when AI returns non-DB keys)
    for (const feat of selectedFeatures) {
      if (Object.prototype.hasOwnProperty.call(raw, feat) && !raw[feat]) return false;
    }
    if (selectedHeating && raw.heating_system !== selectedHeating) return false;
    if (selectedConstruction && raw.construction_status !== selectedConstruction) return false;
    // Subtype filter
    if (selectedSubtype && raw.commercial_subtype && raw.commercial_subtype !== selectedSubtype) return false;
    return true;
  });

  // User sort must NOT override paid prioritization unless "featured" is explicitly chosen.
  // "featured" sort: featured → priority → rest. All other sorts: promoted always lead.
  const isPromoted = (p: any) => !!(p.isFeatured || (p.priorityPlacement ?? 0) > 0);
  const byUserSort = (a: any, b: any) => {
    if (selectedSort === "featured") {
      const aF = a.isFeatured ? 1 : 0;
      const bF = b.isFeatured ? 1 : 0;
      if (bF !== aF) return bF - aF;
      const aPri = Number(a.priorityPlacement ?? 0);
      const bPri = Number(b.priorityPlacement ?? 0);
      if (bPri !== aPri) return bPri - aPri;
      return new Date(b._raw?.created_at || 0).getTime() - new Date(a._raw?.created_at || 0).getTime();
    }
    if (selectedSort === "price-asc") return a.price - b.price;
    if (selectedSort === "price-desc") return b.price - a.price;
    if (selectedSort === "newest") return new Date(b._raw?.created_at || 0).getTime() - new Date(a._raw?.created_at || 0).getTime();
    if (selectedSort === "ai-score") return (b.aiScore || 0) - (a.aiScore || 0);
    if (selectedSort === "views") return (b.views || 0) - (a.views || 0);
    return 0;
  };
  filtered = [...filtered].sort((a, b) => {
    // "Featured First" sort: explicit featured ordering, skip automatic promo-first
    if (selectedSort === "featured") return byUserSort(a, b);
    const aPromo = isPromoted(a);
    const bPromo = isPromoted(b);
    if (aPromo && !bPromo) return -1;
    if (!aPromo && bPromo) return 1;
    if (aPromo && bPromo) {
      const pri = (b.priorityPlacement ?? 0) - (a.priorityPlacement ?? 0);
      if (pri !== 0) return pri;
    }
    return byUserSort(a, b);
  });

  const activeFilterCount = [
    selectedType, selectedSubtype, selectedPrice,
    bedsRange[0], bedsRange[1], bathsRange[0], bathsRange[1],
    floorRange[0], floorRange[1], yearRange[0], yearRange[1],
    minSqm, maxSqm, selectedHeating, selectedConstruction,
    preSaleOnly || undefined,
    offMarketOnly || undefined,
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

  // Contextual filter options — buy uses purchase context, rent uses rental context
  const isRent = selectedListingType === "rent";
  const bedsOpts = isRent
    ? [{ label: "Studio", value: "0" }, ...["1", "2", "3", "4", "5"].map(v => ({ label: `${v} bed`, value: v }))]
    : ["1", "2", "3", "4", "5", "6"].map(v => ({ label: v, value: v }));
  const bathsOpts = ["1", "2", "3", "4"].map(v => ({ label: v, value: v }));
  const floorOpts = ["-1", "0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "10+"].map(v => ({ label: v === "-1" ? "Basement" : v === "0" ? "Ground" : v, value: v }));
  const yearOpts = ["1950", "1960", "1970", "1980", "1990", "2000", "2005", "2010", "2015", "2018", "2020", "2022", "2024", "2025"].map(v => ({ label: v, value: v }));

  return (
    <div className="min-h-screen bg-background">
      <Navbar />

      <div className="pt-16">
        {/* Sticky search bar */}
        <div className="bg-card border-b border-border sticky top-16 z-40">
          <div className="container py-2 sm:py-4">
            {/* Row 1 on mobile: Search + Map/Grid toggle */}
            <div className="flex gap-2 items-center mb-2 sm:mb-0 sm:hidden">
              {/* Search */}
              <div className="flex-1 flex items-center gap-2 bg-secondary rounded-xl px-3 py-2.5 border border-border focus-within:border-primary transition-colors">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  type="text"
                  placeholder="City or area..."
                  value={searchQuery}
                  onChange={e => setParam("city", e.target.value)}
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none min-w-0"
                />
                {searchQuery && (
                  <button onClick={() => setParam("city", "")}><X className="w-3.5 h-3.5 text-muted-foreground" /></button>
                )}
              </div>
              {/* Map/Grid/Filters row */}
              <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                <button onClick={() => setViewMode("grid")} title="Grid"
                  className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("map")} title="Map"
                  className={`p-2.5 transition-colors ${viewMode === "map" || viewMode === "split" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                  <Map className="w-4 h-4" />
                </button>
              </div>
              <Button variant="outline" size="sm"
                className={`shrink-0 px-3 h-[38px] ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : "border-border"}`}
                onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal className="w-4 h-4" />
                {activeFilterCount > 0 && (
                  <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[10px] flex items-center justify-center ml-1">{activeFilterCount}</span>
                )}
              </Button>
            </div>

            {/* Row 2 on mobile: scrollable type/price/sort chips */}
            <div className="flex gap-2 items-center overflow-x-auto scrollbar-none sm:hidden pb-0.5">
              <ListingTypeButton value={selectedListingType} onChange={v => setParam("listing_type", v)} />
              <PropertyTypeButton
                value={selectedType}
                subtype={selectedSubtype}
                onChange={(type, sub) => {
                  setSearchParams(prev => {
                    const next = new URLSearchParams(prev);
                    if (type) next.set("type", type); else next.delete("type");
                    if (sub) next.set("subtype", sub); else next.delete("subtype");
                    return next;
                  }, { replace: true });
                }}
              />
              <div className="relative shrink-0">
                <select value={selectedPrice} onChange={e => setParam("price", e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2 pr-7 text-xs text-foreground cursor-pointer outline-none focus:border-primary">
                  {(selectedListingType === "rent" ? rentPriceRanges : buyPriceRanges).map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none" />
              </div>
              <AISearchBar onFiltersApplied={applyAIFilters} />
            </div>

            {/* Desktop: single row — unchanged */}
            <div className="hidden sm:flex gap-2 items-center overflow-x-auto scrollbar-none sm:flex-wrap">
              {/* Search */}
              <div className="shrink-0 flex-1 min-w-[200px] flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border focus-within:border-primary transition-colors">
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
              <ListingTypeButton value={selectedListingType} onChange={v => setParam("listing_type", v)} />
              <PropertyTypeButton
                value={selectedType}
                subtype={selectedSubtype}
                onChange={(type, sub) => {
                  setSearchParams(prev => {
                    const next = new URLSearchParams(prev);
                    if (type) next.set("type", type); else next.delete("type");
                    if (sub) next.set("subtype", sub); else next.delete("subtype");
                    return next;
                  }, { replace: true });
                }}
              />
              <div className="relative">
                <select value={selectedPrice} onChange={e => setParam("price", e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {(selectedListingType === "rent" ? rentPriceRanges : buyPriceRanges).map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select value={selectedSort} onChange={e => setParam("sort", e.target.value)}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {sortOptions.map(o => <option key={o.value} value={o.value} className="bg-card">{o.label}</option>)}
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
              <AISearchBar onFiltersApplied={applyAIFilters} />
              {user && (
                <Button variant="outline" className="border-border gap-2 shrink-0"
                  onClick={() => setShowSaveModal(true)}>
                  <Bookmark className="w-4 h-4" />
                  Save Search
                </Button>
              )}
              <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                <button onClick={() => setViewMode("grid")} title="Grid view"
                  className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("split")} title="Split view"
                  className={`p-2.5 transition-colors ${viewMode === "split" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <Columns2 className="w-4 h-4" />
                </button>
                <button onClick={() => setViewMode("map")} title="Map view"
                  className={`p-2.5 transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                  <Map className="w-4 h-4" />
                </button>
              </div>
            </div>

            {/* Active filter chips */}
            {activeFilterCount > 0 && (
              <div className="flex items-center gap-2 mt-2 flex-wrap overflow-x-auto scrollbar-none pb-0.5">
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
                <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1 shrink-0">Clear all</button>
              </div>
            )}
          </div>
        </div>

        {/* Advanced Filters Panel — AI-powered */}
        {showFilters && (
          <div className="bg-card/95 backdrop-blur-sm border-b border-border shadow-lg">
            <div className="container py-7">
              {/* Listing status quick toggles: Off-market & Pre-sale */}
              {(selectedListingType === "sale" || !selectedListingType) && (
                <div className="mb-6 pb-5 border-b border-border">
                  <p className="text-xs font-semibold text-foreground/60 uppercase tracking-wider mb-3">Listing Status</p>
                  <div className="flex flex-wrap gap-3">
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={offMarketOnly}
                        onChange={e => setParam("off_market", e.target.checked ? "1" : "")}
                        className="rounded border-border accent-primary"
                      />
                      <span className="text-sm font-medium">🔒 Off-market only</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">Exclusive, not publicly advertised</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={preSaleOnly}
                        onChange={e => setParam("pre_sale", e.target.checked ? "1" : "")}
                        className="rounded border-border accent-primary"
                      />
                      <span className="text-sm font-medium">🏗️ Pre-sale only</span>
                      <span className="text-xs text-muted-foreground hidden sm:inline">New developments before completion</span>
                    </label>
                  </div>
                </div>
              )}

              {/* Panel header */}
              <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
                    <SlidersHorizontal className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <span className="font-display font-semibold text-sm">
                      {selectedType
                        ? `${getSubtypeLabel(selectedType, selectedSubtype) || getTypeLabel(selectedType)} Filters`
                        : "Advanced Filters"}
                    </span>
                    {!aiFiltersLoading && selectedType && (
                      <span className="flex items-center gap-1 text-[10px] text-primary/70 mt-0.5">
                        <Sparkles className="w-2.5 h-2.5" />AI-curated for this property type
                      </span>
                    )}
                  </div>
                </div>
                <button onClick={() => setShowFilters(false)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors text-muted-foreground hover:text-foreground">
                  <X className="w-4 h-4" />
                </button>
              </div>

              {aiFiltersLoading ? (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {[...Array(4)].map((_, i) => (
                    <div key={i} className="h-20 bg-secondary/60 rounded-xl animate-pulse" />
                  ))}
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {/* Size */}
                    {aiFilterConfig.sections.includes("size") && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          {aiFilterConfig.sizeLabel}
                        </label>
                        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border focus-within:border-primary transition-colors">
                          <input type="number" placeholder="Min m²" value={minSqm} onChange={e => setParam("sqm_min", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-0 min-w-0" />
                          <span className="text-muted-foreground text-xs font-medium">—</span>
                          <input type="number" placeholder="Max m²" value={maxSqm} onChange={e => setParam("sqm_max", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none w-0 min-w-0" />
                        </div>
                      </div>
                    )}
                    {/* Bedrooms */}
                    {aiFilterConfig.sections.includes("bedrooms") && aiFilterConfig.bedsLabel && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          {aiFilterConfig.bedsLabel}
                        </label>
                        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                          <select value={bedsRange[0]} onChange={e => setParam("beds_min", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">Min</option>
                            {bedsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <span className="text-muted-foreground text-xs font-medium">—</span>
                          <select value={bedsRange[1]} onChange={e => setParam("beds_max", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">Max</option>
                            {bedsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    {/* Bathrooms */}
                    {aiFilterConfig.sections.includes("bathrooms") && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Bathrooms
                        </label>
                        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                          <select value={bathsRange[0]} onChange={e => setParam("baths_min", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">Min</option>
                            {bathsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <span className="text-muted-foreground text-xs font-medium">—</span>
                          <select value={bathsRange[1]} onChange={e => setParam("baths_max", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">Max</option>
                            {bathsOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    {/* Floor */}
                    {aiFilterConfig.sections.includes("floor") && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Floor
                        </label>
                        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                          <select value={floorRange[0]} onChange={e => setParam("floor_min", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">Min</option>
                            {floorOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <span className="text-muted-foreground text-xs font-medium">—</span>
                          <select value={floorRange[1]} onChange={e => setParam("floor_max", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">Max</option>
                            {floorOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    {/* Year Built */}
                    {aiFilterConfig.sections.includes("year_built") && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Year Built
                        </label>
                        <div className="flex items-center gap-2 bg-secondary rounded-xl px-3 py-2 border border-border">
                          <select value={yearRange[0]} onChange={e => setParam("year_min", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">From</option>
                            {yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                          <span className="text-muted-foreground text-xs font-medium">—</span>
                          <select value={yearRange[1]} onChange={e => setParam("year_max", e.target.value)}
                            className="flex-1 bg-transparent text-sm text-foreground outline-none appearance-none cursor-pointer">
                            <option value="">To</option>
                            {yearOpts.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                          </select>
                        </div>
                      </div>
                    )}
                    {/* Heating */}
                    {aiFilterConfig.sections.includes("heating") && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Heating
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                          {HEATING_TYPES.map(h => (
                            <button key={h.value} onClick={() => setParam("heating", selectedHeating === h.value ? "" : h.value)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                selectedHeating === h.value
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-foreground"
                              }`}>{h.label}</button>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* Condition (renovated, new, needs renovation, etc.) */}
                    {aiFilterConfig.sections.includes("construction_status") && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Condition
                        </label>
                        <div className="relative">
                          <select value={selectedConstruction} onChange={e => setParam("construction", e.target.value)}
                            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                            <option value="">Any condition</option>
                            {CONSTRUCTION_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>
                    )}
                    {/* Land details */}
                    {aiFilterConfig.sections.includes("land_details") && (
                      <>
                        <div className="space-y-2">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                            Road Type
                          </label>
                          <div className="relative">
                            <select value={getParam("road_type")} onChange={e => setParam("road_type", e.target.value)}
                              className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                              <option value="">Any</option>
                              {ROAD_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                            </select>
                            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                          </div>
                        </div>
                        <div className="space-y-2">
                          <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                            <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                            Slope
                          </label>
                          <div className="flex gap-1.5">
                            {SLOPE_TYPES.map(s => (
                              <button key={s.value} onClick={() => setParam("slope", getParam("slope") === s.value ? "" : s.value)}
                                className={`flex-1 px-2 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                  getParam("slope") === s.value
                                    ? "border-primary bg-primary/10 text-primary"
                                    : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                                }`}>{s.label}</button>
                            ))}
                          </div>
                        </div>
                      </>
                    )}
                    {/* Commercial details */}
                    {aiFilterConfig.sections.includes("commercial_details") && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Road Frontage
                        </label>
                        <div className="relative">
                          <select value={getParam("road_type")} onChange={e => setParam("road_type", e.target.value)}
                            className="w-full bg-secondary border border-border rounded-xl px-3 py-2.5 text-sm text-foreground outline-none focus:border-primary appearance-none cursor-pointer">
                            <option value="">Any</option>
                            {ROAD_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                          </select>
                          <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
                        </div>
                      </div>
                    )}
                    {/* Rental extras */}
                    {aiFilterConfig.sections.includes("rental_extras") && selectedListingType === "rent" && (
                      <div className="space-y-2">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider">
                          <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                          Min Rental Period
                        </label>
                        <div className="flex gap-1.5 flex-wrap">
                          {[{v:"1",l:"1 mo"},{v:"3",l:"3 mo"},{v:"6",l:"6 mo"},{v:"12",l:"1 yr"}].map(o => (
                            <button key={o.v} onClick={() => setParam("min_rental", getParam("min_rental") === o.v ? "" : o.v)}
                              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                getParam("min_rental") === o.v
                                  ? "border-primary bg-primary/10 text-primary"
                                  : "border-border bg-secondary text-muted-foreground hover:border-primary/40"
                              }`}>{o.l}</button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Energy Class — visual spectrum bar */}
                  {aiFilterConfig.sections.includes("energy_class") && (
                    <div className="mt-6 pt-5 border-t border-border/60">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-brand-emerald inline-block" />
                        Energy Rating
                        {selectedEnergyClasses.length > 0 && (
                          <span className="ml-2 px-1.5 py-0.5 rounded-full bg-brand-emerald/10 border border-brand-emerald/20 text-brand-emerald text-[10px] font-bold">
                            {selectedEnergyClasses.join(", ")}
                          </span>
                        )}
                      </label>
                      <div className="flex items-stretch gap-1 rounded-xl overflow-hidden border border-border p-1 bg-secondary/50">
                        {[
                          { ec: "A+", color: "bg-[#00a550]", text: "text-white", badge: "A+" },
                          { ec: "A",  color: "bg-[#50b848]", text: "text-white", badge: "A" },
                          { ec: "B+", color: "bg-[#8dc63f]", text: "text-white", badge: "B+" },
                          { ec: "B",  color: "bg-[#c3d600]", text: "text-black", badge: "B" },
                          { ec: "C",  color: "bg-[#ffcc00]", text: "text-black", badge: "C" },
                          { ec: "D",  color: "bg-[#f7941e]", text: "text-white", badge: "D" },
                          { ec: "E",  color: "bg-[#f15a22]", text: "text-white", badge: "E" },
                          { ec: "F",  color: "bg-[#ed1c24]", text: "text-white", badge: "F" },
                          { ec: "G",  color: "bg-[#be1e2d]", text: "text-white", badge: "G" },
                        ].map(({ ec, color, text, badge }) => {
                          const active = selectedEnergyClasses.includes(ec);
                          return (
                            <button
                              key={ec}
                              onClick={() => toggleMulti("energy", ec)}
                              title={`Energy class ${ec}`}
                              className={`flex-1 flex flex-col items-center justify-center py-2.5 rounded-lg transition-all relative group ${
                                active
                                  ? `${color} ${text} shadow-md scale-105 z-10 ring-2 ring-white/30`
                                  : `${color} ${text} opacity-40 hover:opacity-80 hover:scale-102`
                              }`}
                            >
                              <span className="font-black text-[11px] leading-none">{badge}</span>
                              {active && (
                                <span className="absolute -top-1.5 -right-1.5 w-3.5 h-3.5 rounded-full bg-white flex items-center justify-center shadow">
                                  <Check className="w-2 h-2 text-black" />
                                </span>
                              )}
                            </button>
                          );
                        })}
                      </div>
                      <div className="flex justify-between mt-1 px-1">
                        <span className="text-[10px] text-brand-emerald font-semibold">Most efficient</span>
                        <span className="text-[10px] text-muted-foreground">Least efficient</span>
                      </div>
                    </div>
                  )}

                  {/* Property Style chips */}
                  {(() => {
                    const styleFilters = TYPE_STYLE_FILTERS[selectedType as PropertyTypeKey];
                    if (!styleFilters?.length) return null;
                    const selectedStyles = getMulti("style");
                    return (
                      <div className="mt-5 pt-5 border-t border-border/60">
                        <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-3">
                          <span className="w-1.5 h-1.5 rounded-full bg-accent inline-block" />
                          Property Style
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {styleFilters.map(s => (
                            <FilterChip key={s.value} active={selectedStyles.includes(s.value)}
                              onClick={() => toggleMulti("style", s.value)}>
                              {s.label}
                            </FilterChip>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* AI-curated feature chips */}
                  {aiFilterConfig.features.length > 0 && (
                    <div className="mt-5 pt-5 border-t border-border/60">
                      <label className="flex items-center gap-1.5 text-xs font-semibold text-foreground/70 uppercase tracking-wider mb-3">
                        <span className="w-1.5 h-1.5 rounded-full bg-primary inline-block" />
                        {aiFilterConfig.featuresLabel}
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {aiFilterConfig.features.map(feat => (
                          <FilterChip key={feat.key} active={selectedFeatures.includes(feat.key)}
                            onClick={() => toggleMulti("features", feat.key)}>
                            {feat.label}
                          </FilterChip>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}

              <div className="flex items-center gap-3 mt-6 pt-5 border-t border-border">
                <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-2 px-5" onClick={() => setShowFilters(false)}>
                  <Check className="w-3.5 h-3.5" />
                  Show {filtered.length} Results
                </Button>
                <Button size="sm" variant="ghost" className="text-muted-foreground hover:text-foreground gap-1" onClick={clearAllFilters}>
                  <X className="w-3 h-3" />
                  Reset All
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Results */}
        <div className={`${viewMode === "split" ? "" : "container"} py-4 sm:py-8 pb-28 lg:pb-8`}>
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
                  <MapGate consent={consent} accept={accept} height="100%">
                    <MapView
                      listings={filtered}
                      onVisibleListingsChange={setViewportIds}
                      onPolygonFilter={ids => { setPolygonFilterIds(ids); }}
                      height="100%"
                    />
                  </MapGate>
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
              <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
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
            <MapGate consent={consent} accept={accept}>
              <MapView
                listings={filtered}
                onVisibleListingsChange={setViewportIds}
                onPolygonFilter={setPolygonFilterIds}
              />
            </MapGate>
          )}
        </div>
      </div>

      <Footer />

      {/* Floating Map / List pill — mobile only, above bottom nav */}
      <div className="md:hidden fixed bottom-[4.75rem] left-1/2 -translate-x-1/2 z-50 animate-fade-in">
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

      {/* bottom spacing for mobile nav */}
      <div className="h-16 md:hidden" />

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
