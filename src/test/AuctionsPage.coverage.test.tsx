import { fireEvent, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "@/test/utils";
import Auctions from "@/pages/Auctions";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  navigate: vi.fn(),
  mutate: vi.fn(),
  pipeline: vi.fn(),
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigate,
    useSearchParams: () => [new URLSearchParams("city=Athens&type=apartment")],
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

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/auctions/AuctionHero", () => ({ AuctionHero: () => <section data-testid="auction-hero" /> }));
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
    ...overrides,
  };
  mocks.pipeline.mockReturnValue(value);
  return value;
}

describe("Auctions page coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "user-1" };
    setPipeline();
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
    fireEvent.click(screen.getAllByRole("button", { name: /^List/i }).at(-1)!);

    const favoriteButton = screen.getAllByRole("button").find((button) => button.textContent === "favorite auction-1");
    expect(favoriteButton).toBeTruthy();
    fireEvent.click(favoriteButton!);
    expect(mocks.mutate).toHaveBeenCalledWith({ listing_id: "auction-1", isFavorited: false });
    fireEvent.click(screen.getByRole("button", { name: /unfavorite auction-1/i }));
    expect(mocks.mutate).toHaveBeenCalledWith({ listing_id: "auction-1", isFavorited: true });
    fireEvent.click(screen.getByRole("button", { name: /next page/i }));
  });

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
});
