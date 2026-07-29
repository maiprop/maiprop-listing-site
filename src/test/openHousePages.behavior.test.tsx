import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { useRef } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  authUser: null as { id: string } | null,
  isPro: false,
  listing: null as Record<string, unknown> | null,
  listingLoading: false,
  updateListing: { mutate: vi.fn(), mutateAsync: vi.fn(), isPending: false },
  deleteListing: { mutate: vi.fn() },
  trackView: { mutate: vi.fn() },
  toggleFavorite: { mutate: vi.fn() },
  favorites: [] as Array<{ listing_id: string }>,
  openHouseSettings: null as Record<string, unknown> | null,
  registrations: [] as Array<Record<string, unknown>>,
  offers: [] as Array<Record<string, unknown>>,
  startConversation: { mutateAsync: vi.fn(), isPending: false },
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
  from: vi.fn(),
  rpc: vi.fn(),
  invoke: vi.fn(),
  streetView: vi.fn(),
  publicApi: vi.fn(),
  mapMounts: 0,
}));

const TEST_OPEN_HOUSE_ID = "11111111-1111-4111-8111-111111111111";
const TEST_OPEN_HOUSE_SALE_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/MapView", () => ({
  MapView: ({
    listings,
    onPolygonChange,
    onViewportBoundsChange,
    itemLabelSingular,
    itemLabelPlural,
    polygonPoints,
  }: {
    listings?: Array<{ id: string; _raw?: { publicationId?: number } }>;
    onPolygonChange?: (points: Array<[number, number]> | null) => void;
    onViewportBoundsChange?: (bounds: { west: number; south: number; east: number; north: number }) => void;
    itemLabelSingular?: string;
    itemLabelPlural?: string;
    polygonPoints?: Array<[number, number]> | null;
  }) => {
    const instance = useRef<number | null>(null);
    if (instance.current == null) {
      mocks.mapMounts += 1;
      instance.current = mocks.mapMounts;
    }
    return (
      <div
        data-testid="map-view"
        data-count={String(listings?.length ?? 0)}
        data-ids={(listings ?? []).map((listing) => listing.id).join(",")}
        data-publication-ids={(listings ?? []).map((listing) => listing._raw?.publicationId ?? "").join(",")}
        data-instance={String(instance.current)}
        data-labels={`${itemLabelSingular ?? ""}/${itemLabelPlural ?? ""}`}
        data-polygon-points={String(polygonPoints?.length ?? 0)}
      >
        <button type="button" onClick={() => onPolygonChange?.([
          [23.7, 37.9],
          [23.8, 37.9],
          [23.8, 38.05],
          [23.7, 38.05],
        ])}>
          Apply open house area
        </button>
        <button type="button" onClick={() => onViewportBoundsChange?.({
          west: 23.7,
          south: 37.9,
          east: 23.8,
          north: 38.05,
        })}>
          Move open house map
        </button>
      </div>
    );
  },
}));
vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: {
    property: {
      title: string;
      city?: string;
      images?: string[];
      _raw?: { publicationId?: number };
    };
  }) => (
    <article
      data-testid="open-house-card"
      data-image={property.images?.[0] ?? ""}
      data-publication-id={String(property._raw?.publicationId ?? "")}
    >
      <h2>{property.title}</h2>
      <p>{property.city}</p>
    </article>
  ),
}));
vi.mock("@/components/OpenHouseRegistrationDialog", () => ({
  default: ({
    open,
    hasAssetControl,
    listingPrice,
    openHouseTransactionType,
  }: {
    open: boolean;
    hasAssetControl: boolean;
    listingPrice: number;
    openHouseTransactionType?: string | null;
  }) => (
    <div
      data-testid="registration-dialog"
      data-open={String(open)}
      data-asset-control={String(hasAssetControl)}
      data-transaction-type={openHouseTransactionType ?? ""}
    >
      Registration dialog {listingPrice}
    </div>
  ),
}));
vi.mock("@/components/OpenHouseOfferDialog", () => ({
  default: ({
    open,
    canSubmit,
    offerBlockedReason,
  }: {
    open: boolean;
    canSubmit?: boolean;
    offerBlockedReason?: string;
  }) => (
    <div data-testid="offer-dialog" data-open={String(open)} data-can-submit={String(canSubmit)}>
      {offerBlockedReason ?? "Offer ready"}
    </div>
  ),
}));
vi.mock("@/components/OpenHouseAssetControlPanel", () => ({
  default: ({ listingId, isOwner, listingPrice }: { listingId: string; isOwner: boolean; listingPrice?: number | null }) => (
    <div data-testid="asset-control-panel">
      {listingId}:{String(isOwner)}:{listingPrice}
    </div>
  ),
}));
vi.mock("@/components/PropertyMiniMap", () => ({
  default: ({ onWalkScoreChange }: { onWalkScoreChange: (score: number) => void }) => (
    <button type="button" onClick={() => onWalkScoreChange(88)}>
      Set walk score
    </button>
  ),
}));
vi.mock("@/components/PropertyValuation", () => ({ default: () => <div data-testid="property-valuation" /> }));
vi.mock("@/components/property/PropertyValuationLockedCard", () => ({
  PropertyValuationLockedCard: () => <div data-testid="property-valuation-locked">Upgrade valuation to Pro</div>,
}));
vi.mock("@/components/property/PropertyAIInsightsSection", () => ({
  PropertyAIInsightsSection: ({
    listingType,
    user,
  }: {
    listingType?: string | null;
    user?: { id: string } | null;
  }) => (
    <div data-testid="property-ai-insights" data-listing-type={listingType ?? ""}>
      {!user ? "AI Market Insights requires sign-in" : null}
    </div>
  ),
}));
vi.mock("@/components/NeighbourhoodReport", () => ({ default: () => <div data-testid="neighbourhood-report" /> }));
vi.mock("@/components/property/PropertyReportCard", () => ({
  PropertyReportCard: () => <div data-testid="property-report-card" />,
}));
vi.mock("@/components/ui/ConfirmDialog", () => ({
  ConfirmDialog: ({
    open,
    title,
    onConfirm,
    onCancel,
  }: {
    open: boolean;
    title?: string;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    open ? (
      <div role="dialog" aria-label={title}>
        <button type="button" onClick={onConfirm}>
          Delete
        </button>
        <button type="button" onClick={onCancel}>
          Cancel
        </button>
      </div>
    ) : null,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.authUser, profile: null, loading: false }),
}));
vi.mock("@/hooks/useListings", () => ({
  useListing: () => ({ data: mocks.listing, isLoading: mocks.listingLoading, isError: false }),
  useTrackListingView: () => mocks.trackView,
  useUpdateListing: () => mocks.updateListing,
  useDeleteListing: () => mocks.deleteListing,
}));
vi.mock("@/hooks/useFavorites", () => ({
  useFavorites: () => ({ data: mocks.favorites, isLoading: false }),
  useToggleFavorite: () => mocks.toggleFavorite,
}));
vi.mock("@/hooks/useOpenHouseAssetControl", () => ({
  useOpenHouseSettings: () => ({ data: mocks.openHouseSettings, isLoading: false }),
  useOpenHouseRegistrations: () => ({ data: mocks.registrations, isLoading: false }),
  useOpenHouseCapacity: () => ({ data: null, isLoading: false }),
  useOpenHouseOffers: () => ({ data: mocks.offers, isLoading: false }),
}));
vi.mock("@/hooks/useMessages", () => ({
  useStartConversation: () => mocks.startConversation,
}));
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => ({ isPro: mocks.isPro, loading: false }),
}));
vi.mock("@/hooks/usePropertyAIInsights", () => ({
  usePropertyAIInsights: () => ({
    aiInsightsData: null,
    aiInsightsLoading: false,
    aiInsightsLoaded: false,
    aiInsightsQuota: { allowed: true, reason: null, used: 0, limit: 5, remaining: 5 },
    aiInsightsQuotaLoading: false,
    loadAiInsights: vi.fn(),
  }),
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mocks.from(...args),
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    functions: { invoke: (...args: unknown[]) => mocks.invoke(...args) },
  },
}));
vi.mock("@/lib/config", async () => {
  const actual = await vi.importActual<typeof import("@/lib/config")>("@/lib/config");
  return {
    ...actual,
    getStreetViewProxyUrl: (...args: unknown[]) => mocks.streetView(...args),
  };
});
vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: async (...args: unknown[]) => {
    const result = await mocks.publicApi(...args);
    const path = String(args[0] ?? "");
    if (path.includes("/api/public/open-houses?") && path.includes("includeMeta=1") && Array.isArray(result)) {
      return { data: result, hasMore: false, limit: 60, nextCursor: null };
    }
    return result;
  },
  isPublicApiAbort: () => false,
}));
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    error: (...args: unknown[]) => mocks.toastError(...args),
  },
}));

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function createListing(overrides: Record<string, unknown> = {}) {
  return {
    id: TEST_OPEN_HOUSE_ID,
    title: "Athens Loft Open House",
    city: "Athens",
    region: "Attica",
    address: "Solonos 1",
    price: 420000,
    price_per_sqm: 4200,
    sqm: 100,
    bedrooms: 2,
    bathrooms: 1,
    floor: 0,
    total_floors: 5,
    year_built: 2018,
    energy_class: "A",
    heating_system: "autonomous_petrol",
    construction_status: "renovated",
    property_type: "apartment",
    listing_type: "open_house",
    open_house_date: "2026-06-01T10:00:00.000Z",
    status: "active",
    owner_id: "owner-1",
    description: "Bright open house",
    cover_image_url: null,
    listing_images: [],
    latitude: null,
    longitude: null,
    tags: [],
    views_count: 3,
    has_elevator: true,
    has_balcony: true,
    has_parking: false,
    has_pool: false,
    has_garden: false,
    has_storage: false,
    has_view: false,
    has_furnished: false,
    walkability_score: null,
    safety_score: null,
    noise_score: null,
    ...overrides,
  };
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function makeListingsQuery(data: Array<Record<string, unknown>>, error: Error | null = null) {
  const chain = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    gte: vi.fn().mockReturnThis(),
    lt: vi.fn().mockReturnThis(),
    order: vi.fn().mockReturnThis(),
    limit: vi.fn().mockReturnThis(),
    then: (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
      Promise.resolve({ data, error }).then(resolve, reject),
  };
  mocks.from.mockReturnValue(chain);
  return chain;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function renderOpenHouses(initialPath = "/open-houses") {
  const { default: OpenHouses } = await import("@/pages/OpenHouses");
  return renderWithProviders(<OpenHouses />, { initialPath });
}

function PropertyRedirectTarget() {
  const { state } = useLocation() as {
    state?: { listing?: { id?: string; publicationId?: number } };
  };
  return (
    <div
      data-testid="property-redirect-target"
      data-listing-id={state?.listing?.id ?? ""}
      data-publication-id={String(state?.listing?.publicationId ?? "")}
    >
      Property redirect target
    </div>
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function renderOpenHouseDetail(initialPath = `/open-house/${TEST_OPEN_HOUSE_ID}`) {
  const { default: OpenHouseDetail } = await import("@/pages/OpenHouseDetail");
  return renderWithProviders(
    <Routes>
      <Route path="/open-house/:id" element={<OpenHouseDetail />} />
      <Route path="/property/:id" element={<PropertyRedirectTarget />} />
      <Route path="/messages" element={<div>Messages route</div>} />
    </Routes>,
    { initialPath }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.rpc.mockImplementation((fn: string) =>
    mocks.from(fn === "get_public_listing_catalogue" ? "public_listing_catalogue" : fn));
  mocks.authUser = null;
  mocks.isPro = false;
  mocks.listing = null;
  mocks.listingLoading = false;
  mocks.updateListing.mutate.mockReset();
  mocks.updateListing.mutateAsync.mockReset().mockResolvedValue({});
  mocks.updateListing.isPending = false;
  mocks.deleteListing.mutate.mockReset();
  mocks.trackView.mutate.mockReset();
  mocks.toggleFavorite.mutate.mockReset();
  mocks.favorites = [];
  mocks.openHouseSettings = null;
  mocks.registrations = [];
  mocks.offers = [];
  mocks.startConversation.mutateAsync.mockReset().mockResolvedValue("conv-1");
  mocks.startConversation.isPending = false;
  mocks.invoke.mockResolvedValue({ data: null, error: null });
  mocks.streetView.mockReturnValue("https://street.example/fallback.jpg");
  mocks.publicApi.mockReset().mockResolvedValue([]);
  mocks.mapMounts = 0;
  makeListingsQuery([]);
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    share: undefined,
  });
});

describe("OpenHouses page behavior", () => {
  it("links My Open Houses to the dashboard open-house management tab", async () => {
    mocks.publicApi.mockResolvedValue([createListing({ id: "oh-owned-entry", title: "Owned Entry Point" })]);

    await renderOpenHouses();

    expect(await screen.findByRole("link", { name: /my open houses/i })).toHaveAttribute(
      "href",
      "/dashboard?tab=open-houses",
    );
  });

  it("filters open house cards by city and property type, then clears filters", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-athens", title: "Athens Apartment", city: "Athens", property_type: "apartment" }),
      createListing({ id: "oh-voula", title: "Voula House", city: "Voula", property_type: "house", price: 900000 }),
    ]);

    await renderOpenHouses();

    expect(await screen.findByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.getByText("Voula House")).toBeInTheDocument();
    expect(mocks.publicApi).toHaveBeenCalledWith(
      "/api/public/open-houses?showPast=0&limit=60&includeMeta=1",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
    expect(mocks.from).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/search open houses by city/i), { target: { value: "Athens" } });
    fireEvent.keyDown(screen.getByLabelText(/search open houses by city/i), { key: "Enter" });

    expect(await screen.findByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.queryByText("Voula House")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle filters/i }));
    fireEvent.click(screen.getByRole("button", { name: "House" }));

    expect(await screen.findByText(/no open houses match your filters/i)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear filters/i }));

    expect(await screen.findByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.getByText("Voula House")).toBeInTheDocument();
  }, 15_000);

  it("filters open houses by sale and rental subcategory from the shared open-house page", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-sale", title: "Sale Open House", city: "Athens", open_house_transaction_type: "sale" }),
      createListing({ id: "oh-rent", title: "Rental Open House", city: "Athens", open_house_transaction_type: "rent", price: 1800 }),
    ]);

    await renderOpenHouses("/open-houses?transaction=rent");

    expect(await screen.findByText("Rental Open House")).toBeInTheDocument();
    expect(screen.queryByText("Sale Open House")).not.toBeInTheDocument();
    expect(mocks.publicApi).toHaveBeenCalledWith(
      "/api/public/open-houses?showPast=0&limit=60&includeMeta=1&transactionType=rent",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );

    mocks.publicApi.mockClear().mockResolvedValue([
      createListing({ id: "oh-sale", title: "Sale Open House", city: "Athens", open_house_transaction_type: "sale" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /sale open houses/i }));

    await waitFor(() =>
      expect(mocks.publicApi).toHaveBeenCalledWith(
        "/api/public/open-houses?showPast=0&limit=60&includeMeta=1&transactionType=sale",
        expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
      ),
    );
    expect(await screen.findByText("Sale Open House")).toBeInTheDocument();
    expect(screen.queryByText("Rental Open House")).not.toBeInTheDocument();
  }, 15_000);

  it("shows the empty map state for listings without coordinates and can switch back to the list", async () => {
    mocks.publicApi.mockResolvedValue([createListing({ id: "oh-no-map", title: "No Map Home", latitude: null, longitude: null })]);

    await renderOpenHouses();
    expect(await screen.findByText("No Map Home")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));

    expect(screen.getByText(/no open houses with location data/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /switch to list view/i }));

    expect(screen.getByText("No Map Home")).toBeInTheDocument();
  });

  it("wires draw-area filtering through the Open Houses map and list views", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-athens", title: "Athens Apartment", city: "Athens", latitude: 37.98, longitude: 23.73 }),
      createListing({ id: "oh-voula", title: "Voula House", city: "Voula", latitude: 37.84, longitude: 23.77 }),
    ]);

    await renderOpenHouses();
    expect(await screen.findByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.getByText("Voula House")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));
    expect(await screen.findByTestId("map-view")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-labels", "open house/open houses");

    fireEvent.click(screen.getByRole("button", { name: /apply open house area/i }));

    expect(await screen.findByText(/area filter active/i)).toHaveTextContent("1 open house in area");
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-count", "2");
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-polygon-points", "4");

    fireEvent.click(screen.getByRole("button", { name: /show as list/i }));

    expect(screen.getByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.queryByText("Voula House")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear area/i }));
    expect(await screen.findByText("Voula House")).toBeInTheDocument();
  });

  it("keeps polygon membership current when a later cursor page adds an in-area row", async () => {
    mocks.publicApi.mockImplementation((path: string) => {
      if (path.includes("cursor=cursor-page-2")) {
        return Promise.resolve({
          data: [createListing({
            id: "oh-inside-201",
            title: "Later In Area",
            latitude: 37.99,
            longitude: 23.75,
          })],
          hasMore: false,
          limit: 60,
          nextCursor: null,
        });
      }
      return Promise.resolve({
        data: [
          createListing({
            id: "oh-inside-1",
            title: "First In Area",
            latitude: 37.98,
            longitude: 23.73,
          }),
          createListing({
            id: "oh-outside",
            title: "Outside Area",
            latitude: 37.84,
            longitude: 23.77,
          }),
        ],
        hasMore: true,
        limit: 60,
        nextCursor: "cursor-page-2",
      });
    });

    await renderOpenHouses();
    expect(await screen.findByText("First In Area")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));
    fireEvent.click(await screen.findByRole("button", { name: /apply open house area/i }));
    expect(await screen.findByText(/area filter active/i)).toHaveTextContent(
      "1+ open house in area",
    );
    fireEvent.click(screen.getByRole("button", { name: /show as list/i }));

    expect(screen.getByText("First In Area")).toBeInTheDocument();
    expect(screen.queryByText("Outside Area")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Later In Area")).toBeInTheDocument();
    expect(screen.queryByText("Outside Area")).not.toBeInTheDocument();
  });

  it("hides supervisor test open houses and sends the logo as the empty-image fallback", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-live", title: "Real Open House", latitude: null, longitude: null }),
      createListing({ id: "oh-test", title: "supervisor-177912 smoke test", latitude: null, longitude: null }),
    ]);

    await renderOpenHouses();

    expect(await screen.findByText("Real Open House")).toBeInTheDocument();
    expect(screen.queryByText(/supervisor-177912/i)).not.toBeInTheDocument();
    expect(screen.getByTestId("open-house-card")).toHaveAttribute("data-image", "/images/maiprop-logo.webp");
  });

  it("preserves the publication source on open-house cards and map pins", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({
        id: "oh-publication",
        title: "Publication-pinned Open House",
        publicationId: 7401,
        latitude: 37.98,
        longitude: 23.73,
      }),
    ]);

    await renderOpenHouses();

    expect(await screen.findByTestId("open-house-card")).toHaveAttribute(
      "data-publication-id",
      "7401",
    );
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));
    expect(await screen.findByTestId("map-view")).toHaveAttribute(
      "data-publication-ids",
      "7401",
    );
  });

  it("virtualizes large open-house result grids for responsive browsing", async () => {
    mocks.publicApi.mockResolvedValue(
      Array.from({ length: 30 }, (_, index) =>
        createListing({
          id: `oh-${index + 1}`,
          title: `Open House ${index + 1}`,
          latitude: null,
          longitude: null,
        }),
      ),
    );

    await renderOpenHouses();

    const grid = await screen.findByTestId("open-house-grid");
    expect(grid).toHaveAttribute("data-total-count", "30");
    expect(Number(grid.dataset.virtualizedCount)).toBeLessThan(30);
    expect(screen.getAllByTestId("open-house-card").length).toBeLessThan(30);
  });

  it("preserves canonical API order instead of prioritizing rows with images", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-first", title: "First Canonical Result", cover_image_url: null }),
      createListing({ id: "oh-second", title: "Second With Image", cover_image_url: "https://images.example/second.jpg" }),
    ]);

    await renderOpenHouses();

    const cards = await screen.findAllByTestId("open-house-card");
    expect(cards.map((card) => card.textContent)).toEqual([
      expect.stringContaining("First Canonical Result"),
      expect.stringContaining("Second With Image"),
    ]);
  });

  it("loads the next cursor page and keeps the later results reachable", async () => {
    mocks.publicApi.mockImplementation((path: string) => {
      if (path.includes("cursor=cursor-page-2")) {
        return Promise.resolve({
          data: [createListing({ id: "oh-page-2", title: "Cursor Page Two" })],
          hasMore: false,
          limit: 60,
          nextCursor: null,
        });
      }
      return Promise.resolve({
        data: [createListing({ id: "oh-page-1", title: "Cursor Page One" })],
        hasMore: true,
        limit: 60,
        nextCursor: "cursor-page-2",
      });
    });

    await renderOpenHouses();
    expect(await screen.findByText("Cursor Page One")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Cursor Page Two")).toBeInTheDocument();
    expect(mocks.publicApi).toHaveBeenCalledWith(
      expect.stringContaining("cursor=cursor-page-2"),
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
  });

  it("keeps the first cursor page visible and offers retry when load more fails", async () => {
    mocks.publicApi.mockImplementation((path: string) => {
      if (path.includes("cursor=cursor-page-2")) {
        return Promise.reject(new Error("later page failed"));
      }
      return Promise.resolve({
        data: [createListing({ id: "oh-page-1", title: "Preserved Page One" })],
        hasMore: true,
        limit: 60,
        nextCursor: "cursor-page-2",
      });
    });

    await renderOpenHouses();
    expect(await screen.findByText("Preserved Page One")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /load more/i }));

    expect(await screen.findByText("Preserved Page One")).toBeInTheDocument();
    const callsBeforeRetry = mocks.publicApi.mock.calls.length;
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(mocks.publicApi.mock.calls).toHaveLength(callsBeforeRetry);
    fireEvent.click(await screen.findByRole("button", { name: /retry loading more open houses/i }));
    await waitFor(() => expect(mocks.publicApi.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
  });

  it("passes map bounds to the canonical API and never renders an empty-map claim on failure", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-map", title: "Mapped Open House", latitude: 37.98, longitude: 23.73 }),
    ]);

    const view = await renderOpenHouses();
    expect(await screen.findByText("Mapped Open House")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));
    fireEvent.click(await screen.findByRole("button", { name: /move open house map/i }));

    await waitFor(() => expect(mocks.publicApi).toHaveBeenCalledWith(
      expect.stringMatching(/boundsWest=23\.7.*boundsSouth=37\.9.*boundsEast=23\.8.*boundsNorth=38\.05/),
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    ));

    view.unmount();
    mocks.publicApi.mockRejectedValue(new Error("canonical map outage"));
    await renderOpenHouses("/open-houses?failure=map");
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));

    expect(await screen.findByRole("heading", { name: /could not load open houses/i })).toBeInTheDocument();
    expect(screen.queryByText(/no open houses with location data/i)).not.toBeInTheDocument();
  });

  it("waits for map bounds and starts the new scope without the previous cursor", async () => {
    mocks.publicApi.mockImplementation((path: string) => {
      if (path.includes("boundsWest=23.7")) {
        return Promise.resolve({
          data: [createListing({ id: "oh-bounded", title: "Bounded Open House", latitude: 37.98, longitude: 23.73 })],
          hasMore: false,
          limit: 60,
          nextCursor: null,
        });
      }
      return Promise.resolve({
        data: [createListing({ id: "oh-initial", title: "Initial Open House", latitude: 37.98, longitude: 23.73 })],
        hasMore: true,
        limit: 60,
        nextCursor: "old-scope-cursor",
      });
    });

    await renderOpenHouses();
    expect(await screen.findByText("Initial Open House")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));

    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(mocks.publicApi.mock.calls.map(([path]) => String(path))).not.toEqual(
      expect.arrayContaining([expect.stringContaining("cursor=old-scope-cursor")]),
    );

    fireEvent.click(await screen.findByRole("button", { name: /move open house map/i }));
    await waitFor(() => expect(screen.getByTestId("map-view")).toHaveAttribute("data-ids", "oh-bounded"));

    const boundedCalls = mocks.publicApi.mock.calls
      .map(([path]) => String(path))
      .filter((path) => path.includes("boundsWest=23.7"));
    expect(boundedCalls).toHaveLength(1);
    expect(boundedCalls[0]).not.toContain("cursor=");
  });

  it("auto-fetches exactly three bounded map pages and discloses the remaining window", async () => {
    mocks.publicApi.mockImplementation((path: string) => {
      if (!path.includes("boundsWest=23.7")) {
        return Promise.resolve({
          data: [createListing({ id: "oh-unbounded", title: "Unbounded Row", latitude: 37.98, longitude: 23.73 })],
          hasMore: false,
          limit: 60,
          nextCursor: null,
        });
      }
      if (path.includes("cursor=cursor-page-3")) {
        return Promise.resolve({
          data: [createListing({ id: "oh-map-page-3", title: "Map Page Three", latitude: 37.99, longitude: 23.75 })],
          hasMore: true,
          limit: 60,
          nextCursor: "cursor-page-4",
        });
      }
      if (path.includes("cursor=cursor-page-2")) {
        return Promise.resolve({
          data: [createListing({ id: "oh-map-page-2", title: "Map Page Two", latitude: 37.985, longitude: 23.74 })],
          hasMore: true,
          limit: 60,
          nextCursor: "cursor-page-3",
        });
      }
      return Promise.resolve({
        data: [createListing({ id: "oh-map-page-1", title: "Map Page One", latitude: 37.98, longitude: 23.73 })],
        hasMore: true,
        limit: 60,
        nextCursor: "cursor-page-2",
      });
    });

    await renderOpenHouses();
    expect(await screen.findByText("Unbounded Row")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));
    fireEvent.click(await screen.findByRole("button", { name: /move open house map/i }));

    await waitFor(() => expect(mocks.publicApi.mock.calls.some(
      ([path]) => String(path).includes("cursor=cursor-page-3"),
    )).toBe(true));
    expect(await screen.findByText(/zoom in to load all open houses/i)).toBeInTheDocument();
    await new Promise((resolve) => window.setTimeout(resolve, 25));
    expect(mocks.publicApi.mock.calls.some(
      ([path]) => String(path).includes("cursor=cursor-page-4"),
    )).toBe(false);
  });

  it("keeps the same map instance mounted while a bounded catalogue request is pending", async () => {
    let resolveBounded!: (value: {
      data: ReturnType<typeof createListing>[];
      hasMore: boolean;
      limit: number;
      nextCursor: string | null;
    }) => void;
    const bounded = new Promise<{
      data: ReturnType<typeof createListing>[];
      hasMore: boolean;
      limit: number;
      nextCursor: string | null;
    }>((resolve) => {
      resolveBounded = resolve;
    });
    mocks.publicApi.mockImplementation((path: string) => {
      if (path.includes("boundsWest=23.7")) return bounded;
      return Promise.resolve({
        data: [createListing({ id: "oh-initial-map", title: "Initial Map Row", latitude: 37.98, longitude: 23.73 })],
        hasMore: false,
        limit: 60,
        nextCursor: null,
      });
    });

    await renderOpenHouses();
    expect(await screen.findByText("Initial Map Row")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /show on map/i }));
    const initialInstance = screen.getByTestId("map-view").getAttribute("data-instance");

    fireEvent.click(screen.getByRole("button", { name: /move open house map/i }));
    await waitFor(() => expect(mocks.publicApi).toHaveBeenCalledWith(
      expect.stringContaining("boundsWest=23.7"),
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    ));
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-instance", initialInstance);
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-ids", "oh-initial-map");

    resolveBounded({
      data: [createListing({ id: "oh-bounded-map", title: "Bounded Map Row", latitude: 37.99, longitude: 23.74 })],
      hasMore: false,
      limit: 60,
      nextCursor: null,
    });
    await waitFor(() => expect(screen.getByTestId("map-view")).toHaveAttribute("data-ids", "oh-bounded-map"));
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-instance", initialInstance);
    expect(mocks.mapMounts).toBe(1);
  });

  it("surfaces an outage without switching to a differently ordered Supabase catalogue", async () => {
    mocks.publicApi.mockRejectedValue(new Error("canonical open-house catalogue unavailable"));

    await renderOpenHouses();

    expect(await screen.findByRole("heading", { name: /could not load open houses/i })).toBeInTheDocument();
    expect(mocks.publicApi).toHaveBeenCalledWith(
      "/api/public/open-houses?showPast=0&limit=60&includeMeta=1",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });

  it("applies the complete buyer discovery filter set without dropping boundary matches", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({
        id: "oh-boundary",
        title: "Boundary Match",
        price: 400000,
        sqm: 100,
        bedrooms: 3,
        energy_class: "A",
        year_built: 2015,
        has_parking: true,
        cover_image_url: "https://images.example/boundary.jpg",
      }),
      createListing({ id: "oh-low-price", title: "Below Budget", price: 199999, sqm: 100, bedrooms: 3, energy_class: "A", year_built: 2015, has_parking: true }),
      createListing({ id: "oh-high-price", title: "Above Budget", price: 600001, sqm: 100, bedrooms: 3, energy_class: "A", year_built: 2015, has_parking: true }),
      createListing({ id: "oh-small", title: "Too Small", price: 400000, sqm: 79, bedrooms: 3, energy_class: "A", year_built: 2015, has_parking: true }),
      createListing({ id: "oh-large", title: "Too Large", price: 400000, sqm: 121, bedrooms: 3, energy_class: "A", year_built: 2015, has_parking: true }),
      createListing({ id: "oh-few-beds", title: "Too Few Bedrooms", price: 400000, sqm: 100, bedrooms: 2, energy_class: "A", year_built: 2015, has_parking: true }),
      createListing({ id: "oh-no-beds", title: "Bedrooms Undisclosed", price: 400000, sqm: 100, bedrooms: null, energy_class: "A", year_built: 2015, has_parking: true }),
      createListing({ id: "oh-energy", title: "Wrong Energy Class", price: 400000, sqm: 100, bedrooms: 3, energy_class: "B", year_built: 2015, has_parking: true }),
      createListing({ id: "oh-year-missing", title: "Year Undisclosed", price: 400000, sqm: 100, bedrooms: 3, energy_class: "A", year_built: null, has_parking: true }),
      createListing({ id: "oh-year-old", title: "Built Too Early", price: 400000, sqm: 100, bedrooms: 3, energy_class: "A", year_built: 2009, has_parking: true }),
      createListing({ id: "oh-year-new", title: "Built Too Late", price: 400000, sqm: 100, bedrooms: 3, energy_class: "A", year_built: 2021, has_parking: true }),
      createListing({ id: "oh-no-parking", title: "No Parking", price: 400000, sqm: 100, bedrooms: 3, energy_class: "A", year_built: 2015, has_parking: false }),
    ]);

    await renderOpenHouses();
    expect(await screen.findByText("Boundary Match")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle filters/i }));
    fireEvent.change(screen.getByLabelText(/price.*minimum/i), { target: { value: "200000" } });
    fireEvent.change(screen.getByLabelText(/price.*maximum/i), { target: { value: "600000" } });
    fireEvent.change(screen.getByLabelText(/size.*minimum/i), { target: { value: "80" } });
    fireEvent.change(screen.getByLabelText(/size.*maximum/i), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "3+" }));
    fireEvent.click(screen.getByRole("button", { name: "A" }));
    fireEvent.change(screen.getByLabelText(/construction year/i), { target: { value: "2010-2020" } });
    fireEvent.click(screen.getByRole("button", { name: /parking/i }));

    expect(await screen.findByText("Boundary Match")).toBeInTheDocument();
    for (const excludedTitle of [
      "Below Budget",
      "Above Budget",
      "Too Small",
      "Too Large",
      "Too Few Bedrooms",
      "Bedrooms Undisclosed",
      "Wrong Energy Class",
      "Year Undisclosed",
      "Built Too Early",
      "Built Too Late",
      "No Parking",
    ]) {
      expect(screen.queryByText(excludedTitle)).not.toBeInTheDocument();
    }

    fireEvent.click(screen.getByRole("button", { name: /parking/i }));
    expect(await screen.findByText("No Parking")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /clear all filters/i }));
    expect(await screen.findByText("Below Budget")).toBeInTheDocument();
    expect(screen.getByTestId("open-house-grid")).toHaveAttribute("data-total-count", "12");
  }, 15_000);

  it("debounces numeric filters before requesting a new canonical catalogue scope", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-debounce", title: "Debounced Open House", price: 200000 }),
    ]);

    await renderOpenHouses();
    expect(await screen.findByText("Debounced Open House")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /toggle filters/i }));
    const callsBeforeTyping = mocks.publicApi.mock.calls.length;
    const minimumPrice = screen.getByLabelText(/price.*minimum/i);

    fireEvent.change(minimumPrice, { target: { value: "2" } });
    fireEvent.change(minimumPrice, { target: { value: "20" } });
    fireEvent.change(minimumPrice, { target: { value: "200" } });

    await new Promise((resolve) => window.setTimeout(resolve, 100));
    expect(mocks.publicApi.mock.calls).toHaveLength(callsBeforeTyping);

    await waitFor(() => expect(
      mocks.publicApi.mock.calls
        .map(([path]) => String(path))
        .filter((path) => path.includes("priceMin=200")),
    ).toHaveLength(1));
  });

  it("keeps loading and canonical-source failure states actionable", async () => {
    let settlePublicRequest: ((value: unknown) => void) | undefined;
    mocks.publicApi.mockImplementationOnce(() => new Promise((resolve) => {
      settlePublicRequest = resolve;
    }));

    const pending = await renderOpenHouses();
    expect(await screen.findByLabelText(/loading open houses/i)).toHaveAttribute("aria-busy", "true");
    pending.unmount();
    settlePublicRequest?.([]);

    mocks.publicApi.mockRejectedValue(new Error("public catalog unavailable"));
    await renderOpenHouses("/open-houses?failure=1");

    expect(await screen.findByRole("heading", { name: /could not load open houses/i })).toBeInTheDocument();
    expect(screen.getByText(/please try again/i)).toBeInTheDocument();
    const callsBeforeRetry = mocks.publicApi.mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /retry/i }));
    await waitFor(() => expect(mocks.publicApi.mock.calls.length).toBeGreaterThan(callsBeforeRetry));
  });
});

