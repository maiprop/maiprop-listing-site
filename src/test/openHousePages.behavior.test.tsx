import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { Route, Routes } from "react-router-dom";
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
  invoke: vi.fn(),
  streetView: vi.fn(),
  publicApi: vi.fn(),
}));

const TEST_OPEN_HOUSE_ID = "11111111-1111-4111-8111-111111111111";
const TEST_OPEN_HOUSE_SALE_ID = "22222222-2222-4222-8222-222222222222";

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/MapView", () => ({
  MapView: ({
    listings,
    onPolygonFilter,
    itemLabelSingular,
    itemLabelPlural,
  }: {
    listings?: Array<{ id: string }>;
    onPolygonFilter?: (ids: Set<string> | null) => void;
    itemLabelSingular?: string;
    itemLabelPlural?: string;
  }) => (
    <div
      data-testid="map-view"
      data-count={String(listings?.length ?? 0)}
      data-labels={`${itemLabelSingular ?? ""}/${itemLabelPlural ?? ""}`}
    >
      <button type="button" onClick={() => onPolygonFilter?.(new Set(["oh-athens"]))}>
        Apply open house area
      </button>
    </div>
  ),
}));
vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: { title: string; city?: string; images?: string[] } }) => (
    <article data-testid="open-house-card" data-image={property.images?.[0] ?? ""}>
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
  fetchPublicApi: (...args: unknown[]) => mocks.publicApi(...args),
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
    limit: vi.fn((_: number, options?: { referencedTable?: string }) =>
      options?.referencedTable ? chain : Promise.resolve({ data, error })
    ),
  };
  mocks.from.mockReturnValue(chain);
  return chain;
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function renderOpenHouses(initialPath = "/open-houses") {
  const { default: OpenHouses } = await import("@/pages/OpenHouses");
  return renderWithProviders(<OpenHouses />, { initialPath });
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
async function renderOpenHouseDetail(initialPath = `/open-house/${TEST_OPEN_HOUSE_ID}`) {
  const { default: OpenHouseDetail } = await import("@/pages/OpenHouseDetail");
  return renderWithProviders(
    <Routes>
      <Route path="/open-house/:id" element={<OpenHouseDetail />} />
      <Route path="/property/:id" element={<div>Property redirect target</div>} />
      <Route path="/messages" element={<div>Messages route</div>} />
    </Routes>,
    { initialPath }
  );
}

beforeEach(() => {
  vi.clearAllMocks();
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
  makeListingsQuery([]);
  Object.assign(navigator, {
    clipboard: { writeText: vi.fn().mockResolvedValue(undefined) },
    share: undefined,
  });
});

describe("OpenHouses page behavior", () => {
  it("filters open house cards by city and property type, then clears filters", async () => {
    mocks.publicApi.mockResolvedValue([
      createListing({ id: "oh-athens", title: "Athens Apartment", city: "Athens", property_type: "apartment" }),
      createListing({ id: "oh-voula", title: "Voula House", city: "Voula", property_type: "house", price: 900000 }),
    ]);

    await renderOpenHouses();

    expect(await screen.findByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.getByText("Voula House")).toBeInTheDocument();
    expect(mocks.publicApi).toHaveBeenCalledWith(
      "/api/public/open-houses?showPast=0&limit=200",
      { throwOnError: true },
    );
    expect(mocks.from).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/search open houses by city/i), { target: { value: "Athens" } });
    fireEvent.keyDown(screen.getByLabelText(/search open houses by city/i), { key: "Enter" });

    expect(screen.getByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.queryByText("Voula House")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /toggle filters/i }));
    fireEvent.click(screen.getByRole("button", { name: "House" }));

    expect(screen.getByText(/no open houses match your filters/i)).toBeInTheDocument();

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
      "/api/public/open-houses?showPast=0&limit=200&transactionType=rent",
      { throwOnError: true },
    );

    mocks.publicApi.mockClear().mockResolvedValue([
      createListing({ id: "oh-sale", title: "Sale Open House", city: "Athens", open_house_transaction_type: "sale" }),
    ]);
    fireEvent.click(screen.getByRole("button", { name: /sale open houses/i }));

    await waitFor(() =>
      expect(mocks.publicApi).toHaveBeenCalledWith(
        "/api/public/open-houses?showPast=0&limit=200&transactionType=sale",
        { throwOnError: true },
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
    expect(screen.getByTestId("map-view")).toHaveAttribute("data-count", "1");

    fireEvent.click(screen.getByRole("button", { name: /show as list/i }));

    expect(screen.getByText("Athens Apartment")).toBeInTheDocument();
    expect(screen.queryByText("Voula House")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /clear area/i }));
    expect(await screen.findByText("Voula House")).toBeInTheDocument();
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

  it("surfaces public API outages without direct Supabase fallback and switches paths for past open houses", async () => {
    mocks.publicApi.mockResolvedValue(null);
    makeListingsQuery([createListing({ id: "oh-db", title: "Direct DB Open House" })]);

    await renderOpenHouses();

    expect(await screen.findAllByText(/could not load open houses/i)).toHaveLength(2);
    expect(screen.queryByText("Direct DB Open House")).not.toBeInTheDocument();
    expect(mocks.publicApi).toHaveBeenCalledWith(
      "/api/public/open-houses?showPast=0&limit=200",
      { throwOnError: true },
    );
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.publicApi.mockClear().mockResolvedValue([]);
    fireEvent.click(screen.getByRole("button", { name: "Past" }));

    await waitFor(() =>
      expect(mocks.publicApi).toHaveBeenCalledWith(
        "/api/public/open-houses?showPast=1&limit=200",
        { throwOnError: true },
      )
    );
    expect(mocks.from).not.toHaveBeenCalled();
  });
});

describe("OpenHouseDetail page behavior", () => {
  it("renders the not-found shell immediately for malformed open-house ids", async () => {
    mocks.listing = createListing();

    await renderOpenHouseDetail("/open-house/non-existent-id-789");

    expect(await screen.findByRole("heading", { name: /listing not found/i })).toBeInTheDocument();
    expect(screen.getByText(/does not exist or has been removed/i)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /back to open houses/i })).toHaveAttribute("href", "/open-houses");
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

  it("passes sale or rental open-house context into the registration dialog", async () => {
    mocks.authUser = { id: "buyer-1" };
    mocks.listing = createListing({ open_house_transaction_type: "rent", price: 950 });

    const rentalRender = await renderOpenHouseDetail();

    expect(await screen.findByTestId("registration-dialog")).toHaveAttribute("data-transaction-type", "rent");

    rentalRender.unmount();
    mocks.listing = createListing({ open_house_transaction_type: "sale", price: 420000 });

    await renderOpenHouseDetail(`/open-house/${TEST_OPEN_HOUSE_SALE_ID}`);

    expect(await screen.findByTestId("registration-dialog")).toHaveAttribute("data-transaction-type", "sale");
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

  it("redirects non-open-house listings to the standard property detail route", async () => {
    mocks.listing = createListing({ listing_type: "sale" });

    await renderOpenHouseDetail();

    expect(await screen.findByText("Property redirect target")).toBeInTheDocument();
  });
});
