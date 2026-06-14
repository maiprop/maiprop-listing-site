import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

const {
  useQueryMock,
  useAuthMock,
  useSubscriptionMock,
  useIsFavoritedMock,
  toggleFavoriteMock,
  startConversationMock,
  navigateMock,
  fromMock,
  publicApiMock,
  functionsInvokeMock,
  toastMock,
} = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  useIsFavoritedMock: vi.fn(),
  toggleFavoriteMock: vi.fn(),
  startConversationMock: vi.fn(),
  navigateMock: vi.fn(),
  fromMock: vi.fn(),
  publicApiMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQuery: (...args: unknown[]) => useQueryMock(...args) };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: functionsInvokeMock },
  },
}));
vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubscriptionMock() }));
vi.mock("@/hooks/useFavorites", () => ({
  useIsFavorited: (...args: unknown[]) => useIsFavoritedMock(...args),
  useToggleFavorite: () => ({ mutate: toggleFavoriteMock }),
}));
vi.mock("@/hooks/useMessages", () => ({ useStartConversation: () => ({ mutateAsync: startConversationMock }) }));
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/PropertyMiniMap", () => ({
  default: ({ onWalkScoreChange }: { onWalkScoreChange?: (score: number) => void }) => (
    <button type="button" onClick={() => onWalkScoreChange?.(88)}>mini map</button>
  ),
}));
vi.mock("@/components/PropertyValuation", () => ({ default: () => <div data-testid="valuation" /> }));
vi.mock("@/components/NeighbourhoodReport", () => ({ default: () => <div data-testid="neighbourhood" /> }));
vi.mock("@/components/property/PropertyScoresSection", () => ({
  PropertyScoresSection: ({ walkScore }: { walkScore: number | null }) => <div data-testid="scores">walk:{walkScore ?? "none"}</div>,
}));
vi.mock("@/components/new-build/PropertyGallery", () => ({
  PropertyGallery: ({ title, onFavorite, onShare }: { title: string; onFavorite: () => void; onShare: () => void }) => (
    <div>
      <span>gallery title:{title}</span>
      <button type="button" onClick={onFavorite}>favorite</button>
      <button type="button" onClick={onShare}>share</button>
    </div>
  ),
}));
vi.mock("@/components/new-build/ConstructionTimeline", () => ({ ConstructionTimeline: () => <div data-testid="timeline" /> }));
vi.mock("@/components/new-build/FloorPlanSection", () => ({
  FloorPlanSection: ({
    media,
    onRequestPlans,
  }: {
    media?: Array<{ title?: string | null }>;
    onRequestPlans: () => void;
  }) => (
    <div>
      <span>media count:{media?.length ?? 0}</span>
      {media?.[0]?.title && <span>{media[0].title}</span>}
      <button type="button" onClick={onRequestPlans}>floor plans child</button>
    </div>
  ),
}));
vi.mock("@/components/new-build/ConstructionSpecs", () => ({
  ConstructionSpecs: ({ project }: { project?: { building_permit_number?: string | null } | null }) => (
    <div data-testid="specs">{project?.building_permit_number ?? "no permit"}</div>
  ),
}));
vi.mock("@/components/new-build/UnitShowcase", () => ({
  UnitShowcase: ({
    units,
    onContact,
  }: {
    units?: Array<{ unit_number?: string | null }>;
    onContact: () => void;
  }) => (
    <div>
      <span>unit count:{units?.length ?? 0}</span>
      {units?.[0]?.unit_number && <span>{units[0].unit_number}</span>}
      <button type="button" onClick={onContact}>Ask developer</button>
    </div>
  ),
}));
vi.mock("@/components/new-build/RegisterInterestCard", () => ({
  RegisterInterestCard: ({
    user,
    onLogin,
    onContact,
  }: {
    user: { id: string } | null;
    onLogin: () => void;
    onContact: (form: { name: string; phone: string; message: string }) => Promise<void>;
  }) => (
    <div>
      <span>{user ? "signed in interest" : "signed out interest"}</span>
      <button type="button" onClick={onLogin}>interest login</button>
      <button type="button" onClick={() => onContact({ name: "Form Name", phone: "555", message: "Send plans" })}>
        submit interest
      </button>
    </div>
  ),
}));
vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});
vi.mock("sonner", () => ({ toast: toastMock }));

import NewBuildDetail from "@/pages/NewBuildDetail";

