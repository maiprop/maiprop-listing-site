import { useRef, useState, useMemo, lazy, Suspense, useCallback, useEffect } from "react";
import type { ReactNode } from "react";
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
import { GOOGLE_MAPS_API_KEY } from "@/lib/config";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";
import { getTypeLabel, getSubtypeLabel, PROPERTY_TYPE_MAP, type PropertyTypeKey } from "@/lib/propertyTypes";
import { HEATING_TYPES, CONSTRUCTION_STATUSES } from "@/lib/filterConfig";
import { useSmartFilters } from "@/hooks/useSmartFilters";
import {
  buyPriceRanges, rentPriceRanges, listingTypeOptions, sortOptions,
} from "@/lib/listingsConfig";
import { mapListingFromCard } from "@/lib/listingsPerformance";

const GRID_LOADING_SKELETON_KEYS = [
  "grid-loading-1",
  "grid-loading-2",
  "grid-loading-3",
  "grid-loading-4",
];
const SPLIT_LOADING_SKELETON_KEYS = [
  "split-loading-1",
  "split-loading-2",
  "split-loading-3",
  "split-loading-4",
];
const SEARCHING_SKELETON_KEYS = [
  "searching-loading-1",
  "searching-loading-2",
  "searching-loading-3",
  "searching-loading-4",
];
const MORE_LOADING_SKELETON_KEYS = [
  "more-loading-1",
  "more-loading-2",
  "more-loading-3",
  "more-loading-4",
];
const GRID_ESTIMATED_ROW_HEIGHT = 520;
const ACTIVE_FILTER_CHIP_CLASS = "flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary hover:bg-primary/20 transition-colors shrink-0";
const ACCENT_FILTER_CHIP_CLASS = "flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent hover:bg-accent/20 transition-colors shrink-0";

type ListingsFilterSetParam = ReturnType<typeof useListingsFilters>["setParam"];
type ListingsFilterToggleMulti = ReturnType<typeof useListingsFilters>["toggleMulti"];
type SmartFilterFeature = { key: string; label: string };
type ListingsGooglePlace = {
  address_components?: Array<{ types: string[]; long_name: string }>;
  formatted_address?: string;
};
type ListingsGoogleWindow = typeof window & {
  google?: {
    maps?: {
      places?: {
        Autocomplete: new (el: HTMLInputElement, opts: object) => {
          addListener(eventName: string, handler: () => void): void;
          getPlace(): ListingsGooglePlace;
        };
      };
    };
  };
};

const ActiveFilterChip = ({
  children,
  onClick,
  accent = false,
}: {
  children: ReactNode;
  onClick: () => void;
  accent?: boolean;
}) => (
  <button onClick={onClick} className={accent ? ACCENT_FILTER_CHIP_CLASS : ACTIVE_FILTER_CHIP_CLASS}>
    {children} <X className="w-3 h-3" />
  </button>
);

const getPriceRangeLabel = (selectedPrice: string) =>
  [...buyPriceRanges, ...rentPriceRanges].find((range) => range.value === selectedPrice)?.label || selectedPrice;

const getFeatureFilterLabel = (features: SmartFilterFeature[], key: string) =>
  features.find((option) => option.key === key)?.label.replace(/^[^\s]+ /, "") || key;

const PROPERTY_TYPE_LABELS_EL: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house: "Μονοκατοικία",
  villa: "Βίλα",
  land: "Οικόπεδο / Αγροτεμάχιο",
  commercial: "Επαγγελματικό ακίνητο",
  office: "Γραφείο",
  studio: "Γκαρσονιέρα",
  maisonette: "Μεζονέτα",
  warehouse: "Αποθήκη",
  hotel: "Ξενοδοχείο",
  mixed_use: "Κτίριο μεικτής χρήσης",
  parking: "Θέση στάθμευσης",
  storage: "Αποθηκευτικός χώρος",
};

