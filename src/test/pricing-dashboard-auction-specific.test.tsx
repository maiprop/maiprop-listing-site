import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  usePricingConfigsMock: vi.fn(),
  useAuctionListingsMock: vi.fn(),
  useAuctionsPipelineMock: vi.fn(),
  useProfessionalMock: vi.fn(),
  useProfessionalsMock: vi.fn(),
  useProfessionalServicesMock: vi.fn(),
  useProfessionalAvailabilityMock: vi.fn(),
  useListingsMock: vi.fn(),
  useStartConversationMock: vi.fn(),
  useModalMock: vi.fn(),
  invokeMock: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return {
    ...actual,
    useNavigate: () => mocks.navigateMock,
  };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.useAuthMock(),
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => mocks.useSubscriptionMock(),
}));

vi.mock("@/hooks/usePricingConfigs", () => ({
  usePricingConfigs: () => mocks.usePricingConfigsMock(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: mocks.invokeMock },
    from: vi.fn(() => ({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
    })),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() })),
    removeChannel: vi.fn(),
  },
}));

vi.mock("sonner", () => ({ toast: mocks.toast }));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/gates/ProGate", () => ({
  ProGate: ({ children }: { children?: React.ReactNode }) => <div data-testid="pro-gate">{children}</div>,
}));

