import React from "react";
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";

const {
  accept,
  authState,
  clearAllFilters,
  fetchNextPage,
  filterState,
  locale,
  pipelineCalls,
  pipelineState,
  setParams,
} = vi.hoisted(() => {
  const setParam = vi.fn();
  const setParams = vi.fn();
  const clearAllFilters = vi.fn();
  const fetchNextPage = vi.fn();
  const filterState = {
    searchQuery: "",
    selectedListingType: "sale",
    selectedType: "",
    selectedSubtype: "",
    selectedPrice: "",
    selectedSort: "relevant",
    bedsRange: ["", ""] as [string, string],
    bathsRange: ["", ""] as [string, string],
    floorRange: ["", ""] as [string, string],
    yearRange: ["", ""] as [string, string],
    minSqm: "",
    maxSqm: "",
    selectedEnergyClasses: [] as string[],
    selectedFeatures: [] as string[],
    selectedHeating: "",
    selectedConstruction: "",
    preSaleOnly: false,
    hasVideoViewing: false,
    hasVirtualTour: false,
    hasMessaging: false,
    minAiScore: 0,
    minWalkability: 0,
    activeFilterCount: 0,
    currentFilters: {},
    setParam,
    setParams,
    toggleMulti: vi.fn(),
    clearAllFilters,
    fetchNextPage,
    applyAIFilters: vi.fn(),
    getParam: vi.fn((_key: string, fallback = "") => fallback),
  };
  return {
    accept: vi.fn(),
    authState: { user: null as null | { id: string } },
    clearAllFilters,
    fetchNextPage,
    filterState,
    locale: { value: "en" },
    pipelineCalls: [] as unknown[],
    pipelineState: {
      filtered: [] as ListingCardWithRaw[],
      totalLoaded: 0,
      isLoading: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage,
      sentinelRef: { current: null },
    },
    setParam,
    setParams,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
    i18n: { language: locale.value },
  }),
}));

