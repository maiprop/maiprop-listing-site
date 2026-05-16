import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";

const { filterState, setParam, clearAllFilters, toggleMulti, pipelineState } = vi.hoisted(() => {
  const setParam = vi.fn();
  const clearAllFilters = vi.fn();
  const toggleMulti = vi.fn();
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
    offMarketOnly: false,
    hasVideoViewing: false,
    hasVirtualTour: false,
    hasMessaging: false,
    minAiScore: 0,
    minWalkability: 0,
    activeFilterCount: 0,
    currentFilters: {},
    setParam,
    setParams: vi.fn(),
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
  return { filterState, setParam, clearAllFilters, toggleMulti, pipelineState };
});

vi.mock("@/hooks/useListingsFilters", () => ({
  useListingsFilters: () => filterState,
}));

vi.mock("@/hooks/useListingsPipeline", () => ({
  useListingsPipeline: () => pipelineState,
}));

vi.mock("@/hooks/useSmartFilters", () => ({
  useSmartFilters: () => ({ config: { features: [] }, loading: false }),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
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
  MapView: () => <div data-testid="map-view" />,
}));

vi.mock("@/components/listings/MapGate", () => ({
  MapGate: ({ children }: { children: React.ReactNode }) => <div data-testid="map-gate">{children}</div>,
}));

vi.mock("@/components/AISearchBar", () => ({
  AISearchBar: ({ onApplyFilters }: { onApplyFilters: (filters: { city: string }) => void }) => (
    <button type="button" onClick={() => onApplyFilters({ city: "Athens" })}>AI apply</button>
  ),
}));

vi.mock("@/components/SaveSearchModal", () => ({
  SaveSearchModal: () => <div data-testid="save-search-modal" />,
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
      selectedPrice: "",
      bedsRange: ["", ""],
      minSqm: "",
      maxSqm: "",
      offMarketOnly: false,
      preSaleOnly: false,
      activeFilterCount: 0,
    });
    pipelineState.filtered = [makeListing("one"), makeListing("two"), makeListing("three"), makeListing("four")];
    pipelineState.totalLoaded = 4;
    pipelineState.isLoading = false;
    pipelineState.isError = false;
    pipelineState.hasNextPage = false;
  });

  it("wires mobile filters, desktop view toggles, and advanced panel close", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(<Listings />);

    fireEvent.change(screen.getByLabelText("Search by city"), { target: { value: "Athens" } });
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
});
