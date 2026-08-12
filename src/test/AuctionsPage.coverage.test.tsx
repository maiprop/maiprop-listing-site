import { fireEvent, screen, waitFor } from "@testing-library/react";
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import Auctions from "@/pages/Auctions";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  navigate: vi.fn(),
  mutate: vi.fn(),
  pipeline: vi.fn(),
  refetch: vi.fn(),
  trackUserSearch: vi.fn(),
  search: "city=Athens&type=apartment",
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [new URLSearchParams(mocks.search)],
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/hooks/useFavorites", () => ({
  useToggleFavorite: () => ({ mutate: mocks.mutate }),
}));

vi.mock("@/hooks/useAuctionsPipeline", () => ({
  AUCTIONS_PAGE_SIZE: 2,
  AUCTIONS_MAX_PAGES_FREE: 2,
  AUCTIONS_MAX_PAGES_PRO: 10,
  useAuctionsPipeline: (...args: unknown[]) => mocks.pipeline(...args),
}));

vi.mock("@/hooks/useTrackUserSearch", () => ({
  useTrackUserSearch: () => mocks.trackUserSearch,
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/auctions/AuctionHero", () => ({
  AuctionHero: ({ stats }: { stats: Array<{ label: string; value: string }> }) => (
    <section data-testid="auction-hero">
      {stats.map((stat) => <span key={stat.label} data-testid="auction-stat-value">{stat.value}</span>)}
    </section>
  ),
}));
vi.mock("@/components/AuctionAlertModal", () => ({
  AuctionAlertModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog" aria-label="auction alert"><button onClick={onClose}>close alert</button></div>
  ),
}));
vi.mock("@/components/auctions/AuctionAlertBanner", () => ({
  AuctionAlertBanner: ({ onOpenAlert, onSignInRedirect }: { onOpenAlert: () => void; onSignInRedirect: () => void }) => (
    <div>
      <button onClick={onOpenAlert}>open alert</button>
      <button onClick={onSignInRedirect}>sign in for alerts</button>
    </div>
  ),
}));
vi.mock("@/components/auctions/AuctionFiltersPanel", () => ({
  AuctionFiltersPanel: ({
    setSelectedCity,
    setFilterType,
    setFilterBidRange,
    setFilterYearRange,
    setFilterOwnership,
    setFilterRound,
    setFilterYield,
    clearFilters,
  }: Record<string, (value?: string) => void>) => (
    <div data-testid="auction-filters">
      <button onClick={() => setSelectedCity("Piraeus")}>set city</button>
      <button onClick={() => setFilterType("villa")}>set type</button>
      <button onClick={() => setFilterBidRange("100000-200000")}>set bid</button>
      <button onClick={() => setFilterYearRange("2000+")}>set year</button>
      <button onClick={() => setFilterOwnership("full")}>set ownership</button>
      <button onClick={() => setFilterRound("first")}>set round</button>
      <button onClick={() => setFilterYield("high")}>set yield</button>
      <button onClick={() => clearFilters()}>clear filters child</button>
    </div>
  ),
}));
vi.mock("@/components/auctions/AuctionCard", () => ({
  AuctionCard: ({ a, onToggleFav }: { a: { id: string; title: string }; onToggleFav: (id: string, isFav: boolean) => void }) => (
    <article>
      <p>{a.title}</p>
      <button onClick={() => onToggleFav(a.id, false)}>favorite {a.id}</button>
      <button onClick={() => onToggleFav(a.id, true)}>unfavorite {a.id}</button>
    </article>
  ),
}));
vi.mock("@/components/auctions/AuctionPagination", () => ({
  AuctionPagination: ({ setCurrentPage }: { setCurrentPage: (page: number) => void }) => (
    <button onClick={() => setCurrentPage(2)}>next page</button>
  ),
}));
vi.mock("@/components/MapView", () => ({
  MapView: ({ onPolygonFilter }: { onPolygonFilter: (ids: Set<string>) => void }) => (
    <button onClick={() => onPolygonFilter(new Set(["auction-1"]))}>draw polygon</button>
  ),
}));

