import { describe, it, expect, vi, beforeEach } from "vitest";
import { valuationV2 } from "@/test/valuationV2Fixture";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
  rpcMock,
  publicApiMock,
  functionsInvokeMock,
  useAiQuotaMock,
  toastMock,
  miniMapPropsMock,
  scorePropsMock,
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
  rpcMock: vi.fn(),
  publicApiMock: vi.fn(),
  functionsInvokeMock: vi.fn(),
  useAiQuotaMock: vi.fn(),
  toastMock: { error: vi.fn(), success: vi.fn(), dismiss: vi.fn() },
  miniMapPropsMock: vi.fn(),
  scorePropsMock: vi.fn(),
}));

vi.mock("@tanstack/react-query", async () => {
  const actual = await vi.importActual<typeof import("@tanstack/react-query")>("@tanstack/react-query");
  return { ...actual, useQuery: (...args: unknown[]) => useQueryMock(...args) };
});
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
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
  default: (props: Record<string, unknown>) => { miniMapPropsMock(props); return <div>mini map</div>; },
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
  PropertyScoresSection: (props: Record<string, unknown>) => { scorePropsMock(props); return <div data-testid="scores" />; },
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
    ...submissionProps
  }: {
    user: { id: string } | null;
    onLogin: () => void;
    onContact: (form: { name: string; phone: string; message: string }) => Promise<unknown>;
    submissionStatus?: string;
    submissionError?: string | null;
    onRetry?: () => Promise<void>;
    onStartNew?: () => void;
  }) => {
    registerInterestCardPropsMock({ user, onLogin, onContact, ...submissionProps });
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

const page = () => (
    <MemoryRouter initialEntries={["/new-build/listing-1"]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
      <Routes>
        <Route path="/new-build/:id" element={<NewBuildDetail />} />
      </Routes>
    </MemoryRouter>
  );
const renderPage = () => render(page());

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
    rpcMock,
    publicApiMock,
    functionsInvokeMock,
    useAiQuotaMock,
    toastMock.error,
    toastMock.success,
    toastMock.dismiss,
    miniMapPropsMock,
    scorePropsMock,
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
  rpcMock.mockResolvedValue({
    data: [{
      id: "e1800000-0000-4000-8000-000000000001",
      new_building_id: "listing-1",
      created_at: "2026-09-23T19:00:00.000Z",
    }],
    error: null,
  });
  toastMock.success.mockReturnValue("interest-toast-1");
  functionsInvokeMock.mockResolvedValue({
    data: valuationV2({ estimatedValue: 500000, marketComparisonPct: 19, marketComparison: "above_market", pricingPosition: "overpriced", confidence: 80, confidenceLabel: "High", evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, estimatedValue: "ai_estimate", pricePerSqmEstimate: "derived_ai", marketComparisonPct: "derived_ai" }, analysis: "ai_estimate" } }),
    error: null,
  });
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    share: undefined,
  });
});

