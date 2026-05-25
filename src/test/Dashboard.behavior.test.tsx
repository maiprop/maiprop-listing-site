import { describe, it, expect, vi, beforeEach } from "vitest";
import type React from "react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Dashboard from "@/pages/Dashboard";

const {
  authState,
  subscriptionState,
  quickSaleState,
  listingsState,
  favoritesState,
  requesterViewingsState,
  ownerViewingsState,
  savedSearchesState,
  auctionAlertsState,
  professionalState,
  servicesState,
  leadsState,
  signOutMock,
  updateProfileMock,
  refreshProfileMock,
} = vi.hoisted(() => ({
  authState: {
    loading: false,
    profileLoading: false,
    user: { id: "u-1", email: "casey@example.com" } as Record<string, unknown> | null,
    profile: { id: "p-1", role: "buyer", participant_type: "buyer", first_name: "Casey", verified: true } as Record<string, unknown> | null,
  },
  subscriptionState: { isPro: false },
  quickSaleState: { eligible: false },
  listingsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  favoritesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  requesterViewingsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  ownerViewingsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  savedSearchesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  auctionAlertsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  professionalState: { data: null as Record<string, unknown> | null, isLoading: false },
  servicesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  leadsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  signOutMock: vi.fn().mockResolvedValue(undefined),
  updateProfileMock: vi.fn(),
  refreshProfileMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
  useAuth: () => ({
    ...authState,
    signOut: signOutMock,
    updateProfile: updateProfileMock,
    refreshProfile: refreshProfileMock,
  }),
}));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => subscriptionState }));
vi.mock("@/hooks/useEligibleForQuickSale", () => ({ useEligibleForQuickSale: () => quickSaleState }));
vi.mock("@/hooks/useListings", () => ({ useMyListings: () => listingsState }));
vi.mock("@/hooks/useFavorites", () => ({ useFavorites: () => favoritesState }));
vi.mock("@/hooks/useViewings", () => ({
  useViewings: (scope: string) => (scope === "owner" ? ownerViewingsState : requesterViewingsState),
  useUpdateViewingStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/useSavedSearches", () => ({ useSavedSearches: () => savedSearchesState }));
vi.mock("@/hooks/useAuctionAlerts", () => ({ useAuctionAlerts: () => auctionAlertsState }));
vi.mock("@/hooks/useProfessionalServices", () => ({
  useMyProfessional: () => professionalState,
  useProfessionalServices: () => servicesState,
}));
vi.mock("@/hooks/useConsultations", () => ({
  useMyConsultationRequests: () => leadsState,
  useUpdateConsultationRequest: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: () => ({
      select: function () { return this; },
      eq: function () { return this; },
      order: function () { return this; },
      limit: function () { return this; },
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    }),
  },
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/DashboardPlanCard", () => ({
  DashboardPlanCard: ({ usage }: { usage: Record<string, number> }) => (
    <div data-testid="dashboard-plan-card">Saved searches: {usage.savedSearches}</div>
  ),
}));
vi.mock("@/components/OpenHouseDashboardSection", () => ({ default: () => <div>Open houses section</div> }));
vi.mock("@/components/ProfessionalServicesEditor", () => ({ default: () => <div>Professional services editor</div> }));
vi.mock("@/components/gates/ProGate", () => ({ ProGate: ({ children, feature }: { children?: React.ReactNode; feature?: string }) => <div>{children ?? `Upgrade for ${feature ?? "Pro"}`}</div> }));
vi.mock("@/pages/dashboard/MyListingsSection", () => ({
  MyListingsSection: ({ bioType, role }: { bioType: string | null; role: string }) => <div data-testid="my-listings-section">{bioType}:{role}</div>,
}));
vi.mock("@/pages/dashboard/SavedPropertiesSection", () => ({
  SavedPropertiesSection: ({ favorites }: { favorites: unknown[] }) => <div>Saved properties {favorites.length}</div>,
}));
vi.mock("@/pages/dashboard/ContactsAndLeadsSection", () => ({
  ContactsAndLeadsSection: ({ initialTab }: { initialTab: string }) => <div>CRM {initialTab}</div>,
}));
vi.mock("@/components/dashboard/ProfileCompletionCard", () => ({ ProfileCompletionCard: () => <div>Profile completion</div> }));
vi.mock("@/components/dashboard/BookingCalendarSection", () => ({ BookingCalendarSection: () => <div>Booking calendar</div> }));
vi.mock("@/components/dashboard/BuyerOpenHousesCard", () => ({ BuyerOpenHousesCard: () => <div>Buyer open houses</div> }));
vi.mock("@/components/dashboard/ProfessionalProfileEditor", () => ({ ProfessionalProfileEditor: () => <div>Professional profile editor</div> }));
vi.mock("@/components/dashboard/ProfileEditor", () => ({ ProfileEditor: () => <div>Profile editor</div> }));
vi.mock("@/components/dashboard/SettingsSection", () => ({ SettingsSection: ({ roleLabel }: { roleLabel: string }) => <div>Settings {roleLabel}</div> }));
vi.mock("@/components/dashboard/DashboardSidebar", () => ({
  DashboardSidebar: ({
    navItems,
    onSelect,
    onSignOut,
    displayName,
    roleLabel,
    pendingLeadsCount,
  }: {
    navItems: Array<{ key: string; label: string }>;
    onSelect: (key: string) => void;
    onSignOut: () => void;
    displayName: string;
    roleLabel: string;
    pendingLeadsCount: number;
  }) => (
    <aside>
      <div>{displayName}</div>
      <div>{roleLabel}</div>
      <div>Pending leads {pendingLeadsCount}</div>
      {navItems.map((item) => <button key={item.key} onClick={() => onSelect(item.key)}>{item.label}</button>)}
      <button onClick={onSignOut}>Sign out</button>
    </aside>
  ),
}));
vi.mock("@/components/dashboard/DashboardMobileNav", () => ({ DashboardMobileNav: () => <div data-testid="mobile-nav" /> }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

beforeEach(() => {
  authState.loading = false;
  authState.profileLoading = false;
  authState.user = { id: "u-1", email: "casey@example.com" };
  authState.profile = { id: "p-1", role: "buyer", participant_type: "buyer", first_name: "Casey", verified: true };
  subscriptionState.isPro = false;
  quickSaleState.eligible = false;
  listingsState.data = [];
  favoritesState.data = [];
  requesterViewingsState.data = [];
  ownerViewingsState.data = [];
  savedSearchesState.data = [];
  auctionAlertsState.data = [];
  professionalState.data = null;
  servicesState.data = [];
  leadsState.data = [];
  vi.clearAllMocks();
});

describe("Dashboard behavior", () => {
  it("shows the loading shell while auth and profile are resolving", () => {
    authState.loading = true;

    const { container } = renderWithProviders(<Dashboard />);

    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("offers session recovery and signs out when the user is missing", async () => {
    authState.user = null;

    renderWithProviders(<Dashboard />);

    expect(screen.getByText(/session has expired/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /sign out and try again/i }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalled());
  });

  it("computes buyer overview stats and plan usage from hook data", () => {
    favoritesState.data = [{ id: "f-1" }, { id: "f-2" }];
    savedSearchesState.data = [
      { id: "s-1", email_alerts: true },
      { id: "s-2", email_alerts: false },
    ];
    requesterViewingsState.data = [
      { id: "v-1", status: "confirmed", created_at: new Date().toISOString() },
      { id: "v-2", status: "cancelled", created_at: new Date().toISOString() },
    ];
    auctionAlertsState.data = [{ id: "a-1", active: true }, { id: "a-2", active: false }];

    renderWithProviders(<Dashboard />);

    expect(screen.getByText(/Good morning, Casey/i)).toBeInTheDocument();
    expect(screen.getByText("Saved searches: 2")).toBeInTheDocument();
    expect(screen.getByText("Looking for Property")).toBeInTheDocument();
    expect(screen.getAllByText("Auction Alerts").length).toBeGreaterThan(0);
  });

  it("honors a route tab when it is available for the current role", async () => {
    authState.profile = { id: "p-1", role: "seller", participant_type: "seller", first_name: "Sofia" };
    listingsState.data = [{ id: "l-1", status: "active", title: "Seller home", views_count: 9 }];

    renderWithProviders(<Dashboard />, { initialPath: "/dashboard?tab=listings" });

    expect(await screen.findByTestId("my-listings-section")).toHaveTextContent("seller:seller");
  });

  it("restricts a role switch in progress to settings and labels the account state", () => {
    authState.profile = {
      id: "p-1",
      role: "agent",
      participant_type: "agent",
      first_name: "Alex",
      role_switch_in_progress_at: "2026-05-16T00:00:00Z",
    };

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Switching Account Type")).toBeInTheDocument();
    expect(screen.getByText("Settings Switching Account Type")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Analytics" })).not.toBeInTheDocument();
  });
});
