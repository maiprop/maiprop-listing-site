import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";

const { filterState, setParam, setParams, clearAllFilters, toggleMulti, pipelineState, authState, loadGoogleMapsPlaces, trackUserSearch } = vi.hoisted(() => {
  const setParam = vi.fn();
  const setParams = vi.fn();
  const clearAllFilters = vi.fn();
  const toggleMulti = vi.fn();
  const loadGoogleMapsPlaces = vi.fn().mockResolvedValue(undefined);
  const trackUserSearch = vi.fn().mockResolvedValue(undefined);
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
    toggleMulti,
    clearAllFilters,
    applyAIFilters: vi.fn(),
  };
  const pipelineState = {
    filtered: [] as ListingCardWithRaw[],
    totalLoaded: 0,
    isLoading: false,
    isError: false,
    hasNextPage: false,
    isFetchingNextPage: false,
    sentinelRef: { current: null },
  };
  const authState = { user: null as null | { id: string } };
  return { filterState, setParam, setParams, clearAllFilters, toggleMulti, pipelineState, authState, loadGoogleMapsPlaces, trackUserSearch };
});

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "maps-key",
  MAPBOX_TOKEN: "",
  getStreetViewProxyUrl: vi.fn().mockReturnValue(""),
}));

vi.mock("@/lib/googleMapsPlaces", () => ({
  loadGoogleMapsPlaces,
}));

vi.mock("@/hooks/useListingsFilters", () => ({
  useListingsFilters: () => filterState,
}));

vi.mock("@/hooks/useListingsPipeline", () => ({
  useListingsPipeline: () => pipelineState,
}));

vi.mock("@/hooks/useTrackUserSearch", () => ({
  useTrackUserSearch: () => trackUserSearch,
}));