describe("NewBuildDetail", () => {
  it("passes only the stored walk score and no runtime POI score callback", async () => {
    renderPage();

    expect(await screen.findByText("mini map")).toBeInTheDocument();
    expect(miniMapPropsMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("onWalkScoreChange");
    expect(scorePropsMock.mock.calls.at(-1)?.[0]).toMatchObject({ walkabilityScore: 70 });
    expect(scorePropsMock.mock.calls.at(-1)?.[0]).not.toHaveProperty("walkScore");
  });

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

  it("renders the public owner identity with neutral developer wording when no verification decision exists", () => {
    useQueryMock.mockReturnValue({
      data: {
        ...listing,
        profiles: {
          user_id: "owner-1",
          display_name: "Mai Developer",
          avatar_url: null,
        },
      },
      isLoading: false,
      error: null,
    });

    renderPage();

    expect(screen.getByText("Mai Developer")).toBeInTheDocument();
    expect(screen.getAllByText("Developer").length).toBeGreaterThan(0);
    expect(screen.queryByText("Verified developer")).not.toBeInTheDocument();
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
    expect(rpcMock).toHaveBeenCalledWith("submit_new_build_enquiry", expect.objectContaining({
      p_user_id: "buyer-1",
      p_new_building_id: "listing-1",
      p_email: "buyer@example.com",
      p_full_name: "Form Name",
      p_phone: "555",
      p_notes: "Send plans",
    }));
    expect(fromMock).not.toHaveBeenCalledWith("new_building_leads");
    expect(fromMock).not.toHaveBeenCalledWith("notifications");
    expect(toastMock.success).toHaveBeenCalledWith("Your enquiry was saved successfully.");
  });

  it("rejects the interest callback when persistence rejects and never reports success", async () => {
    const insertError = { code: "42501", message: "permission denied" };
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    rpcMock.mockResolvedValue({ data: null, error: insertError });

    renderPage();
    const onContact = registerInterestCardPropsMock.mock.lastCall?.[0].onContact as
      | ((form: { name: string; phone: string; message: string }) => Promise<void>)
      | undefined;

    expect(onContact).toBeTypeOf("function");
    let outcome: unknown;
    await act(async () => {
      outcome = await onContact?.({ name: "Buyer One", phone: "555-1", message: "Send plans" });
    });
    expect(outcome).toBe("rejected");
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("rejects the interest callback when conversation creation rejects without inserting or reporting success", async () => {
    const conversationError = new Error("conversation unavailable");
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    startConversationMock.mockRejectedValueOnce(conversationError);

    renderPage();
    const onContact = registerInterestCardPropsMock.mock.lastCall?.[0].onContact as
      | ((form: { name: string; phone: string; message: string }) => Promise<void>)
      | undefined;

    let outcome: unknown;
    await act(async () => {
      outcome = await onContact?.({ name: "Buyer One", phone: "555-1", message: "Send plans" });
    });
    expect(outcome).toBe("rejected");
    expect(rpcMock).not.toHaveBeenCalled();
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

    let outcome: unknown;
    await act(async () => {
      outcome = await onContact({ name: "Buyer One", phone: "555-1", message: "Send plans" });
    });
    expect(outcome).toBe("rejected");
    expect(startConversationMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalledWith("new_building_leads");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("allows retry after an ambiguous insert response without claiming exactly-once delivery", async () => {
    const lostResponse = { code: "FETCH_ERROR", message: "response lost after commit" };
    rpcMock
      .mockResolvedValueOnce({ data: null, error: lostResponse })
      .mockResolvedValueOnce({
        data: [{ id: "e1800000-0000-4000-8000-000000000002", new_building_id: "listing-1", created_at: "2026-09-23T19:01:00.000Z" }],
        error: null,
      });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });

    const view = renderPage();
    let props = registerInterestCardPropsMock.mock.lastCall?.[0] as {
      onContact: (form: { name: string; phone: string; message: string }) => Promise<unknown>;
      onRetry: () => Promise<void>;
      submissionStatus: string;
    };
    const form = { name: "Buyer One", phone: "555-1", message: "Send plans" };

    await expect(props.onContact(form)).resolves.toBe("uncertain");
    expect(toastMock.success).not.toHaveBeenCalled();
    await waitFor(() => {
      props = registerInterestCardPropsMock.mock.lastCall?.[0];
      expect(props.submissionStatus).toBe("uncertain");
    });

    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "changed@example.com" },
      profile: { display_name: "Changed Profile", phone: "999" },
    });
    view.rerender(page());
    props = registerInterestCardPropsMock.mock.lastCall?.[0];

    await expect(props.onRetry()).resolves.toBeUndefined();
    expect(rpcMock).toHaveBeenCalledTimes(2);
    expect(rpcMock.mock.calls[0]).toEqual(rpcMock.mock.calls[1]);
    expect(rpcMock.mock.calls[0]?.[0]).toBe("submit_new_build_enquiry");
    expect(rpcMock.mock.calls[0]?.[1]).toMatchObject({
      p_user_id: "buyer-1",
      p_new_building_id: "listing-1",
      p_email: "buyer@example.com",
      p_full_name: "Buyer One",
      p_phone: "555-1",
      p_notes: "Send plans",
    });
    expect(rpcMock.mock.calls[0]?.[1].p_submission_key).toMatch(/^[0-9a-f-]{36}$/i);
    expect(startConversationMock).toHaveBeenCalledOnce();
    expect(toastMock.success).toHaveBeenCalledOnce();
    expect(fromMock).not.toHaveBeenCalledWith("new_building_leads");
  });

  it("keeps an ambiguous attempt frozen when a later retry is definitely rejected", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: "FETCH_ERROR", message: "response lost" } })
      .mockResolvedValueOnce({ data: null, error: { code: "42501", message: "permission denied" } });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    renderPage();
    let props = registerInterestCardPropsMock.mock.lastCall?.[0];

    await expect(props.onContact({ name: "Buyer One", phone: "555-1", message: "Send plans" }))
      .resolves.toBe("uncertain");
    await waitFor(() => {
      props = registerInterestCardPropsMock.mock.lastCall?.[0];
      expect(props.submissionStatus).toBe("uncertain");
    });
    await props.onRetry();

    expect(rpcMock.mock.calls[0]).toEqual(rpcMock.mock.calls[1]);
    expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionStatus).toBe("uncertain");
    expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionError).toBe("permission denied");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("admits only one mounted-controller submission while conversation creation is pending", async () => {
    let resolveConversation!: (value: string) => void;
    startConversationMock.mockReturnValue(new Promise((resolve) => { resolveConversation = resolve; }));
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    renderPage();
    const props = registerInterestCardPropsMock.mock.lastCall?.[0];
    const form = { name: "Buyer One", phone: "", message: "Send plans" };

    const first = props.onContact(form);
    await waitFor(() => expect(startConversationMock).toHaveBeenCalledOnce());
    await expect(props.onContact(form)).resolves.toBe("rejected");
    expect(startConversationMock).toHaveBeenCalledOnce();
    expect(rpcMock).not.toHaveBeenCalled();

    resolveConversation("conv-1");
    await expect(first).resolves.toBe("confirmed");
    expect(rpcMock).toHaveBeenCalledOnce();
  });

  it("discards a late receipt after the actor scope changes", async () => {
    let resolveRpc!: (value: unknown) => void;
    rpcMock.mockReturnValue(new Promise((resolve) => { resolveRpc = resolve; }));
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    const view = renderPage();
    const firstProps = registerInterestCardPropsMock.mock.lastCall?.[0];
    const pending = firstProps.onContact({ name: "Buyer One", phone: "", message: "Send plans" });
    await waitFor(() => expect(rpcMock).toHaveBeenCalledOnce());

    useAuthMock.mockReturnValue({
      user: { id: "buyer-2", email: "buyer2@example.com" },
      profile: { display_name: "Buyer Two" },
    });
    view.rerender(page());
    expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionStatus).toBe("editing");
    resolveRpc({ data: [{ id: "e1800000-0000-4000-8000-000000000003", new_building_id: "listing-1", created_at: "2026-09-23T19:10:00.000Z" }], error: null });
    await expect(pending).resolves.toBe("rejected");
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionStatus).toBe("editing");
  });

  it("dismisses only its completed success toast when the actor scope changes", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    const view = renderPage();
    const props = registerInterestCardPropsMock.mock.lastCall?.[0];

    await expect(props.onContact({ name: "Buyer One", phone: "", message: "Send plans" }))
      .resolves.toBe("confirmed");
    expect(toastMock.success).toHaveBeenCalledOnce();

    useAuthMock.mockReturnValue({
      user: { id: "buyer-2", email: "buyer2@example.com" },
      profile: { display_name: "Buyer Two" },
    });
    view.rerender(page());

    expect(toastMock.dismiss).toHaveBeenCalledOnce();
    expect(toastMock.dismiss).toHaveBeenCalledWith("interest-toast-1");
    expect(toastMock.dismiss).not.toHaveBeenCalledWith("unrelated-toast");
  });

  it("dismisses its completed success toast on listing replacement and unmount", async () => {
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    const view = renderPage();
    let props = registerInterestCardPropsMock.mock.lastCall?.[0];
    await props.onContact({ name: "Buyer One", phone: "", message: "First listing" });

    useQueryMock.mockReturnValue({ data: { ...listing, id: "listing-2" }, isLoading: false, error: null });
    view.rerender(page());
    expect(toastMock.dismiss).toHaveBeenCalledWith("interest-toast-1");

    toastMock.success.mockReturnValue("interest-toast-2");
    rpcMock.mockResolvedValue({
      data: [{
        id: "e1800000-0000-4000-8000-000000000009",
        new_building_id: "listing-2",
        created_at: "2026-09-23T19:20:00.000Z",
      }],
      error: null,
    });
    props = registerInterestCardPropsMock.mock.lastCall?.[0];
    await props.onContact({ name: "Buyer One", phone: "", message: "Second listing" });
    view.unmount();

    expect(toastMock.dismiss).toHaveBeenCalledWith("interest-toast-2");
  });

  it("replaces an earlier owned confirmation when the same scope submits again", async () => {
    toastMock.success
      .mockReturnValueOnce("interest-toast-1")
      .mockReturnValueOnce("interest-toast-2");
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    const view = renderPage();
    let props = registerInterestCardPropsMock.mock.lastCall?.[0];

    await props.onContact({ name: "Buyer One", phone: "", message: "First" });
    await waitFor(() => expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionStatus).toBe("confirmed"));
    props = registerInterestCardPropsMock.mock.lastCall?.[0];
    props.onStartNew();
    await waitFor(() => expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionStatus).toBe("editing"));
    props = registerInterestCardPropsMock.mock.lastCall?.[0];
    await props.onContact({ name: "Buyer One", phone: "", message: "Second" });

    expect(toastMock.dismiss).toHaveBeenCalledTimes(1);
    expect(toastMock.dismiss).toHaveBeenCalledWith("interest-toast-1");
    view.unmount();
    expect(toastMock.dismiss).toHaveBeenLastCalledWith("interest-toast-2");
  });

  it("rotates the key only after an explicit new-enquiry action", async () => {
    rpcMock
      .mockResolvedValueOnce({ data: null, error: { code: "FETCH_ERROR", message: "lost" } })
      .mockResolvedValueOnce({ data: [{ id: "e1800000-0000-4000-8000-000000000004", new_building_id: "listing-1", created_at: "2026-09-23T19:11:00.000Z" }], error: null });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    renderPage();
    let props = registerInterestCardPropsMock.mock.lastCall?.[0];
    await props.onContact({ name: "Buyer One", phone: "", message: "Original details" });
    await waitFor(() => {
      props = registerInterestCardPropsMock.mock.lastCall?.[0];
      expect(props.submissionStatus).toBe("uncertain");
    });
    props.onStartNew();
    await waitFor(() => expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionStatus).toBe("editing"));
    props = registerInterestCardPropsMock.mock.lastCall?.[0];
    await props.onContact({ name: "Buyer One", phone: "", message: "Changed details" });

    const firstArgs = rpcMock.mock.calls[0]?.[1];
    const secondArgs = rpcMock.mock.calls[1]?.[1];
    expect(firstArgs.p_submission_key).not.toBe(secondArgs.p_submission_key);
    expect(firstArgs.p_notes).toBe("Original details");
    expect(secondArgs.p_notes).toBe("Changed details");
    expect(startConversationMock).toHaveBeenCalledTimes(2);
  });

  it("treats an empty RPC success payload as uncertain and never falls back to a raw insert", async () => {
    rpcMock.mockResolvedValue({ data: [], error: null });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One", phone: "555-1" },
    });
    renderPage();
    const onContact = registerInterestCardPropsMock.mock.lastCall?.[0].onContact as
      (form: { name: string; phone: string; message: string }) => Promise<unknown>;

    await expect(onContact({ name: "Buyer One", phone: "555-1", message: "Send plans" }))
      .resolves.toBe("uncertain");
    expect(rpcMock).toHaveBeenCalledOnce();
    expect(fromMock).not.toHaveBeenCalledWith("new_building_leads");
    expect(toastMock.success).not.toHaveBeenCalled();
  });

  it("rejects a malformed receipt identity instead of confirming an enquiry", async () => {
    rpcMock.mockResolvedValue({
      data: [{ id: "not-a-uuid", new_building_id: "listing-1", created_at: "2026-09-23T19:12:00.000Z" }],
      error: null,
    });
    useAuthMock.mockReturnValue({
      user: { id: "buyer-1", email: "buyer@example.com" },
      profile: { display_name: "Buyer One" },
    });
    renderPage();
    const props = registerInterestCardPropsMock.mock.lastCall?.[0];

    await expect(props.onContact({ name: "Buyer One", phone: "", message: "Send plans" }))
      .resolves.toBe("uncertain");

    expect(registerInterestCardPropsMock.mock.lastCall?.[0].submissionError)
      .toBe("The server returned an invalid enquiry receipt.");
    expect(toastMock.success).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalledWith("new_building_leads");
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
    useAuthMock.mockReturnValue({
      user: { id: "buyer-2", email: "buyer2@example.com" },
      profile: { display_name: " ", first_name: "Dimitra", phone: " 6900000000 " },
    });

    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "submit blank interest" }));

    await waitFor(() => expect(rpcMock).toHaveBeenCalledWith("submit_new_build_enquiry", expect.objectContaining({
      p_new_building_id: "listing-1",
      p_user_id: "buyer-2",
      p_email: "buyer2@example.com",
      p_full_name: "Dimitra",
      p_phone: "6900000000",
      p_notes: "",
    })));
    expect(startConversationMock).toHaveBeenCalledWith({ other_user_id: "owner-1", listing_id: "listing-1" });
  });

  it("keeps optional valuation fields unavailable instead of inventing defaults", async () => {
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: { display_name: "Buyer" } });
    functionsInvokeMock.mockResolvedValue({ data: valuationV2({ estimatedValue: 430000, pricePerSqmEstimate: 5250, confidence: null, confidenceLabel: null, rentalYieldEstimate: null, evidence: { ...valuationV2().evidence, fields: { ...valuationV2().evidence.fields, estimatedValue: "ai_estimate", pricePerSqmEstimate: "derived_ai", confidence: "unavailable", rentalYieldEstimate: "unavailable" }, analysis: "ai_estimate" } }), error: null });

    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));

    expect(await screen.findByText("AI Estimate")).toBeInTheDocument();
    expect(screen.getByText(/430\.000/)).toBeInTheDocument();
    expect(screen.getByText("Confidence: Unavailable")).toBeInTheDocument();
    expect(screen.getByText(/Valuation density: €5,250\/m².*derived from unverified AI estimate.*market value basis/i)).toBeInTheDocument();
  });

  it("renders useful numberless new-build analysis instead of empty metric cards only", async () => {
    const base = valuationV2();
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: { display_name: "Buyer" } });
    functionsInvokeMock.mockResolvedValue({ data: valuationV2({
      status: "partial", estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null,
      pricePerSqmEstimate: null, confidence: null, confidenceLabel: null, summary: null,
      keyFactors: [{ factor: "Project phase", impact: "neutral", note: "Delivery remains subject to the supplied timeline." }],
      renovationPotential: "Inspect delivered finishes before changes.",
      evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable", confidence: "unavailable" }, analysis: "ai_estimate" },
    }), error: null });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));
    expect(await screen.findByText(/Delivery remains subject to the supplied timeline/)).toBeInTheDocument();
    expect(screen.getByText(/Inspect delivered finishes before changes/)).toBeInTheDocument();
  });

  it("ignores an old actor's rejected valuation after the new actor has a result", async () => {
    let rejectOld!: (reason?: unknown) => void;
    let oldRequestSettled = false;
    let valuationCalls = 0;
    functionsInvokeMock.mockImplementation(() => {
      valuationCalls += 1;
      if (valuationCalls === 1) return new Promise((_resolve, reject) => { rejectOld = reject; }).finally(() => { oldRequestSettled = true; });
      return Promise.resolve({ data: valuationV2({ estimatedValue: 510000 }), error: null });
    });
    useAuthMock.mockReturnValue({ user: { id: "buyer-1" }, profile: null });
    const view = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));
    await waitFor(() => expect(valuationCalls).toBe(1));
    useAuthMock.mockReturnValue({ user: { id: "buyer-2" }, profile: null });
    view.rerender(page());
    fireEvent.click(screen.getByRole("button", { name: "Load AI insights" }));
    expect(await screen.findByText(/510\.000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refresh AI insights/i })).toBeInTheDocument();
    rejectOld(new Error("monthly_limit_reached"));
    await waitFor(() => expect(oldRequestSettled).toBe(true));
    expect(screen.getByText(/510\.000/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Refresh AI insights/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Buy AI add-on/i })).not.toBeInTheDocument();
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