vi.mock("@/hooks/useEligibleForQuickSale", () => ({
  useEligibleForQuickSale: () => ({ eligible: false }),
}));
vi.mock("@/hooks/useListings", () => ({
  useListings: (...args: unknown[]) => mocks.useListingsMock(...args),
  useMyListings: () => ({ data: [], isLoading: false }),
}));
vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => ({ data: [], isLoading: false }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useViewings", () => ({ useViewings: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useSavedSearches", () => ({ useSavedSearches: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useAuctionAlerts", () => ({ useAuctionAlerts: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useProfessionalServices", () => ({
  useMyProfessional: () => ({ data: { id: "pro-row" }, isLoading: false }),
  useProfessionalServices: (...args: unknown[]) => mocks.useProfessionalServicesMock(...args),
  useProfessionalAvailability: (...args: unknown[]) => mocks.useProfessionalAvailabilityMock(...args),
}));
vi.mock("@/hooks/useConsultations", () => ({
  useMyConsultationRequests: () => ({
    data: [{ id: "lead-1", status: "pending" }, { id: "lead-2", status: "closed" }],
    isLoading: false,
  }),
}));
vi.mock("@/hooks/usePlanLimits", () => ({
  startOfCurrentMonth: () => new Date("2026-05-01T00:00:00.000Z"),
}));

vi.mock("@/components/DashboardPlanCard", () => ({ DashboardPlanCard: () => <div data-testid="plan-card" /> }));
vi.mock("@/components/OpenHouseDashboardSection", () => ({ default: () => <div data-testid="open-houses-tab" /> }));
vi.mock("@/components/ProfessionalServicesEditor", () => ({ default: () => <div data-testid="services-editor" /> }));
vi.mock("@/components/dashboard/ProfileCompletionCard", () => ({ ProfileCompletionCard: () => <div data-testid="profile-completion" /> }));
vi.mock("@/components/dashboard/BookingCalendarSection", () => ({ BookingCalendarSection: () => <div data-testid="booking-calendar" /> }));
vi.mock("@/components/dashboard/ProfessionalProfileEditor", () => ({
  ProfessionalProfileEditor: () => <div data-testid="professional-profile-editor" />,
}));
vi.mock("@/components/dashboard/ProfileEditor", () => ({ ProfileEditor: () => <div data-testid="profile-editor" /> }));
vi.mock("@/components/dashboard/SettingsSection", () => ({ SettingsSection: () => <div data-testid="settings-section" /> }));
vi.mock("@/pages/dashboard/ContactsAndLeadsSection", () => ({
  ContactsAndLeadsSection: ({ initialTab }: { initialTab: string }) => <div data-testid={`contacts-${initialTab}`} />,
}));
vi.mock("@/pages/dashboard/MyListingsSection", () => ({ MyListingsSection: () => <div data-testid="my-listings" /> }));
vi.mock("@/pages/dashboard/SavedPropertiesSection", () => ({ SavedPropertiesSection: () => <div data-testid="saved-properties" /> }));
vi.mock("@/pages/dashboard/ViewingsTab", () => ({ default: () => <div data-testid="viewings-tab" /> }));
vi.mock("@/pages/dashboard/SavedSearchesTab", () => ({ default: () => <div data-testid="saved-searches-tab" /> }));
vi.mock("@/pages/dashboard/AuctionsTab", () => ({ default: () => <div data-testid="auctions-tab" /> }));
vi.mock("@/pages/dashboard/ProjectsTab", () => ({ default: () => <div data-testid="projects-tab" /> }));
vi.mock("@/pages/dashboard/PortfoliosTab", () => ({ default: () => <div data-testid="portfolios-tab" /> }));
vi.mock("@/pages/dashboard/AnalyticsTab", () => ({ default: () => <div data-testid="analytics-tab" /> }));
vi.mock("@/pages/dashboard/BillingTab", () => ({ default: () => <div data-testid="billing-tab" /> }));
vi.mock("@/pages/dashboard/DataInputTab", () => ({ default: () => <div data-testid="data-input-tab" /> }));

vi.mock("@/hooks/useProfessionals", () => ({
  useProfessional: (...args: unknown[]) => mocks.useProfessionalMock(...args),
  useProfessionals: () => mocks.useProfessionalsMock(),
}));
vi.mock("@/hooks/useProfessionalReviews", () => ({
  useProfessionalReviews: () => ({ data: [{ id: "review-1" }] }),
  computeStats: () => ({ total: 1, avg: 5, distribution: {} }),
}));
vi.mock("@/hooks/useMessages", () => ({
  useStartConversation: () => mocks.useStartConversationMock(),
}));
vi.mock("@/hooks/useModal", () => ({
  useModal: () => mocks.useModalMock(),
}));
vi.mock("@/components/SendMessageModal", () => ({ default: ({ open }: { open: boolean }) => open ? <div data-testid="message-modal" /> : null }));
vi.mock("@/components/BookConsultationModal", () => ({ default: ({ open }: { open: boolean }) => open ? <div data-testid="consult-modal" /> : null }));
vi.mock("@/components/RequestCallbackModal", () => ({ default: ({ open }: { open: boolean }) => open ? <div data-testid="callback-modal" /> : null }));
vi.mock("@/components/AIServiceMatchModal", () => ({ AIServiceMatchModal: () => <div data-testid="ai-match-modal" /> }));
vi.mock("@/components/professionals/ProfileComponents", () => ({
  StarRating: ({ rating }: { rating: number }) => <span data-testid="rating">{rating}</span>,
  ListingGrid: ({ listings }: { listings: { id: string; title?: string }[] }) => (
    <div data-testid="listing-grid">{listings.map((l) => <span key={l.id}>{l.title ?? l.id}</span>)}</div>
  ),
}));
vi.mock("@/components/professionals/ProfessionalOverviewTab", () => ({
  ProfessionalOverviewTab: ({ professionalIsPro, agentListingsCount }: { professionalIsPro: boolean; agentListingsCount: number }) => (
    <div data-testid="professional-overview">{professionalIsPro ? `pro-${agentListingsCount}` : "free"}</div>
  ),
}));
vi.mock("@/components/professionals/ProfessionalServicesTab", () => ({
  ProfessionalServicesTab: ({ onOpenModal }: { onOpenModal: (key: string) => void }) => (
    <button onClick={() => onOpenModal("consult")}>service consult</button>
  ),
}));
vi.mock("@/components/professionals/ProfessionalReviewsTab", () => ({
  ProfessionalReviewsTab: () => <div data-testid="reviews-tab" />,
}));

vi.mock("@/hooks/useAuctionListings", () => ({
  useAuctionListings: (...args: unknown[]) => mocks.useAuctionListingsMock(...args),
}));
vi.mock("@/hooks/useAuctionsPipeline", async () => {
  const actual = await vi.importActual<typeof import("@/hooks/useAuctionsPipeline")>("@/hooks/useAuctionsPipeline");
  return {
    ...actual,
    useAuctionsPipeline: (...args: unknown[]) => mocks.useAuctionsPipelineMock(...args),
  };
});
vi.mock("@/components/auctions/AuctionHero", () => ({ AuctionHero: () => <div data-testid="auction-hero" /> }));
vi.mock("@/components/auctions/AuctionAlertBanner", () => ({
  AuctionAlertBanner: ({ onOpenAlert, onSignInRedirect }: { onOpenAlert: () => void; onSignInRedirect: () => void }) => (
    <div>
      <button onClick={onOpenAlert}>open alert</button>
      <button onClick={onSignInRedirect}>sign in for alerts</button>
    </div>
  ),
}));
vi.mock("@/components/AuctionAlertModal", () => ({
  AuctionAlertModal: ({ open, onClose }: { open: boolean; onClose: () => void }) =>
    open ? <button data-testid="auction-alert-modal" onClick={onClose}>modal open</button> : null,
}));
vi.mock("@/components/auctions/AuctionCard", () => ({
  AuctionCard: ({ a, onToggleFav }: { a: { id: string; title: string }; onToggleFav: (id: string, fav: boolean) => void }) => (
    <button data-testid="auction-card" onClick={() => onToggleFav(a.id, false)}>{a.title}</button>
  ),
}));
vi.mock("@/components/auctions/AuctionFiltersPanel", () => ({
  AuctionFiltersPanel: ({ showFilters, clearFilters }: { showFilters: boolean; clearFilters: () => void }) =>
    showFilters ? <button onClick={clearFilters}>clear panel filters</button> : null,
}));
vi.mock("@/components/auctions/AuctionPagination", () => ({
  AuctionPagination: ({ setCurrentPage }: { setCurrentPage: (page: number) => void }) => (
    <button onClick={() => setCurrentPage(2)}>page two</button>
  ),
}));
vi.mock("@/components/MapView", () => ({
  MapView: ({ onPolygonFilter }: { onPolygonFilter: (ids: Set<string>) => void }) => (
    <button data-testid="map-view" onClick={() => onPolygonFilter(new Set(["auction-1"]))}>map polygon</button>
  ),
}));

vi.mock("@/components/property/PropertyGallery", () => ({
  default: ({ onFavorite, onShare }: { onFavorite: () => void; onShare: () => void }) => (
    <div>
      <button onClick={onFavorite}>save auction</button>
      <button onClick={onShare}>share auction</button>
    </div>
  ),
}));
vi.mock("@/components/PropertyValuation", () => ({ default: () => <div data-testid="property-valuation" /> }));
vi.mock("@/components/property/PropertyValuationLockedCard", () => ({
  PropertyValuationLockedCard: () => <div data-testid="property-valuation-locked" />,
}));
vi.mock("@/components/property/PropertyReportCard", () => ({
  PropertyReportCard: ({ listingId }: { listingId: string }) => <div data-testid="property-report-card">{listingId}</div>,
}));
vi.mock("@/components/property/PropertyScoresSection", () => ({ PropertyScoresSection: () => <div data-testid="scores" /> }));
vi.mock("@/components/PropertyMiniMap", () => ({ default: () => <div data-testid="mini-map" /> }));
vi.mock("@/components/NeighbourhoodReport", () => ({ default: () => <div data-testid="neighbourhood" /> }));
vi.mock("@/components/AIAssistantWidget", () => ({ default: () => <div data-testid="ai-assistant" /> }));

const professional = (overrides: Record<string, unknown> = {}) => ({
  id: "pro-1",
  user_id: "pro-user-1",
  display_name: "Nora Notary",
  title: "Real Estate Lawyer",
  category: "lawyer",
  city: "Athens",
  avatar_url: null,
  rating: 4.5,
  reviews_count: 3,
  verified: true,
  hourly_rate: 80,
  experience_years: 7,
  specialties: ["Contracts"],
  languages: ["English"],
  license_number: "LAW-1",
  website_url: "https://example.com",
  video_link: null,
  projects_count: 11,
  average_deal_size: null,
  average_portfolio_asset_size: null,
  subscription_tier: "free",
  ...overrides,
});

const auction = (overrides: Record<string, unknown> = {}) => ({
  id: "auction-1",
  title: "Athens Auction Flat",
  city: "Athens",
  region: "Attica",
  address: "1 Test Street",
  auction_date: "2026-06-01T10:00:00.000Z",
  auction_starting_bid: 150000,
  price: 150000,
  sqm: 80,
  year_built: 2002,
  property_type: "apartment",
  latitude: 37.98,
  longitude: 23.72,
  website_url: "https://eauction.example/listing",
  tags: ["ownership:partial", "ownership_pct:50"],
  ...overrides,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.navigateMock.mockReset();
  mocks.invokeMock.mockResolvedValue({ data: { url: "https://stripe.example/checkout" }, error: null });
  mocks.useAuthMock.mockReturnValue({
    user: null,
    profile: null,
    loading: false,
    profileLoading: false,
    signOut: vi.fn(),
    updateProfile: vi.fn(),
    refreshProfile: vi.fn(),
  });
  mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, refreshSubscription: vi.fn() });
  mocks.usePricingConfigsMock.mockReturnValue({ data: {} });
  mocks.useProfessionalMock.mockReturnValue({ data: null, isLoading: false });
  mocks.useProfessionalsMock.mockReturnValue({ data: [], isLoading: false });
  mocks.useProfessionalServicesMock.mockReturnValue({ data: [], isLoading: false });
  mocks.useProfessionalAvailabilityMock.mockReturnValue({ data: [], isLoading: false });
  mocks.useListingsMock.mockReturnValue({ data: [], isLoading: false });
  mocks.useStartConversationMock.mockReturnValue({ mutateAsync: vi.fn().mockResolvedValue("conv-1"), isPending: false });
  mocks.useModalMock.mockReturnValue({ isOpen: vi.fn(() => false), open: vi.fn(), close: vi.fn() });
  mocks.useAuctionListingsMock.mockReturnValue({ data: [], isLoading: false });
  mocks.useAuctionsPipelineMock.mockReturnValue({
    isPro: false,
    isMaiPropOsUser: false,
    isLoading: false,
    error: null,
    cityOptions: ["All Cities", "Athens"],
    roundOptions: [{ value: "", label: "All Rounds" }],
    visibleFiltered: [],
    polygonFilteredCount: 0,
    paginated: [],
    totalPages: 1,
    thisWeek: 0,
    avgBid: 0,
    activeFilterCount: 0,
    totalRaw: 0,
    mapListings: [],
    mappableCount: 0,
  });
  Object.defineProperty(window, "open", { writable: true, value: vi.fn() });
  Object.defineProperty(window, "location", {
    writable: true,
    value: { href: "http://localhost/" },
  });
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    share: undefined,
  });
});