const listing = {
  id: "listing-1",
  owner_id: "owner-1",
  title: "Aegean Residences",
  price: 420000,
  price_per_sqm: 5000,
  sqm: 84,
  bedrooms: 2,
  bathrooms: 2,
  total_floors: 6,
  year_built: 2027,
  energy_class: "A",
  construction_status: "foundation",
  is_pre_sale: false,
  listing_type: "new_build",
  address: "Akti 1",
  city: "Piraeus",
  region: "Attica",
  property_type: "apartment",
  floor: 2,
  has_parking: true,
  has_elevator: true,
  has_pool: true,
  has_ac: true,
  has_solar_water: true,
  has_storage: true,
  has_security: true,
  has_underfloor_heating: true,
  has_smart_home: true,
  has_garden: true,
  has_view: true,
  has_video_tour: true,
  cover_image_url: "https://cdn/cover.jpg",
  listing_images: [{ url: "https://cdn/other.jpg", sort_order: 2 }],
  project_id: "project-1",
  project: {
    id: "project-1",
    name: "Marina Heights",
    description: "Waterfront homes with shared amenities.",
    address: "Marina Avenue 10",
    city: "Piraeus",
    municipality: "Piraeus Municipality",
    developer_company: "Mai Developments",
    architect_group: "Aegean Studio",
    construction_company: "BuildCo",
    building_permit_number: "BP-2026-01",
    area_description: "New waterfront regeneration zone.",
    status: "active",
    permit_approval_date: "2026-01-15",
    construction_start_date: "2026-03-01",
    structural_completion_date: "2026-10-15",
    delivery_date: "2027-06-30",
    project_units: [
      {
        id: "unit-1",
        unit_number: "A101",
        unit_id: "A101",
        floor: 1,
        availability_status: "available",
        internal_sqm: 82,
        balcony_sqm: 14,
        bedrooms: 2,
        bathrooms: 2,
        price: 410000,
        price_per_sqm: 5000,
        vat_included: true,
        energy_class: "A",
      },
    ],
    project_media: [
      {
        id: "media-1",
        media_type: "floor_plan",
        title: "A101 floor plan",
        url: "https://cdn/floor-plan.jpg",
        sort_order: 1,
      },
    ],
  },
  description: "A".repeat(240),
  latitude: 37.94,
  longitude: 23.64,
  profiles: { display_name: "Mai Developer", avatar_url: null, phone: "phone-redacted" },
  walkability_score: 70,
  safety_score: 80,
  noise_score: 20,
};

const renderPage = () =>
  render(
    <MemoryRouter initialEntries={["/new-build/listing-1"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/new-build/:id" element={<NewBuildDetail />} />
      </Routes>
    </MemoryRouter>,
  );

beforeEach(() => {
  [
    useQueryMock,
    useAuthMock,
    useSubscriptionMock,
    useIsFavoritedMock,
    toggleFavoriteMock,
    startConversationMock,
    navigateMock,
    fromMock,
    publicApiMock,
    functionsInvokeMock,
    toastMock.error,
    toastMock.success,
  ].forEach((mock) => mock.mockReset());

  useAuthMock.mockReturnValue({ user: null, profile: null });
  useSubscriptionMock.mockReturnValue({ isPro: false });
  useIsFavoritedMock.mockReturnValue({ data: false });
  useQueryMock.mockReturnValue({ data: listing, isLoading: false, error: null });
  startConversationMock.mockResolvedValue("conv-1");
  fromMock.mockReturnValue({ insert: vi.fn().mockResolvedValue({ error: null }) });
  functionsInvokeMock.mockResolvedValue({
    data: {
      marketComparisonPct: 19,
      rentalYieldEstimate: 4.4,
      estimatedValue: 430000,
      auctionAdjustedValue: 500000,
      marketComparison: "above_market",
      confidenceLabel: "High",
    },
  });
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    share: undefined,
  });
});