const SUBTYPE_LABELS_EL: Record<string, string> = {
  studio: "Γκαρσονιέρα",
  "1bedroom": "1 υπνοδωμάτιο",
  "2bedroom": "2 υπνοδωμάτια",
  "3bedroom": "3 υπνοδωμάτια",
  "4bedroom": "4+ υπνοδωμάτια",
  ground_floor: "Ισόγειο",
  basement: "Υπόγειο",
  detached: "Μονοκατοικία",
  semi_detached: "Ημιανεξάρτητη κατοικία",
  terraced: "Μεζονέτα σε σειρά",
  townhouse: "Αστική κατοικία",
  bungalow: "Ισόγεια κατοικία",
  buildable: "Οικοδομήσιμο οικόπεδο",
  agricultural: "Αγροτεμάχιο",
  coastal: "Παραθαλάσσιο",
  forest: "Δασική έκταση",
  industrial: "Βιομηχανική ζώνη",
  tourism: "Τουριστική ζώνη",
  shop: "Κατάστημα",
  warehouse: "Αποθήκη",
  craft_workshop: "Βιοτεχνικός χώρος",
  hotel: "Ξενοδοχείο",
  commercial_building: "Κτίριο επαγγελματικών χώρων",
  hall: "Αίθουσα",
  showroom: "Εκθεσιακός χώρος",
  restaurant: "Εστιατόριο / καφέ",
  clinic: "Ιατρείο",
  mixed_use: "Κτίριο μεικτής χρήσης",
  office_private: "Ιδιωτικό γραφείο",
  office_open_plan: "Γραφείο ανοικτού χώρου",
  office_coworking: "Coworking / ευέλικτος χώρος",
  office_business: "Business centre",
  office_floor: "Ολόκληρος όροφος",
  other_commercial: "Λοιπός επαγγελματικός χώρος",
  private_office: "Ιδιωτικό γραφείο",
  open_plan: "Γραφείο ανοικτού χώρου",
  coworking: "Coworking / ευέλικτος χώρος",
  business_centre: "Business centre",
  floor: "Ολόκληρος όροφος",
  converted: "Μετατρεπόμενος χώρος",
};

const HEATING_LABELS_EL: Record<string, string> = {
  autonomous_oil: "Αυτόνομη θέρμανση (πετρέλαιο)",
  autonomous_gas: "Αυτόνομη θέρμανση (φυσικό αέριο)",
  autonomous: "Αυτόνομη θέρμανση",
  central_oil: "Κεντρική θέρμανση (πετρέλαιο)",
  central_gas: "Κεντρική θέρμανση (φυσικό αέριο)",
  central: "Κεντρική θέρμανση",
  floor: "Ενδοδαπέδια θέρμανση",
  none: "Χωρίς θέρμανση",
  other: "Άλλη θέρμανση",
};

const CONDITION_LABELS_EL: Record<string, string> = {
  new: "Νεόδμητο",
  under_construction: "Υπό κατασκευή",
  renovated: "Ανακαινισμένο",
  needs_renovation: "Χρήζει ανακαίνισης",
  unfinished: "Ημιτελές",
  preserved: "Διατηρητέο",
  neoclassical: "Νεοκλασικό",
};

const translatePropertyType = (type: string, isGreek: boolean) =>
  isGreek ? (PROPERTY_TYPE_LABELS_EL[type] ?? getTypeLabel(type)) : getTypeLabel(type);

const translateSubtype = (type: string, subtype: string, isGreek: boolean) =>
  isGreek ? (SUBTYPE_LABELS_EL[subtype] ?? getSubtypeLabel(type, subtype)) : getSubtypeLabel(type, subtype);

const translateHeating = (value: string, isGreek: boolean) => {
  const english = HEATING_TYPES.find((heating) => heating.value === value)?.label ?? value;
  return isGreek ? (HEATING_LABELS_EL[value] ?? english) : english;
};

const translateCondition = (value: string, isGreek: boolean) => {
  const english = CONSTRUCTION_STATUSES.find((status) => status.value === value)?.label ?? value;
  return isGreek ? (CONDITION_LABELS_EL[value] ?? english) : english;
};