describe("OpenHouseDetail page behavior", () => {
  it("renders an accessible loading shell while the listing is pending", async () => {
    mocks.listingLoading = true;

    await renderOpenHouseDetail();

    const main = document.querySelector("#main-content");
    expect(main).toBeTruthy();
    expect(main?.querySelector(".animate-spin")).toBeTruthy();
    expect(mocks.trackView.mutate).not.toHaveBeenCalled();
  });

  it("renders the not-found shell immediately for malformed open-house ids", async () => {
    mocks.listing = createListing();

    await renderOpenHouseDetail("/open-house/non-existent-id-789");

    expect(await screen.findByRole("heading", { name: /listing not found/i })).toBeInTheDocument();
    expect(screen.getByText(/does not exist or has been removed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to open houses/i })).toHaveAttribute("href", "/open-houses");
    expect(document.querySelector("#main-content")).toBeTruthy();
    expect(mocks.trackView.mutate).not.toHaveBeenCalled();
    expect(screen.queryByText(/athens loft open house/i)).not.toBeInTheDocument();
  });

  it("shows guest contact gating, street-view fallback imagery, and no-appointment copy", async () => {
    mocks.listing = createListing({ cover_image_url: null, listing_images: [], latitude: 40.6, longitude: 22.9 });

    await renderOpenHouseDetail();

    expect(await screen.findByRole("heading", { name: /athens loft open house/i })).toBeInTheDocument();
    expect(screen.getByRole("img", { name: /athens loft open house/i })).toHaveAttribute("src", "https://street.example/fallback.jpg");
    expect(screen.getByText(/no appointment needed/i)).toBeInTheDocument();
    expect(screen.getByText(/ai market insights requires sign-in/i)).toBeInTheDocument();
    expect(screen.getByTestId("property-valuation-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("property-valuation")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: /sign in to contact/i })).toHaveAttribute("href", "/login");
    expect(mocks.trackView.mutate).toHaveBeenCalledWith(TEST_OPEN_HOUSE_ID);
  });

  it("keeps the open-house title, address, and price readable on narrow screens", async () => {
    mocks.listing = createListing();

    await renderOpenHouseDetail();

    const price = screen
      .getAllByText("€420,000")
      .find((element) => element.className.includes("text-3xl"));
    if (!price) throw new Error("Hero price not found");
    const priceColumn = price.parentElement;
    const heroRow = priceColumn?.parentElement;
    const address = screen.getByText(/Solonos 1, Athens/i);

    expect(heroRow).toHaveClass("grid");
    expect(heroRow?.className).toContain("min-[560px]:grid-cols-[minmax(0,1fr)_auto]");
    expect(priceColumn).toHaveClass("w-full");
    expect(address).toHaveClass("min-w-0");
    expect(address).toHaveClass("break-words");
  });

  it("uses the same Pro gate as listing and auction details for open-house valuation", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing();

    await renderOpenHouseDetail();

    expect(await screen.findByTestId("property-valuation-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("property-valuation")).not.toBeInTheDocument();

    mocks.isPro = true;
    await renderOpenHouseDetail(`/open-house/${TEST_OPEN_HOUSE_ID}?pro=true`);

    expect(await screen.findByTestId("property-valuation")).toBeInTheDocument();
  });

  it("enforces authentication for favorites and preserves saved-state toggling", async () => {
    mocks.listing = createListing({ cover_image_url: "https://images.example/open-house.jpg" });
    const guest = await renderOpenHouseDetail();

    fireEvent.click(await screen.findByRole("button", { name: /save property/i }));
    expect(mocks.toastError).toHaveBeenCalledWith("Sign in to save properties");
    expect(mocks.toggleFavorite.mutate).not.toHaveBeenCalled();

    guest.unmount();
    mocks.authUser = { id: "buyer-1" };
    mocks.favorites = [{ listing_id: TEST_OPEN_HOUSE_ID }];
    await renderOpenHouseDetail(`/open-house/${TEST_OPEN_HOUSE_ID}?saved=1`);

    fireEvent.click(await screen.findByRole("button", { name: /remove from saved/i }));
    expect(mocks.toggleFavorite.mutate).toHaveBeenCalledWith({
      listing_id: TEST_OPEN_HOUSE_ID,
      isFavorited: true,
    });
  });

  it("keeps cover and sorted gallery media navigable and copies a share link", async () => {
    mocks.listing = createListing({
      cover_image_url: "https://images.example/cover.jpg",
      listing_images: [
        { url: "https://images.example/third.jpg", sort_order: 2 },
        { url: "https://images.example/second.jpg", sort_order: 1 },
      ],
    });
    await renderOpenHouseDetail();

    const hero = await screen.findByRole("img", { name: /athens loft open house/i });
    expect(hero).toHaveAttribute("src", "https://images.example/cover.jpg");
    fireEvent.click(screen.getByRole("button", { name: /next/i }));
    expect(hero).toHaveAttribute("src", "https://images.example/second.jpg");
    fireEvent.click(screen.getByRole("button", { name: /previous/i }));
    expect(hero).toHaveAttribute("src", "https://images.example/cover.jpg");

    fireEvent.click(screen.getByRole("button", { name: /share/i }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith(window.location.href));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Link copied");
  });

  it("gates a pending registrant from contact and offers while passing blocked reason to the offer dialog", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing();
    mocks.openHouseSettings = { listing_id: TEST_OPEN_HOUSE_ID, require_time_slot: true };
    mocks.registrations = [{ id: "reg-1", requester_id: "buyer-1", status: "pending" }];

    await renderOpenHouseDetail();

    expect(await screen.findByText(/registration pending/i)).toBeInTheDocument();
    expect(screen.getByText(/contact unlocks after approval/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit offer/i })).toBeDisabled();
    expect(screen.getByTestId("registration-dialog")).toHaveAttribute("data-asset-control", "true");
    expect(screen.getByTestId("offer-dialog")).toHaveTextContent("Awaiting approval");
  });

  it("keeps offers locked after approval until attendance is recorded", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_date: "2026-01-10T10:00:00.000Z" });
    mocks.registrations = [{ id: "reg-1", requester_id: "buyer-1", status: "approved" }];

    await renderOpenHouseDetail();

    expect(await screen.findByText(/registration approved/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /submit offer/i })).toBeDisabled();
    expect(screen.getByTestId("offer-dialog")).toHaveTextContent("Attend the open house to unlock offer submission");
    expect(screen.getByRole("button", { name: /^contact$/i })).toBeEnabled();
  });

  it("requires verified proof of funds for an attended buyer when configured", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_date: "2026-01-10T10:00:00.000Z" });
    mocks.openHouseSettings = { listing_id: TEST_OPEN_HOUSE_ID, require_proof_of_funds: true };
    mocks.registrations = [{
      id: "reg-1",
      requester_id: "buyer-1",
      status: "attended",
      pof_verified_status: "pending",
    }];

    await renderOpenHouseDetail();

    expect(await screen.findAllByText(/proof of funds must be verified/i)).toHaveLength(2);
    expect(screen.getByRole("button", { name: /submit offer/i })).toBeDisabled();
    expect(screen.getByTestId("offer-dialog")).toHaveTextContent(
      "Proof of funds must be verified before you can submit an offer",
    );
  });

  it("shows an existing sealed offer and reopens its detail flow", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_date: "2026-01-10T10:00:00.000Z" });
    mocks.registrations = [{
      id: "reg-1",
      requester_id: "buyer-1",
      status: "attended",
      pof_verified_status: "verified",
    }];
    mocks.offers = [{
      id: "offer-1",
      bidder_id: "buyer-1",
      status: "submitted",
      amount: 430000,
    }];

    await renderOpenHouseDetail();

    const offer = await screen.findByRole("button", { name: /offer submitted.*sealed/i });
    expect(screen.queryByRole("button", { name: /^registration/i })).not.toBeInTheDocument();
    fireEvent.click(offer);
    expect(screen.getByTestId("offer-dialog")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("offer-dialog")).toHaveAttribute("data-can-submit", "true");
  });

  it("passes sale or rental open-house context into the registration dialog", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_transaction_type: "rent", price: 950 });

    const rentalRender = await renderOpenHouseDetail();

    expect(await screen.findByTestId("registration-dialog")).toHaveAttribute("data-transaction-type", "rent");
    expect(screen.getByTestId("property-ai-insights")).toHaveAttribute("data-listing-type", "rent");

    rentalRender.unmount();
    mocks.listing = createListing({ open_house_transaction_type: "sale", price: 420000 });

    await renderOpenHouseDetail(`/open-house/${TEST_OPEN_HOUSE_SALE_ID}`);

    expect(await screen.findByTestId("registration-dialog")).toHaveAttribute("data-transaction-type", "sale");
    expect(screen.getByTestId("property-ai-insights")).toHaveAttribute("data-listing-type", "open_house");
  });

  it("keeps past open houses from opening a new registration flow", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_date: "2026-01-10T10:00:00.000Z" });

    await renderOpenHouseDetail();

    expect(await screen.findByText(/registration closed/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /pre-register for open house/i })).not.toBeInTheDocument();
    expect(screen.getByTestId("registration-dialog")).toHaveAttribute("data-open", "false");
  });

  it("closes registration for paused future events without treating the date as elapsed", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({
      open_house_date: "2030-01-10T10:00:00.000Z",
      status: "paused",
    });

    await renderOpenHouseDetail();

    expect(await screen.findByText(/registration closed/i)).toBeInTheDocument();
    expect(screen.getByTestId("offer-dialog")).toHaveTextContent(/pre-register and get approved first/i);
    expect(screen.getByRole("button", { name: /submit offer/i })).toBeDisabled();
  });

  it("opens offer flow and starts contact for an attended buyer after the event has passed", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_date: "2026-01-10T10:00:00.000Z" });
    mocks.registrations = [{ id: "reg-1", requester_id: "buyer-1", status: "attended" }];

    await renderOpenHouseDetail();

    fireEvent.click(await screen.findByRole("button", { name: /submit offer/i }));
    expect(screen.getByTestId("offer-dialog")).toHaveAttribute("data-open", "true");
    expect(screen.getByTestId("offer-dialog")).toHaveAttribute("data-can-submit", "true");

    fireEvent.click(screen.getByRole("button", { name: /^contact$/i }));

    await waitFor(() => {
      expect(mocks.startConversation.mutateAsync).toHaveBeenCalledWith({
        other_user_id: "owner-1",
        listing_id: TEST_OPEN_HOUSE_ID,
      });
    });
    expect(await screen.findByText("Messages route")).toBeInTheDocument();
  });

  it("maps contact plan-limit failures to an actionable upgrade message", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_date: "2026-01-10T10:00:00.000Z" });
    mocks.registrations = [{ id: "reg-1", requester_id: "buyer-1", status: "approved" }];
    mocks.startConversation.mutateAsync.mockRejectedValueOnce(new Error("contact_limit_reached"));

    await renderOpenHouseDetail();
    fireEvent.click(await screen.findByRole("button", { name: /^contact$/i }));

    await waitFor(() =>
      expect(mocks.toastError).toHaveBeenCalledWith(expect.stringMatching(/contact limit.*upgrade/i)),
    );
  });

  it("renders operational location scores across safe, moderate, and quiet branches", async () => {
    mocks.listing = createListing({
      walkability_score: 82,
      safety_score: 55,
      noise_score: 2,
      latitude: 37.98,
      longitude: 23.73,
    });

    await renderOpenHouseDetail();

    expect(await screen.findByText("Very Walkable")).toBeInTheDocument();
    expect(screen.getByText("Moderate")).toBeInTheDocument();
    expect(screen.getByText("Quiet")).toBeInTheDocument();
  });

  it("lets an owner edit, pause, and delete an open house", async () => {
    mocks.authUser = { id: "owner-1" };
    mocks.listing = createListing();

    await renderOpenHouseDetail();

    expect(await screen.findByTestId("asset-control-panel")).toHaveTextContent(`${TEST_OPEN_HOUSE_ID}:true:420000`);
    expect(screen.getByRole("link", { name: /edit listing/i })).toHaveAttribute("href", `/listings/${TEST_OPEN_HOUSE_ID}/edit`);
    expect(screen.getByRole("link", { name: /manage in dashboard/i })).toHaveAttribute("href", "/dashboard?tab=open-houses");

    fireEvent.click(screen.getByRole("button", { name: /edit date/i }));
    fireEvent.change(screen.getByDisplayValue("2026-06-01T10:00"), { target: { value: "2026-06-02T12:30" } });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => {
      expect(mocks.updateListing.mutateAsync).toHaveBeenCalledWith({
        id: TEST_OPEN_HOUSE_ID,
        updates: { open_house_date: new Date("2026-06-02T12:30").toISOString() },
      });
    });

    fireEvent.click(screen.getByRole("button", { name: /pause/i }));
    expect(mocks.updateListing.mutate).toHaveBeenCalledWith({
      id: TEST_OPEN_HOUSE_ID,
      updates: { status: "paused" },
    });

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(within(screen.getByRole("dialog", { name: /delete open house listing/i })).getByRole("button", { name: /^delete$/i }));

    expect(mocks.deleteListing.mutate).toHaveBeenCalledWith(TEST_OPEN_HOUSE_ID, expect.any(Object));
  });

  it("lets an owner reactivate a paused listing and cancel destructive confirmation", async () => {
    mocks.authUser = { id: "owner-1" };
    mocks.listing = createListing({ status: "paused" });

    await renderOpenHouseDetail();

    fireEvent.click(await screen.findByRole("button", { name: /activate/i }));
    expect(mocks.updateListing.mutate).toHaveBeenCalledWith({
      id: TEST_OPEN_HOUSE_ID,
      updates: { status: "active" },
    });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Listing activated");

    fireEvent.click(screen.getByRole("button", { name: /delete/i }));
    fireEvent.click(within(screen.getByRole("dialog", { name: /delete open house listing/i })).getByRole("button", { name: /cancel/i }));
    expect(mocks.deleteListing.mutate).not.toHaveBeenCalled();
  });

  it("keeps owner date editing open and reports update failure", async () => {
    mocks.authUser = { id: "owner-1" };
    mocks.listing = createListing();
    mocks.updateListing.mutateAsync.mockRejectedValueOnce(new Error("date update failed"));

    await renderOpenHouseDetail();
    fireEvent.click(await screen.findByRole("button", { name: /edit date/i }));
    fireEvent.change(screen.getByDisplayValue("2026-06-01T10:00"), {
      target: { value: "2026-06-03T12:00" },
    });
    fireEvent.click(screen.getByRole("button", { name: /^save$/i }));

    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Could not update date"));
    expect(screen.getByDisplayValue("2026-06-03T12:00")).toBeInTheDocument();
  });

  it("redirects non-open-house listings to the standard property detail route", async () => {
    mocks.listing = createListing({ listing_type: "sale", publicationId: 7401 });

    await renderOpenHouseDetail();

    const redirectTarget = await screen.findByTestId("property-redirect-target");
    expect(redirectTarget).toHaveAttribute("data-listing-id", TEST_OPEN_HOUSE_ID);
    expect(redirectTarget).toHaveAttribute("data-publication-id", "7401");
  });

  it("keeps localized guest actions and malformed-listing recovery safe", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    mocks.listing = createListing({
      address: null,
      city: null,
      region: null,
      price: null,
      sqm: null,
      price_per_sqm: null,
      property_type: "plot",
      open_house_date: null,
      cover_image_url: null,
      listing_images: [],
      latitude: null,
      longitude: null,
      safety_score: 20,
      noise_score: 8,
      views_count: null,
    });
    const share = vi.fn().mockRejectedValue(new Error("share cancelled"));
    Object.assign(navigator, { share });

    const localized = await renderOpenHouseDetail();
    expect(await screen.findByRole("heading", { name: "Athens Loft Open House" })).toBeInTheDocument();
    expect(screen.queryByRole("img", { name: "Athens Loft Open House" })).not.toBeInTheDocument();

    const favoriteButton = document.querySelector("button .lucide-heart")?.closest("button");
    const shareButton = document.querySelector("button .lucide-share2")?.closest("button");
    expect(favoriteButton).toBeTruthy();
    expect(shareButton).toBeTruthy();
    fireEvent.click(favoriteButton as HTMLButtonElement);
    fireEvent.click(shareButton as HTMLButtonElement);
    expect(mocks.toastError).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(share).toHaveBeenCalledWith(expect.objectContaining({ title: "Athens Loft Open House" })));

    localized.unmount();
    await renderOpenHouseDetail("/open-house/not-a-valid-id");
    const notFoundHeading = await screen.findByRole("heading");
    expect(notFoundHeading).not.toHaveTextContent("Listing not found");
    expect(screen.queryByText(/this open house listing does not exist/i)).not.toBeInTheDocument();
  });

  it("explains localized POF and future-event eligibility to an attended buyer", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({
      open_house_date: "2030-01-10T10:00:00.000Z",
      safety_score: 85,
      noise_score: 5,
    });
    mocks.openHouseSettings = { listing_id: TEST_OPEN_HOUSE_ID, require_proof_of_funds: true };
    mocks.registrations = [{
      id: "reg-1",
      requester_id: "buyer-1",
      status: "attended",
      pof_verified_status: "pending",
    }];
    mocks.offers = [{
      id: "offer-1",
      bidder_id: "buyer-1",
      status: "accepted",
      amount: 435500,
    }];
    mocks.startConversation.mutateAsync.mockRejectedValueOnce(new Error("conversation unavailable"));

    await renderOpenHouseDetail();

    expect(await screen.findByTestId("offer-dialog")).not.toHaveTextContent("Proof of funds must be verified before you can submit an offer");
    expect(screen.queryByText("Safe area")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /435[,.]500/ })).toBeInTheDocument();

    const contactButton = document.querySelector("button .lucide-message-circle")?.closest("button");
    expect(contactButton).toBeTruthy();
    fireEvent.click(contactButton as HTMLButtonElement);
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledTimes(1));
    expect(String(mocks.toastError.mock.calls[0]?.[0])).not.toBe("Could not start conversation");
  });

  it("supports localized owner and admin-equivalent management of a rental event", async () => {
    globalThis.__MAIPROP_TEST_I18N_LANGUAGE__ = "el";
    mocks.authUser = { id: "admin-1" };
    mocks.isPro = true;
    mocks.listing = createListing({
      owner_id: "admin-1",
      status: "paused",
      open_house_transaction_type: "rent",
      price: 1250,
      price_per_sqm: null,
      cover_image_url: null,
      listing_images: [
        { url: "https://images.example/rental-second.jpg", sort_order: 2 },
        { url: "https://images.example/rental-first.jpg", sort_order: null },
      ],
      safety_score: 85,
      noise_score: 5,
    });

    await renderOpenHouseDetail();
    expect(await screen.findByTestId("asset-control-panel")).toHaveTextContent(`${TEST_OPEN_HOUSE_ID}:true:1250`);
    expect(screen.getByTestId("registration-dialog")).toHaveAttribute("data-transaction-type", "rent");
    expect(screen.getByTestId("property-valuation")).toBeInTheDocument();

    const activateButton = document.querySelector("button .lucide-play")?.closest("button");
    expect(activateButton).toBeTruthy();
    fireEvent.click(activateButton as HTMLButtonElement);
    expect(mocks.updateListing.mutate).toHaveBeenCalledWith({
      id: TEST_OPEN_HOUSE_ID,
      updates: { status: "active" },
    });

    const editDateButton = document.querySelector("button .lucide-calendar")?.closest("button");
    expect(editDateButton).toBeTruthy();
    fireEvent.click(editDateButton as HTMLButtonElement);
    const dateInput = screen.getByDisplayValue("2026-06-01T10:00");
    fireEvent.change(dateInput, { target: { value: "2030-06-02T12:30" } });
    const dateActions = dateInput.parentElement?.querySelectorAll("button");
    fireEvent.click(dateActions?.[0] as HTMLButtonElement);
    await waitFor(() => expect(mocks.updateListing.mutateAsync).toHaveBeenCalled());

    const deleteButton = document.querySelector("button .lucide-trash2")?.closest("button");
    fireEvent.click(deleteButton as HTMLButtonElement);
    fireEvent.click(within(screen.getByRole("dialog")).getAllByRole("button")[0]);
    const deleteOptions = mocks.deleteListing.mutate.mock.calls[0]?.[1] as { onSuccess?: () => void };
    deleteOptions.onSuccess?.();
    expect(mocks.toastSuccess).toHaveBeenCalled();
  });
});
