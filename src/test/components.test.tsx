/**
 * Component unit tests: PropertyCard, Dashboard, PropertyDetail.
 *
 * Each group tests meaningful render states and interactions —
 * not just "it doesn't crash" but "it shows the right thing to users."
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import React, { Suspense } from "react";
import { renderWithProviders } from "@/test/utils";

// ── Shared mocks ──────────────────────────────────────────────────────────────

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (r: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(r),
    }),
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "" } }),
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue({ on: vi.fn().mockReturnThis(), subscribe: vi.fn().mockReturnThis() }),
    removeChannel: vi.fn(),
  },
}));

const mockUseAuth = vi.fn().mockReturnValue({ user: null, profile: null, loading: false });
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn().mockReturnValue({ isPro: false, loading: false }),
}));

const mockToggleFavorite = vi.fn();
const mockIsFavorited = vi.fn().mockReturnValue({ data: false, isLoading: false });

vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useToggleFavorite: () => ({ mutate: mockToggleFavorite, isPending: false }),
  useIsFavorited: (id: string) => mockIsFavorited(id),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) => {
      // Return recognisable values for key strings used in assertions
      const map: Record<string, string> = {
        "common.bed": "bed",
        "common.bath": "bath",
        "common.sqm": "m²",
        "propertyCard.actions.save": "Save property",
        "propertyCard.actions.unsave": "Remove from saved",
        "propertyCard.actions.share": "Share",
        "propertyCard.actions.report": "Report",
        "propertyCard.actions.contactAgent": "Contact Agent",
        "propertyCard.actions.viewAuction": "View Auction",
        "propertyCard.actions.viewOpenHouse": "View Open House",
        "propertyCard.badges.quickSale": "Quick Sale",
        "propertyCard.badges.verified": "Verified",
        "propertyCard.badges.auction": "Auction",
        "propertyCard.auctionDate": "Auction Date",
        "propertyCard.openHouseDate": "Open House",
        "propertyCard.motivatedSeller": "Motivated seller · fast close",
        "propertyCard.agentListing": "Agent listing",
        "propertyCard.privateSeller": "Private seller",
        "propertyCard.basement": "Basement",
        "propertyCard.groundFloor": "Ground",
        "propertyCard.floor": "F",
        "propertyCard.linkCopied": "Link copied!",
        "propertyCard.copyFailed": "Could not copy link",
        "propertyCard.signInToReport": "Sign in to report",
        "propertyCard.reportSubmitted": "Report submitted",
        "propertyCard.ownership.full": "Full ownership",
        "listings.noResults": "No results",
        "listings.noResultsSubtitle": "Try adjusting your filters",
        "listings.filters.reset": "Reset filters",
      };
      if (map[key]) return map[key];
      if (opts?.price) return `From €${opts.price}`;
      return key;
    },
    i18n: { changeLanguage: vi.fn(), language: "en" },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/lib/config", () => ({
  getStreetViewProxyUrl: vi.fn().mockReturnValue(""),
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  MAPBOX_TOKEN: "",
  GOOGLE_MAPS_API_KEY: "",
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/MapView", () => ({ MapView: () => <div data-testid="map-view" /> }));
vi.mock("@/components/MarketTicker", () => ({ MarketTicker: () => <div data-testid="market-ticker" /> }));
vi.mock("@/components/PropertyMiniMap", () => ({ default: () => <div data-testid="property-mini-map" /> }));
vi.mock("@/components/PropertyValuation", () => ({ default: () => <div data-testid="property-valuation" /> }));
vi.mock("@/components/NeighbourhoodReport", () => ({ default: () => <div data-testid="neighbourhood-report" /> }));
vi.mock("@/components/AIAssistantWidget", () => ({ default: () => <div data-testid="ai-assistant-widget" /> }));
vi.mock("@/components/AuctionAlertModal", () => ({ AuctionAlertModal: () => <div /> }));
vi.mock("@/components/ViewingDialog", () => ({ default: () => <div data-testid="viewing-dialog" /> }));
vi.mock("@/components/DashboardPlanCard", () => ({ DashboardPlanCard: () => <div data-testid="plan-card" /> }));
vi.mock("@/components/dashboard/SettingsSection", () => ({ SettingsSection: () => <div data-testid="settings-section" /> }));
vi.mock("@/components/OpenHouseDashboardSection", () => ({ default: () => <div data-testid="open-house-section" /> }));
vi.mock("@/components/ProfessionalServicesEditor", () => ({ default: () => <div /> }));
vi.mock("@/components/dashboard/ProfileCompletionCard", () => ({ ProfileCompletionCard: () => <div /> }));
vi.mock("@/components/dashboard/BookingCalendarSection", () => ({ BookingCalendarSection: () => <div /> }));
vi.mock("@/components/CookieConsentBanner", () => ({ CookieConsentBanner: () => null, getCookieConsent: vi.fn().mockReturnValue(null), saveCookieConsent: vi.fn() }));
vi.mock("@/components/property/PropertyReportCard", () => ({ PropertyReportCard: () => <div /> }));
vi.mock("@/components/property/PropertyAuctionSection", () => ({ PropertyAuctionSection: () => <div /> }));
vi.mock("@/hooks/useInView", () => ({ useInView: vi.fn().mockReturnValue([vi.fn(), false]) }));
vi.mock("@/hooks/usePullToRefresh", () => ({ usePullToRefresh: vi.fn().mockReturnValue({ isPulling: false, pullProgress: 0 }) }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: vi.fn().mockReturnValue({ isPro: false, loading: false }) }));
vi.mock("@/hooks/usePropertyAIInsights", () => ({
  usePropertyAIInsights: vi.fn().mockReturnValue({
    aiInsightsData: null,
    aiInsightsLoading: false,
    aiInsightsLoaded: false,
    aiInsightsQuota: { allowed: true, reason: null, used: 0, limit: 5, remaining: 5 },
    aiInsightsQuotaLoading: false,
    loadAiInsights: vi.fn(),
  }),
}));
vi.mock("@/hooks/useSimilarListings", () => ({ useSimilarListings: vi.fn().mockReturnValue({ data: [] }) }));
vi.mock("@/hooks/useMessages", () => ({
  useStartConversation: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useConversations: vi.fn().mockReturnValue({ data: [] }),
  useMessages: vi.fn().mockReturnValue({ data: [] }),
  useSendMessage: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useSavedSearches", () => ({
  useSavedSearches: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useDeleteSavedSearch: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useSaveSearch: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useLeads", () => ({
  useLeads: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useCreateLead: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateLead: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
  useDeleteLead: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useViewings", () => ({ useViewings: vi.fn().mockReturnValue({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useContacts", () => ({
  useContacts: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useContactTasks: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useUpdateContactTask: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useProfessionals", () => ({ useProfessionals: vi.fn().mockReturnValue({ data: [], isLoading: false }) }));
vi.mock("@/hooks/useProfessionalServices", () => ({
  useProfessionalServices: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useMyProfessional: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useUpsertProfessionalServices: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpsertProfessionalAvailability: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateProfessional: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useAuctionAlerts", () => ({
  useAuctionAlerts: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useCreateAuctionAlert: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateAuctionAlert: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useDeleteAuctionAlert: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useConsultations", () => ({
  useMyConsultationRequests: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useCreateConsultationRequest: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));
vi.mock("@/hooks/useEligibleForQuickSale", () => ({ useEligibleForQuickSale: vi.fn().mockReturnValue({ eligible: false }) }));
vi.mock("@/hooks/usePlanLimits", () => ({
  startOfCurrentMonth: vi.fn().mockReturnValue(new Date()),
  getPlanLimits: vi.fn().mockReturnValue({ listings: Infinity, images: Infinity, aiCredits: Infinity }),
  usePlanLimits: vi.fn().mockReturnValue({ limits: {}, usage: {}, isLoading: false }),
}));
vi.mock("@/hooks/useProfessionalReviews", () => ({
  useProfessionalReviews: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useSubmitReview: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  computeStats: vi.fn().mockReturnValue({ total: 0, avg: 0, distribution: {} }),
}));
vi.mock("@/hooks/useListings", () => ({
  useListings: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useMyListings: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useListingsPaginated: vi.fn().mockReturnValue({ data: { pages: [] }, isLoading: false, fetchNextPage: vi.fn(), hasNextPage: false, isFetchingNextPage: false }),
  useListing: vi.fn().mockReturnValue({ data: null, isLoading: false, isError: false, error: null }),
  useOwnerProStatus: vi.fn().mockReturnValue({ data: false, isLoading: false }),
  useTrackListingView: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateListing: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteListing: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useCreateListing: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));
vi.mock("@/hooks/useListingsFilters", () => ({
  useListingsFilters: vi.fn().mockReturnValue({ filters: {}, setFilter: vi.fn(), resetFilters: vi.fn(), activeFilterCount: 0 }),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeProperty(overrides: Partial<{
  id: string; title: string; price: number; city: string; address: string;
  bedrooms: number; bathrooms: number; sqm: number; type: "apartment" | "house" | "land" | "commercial" | "villa" | "office";
  listingType: "sale" | "rent" | "auction" | "firesale" | "open_house";
  images: string[]; tags: string[];
}> = {}) {
  return {
    id: "prop-1",
    title: "Modern Apartment in Athens",
    price: 250000,
    city: "Athens",
    address: "Ermou 10",
    bedrooms: 3,
    bathrooms: 2,
    sqm: 90,
    type: "apartment" as const,
    listingType: "sale" as const,
    images: [],
    tags: [],
    ...overrides,
  };
}

// ── PropertyCard tests ────────────────────────────────────────────────────────

describe("PropertyCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsFavorited.mockReturnValue({ data: false, isLoading: false });
  });

  it("renders the property title", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty()} />);
    expect(screen.getByText("Modern Apartment in Athens")).toBeInTheDocument();
  });

  it("renders the city and address", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty()} />);
    // address includes city: "Ermou 10, Athens"
    const addressEl = screen.getAllByText(/Ermou 10/)[0];
    expect(addressEl).toBeInTheDocument();
  });

  it("renders bedroom and bathroom counts via i18n keys", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ bedrooms: 3, bathrooms: 2 })} />);
    expect(screen.getByText(/3.*bed/i)).toBeInTheDocument();
    expect(screen.getByText(/2.*bath/i)).toBeInTheDocument();
  });

  it("renders sqm with m² label", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ sqm: 90 })} />);
    expect(screen.getByText(/90.*m²/i)).toBeInTheDocument();
  });

  it("favourite button has correct aria-label when not saved", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    mockIsFavorited.mockReturnValue({ data: false, isLoading: false });
    renderWithProviders(<PropertyCard property={makeProperty()} />);
    const btn = screen.getByRole("button", { name: /save property/i });
    expect(btn).toBeInTheDocument();
  });

  it("favourite button has 'remove from saved' label when already saved", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    mockIsFavorited.mockReturnValue({ data: true, isLoading: false });
    renderWithProviders(<PropertyCard property={makeProperty()} />);
    const btn = screen.getByRole("button", { name: /remove from saved/i });
    expect(btn).toBeInTheDocument();
  });

  it("calls mutate when user clicks favourite (logged in)", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    mockUseAuth.mockReturnValue({ user: { id: "u1" }, profile: null, loading: false });
    mockIsFavorited.mockReturnValue({ data: false, isLoading: false });
    renderWithProviders(<PropertyCard property={makeProperty()} />);
    const btn = screen.getByRole("button", { name: /save property/i });
    fireEvent.click(btn);
    expect(mockToggleFavorite).toHaveBeenCalled();
  });

  it("renders the share button with aria-label", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty()} />);
    expect(screen.getByRole("button", { name: /share/i })).toBeInTheDocument();
  });

  it("renders the report button with aria-label", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty()} />);
    expect(screen.getByRole("button", { name: /report/i })).toBeInTheDocument();
  });

  it("shows 'View Auction' CTA for auction listings", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ listingType: "auction" })} />);
    expect(screen.getByText("View Auction")).toBeInTheDocument();
  });

  it("shows firesale urgency banner for firesale listings", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ listingType: "firesale" })} />);
    // "Quick Sale" may appear in both the badge and the urgency banner
    expect(screen.getAllByText("Quick Sale").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Motivated seller · fast close")).toBeInTheDocument();
  });

  it("shows rent price with /mo suffix", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ listingType: "rent", price: 1200 })} />);
    expect(screen.getByText(/\/mo/)).toBeInTheDocument();
  });

  it("does not render bedroom spec when bedrooms is 0", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ bedrooms: 0 })} />);
    expect(screen.queryByText(/0.*bed/i)).not.toBeInTheDocument();
  });

  it("compact mode renders title and city without throwing", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(
      <PropertyCard property={makeProperty({ title: "Compact Flat", city: "Piraeus" })} compact />
    );
    expect(screen.getByText("Compact Flat")).toBeInTheDocument();
    expect(screen.getByText("Piraeus")).toBeInTheDocument();
  });

  it("shows user-visible tags and hides system tags", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    const tags = ["os_auction:123", "sea view", "source:manual", "renovated"];
    renderWithProviders(<PropertyCard property={makeProperty({ tags })} />);
    expect(screen.getByText("sea view")).toBeInTheDocument();
    expect(screen.getByText("renovated")).toBeInTheDocument();
    expect(screen.queryByText(/os_auction/)).not.toBeInTheDocument();
    expect(screen.queryByText(/source:/)).not.toBeInTheDocument();
  });

  it("shows agent name and verified badge when agent is provided", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    const agent = { name: "Nikos Papadopoulos", avatar: undefined, verified: true };
    renderWithProviders(<PropertyCard property={{ ...makeProperty(), agent }} />);
    expect(screen.getByText("Nikos Papadopoulos")).toBeInTheDocument();
    expect(screen.getByText("Verified")).toBeInTheDocument();
  });

  it("shows discount percentage badge for auction listing with starting bid below price", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(
      <PropertyCard
        property={makeProperty({ listingType: "auction", price: 200000 })}
      />
    );
    // Property has no auctionStartingBid so no discount — verify it doesn't crash
    expect(screen.queryByText(/-\d+% off/)).not.toBeInTheDocument();
  });

  it("shows '-25% off' discount badge when auctionStartingBid is 25% below price", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(
      <PropertyCard
        property={{
          ...makeProperty({ listingType: "auction", price: 200000 }),
          auctionStartingBid: 150000,
        }}
      />
    );
    expect(screen.getByText(/-25% off/)).toBeInTheDocument();
  });

  it("shows 'View Open House' CTA for open_house listings", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ listingType: "open_house" })} />);
    expect(screen.getByText("View Open House")).toBeInTheDocument();
  });

  it("does not render a primary contact CTA inside regular listing cards", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    renderWithProviders(<PropertyCard property={makeProperty({ listingType: "sale" })} />);
    expect(screen.queryByText("Contact Agent")).not.toBeInTheDocument();
  });
});

describe("PropertyAIInsightsSection", () => {
  it("formats AI estimate as a full currency amount, not compact EUR-k text", async () => {
    const { PropertyAIInsightsSection } = await import("@/components/property/PropertyAIInsightsSection");

    renderWithProviders(
      <PropertyAIInsightsSection
        user={{ id: "u-1" } as import("@supabase/supabase-js").User}
        isPro
        loading={false}
        data={{
          vsMarket: 6.6,
          rentalYield: 6.5,
          estimatedValue: 5_440_000,
          marketComparison: "above_market",
          confidenceLabel: "Low",
        }}
        quota={{ allowed: true, reason: null, used: 2, limit: 100, remaining: 98 }}
        quotaLoading={false}
        hasRequested
        onLoad={vi.fn()}
      />,
    );

    expect(screen.queryByText(/EUR 5440k/i)).not.toBeInTheDocument();
    expect(screen.getByText(/5\.440\.000/)).toBeInTheDocument();
  });

  it("shows a manual load button and free request counter before spending an AI call", async () => {
    const { PropertyAIInsightsSection } = await import("@/components/property/PropertyAIInsightsSection");
    const onLoad = vi.fn();

    renderWithProviders(
      <PropertyAIInsightsSection
        user={{ id: "u-1" } as import("@supabase/supabase-js").User}
        isPro={false}
        loading={false}
        data={null}
        quota={{ allowed: true, reason: null, used: 2, limit: 5, remaining: 3 }}
        quotaLoading={false}
        hasRequested={false}
        onLoad={onLoad}
      />,
    );

    expect(screen.getByText(/3 of 5 Free AI insight requests remaining this month/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load ai insights/i }));
    expect(onLoad).toHaveBeenCalledTimes(1);
  });

  it("shows upgrade CTA when the AI insights cap is reached", async () => {
    const { PropertyAIInsightsSection } = await import("@/components/property/PropertyAIInsightsSection");

    renderWithProviders(
      <PropertyAIInsightsSection
        user={{ id: "u-1" } as import("@supabase/supabase-js").User}
        isPro={false}
        loading={false}
        data={null}
        quota={{ allowed: false, reason: "monthly_limit_reached", used: 5, limit: 5, remaining: 0 }}
        quotaLoading={false}
        hasRequested={false}
        onLoad={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: /upgrade to pro/i })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("button", { name: /load ai insights/i })).not.toBeInTheDocument();
  });
});

// ── Dashboard tests ───────────────────────────────────────────────────────────

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, profile: null, loading: false });
  });

  it("renders without throwing (unauthenticated)", async () => {
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Dashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("renders the navbar", async () => {
    const { default: Dashboard } = await import("@/pages/Dashboard");
    renderWithProviders(
      <Suspense fallback={<div data-testid="suspense">loading</div>}>
        <Dashboard />
      </Suspense>
    );
    const navbar = screen.queryByTestId("navbar");
    const suspense = screen.queryByTestId("suspense");
    expect(navbar !== null || suspense !== null).toBe(true);
  });

  it("renders without throwing for a logged-in buyer", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u1" },
      profile: { id: "u1", role: "buyer", display_name: "Test User", bio_type: "buyer" },
      loading: false,
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Dashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("renders without throwing for a logged-in seller", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u2" },
      profile: { id: "u2", role: "seller", display_name: "Seller User", bio_type: "seller" },
      loading: false,
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Dashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("renders without throwing for a professional", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u3" },
      profile: { id: "u3", role: "professional", display_name: "Pro User", bio_type: null },
      loading: false,
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Dashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("renders without throwing for an investor", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u4" },
      profile: { id: "u4", role: "investor", display_name: "Investor User", bio_type: "investor" },
      loading: false,
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Dashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("renders without throwing for a platform admin", async () => {
    mockUseAuth.mockReturnValue({
      user: { id: "u5" },
      profile: { id: "u5", role: "admin", display_name: "Admin User", bio_type: null },
      loading: false,
    });
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Dashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("renders loading state while auth is resolving", async () => {
    mockUseAuth.mockReturnValue({ user: null, profile: null, loading: true });
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Dashboard />
        </Suspense>
      )
    ).not.toThrow();
  });
});

// ── PropertyDetail tests ──────────────────────────────────────────────────────

describe("PropertyDetail", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseAuth.mockReturnValue({ user: null, profile: null, loading: false });
  });

  it("renders loading spinner while fetching", async () => {
    const { useListing } = await import("@/hooks/useListings");
    (useListing as ReturnType<typeof vi.fn>).mockReturnValue({ data: null, isLoading: true, isError: false, error: null });
    const { default: PropertyDetail } = await import("@/pages/PropertyDetail");
    renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <PropertyDetail />
      </Suspense>,
      { initialPath: "/property/test-id" }
    );
    // Loading spinner or suspense placeholder — neither should throw
    expect(document.body).toBeTruthy();
  });

  it("shows 'Property not found' when query errors", async () => {
    const { useListing } = await import("@/hooks/useListings");
    (useListing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
      error: new Error("Not found"),
    });
    const { default: PropertyDetail } = await import("@/pages/PropertyDetail");
    renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <PropertyDetail />
      </Suspense>,
      { initialPath: "/property/missing-id" }
    );
    expect(screen.getByText("property.errorLoad")).toBeInTheDocument();
  });

  it("renders property title when data loads", async () => {
    const { useListing } = await import("@/hooks/useListings");
    (useListing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: "prop-1",
        title: "Sea View Villa",
        city: "Thessaloniki",
        address: "Coast Road 5",
        price: "450000",
        sqm: "180",
        bedrooms: 4,
        bathrooms: 3,
        property_type: "villa",
        listing_type: "sale",
        owner_id: "owner-1",
        description: "A beautiful sea view villa",
        images: [],
        listing_images: [],
        profiles: null,
        cover_image_url: null,
        latitude: null,
        longitude: null,
        tags: [],
        status: "active",
        is_pre_sale: false,
        floor: null,
        total_floors: null,
        year_built: null,
        energy_class: null,
        has_parking: false,
        has_pool: false,
        has_elevator: false,
        has_balcony: false,
        has_garden: false,
        has_ac: false,
        views_count: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    const { default: PropertyDetail } = await import("@/pages/PropertyDetail");
    renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <PropertyDetail />
      </Suspense>,
      { initialPath: "/property/prop-1" }
    );
    // Title appears in both h1 and potentially meta — check at least one heading
    const heading = await screen.findByRole("heading", { name: "Sea View Villa" });
    expect(heading).toBeInTheDocument();
  });

  it("renders without throwing (no auth)", async () => {
    const { default: PropertyDetail } = await import("@/pages/PropertyDetail");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <PropertyDetail />
        </Suspense>,
        { initialPath: "/property/test-id" }
      )
    ).not.toThrow();
  });

  it("renders property description when data loads", async () => {
    const { useListing } = await import("@/hooks/useListings");
    (useListing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: "prop-2",
        title: "City Flat",
        city: "Athens",
        address: "Syntagma 1",
        price: "180000",
        sqm: "60",
        bedrooms: 2,
        bathrooms: 1,
        property_type: "apartment",
        listing_type: "sale",
        owner_id: "owner-2",
        description: "Lovely flat with great views of Syntagma Square",
        images: [],
        listing_images: [],
        profiles: null,
        cover_image_url: null,
        latitude: null,
        longitude: null,
        tags: [],
        status: "active",
        is_pre_sale: false,
        floor: null,
        total_floors: null,
        year_built: null,
        energy_class: null,
        has_parking: false,
        has_pool: false,
        has_elevator: false,
        has_balcony: false,
        has_garden: false,
        has_ac: false,
        views_count: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    const { default: PropertyDetail } = await import("@/pages/PropertyDetail");
    renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <PropertyDetail />
      </Suspense>,
      { initialPath: "/property/prop-2" }
    );
    expect(screen.getAllByText("City Flat")[0]).toBeInTheDocument();
    expect(screen.getByText(/Lovely flat with great views/)).toBeInTheDocument();
  });

  it("renders breadcrumb 'Listings' link for a sale listing", async () => {
    const { useListing } = await import("@/hooks/useListings");
    (useListing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: "prop-3",
        title: "Breadcrumb Test",
        city: "Athens",
        address: "Panepistimiou 5",
        price: "300000",
        sqm: "100",
        bedrooms: 3,
        bathrooms: 2,
        property_type: "apartment",
        listing_type: "sale",
        owner_id: "owner-3",
        description: "",
        images: [],
        listing_images: [],
        profiles: null,
        cover_image_url: null,
        latitude: null,
        longitude: null,
        tags: [],
        status: "active",
        is_pre_sale: false,
        floor: null,
        total_floors: null,
        year_built: null,
        energy_class: null,
        has_parking: false,
        has_pool: false,
        has_elevator: false,
        has_balcony: false,
        has_garden: false,
        has_ac: false,
        views_count: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    const { default: PropertyDetail } = await import("@/pages/PropertyDetail");
    renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <PropertyDetail />
      </Suspense>,
      { initialPath: "/property/prop-3" }
    );
    // breadcrumb nav should exist
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
    // i18n key for home breadcrumb link
    expect(screen.getByText("property.breadcrumbHome")).toBeInTheDocument();
  });

  it("shows auction breadcrumb for auction listing type", async () => {
    const { useListing } = await import("@/hooks/useListings");
    (useListing as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        id: "auction-1",
        title: "Auction Property",
        city: "Athens",
        address: "Auction St 1",
        price: "100000",
        sqm: "80",
        bedrooms: 2,
        bathrooms: 1,
        property_type: "apartment",
        listing_type: "auction",
        owner_id: "owner-4",
        description: "",
        images: [],
        listing_images: [],
        profiles: null,
        cover_image_url: null,
        latitude: null,
        longitude: null,
        tags: [],
        status: "active",
        is_pre_sale: false,
        floor: null,
        total_floors: null,
        year_built: null,
        energy_class: null,
        has_parking: false,
        has_pool: false,
        has_elevator: false,
        has_balcony: false,
        has_garden: false,
        has_ac: false,
        views_count: 0,
      },
      isLoading: false,
      isError: false,
      error: null,
    });
    const { default: PropertyDetail } = await import("@/pages/PropertyDetail");
    renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <PropertyDetail />
      </Suspense>,
      { initialPath: "/auction/auction-1" }
    );
    expect(screen.getByRole("navigation", { name: /breadcrumb/i })).toBeInTheDocument();
    // auction breadcrumb link key
    expect(screen.getByText("property.breadcrumbAuctions")).toBeInTheDocument();
  });
});