describe("Pricing focused page behavior", () => {
  it("switches annual/monthly billing and sends the selected audience plan to checkout", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "agent@example.com" },
      profile: { role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
    });
    mocks.usePricingConfigsMock.mockReturnValue({
      data: {
        agent_basic: { label: "DB Agent Plus", description: "DB plan", amount: 200, unit: "monthly" },
      },
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=agent" });

    expect(await screen.findByText("DB Agent Plus")).toBeInTheDocument();
    expect(screen.getByText(/200/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: /Annual/i })[0]);
    expect(screen.getByText(/167/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Get Agent Pro/i }));
    await waitFor(() =>
      expect(mocks.invokeMock).toHaveBeenCalledWith("create-checkout", {
        body: { plan: "agent_basic", billing_cycle: "annual" },
      }),
    );
  });

  it("shows current Pro state for the matching audience and opens the billing portal", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-pro", email: "pro@example.com" },
      profile: { role: "professional", participant_type: "professional" },
      loading: false,
      profileLoading: false,
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: true, loading: false, refreshSubscription: vi.fn() });
    mocks.invokeMock.mockResolvedValue({ data: { url: "https://stripe.example/portal" }, error: null });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=professional" });

    expect(await screen.findByText("Your Plan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Manage Subscription/i }));

    await waitFor(() => expect(mocks.invokeMock).toHaveBeenCalledWith("customer-portal", {}));
    expect(window.open).toHaveBeenCalledWith("https://stripe.example/portal", "_blank");
  });
});

