import { describe, it, expect, vi, beforeEach } from "vitest";
import type React from "react";
import { fireEvent, screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import AnalyticsTab from "@/pages/dashboard/AnalyticsTab";
import PortfoliosTab from "@/pages/dashboard/PortfoliosTab";
import SavedSearchesTab from "@/pages/dashboard/SavedSearchesTab";
import ViewingsTab from "@/pages/dashboard/ViewingsTab";
import { MyListingsSection } from "@/pages/dashboard/MyListingsSection";

const {
  authState,
  subscriptionState,
  listingsState,
  updateListingMutate,
  deleteListingMutate,
  portfoliosState,
  favoritesState,
  createPortfolioMutate,
  updatePortfolioMutate,
  deletePortfolioMutate,
  viewingsRequesterState,
  viewingsOwnerState,
  updateViewingMutate,
  savedSearchesState,
  deleteSavedSearchMutate,
  toggleSavedSearchAlertMutate,
  trendsState,
  leadFunnelState,
  conversationsState,
  professionalState,
  toastMock,
  navigateMock,
} = vi.hoisted(() => ({
  authState: { profile: { role: "agent", participant_type: "agent" } as Record<string, unknown> | null },
  subscriptionState: { isPro: true },
  listingsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  updateListingMutate: vi.fn(),
  deleteListingMutate: vi.fn(),
  portfoliosState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  favoritesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  createPortfolioMutate: vi.fn(),
  updatePortfolioMutate: vi.fn(),
  deletePortfolioMutate: vi.fn(),
  viewingsRequesterState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  viewingsOwnerState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  updateViewingMutate: vi.fn(),
  savedSearchesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  deleteSavedSearchMutate: vi.fn(),
  toggleSavedSearchAlertMutate: vi.fn(),
  trendsState: { data: [] as Array<{ date: string; count: number }>, isLoading: false },
  leadFunnelState: { data: null as Record<string, unknown> | null, isLoading: false },
  conversationsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  professionalState: { data: { id: "pro-1" }, isLoading: false },
  toastMock: { success: vi.fn(), error: vi.fn() },
  navigateMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => authState }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => subscriptionState }));
