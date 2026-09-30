import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { Route, Routes, useSearchParams } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  navigateMock: vi.fn(),
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  usePricingConfigsMock: vi.fn(),
  useAuctionListingsMock: vi.fn(),
  fetchAuctionListingByIdMock: vi.fn(),
  useAuctionsPipelineMock: vi.fn(),
  useProfessionalMock: vi.fn(),
  useProfessionalsMock: vi.fn(),
  useProfessionalServicesMock: vi.fn(),
  useProfessionalAvailabilityMock: vi.fn(),
  useListingsMock: vi.fn(),
  useStartConversationMock: vi.fn(),
  useModalMock: vi.fn(),
  invokeMock: vi.fn(),
  toast: {
    success: vi.fn(() => "checkout-toast-id"),
    error: vi.fn(),
    info: vi.fn(() => "unrelated-toast-id"),
    dismiss: vi.fn(),
  },
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
  useActorOwnedListings: () => ({ data: [], isLoading: false }),
  useManageableListingSummary: () => ({ data: null, isLoading: false }),
}));
vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => ({ data: [], isLoading: false }),
  useFavoriteMembership: () => ({ data: [], isLoading: false }),
  useToggleFavorite: () => ({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useViewings", () => ({
  useViewings: () => ({ data: [], isLoading: false }),
  useUpdateViewingStatus: () => ({ mutate: vi.fn(), isPending: false }),
}));
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
  useUpdateConsultationRequest: () => ({ mutate: vi.fn(), isPending: false }),
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
  useRelatedProfessionals: () => mocks.useProfessionalsMock(),
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
  fetchAuctionListingById: (...args: unknown[]) => mocks.fetchAuctionListingByIdMock(...args),
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
  id: "88888888-8888-4888-8888-888888888888",
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

function pricingSession(userId: string, sessionId: string, tokenVersion = "one") {
  const encode = (value: Record<string, unknown>) => btoa(JSON.stringify(value))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
  return {
    access_token: [
      encode({ alg: "none", typ: "JWT" }),
      encode({ session_id: sessionId, token_version: tokenVersion }),
      encode({ signature: "fixture" }),
    ].join("."),
    user: { id: userId },
  };
}