describe("Dashboard focused page behavior", () => {
  it("recovers from lost session by signing out and returning home", async () => {
    const signOut = vi.fn().mockResolvedValue(undefined);
    mocks.useAuthMock.mockReturnValue({
      user: null,
      profile: null,
      loading: false,
      profileLoading: false,
      signOut,
      updateProfile: vi.fn(),
      refreshProfile: vi.fn(),
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");

    renderWithProviders(
      <Routes>
        <Route path="/dashboard/:section?" element={<Dashboard />} />
      </Routes>,
      { initialPath: "/dashboard" },
    );

    fireEvent.click(await screen.findByRole("button", { name: /sign out and try again/i }));
    await waitFor(() => expect(signOut).toHaveBeenCalled());
    expect(mocks.navigateMock).toHaveBeenCalledWith("/");
  });

  it("opens the professional leads section from the overview CTA", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-pro", email: "pro@example.com" },
      profile: { role: "professional", participant_type: "professional", display_name: "Nora" },
      loading: false,
      profileLoading: false,
      signOut: vi.fn(),
      updateProfile: vi.fn(),
      refreshProfile: vi.fn(),
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: true, loading: false });
    const { default: Dashboard } = await import("@/pages/Dashboard");

    renderWithProviders(
      <Routes>
        <Route path="/dashboard/:section?" element={<Dashboard />} />
      </Routes>,
      { initialPath: "/dashboard" },
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /View Leads/i }))[0]);
    expect(await screen.findByTestId("contacts-leads")).toBeInTheDocument();
  });

  it("routes a pro seller through dashboard sections and overview CTAs", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-seller", email: "seller@example.com" },
      profile: { role: "seller", participant_type: "seller", display_name: "Selina" },
      loading: false,
      profileLoading: false,
      signOut: vi.fn(),
      updateProfile: vi.fn(),
      refreshProfile: vi.fn(),
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: true, loading: false });
    const { default: Dashboard } = await import("@/pages/Dashboard");

    renderWithProviders(
      <Routes>
        <Route path="/dashboard/:section?" element={<Dashboard />} />
      </Routes>,
      { initialPath: "/dashboard" },
    );

    fireEvent.click(await screen.findByRole("button", { name: /Create Listing/i }));
    expect(await screen.findByTestId("my-listings")).toBeInTheDocument();

    for (const [label, testId] of [
      [/Saved/i, "saved-properties"],
      [/Messages/i, null],
      [/Viewings/i, "viewings-tab"],
      [/dashNav\.openHouses/i, "open-houses-tab"],
      [/dashNav\.billing/i, "billing-tab"],
      [/dashNav\.profile/i, "profile-editor"],
      [/dashNav\.settings/i, "settings-section"],
    ] as const) {
      fireEvent.click(screen.getAllByRole("button", { name: label })[0]);
      if (testId) expect(await screen.findByTestId(testId)).toBeInTheDocument();
    }
  });

  it("routes an admin through every internal dashboard tab and external deal-flow link", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "admin-1", email: "admin@example.com" },
      profile: { role: "admin", participant_type: "admin", display_name: "Ada", verified: true },
      loading: false,
      profileLoading: false,
      signOut: vi.fn(),
      updateProfile: vi.fn(),
      refreshProfile: vi.fn(),
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: true, loading: false });
    const { default: Dashboard } = await import("@/pages/Dashboard");

    renderWithProviders(
      <Routes>
        <Route path="/dashboard/:section?" element={<Dashboard />} />
      </Routes>,
      { initialPath: "/dashboard" },
    );

    expect((await screen.findAllByRole("link", { name: /dashNav\.investorDashboard/i }))[0]).toHaveAttribute("href", "/investor-dashboard");

    for (const [label, testId] of [
      [/dashNav\.myListings/i, "my-listings"],
      [/dashNav\.analytics/i, "analytics-tab"],
      [/dashNav\.saved$/i, "saved-properties"],
      [/dashNav\.savedSearches/i, "saved-searches-tab"],
      [/dashNav\.messages/i, null],
      [/dashNav\.viewings/i, "viewings-tab"],
      [/dashNav\.auctionAlerts/i, "auctions-tab"],
      [/dashNav\.openHouses/i, "open-houses-tab"],
      [/dashNav\.myServices/i, "services-editor"],
      [/dashNav\.booking/i, "booking-calendar"],
      [/dashNav\.leads/i, "contacts-leads"],
      [/dashNav\.contacts/i, "contacts-contacts"],
      [/dashNav\.projects/i, "projects-tab"],
      [/dashNav\.portfolios/i, "portfolios-tab"],
      [/dashNav\.dataInput/i, "data-input-tab"],
      [/dashNav\.billing/i, "billing-tab"],
      [/dashNav\.profile/i, "profile-editor"],
      [/dashNav\.settings/i, "settings-section"],
    ] as const) {
      fireEvent.click(screen.getAllByRole("button", { name: label })[0]);
      if (testId) expect(await screen.findByTestId(testId)).toBeInTheDocument();
    }
  }, 10000);

  it("honors dashboard query tabs for billing", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "buyer@example.com" },
      profile: { role: "buyer", participant_type: "buyer", display_name: "Bia" },
      loading: false,
      profileLoading: false,
      signOut: vi.fn(),
      updateProfile: vi.fn(),
      refreshProfile: vi.fn(),
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");

    renderWithProviders(
      <Routes>
        <Route path="/dashboard/:section?" element={<Dashboard />} />
      </Routes>,
      { initialPath: "/dashboard?tab=billing" },
    );

    expect(await screen.findByTestId("billing-tab")).toBeInTheDocument();
  });

  it("honors a route section change to settings", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-1", email: "buyer@example.com" },
      profile: { role: "buyer", participant_type: "buyer", display_name: "Bia" },
      loading: false,
      profileLoading: false,
      signOut: vi.fn(),
      updateProfile: vi.fn(),
      refreshProfile: vi.fn(),
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");

    renderWithProviders(
      <Routes>
        <Route path="/dashboard/:section?" element={<Dashboard />} />
      </Routes>,
      { initialPath: "/dashboard/settings" },
    );

    expect(await screen.findByTestId("settings-section")).toBeInTheDocument();
  });
});