vi.mock("@/hooks/useSmartFilters", () => ({
  useSmartFilters: () => ({ config: { features: [] }, loading: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("@/hooks/useCookieConsent", () => ({
  useCookieConsent: () => ({ consent: "accepted", accept: vi.fn() }),
}));

vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

vi.mock("@/components/Footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: ListingCardWithRaw }) => (
    <article data-testid="property-card">{property.title}</article>
  ),
}));

vi.mock("@/components/PropertyCardSkeleton", () => ({
  PropertyCardSkeleton: () => <div data-testid="listing-skeleton" />,
}));

vi.mock("@/components/listings/VirtualizedListingGrid", () => ({
  VirtualizedListingGrid: ({
    items,
    renderItem,
    "data-testid": testId,
  }: {
    items: ListingCardWithRaw[];
    renderItem: (item: ListingCardWithRaw) => React.ReactNode;
    "data-testid"?: string;
  }) => <div data-testid={testId ?? "listing-grid"}>{items.map(renderItem)}</div>,
}));

vi.mock("@/components/listings/ListingsAdvancedFilters", () => ({
  ListingsAdvancedFilters: ({ filteredCount, onClose }: { filteredCount: number; onClose: () => void }) => (
    <section data-testid="advanced-filters">
      <span>{filteredCount} filtered</span>
      <button type="button" onClick={onClose}>Close advanced</button>
    </section>
  ),
}));

vi.mock("@/components/CompareDrawer", () => ({
  CompareDrawer: ({
    listings,
    onRemove,
    onClear,
  }: {
    listings: ListingCardWithRaw[];
    onRemove: (id: string) => void;
    onClear: () => void;
  }) => (
    <aside data-testid="compare-drawer">
      {listings.map((listing) => (
        <button key={listing.id} type="button" onClick={() => onRemove(listing.id)}>
          Remove {listing.title}
        </button>
      ))}
      {listings.length > 0 && <button type="button" onClick={onClear}>Clear compare</button>}
    </aside>
  ),
}));

vi.mock("@/components/MapView", () => ({
  MapView: ({
    onVisibleListingsChange,
    onPolygonFilter,
  }: {
    onVisibleListingsChange?: (ids: Set<string>) => void;
    onPolygonFilter?: (ids: Set<string>) => void;
  }) => (
    <div data-testid="map-view">
      <button type="button" onClick={() => onVisibleListingsChange?.(new Set(["one"]))}>Sync viewport</button>
      <button type="button" onClick={() => onPolygonFilter?.(new Set(["two"]))}>Apply polygon</button>
    </div>
  ),
}));

vi.mock("@/components/listings/MapGate", () => ({
  MapGate: ({ children }: { children: React.ReactNode }) => <div data-testid="map-gate">{children}</div>,
}));

vi.mock("@/components/AISearchBar", () => ({
  AISearchBar: ({ onFiltersApplied }: { onFiltersApplied: (filters: { city: string }) => void }) => (
    <button type="button" onClick={() => onFiltersApplied({ city: "Athens" })}>AI apply</button>
  ),
}));

vi.mock("@/components/SaveSearchModal", () => ({
  SaveSearchModal: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="save-search-modal">
      <button type="button" onClick={onClose}>Close save search</button>
    </div>
  ),
}));

const makeListing = (id: string): ListingCardWithRaw => ({
  id,
  title: `Listing ${id}`,
  address: "Kolonaki 1",
  city: "Athens",
  price: 250000,
  bedrooms: 2,
  bathrooms: 1,
  sqm: 80,
  images: [],
  type: "apartment",
  listingType: "sale",
  tags: [],
  _raw: {
    created_at: "2026-05-01T00:00:00Z",
    has_video_tour: false,
    has_virtual_tour: false,
    ai_score: null,
    walkability_score: null,
  },
});

describe("Listings page interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(filterState, {
      searchQuery: "",
      selectedListingType: "sale",
      selectedType: "",
      selectedSubtype: "",
      selectedPrice: "",
      bedsRange: ["", ""],
      selectedEnergyClasses: [],
      selectedFeatures: [],
      selectedHeating: "",
      selectedConstruction: "",
      minSqm: "",
      maxSqm: "",
      preSaleOnly: false,
      hasVideoViewing: false,
      hasVirtualTour: false,
      hasMessaging: false,
      minAiScore: 0,
      minWalkability: 0,
      activeFilterCount: 0,
    });
    authState.user = null;
    pipelineState.filtered = [makeListing("one"), makeListing("two"), makeListing("three"), makeListing("four")];
    pipelineState.totalLoaded = 4;
    pipelineState.isLoading = false;
    pipelineState.isError = false;
    pipelineState.hasNextPage = false;
    pipelineState.isFetchingNextPage = false;
    trackUserSearch.mockReset();
    trackUserSearch.mockResolvedValue(undefined);
    delete (window as typeof window & { google?: unknown }).google;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("wires mobile filters, desktop view toggles, and advanced panel close", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    const cityInput = screen.getByLabelText("Search by city");
    fireEvent.focus(cityInput);
    expect(screen.getByText("Popular Locations")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Athens"));
    expect(setParam).toHaveBeenCalledWith("city", "Athens");

    fireEvent.change(cityInput, { target: { value: "Athens" } });
    expect(setParam).toHaveBeenCalledWith("city", "Athens");

    fireEvent.click(screen.getAllByRole("button", { name: "Grid view" })[0]);
    expect(screen.getAllByRole("button", { name: "Grid view" })[0]).toHaveAttribute("aria-pressed", "true");

    fireEvent.click(screen.getByRole("button", { name: "Split view" }));
    expect(screen.getByTestId("split-listing-grid")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Map view" })[0]);
    expect(screen.getByTestId("map-gate")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show list/i }));
    expect(screen.getByTestId("listing-grid")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Filters"));
    expect(screen.getByTestId("advanced-filters")).toHaveTextContent("4 filtered");
    fireEvent.click(screen.getByRole("button", { name: "Close advanced" }));
    expect(screen.queryByTestId("advanced-filters")).not.toBeInTheDocument();
  }, 15_000);

  it("loads Google Places for listing search only after focus and applies the selected location", async () => {
    let placeChanged: (() => void) | undefined;
    class AutocompleteMock {
      addListener(_eventName: string, handler: () => void) {
        placeChanged = handler;
      }
      getPlace() {
        return {
          address_components: [
            { types: ["administrative_area_level_2"], long_name: "Heraklion" },
          ],
          formatted_address: "Heraklion, Crete",
        };
      }
    }
    (window as typeof window & { google: unknown }).google = {
      maps: { places: { Autocomplete: AutocompleteMock } },
    };

    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    expect(loadGoogleMapsPlaces).not.toHaveBeenCalled();
    fireEvent.focus(screen.getByLabelText("Search by city"));
    await waitFor(() => expect(loadGoogleMapsPlaces).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(placeChanged).toBeTypeOf("function"));

    act(() => placeChanged?.());
    expect(setParam).toHaveBeenCalledWith("city", "Heraklion");
  });

  it("records submitted listing searches for admin activity analytics", async () => {
    vi.useFakeTimers();
    Object.assign(filterState, {
      searchQuery: "Athens",
      selectedListingType: "sale",
      selectedType: "apartment",
      selectedPrice: "100000-300000",
      activeFilterCount: 3,
      currentFilters: { city: "Athens", listing_type: "sale", type: "apartment" },
    });
    authState.user = { id: "buyer-1" };
    const { default: Listings } = await import("@/pages/Listings");

    renderWithProviders(<Listings />);
    await act(async () => {
      vi.advanceTimersByTime(1400);
      await Promise.resolve();
    });

    expect(trackUserSearch).toHaveBeenCalledWith(expect.objectContaining({
      surface: "listings",
      query: expect.stringContaining("Athens"),
      route: expect.stringContaining("/listings"),
      resultCount: 4,
      filters: expect.objectContaining({ city: "Athens", listing_type: "sale", type: "apartment" }),
      metadata: expect.objectContaining({ activeFilterCount: 3, totalLoaded: 4 }),
    }));
    vi.useRealTimers();
  });

  it("adds, removes, clears, and caps listings in the compare drawer", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    const compareButtons = screen.getAllByRole("button", { name: /compare/i });
    fireEvent.click(compareButtons[0]);
    expect(screen.getByText("1 selected to compare")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Remove Listing one" }));
    expect(screen.queryByText("1 selected to compare")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /compare/i })[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /compare/i })[1]);
    fireEvent.click(screen.getAllByRole("button", { name: /compare/i })[2]);
    expect(screen.getByText("3 selected to compare")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /compare/i })[3]).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Clear compare" }));
    expect(screen.queryByText("3 selected to compare")).not.toBeInTheDocument();
    expect(within(screen.getByTestId("listing-grid")).getAllByRole("button", { name: /compare/i })[3]).not.toBeDisabled();
  });

  it("shows and clears active desktop chips", async () => {
    Object.assign(filterState, {
      selectedType: "apartment",
      selectedPrice: "100000-250000",
      bedsRange: ["2", ""],
      activeFilterCount: 3,
    });
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    fireEvent.click(screen.getAllByRole("button", { name: /apartment/i })[0]);
    expect(setParam).toHaveBeenCalledWith("type", "");
    expect(setParam).toHaveBeenCalledWith("subtype", "");

    fireEvent.click(screen.getAllByRole("button", { name: /2\+ beds/i })[0]);
    expect(setParam).toHaveBeenCalledWith("beds_min", "");

    fireEvent.click(screen.getAllByRole("button", { name: "Clear all" })[0]);
    expect(clearAllFilters).toHaveBeenCalled();
    expect(toggleMulti).not.toHaveBeenCalled();
  });

  it("wires dense mobile filter controls and active chips", async () => {
    Object.assign(filterState, {
      searchQuery: "Athens",
      selectedType: "apartment",
      selectedPrice: "100000-250000",
      bedsRange: ["2", ""],
      minSqm: "55",
      maxSqm: "120",
      hasVideoViewing: true,
      hasVirtualTour: true,
      hasMessaging: true,
      minAiScore: 80,
      minWalkability: 70,
      activeFilterCount: 9,
    });

    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    fireEvent.click(screen.getByRole("button", { name: /listingTypes\.rent/i }));
    expect(setParam).toHaveBeenCalledWith("listing_type", "rent");

    fireEvent.click(screen.getByRole("button", { name: /filters \(9 active\)/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /house/i })[0]);
    expect(setParam).toHaveBeenCalledWith("type", "house");
    expect(setParam).toHaveBeenCalledWith("subtype", "");

    fireEvent.click(screen.getAllByRole("button", { name: /150k.*300k/i })[0]);
    expect(setParam).toHaveBeenCalledWith("price", "150000-300000");

    fireEvent.change(screen.getByPlaceholderText("Min m²"), { target: { value: "60" } });
    fireEvent.change(screen.getByPlaceholderText("Max m²"), { target: { value: "140" } });
    expect(setParam).toHaveBeenCalledWith("sqm_min", "60");
    expect(setParam).toHaveBeenCalledWith("sqm_max", "140");

    fireEvent.click(screen.getAllByRole("button", { name: "3+" })[0]);
    expect(setParam).toHaveBeenCalledWith("beds_min", "3");

    fireEvent.click(screen.getByLabelText(/new builds/i));
    expect(screen.queryByLabelText(/off-market/i)).not.toBeInTheDocument();
    expect(setParams).toHaveBeenCalledWith([["listing_type", "new_build"], ["pre_sale", ""]]);

    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));
    expect(clearAllFilters).toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /filters \(9 active\)/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /size/i })[0]);
    expect(setParam).toHaveBeenCalledWith("sqm_min", "");
    expect(setParam).toHaveBeenCalledWith("sqm_max", "");

    for (const name of [/video/i, /virtual/i, /messaging/i, /AI 80\+/i, /Walk 70\+/i]) {
      fireEvent.click(screen.getAllByRole("button", { name })[0]);
    }
    expect(setParam).toHaveBeenCalledWith("video_viewing", "");
    expect(setParam).toHaveBeenCalledWith("virtual_tour", "");
    expect(setParam).toHaveBeenCalledWith("messaging", "");
    expect(setParam).toHaveBeenCalledWith("min_ai_score", "");
    expect(setParam).toHaveBeenCalledWith("min_walkability", "");
  });

  it("wires desktop dropdowns, AI filters, save search, map sync, and retry paths", async () => {
    authState.user = { id: "user-1" };
    Object.assign(filterState, {
      selectedEnergyClasses: ["A+"],
      selectedFeatures: ["pool"],
      selectedHeating: "autonomous",
      selectedConstruction: "new",
      preSaleOnly: true,
      hasVideoViewing: true,
      hasVirtualTour: true,
      hasMessaging: true,
      minAiScore: 75,
      minWalkability: 65,
      activeFilterCount: 9,
    });

    const reload = vi.fn();
    Object.defineProperty(window, "location", {
      configurable: true,
      value: { ...window.location, reload },
    });

    const { default: Listings } = await import("@/pages/Listings");
    const { rerender } = renderWithProviders(<Listings />);

    fireEvent.change(screen.getByLabelText("Price range"), { target: { value: "150000-300000" } });
    fireEvent.change(screen.getByLabelText("Sort by"), { target: { value: "price-asc" } });
    expect(setParam).toHaveBeenCalledWith("price", "150000-300000");
    expect(setParam).toHaveBeenCalledWith("sort", "price-asc");

    fireEvent.click(screen.getByRole("button", { name: "AI apply" }));
    expect(filterState.applyAIFilters).toHaveBeenCalledWith({ city: "Athens" });

    fireEvent.click(screen.getByRole("button", { name: /listings\.saveSearch/i }));
    expect(screen.getByTestId("save-search-modal")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Close save search" }));
    expect(screen.queryByTestId("save-search-modal")).not.toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /listingTypes\.buy/i }).at(-1)!);
    await waitFor(() => expect(screen.getAllByRole("button", { name: /listingTypes\.buy/i }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /listingTypes\.buy/i }).at(-1)!);
    expect(setParam).toHaveBeenCalledWith("listing_type", "sale");

    fireEvent.click(screen.getByRole("button", { name: /filters\.allTypes/i }));
    await waitFor(() => expect(screen.getAllByRole("button", { name: /apartment/i }).length).toBeGreaterThan(0));
    fireEvent.click(screen.getAllByRole("button", { name: /apartment/i }).at(-1)!);
    expect(setParams).toHaveBeenCalledWith([["type", "apartment"], ["subtype", ""]]);

    fireEvent.click(screen.getByRole("button", { name: /split view/i }));
    await waitFor(() => expect(screen.getByTestId("map-view")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Sync viewport" }));
    expect(screen.getByText("1 in view")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Apply polygon" }));
    expect(screen.getByText("1 in area")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Map$/ }));
    fireEvent.click(screen.getByRole("button", { name: /^List \(/i }));

    for (const name of [
      /Energy A\+/i,
      /pool/i,
      /Heating:/i,
      /^New$/i,
      /new builds/i,
      /video viewing/i,
      /virtual tour/i,
      /messaging/i,
      /AI score 75\+/i,
      /Walk 65\+/i,
    ]) {
      const matches = screen.getAllByRole("button", { name });
      fireEvent.click(matches[matches.length - 1]);
    }
    expect(toggleMulti).toHaveBeenCalledWith("energy", "A+");
    expect(toggleMulti).toHaveBeenCalledWith("features", "pool");
    expect(setParam).toHaveBeenCalledWith("heating", "");
    expect(setParam).toHaveBeenCalledWith("construction", "");

    pipelineState.isError = true;
    pipelineState.filtered = [];
    rerender(<Listings />);
    fireEvent.click(screen.getAllByRole("button", { name: /retry/i })[0]);
    expect(reload).toHaveBeenCalled();
  }, 15000);
});
