import { useState, useMemo, lazy, Suspense } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
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
import { MAIPROP_LOGO_FALLBACK_URL } from "@/lib/imageFallbacks";
import { CATALOG_STATIC_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { fetchPublicApi } from "@/lib/publicApi";
import { ENERGY_CLASSES, FEATURES_RESIDENTIAL } from "@/lib/filterConfig";
import { fmtDate, fmtTime, Pill, RangeInput, OpenHouseCard } from "@/components/open-houses/OpenHousePrimitives";
import { cn } from "@/lib/utils";
import type { Database } from "@/integrations/supabase/types";

// skipcq: JS-0067 - Skeleton helper is intentionally module-scoped.
function OpenHouseCardSkeleton() {
  return (
    <div className="property-card rounded-2xl overflow-hidden bg-card border border-border flex flex-col">
      <div className="aspect-[4/3] sm:aspect-[3/2] bg-secondary animate-pulse" />
      <div className="p-4 flex flex-col gap-3">
        <div className="space-y-2">
          <div className="h-4 w-3/4 rounded bg-secondary animate-pulse" />
          <div className="h-3 w-1/2 rounded bg-secondary animate-pulse" />
        </div>
        <div className="flex gap-2">
          <div className="h-7 w-20 rounded-lg bg-secondary animate-pulse" />
          <div className="h-7 w-16 rounded-lg bg-secondary animate-pulse" />
          <div className="h-7 w-24 rounded-lg bg-secondary animate-pulse" />
        </div>
        <div className="h-14 rounded-xl bg-secondary animate-pulse" />
        <div className="mt-auto pt-3 border-t border-border flex gap-2">
          <div className="h-10 flex-1 rounded-xl bg-secondary animate-pulse" />
          <div className="h-10 w-10 rounded-xl bg-secondary animate-pulse" />
          <div className="h-10 w-10 rounded-xl bg-secondary animate-pulse" />
        </div>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
const OPEN_HOUSE_LOADING_SKELETON_KEYS = [
  "open-house-loading-1",
  "open-house-loading-2",
  "open-house-loading-3",
  "open-house-loading-4",
  "open-house-loading-5",
  "open-house-loading-6",
];

const OPEN_HOUSE_LISTING_COLUMNS = [
  "id",
  "title",
  "address",
  "city",
  "region",
  "status",
  "listing_type",
  "property_type",
  "price",
  "price_per_sqm",
  "sqm",
  "bedrooms",
  "bathrooms",
  "floor",
  "total_floors",
  "year_built",
  "energy_class",
  "open_house_date",
  "ai_score",
  "views_count",
  "tags",
  "cover_image_url",
  "latitude",
  "longitude",
  ...FEATURES_RESIDENTIAL.map((feature) => feature.key),
];

const OPEN_HOUSE_LISTING_SELECT = `${Array.from(new Set(OPEN_HOUSE_LISTING_COLUMNS)).join(",")},listing_images(url, sort_order)`;
type ListingRow = Database["public"]["Tables"]["listings"]["Row"];
type OpenHouseListingRow = Pick<
  ListingRow,
  | "id"
  | "title"
  | "address"
  | "city"
  | "region"
  | "status"
  | "listing_type"
  | "property_type"
  | "price"
  | "price_per_sqm"
  | "sqm"
  | "bedrooms"
  | "bathrooms"
  | "floor"
  | "total_floors"
  | "year_built"
  | "energy_class"
  | "open_house_date"
  | "ai_score"
  | "views_count"
  | "tags"
  | "cover_image_url"
  | "latitude"
  | "longitude"
  | "has_parking"
  | "has_elevator"
  | "has_balcony"
  | "has_pool"
  | "pets_allowed"
  | "has_furnished"
  | "has_garden"
  | "has_ac"
  | "has_fireplace"
  | "has_storage"
  | "has_view"
  | "has_smart_home"
  | "has_attic"
  | "has_double_glazing"
  | "has_secure_door"
  | "has_alarm"
> & {
  listing_images?: Array<Pick<Database["public"]["Tables"]["listing_images"]["Row"], "url" | "sort_order">> | null;
};

// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
export default function OpenHouses() { // skipcq: JS-R1005 - Open houses coordinates filters, map/list view, query state, and card projection in one route shell.
  const { i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
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
  const [polygonFilterIds, setPolygonFilterIds] = useState<Set<string> | null>(null);

  const YEAR_RANGES = [
    { label: isGreek ? "Οποιοδήποτε έτος" : "Any Year", value: "" },
    { label: "Pre-1980", value: "0-1979" },
    { label: "1980–2000", value: "1980-2000" },
    { label: "2000–2010", value: "2000-2010" },
    { label: "2010–2020", value: "2010-2020" },
    { label: isGreek ? "Μετά το 2020" : "Post-2020", value: "2020-2100" },
  ];

  const PROPERTY_TYPES = [
    { value: "", label: isGreek ? "Όλοι οι τύποι" : "All types" },
    { value: "apartment", label: isGreek ? "Διαμέρισμα" : "Apartment" },
    { value: "house", label: isGreek ? "Μονοκατοικία" : "House" },
    { value: "villa", label: isGreek ? "Βίλα" : "Villa" },
    { value: "commercial", label: isGreek ? "Επαγγελματικό" : "Commercial" },
    { value: "office", label: isGreek ? "Γραφείο" : "Office" },
    { value: "land", label: isGreek ? "Γη / Οικόπεδο" : "Land" },
  ];

  const isProductionVisibleOpenHouse = (listing: { title?: string | null; address?: string | null; city?: string | null }) => {
    const text = [listing.title, listing.address, listing.city].filter(Boolean).join(" ");
    return !/\bsupervisor-\d+/i.test(text);
  };

  const normalizeOpenHouseRows = (rows: OpenHouseListingRow[]) =>
    rows.filter(isProductionVisibleOpenHouse).sort((a, b) => {
      const aHasImg = Boolean(a.cover_image_url || a.listing_images?.length);
      const bHasImg = Boolean(b.cover_image_url || b.listing_images?.length);
      return (bHasImg ? 1 : 0) - (aHasImg ? 1 : 0);
    });

  const { data: listings = [], isLoading, isError, refetch } = useQuery({
    queryKey: ["open-houses", showPast],
    queryFn: async () => { // skipcq: JS-R1005 - Query keeps time filtering, production cleanup, and media-first sorting together.
      const cached = await fetchPublicApi<OpenHouseListingRow[]>(
        `/api/public/open-houses?showPast=${showPast ? "1" : "0"}&limit=200`,
      );
      if (cached) return normalizeOpenHouseRows(cached);

      const now = new Date().toISOString();
      let q = supabase
        .from("listings")
        .select(OPEN_HOUSE_LISTING_SELECT)
        .order("sort_order", { referencedTable: "listing_images", ascending: true })
        .limit(3, { referencedTable: "listing_images" })
        .eq("status", "active")
        .eq("listing_type", "open_house");
      if (showPast) {
        q = q.lt("open_house_date", now).order("open_house_date", { ascending: false });
      } else {
        q = q.gte("open_house_date", now).order("open_house_date", { ascending: true });
      }
      const { data, error } = await q.limit(200);
      if (error) throw error;
      const rows = (data || []) as unknown as OpenHouseListingRow[];
      return normalizeOpenHouseRows(rows);
    },
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });

  // Client-side filtering
  const filtered = useMemo(() => { // skipcq: JS-R1005 - Client filters intentionally mirror the visible filter controls in one memoized pass.
    return listings.filter((l) => { // skipcq: JS-R1005 - Each listing is checked against the independent filter controls in display order.
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
    Boolean(cityFilter) || Boolean(propertyType) || Boolean(minPrice) || Boolean(maxPrice) || Boolean(minSqm) ||
    Boolean(maxSqm) || bedroomsMin !== null || Boolean(energyClass) || Boolean(filterYearRange) || selectedFeatures.length > 0;

  function clearFilters() {
    setCityFilter(""); setCityInput("");
    setPropertyType(""); setMinPrice(""); setMaxPrice("");
    setMinSqm(""); setMaxSqm(""); setBedroomsMin(null);
    setEnergyClass(""); setFilterYearRange(""); setSelectedFeatures([]);
    setPolygonFilterIds(null);
  }

  function toggleFeature(key: string) {
    setSelectedFeatures(prev =>
      prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
    );
  }

  const cards = filtered.map((l) => { // skipcq: JS-R1005 - Card projection normalizes image fallback, dates, geo, and card fields together.
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
    if (!imgs.length) imgs.push(MAIPROP_LOGO_FALLBACK_URL);
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

  const areaFilteredCards = useMemo(() => {
    if (!polygonFilterIds) return cards;
    return cards.filter(({ card }) => polygonFilterIds.has(card.id));
  }, [cards, polygonFilterIds]);

  const isEmpty = listings.length === 0;
  const displayData = isError ? [] : areaFilteredCards;
  const pageTitle = isGreek ? "Ανοιχτές Επισκέψεις - mAI prop" : "Open Houses - mAI prop";

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
        <title>{pageTitle}</title>
        <meta property="og:title" content={pageTitle} />
      </Helmet>
      <Navbar />
      <div className="pt-16">
        {/* Hero header */}
        <div className="border-b border-border bg-card/60 py-8">
          <div className="container">
            <div className="flex items-center gap-2 mb-2">
              <DoorOpen className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">{isGreek ? "Ανοιχτές Επισκέψεις" : "Open Houses"}</span>
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold">
                  {showPast ? (isGreek ? "Προηγούμενες ανοιχτές επισκέψεις" : "Past Open Houses") : (isGreek ? "Προσεχείς ανοιχτές επισκέψεις" : "Upcoming Open Houses")}
                </h1>
                <p className="text-muted-foreground text-sm mt-1">
                  {isError
                    ? isGreek ? "Δεν ήταν δυνατή η φόρτωση των ανοιχτών επισκέψεων." : "Could not load open houses."
                    : isEmpty
                    ? showPast ? (isGreek ? "Δεν βρέθηκαν προηγούμενες ανοιχτές επισκέψεις." : "No past open houses found.") : (isGreek ? "Δεν υπάρχουν προσεχείς ανοιχτές επισκέψεις. Οι μεσίτες μπορούν να δημοσιεύσουν από τον πίνακα." : "No upcoming open houses. Agents can publish from the dashboard.")
                    : isGreek
                      ? `${displayData.length} ${displayData.length === 1 ? "εκδήλωση" : "εκδηλώσεις"} βρέθηκαν${polygonFilterIds ? " στην επιλεγμένη περιοχή" : ""}`
                      : `${displayData.length} event${displayData.length !== 1 ? "s" : ""} found${polygonFilterIds ? " in selected area" : ""}`}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center rounded-lg border border-border overflow-hidden text-sm">
                  <button
                    onClick={() => setShowPast(false)}
                    className={`px-4 py-2 font-medium transition-colors ${!showPast ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}
                  >
                    {isGreek ? "Προσεχείς" : "Upcoming"}
                  </button>
                  <button
                    onClick={() => setShowPast(true)}
                    className={`px-4 py-2 font-medium transition-colors ${showPast ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}
                  >
                    {isGreek ? "Προηγούμενες" : "Past"}
                  </button>
                </div>
                <Button asChild variant="outline" className="gap-2 shrink-0">
                  <Link to="/dashboard?tab=open-houses">{isGreek ? "Οι ανοιχτές επισκέψεις μου" : "My Open Houses"}</Link>
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
                  placeholder={isGreek ? "Πόλη..." : "City…"}
                  aria-label={isGreek ? "Αναζήτηση ανοιχτών επισκέψεων ανά πόλη" : "Search open houses by city"}
                  value={cityInput}
                  onChange={(e) => setCityInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setCityFilter(cityInput)}
                  className="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* View mode toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label={isGreek ? "Τρόπος προβολής" : "View mode"}>
                <button
                  onClick={() => setViewMode("grid")}
                  aria-label={isGreek ? "Προβολή ως λίστα" : "Show as list"}
                  aria-pressed={viewMode === "grid"}
                  className={cn(
                    "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors",
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{isGreek ? "Λίστα" : "List"}</span>
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  aria-label={isGreek ? "Προβολή στον χάρτη" : "Show on map"}
                  aria-pressed={viewMode === "map"}
                  className={cn(
                    "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors border-l border-border",
                    viewMode === "map"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{isGreek ? "Χάρτης" : "Map"}</span>
                </button>
              </div>

              {/* Filters button */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                aria-label={isGreek ? "Εναλλαγή φίλτρων" : "Toggle filters"}
                aria-expanded={showAdvanced}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0",
                  showAdvanced
                    ? "bg-primary/10 text-primary border-primary/40"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xs:inline">{isGreek ? "Φίλτρα" : "Filters"}</span>
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
                  <span className="text-xs text-muted-foreground font-medium">{isGreek ? "Τύπος ακινήτου" : "Property Type"}</span>
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
                  label={isGreek ? "Τιμή (€)" : "Price (€)"}
                  minVal={minPrice}
                  maxVal={maxPrice}
                  onMinChange={setMinPrice}
                  onMaxChange={setMaxPrice}
                  prefix="€"
                  locale={i18n.language}
                />

                {/* Size */}
                <RangeInput
                  label={isGreek ? "Εμβαδόν (τ.μ.)" : "Size (m²)"}
                  minVal={minSqm}
                  maxVal={maxSqm}
                  onMinChange={setMinSqm}
                  onMaxChange={setMaxSqm}
                  prefix="m²"
                  locale={i18n.language}
                />

                {/* Bedrooms */}
                <div className="space-y-1">
                  <span className="text-xs text-muted-foreground font-medium flex items-center gap-1">
                    <BedDouble className="w-3.5 h-3.5" /> {isGreek ? "Ελάχιστα υπνοδωμάτια" : "Min Bedrooms"}
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
                        {b === null ? (isGreek ? "Όλα" : "Any") : `${b}+`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Construction year */}
                <div className="space-y-1">
                  <label htmlFor="oh-year-range" className="text-xs text-muted-foreground font-medium">{isGreek ? "Έτος κατασκευής" : "Construction Year"}</label>
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
                  <span className="text-xs text-muted-foreground font-medium">{isGreek ? "Ενεργειακή κλάση" : "Energy Class"}</span>
                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={() => setEnergyClass("")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                        !energyClass ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                      )}
                    >{isGreek ? "Όλα" : "Any"}</button>
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
                  <span className="text-xs text-muted-foreground font-medium">{isGreek ? "Χαρακτηριστικά" : "Features"}</span>
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
                      <X className="w-3.5 h-3.5" /> {isGreek ? "Εκκαθάριση όλων των φίλτρων" : "Clear all filters"}
                    </button>
                  </div>
                )}
              </div>
            )}
            {polygonFilterIds && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2 text-xs">
                <span className="font-medium text-primary">
                  {isGreek
                    ? `Φίλτρο περιοχής ενεργό · ${displayData.length} ${displayData.length === 1 ? "ανοιχτή επίσκεψη" : "ανοιχτές επισκέψεις"} στην περιοχή`
                    : `Area filter active · ${displayData.length} open house${displayData.length !== 1 ? "s" : ""} in area`}
                </span>
                <button
                  type="button"
                  onClick={() => setPolygonFilterIds(null)}
                  className="font-medium text-primary hover:underline"
                >
                  {isGreek ? "Εκκαθάριση περιοχής" : "Clear area"}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        <div className={viewMode === "map" ? "h-[calc(100vh-13rem)]" : "container py-8"}>
          {isLoading ? (
            <div className="space-y-4" aria-busy="true" aria-label={isGreek ? "Φόρτωση ανοιχτών επισκέψεων" : "Loading open houses"}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>{isGreek ? "Φόρτωση ανοιχτών επισκέψεων" : "Loading open houses"}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
                {OPEN_HOUSE_LOADING_SKELETON_KEYS.map((key) => (
                  <OpenHouseCardSkeleton key={key} />
                ))}
              </div>
            </div>
          ) : viewMode === "map" ? (
            /* ── Map view ── */
            mapListings.length > 0 ? (
              <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                <MapView
                  listings={mapListings}
                  height="100%"
                  itemLabelSingular={isGreek ? "ανοιχτή επίσκεψη" : "open house"}
                  itemLabelPlural={isGreek ? "ανοιχτές επισκέψεις" : "open houses"}
                  onPolygonFilter={setPolygonFilterIds}
                />
              </Suspense>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <MapPin className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">{isGreek ? "Δεν υπάρχουν ανοιχτές επισκέψεις με δεδομένα τοποθεσίας για προβολή στον χάρτη." : "No open houses with location data to display on map."}</p>
                <Button variant="outline" size="sm" onClick={() => setViewMode("grid")}>
                  {isGreek ? "Μετάβαση σε λίστα" : "Switch to list view"}
                </Button>
              </div>
            )
          ) : isError ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <AlertCircle className="w-14 h-14 text-destructive mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">{isGreek ? "Δεν ήταν δυνατή η φόρτωση των ανοιχτών επισκέψεων" : "Could not load open houses"}</h2>
              <p className="text-sm text-muted-foreground mb-4">{isGreek ? "Παρακαλώ δοκιμάστε ξανά." : "Please try again."}</p>
              <Button variant="outline" onClick={() => refetch()}>{isGreek ? "Επανάληψη" : "Retry"}</Button>
            </div>
          ) : displayData.length === 0 ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <Calendar className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">{isGreek ? "Δεν υπάρχουν ανοιχτές επισκέψεις που ταιριάζουν στα φίλτρα" : "No open houses match your filters"}</h2>
              <p className="text-sm text-muted-foreground mb-4">{isGreek ? "Δοκιμάστε να διευρύνετε τα κριτήρια αναζήτησης." : "Try broadening your search criteria."}</p>
              <Button variant="outline" onClick={clearFilters}>{isGreek ? "Εκκαθάριση φίλτρων" : "Clear filters"}</Button>
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
