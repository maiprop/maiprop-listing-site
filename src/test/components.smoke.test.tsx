// @ts-nocheck — render-smoke harness: passes minimal stub props to ~75 heterogeneous
// components solely to verify their JSX boundary doesn't throw. Strict prop typing
// would require building exhaustive fixtures for every component and is out of
// scope for a smoke pass. Runtime errors still surface via render() rejecting.
/**
 * Component smoke tests — renders every non-ui component with real hooks
 * (hooks are NOT mocked; only infrastructure is mocked so hook code gets coverage too).
 *
 * `any` is allowed here because chainable Supabase mocks and dynamic
 * vi.mock factories produce union types that aren't worth fighting in test code.
 */
/* eslint-disable @typescript-eslint/no-explicit-any */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React, { Suspense } from "react";
import { act, cleanup, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

// ── requestAnimationFrame stub (not in jsdom) ─────────────────────────────────
if (!window.requestAnimationFrame) {
  window.requestAnimationFrame = (cb: FrameRequestCallback) => setTimeout(cb, 0) as unknown as number;
  window.cancelAnimationFrame = (id: number) => clearTimeout(id);
}
if (!window.crypto?.randomUUID) {
  Object.defineProperty(window, "crypto", {
    value: { randomUUID: () => "test-uuid-" + Math.random() },
    writable: true,
  });
}
Object.defineProperty(navigator, "clipboard", {
  value: { writeText: vi.fn().mockResolvedValue(undefined) },
  writable: true,
});

// ── Infrastructure mocks ──────────────────────────────────────────────────────

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      neq: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      not: vi.fn().mockReturnThis(),
      gte: vi.fn().mockReturnThis(),
      lte: vi.fn().mockReturnThis(),
      gt: vi.fn().mockReturnThis(),
      lt: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      like: vi.fn().mockReturnThis(),
      or: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      range: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      filter: vi.fn().mockReturnThis(),
      contains: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
      maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
      then: (r: (v: unknown) => void) => Promise.resolve({ data: [], error: null }).then(r),
    }),
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
      getSession: vi.fn().mockResolvedValue({ data: { session: null }, error: null }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ data: { user: null, session: null }, error: null }),
      signOut: vi.fn().mockResolvedValue({ error: null }),
      signInWithOAuth: vi.fn().mockResolvedValue({ error: null }),
    },
    functions: { invoke: vi.fn().mockResolvedValue({ data: null, error: null }) },
    storage: {
      from: vi.fn().mockReturnValue({
        upload: vi.fn().mockResolvedValue({ error: null }),
        getPublicUrl: vi.fn().mockReturnValue({ data: { publicUrl: "" } }),
        createSignedUrl: vi.fn().mockResolvedValue({ data: { signedUrl: "" }, error: null }),
      }),
    },
    rpc: vi.fn().mockResolvedValue({ data: null, error: null }),
    channel: vi.fn().mockReturnValue({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
    }),
    removeChannel: vi.fn(),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn().mockReturnValue({
    user: null, profile: null, loading: false, profileLoading: false,
    subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
    needsOnboarding: false,
    signIn: vi.fn().mockResolvedValue({ error: null }),
    signUp: vi.fn().mockResolvedValue({ error: null }),
    signOut: vi.fn().mockResolvedValue(undefined),
    updateProfile: vi.fn().mockResolvedValue({ error: null }),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    refreshSubscription: vi.fn().mockResolvedValue(undefined),
  }),
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (k: string) => k,
    i18n: {
      changeLanguage: vi.fn((language: string) => {
        globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = language;
        return Promise.resolve(language);
      }),
      get language() {
        return globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ ?? "en";
      },
    },
  }),
  initReactI18next: { type: "3rdParty", init: vi.fn() },
  Trans: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

// react-router-dom: keep real hooks and providers (the test wrapper depends on
// MemoryRouter), but stub <Navigate> to render null. The smoke harness mounts
// guard components like <ProtectedRoute> in isolation — without a containing
// <Routes>, React-Router v7's <Navigate> imperatively pushes onto history,
// which re-renders the same guard, which re-renders <Navigate>, and so on
// until V8 exhausts its heap. Returning null here exits the loop while still
// exercising the guard's render path (which is what this smoke test cares
// about).
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>(
    "react-router-dom",
  );
  return { ...actual, Navigate: () => null };
});

vi.mock("react-map-gl", () => ({
  default: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Map: ({ children }: { children?: React.ReactNode }) => <div data-testid="map">{children}</div>,
  Marker: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  NavigationControl: () => null,
  Popup: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Source: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
  Layer: () => null,
}));

vi.mock("recharts", () => {
  const stub = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: stub,
    LineChart: stub, BarChart: stub, PieChart: stub, AreaChart: stub,
    Line: () => null, Bar: () => null, Pie: () => null, Area: () => null,
    XAxis: () => null, YAxis: () => null, CartesianGrid: () => null,
    Tooltip: () => null, Legend: () => null, Cell: () => null,
    ReferenceLine: () => null,
  };
});

vi.mock("@/lib/config", () => ({
  getStreetViewProxyUrl: vi.fn().mockReturnValue(""),
  SUPABASE_URL: "https://example.supabase.co",
  SUPABASE_ANON_KEY: "test-anon-key",
  MAPBOX_TOKEN: "",
  GOOGLE_MAPS_API_KEY: "",
  APP_ORIGIN: "https://example.com",
  PROJECT_ID: "test",
}));

// ── Shared mock data ──────────────────────────────────────────────────────────

const MOCK_LISTING = {
  id: "listing-1",
  title: "Test Apartment",
  address: "123 Test St",
  city: "Athens",
  price: 200000,
  sqm: 80,
  images: [],
  type: "apartment" as const,
  listingType: "sale" as const,
  bedrooms: 2,
  bathrooms: 1,
  propertyType: "apartment",
  listing_type: "sale",
  status: "active",
  user_id: "user-1",
  cover_image_url: null,
  latitude: 37.9755,
  longitude: 23.7348,
  tags: [],
  year_built: 2010,
};

const MOCK_AUCTION = {
  id: "auction-1",
  title: "Test Auction",
  city: "Athens",
  address: "123 Test St",
  price: 150000,
  auction_starting_bid: 100000,
  auction_date: "2026-06-01",
  auction_court: "Athens Court",
  property_type: "apartment",
  cover_image_url: null,
  sqm: 80,
  bedrooms: 2,
  bathrooms: 1,
  latitude: 37.9,
  longitude: 23.7,
  tags: [],
  year_built: 2005,
  is_featured: false,
};

const MOCK_PROFESSIONAL = {
  id: "pro-1",
  user_id: "user-1",
  display_name: "Test Pro",
  title: "Real Estate Agent",
  bio: "Test bio",
  city: "Athens",
  category: "agent",
  avatar_url: null,
  is_verified: false,
  hourly_rate: 50,
  specialties: [],
  languages: ["en"],
  video_link: null,
};

const noop = () => {};
const asyncNoop = async () => {};

const flushSmokeEffects = async () => {
  await Promise.resolve();
  await new Promise((resolve) => setTimeout(resolve, 0));
};