describe("ProfessionalProfile focused page behavior", () => {
  it("keeps free profiles on public contact details only", async () => {
    mocks.useProfessionalMock.mockReturnValue({ data: professional(), isLoading: false });
    const { default: ProfessionalProfile } = await import("@/pages/ProfessionalProfile");

    renderWithProviders(
      <Routes>
        <Route path="/professionals/:id" element={<ProfessionalProfile />} />
      </Routes>,
      { initialPath: "/professionals/pro-1" },
    );

    expect((await screen.findAllByText(/contact details/i)).length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: /Book Consultation/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Send Inquiry/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^services$/i })).not.toBeInTheDocument();
  });

  it("shows pro-only tabs and starts an authenticated chat for Pro profiles", async () => {
    const mutateAsync = vi.fn().mockResolvedValue("conversation-123");
    mocks.useAuthMock.mockReturnValue({
      user: { id: "viewer-1" },
      profile: { role: "buyer" },
      loading: false,
      profileLoading: false,
    });
    mocks.useProfessionalMock.mockReturnValue({
      data: professional({ subscription_tier: "pro", category: "real_estate_agent", display_name: "Ava Agent" }),
      isLoading: false,
    });
    mocks.useListingsMock.mockReturnValue({
      data: [
        { id: "sale-1", title: "Sale one", listing_type: "sale", property_type: "apartment", price: 300000, city: "Athens" },
        { id: "rent-1", title: "Rent one", listing_type: "rent", property_type: "apartment", price: 1200, city: "Athens" },
      ],
      isLoading: false,
    });
    mocks.useStartConversationMock.mockReturnValue({ mutateAsync, isPending: false });
    const { default: ProfessionalProfile } = await import("@/pages/ProfessionalProfile");

    renderWithProviders(
      <Routes>
        <Route path="/professionals/:id" element={<ProfessionalProfile />} />
      </Routes>,
      { initialPath: "/professionals/pro-1" },
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /^Chat$/i }))[0]);
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledWith({ other_user_id: "pro-user-1" }));
    expect(mocks.navigateMock).toHaveBeenCalledWith("/messages", { state: { openConversationId: "conversation-123" } });

    fireEvent.click(screen.getByRole("button", { name: /listings/i }));
    expect(await screen.findByText("Sale one")).toBeInTheDocument();
    expect(screen.getByText("Rent one")).toBeInTheDocument();
  });

  it("redirects anonymous viewers to login before professional inquiry, booking, or callback actions", async () => {
    const modalOpen = vi.fn();
    mocks.useModalMock.mockReturnValue({ isOpen: vi.fn(() => false), open: modalOpen, close: vi.fn() });
    mocks.useProfessionalMock.mockReturnValue({
      data: professional({ subscription_tier: "pro", display_name: "Nora Pro" }),
      isLoading: false,
    });
    const { default: ProfessionalProfile } = await import("@/pages/ProfessionalProfile");

    renderWithProviders(
      <Routes>
        <Route path="/professionals/:id" element={<ProfessionalProfile />} />
      </Routes>,
      { initialPath: "/professionals/pro-1" },
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /Send Inquiry/i }))[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Book Consultation/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Request Callback/i }));

    expect(modalOpen).not.toHaveBeenCalled();
    expect(mocks.navigateMock).toHaveBeenCalledWith("/login", {
      state: { from: { pathname: "/professionals/pro-1" } },
    });
    expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to send an inquiry.");
    expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to book a consultation.");
    expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to request a callback.");
  });
});

