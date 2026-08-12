import { describe, it, expect, vi, beforeEach } from "vitest";
import type React from "react";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import Dashboard from "@/pages/Dashboard";
import en from "@/locales/en.json";
import el from "@/locales/el.json";

const {
  authState,
  subscriptionState,
  quickSaleState,
  listingsState,
  listingSummaryState,
  ownedListingsState,
  favoritesState,
  requesterViewingsState,
  ownerViewingsState,
  savedSearchesState,
  auctionAlertsState,
  professionalState,
  servicesState,
  leadsState,
  checkoutInvokeMock,
  signOutMock,
  updateProfileMock,
  refreshProfileMock,
  invitationStatusState,
  toastSuccessMock,
  toastErrorMock,
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
  listingSummaryState: {
    data: undefined as Record<string, unknown> | undefined,
    isLoading: false,
  },
  ownedListingsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  favoritesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  requesterViewingsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  ownerViewingsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  savedSearchesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  auctionAlertsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  professionalState: { data: null as Record<string, unknown> | null, isLoading: false },
  servicesState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  leadsState: { data: [] as Array<Record<string, unknown>>, isLoading: false },
  checkoutInvokeMock: vi.fn().mockResolvedValue({ data: { url: "https://stripe.example/trial" }, error: null }),
  signOutMock: vi.fn().mockResolvedValue(undefined),
  updateProfileMock: vi.fn(),
  refreshProfileMock: vi.fn(),
  invitationStatusState: { status: null as string | null },
  toastSuccessMock: vi.fn(),
  toastErrorMock: vi.fn(),
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
vi.mock("@/hooks/useListings", () => ({
  useMyListings: () => listingsState,
  useManageableListingSummary: () => listingSummaryState,
  useActorOwnedListings: () => ownedListingsState,
}));
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
    functions: {
      invoke: checkoutInvokeMock,
    },
    from: (table: string) => ({
      select: function () { return this; },
      eq: function () { return this; },
      order: function () { return this; },
      limit: function () { return this; },
      maybeSingle: vi.fn().mockImplementation(() => Promise.resolve({
        data: table === "invitation_requests" && invitationStatusState.status
          ? { status: invitationStatusState.status }
          : null,
        error: null,
      })),
    }),
  },
}));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/DashboardPlanCard", () => ({
  DashboardPlanCard: ({
    usage,
    hasPaidPromotionCredits,
    loading,
  }: {
    usage: Record<string, number>;
    hasPaidPromotionCredits?: boolean;
    loading?: boolean;
  }) => (
    <div data-testid="dashboard-plan-card">
      <span>Saved searches: {usage.savedSearches}</span>
      <span>Listings: {usage.listings}</span>
      <span>Plan viewings: {usage.viewingsThisMonth}</span>
      <span>Paid promotions: {String(Boolean(hasPaidPromotionCredits))}</span>
      <span>Loading: {String(Boolean(loading))}</span>
    </div>
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
vi.mock("sonner", () => ({ toast: { success: toastSuccessMock, error: toastErrorMock } }));

beforeEach(() => {
  Object.defineProperty(window, "location", { writable: true, value: { href: "http://localhost/dashboard" } });
  authState.loading = false;
  authState.profileLoading = false;
  authState.user = { id: "u-1", email: "casey@example.com" };
  authState.profile = { id: "p-1", role: "buyer", participant_type: "buyer", first_name: "Casey", verified: true };
  subscriptionState.isPro = false;
  subscriptionState.loading = false;
  subscriptionState.refreshSubscription = vi.fn();
  quickSaleState.eligible = false;
  listingsState.data = [];
  listingsState.isLoading = false;
  listingSummaryState.data = undefined;
  listingSummaryState.isLoading = false;
  ownedListingsState.data = [];
  ownedListingsState.isLoading = false;
  favoritesState.data = [];
  requesterViewingsState.data = [];
  ownerViewingsState.data = [];
  savedSearchesState.data = [];
  auctionAlertsState.data = [];
  professionalState.data = null;
  servicesState.data = [];
  leadsState.data = [];
  invitationStatusState.status = null;
  checkoutInvokeMock.mockResolvedValue({ data: { url: "https://stripe.example/trial" }, error: null });
  vi.clearAllMocks();
});

describe("Dashboard behavior", () => {
  it("shows the loading shell while auth and profile are resolving", () => {
    authState.loading = true;

    const { container } = renderWithProviders(<Dashboard />);

    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeTruthy();
  });

  it("keeps the dashboard in its loading shell while signed-in profile details hydrate", () => {
    authState.profileLoading = true;
    authState.profile = null;

    const { container } = renderWithProviders(<Dashboard />);

    expect(container.querySelector(".animate-spin")).toBeTruthy();
    expect(screen.queryByText(/Good morning/i)).not.toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-plan-card")).not.toBeInTheDocument();
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

  it("lets free buyers reach the reviewed investor application flow", () => {
    renderWithProviders(<Dashboard />);

    const applicationLinks = screen.getAllByRole("link", { name: /Apply for Access/i });
    expect(applicationLinks.length).toBeGreaterThanOrEqual(2);
    expect(applicationLinks.every((link) => link.getAttribute("href") === "/investor-dashboard")).toBe(true);
    expect(screen.queryByRole("link", { name: /Upgrade to Pro to apply/i })).not.toBeInTheDocument();
  });

  it("allows buyer Pro accounts to reach the reviewed investor application flow", () => {
    subscriptionState.isPro = true;

    renderWithProviders(<Dashboard />);

    const applicationLinks = screen.getAllByRole("link", { name: /Apply for Access/i });
    expect(applicationLinks.length).toBeGreaterThanOrEqual(2);
    expect(applicationLinks.every((link) => link.getAttribute("href") === "/investor-dashboard")).toBe(true);
    expect(screen.queryByRole("link", { name: /Upgrade to Pro to apply/i })).not.toBeInTheDocument();
  });

  it("starts a one-time 7-day Pro trial from the dashboard CTA", async () => {
    renderWithProviders(<Dashboard />);

    expect(screen.getByText(/Unlock analytics, CRM, AI tools, and Pro workflows/i)).toBeInTheDocument();
    expect(screen.queryByText(/priority ads/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Card required\. After 7 days/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /start 7-day pro trial/i }));

    await waitFor(() =>
      expect(checkoutInvokeMock).toHaveBeenCalledWith("create-checkout", {
        body: {
          plan: "pro",
          audience: "participant",
          billing_cycle: "monthly",
          trial: true,
          checkout_type: "subscription_trial",
          success_url: "/dashboard?checkout=trial_started",
          cancel_url: "/dashboard?checkout=cancelled",
        },
        timeout: 20_000,
      })
    );
    await waitFor(() => expect(window.location.href).toBe("https://stripe.example/trial"));
  });

  it("does not show the dashboard trial CTA to active Pro users", () => {
    subscriptionState.isPro = true;

    renderWithProviders(<Dashboard />);

    expect(screen.queryByRole("button", { name: /start 7-day pro trial/i })).not.toBeInTheDocument();
  });

  it("does not lock the dashboard main area with overflow-hidden scrolling", () => {
    const { container } = renderWithProviders(<Dashboard />);

    const main = container.querySelector("main");
    expect(main).not.toBeNull();
    expect(main?.className).not.toContain("overflow-hidden");
    expect(main?.className).not.toContain("overflow-y-auto");
    expect(main?.className).not.toContain("max-md:h-");
  });

  it("uses the authoritative managed summary while previewing only loaded listing rows", () => {
    authState.profile = { id: "p-1", role: "seller", participant_type: "seller", first_name: "Sofia" };
    listingsState.data = [
      { id: "l-1", status: "active", title: "Athens Flat", city: "Athens", price: 250000, views_count: 9 },
      { id: "l-2", status: "active", title: "Piraeus Loft", city: "Piraeus", price: 310000, views_count: 4 },
      { id: "l-3", status: "active", title: "Chania Villa", city: "Chania", price: 640000, views_count: 12 },
    ];
    listingSummaryState.data = {
      totalListings: 203,
      activeListings: 120,
      totalViews: 9999,
      averageViews: 49,
      averageActiveDays: 31,
      bestListing: null,
    };

    renderWithProviders(<Dashboard />);

    const activeListingsStat = screen.getByText("Active Listings").closest(".glass-card");
    expect(activeListingsStat).not.toBeNull();
    expect(within(activeListingsStat as HTMLElement).getByText("120")).toBeInTheDocument();
    const totalViewsStat = screen.getByText("Total Views").closest(".glass-card");
    expect(totalViewsStat).not.toBeNull();
    expect(within(totalViewsStat as HTMLElement).getByText("9999")).toBeInTheDocument();
    expect(screen.getByText("Athens Flat")).toBeInTheDocument();
    expect(screen.getByText("Piraeus Loft")).toBeInTheDocument();
    expect(screen.getByText("Chania Villa")).toBeInTheDocument();
  });

  it("keeps seller Quick Sale submissions out of agent dashboards", () => {
    authState.profile = { id: "p-1", role: "agent", participant_type: "agent", first_name: "Greca" };

    renderWithProviders(<Dashboard />);

    expect(screen.queryByText("Quick Sale Requests")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /New Request/i })).not.toBeInTheDocument();
  });

  it("uses active listings, not all owned rows, in the plan usage card", () => {
    authState.profile = { id: "p-1", role: "seller", participant_type: "seller", first_name: "Sofia" };
    listingsState.data = [
      { id: "l-1", status: "active", title: "Live flat", views_count: 1 },
      { id: "l-2", status: "draft", title: "Draft flat", views_count: 0 },
      { id: "l-3", status: "paused", title: "Paused flat", views_count: 0 },
    ];
    ownedListingsState.data = listingsState.data;

    renderWithProviders(<Dashboard />);

    expect(screen.getByTestId("dashboard-plan-card")).toHaveTextContent("Listings: 1");
  });

  it("keeps managed organization inventory out of personal plan usage", () => {
    authState.profile = { id: "p-1", role: "agent", participant_type: "agent", first_name: "Greca" };
    const personal = [
      { id: "personal-1", owner_id: "u-1", organization_id: null, status: "active", views_count: 1 },
      { id: "personal-2", owner_id: "u-1", organization_id: null, status: "active", views_count: 1 },
    ];
    listingsState.data = [
      ...personal,
      ...Array.from({ length: 100 }, (_, index) => ({
        id: `managed-${index}`,
        owner_id: "colleague",
        organization_id: "organization-1",
        status: "active",
        views_count: 1,
      })),
    ];
    ownedListingsState.data = personal;
    ownedListingsState.isLoading = true;

    renderWithProviders(<Dashboard />);

    expect(screen.getByTestId("dashboard-plan-card")).toHaveTextContent("Listings: 2");
    expect(screen.getByTestId("dashboard-plan-card")).toHaveTextContent("Loading: true");
  });

  it("counts seller outbound booking requests instead of hosted listing viewings", () => {
    authState.profile = { id: "p-1", role: "seller", participant_type: "seller", first_name: "Sofia" };
    requesterViewingsState.data = [
      { id: "request-1", created_at: new Date().toISOString() },
    ];
    ownerViewingsState.data = [
      { id: "hosted-1", created_at: new Date().toISOString() },
      { id: "hosted-2", created_at: new Date().toISOString() },
    ];

    renderWithProviders(<Dashboard />);

    expect(screen.getByTestId("dashboard-plan-card")).toHaveTextContent("Plan viewings: 1");
  });

  it("counts agent-hosted listing viewings against the agent allowance", () => {
    authState.profile = { id: "p-1", role: "agent", participant_type: "agent", first_name: "Alex" };
    requesterViewingsState.data = [
      { id: "request-1", created_at: new Date().toISOString() },
    ];
    ownerViewingsState.data = [
      { id: "hosted-1", created_at: new Date().toISOString() },
      { id: "hosted-2", created_at: new Date().toISOString() },
    ];

    renderWithProviders(<Dashboard />);

    expect(screen.getByTestId("dashboard-plan-card")).toHaveTextContent("Plan viewings: 2");
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

  it.each([
    ["pending", /application for Quick Sale deal access is under review/i, null],
    ["approved", /Quick Sale application is approved/i, "Complete investor payment"],
    ["rejected", /application was not approved/i, null],
  ] as const)("renders the %s Quick Sale review state without opening the wrong action", async (status, copy, action) => {
    invitationStatusState.status = status;

    renderWithProviders(<Dashboard />);

    expect(await screen.findByText(copy)).toBeInTheDocument();
    if (action) {
      expect(screen.getByRole("link", { name: action })).toHaveAttribute("href", "/investor-dashboard");
    } else {
      expect(screen.queryByRole("link", { name: /Complete investor payment/i })).not.toBeInTheDocument();
    }
  });

  it("explains when mock trial billing is disabled and does not redirect", async () => {
    checkoutInvokeMock.mockResolvedValue({
      data: { error: "trial_mock_billing_disabled" },
      error: null,
    });

    renderWithProviders(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: /start 7-day pro trial/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/requires live Stripe billing/i));
    });
    expect(window.location.href).toBe("http://localhost/dashboard");
  });

  it("uses the Edge Function message when trial checkout returns no URL", async () => {
    checkoutInvokeMock.mockResolvedValue({
      data: { message: "This account already used its trial." },
      error: { message: "non-2xx" },
    });

    renderWithProviders(<Dashboard />);
    fireEvent.click(screen.getByRole("button", { name: /start 7-day pro trial/i }));

    await waitFor(() => {
      expect(toastErrorMock).toHaveBeenCalledWith("This account already used its trial.");
    });
    expect(window.location.href).toBe("http://localhost/dashboard");
  });

  it("refreshes entitlement after the trial return status", async () => {
    const refreshSubscription = vi.fn();
    subscriptionState.refreshSubscription = refreshSubscription;

    renderWithProviders(<Dashboard />, { initialPath: "/dashboard?checkout=trial_started" });

    await waitFor(() => {
      expect(toastSuccessMock).toHaveBeenCalledWith("Your 7-day Pro trial is being activated.");
      expect(refreshSubscription).toHaveBeenCalled();
    });
  });

  it("renders professional service and lead state and opens the unified CRM", async () => {
    authState.profile = { id: "p-pro", role: "professional", participant_type: "professional", first_name: "Nora" };
    professionalState.data = { id: "professional-1" };
    servicesState.data = [{ id: "service-1" }];
    leadsState.data = [
      { id: "lead-1", status: "pending" },
      { id: "lead-2", status: "closed" },
    ];

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("1 service(s) configured.")).toBeInTheDocument();
    expect(screen.getByText("1 new")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /View Leads/i })[0]);
    expect(await screen.findByText("CRM leads")).toBeInTheDocument();
  });

  it("keeps developer accounts on project workflows without a generic trial banner", () => {
    authState.profile = { id: "p-dev", role: "developer", participant_type: "developer", first_name: "Dora" };
    listingsState.data = [{ id: "project-listing", status: "active", title: "Athens launch", views_count: 4 }];

    renderWithProviders(<Dashboard />);

    expect(screen.getByText(/Manage your project listings and showcases/i)).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-trial-cta")).not.toBeInTheDocument();
    expect(screen.getByText(/1 Spotlight and 1 Priority Rank per month/i)).toBeInTheDocument();
    expect(screen.getByText(/Spotlight and Priority credits begin only after paid activation/i)).toBeInTheDocument();
    expect(screen.getByText("Profile completion")).toBeInTheDocument();
  });

  it("keeps English and Greek trial copy aligned with paid promotion activation", () => {
    const english = en.dashboard as typeof en.dashboard & {
      trial?: { subtitle?: string };
      overview: typeof en.dashboard.overview & { developerPro: { trialTerms?: string } };
    };
    const greek = el.dashboard as typeof el.dashboard & {
      trial?: { subtitle?: string };
      overview: typeof el.dashboard.overview & { developerPro: { trialTerms?: string } };
    };

    expect(english.trial?.subtitle).toMatch(/analytics, CRM, AI tools, and Pro workflows/i);
    expect(english.trial?.subtitle).not.toMatch(/priority ads|listing promotions/i);
    expect(english.overview.developerPro.trialTerms).toMatch(/credits begin only after paid activation/i);
    expect(greek.trial?.subtitle).not.toMatch(/priority|spotlight/i);
    expect(greek.overview.developerPro.trialTerms).toMatch(/πιστώσεις Spotlight και Priority.*μόνο μετά.*ενεργοποίηση επί πληρωμή/i);
  });

  it("renders admin controls without consumer plan or trial promotion", () => {
    authState.profile = { id: "p-admin", role: "admin", first_name: "Admin" };

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Admin Dashboard")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Admin/i })).toHaveAttribute("href", "/admin");
    expect(screen.getByTestId("dashboard-plan-card")).toBeInTheDocument();
    expect(screen.queryByTestId("dashboard-trial-cta")).not.toBeInTheDocument();
  });

  it("promotes an eligible buyer to the investor overview without changing their stored role", () => {
    quickSaleState.eligible = true;
    favoritesState.data = [{ id: "saved-deal" }];
    auctionAlertsState.data = [{ id: "alert-1", active: true }];

    renderWithProviders(<Dashboard />);

    expect(screen.getByText("Investor")).toBeInTheDocument();
    expect(screen.getByText(/investment pipeline and deal opportunities/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Open Dashboard/i })).toHaveAttribute("href", "/investor-dashboard");
    expect(screen.getByText(/1 saved - tap to view/i)).toBeInTheDocument();
    expect(screen.queryByText("Quick Sale Access")).not.toBeInTheDocument();
  });

  it("falls back to the authenticated email prefix when profile names are empty", () => {
    authState.profile = { id: "p-blank", role: "buyer", participant_type: "buyer" };
    authState.user = { id: "u-mail", email: "billing-owner@example.com" };

    renderWithProviders(<Dashboard />);

    expect(screen.getAllByText("billing-owner").length).toBeGreaterThan(0);
    expect(screen.getByText(/Good morning, billing-owner/i)).toBeInTheDocument();
  });
});
