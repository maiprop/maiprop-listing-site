import { useState, useMemo, lazy, Suspense, useCallback, useEffect } from "react";
import { Helmet } from "react-helmet-async";
import { Link, useSearchParams } from "react-router-dom";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import {
  Calendar, MapPin, Loader2, DoorOpen, SlidersHorizontal, X,
  ChevronDown, Search, BedDouble, LayoutGrid, Map as MapIcon,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Navbar } from "@/components/Navbar";
import { Footer } from "@/components/Footer";
import type { MapListing, MapPolygon, MapViewportBounds } from "@/components/MapView";
import { pointInPolygon } from "@/components/map/mapConfig";
const MapView = lazy(() => import("@/components/MapView").then(m => ({ default: m.MapView })));
import { useInfiniteQuery } from "@tanstack/react-query";
import { getStreetViewProxyUrl } from "@/lib/config";
import { MAIPROP_LOGO_FALLBACK_URL } from "@/lib/imageFallbacks";
import { CATALOG_STATIC_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { fetchPublicApi } from "@/lib/publicApi";
import { ENERGY_CLASSES, FEATURES_RESIDENTIAL } from "@/lib/filterConfig";
import {
  fmtDate,
  fmtTime,
  Pill,
  RangeInput,
  OpenHouseCard,
  OPEN_HOUSE_CARD_LAYOUT_CLASS,
} from "@/components/open-houses/OpenHousePrimitives";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";
import { VirtualizedListingGrid } from "@/components/listings/VirtualizedListingGrid";
import { cn } from "@/lib/utils";
import { calculatePricePerSqm } from "@/lib/priceCalculations";
import type { Database } from "@/integrations/supabase/types";

const OPEN_HOUSES_FALLBACKS: Record<string, string> = {
  "common.retry": "Try again",
  "openHouses.page.retryButton": "Retry",
  "openHouses.page.pageTitle": "Open Houses - mAI prop",
  "openHouses.page.eyebrow": "Open Houses",
  "openHouses.page.headingUpcoming": "Upcoming Open Houses",
  "openHouses.page.headingPast": "Past Open Houses",
  "openHouses.page.loadError": "Could not load open houses.",
  "openHouses.page.emptyUpcoming": "No upcoming open houses. Agents can publish from the dashboard.",
  "openHouses.page.emptyPast": "No past open houses found.",
  "openHouses.page.countOne": "{{count}} open house found{{areaSuffix}}",
  "openHouses.page.countOther": "{{count}} open houses found{{areaSuffix}}",
  "openHouses.page.countAreaSuffix": " in the selected area",
  "openHouses.page.tabs.upcoming": "Upcoming",
  "openHouses.page.tabs.past": "Past",
  "openHouses.page.myOpenHouses": "My Open Houses",
  "openHouses.page.cityPlaceholder": "City...",
  "openHouses.page.citySearchAria": "Search open houses by city",
  "openHouses.page.transactionType": "Open house type",
  "openHouses.page.transactionTypes.all": "All open houses",
  "openHouses.page.transactionTypes.sale": "Sale open houses",
  "openHouses.page.transactionTypes.rent": "Rental open houses",
  "openHouses.page.viewModeAria": "View mode",
  "openHouses.page.showListAria": "Show as list",
  "openHouses.page.showMapAria": "Show on map",
  "openHouses.page.list": "List",
  "openHouses.page.map": "Map",
  "openHouses.page.filtersAria": "Toggle filters",
  "openHouses.page.filters": "Filters",
  "openHouses.page.propertyType": "Property Type",
  "openHouses.page.price": "Price (€)",
  "openHouses.page.size": "Size (m²)",
  "openHouses.page.minBedrooms": "Min Bedrooms",
  "openHouses.page.any": "Any",
  "openHouses.page.constructionYear": "Construction Year",
  "openHouses.page.energyClass": "Energy Class",
  "openHouses.page.features": "Features",
  "openHouses.page.clearAllFilters": "Clear all filters",
  "openHouses.page.areaActiveOne": "Area filter active · {{count}} open house in area",
  "openHouses.page.areaActiveOther": "Area filter active · {{count}} open houses in area",
  "openHouses.page.clearArea": "Clear area",
  "openHouses.page.loading": "Loading open houses",
  "openHouses.page.mapLabelSingular": "open house",
  "openHouses.page.mapLabelPlural": "open houses",
  "openHouses.page.noMapListings": "No open houses with location data to display on map.",
  "openHouses.page.switchToList": "Switch to list view",
  "openHouses.page.mapWindowIncomplete": "Zoom in to load all open houses",
  "openHouses.page.loadMoreError": "Could not load more open houses.",
  "openHouses.page.retryLoadMore": "Retry loading more open houses",
  "openHouses.page.errorTitle": "Could not load open houses",
  "openHouses.page.retryPrompt": "Please try again.",
  "openHouses.page.emptyFilteredTitle": "No open houses match your filters",
  "openHouses.page.emptyFilteredPrompt": "Try broadening your search criteria.",
  "openHouses.page.clearFilters": "Clear filters",
  "openHouses.page.yearRanges.any": "Any Year",
  "openHouses.page.yearRanges.post2020": "Post-2020",
  "openHouses.page.propertyTypes.all": "All types",
  "openHouses.page.propertyTypes.apartment": "Apartment",
  "openHouses.page.propertyTypes.house": "House",
  "openHouses.page.propertyTypes.villa": "Villa",
  "openHouses.page.propertyTypes.commercial": "Commercial",
  "openHouses.page.propertyTypes.office": "Office",
  "openHouses.page.propertyTypes.land": "Land",
  "openHouses.page.featureLabels.has_parking": "Parking",
  "openHouses.page.featureLabels.has_elevator": "Elevator",
  "openHouses.page.featureLabels.has_balcony": "Balcony",
  "openHouses.page.featureLabels.has_pool": "Pool",
  "openHouses.page.featureLabels.pets_allowed": "Pet friendly",
  "openHouses.page.featureLabels.has_furnished": "Furnished",
  "openHouses.page.featureLabels.has_garden": "Garden",
  "openHouses.page.featureLabels.has_ac": "A/C",
  "openHouses.page.featureLabels.has_fireplace": "Fireplace",
  "openHouses.page.featureLabels.has_storage": "Storage",
  "openHouses.page.featureLabels.has_view": "View",
  "openHouses.page.featureLabels.has_smart_home": "Smart home",
};

const getTranslatedValue = (t: TFunction, key: string, fallback = OPEN_HOUSES_FALLBACKS[key] ?? key) => {
  const value = t(key);
  return value === key ? fallback : value;
};

const interpolateTranslation = (t: TFunction, key: string, values: Record<string, string>) =>
  getTranslatedValue(t, key).replace(/{{\s*(\w+)\s*}}/g, (_match, name) => values[name] ?? "");

// skipcq: JS-0067 - Skeleton helper is intentionally module-scoped.
function OpenHouseCardSkeleton() {
  return (
    <div className="property-card rounded-2xl overflow-hidden bg-card border border-border flex flex-col">
      <div className="aspect-[4/3] sm:aspect-[3/2] bg-secondary animate-pulse" />
      <div className="p-4 flex flex-1 flex-col gap-3">
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
  | "open_house_transaction_type"
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
  publicationId?: number;
  listing_images?: Array<Pick<Database["public"]["Tables"]["listing_images"]["Row"], "url" | "sort_order">> | null;
};

type PublicOpenHouseWindow = {
  data: OpenHouseListingRow[];
  hasMore: boolean;
  limit: number;
  nextCursor: string | null;
};

const OPEN_HOUSE_PAGE_SIZE = 60;
const OPEN_HOUSE_NUMERIC_FILTER_DEBOUNCE_MS = 300;

function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedValue(value), delayMs);
    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
}

// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
export default function OpenHouses() { // skipcq: JS-R1005 - Open houses coordinates filters, map/list view, query state, and card projection in one route shell.
  const { t, i18n } = useTranslation();
  const [searchParams, setSearchParams] = useSearchParams();
  const cityParam = searchParams.get("city") || "";
  const transactionParam = searchParams.get("transaction");
  const transactionFilter = transactionParam === "rent" || transactionParam === "sale" ? transactionParam : "";

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
  const [polygonPoints, setPolygonPoints] = useState<MapPolygon | null>(null);
  const [mapBounds, setMapBounds] = useState<MapViewportBounds | null>(null);
  const queryMinPrice = useDebouncedValue(minPrice, OPEN_HOUSE_NUMERIC_FILTER_DEBOUNCE_MS);
  const queryMaxPrice = useDebouncedValue(maxPrice, OPEN_HOUSE_NUMERIC_FILTER_DEBOUNCE_MS);
  const queryMinSqm = useDebouncedValue(minSqm, OPEN_HOUSE_NUMERIC_FILTER_DEBOUNCE_MS);
  const queryMaxSqm = useDebouncedValue(maxSqm, OPEN_HOUSE_NUMERIC_FILTER_DEBOUNCE_MS);

  const YEAR_RANGES = [
    { label: getTranslatedValue(t, "openHouses.page.yearRanges.any"), value: "" },
    { label: "Pre-1980", value: "0-1979" },
    { label: "1980-2000", value: "1980-2000" },
    { label: "2000-2010", value: "2000-2010" },
    { label: "2010-2020", value: "2010-2020" },
    { label: getTranslatedValue(t, "openHouses.page.yearRanges.post2020"), value: "2020-2100" },
  ];

  const PROPERTY_TYPES = [
    { value: "", label: getTranslatedValue(t, "openHouses.page.propertyTypes.all") },
    { value: "apartment", label: getTranslatedValue(t, "openHouses.page.propertyTypes.apartment") },
    { value: "house", label: getTranslatedValue(t, "openHouses.page.propertyTypes.house") },
    { value: "villa", label: getTranslatedValue(t, "openHouses.page.propertyTypes.villa") },
    { value: "commercial", label: getTranslatedValue(t, "openHouses.page.propertyTypes.commercial") },
    { value: "office", label: getTranslatedValue(t, "openHouses.page.propertyTypes.office") },
    { value: "land", label: getTranslatedValue(t, "openHouses.page.propertyTypes.land") },
  ];
  const TRANSACTION_TYPES = [
    { value: "", label: getTranslatedValue(t, "openHouses.page.transactionTypes.all") },
    { value: "sale", label: getTranslatedValue(t, "openHouses.page.transactionTypes.sale") },
    { value: "rent", label: getTranslatedValue(t, "openHouses.page.transactionTypes.rent") },
  ] as const;

  const setTransactionFilter = (value: "" | "sale" | "rent") => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      if (value) next.set("transaction", value);
      else next.delete("transaction");
      return next;
    }, { replace: true });
  };

  const isProductionVisibleOpenHouse = (listing: { title?: string | null; address?: string | null; city?: string | null }) => {
    const text = [listing.title, listing.address, listing.city].filter(Boolean).join(" ");
    return !/\bsupervisor-\d+/i.test(text);
  };

  const normalizeOpenHouseRows = (rows: OpenHouseListingRow[]) =>
    rows.filter(isProductionVisibleOpenHouse);

  const activeMapBounds = viewMode === "map" ? mapBounds : null;
  const {
    data: listingWindow,
    isLoading,
    isError,
    isFetchNextPageError,
    refetch,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isFetching,
  } = useInfiniteQuery({
    queryKey: [
      "open-houses",
      showPast,
      transactionFilter,
      cityFilter,
      propertyType,
      queryMinPrice,
      queryMaxPrice,
      queryMinSqm,
      queryMaxSqm,
      bedroomsMin,
      energyClass,
      filterYearRange,
      selectedFeatures,
      activeMapBounds?.west,
      activeMapBounds?.south,
      activeMapBounds?.east,
      activeMapBounds?.north,
    ],
    initialPageParam: null as string | null,
    queryFn: async ({ signal, pageParam }) => { // skipcq: JS-R1005 - Query serializes the complete server-side Open House filter contract.
      const params = new URLSearchParams([
        ["showPast", showPast ? "1" : "0"],
        ["limit", String(OPEN_HOUSE_PAGE_SIZE)],
        ["includeMeta", "1"],
      ]);
      if (pageParam) params.set("cursor", pageParam);
      if (transactionFilter) params.set("transactionType", transactionFilter);
      if (cityFilter) params.set("city", cityFilter);
      if (propertyType) params.set("propertyType", propertyType);
      if (queryMinPrice) params.set("priceMin", queryMinPrice);
      if (queryMaxPrice) params.set("priceMax", queryMaxPrice);
      if (queryMinSqm) params.set("sqmMin", queryMinSqm);
      if (queryMaxSqm) params.set("sqmMax", queryMaxSqm);
      if (bedroomsMin != null) params.set("bedroomsMin", String(bedroomsMin));
      if (energyClass) params.set("energyClass", energyClass);
      if (filterYearRange) {
        const [yearMin, yearMax] = filterYearRange.split("-");
        if (yearMin) params.set("yearMin", yearMin);
        if (yearMax) params.set("yearMax", yearMax);
      }
      for (const feature of selectedFeatures) params.append("features", feature);
      if (activeMapBounds) {
        params.set("boundsWest", String(activeMapBounds.west));
        params.set("boundsSouth", String(activeMapBounds.south));
        params.set("boundsEast", String(activeMapBounds.east));
        params.set("boundsNorth", String(activeMapBounds.north));
      }

      const cached = await fetchPublicApi<PublicOpenHouseWindow>(
        `/api/public/open-houses?${params.toString()}`,
        { throwOnError: true, signal },
      );
      if (!cached) throw new Error("Public open houses API returned no data");
      return {
        ...cached,
        data: normalizeOpenHouseRows(cached.data),
      };
    },
    getNextPageParam: (lastPage) => (
      lastPage.hasMore && lastPage.nextCursor ? lastPage.nextCursor : undefined
    ),
    placeholderData: (previousData) => previousData,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
  const loadedPageCount = listingWindow?.pages.length ?? 0;
  const listings = useMemo(
    () => listingWindow?.pages.flatMap((page) => page.data) ?? [],
    [listingWindow],
  );
  const hasMoreListings = Boolean(hasNextPage);
  const isInitialLoadError = isError && !isFetchNextPageError;

  const handleViewportBoundsChange = useCallback((nextBounds: MapViewportBounds) => {
    setMapBounds((previousBounds) => (
      previousBounds
      && previousBounds.west === nextBounds.west
      && previousBounds.south === nextBounds.south
      && previousBounds.east === nextBounds.east
      && previousBounds.north === nextBounds.north
        ? previousBounds
        : nextBounds
    ));
  }, []);

  useEffect(() => {
    if (
      viewMode !== "map" ||
      !mapBounds ||
      !hasNextPage ||
      isFetchingNextPage ||
      isError ||
      loadedPageCount >= 3
    ) return;
    void fetchNextPage();
  }, [fetchNextPage, hasNextPage, isError, isFetchingNextPage, loadedPageCount, mapBounds, viewMode]);
  const isMapWindowIncomplete =
    viewMode === "map" &&
    Boolean(hasNextPage) &&
    loadedPageCount >= 3;

  // Client-side filtering
  const filtered = useMemo(() => { // skipcq: JS-R1005 - Client filters intentionally mirror the visible filter controls in one memoized pass.
    return listings.filter((l) => { // skipcq: JS-R1005 - Each listing is checked against the independent filter controls in display order.
      if (cityFilter && !l.city?.toLowerCase().includes(cityFilter.toLowerCase())) return false;
      if (transactionFilter && (l.open_house_transaction_type ?? "sale") !== transactionFilter) return false;
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
  }, [listings, cityFilter, transactionFilter, propertyType, minPrice, maxPrice, minSqm, maxSqm, bedroomsMin, energyClass, filterYearRange, selectedFeatures]);

  const hasActiveFilters =
    Boolean(cityFilter) || Boolean(propertyType) || Boolean(minPrice) || Boolean(maxPrice) || Boolean(minSqm) ||
    Boolean(maxSqm) || bedroomsMin !== null || Boolean(energyClass) || Boolean(filterYearRange) ||
    Boolean(transactionFilter) || selectedFeatures.length > 0;

  function clearFilters() {
    setCityFilter(""); setCityInput("");
    setTransactionFilter("");
    setPropertyType(""); setMinPrice(""); setMaxPrice("");
    setMinSqm(""); setMaxSqm(""); setBedroomsMin(null);
    setEnergyClass(""); setFilterYearRange(""); setSelectedFeatures([]);
    setPolygonPoints(null);
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
      id: l.id,
      listing: l,
      card: {
        id: l.id,
        title: l.title,
        address: l.address || l.city,
        city: l.city,
        price: Number(l.price),
        pricePerSqm: calculatePricePerSqm({
          price: l.price,
          sqm: l.sqm,
          storedPricePerSqm: l.price_per_sqm,
        }) ?? undefined,
        bedrooms: l.bedrooms ?? undefined,
        bathrooms: l.bathrooms ?? undefined,
        sqm: Number(l.sqm),
        floor: l.floor ?? undefined,
        totalFloors: l.total_floors ?? undefined,
        yearBuilt: l.year_built ?? undefined,
        energyClass: l.energy_class ?? undefined,
        images: imgs,
        type: l.property_type,
        listingType: "open_house" as const,
        openHouseTransactionType: l.open_house_transaction_type === "rent" ? "rent" as const : "sale" as const,
        auctionDate: l.open_house_date
          ? `${fmtDate(l.open_house_date)} · ${fmtTime(l.open_house_date)}`
          : undefined,
        openHouseDateIso: l.open_house_date || undefined,
        aiScore: l.ai_score ?? undefined,
        views: l.views_count ?? undefined,
        tags: l.tags || [],
        latitude: l.latitude ?? undefined,
        longitude: l.longitude ?? undefined,
      },
    };
  });

  const polygonFilterIds = useMemo(() => {
    if (!polygonPoints) return null;
    return new Set(cards
      .filter(({ card }) => (
        card.longitude != null
        && card.latitude != null
        && pointInPolygon(
          [Number(card.longitude), Number(card.latitude)],
          polygonPoints,
        )
      ))
      .map(({ card }) => card.id));
  }, [cards, polygonPoints]);

  const areaFilteredCards = useMemo(() => {
    if (!polygonFilterIds) return cards;
    return cards.filter(({ card }) => polygonFilterIds.has(card.id));
  }, [cards, polygonFilterIds]);

  const isEmpty = listings.length === 0;
  const displayData = isInitialLoadError ? [] : areaFilteredCards;
  const pageTitle = getTranslatedValue(t, "openHouses.page.pageTitle");
  const areaSuffix = polygonFilterIds ? getTranslatedValue(t, "openHouses.page.countAreaSuffix") : "";
  const resultCountText = interpolateTranslation(
    t,
    displayData.length === 1 ? "openHouses.page.countOne" : "openHouses.page.countOther",
    { count: `${displayData.length}${hasMoreListings ? "+" : ""}`, areaSuffix },
  );
  const areaActiveText = interpolateTranslation(
    t,
    displayData.length === 1 ? "openHouses.page.areaActiveOne" : "openHouses.page.areaActiveOther",
    { count: `${displayData.length}${hasMoreListings ? "+" : ""}` },
  );

  // MapListing format for MapView
  const mapListings: MapListing[] = cards
    .filter(({ card }) => card.latitude != null && card.longitude != null)
    .map(({ card, listing }) => ({
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
      _raw: listing,
    }));

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>{pageTitle}</title>
        <meta property="og:title" content={pageTitle} />
      </Helmet>
      <Navbar />
      <main id="main-content" className="pt-16 min-h-screen">
        {/* Hero header */}
        <div className="border-b border-border bg-card/60 py-8">
          <div className="container">
            <div className="flex items-center gap-2 mb-2">
              <DoorOpen className="w-5 h-5 text-primary" />
              <span className="text-xs font-semibold text-primary uppercase tracking-widest">{getTranslatedValue(t, "openHouses.page.eyebrow")}</span>
            </div>
            <div className="flex items-start justify-between gap-4 flex-wrap">
              <div>
                <h1 className="font-display text-2xl sm:text-3xl font-bold">
                  {showPast ? getTranslatedValue(t, "openHouses.page.headingPast") : getTranslatedValue(t, "openHouses.page.headingUpcoming")}
                </h1>
                <p className="text-muted-foreground text-sm mt-1 min-h-5">
                  {isInitialLoadError
                    ? getTranslatedValue(t, "openHouses.page.loadError")
                    : isEmpty
                    ? showPast ? getTranslatedValue(t, "openHouses.page.emptyPast") : getTranslatedValue(t, "openHouses.page.emptyUpcoming")
                    : resultCountText}
                </p>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <div className="flex items-center rounded-lg border border-border overflow-hidden text-sm">
                  <button
                    onClick={() => setShowPast(false)}
                    className={`px-4 py-2 font-medium transition-colors ${!showPast ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}
                  >
                    {getTranslatedValue(t, "openHouses.page.tabs.upcoming")}
                  </button>
                  <button
                    onClick={() => setShowPast(true)}
                    className={`px-4 py-2 font-medium transition-colors ${showPast ? "bg-primary text-primary-foreground" : "bg-card hover:bg-muted text-muted-foreground"}`}
                  >
                    {getTranslatedValue(t, "openHouses.page.tabs.past")}
                  </button>
                </div>
                <Button asChild variant="outline" className="gap-2 shrink-0">
                  <Link to="/dashboard?tab=open-houses">{getTranslatedValue(t, "openHouses.page.myOpenHouses")}</Link>
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
                <LocationAutocompleteInput
                  mode="city"
                  placeholder={getTranslatedValue(t, "openHouses.page.cityPlaceholder")}
                  aria-label={getTranslatedValue(t, "openHouses.page.citySearchAria")}
                  value={cityInput}
                  onChange={setCityInput}
                  onSuggestionSelect={(selection) => {
                    setCityInput(selection.value);
                    setCityFilter(selection.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") setCityFilter(e.currentTarget.value);
                  }}
                  inputClassName="w-full pl-8 pr-3 py-1.5 text-xs rounded-lg border border-border bg-background focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>

              {/* View mode toggle */}
              <div className="flex rounded-lg border border-border overflow-hidden shrink-0" role="group" aria-label={getTranslatedValue(t, "openHouses.page.viewModeAria")}>
                <button
                  onClick={() => setViewMode("grid")}
                  aria-label={getTranslatedValue(t, "openHouses.page.showListAria")}
                  aria-pressed={viewMode === "grid"}
                  className={cn(
                    "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors",
                    viewMode === "grid"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <LayoutGrid className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{getTranslatedValue(t, "openHouses.page.list")}</span>
                </button>
                <button
                  onClick={() => setViewMode("map")}
                  aria-label={getTranslatedValue(t, "openHouses.page.showMapAria")}
                  aria-pressed={viewMode === "map"}
                  className={cn(
                    "px-2.5 py-1.5 text-xs flex items-center gap-1.5 transition-colors border-l border-border",
                    viewMode === "map"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  )}
                >
                  <MapIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span className="hidden sm:inline">{getTranslatedValue(t, "openHouses.page.map")}</span>
                </button>
              </div>

              {/* Filters button */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                aria-label={getTranslatedValue(t, "openHouses.page.filtersAria")}
                aria-expanded={showAdvanced}
                className={cn(
                  "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors shrink-0",
                  showAdvanced
                    ? "bg-primary/10 text-primary border-primary/40"
                    : "bg-secondary text-muted-foreground border-border hover:text-foreground"
                )}
              >
                <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden xs:inline">{getTranslatedValue(t, "openHouses.page.filters")}</span>
                {hasActiveFilters && (
                  <span className="bg-primary text-primary-foreground text-[10px] px-1.5 rounded-full">
                    {[cityFilter, transactionFilter, propertyType, minPrice, maxPrice, minSqm, maxSqm, bedroomsMin !== null ? "1" : "", energyClass, filterYearRange, ...selectedFeatures].filter(Boolean).length}
                  </span>
                )}
                <ChevronDown className={cn("w-3.5 h-3.5 transition-transform", showAdvanced && "rotate-180")} />
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto pb-0.5" aria-label={getTranslatedValue(t, "openHouses.page.transactionType")}>
              {TRANSACTION_TYPES.map((option) => (
                <button
                  key={option.value || "all"}
                  type="button"
                  onClick={() => setTransactionFilter(option.value)}
                  aria-pressed={transactionFilter === option.value}
                  className={cn(
                    "min-h-[34px] rounded-full border px-3 py-1.5 text-xs font-medium whitespace-nowrap transition-colors",
                    transactionFilter === option.value
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border bg-secondary text-muted-foreground hover:border-primary/40 hover:text-foreground"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {/* Advanced filters panel */}
            {showAdvanced && (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 pt-3 border-t border-border">

                {/* Property Type */}
                <div className="space-y-1 sm:col-span-2 lg:col-span-4">
                  <span className="text-xs text-muted-foreground font-medium">{getTranslatedValue(t, "openHouses.page.propertyType")}</span>
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
                  label={getTranslatedValue(t, "openHouses.page.price")}
                  minVal={minPrice}
                  maxVal={maxPrice}
                  onMinChange={setMinPrice}
                  onMaxChange={setMaxPrice}
                  prefix="€"
                  locale={i18n.language}
                />

                {/* Size */}
                <RangeInput
                  label={getTranslatedValue(t, "openHouses.page.size")}
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
                    <BedDouble className="w-3.5 h-3.5" /> {getTranslatedValue(t, "openHouses.page.minBedrooms")}
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
                        {b === null ? getTranslatedValue(t, "openHouses.page.any") : `${b}+`}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Construction year */}
                <div className="space-y-1">
                  <label htmlFor="oh-year-range" className="text-xs text-muted-foreground font-medium">{getTranslatedValue(t, "openHouses.page.constructionYear")}</label>
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
                  <span className="text-xs text-muted-foreground font-medium">{getTranslatedValue(t, "openHouses.page.energyClass")}</span>
                  <div className="flex gap-1 flex-wrap">
                    <button
                      onClick={() => setEnergyClass("")}
                      className={cn(
                        "px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors",
                        !energyClass ? "bg-primary text-primary-foreground border-primary" : "bg-secondary text-muted-foreground border-border"
                      )}
                    >{getTranslatedValue(t, "openHouses.page.any")}</button>
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
                  <span className="text-xs text-muted-foreground font-medium">{getTranslatedValue(t, "openHouses.page.features")}</span>
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
                        {getTranslatedValue(t, `openHouses.page.featureLabels.${f.key}`, f.label)}
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
                      <X className="w-3.5 h-3.5" /> {getTranslatedValue(t, "openHouses.page.clearAllFilters")}
                    </button>
                  </div>
                )}
              </div>
            )}
            {polygonFilterIds && (
              <div className="flex items-center justify-between gap-3 rounded-xl border border-primary/25 bg-primary/8 px-3 py-2 text-xs">
                <span className="font-medium text-primary">
                  {areaActiveText}
                </span>
                <button
                  type="button"
                  onClick={() => setPolygonPoints(null)}
                  className="font-medium text-primary hover:underline"
                >
                  {getTranslatedValue(t, "openHouses.page.clearArea")}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Content ────────────────────────────────────────────────────────── */}
        <div className={viewMode === "map" ? "mobile-map-panel" : "container py-8 pb-mobile-nav-room lg:pb-8"}>
          {isLoading && viewMode !== "map" ? (
            <div className="space-y-4" aria-busy="true" aria-label={getTranslatedValue(t, "openHouses.page.loading")}>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-primary" />
                <span>{getTranslatedValue(t, "openHouses.page.loading")}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 items-stretch">
                {OPEN_HOUSE_LOADING_SKELETON_KEYS.map((key) => (
                  <div key={key} className={OPEN_HOUSE_CARD_LAYOUT_CLASS}>
                    <OpenHouseCardSkeleton />
                  </div>
                ))}
              </div>
            </div>
          ) : isInitialLoadError && (viewMode !== "map" || mapListings.length === 0) ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <AlertCircle className="w-14 h-14 text-destructive mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">{getTranslatedValue(t, "openHouses.page.errorTitle")}</h2>
              <p className="text-sm text-muted-foreground mb-4">{getTranslatedValue(t, "openHouses.page.retryPrompt")}</p>
              <Button variant="outline" onClick={() => refetch()}>{getTranslatedValue(t, "openHouses.page.retryButton")}</Button>
            </div>
          ) : viewMode === "map" ? (
            /* ── Map view ── */
            mapListings.length > 0 || hasNextPage || isFetching ? (
              <div className="relative h-full">
                <Suspense fallback={<div className="h-64 bg-muted animate-pulse rounded-lg" />}>
                  <MapView
                    listings={mapListings}
                    height="100%"
                    itemLabelSingular={getTranslatedValue(t, "openHouses.page.mapLabelSingular")}
                    itemLabelPlural={getTranslatedValue(t, "openHouses.page.mapLabelPlural")}
                    onViewportBoundsChange={handleViewportBoundsChange}
                    polygonPoints={polygonPoints}
                    onPolygonChange={setPolygonPoints}
                    isLoading={isLoading}
                    resultsIncomplete={hasMoreListings}
                  />
                </Suspense>
                {isFetching && !isFetchingNextPage && (
                  <div
                    className="absolute right-3 top-3 z-20 flex items-center gap-2 rounded-md border border-border bg-background/95 px-3 py-1.5 text-xs text-muted-foreground shadow-sm"
                    role="status"
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                    <span>{getTranslatedValue(t, "openHouses.page.loading")}</span>
                  </div>
                )}
                {isMapWindowIncomplete && (
                  <div className="absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-md border border-amber-500/25 bg-background/95 px-3 py-1.5 text-xs font-medium text-amber-800 shadow-sm dark:text-amber-300">
                    {getTranslatedValue(t, "openHouses.page.mapWindowIncomplete")}
                  </div>
                )}
                {(isFetchNextPageError || isInitialLoadError) && (
                  <div className="absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 rounded-md border border-destructive/25 bg-background/95 px-3 py-1.5 text-xs text-destructive shadow-sm">
                    <span>{isFetchNextPageError
                      ? getTranslatedValue(t, "openHouses.page.loadMoreError")
                      : getTranslatedValue(t, "openHouses.page.loadError")}</span>
                    <button
                      type="button"
                      className="font-semibold underline"
                      onClick={() => isFetchNextPageError ? void fetchNextPage() : void refetch()}
                    >
                      {isFetchNextPageError
                        ? getTranslatedValue(t, "openHouses.page.retryLoadMore")
                        : getTranslatedValue(t, "openHouses.page.retryButton")}
                    </button>
                  </div>
                )}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full gap-3 text-center">
                <MapPin className="w-10 h-10 text-muted-foreground" />
                <p className="text-muted-foreground text-sm">{getTranslatedValue(t, "openHouses.page.noMapListings")}</p>
                <Button variant="outline" size="sm" onClick={() => setViewMode("grid")}>
                  {getTranslatedValue(t, "openHouses.page.switchToList")}
                </Button>
              </div>
            )
          ) : displayData.length === 0 && !hasNextPage ? (
            <div className="glass-card rounded-xl p-16 text-center">
              <Calendar className="w-14 h-14 text-muted-foreground mx-auto mb-4" />
              <h2 className="font-display text-lg font-semibold mb-2">{getTranslatedValue(t, "openHouses.page.emptyFilteredTitle")}</h2>
              <p className="text-sm text-muted-foreground mb-4">{getTranslatedValue(t, "openHouses.page.emptyFilteredPrompt")}</p>
              <Button variant="outline" onClick={clearFilters}>{getTranslatedValue(t, "openHouses.page.clearFilters")}</Button>
            </div>
          ) : (
            <>
              {displayData.length > 0 && (
                <VirtualizedListingGrid
                  items={displayData}
                  className="grid grid-cols-1 min-[420px]:grid-cols-2 min-[700px]:grid-cols-3 min-[960px]:grid-cols-4 min-[1180px]:grid-cols-5 min-[1536px]:grid-cols-6 gap-3 sm:gap-4 items-stretch"
                  gap={16}
                  estimateItemHeight={332}
                  data-testid="open-house-grid"
                  renderItem={({ listing, card }, index) => (
                    <OpenHouseCard key={card.id} listing={listing} card={card} imagePriority={index < 6} />
                  )}
                />
              )}
              {isFetchNextPageError && (
                <div className="flex items-center justify-center gap-3 pt-6 text-sm text-destructive" role="status">
                  <span>{getTranslatedValue(t, "openHouses.page.loadMoreError")}</span>
                  <Button variant="outline" onClick={() => void fetchNextPage()}>
                    {getTranslatedValue(t, "openHouses.page.retryLoadMore")}
                  </Button>
                </div>
              )}
              {hasNextPage && !isFetchNextPageError && (
                <div className="flex justify-center pt-6">
                  <Button
                    variant="outline"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage && <Loader2 className="w-4 h-4 animate-spin" />}
                    {getTranslatedValue(t, "listings.loadMore", "Load more")}
                  </Button>
                </div>
              )}
            </>
          )}
        </div>
      </main>
      <Footer />
    </div>
  );
}