describe("Auctions focused page behavior", () => {
  it("toggles filters, map mode, polygon filters, alerts, and anonymous favorite redirects", async () => {
    mocks.useAuctionsPipelineMock.mockReturnValue({
      isPro: false,
      isMaiPropOsUser: false,
      isLoading: false,
      error: null,
      cityOptions: ["All Cities", "Athens"],
      roundOptions: [{ value: "", label: "All Rounds" }],
      visibleFiltered: [auction()],
      polygonFilteredCount: 1,
      paginated: [auction()],
      totalPages: 1,
      thisWeek: 1,
      avgBid: 150000,
      activeFilterCount: 1,
      totalRaw: 100,
      mapListings: [auction()],
      mappableCount: 1,
    });
    const { default: Auctions } = await import("@/pages/Auctions");

    renderWithProviders(<Auctions />, { initialPath: "/auctions?city=Athens" });

    fireEvent.click((await screen.findAllByRole("button", { name: /Filters/i }))[0]);
    expect(screen.getByRole("button", { name: /clear panel filters/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /open alert/i }));
    expect(screen.getByTestId("auction-alert-modal")).toBeInTheDocument();

    fireEvent.click(screen.getByTestId("auction-card"));
    expect(mocks.navigateMock).toHaveBeenCalledWith("/login");

    fireEvent.click(screen.getAllByRole("button", { name: /Map/i })[0]);
    fireEvent.click(await screen.findByTestId("map-view"));
    await waitFor(() => {
      const call = mocks.useAuctionsPipelineMock.mock.calls.at(-1)?.[0] as { polygonFilterIds?: Set<string> } | undefined;
      expect(call?.polygonFilterIds?.has("auction-1")).toBe(true);
    });
  });

  it("renders safe external eAuction links and omits unsafe URLs", async () => {
    mocks.useAuctionListingsMock.mockReturnValue({
      data: [auction({ website_url: "javascript:alert(1)" })],
      isLoading: false,
    });
    const { default: AuctionDetail } = await import("@/pages/AuctionDetail");

    const { rerender } = renderWithProviders(
      <Routes>
        <Route path="/auction/:id" element={<AuctionDetail />} />
      </Routes>,
      { initialPath: "/auction/auction-1" },
    );

    expect((await screen.findAllByText("Athens Auction Flat")).length).toBeGreaterThan(0);
    expect(screen.queryByRole("link", { name: /Open eAuction/i })).not.toBeInTheDocument();

    mocks.useAuctionListingsMock.mockReturnValue({
      data: [auction({ website_url: "https://eauction.example/listing" })],
      isLoading: false,
    });
    rerender(
      <Routes>
        <Route path="/auction/:id" element={<AuctionDetail />} />
      </Routes>,
    );

    const links = await screen.findAllByRole("link", { name: /Open eAuction/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "https://eauction.example/listing");
  });

  it("keeps auction detail valuation Pro-gated and renders the property report card", async () => {
    mocks.useAuctionListingsMock.mockReturnValue({
      data: [auction()],
      isLoading: false,
    });
    const { default: AuctionDetail } = await import("@/pages/AuctionDetail");

    const { rerender } = renderWithProviders(
      <Routes>
        <Route path="/auction/:id" element={<AuctionDetail />} />
      </Routes>,
      { initialPath: "/auction/auction-1" },
    );

    expect(await screen.findByTestId("property-valuation-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("property-valuation")).not.toBeInTheDocument();
    expect(screen.getByTestId("property-report-card")).toHaveTextContent("auction-1");

    mocks.useSubscriptionMock.mockReturnValue({ isPro: true, loading: false, refreshSubscription: vi.fn() });
    rerender(
      <Routes>
        <Route path="/auction/:id" element={<AuctionDetail />} />
      </Routes>,
    );

    expect(await screen.findByTestId("property-valuation")).toBeInTheDocument();
    expect(screen.queryByTestId("property-valuation-locked")).not.toBeInTheDocument();
    expect(screen.getByTestId("property-report-card")).toBeInTheDocument();
  });
});