async function expectRenderWithProvidersNotToThrow(ui: React.ReactElement) {
  await act(async () => {
    expect(() => renderWithProviders(ui)).not.toThrow();
    await flushSmokeEffects();
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("Component smoke tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  // ── Navigation / Layout ────────────────────────────────────────────────────

  it("Navbar renders without throwing", async () => {
    const { Navbar } = await import("@/components/Navbar");
    expect(() => renderWithProviders(<Navbar />)).not.toThrow();
  }, 10_000);

  it("Footer renders without throwing", async () => {
    const { Footer } = await import("@/components/Footer");
    expect(() => renderWithProviders(<Footer />)).not.toThrow();
  });

  it("BottomNav renders without throwing", async () => {
    const { BottomNav } = await import("@/components/BottomNav");
    expect(() => renderWithProviders(<BottomNav />)).not.toThrow();
  });

  it("NavLink renders without throwing", async () => {
    const { NavLink } = await import("@/components/NavLink");
    expect(() => renderWithProviders(<NavLink to="/" label="Home" icon={<span />} />)).not.toThrow();
  });

  it("PageLayout renders without throwing", async () => {
    const { PageLayout } = await import("@/components/layouts/PageLayout");
    expect(() => renderWithProviders(<PageLayout><div /></PageLayout>)).not.toThrow();
  });

  // ── Route guards ───────────────────────────────────────────────────────────

  it("ProtectedRoute renders without throwing", async () => {
    const { ProtectedRoute } = await import("@/components/ProtectedRoute");
    expect(() => renderWithProviders(<ProtectedRoute><div /></ProtectedRoute>)).not.toThrow();
  });

  it("AdminRoute renders without throwing", async () => {
    const { AdminRoute } = await import("@/components/AdminRoute");
    expect(() => renderWithProviders(<AdminRoute><div /></AdminRoute>)).not.toThrow();
  });

  it("InvestorRoute renders without throwing", async () => {
    const { InvestorRoute } = await import("@/components/InvestorRoute");
    expect(() => renderWithProviders(<InvestorRoute><div /></InvestorRoute>)).not.toThrow();
  });

  it("SellerRoute renders without throwing", async () => {
    const { SellerRoute } = await import("@/components/SellerRoute");
    expect(() => renderWithProviders(<SellerRoute><div /></SellerRoute>)).not.toThrow();
  });

  // ── Simple UI components ───────────────────────────────────────────────────

  it("PropertyCardSkeleton renders without throwing", async () => {
    const { PropertyCardSkeleton } = await import("@/components/PropertyCardSkeleton");
    expect(() => renderWithProviders(<PropertyCardSkeleton />)).not.toThrow();
  });

  it("LanguageSwitcher renders without throwing", async () => {
    const { LanguageSwitcher } = await import("@/components/LanguageSwitcher");
    expect(() => renderWithProviders(<LanguageSwitcher />)).not.toThrow();
  });

  it("SignInForAI renders without throwing", async () => {
    const { SignInForAI } = await import("@/components/SignInForAI");
    expect(() => renderWithProviders(<SignInForAI />)).not.toThrow();
  });

  it("ErrorBoundary renders without throwing", async () => {
    const { ErrorBoundary } = await import("@/components/ErrorBoundary");
    expect(() => renderWithProviders(<ErrorBoundary><div>test</div></ErrorBoundary>)).not.toThrow();
  });

  it("ROICalculator renders without throwing", async () => {
    const { ROICalculator } = await import("@/components/ROICalculator");
    expect(() => renderWithProviders(<ROICalculator />)).not.toThrow();
  });

  it("CookieConsentBanner renders without throwing", async () => {
    const { CookieConsentBanner } = await import("@/components/CookieConsentBanner");
    expect(() => renderWithProviders(<CookieConsentBanner />)).not.toThrow();
  });

  // ── Listings primitives ────────────────────────────────────────────────────

  it("FilterChip renders without throwing", async () => {
    const { FilterChip } = await import("@/components/listings/FilterChip");
    expect(() => renderWithProviders(<FilterChip label="Test" onRemove={noop} />)).not.toThrow();
  });

  it("ListingTypeButton renders without throwing", async () => {
    const { ListingTypeButton } = await import("@/components/listings/ListingTypeButton");
    expect(() => renderWithProviders(<ListingTypeButton type="sale" selected={false} onSelect={noop} />)).not.toThrow();
  });

  it("PropertyTypeButton renders without throwing", async () => {
    const { PropertyTypeButton } = await import("@/components/listings/PropertyTypeButton");
    expect(() => renderWithProviders(<PropertyTypeButton type="apartment" selected={false} onSelect={noop} />)).not.toThrow();
  });

  it("FormPrimitives renders without throwing", async () => {
    const { FieldLabel, FormInput } = await import("@/components/listings/FormPrimitives");
    expect(() => renderWithProviders(<FieldLabel>Test</FieldLabel>)).not.toThrow();
    expect(() => renderWithProviders(<FormInput value="" onChange={noop} placeholder="test" />)).not.toThrow();
  });

  it("MapGate renders without throwing", async () => {
    const { MapGate } = await import("@/components/listings/MapGate");
    expect(() => renderWithProviders(
      <MapGate consent={{ mapping: true, accepted: true }} accept={noop}><div /></MapGate>
    )).not.toThrow();
  });

  it("ImageGallery renders without throwing", async () => {
    const { ImageGallery } = await import("@/components/listings/ImageGallery");
    expect(() => renderWithProviders(<ImageGallery images={[]} />)).not.toThrow();
  });

  it("ListingsAdvancedFilters renders without throwing", async () => {
    const { ListingsAdvancedFilters } = await import("@/components/listings/ListingsAdvancedFilters");
    expect(() => renderWithProviders(
      <ListingsAdvancedFilters open={false} onClose={noop} currentFilters={{}} onApply={noop} />
    )).not.toThrow();
  });

  // ── Property sub-components ────────────────────────────────────────────────

  it("DetailPrimitives render without throwing", async () => {
    const { DetailRow, Section, SectionHeader } = await import("@/components/property/DetailPrimitives");
    expect(() => renderWithProviders(
      <Section><SectionHeader>Title</SectionHeader><DetailRow label="Key" value="Val" /></Section>
    )).not.toThrow();
  });

  it("PropertyFeatureList renders without throwing", async () => {
    const { default: PropertyFeatureList } = await import("@/components/property/PropertyFeatureList");
    expect(() => renderWithProviders(
      <PropertyFeatureList
        internalFeatures={[]}
        externalFeatures={[]}
        constructionFeatures={[]}
        suitabilityFeatures={[]}
      />
    )).not.toThrow();
  });

  it("PropertyReportCard renders without throwing", async () => {
    const { PropertyReportCard } = await import("@/components/property/PropertyReportCard");
    expect(() => renderWithProviders(<PropertyReportCard listing={MOCK_LISTING as any} />)).not.toThrow();
  });

  it("PropertyAuctionSection renders without throwing", async () => {
    const { PropertyAuctionSection } = await import("@/components/property/PropertyAuctionSection");
    expect(() => renderWithProviders(<PropertyAuctionSection listing={MOCK_LISTING as any} />)).not.toThrow();
  });

  it("PropertyAIInsightsSection renders without throwing", async () => {
    const { PropertyAIInsightsSection } = await import("@/components/property/PropertyAIInsightsSection");
    expect(() =>
      renderWithProviders(
        <PropertyAIInsightsSection
          user={null}
          isPro={false}
          loading={false}
          data={null}
        />,
      )
    ).not.toThrow();
  });

  it("PropertyScoresSection renders without throwing", async () => {
    const { PropertyScoresSection } = await import("@/components/property/PropertyScoresSection");
    expect(() => renderWithProviders(<PropertyScoresSection listing={MOCK_LISTING as any} />)).not.toThrow();
  });

  it("PropertyGallery renders without throwing", async () => {
    const { default: PropertyGallery } = await import("@/components/property/PropertyGallery");
    expect(() => renderWithProviders(<PropertyGallery images={[]} title="Test" />)).not.toThrow();
  });

  it("PropertyOwnerCard renders without throwing", async () => {
    const { default: PropertyOwnerCard } = await import("@/components/property/PropertyOwnerCard");
    expect(() => renderWithProviders(
      <PropertyOwnerCard
        ownerProfile={null}
        ownerParticipantType={null}
        isAuction={false}
        ownerIsPro={false}
        price={200000}
        listingType="sale"
        pricePerSqm={null}
        viewsCount={0}
        onContact={noop}
        isContactPending={false}
        onRequestViewing={noop}
        onRequestVideoViewing={noop}
        canVideoView={false}
      />
    )).not.toThrow();
  });

  it("PropertyTitleSection renders without throwing", async () => {
    const { PropertyTitleSection } = await import("@/components/property/PropertyTitleSection");
    expect(() => renderWithProviders(
      <PropertyTitleSection db={MOCK_LISTING as any} isAuction={false} ownershipDisplay={null} ownershipPct={null} ownershipStatus={null} />
    )).not.toThrow();
  });

  // ── PropertyCard (main listing card) ──────────────────────────────────────

  it("PropertyCard renders without throwing", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    expect(() => renderWithProviders(<PropertyCard property={MOCK_LISTING as any} />)).not.toThrow();
  });

  // ── Map components ─────────────────────────────────────────────────────────

  it("MapView renders without throwing", async () => {
    const { MapView } = await import("@/components/MapView");
    expect(() => renderWithProviders(
      <Suspense fallback={<div />}><MapView listings={[]} /></Suspense>
    )).not.toThrow();
  });

  it("PropertyMiniMap renders without throwing", async () => {
    const { default: PropertyMiniMap } = await import("@/components/PropertyMiniMap");
    expect(() => renderWithProviders(
      <PropertyMiniMap address="123 St" city="Athens" title="Test" latitude={37.9} longitude={23.7} />
    )).not.toThrow();
  });

  it("NeighbourhoodReport renders without throwing", async () => {
    const { default: NeighbourhoodReport } = await import("@/components/NeighbourhoodReport");
    expect(() => renderWithProviders(
      <NeighbourhoodReport city="Athens" address="123 St" />
    )).not.toThrow();
  });

  it("PropertyPopup renders without throwing", async () => {
    const { PropertyPopup } = await import("@/components/map/PropertyPopup");
    expect(() => renderWithProviders(
      <PropertyPopup listing={{ ...MOCK_AUCTION, listing_type: "sale", cover_image_url: null } as any} onClose={noop} />
    )).not.toThrow();
  });

  // ── PropertyValuation ─────────────────────────────────────────────────────

  it("PropertyValuation renders without throwing", async () => {
    const { default: PropertyValuation } = await import("@/components/PropertyValuation");
    expect(() => renderWithProviders(
      <PropertyValuation title="Test" city="Athens" price={200000} sqm={80} />
    )).not.toThrow();
  });

  // ── MarketTicker ──────────────────────────────────────────────────────────

  it("MarketTicker renders without throwing", async () => {
    const { MarketTicker } = await import("@/components/MarketTicker");
    expect(() => renderWithProviders(<MarketTicker />)).not.toThrow();
  });

  // ── AI components ─────────────────────────────────────────────────────────

  it("AIAssistantWidget renders without throwing", async () => {
    const { default: AIAssistantWidget } = await import("@/components/AIAssistantWidget");
    expect(() => renderWithProviders(<AIAssistantWidget />)).not.toThrow();
  });

  it("AISearchBar renders without throwing", async () => {
    const { AISearchBar } = await import("@/components/AISearchBar");
    expect(() => renderWithProviders(<AISearchBar onResults={noop} />)).not.toThrow();
  });

  it("ProAIToolsWidget renders without throwing", async () => {
    const { default: ProAIToolsWidget } = await import("@/components/ProAIToolsWidget");
    expect(() => renderWithProviders(<ProAIToolsWidget />)).not.toThrow();
  });

  it("CompareAIReports renders without throwing", async () => {
    const { CompareAIReports } = await import("@/components/CompareAIReports");
    expect(() => renderWithProviders(<table><tbody><CompareAIReports listings={[]} /></tbody></table>)).not.toThrow();
  });

  // ── Dashboard components ───────────────────────────────────────────────────

  it("DashboardPlanCard renders without throwing", async () => {
    const { DashboardPlanCard } = await import("@/components/DashboardPlanCard");
    expect(() => renderWithProviders(
      <DashboardPlanCard audience="participant" isPro={false} usage={{ listings: 0, images: 0, aiCredits: 0 } as any} />
    )).not.toThrow();
  });

  it("ProfileCompletionCard renders without throwing", async () => {
    const { ProfileCompletionCard } = await import("@/components/dashboard/ProfileCompletionCard");
    expect(() => renderWithProviders(
      <ProfileCompletionCard bioType="buyer" profile={null} />
    )).not.toThrow();
  });

  it("ProfessionalProfileCompletion renders without throwing", async () => {
    const { ProfessionalProfileCompletion } = await import("@/components/dashboard/ProfessionalProfileCompletion");
    expect(() => renderWithProviders(
      <ProfessionalProfileCompletion myProfessional={null} onGoToProfile={noop} onGoToServices={noop} />
    )).not.toThrow();
  });

  it("ProfessionalProfileEditor renders without throwing", async () => {
    const { ProfessionalProfileEditor } = await import("@/components/dashboard/ProfessionalProfileEditor");
    expect(() => renderWithProviders(<ProfessionalProfileEditor />)).not.toThrow();
  });

  it("ProfileEditor renders without throwing", async () => {
    const { ProfileEditor } = await import("@/components/dashboard/ProfileEditor");
    expect(() => renderWithProviders(
      <ProfileEditor profile={null} onUpdate={async () => ({ error: null })} onSwitchToSettings={noop} />
    )).not.toThrow();
  });

  it("SettingsSection renders without throwing", async () => {
    const { SettingsSection } = await import("@/components/dashboard/SettingsSection");
    expect(() => renderWithProviders(
      <SettingsSection
        roleLabel="Buyer"
        onUpdate={async () => ({ error: null })}
        refreshProfile={asyncNoop}
        currentType="participant"
        hasActiveSub={false}
      />
    )).not.toThrow();
  });

  it("BookingCalendarSection renders without throwing", async () => {
    const { BookingCalendarSection } = await import("@/components/dashboard/BookingCalendarSection");
    expect(() => renderWithProviders(
      <BookingCalendarSection viewings={[]} leads={[]} onGoToLeads={noop} onGoToViewings={noop} onGoToServices={noop} />
    )).not.toThrow();
  });

  it("BookingCalendarSection lets professionals accept and decline pending consultations", async () => {
    const { BookingCalendarSection } = await import("@/components/dashboard/BookingCalendarSection");
    const updateConsultation = vi.fn();
    const { getByRole } = renderWithProviders(
      <BookingCalendarSection
        viewings={[]}
        leads={[{
          id: "consult-1",
          requester_name: "Buyer One",
          request_type: "consultation",
          service: "Architect",
          preferred_date: "2026-05-21",
          status: "pending",
        }]}
        onGoToLeads={noop}
        onGoToViewings={noop}
        onGoToServices={noop}
        onUpdateConsultation={updateConsultation}
      />
    );

    fireEvent.click(getByRole("button", { name: /accept/i }));
    expect(updateConsultation).toHaveBeenCalledWith("consult-1", "confirmed");
    fireEvent.click(getByRole("button", { name: /decline/i }));
    expect(updateConsultation).toHaveBeenCalledWith("consult-1", "cancelled");
  });

  it("BookingCalendarSection exposes scoped join links for confirmed video consultations", async () => {
    const { BookingCalendarSection } = await import("@/components/dashboard/BookingCalendarSection");
    const { getByRole } = renderWithProviders(
      <BookingCalendarSection
        viewings={[]}
        leads={[{
          id: "consult-1",
          professional_id: "pro-1",
          requester_name: "Buyer One",
          request_type: "consultation",
          meeting_type: "video",
          service: "Architect",
          preferred_date: "2026-05-21",
          status: "confirmed",
        }]}
        onGoToLeads={noop}
        onGoToViewings={noop}
        onGoToServices={noop}
      />
    );

    expect(getByRole("link", { name: /join room/i })).toHaveAttribute("href", "/video-room/pro-1/consult-1");
  });

  it("BuyerOpenHousesCard renders without throwing", async () => {
    const { BuyerOpenHousesCard } = await import("@/components/dashboard/BuyerOpenHousesCard");
    expect(() => renderWithProviders(<BuyerOpenHousesCard />)).not.toThrow();
  });

  it("OpenHouseDashboardSection renders without throwing", async () => {
    const { default: OpenHouseDashboardSection } = await import("@/components/OpenHouseDashboardSection");
    expect(() => renderWithProviders(<OpenHouseDashboardSection myListings={[]} />)).not.toThrow();
  });

  it("MyListingsSection renders without throwing", async () => {
    const { MyListingsSection } = await import("@/pages/dashboard/MyListingsSection");
    expect(() => renderWithProviders(
      <MyListingsSection bioType="seller" role="seller" />
    )).not.toThrow();
  });

  it("SavedPropertiesSection renders without throwing", async () => {
    const { SavedPropertiesSection } = await import("@/pages/dashboard/SavedPropertiesSection");
    expect(() => renderWithProviders(
      <SavedPropertiesSection favorites={[]} favLoading={false} />
    )).not.toThrow();
  });

  it("ContactsAndLeadsSection renders without throwing", async () => {
    const { ContactsAndLeadsSection } = await import("@/pages/dashboard/ContactsAndLeadsSection");
    expect(() => renderWithProviders(
      <ContactsAndLeadsSection initialTab="leads" />
    )).not.toThrow();
  });

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

  it("SavedSearchesTab renders without throwing", async () => {
    const { default: SavedSearchesTab } = await import("@/pages/dashboard/SavedSearchesTab");
    expect(() => renderWithProviders(<SavedSearchesTab />)).not.toThrow();
  });

  it("ViewingsTab renders without throwing", async () => {
    const { default: ViewingsTab } = await import("@/pages/dashboard/ViewingsTab");
    expect(() => renderWithProviders(<ViewingsTab />)).not.toThrow();
  });

  // ── Onboarding components ──────────────────────────────────────────────────

  it("OnboardingShell renders without throwing", async () => {
    const { OnboardingShell } = await import("@/components/onboarding/OnboardingShell");
    expect(() => renderWithProviders(
      <OnboardingShell step="type" stepIndex={0} totalSteps={3} onBack={noop} onSkip={noop}><div /></OnboardingShell>
    )).not.toThrow();
  });

  it("DoneScreen renders without throwing", async () => {
    const { DoneScreen } = await import("@/components/onboarding/DoneScreen");
    expect(() => renderWithProviders(
      <DoneScreen
        selected={"participant" as any}
        selectedColor={{ bg: "bg-blue-500/10", border: "border-blue-500/20", text: "text-blue-500", iconBg: "bg-blue-500/10" }}
        SelectedIcon={() => <span />}
        isPro={false}
        proCategory=""
        selectedServicesCount={0}
        actions={{ primary: { label: "Go to Dashboard", href: "/dashboard" }, subtitle: "" }}
        navigate={noop}
      />
    )).not.toThrow();
  });

  it("PickTypeStep renders without throwing", async () => {
    const { PickTypeStep } = await import("@/components/onboarding/PickTypeStep");
    expect(() => renderWithProviders(
      <PickTypeStep selected={null} onSelect={noop} />
    )).not.toThrow();
  });

  it("PickParticipantGoalStep renders without throwing", async () => {
    const { PickParticipantGoalStep } = await import("@/components/onboarding/PickParticipantGoalStep");
    expect(() => renderWithProviders(
      <PickParticipantGoalStep selected={null} onSelect={noop} />
    )).not.toThrow();
  });

  it("PickProTypeStep renders without throwing", async () => {
    const { PickProTypeStep } = await import("@/components/onboarding/PickProTypeStep");
    expect(() => renderWithProviders(
      <PickProTypeStep selected={null} onSelect={noop} />
    )).not.toThrow();
  });

  it("ProCategoryStep renders without throwing", async () => {
    const { ProCategoryStep } = await import("@/components/onboarding/ProCategoryStep");
    expect(() => renderWithProviders(
      <ProCategoryStep selected={null} onSelect={noop} proType="agent" />
    )).not.toThrow();
  });

  it("ProServicesStep renders without throwing", async () => {
    const { ProServicesStep } = await import("@/components/onboarding/ProServicesStep");
    expect(() => renderWithProviders(
      <ProServicesStep proCategory="agent" selectedServices={{}} onChange={noop} loading={false} onSave={noop} />
    )).not.toThrow();
  });

  it("ProVerifyStep renders without throwing", async () => {
    const { ProVerifyStep } = await import("@/components/onboarding/ProVerifyStep");
    expect(() => renderWithProviders(
      <ProVerifyStep
        proCategory="agent"
        form={{ businessName: "", taxId: "", phone: "", licenseNumber: "" }}
        errors={{}}
        loading={false}
        authLoading={false}
        onFieldChange={noop}
        onSubmit={noop}
      />
    )).not.toThrow();
  });

  it("ProField renders without throwing", async () => {
    const { ProField } = await import("@/components/onboarding/ProField");
    expect(() => renderWithProviders(
      <ProField label="Test" value="" onChange={noop} />
    )).not.toThrow();
  });

  it("ProAvailabilityStep renders without throwing", async () => {
    const { ProAvailabilityStep } = await import("@/components/onboarding/ProAvailabilityStep");
    const { DEFAULT_AVAILABILITY } = await import("@/lib/onboardingConfig");
    expect(() => renderWithProviders(
      <ProAvailabilityStep availability={DEFAULT_AVAILABILITY} loading={false} authLoading={false} onChange={noop} onSave={noop} onSkip={noop} />
    )).not.toThrow();
  });

  it("ProVideoStep renders without throwing", async () => {
    const { ProVideoStep } = await import("@/components/onboarding/ProVideoStep");
    expect(() => renderWithProviders(
      <ProVideoStep
        videoLink=""
        calendarNotes=""
        loading={false}
        authLoading={false}
        onVideoLinkChange={noop}
        onCalendarNotesChange={noop}
        onSave={noop}
        onSkip={noop}
      />
    )).not.toThrow();
  }, 15_000);

  it("DeveloperSetupStep renders without throwing", async () => {
    const { DeveloperSetupStep } = await import("@/components/onboarding/DeveloperSetupStep");
    expect(() => renderWithProviders(
      <DeveloperSetupStep
        form={{ companyName: "", registrationNumber: "", city: "", devType: "" }}
        errors={{}}
        loading={false}
        authLoading={false}
        onFieldChange={noop}
        onSubmit={noop}
      />
    )).not.toThrow();
  });

  // ── New-build components ───────────────────────────────────────────────────

  it("ConstructionSpecs renders without throwing", async () => {
    const { ConstructionSpecs } = await import("@/components/new-build/ConstructionSpecs");
    expect(() => renderWithProviders(<ConstructionSpecs listing={MOCK_LISTING as any} />)).not.toThrow();
  });

  it("ConstructionTimeline renders without throwing", async () => {
    const { ConstructionTimeline } = await import("@/components/new-build/ConstructionTimeline");
    expect(() => renderWithProviders(<ConstructionTimeline milestones={[]} />)).not.toThrow();
  });

  it("FloorPlanSection renders without throwing", async () => {
    const { FloorPlanSection } = await import("@/components/new-build/FloorPlanSection");
    expect(() => renderWithProviders(<FloorPlanSection images={[]} onRequestPlans={noop} />)).not.toThrow();
  });

  it("UnitShowcase renders without throwing", async () => {
    const { UnitShowcase } = await import("@/components/new-build/UnitShowcase");
    expect(() => renderWithProviders(<UnitShowcase listing={MOCK_LISTING as any} onContact={noop} />)).not.toThrow();
  });

  it("RegisterInterestCard renders without throwing", async () => {
    const { RegisterInterestCard } = await import("@/components/new-build/RegisterInterestCard");
    expect(() => renderWithProviders(
      <RegisterInterestCard listing={MOCK_LISTING as any} user={null} onLogin={noop} onContact={asyncNoop} />
    )).not.toThrow();
  });

  it("new-build PropertyGallery renders without throwing", async () => {
    const { PropertyGallery } = await import("@/components/new-build/PropertyGallery");
    expect(() => renderWithProviders(
      <PropertyGallery images={[]} isFavorited={false} onFavorite={noop} onShare={noop} />
    )).not.toThrow();
  });

  // ── Professional profile components ───────────────────────────────────────

  it("StarRating renders without throwing", async () => {
    const { StarRating } = await import("@/components/professionals/ProfileComponents");
    expect(() => renderWithProviders(<StarRating rating={4} />)).not.toThrow();
  });

  it("ListingGrid renders without throwing", async () => {
    const { ListingGrid } = await import("@/components/professionals/ProfileComponents");
    expect(() => renderWithProviders(<ListingGrid listings={[]} />)).not.toThrow();
  });

  it("ProfessionalOverviewTab renders without throwing", async () => {
    const { ProfessionalOverviewTab } = await import("@/components/professionals/ProfessionalOverviewTab");
    expect(() => renderWithProviders(
      <ProfessionalOverviewTab pro={MOCK_PROFESSIONAL as any} isRealEstateAgent agentListingsCount={0} professionalIsPro={false} />
    )).not.toThrow();
  });

  it("ProfessionalReviewsTab renders without throwing", async () => {
    const { ProfessionalReviewsTab } = await import("@/components/professionals/ProfessionalReviewsTab");
    expect(() => renderWithProviders(
      <ProfessionalReviewsTab
        professionalId="pro-1"
        proCategory="agent"
        displayName="Test Pro"
        user={null}
        reviewStats={{ avg: 0, total: 0, recommended_pct: 0, by_star: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } }}
      />
    )).not.toThrow();
  });

  it("ProfessionalServicesTab renders without throwing", async () => {
    const { ProfessionalServicesTab } = await import("@/components/professionals/ProfessionalServicesTab");
    expect(() => renderWithProviders(
      <ProfessionalServicesTab dbServices={[]} dbAvailability={[]} professionalIsPro={false} user={null} onOpenModal={noop} />
    )).not.toThrow();
  });

  // ── ProfessionalServicesEditor ─────────────────────────────────────────────

  it("ProfessionalServicesEditor renders without throwing", async () => {
    const { default: ProfessionalServicesEditor } = await import("@/components/ProfessionalServicesEditor");
    expect(() => renderWithProviders(<ProfessionalServicesEditor />)).not.toThrow();
  });

  // ── Auction components ─────────────────────────────────────────────────────

  it("AuctionCard renders without throwing", async () => {
    const { AuctionCard } = await import("@/components/auctions/AuctionCard");
    expect(() => renderWithProviders(
      <AuctionCard a={MOCK_AUCTION as any} favoritedIds={new Set()} onToggleFav={noop} />
    )).not.toThrow();
  });

  it("AuctionHero renders without throwing", async () => {
    const { AuctionHero } = await import("@/components/auctions/AuctionHero");
    expect(() => renderWithProviders(<AuctionHero stats={[]} />)).not.toThrow();
  });

  it("AuctionAlertBanner renders without throwing", async () => {
    const { AuctionAlertBanner } = await import("@/components/auctions/AuctionAlertBanner");
    expect(() => renderWithProviders(
      <AuctionAlertBanner onCreateAlert={noop} />
    )).not.toThrow();
  });

  it("AuctionBidHistory renders without throwing", async () => {
    const { AuctionBidHistory } = await import("@/components/AuctionBidHistory");
    expect(() => renderWithProviders(
      <AuctionBidHistory lat={37.9} lng={23.7} listingId="x" title="Test" sqm={80} />
    )).not.toThrow();
  });

  // ── Investor components ────────────────────────────────────────────────────

  it("InvestorAccessGate renders without throwing", async () => {
    const { InvestorAccessGate } = await import("@/components/investor/InvestorAccessGate");
    expect(() => renderWithProviders(<InvestorAccessGate><div /></InvestorAccessGate>)).not.toThrow();
  });

  it("InvestorExpiryBanner renders without throwing", async () => {
    const { InvestorExpiryBanner } = await import("@/components/investor/InvestorExpiryBanner");
    expect(() => renderWithProviders(<InvestorExpiryBanner expiresAt={null} />)).not.toThrow();
  });

  it("InvestorHeroHeader renders without throwing", async () => {
    const { InvestorHeroHeader } = await import("@/components/investor/InvestorHeroHeader");
    expect(() => renderWithProviders(
      <InvestorHeroHeader
        dealsCount={0}
        totalValue={0}
        avgDiscount="0"
        avgRoi="0"
        subscription={null}
        subscribed={false}
        showInviteCta={false}
        onInviteClick={noop}
      />
    )).not.toThrow();
  });

  it("InvestorSidebarAnalytics renders without throwing", async () => {
    const { InvestorSidebarAnalytics } = await import("@/components/investor/InvestorSidebarAnalytics");
    expect(() => renderWithProviders(
      <InvestorSidebarAnalytics
        cityBreakdown={[]}
        typeBreakdown={[]}
        marketPulse={{ newThisWeek: 0, avgDiscountVsAi: null }}
        liveDealsCount={0}
        invitationStatus="none"
        canAccessDealFlow={false}
        onInviteClick={noop}
      />
    )).not.toThrow();
  });

  // ── Gates ─────────────────────────────────────────────────────────────────

  it("ProGate renders without throwing", async () => {
    const { ProGate } = await import("@/components/gates/ProGate");
    expect(() => renderWithProviders(
      <ProGate><div>Pro content</div></ProGate>
    )).not.toThrow();
  });

  // ── Firesale components ────────────────────────────────────────────────────

  it("FiresaleInvestorPanel renders without throwing", async () => {
    const { FiresaleInvestorPanel } = await import("@/components/firesale/FiresaleInvestorPanel");
    expect(() => renderWithProviders(
      <FiresaleInvestorPanel invitationStatus="none" onRequestInvitation={noop} />
    )).not.toThrow();
  });

  it("FiresaleQuickSaleForm renders without throwing", async () => {
    const { FiresaleQuickSaleForm } = await import("@/components/firesale/FiresaleQuickSaleForm");
    expect(() => renderWithProviders(<FiresaleQuickSaleForm />)).not.toThrow();
  });

  // ── Open houses ────────────────────────────────────────────────────────────

  it("OpenHousePrimitives render without throwing", async () => {
    const { Pill, OpenHouseCard } = await import("@/components/open-houses/OpenHousePrimitives");
    expect(() => renderWithProviders(<Pill onClick={() => {}}>Status</Pill>)).not.toThrow();
    expect(() => renderWithProviders(
      <OpenHouseCard card={{ id: "oh-1", listing_type: "open_house", price: 200000, ...MOCK_LISTING } as any} listing={{} as any} />
    )).not.toThrow();
  });

  it("OpenHouseAnalytics renders without throwing", async () => {
    const { default: OpenHouseAnalytics } = await import("@/components/OpenHouseAnalytics");
    await act(async () => {
      renderWithProviders(<OpenHouseAnalytics listingId="x" />);
    });
  });

  it("OpenHouseAssetControlPanel renders without throwing", async () => {
    const { default: OpenHouseAssetControlPanel } = await import("@/components/OpenHouseAssetControlPanel");
    expect(() => renderWithProviders(
      <OpenHouseAssetControlPanel listingId="x" isOwner={false} />
    )).not.toThrow();
  });

  // ── Index sections ─────────────────────────────────────────────────────────

  it("HeroSection renders without throwing", async () => {
    const { HeroSection } = await import("@/components/index/HeroSection");
    await expectRenderWithProvidersNotToThrow(
      <Suspense fallback={<div />}><HeroSection /></Suspense>
    );
  });

  it("BrowseByTypeSection renders without throwing", async () => {
    const { BrowseByTypeSection } = await import("@/components/index/BrowseByTypeSection");
    expect(() => renderWithProviders(<BrowseByTypeSection typeCounts={{}} />)).not.toThrow();
  });

  it("FeaturedPropertiesSection renders without throwing", async () => {
    const { FeaturedPropertiesSection } = await import("@/components/index/FeaturedPropertiesSection");
    expect(() => renderWithProviders(<FeaturedPropertiesSection listings={[]} isLoading={false} isError={false} />)).not.toThrow();
  });

  it("HomepageAuctionsSection renders without throwing", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");
    expect(() => renderWithProviders(<HomepageAuctionsSection listings={[]} isLoading={false} />)).not.toThrow();
    expect(() => renderWithProviders(
      <HomepageAuctionsSection
        isLoading={false}
        listings={[{
          id: "auction-1",
          title: "Athens auction flat",
          address: null,
          city: "Athens",
          price: "120000",
          price_per_sqm: "2400",
          bedrooms: 2,
          bathrooms: 1,
          sqm: "50",
          floor: 3,
          total_floors: 5,
          year_built: 1998,
          energy_class: "B",
          listing_images: [{ sort_order: 1, url: "https://example.com/auction.jpg" }],
          property_type: "apartment",
          listing_type: "auction",
          auction_date: "2026-06-01T10:00:00Z",
          auction_starting_bid: "90000",
          ai_score: 82,
          views_count: 12,
          tags: ["auction"],
          is_pre_sale: true,
          construction_status: "resale",
        }]}
      />
    )).not.toThrow();
  });

  it("HomepageOpenHousesSection renders without throwing", async () => {
    const { HomepageOpenHousesSection } = await import("@/components/index/HomepageOpenHousesSection");
    expect(() => renderWithProviders(<HomepageOpenHousesSection listings={[]} />)).not.toThrow();
  });

  it("OSSection renders without throwing", async () => {
    const { OSSection } = await import("@/components/index/OSSection");
    expect(() => renderWithProviders(<OSSection />)).not.toThrow();
  });

  it("PopularLocationsSection renders without throwing", async () => {
    const { PopularLocationsSection } = await import("@/components/index/PopularLocationsSection");
    expect(() => renderWithProviders(<PopularLocationsSection />)).not.toThrow();
  });

  it("ProfessionalsCTASection renders without throwing", async () => {
    const { ProfessionalsCTASection } = await import("@/components/index/ProfessionalsCTASection");
    expect(() => renderWithProviders(<ProfessionalsCTASection />)).not.toThrow();
  });

  it("QuickSaleCTASection renders without throwing", async () => {
    const { QuickSaleCTASection } = await import("@/components/index/QuickSaleCTASection");
    expect(() => renderWithProviders(<QuickSaleCTASection />)).not.toThrow();
  });

  it("AISearchModal renders without throwing", async () => {
    const { AISearchModal } = await import("@/components/index/AISearchModal");
    expect(() => renderWithProviders(<AISearchModal open={false} onClose={noop} onResults={noop} />)).not.toThrow();
  });

  it("OSDashboardMockup renders without throwing", async () => {
    const { OSDashboardMockup } = await import("@/components/index/OSDashboardMockup");
    expect(() => renderWithProviders(<OSDashboardMockup />)).not.toThrow();
  });

  it("PropertyTypeDropdown renders without throwing", async () => {
    const { PropertyTypeDropdown } = await import("@/components/index/PropertyTypeDropdown");
    expect(() => renderWithProviders(
      <PropertyTypeDropdown value="" onChange={noop} />
    )).not.toThrow();
  });

  it("ServiceInput renders without throwing", async () => {
    const { ServiceInput } = await import("@/components/index/ServiceInput");
    expect(() => renderWithProviders(
      <ServiceInput value="" onChange={noop} onSelect={noop} />
    )).not.toThrow();
  });

  it("LocationInput renders without throwing", async () => {
    const { LocationInput } = await import("@/components/index/LocationInput");
    expect(() => renderWithProviders(
      <LocationInput value="" onChange={noop} onSelect={noop} />
    )).not.toThrow();
  });

  // ── API docs ───────────────────────────────────────────────────────────────

  it("ApiDocComponents render without throwing", async () => {
    const { CodeBlock, EndpointCard } = await import("@/components/api/ApiDocComponents");
    expect(() => renderWithProviders(<CodeBlock code="const x = 1;" />)).not.toThrow();
    expect(() => renderWithProviders(
      <EndpointCard endpoint={{ id: "t", method: "GET", path: "/test", description: "test", auth: false, rateLimit: "100/hr", responseExample: "{}" } as any} />
    )).not.toThrow();
  });

  // ── Admin sub-components ───────────────────────────────────────────────────

  // FiresaleComponents and ProVerificationComponents export multiple admin
  // sub-components (AdminDealRow, ProCardItem, etc.) that require concrete
  // props (a deal object, a pro card, callbacks). Rendering them without
  // props is meaningless and just throws on the first prop access. We can't
  // build representative fixtures here without replicating the parent
  // module's data shape, so the smoke pass settles for verifying the module
  // imports cleanly — which catches regressions like circular imports or
  // top-level evaluation errors. Per-component render coverage belongs in a
  // dedicated test file with real fixtures, not in the auto-render harness.
  it("FiresaleComponents module loads without throwing", async () => {
    await expect(import("@/components/admin/FiresaleComponents")).resolves.toBeDefined();
  });

  it("ProVerificationComponents module loads without throwing", async () => {
    await expect(import("@/components/admin/ProVerificationComponents")).resolves.toBeDefined();
  });

  // ── Admin full components ──────────────────────────────────────────────────

  it("AdminPanel renders without throwing", async () => {
    const { default: AdminPanel } = await import("@/components/AdminPanel");
    await expectRenderWithProvidersNotToThrow(
      <Suspense fallback={<div />}><AdminPanel /></Suspense>
    );
  });

  it("AdminReports renders without throwing", async () => {
    const { default: AdminReports } = await import("@/components/AdminReports");
    expect(() => renderWithProviders(<AdminReports />)).not.toThrow();
  });

  it("AdminFiresalePipeline renders without throwing", async () => {
    const { default: AdminFiresalePipeline } = await import("@/components/AdminFiresalePipeline");
    expect(() => renderWithProviders(<AdminFiresalePipeline />)).not.toThrow();
  });

  it("AdminInvestorScreening renders without throwing", async () => {
    const { default: AdminInvestorScreening } = await import("@/components/AdminInvestorScreening");
    expect(() => renderWithProviders(<AdminInvestorScreening />)).not.toThrow();
  });

  it("AdminSubscribers renders without throwing", async () => {
    const { default: AdminSubscribers } = await import("@/components/AdminSubscribers");
    expect(() => renderWithProviders(<AdminSubscribers />)).not.toThrow();
  });

  it("AdminFeaturedListings renders without throwing", async () => {
    const { default: AdminFeaturedListings } = await import("@/components/AdminFeaturedListings");
    expect(() => renderWithProviders(<AdminFeaturedListings />)).not.toThrow();
  });

  it("AdminInvitationRequests renders without throwing", async () => {
    const { default: AdminInvitationRequests } = await import("@/components/AdminInvitationRequests");
    expect(() => renderWithProviders(<AdminInvitationRequests />)).not.toThrow();
  });

  it("AdminProfessionalVerification renders without throwing", async () => {
    const { AdminProfessionalVerification } = await import("@/components/AdminProfessionalVerification");
    expect(() => renderWithProviders(<AdminProfessionalVerification />)).not.toThrow();
  });

  it("POFVerificationPanel renders without throwing", async () => {
    const { POFVerificationPanel } = await import("@/components/POFVerificationPanel");
    await expectRenderWithProvidersNotToThrow(<POFVerificationPanel />);
  });

  it("ProfessionalVerificationPanel renders without throwing", async () => {
    const { ProfessionalVerificationPanel } = await import("@/components/ProfessionalVerificationPanel");
    await expectRenderWithProvidersNotToThrow(<ProfessionalVerificationPanel />);
  });

  it("ProofOfFundsReviewer renders without throwing", async () => {
    const { ProofOfFundsReviewer } = await import("@/components/ProofOfFundsReviewer");
    expect(() => renderWithProviders(<ProofOfFundsReviewer />)).not.toThrow();
  });

  // ── CRM / data components ──────────────────────────────────────────────────

  it("ContactsCRM renders without throwing", async () => {
    const { default: ContactsCRM } = await import("@/components/ContactsCRM");
    expect(() => renderWithProviders(<ContactsCRM />)).not.toThrow();
  });

  it("LeadsCRM renders without throwing", async () => {
    const { default: LeadsCRM } = await import("@/components/LeadsCRM");
    expect(() => renderWithProviders(<LeadsCRM />)).not.toThrow();
  });

  it("PastDealsTable renders without throwing", async () => {
    const { PastDealsTable } = await import("@/components/PastDealsTable");
    expect(() => renderWithProviders(<PastDealsTable listingId="x" />)).not.toThrow();
  });

  it("DealChecklist renders without throwing", async () => {
    const { DealChecklist } = await import("@/components/DealChecklist");
    expect(() => renderWithProviders(
      <DealChecklist entityType="listing" entityId="x" />
    )).not.toThrow();
  });

  // ── Modal / dialog components (open={false} → safe to render) ─────────────

  it("AuctionAlertModal renders without throwing", async () => {
    const { AuctionAlertModal } = await import("@/components/AuctionAlertModal");
    expect(() => renderWithProviders(
      <AuctionAlertModal open={false} onClose={noop} editAlert={null} />
    )).not.toThrow();
  });

  it("BookConsultationModal renders without throwing", async () => {
    const { default: BookConsultationModal } = await import("@/components/BookConsultationModal");
    expect(() => renderWithProviders(
      <BookConsultationModal open={false} onClose={noop} professional={MOCK_PROFESSIONAL as any} />
    )).not.toThrow();
  });

  it("SendMessageModal renders without throwing", async () => {
    const { default: SendMessageModal } = await import("@/components/SendMessageModal");
    expect(() => renderWithProviders(
      <SendMessageModal open={false} onClose={noop} professional={MOCK_PROFESSIONAL as any} />
    )).not.toThrow();
  });

  it("ViewingDialog renders without throwing", async () => {
    const { default: ViewingDialog } = await import("@/components/ViewingDialog");
    expect(() => renderWithProviders(
      <ViewingDialog open={false} onClose={noop} property={MOCK_LISTING as any} ownerId="user-1" />
    )).not.toThrow();
  });

  it("ViewingDialog renders Greek authenticated asset-request branches without throwing", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    const { useAuth } = await import("@/contexts/AuthContext");
    const useAuthMock = useAuth as ReturnType<typeof vi.fn>;
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Greek Buyer", phone: "+306900000000" },
      loading: false,
      profileLoading: false,
      subscription: { subscribed: true, productId: "pro", subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
    const { default: ViewingDialog } = await import("@/components/ViewingDialog");
    expect(() => renderWithProviders(
      <ViewingDialog
        open
        onClose={noop}
        property={{ ...MOCK_LISTING, images: ["https://example.com/listing.jpg"] } as any}
        ownerId="owner-1"
        canVideoView={false}
      />
    )).not.toThrow();
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "en";
    useAuthMock.mockReturnValue({
      user: null, profile: null, loading: false, profileLoading: false,
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("OpenHouseRegistrationDialog renders without throwing", async () => {
    const { default: OpenHouseRegistrationDialog } = await import("@/components/OpenHouseRegistrationDialog");
    expect(() => renderWithProviders(
      <OpenHouseRegistrationDialog open={false} onClose={noop} listingId="x" listingTitle="Test" hasAssetControl={false} />
    )).not.toThrow();
  });

  it("OpenHouseOfferDialog renders without throwing", async () => {
    const { default: OpenHouseOfferDialog } = await import("@/components/OpenHouseOfferDialog");
    expect(() => renderWithProviders(
      <OpenHouseOfferDialog open={false} onClose={noop} listingId="x" listingTitle="Test" listingPrice={200000} />
    )).not.toThrow();
  });

  it("LegalDocumentModal renders without throwing", async () => {
    const { LegalDocumentModal } = await import("@/components/LegalDocumentModal");
    expect(() => renderWithProviders(
      <LegalDocumentModal open={false} onClose={noop} />
    )).not.toThrow();
  });

  it("InvitationRequestModal renders without throwing", async () => {
    const { InvitationRequestModal } = await import("@/components/InvitationRequestModal");
    expect(() => renderWithProviders(
      <InvitationRequestModal user={null} onClose={noop} onSuccess={noop} />
    )).not.toThrow();
  });

  it("InvitationRequestModal renders Greek invitee profile branches without throwing", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    const { InvitationRequestModal } = await import("@/components/InvitationRequestModal");
    expect(() => renderWithProviders(
      <InvitationRequestModal
        user={{ id: "investor-1", email: "investor@example.com" }}
        onClose={noop}
        onSuccess={noop}
      />
    )).not.toThrow();
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "en";
  });

  it("RoleSwitchModal renders without throwing", async () => {
    const { RoleSwitchModal } = await import("@/components/RoleSwitchModal");
    expect(() => renderWithProviders(
      <RoleSwitchModal open={false} onClose={noop} switchContext={null} />
    )).not.toThrow();
  });

  it("OnlineViewingModal renders without throwing", async () => {
    const { default: OnlineViewingModal } = await import("@/components/OnlineViewingModal");
    expect(() => renderWithProviders(
      <OnlineViewingModal open={false} onClose={noop} listing={MOCK_LISTING as any} professional={MOCK_PROFESSIONAL as any} />
    )).not.toThrow();
  });

  it("OnlineViewingModal renders Greek professional booking branches without throwing", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    const { useAuth } = await import("@/contexts/AuthContext");
    const useAuthMock = useAuth as ReturnType<typeof vi.fn>;
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Greek Buyer", phone: "+306900000000" },
      loading: false,
      profileLoading: false,
      subscription: { subscribed: true, productId: "pro", subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
    const { default: OnlineViewingModal } = await import("@/components/OnlineViewingModal");
    expect(() => renderWithProviders(
      <OnlineViewingModal open onClose={noop} professional={MOCK_PROFESSIONAL as any} />
    )).not.toThrow();
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "en";
    useAuthMock.mockReturnValue({
      user: null, profile: null, loading: false, profileLoading: false,
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("AIServiceMatchModal renders without throwing", async () => {
    const { AIServiceMatchModal } = await import("@/components/AIServiceMatchModal");
    expect(() => renderWithProviders(
      <AIServiceMatchModal open={false} onClose={noop} />
    )).not.toThrow();
  });

  it("SaveSearchModal renders without throwing", async () => {
    const { SaveSearchModal } = await import("@/components/SaveSearchModal");
    expect(() => renderWithProviders(
      <SaveSearchModal currentFilters={{}} onClose={noop} />
    )).not.toThrow();
  });

  it("SaveSearchModal renders Greek authenticated filter summary branches without throwing", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    const { useAuth } = await import("@/contexts/AuthContext");
    const useAuthMock = useAuth as ReturnType<typeof vi.fn>;
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Greek Buyer" },
      loading: false,
      profileLoading: false,
      subscription: { subscribed: true, productId: "pro", subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
    const { SaveSearchModal } = await import("@/components/SaveSearchModal");
    const { container } = renderWithProviders(
      <SaveSearchModal
        currentFilters={{
          city: "Athens",
          listing_type: "sale",
          property_type: "apartment",
          has_pool: "true",
          min_ai_score: "80",
        }}
        onClose={noop}
      />
    );
    const [, alertButton] = Array.from(container.querySelectorAll("button"));
    if (alertButton) fireEvent.click(alertButton);
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "en";
    useAuthMock.mockReturnValue({
      user: null, profile: null, loading: false, profileLoading: false,
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
  });

  it("RequestCallbackModal renders without throwing", async () => {
    const { default: RequestCallbackModal } = await import("@/components/RequestCallbackModal");
    expect(() => renderWithProviders(
      <RequestCallbackModal open={false} onClose={noop} professional={MOCK_PROFESSIONAL as any} />
    )).not.toThrow();
  });

  it("RequestCallbackModal renders Greek authenticated callback branches without throwing", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    const { useAuth } = await import("@/contexts/AuthContext");
    const useAuthMock = useAuth as ReturnType<typeof vi.fn>;
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Greek Buyer", phone: "+306900000000" },
      loading: false,
      profileLoading: false,
      subscription: { subscribed: true, productId: "pro", subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
    const { default: RequestCallbackModal } = await import("@/components/RequestCallbackModal");
    expect(() => renderWithProviders(
      <RequestCallbackModal open onClose={noop} professional={MOCK_PROFESSIONAL as any} />
    )).not.toThrow();
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "en";
    useAuthMock.mockReturnValue({
      user: null, profile: null, loading: false, profileLoading: false,
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      needsOnboarding: false,
      signIn: vi.fn().mockResolvedValue({ error: null }),
      signUp: vi.fn().mockResolvedValue({ error: null }),
      signOut: vi.fn().mockResolvedValue(undefined),
      updateProfile: vi.fn().mockResolvedValue({ error: null }),
      refreshProfile: vi.fn().mockResolvedValue(undefined),
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
  });

  // ── CompareDrawer ──────────────────────────────────────────────────────────

  it("CompareDrawer renders without throwing (empty list → null)", async () => {
    const { CompareDrawer } = await import("@/components/CompareDrawer");
    expect(() => renderWithProviders(
      <CompareDrawer listings={[]} onRemove={noop} onClear={noop} />
    )).not.toThrow();
  });

  // ── Listing creation steps ─────────────────────────────────────────────────

  it("StepType renders without throwing", async () => {
    const { StepType } = await import("@/components/listings/StepType");
    expect(() => renderWithProviders(
      <StepType form={{ listing_type: "sale", property_type: "apartment" } as any} set={noop} toggle={noop} />
    )).not.toThrow();
  });

  it("StepDetails renders without throwing", async () => {
    const { StepDetails } = await import("@/components/listings/StepDetails");
    expect(() => renderWithProviders(
      <StepDetails form={{} as any} set={noop} errors={{}} setFieldRef={(_k: string) => (_el: unknown) => {}} aiDescLoading={false} handleAiDescription={noop} />
    )).not.toThrow();
  });

  it("StepFeatures renders without throwing", async () => {
    const { StepFeatures } = await import("@/components/listings/StepFeatures");
    expect(() => renderWithProviders(
      <StepFeatures form={{} as any} toggle={noop} />
    )).not.toThrow();
  });

  it("StepLocation renders without throwing", async () => {
    const { StepLocation } = await import("@/components/listings/StepLocation");
    expect(() => renderWithProviders(
      <StepLocation form={{} as any} set={noop} errors={{}} setFieldRef={(_k: string) => (_el: unknown) => {}} connections={{ supabaseOk: true, storageOk: true, locationSource: "none", locationOk: false, loading: false }} stepActive />
    )).not.toThrow();
  });

  it("StepPhotos renders without throwing", async () => {
    const { StepPhotos } = await import("@/components/listings/StepPhotos");
    expect(() => renderWithProviders(
      <StepPhotos images={[]} coverImageId={null} onFilesSelected={noop} onDrop={noop} onReorder={noop} onRemove={noop} onSetCover={noop} />
    )).not.toThrow();
  });

  it("StepPricing renders without throwing", async () => {
    const { StepPricing } = await import("@/components/listings/StepPricing");
    expect(() => renderWithProviders(
      <StepPricing form={{ listing_type: "sale", property_type: "apartment" } as any} set={noop} errors={{}} setFieldRef={(_k: string) => (_el: unknown) => {}} aiPriceLoading={false} aiPriceSuggestion={null} handleAiPrice={noop} />
    )).not.toThrow();
  });
});