vi.mock("@/hooks/useListings", () => ({
  useMyListings: () => listingsState,
  useUpdateListing: () => ({ mutate: updateListingMutate }),
  useDeleteListing: () => ({ mutate: deleteListingMutate }),
}));
vi.mock("@/hooks/usePortfolios", () => ({
  usePortfolios: () => portfoliosState,
  useCreatePortfolio: () => ({ mutate: createPortfolioMutate, isPending: false }),
  useUpdatePortfolio: () => ({ mutate: updatePortfolioMutate, isPending: false }),
  useDeletePortfolio: () => ({ mutate: deletePortfolioMutate, isPending: false }),
}));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => favoritesState }));
vi.mock("@/hooks/useViewings", () => ({
  useViewings: (scope: string) => (scope === "owner" ? viewingsOwnerState : viewingsRequesterState),
  useUpdateViewing: () => ({ mutate: updateViewingMutate }),
}));
vi.mock("@/hooks/useSavedSearches", () => ({
  useSavedSearches: () => savedSearchesState,
  useDeleteSavedSearch: () => ({ mutate: deleteSavedSearchMutate }),
  useToggleSavedSearchAlert: () => ({ mutate: toggleSavedSearchAlertMutate }),
}));
vi.mock("@/hooks/useAnalytics", () => ({
  useListingViewTrends: () => trendsState,
  useLeadFunnel: () => leadFunnelState,
}));
vi.mock("@/hooks/useProfessionalServices", () => ({
  useMyProfessional: () => professionalState,
}));
vi.mock("@/hooks/useMessages", () => ({ useConversations: () => conversationsState }));
vi.mock("@/components/gates/ProGate", () => ({ ProGate: ({ children }: { children?: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: { title?: string } }) => <div data-testid="property-card">{property.title}</div>,
}));
vi.mock("@/lib/listingUtils", () => ({ dbListingToCard: (listing: { title?: string }) => listing }));
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    confirmLabel,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title: string;
    confirmLabel: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) => open ? (
    <div role="dialog" aria-label={title}>
      <button onClick={onConfirm}>{confirmLabel}</button>
      <button onClick={onCancel}>Cancel</button>
    </div>
  ) : null,
}));
vi.mock("@/components/charts/LazyRecharts", () => ({
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div data-testid="chart">{children}</div>,
  AreaChart: () => <div data-testid="area-chart" />,
  Area: () => null,
  XAxis: () => null,
  YAxis: () => null,
  Tooltip: () => null,
  BarChart: () => <div data-testid="bar-chart" />,
  Bar: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Cell: () => null,
  ChartFallback: () => <div>Loading chart</div>,
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("sonner", () => ({ toast: toastMock }));

beforeEach(() => {
  authState.profile = { role: "agent", participant_type: "agent" };
  subscriptionState.isPro = true;
  listingsState.data = [];
  listingsState.isLoading = false;
  portfoliosState.data = [];
  portfoliosState.isLoading = false;
  favoritesState.data = [];
  viewingsRequesterState.data = [];
  viewingsRequesterState.isLoading = false;
  viewingsOwnerState.data = [];
  savedSearchesState.data = [];
  savedSearchesState.isLoading = false;
  trendsState.data = [];
  trendsState.isLoading = false;
  leadFunnelState.data = null;
  leadFunnelState.isLoading = false;
  conversationsState.data = [];
  professionalState.data = { id: "pro-1" };
  vi.clearAllMocks();
  createPortfolioMutate.mockImplementation((_: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
  updatePortfolioMutate.mockImplementation((_: unknown, opts?: { onSuccess?: () => void }) => opts?.onSuccess?.());
});

describe("dashboard tab behavior", () => {
  it("renders buyer analytics as a gated placeholder without fetching seller metrics", () => {
    authState.profile = { role: "buyer", participant_type: "buyer" };

    renderWithProviders(<AnalyticsTab />);

    expect(screen.getByText(/Analytics are available for sellers and agents/i)).toBeInTheDocument();
    expect(screen.queryByText(/Total listings/i)).not.toBeInTheDocument();
  });

  it("computes seller analytics, changes date range, and shows empty chart branches", () => {
    listingsState.data = [
      { id: "l-1", title: "Seafront flat", city: "Athens", views_count: 30, status: "active", created_at: new Date().toISOString() },
      { id: "l-2", title: "Old town studio", city: "Chania", views_count: 10, status: "paused", created_at: "2026-01-01T00:00:00Z" },
    ];
    viewingsOwnerState.data = [{ id: "v-1", created_at: new Date().toISOString(), scheduled_at: new Date().toISOString() }];
    trendsState.data = [{ date: new Date().toISOString().slice(0, 10), count: 7 }];
    conversationsState.data = [{ id: "c-1" }, { id: "c-2" }];

    renderWithProviders(<AnalyticsTab />);

    expect(screen.getAllByText("Seafront flat")).toHaveLength(2);
    expect(screen.getByText("Old town studio")).toBeInTheDocument();
    expect(screen.getByText("Messages received")).toBeInTheDocument();
    expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "30d" }));
    expect(screen.getByText(/Property views/i)).toHaveTextContent("last 30 days");
  });

  it("creates, renames, adds saved listings to, removes from, and deletes portfolios", () => {
    portfoliosState.data = [{
      id: "p-1",
      name: "Athens income",
      listing_ids: ["l-1"],
      listings: [{ id: "l-1", title: "Central Loft", price: 250000 }],
    }];
    favoritesState.data = [
      { listing_id: "fav-1", listings: { id: "fav-1", title: "Saved Maisonette", city: "Athens" } },
      { listing_id: "l-1", listings: { id: "l-1", title: "Already included", city: "Athens" } },
    ];

    renderWithProviders(<PortfoliosTab />);

    expect(screen.getByText(/1 properties/i)).toBeInTheDocument();
    expect(screen.getByText(/250,000/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /new portfolio/i }));
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(toastMock.error).toHaveBeenCalledWith("Portfolio name is required");
    fireEvent.change(screen.getByPlaceholderText(/Athens Buy-to-Let/i), { target: { value: "  Yield Watch  " } });
    fireEvent.click(screen.getByRole("button", { name: /^create$/i }));
    expect(createPortfolioMutate).toHaveBeenCalledWith("Yield Watch", expect.any(Object));

    fireEvent.click(screen.getByRole("button", { name: /rename/i }));
    fireEvent.change(screen.getByDisplayValue("Athens income"), { target: { value: "Core Athens" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));
    expect(updatePortfolioMutate).toHaveBeenCalledWith(
      { id: "p-1", updates: { name: "Core Athens" } },
      expect.any(Object),
    );

    fireEvent.click(screen.getByRole("button", { name: /\+ Add from saved properties/i }));
    fireEvent.click(screen.getByRole("button", { name: /\+ Saved Maisonette/i }));
    expect(updatePortfolioMutate).toHaveBeenCalledWith(
      { id: "p-1", updates: { listing_ids: ["l-1", "fav-1"] } },
      expect.any(Object),
    );
    fireEvent.click(screen.getByRole("button", { name: /remove/i }));
    expect(updatePortfolioMutate).toHaveBeenCalledWith({ id: "p-1", updates: { listing_ids: [] } });
    fireEvent.click(screen.getByRole("button", { name: /delete portfolio/i }));
    fireEvent.click(within(screen.getByRole("dialog", { name: /delete portfolio/i })).getByRole("button", { name: /^delete$/i }));
    expect(deletePortfolioMutate).toHaveBeenCalledWith("p-1");
  });

  it("toggles alerts, runs with serialized filters, and confirms saved-search deletion", () => {
    savedSearchesState.data = [{
      id: "s-1",
      name: "Athens flats",
      filters: { city: "Athens", min_price: "100000", max_price: "" },
      email_alerts: false,
      created_at: "2026-05-01T00:00:00Z",
      last_alert_sent_at: "2026-05-10T00:00:00Z",
    }];

    renderWithProviders(<SavedSearchesTab />);

    expect(screen.getByText(/city: Athens, min price: 100000/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /run/i })).toHaveAttribute("href", "/listings?city=Athens&min_price=100000&max_price=");
    fireEvent.click(screen.getAllByRole("button")[0]);
    expect(toggleSavedSearchAlertMutate).toHaveBeenCalledWith({ id: "s-1", emailAlerts: true });
    fireEvent.click(screen.getAllByRole("button")[1]);
    fireEvent.click(within(screen.getByRole("dialog", { name: /delete saved search/i })).getByRole("button", { name: /^delete$/i }));
    expect(deleteSavedSearchMutate).toHaveBeenCalledWith("s-1");
  });

  it("caps free viewings, upgrades from the locked summary, and lets owners set video links", () => {
    subscriptionState.isPro = false;
    const now = "2026-05-16T10:00:00Z";
    viewingsRequesterState.data = [
      { id: "v-1", scheduled_at: now, status: "pending", viewing_type: "in_person", listings: { title: "One" } },
      { id: "v-2", scheduled_at: now, status: "confirmed", viewing_type: "in_person", listings: { title: "Two" } },
    ];
    viewingsOwnerState.data = [
      { id: "owner-1", scheduled_at: now, status: "confirmed", viewing_type: "video", video_link: null, listings: { title: "Owner Video" } },
      { id: "owner-2", scheduled_at: now, status: "pending", viewing_type: "in_person", listings: { title: "Hidden" } },
    ];
    authState.profile = { video_link: "https://whereby.test/agent" };

    renderWithProviders(<ViewingsTab />);

    expect(screen.getByText(/1 viewings hidden/i)).toBeInTheDocument();
    expect(screen.queryByText("Hidden")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /upgrade to pro/i }));
    expect(navigateMock).toHaveBeenCalledWith("/pricing");
    const linkInput = screen.getByPlaceholderText(/Paste video call link/i);
    fireEvent.keyDown(linkInput, { key: "Enter" });
    expect(updateViewingMutate).toHaveBeenCalledWith({ id: "owner-1", updates: { video_link: "https://whereby.test/agent" } });
  });

  it("filters special listings and mutates featured, priority, status, and delete actions", () => {
    listingsState.data = [
      {
        id: "l-1",
        title: "Quiet off-market",
        city: "Athens",
        price: 100000,
        sqm: 80,
        status: "active",
        views_count: 12,
        is_off_market: true,
        is_pre_sale: false,
        is_featured: false,
        priority_placement: 1,
        tags: ["exclusive"],
      },
      {
        id: "l-2",
        title: "Future launch",
        city: "Patras",
        price: 150000,
        sqm: 90,
        status: "paused",
        views_count: 5,
        is_off_market: false,
        is_pre_sale: true,
        is_featured: true,
        priority_placement: 0,
        tags: [],
      },
    ];

    renderWithProviders(<MyListingsSection bioType="agent" role="agent" />);

    fireEvent.click(screen.getByRole("button", { name: /off-market/i }));
    expect(screen.getByText("Quiet off-market")).toBeInTheDocument();
    expect(screen.queryByText("Future launch")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTitle(/Add featured badge/i));
    expect(updateListingMutate).toHaveBeenCalledWith({ id: "l-1", updates: { is_featured: true } });
    const priorityInput = screen.getByTitle(/Priority/i);
    fireEvent.change(priorityInput, { target: { value: "20" } });
    fireEvent.blur(priorityInput);
    expect(updateListingMutate).toHaveBeenCalledWith({ id: "l-1", updates: { priority_placement: 10 } });
    fireEvent.click(screen.getByRole("button", { name: /pause listing/i }));
    expect(updateListingMutate).toHaveBeenCalledWith({ id: "l-1", updates: { status: "paused" } });
    fireEvent.click(screen.getByRole("button", { name: /delete listing/i }));
    fireEvent.click(within(screen.getByRole("dialog", { name: /delete this listing/i })).getByRole("button", { name: /^delete$/i }));
    expect(deleteListingMutate).toHaveBeenCalledWith("l-1");
  });
});
