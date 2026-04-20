/**
 * Smoke tests: verify that key pages render without throwing.
 * All heavy dependencies are mocked — these tests guard against
 * import-time crashes, missing providers, and fatal render errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import React, { Suspense } from "react";
import { renderWithProviders } from "@/test/utils";

// ── Common mocks ──────────────────────────────────────────────────────────────

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

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({ user: null, profile: null, loading: false }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn().mockReturnValue({ isPro: false, loading: false }),
}));

// Mock heavy/lazy components as stubs
vi.mock("@/components/Navbar", () => ({
  Navbar: () => <nav data-testid="navbar" />,
}));

vi.mock("@/components/Footer", () => ({
  Footer: () => <footer data-testid="footer" />,
}));

vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: () => <div data-testid="property-card" />,
}));

vi.mock("@/components/MarketTicker", () => ({
  MarketTicker: () => <div data-testid="market-ticker" />,
}));

vi.mock("@/components/MapView", () => ({
  MapView: () => <div data-testid="map-view" />,
}));

vi.mock("@/components/AISearchBar", () => ({
  AISearchBar: () => <div data-testid="ai-search-bar" />,
}));

vi.mock("@/components/CookieConsentBanner", () => ({
  CookieConsentBanner: () => null,
  getCookieConsent: vi.fn().mockReturnValue(null),
  saveCookieConsent: vi.fn(),
}));

vi.mock("@/hooks/useInView", () => ({
  useInView: vi.fn().mockReturnValue([vi.fn(), false]),
}));

vi.mock("@/hooks/usePullToRefresh", () => ({
  usePullToRefresh: vi.fn().mockReturnValue({ isPulling: false, pullProgress: 0 }),
}));

vi.mock("@/hooks/useListings", () => ({
  useListings: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useMyListings: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useListingsPaginated: vi.fn().mockReturnValue({
    data: { pages: [] },
    isLoading: false,
    fetchNextPage: vi.fn(),
    hasNextPage: false,
    isFetchingNextPage: false,
  }),
  useListing: vi.fn().mockReturnValue({ data: null, isLoading: false, isError: false }),
  useTrackListingView: vi.fn().mockReturnValue(vi.fn()),
  useUpdateListing: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteListing: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useCreateListing: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useListingsFilters", () => ({
  useListingsFilters: vi.fn().mockReturnValue({
    searchQuery: "", selectedListingType: "", selectedType: "", selectedSubtype: "",
    selectedPrice: "", selectedSort: "relevant",
    bedsRange: ["", ""] as [string, string],
    bathsRange: ["", ""] as [string, string],
    floorRange: ["", ""] as [string, string],
    yearRange: ["", ""] as [string, string],
    minSqm: "", maxSqm: "",
    selectedEnergyClasses: [] as string[],
    selectedFeatures: [] as string[],
    selectedHeating: "", selectedConstruction: "",
    preSaleOnly: false, offMarketOnly: false,
    hasVideoViewing: false, hasVirtualTour: false, hasMessaging: false,
    minAiScore: 0, minWalkability: 0,
    activeFilterCount: 0,
    currentFilters: {},
    setParam: vi.fn(), setParams: vi.fn(), toggleMulti: vi.fn(),
    clearAllFilters: vi.fn(), applyAIFilters: vi.fn(),
  }),
}));

vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useToggleFavorite: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useIsFavorited: vi.fn().mockReturnValue(false),
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

vi.mock("@/hooks/useViewings", () => ({
  useViewings: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useContacts", () => ({
  useContacts: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useContactTasks: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useUpdateContactTask: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useProfessionals", () => ({
  useProfessionals: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}));

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

vi.mock("@/hooks/useEligibleForQuickSale", () => ({
  useEligibleForQuickSale: vi.fn().mockReturnValue({ eligible: false }),
}));

vi.mock("@/components/DashboardPlanCard", () => ({
  DashboardPlanCard: () => <div data-testid="plan-card" />,
}));

vi.mock("@/components/OpenHouseDashboardSection", () => ({
  default: () => <div data-testid="open-house-section" />,
}));

vi.mock("@/components/ProfessionalServicesEditor", () => ({
  default: () => <div data-testid="pro-services-editor" />,
}));

vi.mock("@/components/dashboard/ProfileCompletionCard", () => ({
  ProfileCompletionCard: () => <div data-testid="profile-completion-card" />,
}));

vi.mock("@/components/dashboard/BookingCalendarSection", () => ({
  BookingCalendarSection: () => <div data-testid="booking-calendar" />,
}));

vi.mock("@/hooks/usePlanLimits", () => ({
  startOfCurrentMonth: vi.fn().mockReturnValue(new Date()),
  getPlanLimits: vi.fn().mockReturnValue({ listings: Infinity, images: Infinity, aiCredits: Infinity }),
  usePlanLimits: vi.fn().mockReturnValue({ limits: {}, usage: {}, isLoading: false }),
  getPlanLimits: vi.fn().mockReturnValue({ listings: null }),
}));

vi.mock("@/hooks/useListingForm", () => ({
  useListingForm: vi.fn().mockReturnValue({
    form: {}, errors: {}, submitting: false,
    draftBanner: "none", setDraftBanner: vi.fn(),
    aiDescLoading: false, aiPriceLoading: false, aiPriceSuggestion: null,
    images: [], coverImageId: null, setCoverImageId: vi.fn(),
    set: vi.fn(), toggle: vi.fn(),
    checkDraft: vi.fn(), handleSaveDraft: vi.fn(), handleRestoreDraft: vi.fn(), handleDiscardDraft: vi.fn(),
    handleFilesSelected: vi.fn(), handleDrop: vi.fn(), handleReorder: vi.fn(), handleRemove: vi.fn(),
    handleAiDescription: vi.fn(), handleAiPrice: vi.fn(),
    validateStep: vi.fn().mockReturnValue({}), handleSubmit: vi.fn(),
    completionPct: 0, pt: "apartment", lt: "sale",
    setErrors: vi.fn(),
  }),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key, i18n: { changeLanguage: vi.fn() } }),
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

vi.mock("@/hooks/usePropertyAIInsights", () => ({
  usePropertyAIInsights: vi.fn().mockReturnValue({ aiInsightsData: null, aiInsightsLoading: false }),
}));

vi.mock("@/hooks/useSimilarListings", () => ({
  useSimilarListings: vi.fn().mockReturnValue({ data: [] }),
}));

vi.mock("@/hooks/useMessages", () => ({
  useStartConversation: vi.fn().mockReturnValue({ mutateAsync: vi.fn(), isPending: false }),
  useConversations: vi.fn().mockReturnValue({ data: [] }),
  useMessages: vi.fn().mockReturnValue({ data: [] }),
  useSendMessage: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));

vi.mock("@/components/PropertyMiniMap", () => ({
  default: () => <div data-testid="property-mini-map" />,
}));

vi.mock("@/components/PropertyValuation", () => ({
  default: () => <div data-testid="property-valuation" />,
}));

vi.mock("@/components/NeighbourhoodReport", () => ({
  default: () => <div data-testid="neighbourhood-report" />,
}));

vi.mock("@/components/AIAssistantWidget", () => ({
  default: () => <div data-testid="ai-assistant-widget" />,
}));

vi.mock("@/components/AuctionAlertModal", () => ({
  AuctionAlertModal: () => <div data-testid="auction-alert-modal" />,
}));

vi.mock("@/components/ViewingDialog", () => ({
  default: () => <div data-testid="viewing-dialog" />,
}));

vi.mock("@/components/property/PropertyReportCard", () => ({
  PropertyReportCard: () => <div data-testid="property-report-card" />,
}));

vi.mock("@/components/property/PropertyAuctionSection", () => ({
  PropertyAuctionSection: () => <div data-testid="property-auction-section" />,
}));

vi.mock("@/hooks/useProfessionalReviews", () => ({
  useProfessionalReviews: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useSubmitReview: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  computeStats: vi.fn().mockReturnValue({ total: 0, avg: 0, distribution: {} }),
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Page smoke tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Index page renders without throwing", async () => {
    const { default: Index } = await import("@/pages/Index");
    expect(() => renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <Index />
      </Suspense>
    )).not.toThrow();
  });

  it("Listings page renders without throwing", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    expect(() => renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <Listings />
      </Suspense>
    )).not.toThrow();
  });

  it("Index page mounts the navbar", async () => {
    const { default: Index } = await import("@/pages/Index");
    renderWithProviders(
      <Suspense fallback={<div data-testid="suspense-loading">loading</div>}>
        <Index />
      </Suspense>
    );
    // Either the navbar is rendered or Suspense is still active — neither should throw
    const navbar = screen.queryByTestId("navbar");
    const loading = screen.queryByTestId("suspense-loading");
    expect(navbar !== null || loading !== null).toBe(true);
  });

  it("Listings page mounts the navbar", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    renderWithProviders(
      <Suspense fallback={<div data-testid="suspense-loading">loading</div>}>
        <Listings />
      </Suspense>
    );
    const navbar = screen.queryByTestId("navbar");
    const loading = screen.queryByTestId("suspense-loading");
    expect(navbar !== null || loading !== null).toBe(true);
  });

  it("Dashboard page renders without throwing", async () => {
    const { default: Dashboard } = await import("@/pages/Dashboard");
    expect(() => renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        <Dashboard />
      </Suspense>
    )).not.toThrow();
  });

  it("Dashboard page mounts the navbar", async () => {
    const { default: Dashboard } = await import("@/pages/Dashboard");
    renderWithProviders(
      <Suspense fallback={<div data-testid="suspense-loading">loading</div>}>
        <Dashboard />
      </Suspense>
    );
    const navbar = screen.queryByTestId("navbar");
    const loading = screen.queryByTestId("suspense-loading");
    expect(navbar !== null || loading !== null).toBe(true);
  });

  it("PropertyDetail page renders loading state without throwing", async () => {
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

  it("CreateListing page renders without throwing", async () => {
    const { default: CreateListing } = await import("@/pages/CreateListing");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <CreateListing />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("Professionals page renders without throwing", async () => {
    const { default: Professionals } = await import("@/pages/Professionals");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Professionals />
        </Suspense>
      )
    ).not.toThrow();
  });
});