const auction = {
  id: "auction-1",
  title: "Athens Auction",
  city: "Athens",
  latitude: 37.98,
  longitude: 23.72,
};

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function setPipeline(overrides: Record<string, unknown> = {}) {
  const value = {
    isPro: false,
    isMaiPropOsUser: false,
    isLoading: false,
    error: null,
    cityOptions: ["All Cities", "Athens", "Piraeus"],
    roundOptions: ["first"],
    visibleFiltered: [auction],
    polygonFilteredCount: 1,
    paginated: [auction],
    totalPages: 2,
    thisWeek: 1,
    avgBid: 100000,
    activeFilterCount: 1,
    totalRaw: 10,
    mapListings: [auction],
    mappableCount: 1,
    refetch: mocks.refetch,
    ...overrides,
  };
  mocks.pipeline.mockReturnValue(value);
  return value;
}

describe("Auctions page coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "user-1" };
    mocks.search = "city=Athens&type=apartment";
    mocks.trackUserSearch.mockReset();
    mocks.trackUserSearch.mockResolvedValue(undefined);
    setPipeline();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("hydrates AI auction URL filters into the auction pipeline", () => {
    mocks.search = "city=Agrinio&type=commercial&price_min=100000&price_max=200000&sqm_min=80&sqm_max=120";

    renderWithProviders(<Auctions />);

    expect(mocks.pipeline).toHaveBeenCalledWith(expect.objectContaining({
      selectedCity: "Agrinio",
      filterType: "commercial",
      filterBidRange: "100000-200000",
      filterSqmRange: "80-120",
    }));
  });

  it("normalizes invalid or blank numeric URL ranges without leaking NaN into auction pricing filters", () => {
    mocks.search = "price_min=-1&price_max=not-a-price&sqm_min=&sqm_max=";

    renderWithProviders(<Auctions />);

    expect(mocks.pipeline).toHaveBeenCalledWith(expect.objectContaining({
      selectedCity: "All Cities",
      filterBidRange: "0-999999999",
      filterSqmRange: "0-999999999",
    }));
  });

  it("records submitted auction filters for admin search activity analytics", async () => {
    vi.useFakeTimers();
    mocks.search = "city=Agrinio&type=commercial&price_min=100000&price_max=200000&sqm_min=80&sqm_max=120";
    setPipeline({ visibleFiltered: [auction], activeFilterCount: 4, totalRaw: 600, mappableCount: 1 });

    renderWithProviders(<Auctions />);
    await act(async () => {
      vi.advanceTimersByTime(1400);
      await Promise.resolve();
    });

    expect(mocks.trackUserSearch).toHaveBeenCalledWith(expect.objectContaining({
      surface: "auctions",
      query: expect.stringContaining("Agrinio"),
      route: expect.stringContaining("/auctions"),
      resultCount: 1,
      filters: expect.objectContaining({
        city: "Agrinio",
        type: "commercial",
        bidRange: "100000-200000",
        sqmRange: "80-120",
      }),
      metadata: expect.objectContaining({
        activeFilterCount: 4,
        totalRaw: 600,
        mappableCount: 1,
      }),
    }));
  });

  it("does not record an empty All Cities search", async () => {
    vi.useFakeTimers();
    mocks.search = "";
    setPipeline({ activeFilterCount: 0 });

    renderWithProviders(<Auctions />);
    await act(async () => {
      vi.advanceTimersByTime(2000);
      await Promise.resolve();
    });

    expect(mocks.trackUserSearch).not.toHaveBeenCalled();
  });

  it("exposes expanded and selected mobile filter state", () => {
    renderWithProviders(<Auctions />);

    const filterButtons = screen.getAllByRole("button", { name: /^Filters$/i });
    for (const button of filterButtons) {
      expect(button).toHaveAttribute("aria-expanded", "false");
      expect(button).toHaveAttribute("aria-pressed", "false");
    }

    fireEvent.click(filterButtons[0]);

    for (const button of filterButtons) {
      expect(button).toHaveAttribute("aria-expanded", "true");
      expect(button).toHaveAttribute("aria-pressed", "true");
    }
    const apartment = screen.getByRole("button", { name: "Apartment" });
    const house = screen.getByRole("button", { name: "House" });
    expect(apartment).toHaveAttribute("aria-pressed", "true");
    expect(house).toHaveAttribute("aria-pressed", "false");
  });

  it("covers loading skeletons, alert modal close, filters, view toggles, map polygon, pagination, and favorites", async () => {
    const normalPipeline = setPipeline();
    mocks.pipeline
      .mockReturnValueOnce({
        ...normalPipeline,
        isLoading: true,
        visibleFiltered: [],
        paginated: [],
        polygonFilteredCount: 0,
        mappableCount: 0,
      })
      .mockReturnValue(normalPipeline);

    const { rerender } = renderWithProviders(<Auctions />);
    expect(screen.getByText(/Loading auctions/i)).toBeInTheDocument();

    setPipeline();
    rerender(<Auctions />);
    fireEvent.click(screen.getByRole("button", { name: /open alert/i }));
    expect(await screen.findByRole("dialog", { name: /auction alert/i })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /close alert/i }));

    for (const name of ["set city", "set type", "set bid", "set year", "set ownership", "set round", "set yield", "clear filters child"]) {
      fireEvent.click(screen.getByRole("button", { name }));
    }
    fireEvent.click(screen.getAllByRole("button", { name: /^Map/i }).at(-1)!);
    fireEvent.click(await screen.findByRole("button", { name: /draw polygon/i }));
    fireEvent.click(await screen.findByRole("button", { name: /clear area/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^List/i }).at(-1)!);

    const favoriteButton = screen.getAllByRole("button").find((button) => button.textContent === "favorite auction-1");
    expect(favoriteButton).toBeTruthy();
    fireEvent.click(favoriteButton!);
    expect(mocks.mutate).toHaveBeenCalledWith({ listing_id: "auction-1", isFavorited: false });
    fireEvent.click(screen.getByRole("button", { name: /unfavorite auction-1/i }));
    expect(mocks.mutate).toHaveBeenCalledWith({ listing_id: "auction-1", isFavorited: true });
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
  }, 15000);

  it("redirects anonymous favorite and sign-in alert actions and renders no-results clearing", async () => {
    mocks.user = null;
    setPipeline({ visibleFiltered: [], paginated: [], polygonFilteredCount: 0, activeFilterCount: 1, totalRaw: 0 });
    renderWithProviders(<Auctions />);

    fireEvent.click(screen.getByRole("button", { name: /sign in for alerts/i }));
    expect(mocks.navigate).toHaveBeenCalledWith("/login", { state: { from: "/auctions" } });
    const clearButton = screen.getAllByRole("button", { name: /Clear Filters/i }).find((button) => button.textContent === "Clear Filters");
    expect(clearButton).toBeTruthy();
    fireEvent.click(clearButton!);
    await waitFor(() => expect(screen.getByText(/No auctions match your filters/i)).toBeInTheDocument());
  });

  it("renders unavailable stats and a targeted retry without presenting stale auction cards", () => {
    setPipeline({
      error: new Error("upstream unavailable"),
      visibleFiltered: [],
      visibleCount: 0,
      paginated: [],
      mapListings: [],
      mappableCount: 0,
    });

    renderWithProviders(<Auctions />);

    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load auctions. Please try again.");
    expect(screen.getAllByTestId("auction-stat-value")).toHaveLength(3);
    expect(screen.getAllByTestId("auction-stat-value").every((node) => node.textContent === "—")).toBe(true);
    expect(screen.queryByText("Athens Auction")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("keeps map failures distinct from a factual no-results state and localizes retry", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    setPipeline({
      error: new Error("upstream unavailable"),
      visibleFiltered: [],
      visibleCount: 0,
      paginated: [],
      mapListings: [],
      mappableCount: 0,
    });

    renderWithProviders(<Auctions />);
    fireEvent.click(screen.getAllByRole("button", { name: "Προβολή χάρτη" })[0]);

    expect(await screen.findByRole("alert")).toHaveTextContent("Δεν ήταν δυνατή η φόρτωση των πλειστηριασμών");
    expect(screen.queryByText("Δεν υπάρχουν πλειστηριασμοί που ταιριάζουν στα φίλτρα.")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Δοκιμάστε ξανά" }));
    expect(mocks.refetch).toHaveBeenCalledTimes(1);
  });

  it("distinguishes no map matches from auctions that lack coordinates", async () => {
    setPipeline({ visibleFiltered: [], paginated: [], mapListings: [], mappableCount: 0, polygonFilteredCount: 0 });
    const first = renderWithProviders(<Auctions />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Map/i }).at(-1)!);
    expect(await screen.findByText("No auctions match the current filters.")).toBeInTheDocument();
    first.unmount();

    setPipeline({
      visibleFiltered: [auction],
      paginated: [auction],
      mapListings: [],
      mappableCount: 0,
      polygonFilteredCount: 1,
    });
    renderWithProviders(<Auctions />);
    fireEvent.click(screen.getAllByRole("button", { name: /^Map/i }).at(-1)!);
    expect(await screen.findByText("1 auction(s) found but none have coordinates.")).toBeInTheDocument();
  });

  it("keeps the free and Pro auction result caps explicit while OS users remain uncapped", () => {
    setPipeline({ isPro: false, isMaiPropOsUser: false, totalRaw: 20 });
    const free = renderWithProviders(<Auctions />);
    expect(screen.getByText("See 300% more results with Pro")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Upgrade to Pro" })).toHaveAttribute("href", "/pricing");
    free.unmount();

    setPipeline({ isPro: true, isMaiPropOsUser: false, totalRaw: 100 });
    const pro = renderWithProviders(<Auctions />);
    expect(screen.getByText(/Showing 20 of 100 auctions/)).toBeInTheDocument();
    expect(screen.queryByText("See 300% more results with Pro")).not.toBeInTheDocument();
    pro.unmount();

    setPipeline({ isPro: true, isMaiPropOsUser: true, totalRaw: 100 });
    renderWithProviders(<Auctions />);
    expect(screen.queryByText(/Showing 20 of 100 auctions/)).not.toBeInTheDocument();
    expect(screen.queryByText("See 300% more results with Pro")).not.toBeInTheDocument();
  });

  it("supports mobile filter selection, deselection, and the clear-all control", async () => {
    setPipeline({ activeFilterCount: 3 });
    renderWithProviders(<Auctions />);

    fireEvent.click(screen.getAllByRole("button", { name: /^Filters/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Apartment" }));
    fireEvent.click(screen.getByRole("button", { name: "Under €20k" }));
    fireEvent.click(screen.getByRole("button", { name: "Under €20k" }));
    fireEvent.click(screen.getByRole("button", { name: "Post-2020" }));
    fireEvent.click(screen.getByRole("button", { name: "Post-2020" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear all filters" }));

    await waitFor(() => {
      expect(mocks.pipeline).toHaveBeenCalledWith(expect.objectContaining({ filterType: "apartment" }));
      expect(mocks.pipeline).toHaveBeenCalledWith(expect.objectContaining({ filterBidRange: "0-20000" }));
      expect(mocks.pipeline).toHaveBeenCalledWith(expect.objectContaining({ filterYearRange: "2020-2100" }));
    });
  });

  it("removes the active type chip and supports the desktop filter toggle", async () => {
    setPipeline({ activeFilterCount: 1 });
    renderWithProviders(<Auctions />);

    fireEvent.click(screen.getByRole("button", { name: /^apartment$/i }));
    fireEvent.click(screen.getAllByRole("button", { name: /^Filters/i }).at(-1)!);

    await waitFor(() => {
      expect(mocks.pipeline).toHaveBeenCalledWith(expect.objectContaining({ filterType: "" }));
      expect(screen.getByTestId("auction-filters")).toBeInTheDocument();
    });
  });
});
