/**
 * Smoke tests: verify that key pages render without throwing.
 * All heavy dependencies are mocked — these tests guard against
 * import-time crashes, missing providers, and fatal render errors.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen } from "@testing-library/react";
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
  useAuth: vi.fn().mockReturnValue({
    user: null, profile: null, loading: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
  }),
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
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
  useToggleSavedSearchAlert: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useLeads", () => ({
  useLeads: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useCreateLead: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateLead: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
  useDeleteLead: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useViewings", () => ({
  useViewings: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useUpdateViewing: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useContacts", () => ({
  useContacts: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useContactTasks: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useUpdateContactTask: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useProfessionals", () => ({
  useProfessionals: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useProfessional: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useProfessionalByUserId: vi.fn().mockReturnValue({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/useProfessionalServices", () => ({
  useProfessionalServices: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useProfessionalAvailability: vi.fn().mockReturnValue({ data: [], isLoading: false }),
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

vi.mock("@/hooks/useCreateListingConnections", () => ({
  useCreateListingConnections: vi.fn().mockReturnValue({
    supabaseOk: true,
    storageOk: true,
    locationSource: "nominatim",
    locationOk: true,
    loading: false,
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
  APP_ORIGIN: "https://example.com",
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
  useMarkMessagesRead: vi.fn().mockReturnValue({ mutate: vi.fn() }),
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

// ── Additional hook mocks ─────────────────────────────────────────────────────

vi.mock("@/hooks/useAuctionListings", () => ({
  useAuctionListings: vi.fn().mockReturnValue({ data: [], isLoading: false }),
}));

vi.mock("@/hooks/useFiresaleInterest", () => ({
  useMyFiresaleInterest: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useMyFiresaleInterests: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useFiresaleInterestQueue: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useExpressInterest: vi.fn().mockReturnValue({ mutate: vi.fn(), isPending: false }),
  useUpdateInterestStatus: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/usePortfolios", () => ({
  usePortfolios: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  usePortfolio: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useCreatePortfolio: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdatePortfolio: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeletePortfolio: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useProjects", () => ({
  useProjects: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useProject: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useCreateProject: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useUpdateProject: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteProject: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useOpenHouseAssetControl", () => ({
  useOpenHouseSettings: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useUpsertOpenHouseSettings: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useOpenHouseRegistrations: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useMyOpenHouseRegistrations: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useCreateOpenHouseRegistration: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateOpenHouseRegistration: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useOpenHouseOffers: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useMyOpenHouseOffers: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useSubmitOpenHouseOffer: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateOpenHouseOffer: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useAcceptOpenHouseOffer: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useRevealAllOffers: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  uploadOpenHouseDoc: vi.fn().mockResolvedValue(""),
  getOpenHouseDocSignedUrl: vi.fn().mockResolvedValue(""),
}));

vi.mock("@/hooks/usePricingConfigs", () => ({
  PRICING_KEYS: { AGENT_BASIC: "agent_basic", AGENT_PRO: "agent_pro" },
  INVESTOR_TIER_TO_KEY: {},
  usePricingConfigs: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  formatPrice: vi.fn().mockReturnValue("€0"),
}));

vi.mock("@/hooks/useProjectLeads", () => ({
  useProjectLeads: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useCreateProjectLead: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateProjectLead: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
  useDeleteProjectLead: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useProjectMedia", () => ({
  useProjectMedia: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useAddProjectMedia: vi.fn().mockReturnValue({ mutate: vi.fn(), mutateAsync: vi.fn() }),
  useDeleteProjectMedia: vi.fn().mockReturnValue({ mutate: vi.fn() }),
}));

vi.mock("@/hooks/useProjectUnits", () => ({
  useProjectUnits: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useCreateProjectUnit: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useUpdateProjectUnit: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
  useBulkUpdateProjectUnitPrices: vi.fn().mockReturnValue({ mutate: vi.fn() }),
  useDeleteProjectUnit: vi.fn().mockReturnValue({ mutateAsync: vi.fn() }),
}));

vi.mock("@/hooks/useProjectViews", () => ({
  useProjectViews: vi.fn().mockReturnValue({ data: null, isLoading: false }),
  useRecordProjectView: vi.fn().mockReturnValue(vi.fn()),
}));

vi.mock("@/hooks/useFormWizard", () => ({
  useFormWizard: vi.fn().mockReturnValue({
    step: "type", stepIndex: 0, steps: [], goTo: vi.fn(),
    goNext: vi.fn(), goPrev: vi.fn(), next: vi.fn(), prev: vi.fn(),
    isFirst: true, isLast: false, progress: 0,
  }),
}));

vi.mock("@/hooks/useAnalytics", () => ({
  useListingViewTrends: vi.fn().mockReturnValue({ data: [], isLoading: false }),
  useLeadFunnel: vi.fn().mockReturnValue({ data: null, isLoading: false }),
}));

vi.mock("@/hooks/usePrivateOwnerAdAlert", () => ({
  usePrivateOwnerAdAlert: vi.fn().mockReturnValue({ data: null, isLoading: false, refetch: vi.fn() }),
}));

vi.mock("@/hooks/useModal", () => ({
  useModal: vi.fn().mockReturnValue({ isOpen: false, open: vi.fn(), close: vi.fn() }),
}));

// ── Additional component mocks ────────────────────────────────────────────────

vi.mock("@/components/auctions/AuctionCard", () => ({
  AuctionCard: () => <div data-testid="auction-card" />,
  PremiumBadge: () => <span />,
}));

vi.mock("@/components/auctions/AuctionHero", () => ({
  AuctionHero: () => <div data-testid="auction-hero" />,
}));

vi.mock("@/components/auctions/AuctionAlertBanner", () => ({
  AuctionAlertBanner: () => <div data-testid="auction-alert-banner" />,
}));

vi.mock("@/components/ProAIToolsWidget", () => ({
  default: () => <div data-testid="pro-ai-tools" />,
}));

vi.mock("@/components/RoleSwitchModal", () => ({
  RoleSwitchModal: () => <div data-testid="role-switch-modal" />,
}));

vi.mock("@/components/InvitationRequestModal", () => ({
  InvitationRequestModal: () => <div data-testid="invitation-request-modal" />,
}));

vi.mock("@/components/firesale/FiresaleInvestorPanel", () => ({
  FiresaleInvestorPanel: () => <div data-testid="firesale-investor-panel" />,
}));

vi.mock("@/components/firesale/FiresaleQuickSaleForm", () => ({
  FiresaleQuickSaleForm: () => <div data-testid="firesale-quick-sale-form" />,
}));

vi.mock("@/components/open-houses/OpenHousePrimitives", () => ({
  fmtDate: vi.fn().mockReturnValue(""),
  fmtTime: vi.fn().mockReturnValue(""),
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  RangeInput: () => <input />,
  OpenHouseCard: () => <div data-testid="open-house-card" />,
}));

vi.mock("@/components/onboarding/OnboardingShell", () => ({
  OnboardingShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/onboarding/DoneScreen", () => ({
  DoneScreen: () => <div data-testid="done-screen" />,
}));

vi.mock("@/components/onboarding/PickTypeStep", () => ({
  PickTypeStep: () => <div data-testid="pick-type-step" />,
}));

vi.mock("@/components/onboarding/ProServicesStep", () => ({
  ProServicesStep: () => <div data-testid="pro-services-step" />,
}));

vi.mock("@/components/onboarding/PickParticipantGoalStep", () => ({
  PickParticipantGoalStep: () => <div data-testid="pick-participant-goal-step" />,
}));

vi.mock("@/components/onboarding/PickProTypeStep", () => ({
  PickProTypeStep: () => <div data-testid="pick-pro-type-step" />,
}));

vi.mock("@/components/onboarding/ProCategoryStep", () => ({
  ProCategoryStep: () => <div data-testid="pro-category-step" />,
}));

vi.mock("@/components/onboarding/ProVerifyStep", () => ({
  ProVerifyStep: () => <div data-testid="pro-verify-step" />,
}));

vi.mock("@/components/api/ApiDocComponents", () => ({
  CodeBlock: ({ code }: { code: string }) => <pre>{code}</pre>,
  EndpointCard: () => <div data-testid="endpoint-card" />,
}));

vi.mock("@/components/AdminFiresalePipeline", () => ({
  default: () => <div data-testid="admin-firesale-pipeline" />,
}));

vi.mock("@/components/AdminInvestorScreening", () => ({
  default: () => <div data-testid="admin-investor-screening" />,
}));

vi.mock("@/components/AdminSubscribers", () => ({
  default: () => <div data-testid="admin-subscribers" />,
}));

vi.mock("@/components/AdminPanel", () => ({
  default: () => <div data-testid="admin-panel" />,
}));

vi.mock("@/components/AdminReports", () => ({
  default: () => <div data-testid="admin-reports" />,
}));

vi.mock("@/components/AdminInvitationRequests", () => ({
  default: () => <div data-testid="admin-invitation-requests" />,
}));

vi.mock("@/components/AdminFeaturedListings", () => ({
  default: () => <div data-testid="admin-featured-listings" />,
}));

vi.mock("@/components/AdminProfessionalVerification", () => ({
  AdminProfessionalVerification: () => <div data-testid="admin-prof-verification" />,
}));

vi.mock("@/components/POFVerificationPanel", () => ({
  POFVerificationPanel: () => <div data-testid="pof-verification-panel" />,
}));

vi.mock("@/components/investor/InvestorHeroHeader", () => ({
  InvestorHeroHeader: () => <div data-testid="investor-hero-header" />,
}));

vi.mock("@/components/investor/InvestorExpiryBanner", () => ({
  InvestorExpiryBanner: () => null,
}));

vi.mock("@/components/investor/InvestorAccessGate", () => ({
  InvestorAccessGate: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/components/investor/InvestorSidebarAnalytics", () => ({
  InvestorSidebarAnalytics: () => <div data-testid="investor-sidebar-analytics" />,
}));

vi.mock("@/components/OpenHouseRegistrationDialog", () => ({
  default: () => <div data-testid="open-house-registration-dialog" />,
}));

vi.mock("@/components/OpenHouseAssetControlPanel", () => ({
  default: () => <div data-testid="open-house-asset-control-panel" />,
}));

vi.mock("@/components/OpenHouseOfferDialog", () => ({
  default: () => <div data-testid="open-house-offer-dialog" />,
}));

vi.mock("@/components/property/DetailPrimitives", () => ({
  DetailRow: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
  FeatureSection: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

// ── Tests ─────────────────────────────────────────────────────────────────────

const renderWithSettledSuspense = async (ui: React.ReactElement, options?: { initialPath?: string }) => {
  let result: ReturnType<typeof renderWithProviders> | undefined;

  await act(async () => {
    result = renderWithProviders(
      <Suspense fallback={<div>loading</div>}>
        {ui}
      </Suspense>,
      options
    );
  });

  await act(async () => {
    for (let i = 0; i < 10; i += 1) {
      await Promise.resolve();
    }
  });

  return result;
};

const preloadIndexLazyDependencies = async () => {
  await import("@/components/Footer");
};

const preloadListingsLazyDependencies = async () => {
  await Promise.all([
    import("@/components/MapView"),
    import("@/components/CompareDrawer"),
  ]);
};

const preloadDashboardLazyDependencies = async () => {
  await Promise.all([
    import("@/pages/dashboard/ViewingsTab"),
    import("@/pages/dashboard/SavedSearchesTab"),
    import("@/pages/dashboard/AuctionsTab"),
    import("@/pages/dashboard/ProjectsTab"),
    import("@/pages/dashboard/PortfoliosTab"),
    import("@/pages/dashboard/AnalyticsTab"),
    import("@/pages/dashboard/BillingTab"),
    import("@/pages/dashboard/DataInputTab"),
  ]);
};

describe("Page smoke tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("Index page renders without throwing", async () => {
    const { default: Index } = await import("@/pages/Index");
    await preloadIndexLazyDependencies();
    await expect(renderWithSettledSuspense(<Index />)).resolves.toBeDefined();
  });

  it("Listings page renders without throwing", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    await preloadListingsLazyDependencies();
    await expect(renderWithSettledSuspense(<Listings />)).resolves.toBeDefined();
  });

  it("Index page mounts the navbar", async () => {
    const { default: Index } = await import("@/pages/Index");
    await preloadIndexLazyDependencies();
    await renderWithSettledSuspense(<Index />);
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });

  it("Listings page mounts the navbar", async () => {
    const { default: Listings } = await import("@/pages/Listings");
    await preloadListingsLazyDependencies();
    await renderWithSettledSuspense(<Listings />);
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
  });

  it("Dashboard page renders without throwing", async () => {
    const { default: Dashboard } = await import("@/pages/Dashboard");
    await preloadDashboardLazyDependencies();
    await expect(renderWithSettledSuspense(<Dashboard />)).resolves.toBeDefined();
  });

  it("Dashboard page mounts the navbar", async () => {
    const { default: Dashboard } = await import("@/pages/Dashboard");
    await preloadDashboardLazyDependencies();
    await renderWithSettledSuspense(<Dashboard />);
    expect(screen.getByTestId("navbar")).toBeInTheDocument();
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

  // ── Static / simple pages ───────────────────────────────────────────────────

  it("NotFound page renders without throwing", async () => {
    const { default: NotFound } = await import("@/pages/NotFound");
    expect(() => renderWithProviders(<NotFound />)).not.toThrow();
  });

  it("Contact page renders without throwing", async () => {
    const { default: Contact } = await import("@/pages/Contact");
    expect(() => renderWithProviders(<Contact />)).not.toThrow();
  });

  it("CookiePolicy page renders without throwing", async () => {
    const { default: CookiePolicy } = await import("@/pages/CookiePolicy");
    expect(() => renderWithProviders(<CookiePolicy />)).not.toThrow();
  });

  it("PrivacyPolicy page renders without throwing", async () => {
    const { default: PrivacyPolicy } = await import("@/pages/PrivacyPolicy");
    expect(() => renderWithProviders(<PrivacyPolicy />)).not.toThrow();
  });

  it("TermsOfService page renders without throwing", async () => {
    const { default: TermsOfService } = await import("@/pages/TermsOfService");
    expect(() => renderWithProviders(<TermsOfService />)).not.toThrow();
  });

  it("ApiDocs page renders without throwing", async () => {
    const { default: ApiDocs } = await import("@/pages/ApiDocs");
    expect(() => renderWithProviders(<ApiDocs />)).not.toThrow();
  });

  it("PlatformMap page renders without throwing", async () => {
    const { default: PlatformMap } = await import("@/pages/PlatformMap");
    expect(() => renderWithProviders(<PlatformMap />)).not.toThrow();
  });

  // ── Auth pages ──────────────────────────────────────────────────────────────

  it("Login page renders without throwing", async () => {
    const { default: Login } = await import("@/pages/Login");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Login />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("Signup page renders without throwing", async () => {
    const { default: Signup } = await import("@/pages/Signup");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Signup />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("ResetPassword page renders without throwing", async () => {
    const { default: ResetPassword } = await import("@/pages/ResetPassword");
    expect(() => renderWithProviders(<ResetPassword />)).not.toThrow();
  });

  // ── Feature pages ───────────────────────────────────────────────────────────

  it("AIAssistantPage renders without throwing", async () => {
    const { default: AIAssistantPage } = await import("@/pages/AIAssistantPage");
    await expect(renderWithSettledSuspense(<AIAssistantPage />)).resolves.toBeDefined();
  });

  it("Auctions page renders without throwing", async () => {
    const { default: Auctions } = await import("@/pages/Auctions");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Auctions />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("AuctionDetail page renders not-found state without throwing", async () => {
    const { default: AuctionDetail } = await import("@/pages/AuctionDetail");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <AuctionDetail />
        </Suspense>,
        { initialPath: "/auctions/test-auction-id" }
      )
    ).not.toThrow();
  });

  it("Firesale page renders without throwing", async () => {
    const { default: Firesale } = await import("@/pages/Firesale");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Firesale />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("OpenHouses page renders without throwing", async () => {
    const { default: OpenHouses } = await import("@/pages/OpenHouses");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <OpenHouses />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("OpenHouseDetail page renders without throwing", async () => {
    const { default: OpenHouseDetail } = await import("@/pages/OpenHouseDetail");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <OpenHouseDetail />
        </Suspense>,
        { initialPath: "/open-houses/test-id" }
      )
    ).not.toThrow();
  });

  it("Messages page renders without throwing", async () => {
    const { default: Messages } = await import("@/pages/Messages");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Messages />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("Portfolios page renders without throwing", async () => {
    const { default: Portfolios } = await import("@/pages/Portfolios");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Portfolios />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("Projects page renders without throwing", async () => {
    const { default: Projects } = await import("@/pages/Projects");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Projects />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("ProjectDetail page renders without throwing", async () => {
    const { default: ProjectDetail } = await import("@/pages/ProjectDetail");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <ProjectDetail />
        </Suspense>,
        { initialPath: "/projects/test-id" }
      )
    ).not.toThrow();
  });

  it("Pricing page renders without throwing", async () => {
    const { default: Pricing } = await import("@/pages/Pricing");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Pricing />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("Onboarding page renders without throwing", async () => {
    const { default: Onboarding } = await import("@/pages/Onboarding");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <Onboarding />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("ProfessionalProfile page renders without throwing", async () => {
    const { default: ProfessionalProfile } = await import("@/pages/ProfessionalProfile");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <ProfessionalProfile />
        </Suspense>,
        { initialPath: "/professionals/test-id" }
      )
    ).not.toThrow();
  });

  it("ProfessionalProfileMe page renders without throwing", async () => {
    const { default: ProfessionalProfileMe } = await import("@/pages/ProfessionalProfileMe");
    expect(() => renderWithProviders(<ProfessionalProfileMe />)).not.toThrow();
  });

  it("NewBuildDetail page renders without throwing", async () => {
    const { default: NewBuildDetail } = await import("@/pages/NewBuildDetail");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <NewBuildDetail />
        </Suspense>,
        { initialPath: "/new-builds/test-id" }
      )
    ).not.toThrow();
  });

  it("InvestorDashboard page renders without throwing", async () => {
    const { default: InvestorDashboard } = await import("@/pages/InvestorDashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <InvestorDashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("AdminDashboard page renders without throwing", async () => {
    const { default: AdminDashboard } = await import("@/pages/AdminDashboard");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <AdminDashboard />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("BrandedVideoRoom page renders without throwing", async () => {
    const { default: BrandedVideoRoom } = await import("@/pages/BrandedVideoRoom");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <BrandedVideoRoom />
        </Suspense>,
        { initialPath: "/video/test-id" }
      )
    ).not.toThrow();
  });

  it("CreateNewBuildingListing page renders without throwing", async () => {
    const { default: CreateNewBuildingListing } = await import("@/pages/CreateNewBuildingListing");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <CreateNewBuildingListing />
        </Suspense>
      )
    ).not.toThrow();
  });

  it("DocumentTemplates page renders without throwing", async () => {
    const { default: DocumentTemplates } = await import("@/pages/DocumentTemplates");
    expect(() =>
      renderWithProviders(
        <Suspense fallback={<div>loading</div>}>
          <DocumentTemplates />
        </Suspense>
      )
    ).not.toThrow();
  });

  // ── Dashboard sub-tabs ──────────────────────────────────────────────────────

  it("AnalyticsTab renders without throwing", async () => {
    const { default: AnalyticsTab } = await import("@/pages/dashboard/AnalyticsTab");
    expect(() => renderWithProviders(<AnalyticsTab />)).not.toThrow();
  });

  it("AuctionsTab renders without throwing", async () => {
    const { default: AuctionsTab } = await import("@/pages/dashboard/AuctionsTab");
    expect(() => renderWithProviders(<AuctionsTab />)).not.toThrow();
  });

  it("BillingTab renders without throwing", async () => {
    const { default: BillingTab } = await import("@/pages/dashboard/BillingTab");
    expect(() => renderWithProviders(<BillingTab />)).not.toThrow();
  });

  it("PortfoliosTab renders without throwing", async () => {
    const { default: PortfoliosTab } = await import("@/pages/dashboard/PortfoliosTab");
    expect(() => renderWithProviders(<PortfoliosTab />)).not.toThrow();
  });

  it("ProjectsTab renders without throwing", async () => {
    const { default: ProjectsTab } = await import("@/pages/dashboard/ProjectsTab");
    expect(() => renderWithProviders(<ProjectsTab />)).not.toThrow();
  });

  it("SavedSearchesTab renders without throwing", async () => {
    const { default: SavedSearchesTab } = await import("@/pages/dashboard/SavedSearchesTab");
    expect(() => renderWithProviders(<SavedSearchesTab />)).not.toThrow();
  });

  it("ViewingsTab renders without throwing", async () => {
    const { default: ViewingsTab } = await import("@/pages/dashboard/ViewingsTab");
    expect(() => renderWithProviders(<ViewingsTab />)).not.toThrow();
  });
});
