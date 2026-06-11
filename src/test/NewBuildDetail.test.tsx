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
  PropertyGallery: ({ onFavorite, onShare }: { onFavorite: () => void; onShare: () => void }) => (
    <div>
      <button type="button" onClick={onFavorite}>favorite</button>
      <button type="button" onClick={onShare}>share</button>
    </div>
  ),
}));
vi.mock("@/components/new-build/ConstructionTimeline", () => ({ ConstructionTimeline: () => <div data-testid="timeline" /> }));
vi.mock("@/components/new-build/FloorPlanSection", () => ({
  FloorPlanSection: ({ onRequestPlans }: { onRequestPlans: () => void }) => (
    <button type="button" onClick={onRequestPlans}>floor plans child</button>
  ),
}));
vi.mock("@/components/new-build/ConstructionSpecs", () => ({ ConstructionSpecs: () => <div data-testid="specs" /> }));
vi.mock("@/components/new-build/UnitShowcase", () => ({
  UnitShowcase: ({ onContact }: { onContact: () => void }) => <button type="button" onClick={onContact}>unit contact</button>,
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
  is_pre_sale: true,
  listing_type: "sale",
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
      marketComparisonPct: -3,
      rentalYieldEstimate: 4.4,
      estimatedValue: 430000,
      marketComparison: "below_market",
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

  it("redirects normal sale listings away from the new-build detail route", async () => {
    useQueryMock.mockReturnValue({
      data: {
        ...listing,
        construction_status: "renovated",
        is_pre_sale: false,
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

  it("starts conversations from contact affordances and writes interest records for signed-in users", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });

    renderPage();

    await waitFor(() => expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.any(Object)));
    expect(await screen.findByText("AI Estimate")).toBeInTheDocument();

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

  it("handles contact errors without leaving the loading state stuck", async () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: null });
    startConversationMock.mockRejectedValueOnce(new Error("offline"));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "unit contact" }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Could not start conversation"));
  });
});