function ReplacePricingSearch({ next }: { next: string }) {
  const [, setSearchParams] = useSearchParams();
  return (
    <button type="button" onClick={() => setSearchParams(new URLSearchParams(next))}>
      replace pricing search
    </button>
  );
}

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
  mocks.usePricingConfigsMock.mockReturnValue({
    data: {
      pro: {
        label: "Pro Plan",
        description: "Participant plan",
        amount: 29,
        currency: "EUR",
        unit: "monthly",
        audience: "participant",
        stripePriceMonthly: "price_participant_month",
        stripePriceAnnual: "price_participant_year",
      },
      agent_basic: {
        label: "Agent Pro",
        description: "Agent plan",
        amount: 149,
        currency: "EUR",
        unit: "monthly",
        audience: "agent",
        stripePriceMonthly: "price_agent_month",
        stripePriceAnnual: "price_agent_year",
      },
      developer_pro: {
        label: "Developer Pro",
        description: "Developer plan",
        amount: 129,
        currency: "EUR",
        unit: "monthly",
        audience: "developer",
        stripePriceMonthly: "price_developer_month",
        stripePriceAnnual: "price_developer_year",
      },
      professional_basic: {
        label: "Professional Pro",
        description: "Professional plan",
        amount: 69,
        currency: "EUR",
        unit: "monthly",
        audience: "professional",
        stripePriceMonthly: "price_professional_month",
        stripePriceAnnual: "price_professional_year",
      },
    },
    isLoading: false,
    isError: false,
  });
  mocks.fetchAuctionListingByIdMock.mockResolvedValue(null);
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
        agent_basic: {
          label: "DB Agent Plus",
          description: "DB plan",
          amount: 200,
          currency: "EUR",
          unit: "monthly",
          audience: "agent",
          stripePriceMonthly: "price_agent_month",
          stripePriceAnnual: "price_agent_year",
        },
      },
      isLoading: false,
      isError: false,
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
        timeout: 20_000,
      }),
    );
  });

  it("fails closed when the pricing catalog cannot be loaded", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-agent", email: "agent@example.com" },
      profile: { role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
    });
    mocks.usePricingConfigsMock.mockReturnValue({
      data: {},
      isLoading: false,
      isError: true,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=agent" });

    const unavailable = await screen.findByRole("button", { name: /Pricing unavailable/i });
    expect(unavailable).toBeDisabled();
    expect(screen.getByText(/Pricing is temporarily unavailable/i)).toBeInTheDocument();
    expect(mocks.invokeMock).not.toHaveBeenCalledWith("create-checkout", expect.anything());
  });

  it("does not invent a checkout mapping when the selected catalog row is incomplete", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-agent", email: "agent@example.com" },
      profile: { role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
    });
    mocks.usePricingConfigsMock.mockReturnValue({
      data: {
        agent_basic: {
          label: "Agent Pro",
          description: "Agent plan",
          amount: 149,
          currency: "EUR",
          unit: "monthly",
          audience: "developer",
          stripePriceMonthly: "price_wrong_audience",
        },
      },
      isLoading: false,
      isError: false,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=agent" });

    expect(await screen.findByRole("button", { name: /Plan unavailable/i })).toBeDisabled();
    expect(mocks.invokeMock).not.toHaveBeenCalledWith("create-checkout", expect.anything());
  });

  it("does not let a logged-in user start checkout for a different account type", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-agent", email: "agent@example.com" },
      profile: { role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=developer" });

    fireEvent.click(await screen.findByRole("button", { name: /Switch account type first/i }));

    expect(mocks.invokeMock).not.toHaveBeenCalledWith(
      "create-checkout",
      expect.anything(),
    );
    expect(mocks.toast.info).toHaveBeenCalledWith(
      "Switch your account type before buying Developer Pro.",
    );
    expect(mocks.navigateMock).toHaveBeenCalledWith("/dashboard/settings");
  });

  it("shows current Pro state for the matching audience and opens the billing portal", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-pro", email: "pro@example.com" },
      profile: { role: "professional", participant_type: "professional" },
      loading: false,
      profileLoading: false,
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: true, loading: false, hasStripeBilling: true, refreshSubscription: vi.fn() });
    mocks.invokeMock.mockResolvedValue({ data: { url: "https://stripe.example/portal" }, error: null });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=professional" });

    expect(await screen.findByText("Your Plan")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Manage Subscription/i }));

    await waitFor(() => expect(mocks.invokeMock).toHaveBeenCalledWith("customer-portal", { timeout: 20_000 }));
    expect(window.open).toHaveBeenCalledWith("https://stripe.example/portal", "_blank");
  });

  it("does not open Stripe portal for manually managed Pro access", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-managed", email: "managed@example.com" },
      profile: { role: "professional", participant_type: "professional" },
      loading: false,
      profileLoading: false,
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: true, loading: false, hasStripeBilling: false, refreshSubscription: vi.fn() });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=professional" });

    fireEvent.click(await screen.findByRole("button", { name: /Manage Subscription/i }));

    expect(mocks.invokeMock).not.toHaveBeenCalledWith("customer-portal", expect.anything());
    expect(mocks.toast.info).toHaveBeenCalledWith("This plan is managed outside Stripe billing.");
  });

  it("sends anonymous plan selection to signup without calling Stripe", async () => {
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=participant" });
    fireEvent.click(await screen.findByRole("button", { name: /^Get Started$/i }));

    expect(mocks.navigateMock).toHaveBeenCalledWith("/signup");
    expect(mocks.invokeMock).not.toHaveBeenCalledWith("create-checkout", expect.anything());
  });

  it.each([
    ["investor", "Apply for Access", "/investor-dashboard"],
    ["institutional", "Talk to Sales", "/contact"],
  ] as const)("routes %s invite-only pricing to its approval flow", async (audience, cta, route) => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: `u-${audience}`, email: `${audience}@example.com` },
      profile: { role: audience, participant_type: audience },
      loading: false,
      profileLoading: false,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: `/pricing?audience=${audience}` });
    fireEvent.click(await screen.findByRole("button", { name: new RegExp(cta, "i") }));

    expect(mocks.navigateMock).toHaveBeenCalledWith(route);
    expect(mocks.invokeMock).not.toHaveBeenCalledWith("create-checkout", expect.anything());
  });

  it("surfaces the server checkout reason and never redirects without a URL", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-buyer", email: "buyer@example.com" },
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    });
    mocks.invokeMock.mockResolvedValue({
      data: { error: "Stripe price is not configured for this plan." },
      error: null,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=participant" });
    fireEvent.click(await screen.findByRole("button", { name: /Get Pro Plan/i }));

    await waitFor(() => {
      expect(mocks.toast.error).toHaveBeenCalledWith("Stripe price is not configured for this plan.");
    });
    expect(window.location.href).toBe("http://localhost/");
  });

  it("uses a safe fallback for non-Error checkout failures", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-agent", email: "agent@example.com" },
      profile: { role: "agent", participant_type: "agent" },
      loading: false,
      profileLoading: false,
    });
    mocks.invokeMock.mockRejectedValue("network aborted");
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=agent" });
    fireEvent.click(await screen.findByRole("button", { name: /Get Agent Pro/i }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Could not start checkout"));
  });

  it("surfaces portal failures without opening an invalid destination", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-pro", email: "pro@example.com" },
      profile: { role: "professional", participant_type: "professional" },
      loading: false,
      profileLoading: false,
    });
    mocks.useSubscriptionMock.mockReturnValue({
      isPro: true,
      loading: false,
      hasStripeBilling: true,
      refreshSubscription: vi.fn(),
    });
    mocks.invokeMock.mockResolvedValue({ data: null, error: { message: "Portal unavailable" } });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=professional" });
    fireEvent.click(await screen.findByRole("button", { name: /Manage Subscription/i }));

    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Portal unavailable"));
    expect(window.open).not.toHaveBeenCalled();
  });

  it("preserves Checkout reconciliation until the returning user's auth is restored", async () => {
    const { default: Pricing } = await import("@/pages/Pricing");
    const refreshSubscription = vi.fn().mockResolvedValue({
      status: "pending", checkoutSessionId: "cs_test_delayed_auth", userId: "returning-user", reason: "pending",
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, refreshSubscription });
    mocks.useAuthMock.mockReturnValue({ user: null, profile: null, loading: true, profileLoading: true });
    const view = renderWithProviders(<Pricing />, {
      initialPath: "/pricing?checkout=success&session_id=cs_test_delayed_auth",
    });
    expect(refreshSubscription).not.toHaveBeenCalled();
    mocks.useAuthMock.mockReturnValue({
      user: { id: "returning-user" }, profile: { role: "buyer" }, loading: false, profileLoading: false,
    });
    view.rerender(<Pricing />);
    await waitFor(() => expect(refreshSubscription).toHaveBeenCalledWith("cs_test_delayed_auth"));
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
    expect(await screen.findByText(/subscription is not confirmed yet/i)).toBeInTheDocument();
  });

  it.each([
    ["/pricing?checkout=success&billing_mode=mock", "info", /Mock checkout completed/i],
    ["/pricing?checkout=cancelled", "info", /Checkout cancelled/i],
  ] as const)("handles the Stripe return state for %s", async (initialPath, toastKind, message) => {
    mocks.useAuthMock.mockReturnValue({ user: { id: "returning-user" }, profile: null, loading: false, profileLoading: false });
    const refreshSubscription = vi.fn();
    mocks.useSubscriptionMock.mockReturnValue({
      isPro: false,
      loading: false,
      hasStripeBilling: false,
      refreshSubscription,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath });

    await waitFor(() => expect(mocks.toast[toastKind]).toHaveBeenCalledWith(expect.stringMatching(message)));
    expect(refreshSubscription).not.toHaveBeenCalled();
  });

  it("keeps an exact pending checkout identity for a manual retry", async () => {
    mocks.useAuthMock.mockReturnValue({ user: { id: "returning-user" }, profile: { role: "buyer", participant_type: "buyer" }, loading: false, profileLoading: false });
    const refreshSubscription = vi.fn()
      .mockResolvedValueOnce({ status: "pending", checkoutSessionId: "cs_test_pricing_return", userId: "returning-user", reason: "pending" })
      .mockResolvedValueOnce({
        status: "verified", checkoutSessionId: "cs_test_pricing_return", userId: "returning-user",
        receipt: {
          checkout_session_id: "cs_test_pricing_return", user_id: "returning-user", kind: "subscription",
          product_id: "prod_participant", plan_key: "pro", audience: "participant", status: "active",
          subscription_end: "2099-01-01T00:00:00.000Z",
        },
      });
    mocks.useSubscriptionMock.mockReturnValue({
      isPro: false,
      loading: false,
      hasStripeBilling: false,
      refreshSubscription,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, {
      initialPath: "/pricing?checkout=success&session_id=cs_test_pricing_return",
    });

    expect(await screen.findByText(/subscription is not confirmed yet/i)).toBeInTheDocument();
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /Check again/i }));
    expect(await screen.findByText(/Subscription confirmed/i)).toBeInTheDocument();
    expect(refreshSubscription).toHaveBeenCalledTimes(2);
    expect(refreshSubscription).toHaveBeenLastCalledWith("cs_test_pricing_return");
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(/Subscription confirmed/i));
    expect(mocks.toast.success).not.toHaveBeenCalledWith(expect.stringMatching(/Payment successful/i));
  });

  it("keeps a rejected checkout identity available for a successful manual retry", async () => {
    mocks.useAuthMock.mockReturnValue({ user: { id: "returning-user" }, profile: { role: "buyer", participant_type: "buyer" }, loading: false, profileLoading: false });
    const refreshSubscription = vi.fn()
      .mockResolvedValueOnce({ status: "error", checkoutSessionId: "cs_test_retry_error", userId: "returning-user", reason: "request_failed" })
      .mockResolvedValueOnce({
        status: "verified",
        checkoutSessionId: "cs_test_retry_error",
        userId: "returning-user",
        receipt: {
          checkout_session_id: "cs_test_retry_error",
          user_id: "returning-user",
          kind: "addon",
          addon_key: "property_report_single",
          audience: "participant",
          quantity: 1,
        },
      });
    mocks.useSubscriptionMock.mockReturnValue({
      isPro: false,
      loading: false,
      hasStripeBilling: false,
      refreshSubscription,
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, {
      initialPath: "/pricing?checkout=success&session_id=cs_test_retry_error",
    });

    expect(await screen.findByText(/couldn't confirm your subscription/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Check again/i }));
    expect(await screen.findByText(/Purchase confirmed/i)).toBeInTheDocument();
    expect(refreshSubscription).toHaveBeenCalledTimes(2);
    expect(refreshSubscription).toHaveBeenLastCalledWith("cs_test_retry_error");
  });

  it.each([
    ["trialing", "Trial confirmed"],
    ["addon", "Purchase confirmed"],
  ] as const)("uses truthful %s receipt copy", async (kind, message) => {
    mocks.useAuthMock.mockReturnValue({ user: { id: "returning-user" }, profile: { role: "buyer", participant_type: "buyer" }, loading: false, profileLoading: false });
    const receipt = kind === "addon"
      ? { checkout_session_id: "cs_test_receipt_copy", user_id: "returning-user", kind: "addon", addon_key: "property_report_single", audience: "participant", quantity: 1 }
      : { checkout_session_id: "cs_test_receipt_copy", user_id: "returning-user", kind: "subscription", product_id: "prod_participant", plan_key: "pro", audience: "participant", status: "trialing", subscription_end: "2099-01-01T00:00:00.000Z" };
    const refreshSubscription = vi.fn().mockResolvedValue({
      status: "verified", checkoutSessionId: "cs_test_receipt_copy", userId: "returning-user", receipt,
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, hasStripeBilling: false, refreshSubscription });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?checkout=success&session_id=cs_test_receipt_copy" });
    expect(await screen.findByText(new RegExp(message, "i"))).toBeInTheDocument();
    expect(mocks.toast.success).toHaveBeenCalledWith(expect.stringMatching(new RegExp(message, "i")));
  });

  it("does not reconcile a missing or conflicting checkout return identity", async () => {
    mocks.useAuthMock.mockReturnValue({ user: { id: "returning-user" }, profile: { role: "buyer", participant_type: "buyer" }, loading: false, profileLoading: false });
    const refreshSubscription = vi.fn();
    mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, hasStripeBilling: false, refreshSubscription });
    const { default: Pricing } = await import("@/pages/Pricing");

    const view = renderWithProviders(<Pricing />, { initialPath: "/pricing?checkout=success" });
    expect(await screen.findByText(/confirmation link is missing/i)).toBeInTheDocument();
    expect(refreshSubscription).not.toHaveBeenCalled();

    view.unmount();
    renderWithProviders(<Pricing />, { initialPath: "/pricing?checkout=success&session_id=cs_test_one&checkout_session_id=cs_test_two" });
    expect(await screen.findByText(/confirmation link is invalid/i)).toBeInTheDocument();
    expect(refreshSubscription).not.toHaveBeenCalled();
  });

  it("does not publish an old actor's delayed checkout confirmation", async () => {
    let resolveActorA!: (value: unknown) => void;
    const actorAOutcome = new Promise((resolve) => { resolveActorA = resolve; });
    const refreshSubscription = vi.fn()
      .mockImplementationOnce(() => actorAOutcome)
      .mockResolvedValueOnce({
        status: "pending",
        checkoutSessionId: "cs_test_actor_change",
        userId: "actor-b",
        reason: "pending",
      });
    mocks.useSubscriptionMock.mockReturnValue({
      isPro: false,
      loading: false,
      hasStripeBilling: false,
      refreshSubscription,
    });
    mocks.useAuthMock.mockReturnValue({
      user: { id: "actor-a" },
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    });
    const { default: Pricing } = await import("@/pages/Pricing");
    const view = renderWithProviders(<Pricing />, {
      initialPath: "/pricing?checkout=success&session_id=cs_test_actor_change",
    });
    await waitFor(() => expect(refreshSubscription).toHaveBeenCalledTimes(1));

    mocks.useAuthMock.mockReturnValue({
      user: { id: "actor-b" },
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    });
    view.rerender(<Pricing />);
    await waitFor(() => expect(refreshSubscription).toHaveBeenCalledTimes(2));
    expect(await screen.findByText(/subscription is not confirmed yet/i)).toBeInTheDocument();

    await act(async () => {
      resolveActorA({
        status: "verified",
        checkoutSessionId: "cs_test_actor_change",
        userId: "actor-a",
        receipt: {
          checkout_session_id: "cs_test_actor_change",
          user_id: "actor-a",
          kind: "subscription",
          product_id: "prod_participant",
          plan_key: "pro",
          audience: "participant",
          status: "active",
          subscription_end: "2099-01-01T00:00:00.000Z",
        },
      });
      await actorAOutcome;
    });

    expect(screen.getByText(/subscription is not confirmed yet/i)).toBeInTheDocument();
    expect(mocks.toast.success).not.toHaveBeenCalled();
  });

  it.each([
    [
      "sign-out while auth is loading",
      { user: null, session: null, profile: null, loading: true, profileLoading: true },
    ],
    [
      "different actor",
      {
        user: { id: "actor-b" },
        session: pricingSession("actor-b", "known-session-b"),
        profile: { role: "buyer", participant_type: "buyer" },
        loading: false,
        profileLoading: false,
      },
    ],
    [
      "different audience",
      {
        user: { id: "actor-a" },
        session: pricingSession("actor-a", "known-session-a"),
        profile: { role: "agent", participant_type: "agent" },
        loading: false,
        profileLoading: false,
      },
    ],
    [
      "new known session for the same actor",
      {
        user: { id: "actor-a" },
        session: pricingSession("actor-a", "known-session-a-2"),
        profile: { role: "buyer", participant_type: "buyer" },
        loading: false,
        profileLoading: false,
      },
    ],
  ] as const)("clears a completed checkout when its %s context is replaced", async (_label, nextAuth) => {
    const initialAuth = {
      user: { id: "actor-a" },
      session: pricingSession("actor-a", "known-session-a"),
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    };
    mocks.useAuthMock.mockReturnValue(initialAuth);
    const refreshSubscription = vi.fn().mockResolvedValue({
      status: "verified",
      checkoutSessionId: "cs_test_completed_context",
      userId: "actor-a",
      receipt: {
        checkout_session_id: "cs_test_completed_context",
        user_id: "actor-a",
        kind: "subscription",
        product_id: "prod_participant",
        plan_key: "pro",
        audience: "participant",
        status: "active",
        subscription_end: "2099-01-01T00:00:00.000Z",
      },
    });
    mocks.useSubscriptionMock.mockReturnValue({
      isPro: false,
      loading: false,
      hasStripeBilling: false,
      refreshSubscription,
    });
    const { default: Pricing } = await import("@/pages/Pricing");
    const view = renderWithProviders(<Pricing />, {
      initialPath: "/pricing?checkout=success&session_id=cs_test_completed_context",
    });
    expect(await screen.findByText(/Subscription confirmed/i)).toBeInTheDocument();
    expect(refreshSubscription).toHaveBeenCalledTimes(1);

    mocks.useAuthMock.mockReturnValue(nextAuth);
    view.rerender(<Pricing />);

    await waitFor(() => {
      expect(screen.queryByText(/Subscription confirmed/i)).not.toBeInTheDocument();
    });
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.toast.dismiss).toHaveBeenCalledWith("checkout-toast-id");
    expect(mocks.toast.dismiss).not.toHaveBeenCalledWith("unrelated-toast-id");
  });

  it("keeps completed checkout state across a token refresh in the same known session", async () => {
    const auth = {
      user: { id: "actor-a" },
      session: pricingSession("actor-a", "known-session-a", "one"),
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    };
    mocks.useAuthMock.mockReturnValue(auth);
    const refreshSubscription = vi.fn().mockResolvedValue({
      status: "verified",
      checkoutSessionId: "cs_test_token_refresh",
      userId: "actor-a",
      receipt: {
        checkout_session_id: "cs_test_token_refresh",
        user_id: "actor-a",
        kind: "subscription",
        product_id: "prod_participant",
        plan_key: "pro",
        audience: "participant",
        status: "active",
        subscription_end: "2099-01-01T00:00:00.000Z",
      },
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, refreshSubscription });
    const { default: Pricing } = await import("@/pages/Pricing");
    const view = renderWithProviders(<Pricing />, {
      initialPath: "/pricing?checkout=success&session_id=cs_test_token_refresh",
    });
    expect(await screen.findByText(/Subscription confirmed/i)).toBeInTheDocument();

    mocks.useAuthMock.mockReturnValue({
      ...auth,
      session: pricingSession("actor-a", "known-session-a", "two"),
    });
    view.rerender(<Pricing />);

    expect(screen.getByText(/Subscription confirmed/i)).toBeInTheDocument();
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.toast.success).toHaveBeenCalledTimes(1);
    expect(mocks.toast.dismiss).not.toHaveBeenCalled();
  });

  it.each([
    ["no return", "audience=participant"],
    ["cancel return", "checkout=cancelled"],
    ["mock return", "checkout=success&billing_mode=mock"],
  ])("clears pending retry state when the URL changes to a %s context", async (_label, nextSearch) => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "actor-a" },
      session: pricingSession("actor-a", "known-session-a"),
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    });
    const refreshSubscription = vi.fn().mockResolvedValue({
      status: "pending",
      checkoutSessionId: "cs_test_removed_return",
      userId: "actor-a",
      reason: "pending",
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, refreshSubscription });
    const { default: Pricing } = await import("@/pages/Pricing");
    renderWithProviders(
      <>
        <Pricing />
        <ReplacePricingSearch next={nextSearch} />
      </>,
      { initialPath: "/pricing?checkout=success&session_id=cs_test_removed_return" },
    );
    expect(await screen.findByRole("button", { name: /Check again/i })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /replace pricing search/i }));

    await waitFor(() => {
      expect(screen.queryByRole("button", { name: /Check again/i })).not.toBeInTheDocument();
      expect(screen.queryByText(/subscription is not confirmed yet/i)).not.toBeInTheDocument();
      expect(screen.queryByText(/Confirming your subscription/i)).not.toBeInTheDocument();
    });
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.toast.dismiss).not.toHaveBeenCalled();
  });

  it("preserves its own successful cleanup but clears completion after a later URL context change", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "actor-a" },
      session: pricingSession("actor-a", "known-session-a"),
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    });
    const refreshSubscription = vi.fn().mockResolvedValue({
      status: "verified",
      checkoutSessionId: "cs_test_own_cleanup",
      userId: "actor-a",
      receipt: {
        checkout_session_id: "cs_test_own_cleanup",
        user_id: "actor-a",
        kind: "subscription",
        product_id: "prod_participant",
        plan_key: "pro",
        audience: "participant",
        status: "active",
        subscription_end: "2099-01-01T00:00:00.000Z",
      },
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, refreshSubscription });
    const { default: Pricing } = await import("@/pages/Pricing");
    renderWithProviders(
      <>
        <Pricing />
        <ReplacePricingSearch next="audience=participant&view=other" />
      </>,
      {
        initialPath: "/pricing?audience=participant&checkout=success&session_id=cs_test_own_cleanup",
      },
    );

    expect(await screen.findByText(/Subscription confirmed/i)).toBeInTheDocument();
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole("button", { name: /replace pricing search/i }));
    await waitFor(() => {
      expect(screen.queryByText(/Subscription confirmed/i)).not.toBeInTheDocument();
    });
    expect(refreshSubscription).toHaveBeenCalledTimes(1);
    expect(mocks.toast.dismiss).toHaveBeenCalledWith("checkout-toast-id");
    expect(mocks.toast.dismiss).not.toHaveBeenCalledWith("unrelated-toast-id");
  });

  it("dismisses only its owned checkout toast when the Pricing lifecycle unmounts", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "actor-a" },
      session: pricingSession("actor-a", "known-session-a"),
      profile: { role: "buyer", participant_type: "buyer" },
      loading: false,
      profileLoading: false,
    });
    const refreshSubscription = vi.fn().mockResolvedValue({
      status: "verified",
      checkoutSessionId: "cs_test_unmount_toast",
      userId: "actor-a",
      receipt: {
        checkout_session_id: "cs_test_unmount_toast",
        user_id: "actor-a",
        kind: "subscription",
        product_id: "prod_participant",
        plan_key: "pro",
        audience: "participant",
        status: "active",
        subscription_end: "2099-01-01T00:00:00.000Z",
      },
    });
    mocks.useSubscriptionMock.mockReturnValue({ isPro: false, loading: false, refreshSubscription });
    const { default: Pricing } = await import("@/pages/Pricing");
    const view = renderWithProviders(<Pricing />, {
      initialPath: "/pricing?checkout=success&session_id=cs_test_unmount_toast",
    });
    expect(await screen.findByText(/Subscription confirmed/i)).toBeInTheDocument();
    const unrelatedToastId = mocks.toast.info("Unrelated notice");

    view.unmount();

    expect(mocks.toast.dismiss).toHaveBeenCalledTimes(1);
    expect(mocks.toast.dismiss).toHaveBeenCalledWith("checkout-toast-id");
    expect(mocks.toast.dismiss).not.toHaveBeenCalledWith(unrelatedToastId);
  });

  it("shows the active invite-only investor entitlement as a dashboard action", async () => {
    mocks.useAuthMock.mockReturnValue({
      user: { id: "u-investor", email: "investor@example.com" },
      profile: { role: "investor", participant_type: "investor" },
      loading: false,
      profileLoading: false,
    });
    mocks.useSubscriptionMock.mockReturnValue({
      isPro: true,
      loading: false,
      hasStripeBilling: false,
      refreshSubscription: vi.fn(),
    });
    const { default: Pricing } = await import("@/pages/Pricing");

    renderWithProviders(<Pricing />, { initialPath: "/pricing?audience=investor" });
    fireEvent.click(await screen.findByRole("button", { name: /Go to Investor Dashboard/i }));

    expect(mocks.navigateMock).toHaveBeenCalledWith("/investor-dashboard");
    expect(screen.getByText("Invitation only")).toBeInTheDocument();
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
      { initialPath: "/professionals/88888888-8888-4888-8888-888888888888" },
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
      { initialPath: "/professionals/88888888-8888-4888-8888-888888888888" },
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
      { initialPath: "/professionals/88888888-8888-4888-8888-888888888888" },
    );

    fireEvent.click((await screen.findAllByRole("button", { name: /Send Inquiry/i }))[0]);
    fireEvent.click(screen.getAllByRole("button", { name: /Book Consultation/i })[0]);
    fireEvent.click(screen.getByRole("button", { name: /Request Callback/i }));

    expect(modalOpen).not.toHaveBeenCalled();
    expect(mocks.navigateMock).toHaveBeenCalledWith("/login", {
      state: { from: { pathname: "/professionals/88888888-8888-4888-8888-888888888888" } },
    });
    expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to send an inquiry.");
    expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to book a consultation.");
    expect(mocks.toast.error).toHaveBeenCalledWith("Please sign in to request a callback.");
  });
});