describe("NewBuildDetail", () => {
  it("loads public listing details with the owner profile from the public API", async () => {
    const publicProfile = { user_id: "owner-1", display_name: "Mai Developer", avatar_url: null };
    publicApiMock.mockResolvedValue({
      data: {
        ...listing,
        profiles: publicProfile,
      },
    });

    renderPage();
    const queryOptions = useQueryMock.mock.calls[0][0] as { queryFn: () => Promise<typeof listing & { profiles?: unknown }> };
    const result = await queryOptions.queryFn();

    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/listing?id=listing-1",
      { throwOnError: true },
    );
    expect(fromMock).not.toHaveBeenCalledWith("listings");
    expect(fromMock).not.toHaveBeenCalledWith("profiles_public");
    expect(result.profiles).toEqual(publicProfile);
  });

  it("renders loading and not-found branches", () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true, error: null });
    const loading = renderPage();
    expect(loading.container.querySelector(".animate-spin")).toBeTruthy();
    loading.unmount();

    useQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("missing") });
    renderPage();
    expect(screen.getByText("Property not found.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to listings/i })).toHaveAttribute("href", "/listings");
  });

  it("routes signed-out favorite and interest actions to auth paths", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "favorite" }));
    fireEvent.click(screen.getByRole("button", { name: "interest login" }));
    fireEvent.click(screen.getByRole("button", { name: "submit interest" }));

    expect(toastMock.error).toHaveBeenCalledWith("Sign in to save properties");
    expect(navigateMock).toHaveBeenCalledWith("/login");
    expect(startConversationMock).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "share" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalled());
    expect(toastMock.success).toHaveBeenCalledWith("Link copied to clipboard");
  });

  it("redirects legacy sale listings with is_pre_sale away from the new-build detail route", async () => {
    useQueryMock.mockReturnValue({
      data: {
        ...listing,
        construction_status: "renovated",
        is_pre_sale: true,
        listing_type: "sale",
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith("/property/listing-1", { replace: true });
    });
  });

  it("renders the linked project summary and passes project units and media to the new-build sections", () => {
    renderPage();

    expect(screen.getAllByRole("heading", { name: "Marina Heights" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("1/1 units")).toBeInTheDocument();
    expect(screen.getByText("Unit sizes")).toBeInTheDocument();
    expect(screen.getByText("82 m²")).toBeInTheDocument();
    expect(screen.getByText("Layouts")).toBeInTheDocument();
    expect(screen.getByText("2 bed · 2 bath")).toBeInTheDocument();
    expect(screen.getByText("gallery title:Marina Heights")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Aegean Residences" })).not.toBeInTheDocument();
    expect(screen.getByText(/From/)).toHaveTextContent(/410[,.]000/);
    expect(screen.getByText("Mai Developments")).toBeInTheDocument();
    expect(screen.getByText("Aegean Studio")).toBeInTheDocument();
    expect(screen.getByText("BuildCo")).toBeInTheDocument();
    expect(screen.getAllByText("BP-2026-01").length).toBeGreaterThan(0);
    expect(screen.getByText("New waterfront regeneration zone.")).toBeInTheDocument();
    expect(screen.getByText("unit count:1")).toBeInTheDocument();
    expect(screen.getByText("A101")).toBeInTheDocument();
    expect(screen.getByText("media count:1")).toBeInTheDocument();
    expect(screen.getByText("A101 floor plan")).toBeInTheDocument();
  });

  it("starts conversations from contact affordances and writes interest records for signed-in users", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });

    renderPage();

    await waitFor(() => expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.any(Object)));
    expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
      body: expect.objectContaining({ title: "Marina Heights" }),
    }));
    expect(await screen.findByText("AI Estimate")).toBeInTheDocument();
    expect(screen.getByText(/500\.000/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask developer" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/messages?conv=conv-1"));

    fireEvent.click(screen.getByRole("button", { name: "favorite" }));
    expect(toggleFavoriteMock).toHaveBeenCalledWith({ listing_id: "listing-1", isFavorited: false });

    fireEvent.click(screen.getByRole("button", { name: "floor plans child" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/messages?conv=conv-1"));

    fireEvent.click(screen.getByRole("button", { name: "submit interest" }));
    await waitFor(() =>
      expect(startConversationMock).toHaveBeenCalledWith({ other_user_id: "owner-1", listing_id: "listing-1" }),
    );
    expect(fromMock).toHaveBeenCalledWith("new_building_leads");
    expect(fromMock).not.toHaveBeenCalledWith("notifications");
    expect(toastMock.success).toHaveBeenCalledWith("Interest registered — the developer will be in touch");
  });

  it("wires the snapshot Ask developer fallback when unit terms are unavailable", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    useQueryMock.mockReturnValue({
      data: {
        ...listing,
        project: {
          ...listing.project,
          project_units: listing.project.project_units.map((unit) => ({
            ...unit,
            vat_included: null,
          })),
        },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    const askDeveloperButtons = screen.getAllByRole("button", { name: "Ask developer" });
    expect(askDeveloperButtons.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(askDeveloperButtons[0]);
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/messages?conv=conv-1"));
  });

  it("handles contact errors without leaving the loading state stuck", async () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: null });
    startConversationMock.mockRejectedValueOnce(new Error("offline"));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Ask developer" }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Could not start conversation"));
  });
});