vi.mock("@/lib/config", () => ({ APP_ORIGIN: "https://portal.maiprop.co" }));
vi.mock("@/hooks/useListingsFilters", () => ({ useListingsFilters: () => filterState }));
vi.mock("@/hooks/useListingsPipeline", () => ({
  useListingsPipeline: (args: unknown) => {
    pipelineCalls.push(args);
    return pipelineState;
  },
}));
vi.mock("@/hooks/useTrackUserSearch", () => ({ useTrackUserSearch: () => vi.fn() }));
vi.mock("@/hooks/useSmartFilters", () => ({
  useSmartFilters: () => ({ config: { features: [] }, loading: false }),
}));
vi.mock("@/hooks/use-mobile", () => ({ useIsMobile: () => false }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/useCookieConsent", () => ({
  useCookieConsent: () => ({ consent: "accepted", accept }),
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer /> }));
vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property, footerAccessory }: { property: ListingCardWithRaw; footerAccessory?: React.ReactNode }) => (
    <article data-testid={`card-${property.id}`}>{property.title}{footerAccessory}</article>
  ),
}));
vi.mock("@/components/PropertyCardSkeleton", () => ({
  PropertyCardSkeleton: () => <div data-testid="skeleton" />,
}));
vi.mock("@/components/ui/EmptyState", () => ({
  EmptyState: ({ title, subtitle, action, testId }: { title: string; subtitle?: string; action?: { label: string; onClick: () => void }; testId?: string }) => (
    <section data-testid={testId ?? "empty-state"}>
      <strong>{title}</strong>
      <span>{subtitle}</span>
      {action && <button type="button" onClick={action.onClick}>{action.label}</button>}
    </section>
  ),
}));
vi.mock("@/components/listings/VirtualizedListingGrid", () => ({
  VirtualizedListingGrid: ({ items, renderItem, "data-testid": testId }: { items: ListingCardWithRaw[]; renderItem: (item: ListingCardWithRaw, index: number) => React.ReactNode; "data-testid"?: string }) => (
    <div data-testid={testId ?? "listing-grid"}>{items.map(renderItem)}</div>
  ),
}));
vi.mock("@/components/listings/ListingCompareButton", () => ({
  ListingCompareButton: ({ listing, onToggle }: { listing: ListingCardWithRaw; onToggle: (listing: ListingCardWithRaw) => void }) => (
    <button type="button" onClick={() => onToggle(listing)}>Compare {listing.id}</button>
  ),
}));
vi.mock("@/components/CompareDrawer", () => ({
  CompareDrawer: ({ listings, onRemove, onClear }: { listings: ListingCardWithRaw[]; onRemove: (id: string) => void; onClear: () => void }) => (
    <aside>
      {listings.map((listing) => <button key={listing.id} onClick={() => onRemove(listing.id)}>Remove {listing.id}</button>)}
      <button onClick={onClear}>Clear drawer</button>
    </aside>
  ),
}));
vi.mock("@/components/listings/ListingsAdvancedFilters", () => ({
  ListingsAdvancedFilters: ({ onClose }: { onClose: () => void }) => <button onClick={onClose}>Close advanced</button>,
}));
vi.mock("@/components/listings/ListingsActiveFilters", () => ({
  DesktopActiveFilterChips: () => <div data-testid="desktop-chips" />,
}));
vi.mock("@/components/listings/ListingTypeButton", () => ({
  ListingTypeButton: ({ onChange }: { onChange: (value: string) => void }) => <button onClick={() => onChange("rent")}>Type rent</button>,
}));
vi.mock("@/components/listings/PropertyTypeButton", () => ({
  PropertyTypeButton: ({ onChange }: { onChange: (type: string | null, subtype: string | null) => void }) => <button onClick={() => onChange(null, null)}>All property types</button>,
}));
vi.mock("@/components/AISearchBar", () => ({ AISearchBar: () => <div /> }));
vi.mock("@/components/SaveSearchModal", () => ({ SaveSearchModal: () => <div /> }));
vi.mock("@/components/listings/MapGate", () => ({
  MapGate: ({ children }: { children: React.ReactNode }) => <div data-testid="map-gate">{children}</div>,
}));
vi.mock("@/components/MapView", () => ({
  MapView: ({
    onVisibleListingsChange,
    onPolygonFilter,
    onViewportBoundsChange,
  }: {
    onVisibleListingsChange?: (ids: Set<string>) => void;
    onPolygonFilter?: (ids: Set<string>) => void;
    onViewportBoundsChange?: (bounds: { west: number; south: number; east: number; north: number }) => void;
  }) => (
    <div data-testid="map-view">
      <button onClick={() => onVisibleListingsChange?.(new Set(["one"]))}>Viewport one</button>
      <button onClick={() => onVisibleListingsChange?.(new Set())}>Viewport empty</button>
      <button onClick={() => onPolygonFilter?.(new Set(["two"]))}>Polygon two</button>
      <button onClick={() => onPolygonFilter?.(new Set())}>Polygon empty</button>
      <button onClick={() => onViewportBoundsChange?.({
        west: 23.7,
        south: 37.9,
        east: 23.8,
        north: 38.05,
      })}>Move map bounds</button>
    </div>
  ),
}));
vi.mock("@/components/listings/LocationSearchField", () => ({
  LocationSearchField: ({ onChange, ariaLabel }: { onChange: (value: string, selection?: { latitude?: string; longitude?: string; radiusM?: number }) => void; ariaLabel: string }) => (
    <div aria-label={ariaLabel}>
      <button onClick={() => onChange("Kalimnou 27", { latitude: "38.0301", longitude: "23.7228", radiusM: 1200 })}>Valid address</button>
      <button onClick={() => onChange("Metaxa 11", { latitude: "37.88", longitude: "23.75" })}>Default radius</button>
      <button onClick={() => onChange("Attica", { latitude: "bad", longitude: "23.7" })}>Invalid address</button>
    </div>
  ),
}));

const listing = (id: string): ListingCardWithRaw => ({
  id,
  title: `Listing ${id}`,
  address: "Kalimnou 27",
  city: "Agioi Anargyroi",
  price: 250000,
  bedrooms: 2,
  bathrooms: 1,
  sqm: 80,
  images: [],
  type: "apartment",
  listingType: "sale",
  tags: [],
  _raw: { created_at: "2026-07-01T00:00:00Z" },
});