describe("Auctions focused page behavior", () => {
  it("renders the canonical server page without a separate hydration state", async () => {
    mocks.useAuctionsPipelineMock.mockReturnValue({
      isPro: true,
      isMaiPropOsUser: false,
      isLoading: false,
      error: null,
      cityOptions: ["All Cities", "Athens"],
      roundOptions: [{ value: "", label: "All Rounds" }],
      visibleFiltered: [auction()],
      visibleCount: 1,
      polygonFilteredCount: 1,
      paginated: [auction()],
      totalPages: 1,
      thisWeek: 1,
      avgBid: 150000,
      activeFilterCount: 0,
      totalRaw: 1,
      mapListings: [auction()],
      mappableCount: 1,
    });
    const { default: Auctions } = await import("@/pages/Auctions");

    renderWithProviders(<Auctions />, { initialPath: "/auctions" });

    expect(await screen.findByTestId("auction-card")).toBeInTheDocument();
    expect(screen.queryByText(/public preview is available/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Retry full catalogue/i })).not.toBeInTheDocument();
  });

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

  it("keeps the auction address readable on narrow screens", async () => {
    mocks.useAuctionListingsMock.mockReturnValue({
      data: [auction({ address: "11 Δημάρχου Αγγέλου Μεταξά" })],
      isLoading: false,
    });
    const { default: AuctionDetail } = await import("@/pages/AuctionDetail");

    renderWithProviders(
      <Routes>
        <Route path="/auction/:id" element={<AuctionDetail />} />
      </Routes>,
      { initialPath: "/auction/auction-1" },
    );

    const heading = (await screen.findAllByRole("heading", { name: "Athens Auction Flat" }))[0];
    const heroRow = heading.closest("div")?.parentElement;
    const address = screen.getByText(/Δημάρχου Αγγέλου Μεταξά/);

    expect(heroRow).toHaveClass("grid");
    expect(address).toHaveClass("break-words");
    expect(address).toHaveClass("min-w-0");
  });

  it("enriches cached auction detail with the exact row eAuction URL", async () => {
    mocks.useAuctionListingsMock.mockReturnValue({
      data: [auction({ website_url: null })],
      isLoading: false,
    });
    mocks.fetchAuctionListingByIdMock.mockResolvedValue(
      auction({ website_url: "https://www.eauction.gr/Auction/Details/demo" }),
    );
    const { default: AuctionDetail } = await import("@/pages/AuctionDetail");

    renderWithProviders(
      <Routes>
        <Route path="/auction/:id" element={<AuctionDetail />} />
      </Routes>,
      { initialPath: "/auction/auction-1" },
    );

    const links = await screen.findAllByRole("link", { name: /Open eAuction/i });
    expect(links.length).toBeGreaterThan(0);
    expect(links[0]).toHaveAttribute("href", "https://www.eauction.gr/Auction/Details/demo");
    expect(mocks.fetchAuctionListingByIdMock).toHaveBeenCalledWith("auction-1");
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