const DesktopActiveFilterChips = ({ // skipcq: JS-R1005 - Active chips map independent URL filters into removable controls.
  selectedType,
  selectedSubtype,
  selectedPrice,
  bedsRange,
  selectedEnergyClasses,
  selectedFeatures,
  selectedHeating,
  selectedConstruction,
  offMarketOnly,
  preSaleOnly,
  hasVideoViewing,
  hasVirtualTour,
  hasMessaging,
  minAiScore,
  minWalkability,
  smartFeatures,
  setParam,
  toggleMulti,
  clearAllFilters,
  isGreek,
}: {
  selectedType: string;
  selectedSubtype: string;
  selectedPrice: string;
  bedsRange: string[];
  selectedEnergyClasses: string[];
  selectedFeatures: string[];
  selectedHeating: string;
  selectedConstruction: string;
  offMarketOnly: boolean;
  preSaleOnly: boolean;
  hasVideoViewing: boolean;
  hasVirtualTour: boolean;
  hasMessaging: boolean;
  minAiScore: number;
  minWalkability: number;
  smartFeatures: SmartFilterFeature[];
  setParam: ListingsFilterSetParam;
  toggleMulti: ListingsFilterToggleMulti;
  clearAllFilters: () => void;
  isGreek: boolean;
}) => (
  <div className="hidden sm:flex items-center gap-1.5 mt-3 min-h-9 flex-wrap overflow-visible rounded-xl border border-border bg-card/70 px-3 py-2 shadow-sm [&>button]:inline-flex [&>button]:h-7 [&>button]:items-center [&>button]:leading-none [&>button]:max-w-full [&>button]:min-w-0 [&>button]:whitespace-nowrap">
    <span className="flex h-7 items-center text-xs font-medium text-muted-foreground shrink-0">{isGreek ? "Ενεργά φίλτρα:" : "Active filters:"}</span>
    {selectedType && (
      <ActiveFilterChip onClick={() => { setParam("type", ""); setParam("subtype", ""); }}>
        {PROPERTY_TYPE_MAP[selectedType as PropertyTypeKey]?.emoji} {translatePropertyType(selectedType, isGreek)}
      </ActiveFilterChip>
    )}
    {selectedSubtype && selectedType && (
      <ActiveFilterChip onClick={() => setParam("subtype", "")}>{translateSubtype(selectedType, selectedSubtype, isGreek)}</ActiveFilterChip>
    )}
    {selectedPrice && (
      <ActiveFilterChip onClick={() => setParam("price", "")}>{getPriceRangeLabel(selectedPrice)}</ActiveFilterChip>
    )}
    {bedsRange[0] && <ActiveFilterChip onClick={() => setParam("beds_min", "")}>{bedsRange[0]}+ {isGreek ? "υπνοδωμάτια" : "beds"}</ActiveFilterChip>}
    {selectedEnergyClasses.map((energyClass) => (
      <ActiveFilterChip key={energyClass} onClick={() => toggleMulti("energy", energyClass)}>{isGreek ? "Ενεργειακή κλάση" : "Energy"} {energyClass}</ActiveFilterChip>
    ))}
    {selectedFeatures.map((feature) => (
      <ActiveFilterChip key={feature} onClick={() => toggleMulti("features", feature)}>
        {getFeatureFilterLabel(smartFeatures, feature)}
      </ActiveFilterChip>
    ))}
    {selectedHeating && (
      <ActiveFilterChip onClick={() => setParam("heating", "")}>
        {isGreek ? "Θέρμανση:" : "Heating:"} {translateHeating(selectedHeating, isGreek)}
      </ActiveFilterChip>
    )}
    {selectedConstruction && (
      <ActiveFilterChip onClick={() => setParam("construction", "")}>
        {translateCondition(selectedConstruction, isGreek)}
      </ActiveFilterChip>
    )}
    {offMarketOnly && <ActiveFilterChip onClick={() => setParam("off_market", "")}>{isGreek ? "Εκτός αγοράς" : "Off-market"}</ActiveFilterChip>}
    {preSaleOnly && <ActiveFilterChip onClick={() => setParam("pre_sale", "")}>{isGreek ? "Προπώληση" : "Pre-sale"}</ActiveFilterChip>}
    {hasVideoViewing && <ActiveFilterChip accent onClick={() => setParam("video_viewing", "")}>{isGreek ? "Βιντεοκλήση" : "Video Viewing"}</ActiveFilterChip>}
    {hasVirtualTour && <ActiveFilterChip accent onClick={() => setParam("virtual_tour", "")}>{isGreek ? "Εικονική περιήγηση" : "Virtual Tour"}</ActiveFilterChip>}
    {hasMessaging && <ActiveFilterChip accent onClick={() => setParam("messaging", "")}>{isGreek ? "Μηνύματα" : "Messaging"}</ActiveFilterChip>}
    {minAiScore > 0 && <ActiveFilterChip accent onClick={() => setParam("min_ai_score", "")}>{isGreek ? "AI βαθμός" : "AI score"} {minAiScore}+</ActiveFilterChip>}
    {minWalkability > 0 && <ActiveFilterChip accent onClick={() => setParam("min_walkability", "")}>{isGreek ? "Περπατησιμότητα" : "Walk"} {minWalkability}+</ActiveFilterChip>}
    <button onClick={clearAllFilters} className="text-xs text-muted-foreground hover:text-foreground ml-1 shrink-0">{isGreek ? "Καθαρισμός όλων" : "Clear all"}</button>
  </div>
);

