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
  registerInterestCardPropsMock,
  navigateMock,
  fromMock,
  publicApiMock,
  functionsInvokeMock,
  useAiQuotaMock,
  toastMock,
} = vi.hoisted(() => ({
  useQueryMock: vi.fn(),
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
  useIsFavoritedMock: vi.fn(),
  toggleFavoriteMock: vi.fn(),
  startConversationMock: vi.fn(),
  registerInterestCardPropsMock: vi.fn(),
  navigateMock: vi.fn(),
  fromMock: vi.fn(),
  publicApiMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
  useAiQuotaMock: vi.fn(),
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
  isPublicApiAbort: () => false,
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => useSubscriptionMock() }));
vi.mock("@/hooks/useAiQuota", () => ({
  UNLIMITED_AI_LIMIT: 999_999,
  useAiQuota: (...args: unknown[]) => useAiQuotaMock(...args),
}));
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
vi.mock("@/components/PropertyValuation", () => ({
  default: (props: { price: number; sqm: number; pricePerSqm?: number | null; propertyType?: string | null }) => (
    <div
      data-testid="valuation"
      data-price={String(props.price)}
      data-sqm={String(props.sqm)}
      data-price-per-sqm={props.pricePerSqm == null ? "" : String(props.pricePerSqm)}
      data-property-type={props.propertyType ?? ""}
    />
  ),
}));
vi.mock("@/components/NeighbourhoodReport", () => ({
  default: (props: { propertyType?: string | null; city?: string | null; region?: string | null }) => (
    <div
      data-testid="neighbourhood"
      data-property-type={props.propertyType ?? ""}
      data-city={props.city ?? ""}
      data-region={props.region ?? ""}
    />
  ),
}));
vi.mock("@/components/property/PropertyScoresSection", () => ({
  PropertyScoresSection: ({ walkScore }: { walkScore: number | null }) => <div data-testid="scores">walk:{walkScore ?? "none"}</div>,
}));
vi.mock("@/components/new-build/PropertyGallery", () => ({
  PropertyGallery: ({
    title,
    images,
    onFavorite,
    onShare,
  }: {
    title: string;
    images: string[];
    onFavorite: () => void;
    onShare: () => void;
  }) => (
    <div>
      <span>gallery title:{title}</span>
      <span data-testid="gallery-first-image">{images[0] ?? ""}</span>
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
  }) => {
    registerInterestCardPropsMock({ user, onLogin, onContact });
    return (
      <div>
      <span>{user ? "signed in interest" : "signed out interest"}</span>
      <button type="button" onClick={onLogin}>interest login</button>
      <button type="button" onClick={() => void onContact({ name: "Form Name", phone: "555", message: "Send plans" }).catch(() => undefined)}>
        submit interest
      </button>
      <button type="button" onClick={() => void onContact({ name: " ", phone: " ", message: " " }).catch(() => undefined)}>
        submit blank interest
      </button>
      </div>
    );
  },
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
  has_balcony: true,
  has_video_tour: true,
  tags: ["penthouse", "parking", "pool"],
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
    cover_image_url: "https://cdn/project-cover.jpg",
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
    registerInterestCardPropsMock,
    navigateMock,
    fromMock,
    publicApiMock,
    functionsInvokeMock,
    useAiQuotaMock,
    toastMock.error,
    toastMock.success,
  ].forEach((mock) => mock.mockReset());

  useAuthMock.mockReturnValue({ user: null, profile: null });
  useSubscriptionMock.mockReturnValue({ isPro: false });
  useAiQuotaMock.mockReturnValue({
    quota: { allowed: true, reason: null, used: 0, limit: 5, remaining: 5 },
    quotaLoading: false,
    quotaChecked: true,
    refreshQuota: vi.fn().mockResolvedValue({ allowed: true, reason: null, used: 0, limit: 5, remaining: 5 }),
  });
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
    const queryOptions = useQueryMock.mock.calls[0][0] as {
      queryKey: unknown[];
      queryFn: (ctx: { signal: AbortSignal }) => Promise<typeof listing & { profiles?: unknown }>;
    };
    const result = await queryOptions.queryFn({ signal: new AbortController().signal });

    expect(queryOptions.queryKey).toEqual([
      "listing",
      "listing-1",
      { publicScope: true, publicationId: null },
    ]);
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/listing?id=listing-1",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
    expect(fromMock).not.toHaveBeenCalledWith("listings");
    expect(fromMock).not.toHaveBeenCalledWith("profiles_public");
    expect(result.profiles).toEqual(publicProfile);
  });

  it("pins route-state publications to the canonical listing detail query", () => {
    render(
      <MemoryRouter
        initialEntries={[{
          pathname: "/new-build/listing-1",
          state: { listing: { ...listing, publicationId: 913 } },
        }]}
        future={{ v7_relativeSplatPath: true, v7_startTransition: true }}
      >
        <Routes>
          <Route path="/new-build/:id" element={<NewBuildDetail />} />
        </Routes>
      </MemoryRouter>,
    );

    const queryOptions = useQueryMock.mock.calls[0][0] as {
      placeholderData?: { id?: string; publicationId?: number };
      queryKey: unknown[];
    };
    expect(queryOptions.queryKey).toEqual([
      "listing",
      "listing-1",
      { publicScope: true, publicationId: 913 },
    ]);
    expect(queryOptions.placeholderData).toEqual(expect.objectContaining({
      id: "listing-1",
      publicationId: 913,
    }));
  });

  it("does not switch to a direct Supabase detail read when the public API fails", async () => {
    publicApiMock.mockRejectedValue(new Error("canonical new-build detail unavailable"));

    renderPage();
    const queryOptions = useQueryMock.mock.calls[0][0] as {
      queryFn: (ctx: { signal: AbortSignal }) => Promise<unknown>;
    };

    await expect(queryOptions.queryFn({ signal: new AbortController().signal }))
      .rejects.toThrow("canonical new-build detail unavailable");
    expect(fromMock).not.toHaveBeenCalledWith("listings");
    expect(fromMock).not.toHaveBeenCalledWith("profiles_public");
  });

  it("renders loading and not-found branches", () => {
    useQueryMock.mockReturnValue({ data: null, isLoading: true, error: null });
    const loading = renderPage();
    expect(loading.container.querySelector("#main-content")).toBeTruthy();
    expect(loading.container.querySelector(".animate-spin")).toBeTruthy();
    loading.unmount();

    useQueryMock.mockReturnValue({ data: null, isLoading: false, error: new Error("missing") });
    const notFound = renderPage();
    expect(notFound.container.querySelector("#main-content")).toBeTruthy();
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
        publicationId: 913,
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    await waitFor(() => {
      expect(navigateMock).toHaveBeenCalledWith(
        "/property/listing-1",
        {
          replace: true,
          state: {
            listing: expect.objectContaining({
              id: "listing-1",
              publicationId: 913,
            }),
          },
        },
      );
    });
  });

  it("renders the linked project summary and passes project units and media to the new-build sections", () => {
    renderPage();

    const heroRow = screen.getByTestId("new-build-title-price-row");
    const priceBlock = screen.getByTestId("new-build-price-block");
    expect(heroRow).toHaveClass("flex-col");
    expect(heroRow).toHaveClass("sm:flex-row");
    expect(priceBlock).toHaveClass("w-full");
    expect(priceBlock).toHaveClass("sm:w-auto");
    expect(screen.getAllByRole("heading", { name: "Marina Heights" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Inventory")).toBeInTheDocument();
    expect(screen.getByText("1/1 units")).toBeInTheDocument();
    expect(screen.getByText("Unit sizes")).toBeInTheDocument();
    expect(screen.getByText("82 m²")).toBeInTheDocument();
    expect(screen.getByText("Layouts")).toBeInTheDocument();
    expect(screen.getByText("2 bed · 2 bath")).toBeInTheDocument();
    expect(screen.getByText("gallery title:Marina Heights")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-first-image")).toHaveTextContent("https://cdn/project-cover.jpg");
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

    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));
    await waitFor(() => expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.any(Object)));
    expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
      body: expect.objectContaining({ title: "Marina Heights" }),
    }));
    expect(await screen.findByText("AI Estimate")).toBeInTheDocument();
    expect(screen.getByText(/500\.000/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Ask developer" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/messages?conversation=conv-1"));

    fireEvent.click(screen.getByRole("button", { name: "favorite" }));
    expect(toggleFavoriteMock).toHaveBeenCalledWith({ listing_id: "listing-1", isFavorited: false });

    fireEvent.click(screen.getByRole("button", { name: "floor plans child" }));
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/messages?conversation=conv-1"));

    fireEvent.click(screen.getByRole("button", { name: "submit interest" }));
    await waitFor(() =>
      expect(startConversationMock).toHaveBeenCalledWith({ other_user_id: "owner-1", listing_id: "listing-1" }),
    );
    expect(fromMock).toHaveBeenCalledWith("new_building_leads");
    expect(fromMock).not.toHaveBeenCalledWith("notifications");
    expect(toastMock.success).toHaveBeenCalledWith("Your enquiry was saved successfully.");
  });

  it("rejects the interest callback when persistence rejects and never reports success", async () => {
    const insertError = { code: "42501", message: "permission denied" };
    const insertMock = vi.fn().mockResolvedValue({ data: null, error: insertError });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    fromMock.mockReturnValue({ insert: insertMock });

    renderPage();
    const onContact = registerInterestCardPropsMock.mock.lastCall?.[0].onContact as
      | ((form: { name: string; phone: string; message: string }) => Promise<void>)
      | undefined;

    expect(onContact).toBeTypeOf("function");
    await expect(onContact?.({ name: "Buyer One", phone: "555-1", message: "Send plans" }))
      .rejects.toMatchObject(insertError);
    expect(insertMock).toHaveBeenCalledOnce();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("rejects the interest callback when conversation creation rejects without inserting or reporting success", async () => {
    const conversationError = new Error("conversation unavailable");
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    startConversationMock.mockRejectedValueOnce(conversationError);
    fromMock.mockReturnValue({ insert: insertMock });

    renderPage();
    const onContact = registerInterestCardPropsMock.mock.lastCall?.[0].onContact as
      | ((form: { name: string; phone: string; message: string }) => Promise<void>)
      | undefined;

    await expect(onContact?.({ name: "Buyer One", phone: "555-1", message: "Send plans" }))
      .rejects.toThrow("conversation unavailable");
    expect(insertMock).not.toHaveBeenCalled();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("rejects the interest callback when the listing has no enquiry recipient", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    useQueryMock.mockReturnValue({
      data: { ...listing, owner_id: null },
      isLoading: false,
      error: null,
    });

    renderPage();
    const onContact = registerInterestCardPropsMock.mock.lastCall?.[0].onContact as
      (form: { name: string; phone: string; message: string }) => Promise<void>;

    await expect(onContact({ name: "Buyer One", phone: "555-1", message: "Send plans" }))
      .rejects.toThrow("This listing cannot accept enquiries");
    expect(startConversationMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalledWith("new_building_leads");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("allows retry after an ambiguous insert response without claiming exactly-once delivery", async () => {
    const lostResponse = new Error("response lost after commit");
    const insertMock = vi.fn()
      .mockResolvedValueOnce({ data: null, error: lostResponse })
      .mockResolvedValueOnce({ data: null, error: null });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    fromMock.mockReturnValue({ insert: insertMock });

    renderPage();
    const onContact = registerInterestCardPropsMock.mock.lastCall?.[0].onContact as
      (form: { name: string; phone: string; message: string }) => Promise<void>;
    const form = { name: "Buyer One", phone: "555-1", message: "Send plans" };

    await expect(onContact(form)).rejects.toBe(lostResponse);
    expect(toastMock.success).not.toHaveBeenCalled();

    await expect(onContact(form)).resolves.toBeUndefined();
    expect(insertMock).toHaveBeenCalledTimes(2);
    expect(toastMock.success).toHaveBeenCalledOnce();
  });

  it("uses all project units as representative metrics for new-build valuation", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    useQueryMock.mockReturnValue({
      data: {
        ...listing,
        price: 275000,
        price_per_sqm: 7051,
        sqm: 39,
        project: {
          ...listing.project,
          project_units: [
            {
              ...listing.project.project_units[0],
              id: "unit-1",
              internal_sqm: 50,
              price: 350000,
              price_per_sqm: 7000,
            },
            {
              ...listing.project.project_units[0],
              id: "unit-2",
              unit_number: "A102",
              internal_sqm: 100,
              price: 750000,
              price_per_sqm: 7500,
            },
          ],
        },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText("Run AI analysis when you need it")).toBeInTheDocument();
    expect(screen.getByText("5 of 5 Free AI insight requests remaining this month")).toBeInTheDocument();
    expect(functionsInvokeMock).not.toHaveBeenCalledWith("property-valuation", expect.anything());

    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));

    await waitFor(() =>
      expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
        body: expect.objectContaining({
          price: 550000,
          sqm: 75,
          pricePerSqm: 7333,
          hasParking: true,
          hasPool: true,
          hasElevator: true,
          hasGarden: true,
          hasStorage: true,
          hasBalcony: true,
          hasView: true,
          description: expect.stringContaining("Waterfront homes with shared amenities."),
          tags: expect.arrayContaining(["penthouse", "parking", "pool", "storage", "garden", "view"]),
        }),
      })),
    );

    expect(screen.getByTestId("valuation")).toHaveAttribute("data-price", "550000");
    expect(screen.getByTestId("valuation")).toHaveAttribute("data-sqm", "75");
    expect(screen.getByTestId("valuation")).toHaveAttribute("data-price-per-sqm", "7333");
    expect(screen.getByTestId("valuation")).toHaveAttribute("data-property-type", "apartment");
    expect(screen.getByTestId("neighbourhood")).toHaveAttribute("data-property-type", "apartment");
  });

  it("shows the quota error instead of generic unavailable text when new-build AI insights are exhausted", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "kostisrenios@gmail.com" },
      profile: { display_name: "Buyer One" },
    });
    functionsInvokeMock.mockResolvedValue({
      data: { error: "monthly_limit_reached" },
      error: new Error("Edge Function returned a non-2xx status code"),
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));

    expect(
      await screen.findByText(/You have reached this month's AI allowance/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Upgrade/i })).toHaveAttribute("href", "/pricing");
    expect(screen.getByRole("link", { name: /Buy AI add-on/i })).toHaveAttribute(
      "href",
      "/dashboard?tab=billing&addon=valuation_single",
    );
    expect(screen.queryByText("Market analysis unavailable")).not.toBeInTheDocument();
  });

  it("does not invoke valuation when the non-consuming quota precheck rejects the request", async () => {
    const exhaustedQuota = {
      allowed: false,
      reason: "monthly_limit_reached",
      used: 5,
      limit: 5,
      remaining: 0,
    };
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    useAiQuotaMock.mockReturnValue({
      quota: exhaustedQuota,
      quotaLoading: false,
      quotaChecked: true,
      refreshQuota: vi.fn().mockResolvedValue(exhaustedQuota),
    });

    renderPage();

    expect(screen.getByRole("link", { name: /Upgrade to Pro/i })).toHaveAttribute("href", "/pricing");
    expect(screen.queryByRole("button", { name: /Load AI insights/i })).not.toBeInTheDocument();
    expect(functionsInvokeMock).not.toHaveBeenCalledWith("property-valuation", expect.anything());
  });

  it("uses hybrid sale valuation context for renovation projects shown in the project layout", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    useQueryMock.mockReturnValue({
      data: {
        ...listing,
        listing_type: "new_build",
        construction_status: "renovated",
        year_built: 1982,
        tags: ["renovation_project", "renovation_year:2026"],
        project: {
          ...listing.project,
          project_units: [
            {
              ...listing.project.project_units[0],
              id: "unit-1",
              internal_sqm: 80,
              price: 280000,
            },
            {
              ...listing.project.project_units[0],
              id: "unit-2",
              unit_number: "2",
              internal_sqm: 100,
              price: 360000,
            },
          ],
        },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));

    await waitFor(() =>
      expect(functionsInvokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
        body: expect.objectContaining({
          listingType: "sale",
          condition: "renovated",
          yearBuilt: 1982,
          tags: expect.arrayContaining(["renovation_project", "renovation_year:2026"]),
        }),
      })),
    );
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
    await waitFor(() => expect(navigateMock).toHaveBeenCalledWith("/messages?conversation=conv-1"));
  });

  it("handles contact errors without leaving the loading state stuck", async () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: null });
    startConversationMock.mockRejectedValueOnce(new Error("offline"));

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Ask developer" }));

    await waitFor(() => expect(toastMock.error).toHaveBeenCalledWith("Could not start conversation"));
  });

  it("renders listing-level fallbacks when a project has no unit inventory or developer profile", () => {
    useQueryMock.mockReturnValue({
      data: {
        ...listing,
        project: null,
        profiles: null,
        owner_id: null,
        title: "Standalone New Building",
        address: null,
        region: null,
        latitude: null,
        longitude: null,
        price: 200000,
        price_per_sqm: 4000,
        sqm: 50,
        bedrooms: null,
        bathrooms: null,
        total_floors: null,
        year_built: null,
        energy_class: "Z",
        construction_status: null,
        description: null,
        tags: null,
        cover_image_url: null,
        listing_images: [],
        has_elevator: false,
        has_ac: false,
        has_solar_water: false,
        has_storage: false,
        has_security: false,
        has_fireplace: false,
        has_underfloor_heating: false,
        has_smart_home: false,
        has_parking: false,
        has_garden: false,
        has_pool: false,
        has_view: false,
        has_video_tour: false,
        has_virtual_tour: false,
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getAllByRole("heading", { name: "Standalone New Building" }).length).toBeGreaterThan(0);
    expect(screen.getByText("Price guide")).toBeInTheDocument();
    expect(screen.getAllByText("On request").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("TBA").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Features & Amenities")).not.toBeInTheDocument();
    expect(screen.queryByText("Project Description")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Call developer/i })).not.toBeInTheDocument();
    expect(screen.getByText("Z")).toBeInTheDocument();
    expect(screen.getByTestId("valuation")).toHaveAttribute("data-price", "200000");
    expect(screen.getByTestId("valuation")).toHaveAttribute("data-sqm", "50");
  });

  it("uses profile identity and phone fallbacks for a blank signed-in interest form", async () => {
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-2", email: "buyer2@example.com" },
      profile: { display_name: " ", first_name: "Dimitra", phone: " 6900000000 " },
    });
    fromMock.mockReturnValue({ insert: insertMock });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "submit blank interest" }));

    await waitFor(() => expect(insertMock).toHaveBeenCalledWith(expect.objectContaining({
      new_building_id: "listing-1",
      user_id: "buyer-2",
      email: "buyer2@example.com",
      full_name: "Dimitra",
      phone: "6900000000",
      notes: "",
      investment_budget: 0,
    })));
    expect(startConversationMock).toHaveBeenCalledWith({ other_user_id: "owner-1", listing_id: "listing-1" });
  });

  it("uses conservative AI defaults when optional valuation commentary is absent", async () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: { display_name: "Buyer" } });
    functionsInvokeMock.mockResolvedValue({ data: { estimatedValue: 430000 }, error: null });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));

    expect(await screen.findByText("AI Estimate")).toBeInTheDocument();
    expect(screen.getByText(/430\.000/)).toBeInTheDocument();
    expect(screen.getByText("Confidence: Medium")).toBeInTheDocument();
  });

  it("supports native sharing and exposes the developer phone only when supplied", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "share" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "Aegean Residences" })));
    expect(screen.getByRole("link", { name: /Call developer/i })).toHaveAttribute("href", "tel:phone-redacted");
  });

  it("shows the provider error branch when AI valuation rejects", async () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: null });
    functionsInvokeMock.mockRejectedValue(new Error("provider timeout"));

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));

    expect(await screen.findByText("provider timeout")).toBeInTheDocument();
    expect(screen.queryByText("AI Estimate")).not.toBeInTheDocument();
  });
});
