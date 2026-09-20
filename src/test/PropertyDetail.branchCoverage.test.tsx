import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  subscription: vi.fn(),
  listing: vi.fn(),
  ownerPro: vi.fn(),
  trackView: vi.fn(),
  similar: vi.fn(),
  favorites: vi.fn(),
  toggleFavorite: vi.fn(),
  startConversation: vi.fn(),
  navigate: vi.fn(),
  modalOpen: vi.fn(),
  modalClose: vi.fn(),
  reportInsert: vi.fn(),
  streetView: vi.fn(),
  toast: { error: vi.fn(), info: vi.fn(), success: vi.fn() },
}));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => mocks.navigate };
});
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, values?: { defaultValue?: string; city?: string }) =>
      values?.defaultValue?.replace("{{city}}", values.city ?? "") ?? key,
  }),
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.auth() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => mocks.subscription() }));
vi.mock("@/hooks/useListings", () => ({
  useListing: (...args: unknown[]) => mocks.listing(...args),
  useOwnerProStatus: (...args: unknown[]) => mocks.ownerPro(...args),
  useTrackListingView: () => ({ mutate: mocks.trackView }),
}));
vi.mock("@/hooks/useSimilarListings", () => ({
  dedupeSimilarListings: (rows: unknown[]) => rows,
  useSimilarListings: () => mocks.similar(),
}));
vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => mocks.favorites(),
  useToggleFavorite: () => ({ mutate: mocks.toggleFavorite }),
}));
vi.mock("@/hooks/useMessages", () => ({
  useStartConversation: () => ({ mutateAsync: mocks.startConversation, isPending: false }),
}));
vi.mock("@/hooks/useModal", () => ({
  useModal: () => ({
    open: mocks.modalOpen,
    close: mocks.modalClose,
    isOpen: () => false,
  }),
}));
vi.mock("@/hooks/usePropertyAIInsights", () => ({
  usePropertyAIInsights: () => ({
    aiInsightsData: null,
    aiInsightsLoading: false,
    aiInsightsLoaded: false,
    aiInsightsQuota: { allowed: true, used: 0, limit: 5, remaining: 5 },
    aiInsightsQuotaLoading: false,
    loadAiInsights: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: () => ({ insert: mocks.reportInsert }) },
}));
vi.mock("sonner", () => ({ toast: mocks.toast }));
vi.mock("@/lib/config", () => ({
  APP_ORIGIN: "https://portal.maiprop.co",
  getStreetViewProxyUrl: (...args: unknown[]) => mocks.streetView(...args),
}));
vi.mock("@/lib/participantConfig", () => ({
  getParticipantTypeFromProfile: (profile: { participant_type?: string } | null) => profile?.participant_type ?? null,
}));
vi.mock("@/lib/planLimitErrors", () => ({
  getPlanLimitErrorMessage: (error: unknown) => error instanceof Error && error.message.includes("limit") ? "Plan contact limit reached" : null,
}));
vi.mock("@/lib/listingRoutes", () => ({
  shouldUseNewBuildRoute: (listing: { listing_type?: string }) => listing.listing_type === "new_build",
}));
vi.mock("@/lib/listingUtils", () => ({ dbListingToCard: (listing: unknown) => listing }));
vi.mock("@/lib/propertyFeatures", () => ({
  buildPropertyFeatureGroups: () => ({
    internalFeatures: [], externalFeatures: [], constructionFeatures: [], suitabilityFeatures: [],
  }),
  buildDetailGroups: () => [],
}));
vi.mock("@/lib/mutationSchemas", () => ({
  listingReportSchema: {},
  parseMutationInput: (_schema: unknown, input: unknown) => input,
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav>navbar</nav> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer>footer</footer> }));
vi.mock("@/components/property/PropertyGallery", () => ({
  default: ({ images, isFavorited, onFavorite, onShare }: { images: string[]; isFavorited: boolean; onFavorite: () => void; onShare: () => void }) => (
    <section>
      <span data-testid="gallery-images">{images.join("|")}</span>
      <span data-testid="favorite-state">{String(isFavorited)}</span>
      <button onClick={onFavorite}>favorite</button>
      <button onClick={onShare}>share</button>
    </section>
  ),
}));
vi.mock("@/components/property/PropertyOwnerCard", () => ({
  default: ({ canVideoView, pricePerSqm, onContact, onRequestViewing, onRequestVideoViewing }: {
    canVideoView: boolean; pricePerSqm: number | null; onContact: () => void; onRequestViewing: () => void; onRequestVideoViewing: () => void;
  }) => (
    <section>
      <span data-testid="can-video">{String(canVideoView)}</span>
      <span data-testid="owner-price-sqm">{String(pricePerSqm)}</span>
      <button onClick={onContact}>contact owner</button>
      <button onClick={onRequestViewing}>request viewing</button>
      <button onClick={onRequestVideoViewing}>request video</button>
    </section>
  ),
}));
vi.mock("@/components/PropertyValuation", () => ({
  default: ({ price, sqm, pricePerSqm, ownershipStatus, ownershipPercentage }: {
    price: number; sqm: number; pricePerSqm?: number; ownershipStatus?: string; ownershipPercentage?: number;
  }) => <div data-testid="valuation">{price}|{sqm}|{pricePerSqm}|{ownershipStatus}|{ownershipPercentage}</div>,
}));
vi.mock("@/components/property/PropertyValuationLockedCard", () => ({ PropertyValuationLockedCard: () => <div>valuation locked</div> }));
vi.mock("@/components/property/PropertyAuctionSection", () => ({
  PropertyAuctionSection: ({ websiteUrl, ownershipStatus, ownershipPct }: { websiteUrl: string | null; ownershipStatus: string | null; ownershipPct: number | null }) =>
    <div data-testid="auction">{websiteUrl}|{ownershipStatus}|{ownershipPct}</div>,
}));
vi.mock("@/components/property/PropertyTitleSection", () => ({ PropertyTitleSection: ({ db }: { db: { title: string } }) => <h1>{db.title}</h1> }));
vi.mock("@/components/property/PropertyDescriptionSection", () => ({ PropertyDescriptionSection: ({ description }: { description: string }) => <p>{description}</p> }));
vi.mock("@/components/property/PropertyDetailsAndEnergy", () => ({ PropertyDetailsAndEnergy: () => <div>details</div> }));
vi.mock("@/components/property/PropertyFeatureList", () => ({ default: () => <div>features</div> }));
vi.mock("@/components/property/PropertyScoresSection", () => ({ PropertyScoresSection: () => <div>scores</div> }));
vi.mock("@/components/property/PropertyReportCard", () => ({ PropertyReportCard: () => <div>report card</div> }));
vi.mock("@/components/property/PropertyAIInsightsSection", () => ({ PropertyAIInsightsSection: () => <div>ai insights</div> }));
vi.mock("@/components/DeferredDetailPanel", () => ({ DeferredDetailPanel: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
vi.mock("@/components/PropertyMiniMap", () => ({ default: () => <div>mini map</div> }));
vi.mock("@/components/NeighbourhoodReport", () => ({ default: () => <div>neighbourhood</div> }));
vi.mock("@/components/PropertyCard", () => ({ PropertyCard: ({ property }: { property: { title: string } }) => <div>similar:{property.title}</div> }));
vi.mock("@/components/ViewingDialog", () => ({ default: () => <div>viewing dialog</div> }));
vi.mock("@/components/AIAssistantWidget", () => ({ default: () => <div>assistant</div> }));
vi.mock("@/components/AuctionAlertModal", () => ({ AuctionAlertModal: () => <div>auction alert</div> }));

import PropertyDetail from "@/pages/PropertyDetail";

const baseListing = {
  id: "listing-1",
  owner_id: "owner-1",
  title: "Athens Home",
  city: "Athens",
  region: "Attica",
  address: "Ermou 10",
  postal_code: "10563",
  price: 300000,
  price_per_sqm: null,
  sqm: 100,
  bedrooms: 2,
  bathrooms: 1,
  property_type: "apartment",
  listing_type: "sale",
  description: "Central apartment",
  cover_image_url: "https://cdn.example/cover.jpg",
  listing_images: [{ url: "https://cdn.example/two.jpg" }],
  profiles: { user_id: "owner-1", display_name: "Owner", avatar_url: null, verified: true },
  ownerParticipantType: "agent",
  views_count: 5,
  tags: [],
  latitude: 37.98,
  longitude: 23.72,
  is_pre_sale: false,
};

const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
const renderPage = (entry = "/property/listing-1", state?: unknown) => render(
  <QueryClientProvider client={queryClient}>
    <HelmetProvider>
      <MemoryRouter initialEntries={[{ pathname: entry, state }]} future={{ v7_relativeSplatPath: true, v7_startTransition: true }}>
        <Routes>
          <Route path="/property/:id" element={<PropertyDetail />} />
          <Route path="/auction/:id" element={<PropertyDetail />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>
  </QueryClientProvider>,
);

beforeEach(() => {
  queryClient.clear();
  Object.values(mocks).forEach((value) => {
    if (typeof value === "function" && "mockReset" in value) value.mockReset();
  });
  Object.values(mocks.toast).forEach((mock) => mock.mockReset());
  mocks.auth.mockReturnValue({ user: null, profile: null });
  mocks.subscription.mockReturnValue({ isPro: false });
  mocks.listing.mockReturnValue({
    data: baseListing,
    isLoading: false,
    isFetching: false,
    isPlaceholderData: false,
    isError: false,
  });
  mocks.ownerPro.mockReturnValue({ data: false });
  mocks.similar.mockReturnValue({ data: [] });
  mocks.favorites.mockReturnValue({ data: [] });
  mocks.startConversation.mockResolvedValue("conversation-1");
  mocks.reportInsert.mockResolvedValue({ error: null });
  mocks.streetView.mockReturnValue("https://street-view.example/image");
  Object.assign(navigator, {
    share: undefined,
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

describe("PropertyDetail business branches", () => {
  it("keeps signed-out save, contact, viewing, video and report actions behind authentication", async () => {
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "favorite" }));
    fireEvent.click(screen.getByRole("button", { name: "contact owner" }));
    fireEvent.click(screen.getByRole("button", { name: "request viewing" }));
    fireEvent.click(screen.getByRole("button", { name: "request video" }));
    fireEvent.click(screen.getByRole("button", { name: "property.reportListingCta" }));

    expect(screen.getByTestId("can-video")).toHaveTextContent("false");
    expect(screen.getByText("valuation locked")).toBeInTheDocument();
    expect(mocks.toggleFavorite).not.toHaveBeenCalled();
    expect(mocks.startConversation).not.toHaveBeenCalled();
    expect(mocks.reportInsert).not.toHaveBeenCalled();
    expect(mocks.navigate).toHaveBeenCalledWith("/login");
    expect(mocks.toast.error).toHaveBeenCalledWith("property.signInToSave");
    expect(mocks.toast.error).toHaveBeenCalledWith("property.signInToContact");
    expect(mocks.toast.error).toHaveBeenCalledWith("property.signInToView");
    expect(mocks.toast.error).toHaveBeenCalledWith("property.signInToReport");
  });

  it("preserves buyer viewing access, favorite state, owner contact and successful reporting", async () => {
    mocks.auth.mockReturnValue({ user: { id: "buyer-1" }, profile: { participant_type: "buyer" } });
    mocks.favorites.mockReturnValue({ data: [{ listing_id: "listing-1" }] });
    renderPage();

    fireEvent.click(screen.getByRole("button", { name: "favorite" }));
    fireEvent.click(screen.getByRole("button", { name: "contact owner" }));
    fireEvent.click(screen.getByRole("button", { name: "request viewing" }));
    fireEvent.click(screen.getByRole("button", { name: "request video" }));
    fireEvent.click(screen.getByRole("button", { name: "property.reportListingCta" }));

    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith("/messages", { state: { openConversationId: "conversation-1" } }));
    await waitFor(() => expect(mocks.toast.success).toHaveBeenCalledWith("property.reportSubmitted"));
    expect(screen.getByTestId("can-video")).toHaveTextContent("true");
    expect(screen.getByTestId("favorite-state")).toHaveTextContent("true");
    expect(mocks.toggleFavorite).toHaveBeenCalledWith({ listing_id: "listing-1", isFavorited: true });
    expect(mocks.modalOpen).toHaveBeenCalledTimes(2);
    expect(mocks.reportInsert).toHaveBeenCalledWith({ entity_type: "listing", entity_id: "listing-1", reporter_id: "buyer-1" });
  });

  it("keeps non-buyer video viewing Pro-gated and handles owner/unavailable contact", () => {
    mocks.auth.mockReturnValue({ user: { id: "agent-1" }, profile: { participant_type: "agent" } });
    const page = renderPage();
    fireEvent.click(screen.getByRole("button", { name: "request video" }));
    expect(mocks.toast.info).toHaveBeenCalledWith("property.videoViewingProOnly");
    expect(mocks.navigate).toHaveBeenCalledWith("/pricing");
    page.unmount();

    mocks.listing.mockReturnValue({ data: { ...baseListing, owner_id: "agent-1", profiles: null }, isLoading: false, isError: false });
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "contact owner" }));
    expect(mocks.toast.info).toHaveBeenCalledWith("property.ownListingContact");
  });

  it("passes exact pricing and ownership arithmetic to Pro valuation and handles report/contact failures", async () => {
    mocks.auth.mockReturnValue({ user: { id: "pro-1" }, profile: { participant_type: "agent" } });
    mocks.subscription.mockReturnValue({ isPro: true });
    mocks.startConversation.mockRejectedValue(new Error("contact limit"));
    mocks.reportInsert.mockResolvedValue({ error: new Error("blocked") });
    mocks.listing.mockReturnValue({
      data: { ...baseListing, price: 315000, sqm: 105, price_per_sqm: 3000, tags: ["ownership:partial", "ownership_pct:50"] },
      isLoading: false,
      isError: false,
    });
    renderPage();

    expect(screen.getByTestId("valuation")).toHaveTextContent("315000|105|3000|partial|50");
    expect(screen.getByTestId("owner-price-sqm")).toHaveTextContent("3000");
    fireEvent.click(screen.getByRole("button", { name: "contact owner" }));
    fireEvent.click(screen.getByRole("button", { name: "property.reportListingCta" }));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Plan contact limit reached"));
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("property.errorReport"));
  });

  it("renders safe auction metadata, similar deals, native sharing and coordinate image fallback", async () => {
    const share = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { share });
    mocks.similar.mockReturnValue({ data: [{ ...baseListing, id: "similar-1", title: "Similar Auction" }] });
    mocks.listing.mockReturnValue({
      data: {
        ...baseListing,
        id: "auction-1",
        listing_type: "auction",
        cover_image_url: null,
        listing_images: [],
        website_url: "javascript:alert(1)",
        tags: ["ownership:custom", "ownership_pct:33"],
      },
      isLoading: false,
      isError: false,
    });
    renderPage("/auction/auction-1");

    expect(screen.getByTestId("auction")).toHaveTextContent("|custom|33");
    expect(screen.getByText("similar:Similar Auction")).toBeInTheDocument();
    expect(screen.getByTestId("gallery-images")).toHaveTextContent("https://street-view.example/image");
    expect(mocks.streetView).toHaveBeenCalledWith({ lat: 37.98, lng: 23.72 });
    fireEvent.click(screen.getByRole("button", { name: "share" }));
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "Athens Home" })));
  });

  it("marks UUID auction route state as cached while authoritative revalidation is pending", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const auction = { ...baseListing, id, listing_type: "auction" };
    mocks.listing.mockImplementation((_listingId: string, options: { initialData?: typeof baseListing }) => ({
      data: options.initialData ?? null,
      isLoading: false,
      isFetching: true,
      isPlaceholderData: true,
      isError: false,
    }));

    renderPage(`/auction/${id}`, { auction });

    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing cached auction details while we verify the latest information.",
    );
    expect(screen.getByRole("heading", { name: "Athens Home" })).toBeInTheDocument();
  });

  it("keeps UUID auction route state visible and warns when authoritative revalidation fails", () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const auction = { ...baseListing, id, listing_type: "auction" };
    mocks.listing.mockImplementation((_listingId: string, options: { initialData?: typeof baseListing }) => ({
      data: options.initialData ?? null,
      isLoading: false,
      isFetching: false,
      isPlaceholderData: true,
      isError: true,
    }));

    renderPage(`/auction/${id}`, { auction });

    expect(mocks.listing).toHaveBeenCalledWith(
      id,
      expect.objectContaining({ initialData: expect.objectContaining({ id }) }),
    );
    expect(screen.getByRole("heading", { name: "Athens Home" })).toBeInTheDocument();
    expect(screen.getByText("ai insights")).toBeInTheDocument();
    expect(screen.queryByText("property.errorLoad")).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Live auction details could not be refreshed. The information shown may be outdated.",
    );
  });

  it("distinguishes unavailable data from query errors and routes canonical new builds", async () => {
    mocks.listing.mockReturnValue({ data: null, isLoading: false, isError: false });
    const unavailable = renderPage();
    expect(screen.getByText("property.notAvailable")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "property.backToListings" }));
    expect(mocks.navigate).toHaveBeenCalledWith("/listings");
    unavailable.unmount();

    mocks.listing.mockReturnValue({
      data: { ...baseListing, listing_type: "new_build", publicationId: 871 },
      isLoading: false,
      isError: false,
    });
    renderPage();
    await waitFor(() => expect(mocks.navigate).toHaveBeenCalledWith(
      "/new-build/listing-1",
      {
        replace: true,
        state: {
          listing: expect.objectContaining({
            id: "listing-1",
            publicationId: 871,
          }),
        },
      },
    ));
  });
});