const getListingsResultLabel = ({ // skipcq: JS-R1005 - Result labels intentionally branch by map, area, viewport, and pagination states.
  viewMode,
  polygonFilterIds,
  viewportIds,
  filtered,
  mapListings,
  hasNextPage,
  isGreek,
}: {
  viewMode: "grid" | "split" | "map";
  polygonFilterIds: Set<string> | null;
  viewportIds: Set<string> | null;
  filtered: ListingCardWithRaw[];
  mapListings: Array<{ id: string }>;
  hasNextPage: boolean;
  isGreek: boolean;
}) => {
  if (viewMode === "split" && polygonFilterIds !== null) {
    const count = filtered.filter((property) => polygonFilterIds.has(property.id)).length;
    return isGreek ? `${count} στην περιοχή` : `${count} in area`;
  }
  if (viewMode === "map" && polygonFilterIds !== null) {
    const count = filtered.filter((property) => polygonFilterIds.has(property.id)).length;
    return isGreek ? `${count} στην περιοχή` : `${count} in area`;
  }
  if (viewMode === "split" && viewportIds !== null) {
    const count = filtered.filter((property) => viewportIds.has(property.id)).length;
    return isGreek ? `${count} στον χάρτη` : `${count} in view`;
  }
  if (viewMode === "map") {
    return isGreek ? `${mapListings.length} αποτελέσματα χάρτη` : `${mapListings.length} map result${mapListings.length !== 1 ? "s" : ""}`;
  }
  if (hasNextPage) {
    return isGreek ? `${filtered.length} φορτωμένα ακίνητα` : `${filtered.length} loaded propert${filtered.length === 1 ? "y" : "ies"}`;
  }
  return isGreek ? `${filtered.length} ακίνητα` : `${filtered.length} properties`;
};

const ListingsResultSummary = (props: Parameters<typeof getListingsResultLabel>[0]) => (
  <span className="font-display font-semibold" aria-live="polite" aria-atomic="true">
    {getListingsResultLabel(props)}
  </span>
);

const getSearchValueFromGooglePlace = (place: ListingsGooglePlace) => {
  const components = place.address_components ?? [];
  const get = (type: string) => components.find((item) => item.types.includes(type))?.long_name ?? "";
  const city =
    get("locality") ||
    get("postal_town") ||
    get("administrative_area_level_3") ||
    get("administrative_area_level_2") ||
    get("administrative_area_level_1");
  const street = [get("street_number"), get("route")].filter(Boolean).join(" ");
  return city || street || place.formatted_address || "";
};