describe("Listings route branch matrix", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    locale.value = "en";
    authState.user = null;
    pipelineCalls.length = 0;
    Object.assign(filterState, {
      searchQuery: "",
      selectedListingType: "sale",
      selectedType: "",
      selectedSubtype: "",
      selectedPrice: "",
      selectedSort: "relevant",
      bedsRange: ["", ""],
      bathsRange: ["", ""],
      floorRange: ["", ""],
      yearRange: ["", ""],
      minSqm: "",
      maxSqm: "",
      selectedEnergyClasses: [],
      selectedFeatures: [],
      selectedHeating: "",
      selectedConstruction: "",
      preSaleOnly: false,
      hasVideoViewing: false,
      hasVirtualTour: false,
      hasMessaging: false,
      minAiScore: 0,
      minWalkability: 0,
      activeFilterCount: 0,
      currentFilters: {},
    });
    filterState.getParam.mockImplementation((_key: string, fallback = "") => fallback);
    Object.assign(pipelineState, {
      filtered: [listing("one"), listing("two")],
      totalLoaded: 2,
      isLoading: false,
      isError: false,
      isFetchNextPageError: false,
      hasNextPage: false,
      isFetchingNextPage: false,
    });
  });

  it("maps complete URL state into the listing query and prioritizes canonical new builds", async () => {
    Object.assign(filterState, {
      searchQuery: "Athens",
      selectedListingType: "sale",
      selectedType: "commercial",
      selectedSubtype: "hotel",
      selectedPrice: "0-500000",
      selectedSort: "price-desc",
      bedsRange: ["0", "5"],
      bathsRange: ["1", "4"],
      floorRange: ["-1", "8"],
      yearRange: ["1950", "2026"],
      minSqm: "0",
      maxSqm: "500",
      selectedEnergyClasses: ["A", "B+"],
      selectedFeatures: ["has_parking"],
      selectedHeating: "central_gas",
      selectedConstruction: "renovated",
      preSaleOnly: true,
    });
    filterState.getParam.mockImplementation((key: string, fallback = "") => ({
      location_lat: "38.03",
      location_lng: "23.72",
      location_radius_m: "1500",
    }[key] ?? fallback));
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    expect(pipelineCalls.at(-1)).toEqual(expect.objectContaining({
      filters: {
        city: "Athens",
        location_lat: 38.03,
        location_lng: 23.72,
        location_radius_m: 1500,
        listing_type: "new_build",
        property_type: "commercial",
        price_min: undefined,
        price_max: 500000,
        beds_min: 0,
        beds_max: 5,
        baths_min: 1,
        baths_max: 4,
        floor_min: -1,
        floor_max: 8,
        year_min: 1950,
        year_max: 2026,
        sqm_min: 0,
        sqm_max: 500,
        energy_class: ["A", "B+"],
        heating_system: "central_gas",
        construction_status: "renovated",
        commercial_subtype: "hotel",
        features: ["has_parking"],
        sort: "price-desc",
      },
    }));
  });

  it("applies precise address coordinates, a default radius, and clears invalid coordinates", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    fireEvent.click(screen.getAllByRole("button", { name: "Valid address" })[0]);
    expect(setParams).toHaveBeenCalledWith([
      ["city", "Kalimnou 27"],
      ["location_lat", "38.0301"],
      ["location_lng", "23.7228"],
      ["location_radius_m", "1200"],
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "Default radius" })[0]);
    expect(setParams).toHaveBeenCalledWith([
      ["city", "Metaxa 11"],
      ["location_lat", "37.88"],
      ["location_lng", "23.75"],
      ["location_radius_m", "750"],
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "Invalid address" })[0]);
    expect(setParams).toHaveBeenCalledWith([
      ["city", "Attica"],
      ["location_lat", ""],
      ["location_lng", ""],
      ["location_radius_m", ""],
    ]);
  });

  it("renders loading, error, exhausted empty, background-search, append, and end states", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    const { default: Listings } = await import("@/pages/Listings");
    const view = renderWithProviders(<Listings />);

    pipelineState.isLoading = true;
    pipelineState.filtered = [];
    view.rerender(<Listings />);
    expect(screen.getByLabelText("Loading listings")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton")).toHaveLength(4);

    pipelineState.isLoading = false;
    pipelineState.isError = true;
    view.rerender(<Listings />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalled();

    pipelineState.isError = false;
    filterState.activeFilterCount = 2;
    view.rerender(<Listings />);
    expect(screen.getByText("listings.noResults")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "listings.filters.reset" }));
    expect(clearAllFilters).toHaveBeenCalled();

    pipelineState.hasNextPage = true;
    view.rerender(<Listings />);
    expect(screen.getByText("0 loaded properties")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton")).toHaveLength(4);

    pipelineState.filtered = [listing("one")];
    pipelineState.isFetchingNextPage = true;
    view.rerender(<Listings />);
    expect(screen.getByTestId("listing-grid")).toBeInTheDocument();
    expect(screen.getAllByTestId("skeleton")).toHaveLength(4);

    pipelineState.hasNextPage = false;
    pipelineState.isFetchingNextPage = false;
    view.rerender(<Listings />);
    expect(screen.getByText("No more results")).toBeInTheDocument();
  });

  it("renders split viewport, polygon, empty, loading, error, and mobile-tab states", async () => {
    const reload = vi.fn();
    Object.defineProperty(window, "location", { configurable: true, value: { ...window.location, reload } });
    const { default: Listings } = await import("@/pages/Listings");
    const view = renderWithProviders(<Listings />);
    fireEvent.click(screen.getByRole("button", { name: "Split view" }));
    expect(screen.getByTestId("split-listing-grid")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("button", { name: "Viewport one" }));
    expect(screen.getByText("1 in view")).toBeInTheDocument();
    expect(screen.getByText("Map synced")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Polygon two" }));
    expect(screen.getByText("1 in area")).toBeInTheDocument();
    expect(screen.getByText("Area filter")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Polygon empty" }));
    expect(screen.getByText("No properties here")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^List \(/ }));

    pipelineState.isLoading = true;
    view.rerender(<Listings />);
    expect(screen.getAllByTestId("skeleton")).toHaveLength(4);

    pipelineState.isLoading = false;
    pipelineState.isError = true;
    view.rerender(<Listings />);
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(reload).toHaveBeenCalled();
  });

  it("forwards map viewport bounds and keeps split pagination reachable", async () => {
    pipelineState.hasNextPage = true;
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    fireEvent.click(screen.getByRole("button", { name: "Split view" }));
    fireEvent.click(await screen.findByRole("button", { name: "Move map bounds" }));

    expect(pipelineCalls.at(-1)).toEqual(expect.objectContaining({
      mapBounds: {
        west: 23.7,
        south: 37.9,
        east: 23.8,
        north: 38.05,
      },
    }));
    expect(screen.getByTestId("split-pagination-sentinel")).toBeInTheDocument();
  });

  it("shows a retry state instead of a factual empty map when loading fails", async () => {
    pipelineState.isError = true;
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    fireEvent.click(screen.getAllByRole("button", { name: "Map view" })[0]);

    expect(screen.getByText("Could not load listings")).toBeInTheDocument();
    expect(screen.queryByTestId("map-view")).not.toBeInTheDocument();
  });

  it("keeps loaded listings visible and retries when a later cursor page fails", async () => {
    pipelineState.isFetchNextPageError = true;
    pipelineState.hasNextPage = true;
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    expect(screen.getByTestId("listing-grid")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry loading more listings" }));
    expect(fetchNextPage).toHaveBeenCalledTimes(1);
  });

  it("renders full-map singular/plural and polygon labels", async () => {
    pipelineState.filtered = [listing("one")];
    const { default: Listings } = await import("@/pages/Listings");
    const view = renderWithProviders(<Listings />);
    fireEvent.click(screen.getAllByRole("button", { name: "Map view" })[0]);
    expect(screen.getByText("1 map result")).toBeInTheDocument();

    pipelineState.filtered = [listing("one"), listing("two")];
    view.rerender(<Listings />);
    expect(screen.getByText("2 map results")).toBeInTheDocument();
    pipelineState.hasNextPage = true;
    view.rerender(<Listings />);
    expect(screen.getByText("2+ map results")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Polygon two" }));
    expect(screen.getByText("1+ in area")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Show List" }));
    expect(screen.getByTestId("listing-grid")).toBeInTheDocument();
  });

  it("executes the Greek route copy and singular loaded-result branches", async () => {
    locale.value = "el-GR";
    pipelineState.filtered = [listing("one")];
    pipelineState.hasNextPage = true;
    filterState.activeFilterCount = 1;
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    expect(screen.queryByText("1 loaded property")).not.toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /1/ }).length).toBeGreaterThan(0);
  });
});