// skipcq: JS-0067 - React route component is intentionally module-scoped for React Router.
export default function Listings() { // skipcq: JS-R1005, JS-W1044 - Listings coordinates filters, map state, comparison, and virtualization in one route shell.
  const { t, i18n } = useTranslation();
  const isGreek = i18n.language?.toLowerCase().startsWith("el") ?? false;
  const metaTitle = isGreek
    ? "Ακίνητα για Πώληση & Ενοικίαση στην Ελλάδα — mAI prop"
    : "Properties for Sale & Rent in Greece — mAI prop";
  const metaDescription = isGreek
    ? "Αναζητήστε ακίνητα για πώληση και ενοικίαση σε όλη την Ελλάδα. Φιλτράρετε ανά πόλη, τύπο, τιμή και άλλα κριτήρια."
    : "Search thousands of properties for sale and rent across Greece. Filter by city, type, price and more.";
  const metaName = isGreek ? "Ακίνητα για Πώληση & Ενοικίαση στην Ελλάδα" : "Properties for Sale & Rent in Greece";

  const [viewMode, setViewMode] = useState<"grid" | "split" | "map">("grid");
  const [showFilters, setShowFilters] = useState(false);
  const [showSaveModal, setShowSaveModal] = useState(false);
  const [compareList, setCompareList] = useState<ListingCardWithRaw[]>([]);
  const [viewportIds, setViewportIds] = useState<Set<string> | null>(null);
  const [polygonFilterIds, setPolygonFilterIds] = useState<Set<string> | null>(null);
  const [mobileTab, setMobileTab] = useState<"list" | "map">("list");
  const splitListRef = useRef<HTMLDivElement | null>(null);
  const mobileSearchInputRef = useRef<HTMLInputElement | null>(null);
  const desktopSearchInputRef = useRef<HTMLInputElement | null>(null);
  const initializedSearchInputs = useRef<WeakSet<HTMLInputElement>>(new WeakSet());
  const [googlePlacesRequested, setGooglePlacesRequested] = useState(false);
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

  const initGoogleSearchAutocomplete = useCallback((input: HTMLInputElement | null) => {
    const Autocomplete = (window as ListingsGoogleWindow).google?.maps?.places?.Autocomplete;
    if (!input || !Autocomplete || initializedSearchInputs.current.has(input)) return;

    const autocomplete = new Autocomplete(input, {
      types: ["geocode"],
      componentRestrictions: { country: "gr" },
      fields: ["address_components", "formatted_address"],
    });
    autocomplete.addListener("place_changed", () => {
      const value = getSearchValueFromGooglePlace(autocomplete.getPlace()).trim();
      if (value) setParam("city", value);
    });
    initializedSearchInputs.current.add(input);
  }, [setParam]);

  useEffect(() => {
    if (!googlePlacesRequested || !GOOGLE_MAPS_API_KEY) return;
    let cancelled = false;

    loadGoogleMapsPlaces()
      .then(() => {
        if (cancelled) return;
        initGoogleSearchAutocomplete(mobileSearchInputRef.current);
        initGoogleSearchAutocomplete(desktopSearchInputRef.current);
      })
      .catch(() => {
        // Plain typed city/area/address filtering remains available.
      });

    return () => { cancelled = true; };
  }, [googlePlacesRequested, initGoogleSearchAutocomplete]);

  // AI-powered smart filters — fetch once per type/subtype combo, cached in memory
  const { config: aiFilterConfig } = useSmartFilters(
    selectedType, selectedSubtype, selectedListingType
  );

  // Parse selectedPrice range string "100000-500000" → min/max numbers
  const [priceMin, priceMax] = selectedPrice
    ? selectedPrice.split("-").map(Number)
    : [undefined, undefined];

  const filters = useMemo<ListingsFilters>(() => ({ // skipcq: JS-R1005 - Listings route maps many independent URL filters into one query payload.
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
  const desktopActiveFilters = activeFilterCount > 0 ? (
    <DesktopActiveFilterChips
      selectedType={selectedType}
      selectedSubtype={selectedSubtype}
      selectedPrice={selectedPrice}
      bedsRange={bedsRange}
      selectedEnergyClasses={selectedEnergyClasses}
      selectedFeatures={selectedFeatures}
      selectedHeating={selectedHeating}
      selectedConstruction={selectedConstruction}
      offMarketOnly={offMarketOnly}
      preSaleOnly={preSaleOnly}
      hasVideoViewing={hasVideoViewing}
      hasVirtualTour={hasVirtualTour}
      hasMessaging={hasMessaging}
      minAiScore={minAiScore}
      minWalkability={minWalkability}
      smartFeatures={aiFilterConfig.features}
      setParam={setParam}
      toggleMulti={toggleMulti}
      clearAllFilters={clearAllFilters}
      isGreek={isGreek}
    />
  ) : null;
  const resultSummary = isLoading ? (
    <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" aria-label={isGreek ? "Φόρτωση αγγελιών" : "Loading listings"} />
  ) : (
    <ListingsResultSummary
      viewMode={viewMode}
      polygonFilterIds={polygonFilterIds}
      viewportIds={viewportIds}
      filtered={filtered}
      mapListings={mapListings}
      hasNextPage={hasNextPage}
      isGreek={isGreek}
    />
  );
  const statsStatus = (
    <div className="flex items-center gap-3">
      {resultSummary}
      {totalLoaded === 0 && !isLoading && (
        <span className="text-muted-foreground text-sm">{isGreek ? "Δεν βρέθηκαν αγγελίες με αυτά τα φίλτρα" : "No listings matched your filters"}</span>
      )}
      {(viewMode === "split" || viewMode === "map") && polygonFilterIds !== null && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          {isGreek ? "Φίλτρο περιοχής" : "Area filter"}
        </span>
      )}
      {viewMode === "split" && viewportIds !== null && polygonFilterIds === null && (
        <span className="text-xs px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
          {isGreek ? "Συγχρονισμός χάρτη" : "Map synced"}
        </span>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background pb-bottom-nav lg:pb-0">
      <Helmet>
        <title>{metaTitle}</title>
        <meta name="description" content={metaDescription} />
        <link rel="canonical" href="https://maiprop.co/listings" />
        <meta property="og:title" content={metaTitle} />
        <meta property="og:description" content={metaDescription} />
        <meta property="og:url" content="https://maiprop.co/listings" />
        <script type="application/ld+json">{JSON.stringify({
          "@context": "https://schema.org",
          "@type": "SearchResultsPage",
          "name": metaName,
          "description": metaDescription,
          "url": "https://maiprop.co/listings",
          "provider": { "@type": "Organization", "name": "mAI prop", "url": "https://maiprop.co" },
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
                    ref={mobileSearchInputRef}
                    type="text"
                    placeholder={isGreek ? "Πόλη…" : "City…"}
                    aria-label={isGreek ? "Αναζήτηση ανά πόλη" : "Search by city"}
                    value={searchQuery}
                    onChange={e => setParam("city", e.target.value)}
                    onFocus={() => setGooglePlacesRequested(true)}
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
                    aria-label={isGreek ? "Προβολή πλέγματος" : "Grid view"}
                    aria-pressed={viewMode === "grid"}
                    className={`p-2 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    <LayoutGrid className="w-4 h-4" aria-hidden="true" />
                  </button>
                  <button
                    onClick={() => setViewMode("map")}
                    aria-label={isGreek ? "Προβολή χάρτη" : "Map view"}
                    aria-pressed={viewMode === "map" || viewMode === "split"}
                    className={`p-2 transition-colors ${viewMode === "map" || viewMode === "split" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground"}`}>
                    <Map className="w-4 h-4" aria-hidden="true" />
                  </button>
                </div>
                {/* Filters button */}
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  aria-label={activeFilterCount > 0 ? (isGreek ? `Φίλτρα (${activeFilterCount} ενεργά)` : `Filters (${activeFilterCount} active)`) : (isGreek ? "Φίλτρα" : "Filters")}
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
                    <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isGreek ? "Εμβαδόν (τ.μ.)" : "Size (m²)"}</span>
                    <div className="flex gap-2">
                      <input type="number" placeholder={isGreek ? "Ελάχ. τ.μ." : "Min m²"} value={minSqm}
                        onChange={e => setParam("sqm_min", e.target.value)}
                        className="flex-1 px-3 py-2 text-sm rounded-lg border border-border bg-secondary text-foreground outline-none focus:border-primary" />
                      <input type="number" placeholder={isGreek ? "Μέγ. τ.μ." : "Max m²"} value={maxSqm}
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
                      <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{isGreek ? "Κατάσταση" : "Status"}</span>
                      <div className="flex gap-3 flex-wrap">
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={offMarketOnly}
                            onChange={e => setParam("off_market", e.target.checked ? "1" : "")}
                            className="rounded border-border accent-primary" />
                          <span className="text-sm">🔒 {isGreek ? "Εκτός αγοράς" : "Off-market"}</span>
                        </label>
                        <label className="flex items-center gap-2 cursor-pointer">
                          <input type="checkbox" checked={preSaleOnly}
                            onChange={e => setParam("pre_sale", e.target.checked ? "1" : "")}
                            className="rounded border-border accent-primary" />
                          <span className="text-sm">🏗️ {isGreek ? "Προπώληση" : "Pre-sale"}</span>
                        </label>
                      </div>
                    </div>
                  )}
                  {activeFilterCount > 0 && (
                    <button onClick={clearAllFilters}
                      className="w-full py-2 text-xs text-muted-foreground border border-border rounded-lg hover:text-foreground hover:border-primary/30 transition-colors">
                      {isGreek ? "Καθαρισμός όλων των φίλτρων" : "Clear all filters"}
                    </button>
                  )}
                </div>
              )}

              {/* Active filter chips — shown when panel is closed */}
              {activeFilterCount > 0 && !showFilters && (
                <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-none pb-0.5">
                   {selectedType && <button onClick={() => { setParam("type", ""); setParam("subtype", ""); }} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{translatePropertyType(selectedType, isGreek)} <X className="w-3 h-3" /></button>}
                   {selectedPrice && <button onClick={() => setParam("price", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{[...buyPriceRanges, ...rentPriceRanges].find(r => r.value === selectedPrice)?.label || selectedPrice} <X className="w-3 h-3" /></button>}
                   {bedsRange[0] && <button onClick={() => setParam("beds_min", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{bedsRange[0]}+ {isGreek ? "υπνοδωμάτια" : "beds"} <X className="w-3 h-3" /></button>}
                   {(minSqm || maxSqm) && <button onClick={() => { setParam("sqm_min", ""); setParam("sqm_max", ""); }} className="flex items-center gap-1 px-2 py-1 rounded-full bg-primary/10 border border-primary/20 text-xs text-primary shrink-0">{isGreek ? "Εμβαδόν" : "Size"} <X className="w-3 h-3" /></button>}
                   {hasVideoViewing && <button onClick={() => setParam("video_viewing", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🎥 {isGreek ? "Βίντεο" : "Video"} <X className="w-3 h-3" /></button>}
                   {hasVirtualTour && <button onClick={() => setParam("virtual_tour", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🔮 {isGreek ? "Εικονική περιήγηση" : "Virtual"} <X className="w-3 h-3" /></button>}
                   {hasMessaging && <button onClick={() => setParam("messaging", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">💬 {isGreek ? "Μηνύματα" : "Messaging"} <X className="w-3 h-3" /></button>}
                   {minAiScore > 0 && <button onClick={() => setParam("min_ai_score", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🤖 AI {minAiScore}+ <X className="w-3 h-3" /></button>}
                   {minWalkability > 0 && <button onClick={() => setParam("min_walkability", "")} className="flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 border border-accent/20 text-xs text-accent shrink-0">🚶 {isGreek ? "Περπάτημα" : "Walk"} {minWalkability}+ <X className="w-3 h-3" /></button>}
                   <button onClick={clearAllFilters} className="text-xs text-muted-foreground shrink-0 ml-1">{isGreek ? "Καθαρισμός όλων" : "Clear all"}</button>
                </div>
              )}
            </div>

            {/* ── DESKTOP FILTER BAR ── */}
            <div className="hidden sm:flex gap-2 items-center content-start overflow-x-auto scrollbar-none sm:flex-wrap">
              {/* Search */}
              <div className="shrink-0 flex-1 min-w-[200px] flex items-center gap-2 bg-secondary rounded-xl px-4 py-2.5 border border-border focus-within:border-primary transition-colors">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input
                  ref={desktopSearchInputRef}
                  type="text"
                  placeholder={isGreek ? "Πόλη, περιοχή, διεύθυνση..." : "City, area, address..."}
                  aria-label={isGreek ? "Αναζήτηση ανά πόλη ή περιοχή" : "Search by city or area"}
                  value={searchQuery}
                  onChange={e => setParam("city", e.target.value)}
                  onFocus={() => setGooglePlacesRequested(true)}
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
                  aria-label={isGreek ? "Εύρος τιμής" : "Price range"}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {(selectedListingType === "rent" ? rentPriceRanges : buyPriceRanges).map(o => (
                    <option key={o.value} value={o.value} className="bg-card">{o.label}</option>
                  ))}
                </select>
                <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <div className="relative">
                <select value={selectedSort} onChange={e => setParam("sort", e.target.value)}
                  aria-label={isGreek ? "Ταξινόμηση" : "Sort by"}
                  className="appearance-none bg-secondary border border-border rounded-xl px-3 py-2.5 pr-7 text-sm text-foreground cursor-pointer outline-none focus:border-primary">
                  {sortOptions.map(o => <option key={o.value} value={o.value} className="bg-card">{t(o.labelKey)}</option>)}
                </select>
                <ArrowUpDown className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
              </div>
              <Button variant="outline"
                className={`border-border gap-2 shrink-0 ${showFilters ? "bg-primary/10 border-primary/30 text-primary" : ""}`}
                onClick={() => setShowFilters(!showFilters)}>
                <SlidersHorizontal className="w-4 h-4" />
                {isGreek ? "Περισσότερα φίλτρα" : "More Filters"}
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
              <div className="basis-full flex">
                <div className="flex rounded-xl border border-border overflow-hidden shrink-0">
                  <button onClick={() => setViewMode("grid")} aria-label={isGreek ? "Προβολή πλέγματος" : "Grid view"} aria-pressed={viewMode === "grid"}
                    className={`p-2.5 transition-colors ${viewMode === "grid" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode("split")} aria-label={isGreek ? "Διπλή προβολή" : "Split view"} aria-pressed={viewMode === "split"}
                    className={`p-2.5 transition-colors ${viewMode === "split" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                    <Columns2 className="w-4 h-4" />
                  </button>
                  <button onClick={() => setViewMode("map")} aria-label={isGreek ? "Προβολή χάρτη" : "Map view"} aria-pressed={viewMode === "map"}
                    className={`p-2.5 transition-colors ${viewMode === "map" ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground hover:text-foreground"}`}>
                    <Map className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Desktop active filter chips */}
            {desktopActiveFilters}
          </div>
        </div>

        {/* Advanced Filters Panel — AI-powered */}
        {showFilters && (
          <ListingsAdvancedFilters filteredCount={filtered.length} onClose={() => setShowFilters(false)} />
        )}

        {/* Results */}
        <div className={`${viewMode === "split" ? "" : "container min-h-[calc(100vh-8rem)]"} py-4 sm:py-8 pb-28 lg:pb-8`}>
          {/* Stats bar */}
          <div className={`flex items-center justify-between mb-6 flex-wrap gap-3 ${viewMode === "split" ? "container" : ""}`}>
            {statsStatus}
            <div className="flex items-center gap-3">
              {compareList.length > 0 && (
                <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-accent/10 border border-accent/20 text-xs text-accent font-medium">
                  <GitCompare className="w-3.5 h-3.5" />
                  {isGreek ? `${compareList.length} επιλεγμένα για σύγκριση` : `${compareList.length} selected to compare`}
                </div>
              )}
              <Button size="sm" className="bg-gradient-primary border-0 text-primary-foreground gap-1.5" asChild>
                <Link to="/listings/new"><Building2 className="w-3.5 h-3.5" /> {isGreek ? "Καταχώρηση αγγελίας" : "Post Listing"}</Link>
              </Button>
            </div>
          </div>

          {/* ── Split view ── */}
          {viewMode === "split" ? (() => { // skipcq: JS-R1005, JS-W1044 - Split view derives viewport and polygon lists in one render branch.
            const splitDisplayList = polygonFilterIds !== null
              ? filtered.filter(p => polygonFilterIds.has(p.id))
              : viewportIds !== null
              ? filtered.filter(p => viewportIds.has(p.id))
              : filtered;
            const gridCards = splitDisplayList.length === 0 ? (
              <div className="glass-card rounded-xl p-10 text-center mt-4">
                <MapPin className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
                <p className="font-semibold text-sm">{isGreek ? "Δεν υπάρχουν ακίνητα εδώ" : "No properties here"}</p>
                <p className="text-xs text-muted-foreground mt-1">{isGreek ? "Μετακινήστε τον χάρτη ή καθαρίστε το φίλτρο περιοχής" : "Pan the map or clear any area filter"}</p>
              </div>
            ) : (
              <VirtualizedListingGrid
                items={splitDisplayList}
                columns={1}
                scrollParentRef={splitListRef}
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
                    {isGreek ? "Λίστα" : "List"} ({splitDisplayList.length})
                  </button>
                  <button
                    onClick={() => setMobileTab("map")}
                    className={`flex-1 py-2.5 text-sm font-medium transition-colors ${mobileTab === "map" ? "border-b-2 border-primary text-primary" : "text-muted-foreground"}`}
                  >
                    {isGreek ? "Χάρτης" : "Map"}
                  </button>
                </div>

                {/* Left: scrollable grid — hidden on mobile when map tab active */}
                <div className={`md:w-[420px] shrink-0 overflow-y-auto px-4 space-y-3 pb-8 border-r border-border
                  ${mobileTab === "map" ? "hidden md:block" : "block"}
                  md:h-full h-[60vh]`}
                  ref={splitListRef}
                >
                  {isLoading
                    ? <div className="space-y-3">{SPLIT_LOADING_SKELETON_KEYS.map((key) => <PropertyCardSkeleton key={key} />)}</div>
                    : isError
                    ? <EmptyState icon={Building2} title={isGreek ? "Δεν φορτώθηκαν οι αγγελίες" : "Failed to load listings"} subtitle={isGreek ? "Δοκιμάστε ξανά" : "Please try again"} action={{ label: isGreek ? "Επανάληψη" : "Retry", onClick: () => window.location.reload() }} />
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
                {GRID_LOADING_SKELETON_KEYS.map((key) => <PropertyCardSkeleton key={key} />)}
              </div>
            ) : isError ? (
              <EmptyState
                icon={Building2}
                title={isGreek ? "Δεν ήταν δυνατή η φόρτωση αγγελιών" : "Could not load listings"}
                subtitle={isGreek ? "Δοκιμάστε ξανά αργότερα" : "Please try again later"}
                action={{ label: isGreek ? "Επανάληψη" : "Retry", onClick: () => window.location.reload() }}
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
                    estimateItemHeight={GRID_ESTIMATED_ROW_HEIGHT}
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
                    {SEARCHING_SKELETON_KEYS.map((key) => <PropertyCardSkeleton key={key} />)}
                  </div>
                )}
                {isFetchingNextPage && filtered.length > 0 && (
                  <div className="grid grid-cols-1 min-[420px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4 mt-3 sm:mt-4">
                    {MORE_LOADING_SKELETON_KEYS.map((key) => <PropertyCardSkeleton key={key} />)}
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
            {isGreek ? "Λίστα" : "Show List"}
          </button>
        ) : (
          <button
            onClick={() => setViewMode("map")}
            className="flex items-center gap-2 pl-4 pr-5 py-3 rounded-full shadow-elevated bg-foreground text-background text-sm font-semibold transition-all active:scale-95"
            style={{ boxShadow: "0 4px 24px 0 hsl(var(--foreground) / 0.18)" }}
          >
            <Map className="w-4 h-4" />
            {isGreek ? "Χάρτης" : "Show Map"}
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
