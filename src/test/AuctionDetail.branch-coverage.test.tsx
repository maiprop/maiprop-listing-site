import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { HelmetProvider } from "react-helmet-async";
import { MemoryRouter, Route, Routes, type InitialEntry } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { APP_ORIGIN } from "@/lib/config";

const mocks = vi.hoisted(() => ({
  language: "en",
  auctionListings: { data: [] as Record<string, unknown>[], isLoading: false },
  subscription: { isPro: false },
  queryResult: {
    data: null as Record<string, unknown> | null,
    isLoading: false,
    isFetching: false,
    isFetched: true,
    isError: false,
  },
  queryOptions: null as Record<string, unknown> | null,
  share: vi.fn(),
  writeText: vi.fn(),
  toastSuccess: vi.fn(),
  toastInfo: vi.fn(),
  miniMapProps: vi.fn(),
  scoreProps: vi.fn(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    i18n: { language: mocks.language },
    t: (key: string, options?: { defaultValue?: string }) => {
      const isGreek = mocks.language.toLowerCase().startsWith("el");
      const translations: Record<string, [string, string]> = {
        "auctions.detail.verifyingCached": [
          "Showing cached auction details while we verify the latest information.",
          "Προβάλλονται προσωρινά αποθηκευμένα στοιχεία ενώ επαληθεύουμε τις πιο πρόσφατες πληροφορίες.",
        ],
        "auctions.detail.refreshFailed": [
          "Live auction details could not be refreshed. The information shown may be outdated.",
          "Δεν ήταν δυνατή η ανανέωση των στοιχείων του πλειστηριασμού. Οι πληροφορίες που εμφανίζονται ενδέχεται να μην είναι ενημερωμένες.",
        ],
        "property.area": ["Surface", "Εμβαδόν"],
        "property.bedrooms": ["Bedrooms", "Υπνοδωμάτια"],
        "property.bathrooms": ["Bathrooms", "Μπάνια"],
        "property.floor": ["Floor", "Όροφος"],
        "property.yearBuilt": ["Built", "Έτος κατασκευής"],
        "property.energyClass": ["Energy", "Ενεργειακή κλάση"],
        "auctions.detail.auction": ["Auction", "Πλειστηριασμός"],
        "auctions.detail.timing": ["Timing", "Χρονισμός"],
        "auctions.detail.ownership": ["Ownership", "Κυριότητα"],
        "auctions.detail.share": ["Share", "Ποσοστό"],
      };
      return translations[key]?.[isGreek ? 1 : 0] ?? options?.defaultValue ?? key;
    },
  }),
}));

vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: Record<string, unknown>) => {
    mocks.queryOptions = options;
    return mocks.queryResult;
  },
}));

vi.mock("@/hooks/useAuctionListings", () => ({
  useAuctionListings: vi.fn((_limit: number, _options: Record<string, unknown>) => mocks.auctionListings),
  fetchAuctionListingById: vi.fn(),
}));

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => mocks.subscription,
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { id: "viewer-1" } }),
}));

vi.mock("@/hooks/usePropertyAIInsights", () => ({
  usePropertyAIInsights: () => ({
    aiInsightsData: { summary: "auction evidence" },
    aiInsightsLoading: false,
    aiInsightsLoaded: true,
    aiInsightsQuota: { remaining: 2 },
    aiInsightsQuotaLoading: false,
    loadAiInsights: vi.fn(),
  }),
}));

vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => mocks.toastSuccess(...args),
    info: (...args: unknown[]) => mocks.toastInfo(...args),
  },
}));

vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="footer" /> }));
vi.mock("@/components/property/PropertyGallery", () => ({
  default: ({ title, images, onShare, onFavorite }: { title: string; images: string[]; onShare: () => void; onFavorite: () => void }) => (
    <section data-testid="gallery">
      <span>{title}</span>
      <span>{images.length} images</span>
      <button onClick={onShare}>share auction</button>
      <button onClick={onFavorite}>favorite auction</button>
    </section>
  ),
}));
vi.mock("@/components/PropertyValuation", () => ({
  default: (props: { price: number; sqm: number; listingType: string; ownershipPercentage?: number }) => (
    <div data-testid="property-valuation">{props.listingType}:{props.price}:{props.sqm}:{props.ownershipPercentage ?? "full"}</div>
  ),
}));
vi.mock("@/components/property/PropertyValuationLockedCard", () => ({
  PropertyValuationLockedCard: () => <div data-testid="valuation-locked" />,
}));
vi.mock("@/components/property/PropertyScoresSection", () => ({
  PropertyScoresSection: (props: Record<string, unknown>) => { mocks.scoreProps(props); return <div data-testid="scores" />; },
}));
vi.mock("@/components/property/PropertyReportCard", () => ({
  PropertyReportCard: ({ listingId }: { listingId: string }) => <div data-testid="report">{listingId}</div>,
}));
vi.mock("@/components/property/PropertyAIInsightsSection", () => ({
  PropertyAIInsightsSection: () => <div data-testid="ai-insights" />,
}));
vi.mock("@/components/property/DetailPrimitives", () => ({
  Section: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  SectionHeader: ({ title }: { title: string }) => <h2>{title}</h2>,
}));
vi.mock("@/components/property/PropertyDetailsAndEnergy", () => ({
  PropertyDetailsAndEnergy: ({ detailGroups, energyClass }: { detailGroups: unknown; energyClass: string | null }) => (
    <div data-testid="details">{JSON.stringify(detailGroups)}:{energyClass ?? "none"}</div>
  ),
}));
vi.mock("@/components/property/PropertyHeroSpecsBar", () => ({
  PropertyHeroSpecsBar: ({ items }: { items: Array<{ key: string; label: string; value: unknown }> }) => (
    <div data-testid="hero-specs">
      {items.map((item) => (
        <span key={item.key}>{item.key}:{String(item.value)}|{item.label}:{String(item.value)};</span>
      ))}
    </div>
  ),
}));
vi.mock("@/components/AIAssistantWidget", () => ({
  default: ({ propertyContext }: { propertyContext: { title: string } }) => <div data-testid="assistant">{propertyContext.title}</div>,
}));
vi.mock("@/components/PropertyMiniMap", () => ({
  default: (props: { latitude: number; longitude: number } & Record<string, unknown>) => { mocks.miniMapProps(props); return <div data-testid="mini-map">{props.latitude},{props.longitude}</div>; },
}));
vi.mock("@/components/NeighbourhoodReport", () => ({
  default: ({ city }: { city: string }) => <div data-testid="neighbourhood">{city}</div>,
}));
vi.mock("@/lib/auctionStreetView", () => ({
  getAuctionImageList: ({ cover_image_url, images = [] }: { cover_image_url?: string | null; images?: string[] }) =>
    [cover_image_url, ...images].filter((value): value is string => Boolean(value)),
}));

import { useAuctionListings } from "@/hooks/useAuctionListings";
import AuctionDetail from "@/pages/AuctionDetail";

const auction = (overrides: Record<string, unknown> = {}) => ({
  id: "auction-1",
  title: "Athens Auction Flat",
  city: "Athens",
  region: "Attica",
  address: "1 Test Street",
  auction_date: "2026-08-01T10:00:00.000Z",
  auction_starting_bid: "150000",
  price: 160000,
  sqm: "80",
  bedrooms: "2",
  bathrooms: 1,
  propertyFloor: "3",
  numberOfFloors: "6",
  year_built: "2002",
  energy_class: "B+",
  property_type: "apartment",
  latitude: "37.98",
  longitude: 23.72,
  cover_image_url: "https://images.example/cover.jpg",
  images: ["https://images.example/two.jpg"],
  website_url: "https://eauction.example/listing",
  tags: ["ownership:partial", "ownership_pct:50"],
  ...overrides,
});

const renderDetail = (state?: unknown) => {
  const entry: InitialEntry = { pathname: "/auction/auction-1", state };
  return render(
    <HelmetProvider>
      <MemoryRouter initialEntries={[entry]}>
        <Routes>
          <Route path="/auction/:id" element={<AuctionDetail />} />
        </Routes>
      </MemoryRouter>
    </HelmetProvider>,
  );
};

describe("AuctionDetail branch coverage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.language = "en";
    mocks.auctionListings = { data: [], isLoading: false };
    mocks.subscription = { isPro: false };
    mocks.queryResult = {
      data: null,
      isLoading: false,
      isFetching: false,
      isFetched: true,
      isError: false,
    };
    mocks.queryOptions = null;
    Object.defineProperty(navigator, "share", { configurable: true, value: mocks.share });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: mocks.writeText } });
    mocks.share.mockResolvedValue(undefined);
    mocks.writeText.mockResolvedValue(undefined);
  });

  it("renders the loading shell only while neither list nor exact lookup has resolved", () => {
    mocks.auctionListings = { data: [], isLoading: true };
    mocks.queryResult = {
      data: null,
      isLoading: true,
      isFetching: true,
      isFetched: false,
      isError: false,
    };

    const { container } = renderDetail();

    expect(screen.getByTestId("navbar")).toBeInTheDocument();
    expect(container.querySelector(".animate-spin")).toBeInTheDocument();
    expect(screen.queryByText("Back to Auctions")).not.toBeInTheDocument();
  });

  it("renders a recoverable not-found state after both auction sources resolve empty", () => {
    renderDetail();

    expect(screen.getByText("This auction may have ended or the link is invalid.")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Back to Auctions/i })).toHaveAttribute("href", "/auctions");
    expect(screen.getByTestId("footer")).toBeInTheDocument();
  });

  it("renders complete route state immediately while authoritative verification remains visible", async () => {
    mocks.subscription = { isPro: true };
    mocks.queryResult = {
      data: null,
      isLoading: true,
      isFetching: true,
      isFetched: false,
      isError: false,
    };
    renderDetail({ auction: auction() });

    expect(vi.mocked(useAuctionListings)).toHaveBeenCalledWith(60, { enabled: false });
    expect(mocks.queryOptions?.enabled).toBe(true);
    expect(screen.getByRole("status")).toHaveTextContent(
      "Showing cached auction details while we verify the latest information.",
    );
    expect(screen.getAllByText("Athens Auction Flat").length).toBeGreaterThan(0);
    expect(screen.getByTestId("gallery")).toHaveTextContent("2 images");
    expect(await screen.findByTestId("mini-map")).toHaveTextContent("37.98,23.72");
    expect(mocks.miniMapProps.mock.calls.at(-1)?.[0]).not.toHaveProperty("onWalkScoreChange");
    expect(mocks.scoreProps.mock.calls.at(-1)?.[0]).not.toHaveProperty("walkScore");
    expect(screen.getByTestId("property-valuation")).toHaveTextContent("auction:150000:80:50");
    expect(screen.queryByTestId("valuation-locked")).not.toBeInTheDocument();
    expect(screen.getByTestId("details")).toHaveTextContent("First Offer Price");
    expect(screen.getAllByRole("link", { name: /Open eAuction/i })[0]).toHaveAttribute(
      "href",
      "https://eauction.example/listing",
    );

    fireEvent.click(screen.getByRole("button", { name: "favorite auction" }));
    expect(mocks.toastInfo).toHaveBeenCalled();
    await waitFor(() => expect(screen.getByTestId("assistant")).toHaveTextContent("Athens Auction Flat"));
  });

  it("enriches incomplete listing route state with the exact safe eAuction URL", () => {
    mocks.queryResult = {
      data: auction({ website_url: "https://www.eauction.gr/Auction/Details/exact", price: 170000 }),
      isLoading: false,
      isFetching: false,
      isFetched: true,
      isError: false,
    };

    renderDetail({ listing: auction({ listing_type: "auction", website_url: "javascript:alert(1)", title: "State title" }) });

    expect(vi.mocked(useAuctionListings)).toHaveBeenCalledWith(60, { enabled: false });
    expect(mocks.queryOptions?.enabled).toBe(true);
    expect(screen.getAllByText("Athens Auction Flat").length).toBeGreaterThan(0);
    expect(screen.getAllByRole("link", { name: /Open eAuction/i })[0]).toHaveAttribute(
      "href",
      "https://www.eauction.gr/Auction/Details/exact",
    );
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("keeps cached detail visible with a refresh-failed warning after exact lookup fails", () => {
    mocks.queryResult = {
      data: null,
      isLoading: false,
      isFetching: false,
      isFetched: true,
      isError: true,
    };

    renderDetail({ auction: auction() });

    expect(screen.getAllByText("Athens Auction Flat").length).toBeGreaterThan(0);
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Live auction details could not be refreshed. The information shown may be outdated.",
    );
  });

  it("falls back to the bounded cache, keeps valuation locked, and omits unsafe links and maps", () => {
    mocks.auctionListings = {
      data: [auction({ website_url: "data:text/html,bad", latitude: null, longitude: null, tags: null })],
      isLoading: false,
    };

    renderDetail();

    expect(vi.mocked(useAuctionListings)).toHaveBeenCalledWith(60, { enabled: true });
    expect(mocks.queryOptions?.enabled).toBe(true);
    expect(screen.getByTestId("valuation-locked")).toBeInTheDocument();
    expect(screen.queryByTestId("property-valuation")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Open eAuction/i })).not.toBeInTheDocument();
    expect(screen.queryByTestId("mini-map")).not.toBeInTheDocument();
    expect(screen.getByTestId("report")).toHaveTextContent("auction-1");
  });

  it("uses native sharing, handles cancellation, and falls back to clipboard when unavailable", async () => {
    const native = renderDetail({ auction: auction() });
    fireEvent.click(screen.getByRole("button", { name: "share auction" }));
    await waitFor(() => expect(mocks.share).toHaveBeenCalledWith({
      title: "Athens Auction Flat",
      url: `${APP_ORIGIN}/auction/auction-1`,
    }));
    expect(mocks.writeText).not.toHaveBeenCalled();
    native.unmount();

    mocks.share.mockRejectedValueOnce(new Error("share cancelled"));
    const cancelled = renderDetail({ auction: auction() });
    fireEvent.click(screen.getByRole("button", { name: "share auction" }));
    await waitFor(() => expect(mocks.share).toHaveBeenCalledTimes(2));
    expect(mocks.writeText).not.toHaveBeenCalled();
    cancelled.unmount();

    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    renderDetail({ auction: auction() });
    fireEvent.click(screen.getByRole("button", { name: "share auction" }));
    await waitFor(() => expect(mocks.writeText).toHaveBeenCalledWith(`${APP_ORIGIN}/auction/auction-1`));
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Link copied");
  });

  it("renders sparse Greek auction data without inventing pricing, coordinates, or ownership", () => {
    mocks.language = "el-GR";
    mocks.subscription = { isPro: true };

    renderDetail({ auction: auction({
      title: undefined,
      city: undefined,
      address: "",
      region: "",
      auction_date: null,
      auction_starting_bid: "invalid",
      price: null,
      sqm: 0,
      bedrooms: Number.NaN,
      bathrooms: "",
      propertyFloor: null,
      property_floor: "ground",
      numberOfFloors: undefined,
      year_built: undefined,
      energy_class: "Exempt",
      property_type: undefined,
      latitude: undefined,
      longitude: undefined,
      cover_image_url: null,
      images: [],
      website_url: null,
      tags: ["ownership_pct:100"],
    }) });

    expect(screen.getByTestId("property-valuation")).toHaveTextContent("auction:0:1:100");
    expect(screen.queryByTestId("mini-map")).not.toBeInTheDocument();
    expect(screen.getByTestId("gallery")).toHaveTextContent("0 images");
    expect(screen.getByTestId("hero-specs")).toHaveTextContent("energy:null");
  });

  it("localizes auction hero labels and month names in Greek", () => {
    mocks.language = "el-GR";
    mocks.queryResult = {
      data: auction(),
      isLoading: false,
      isFetching: false,
      isFetched: true,
      isError: false,
    };

    renderDetail();

    const specs = screen.getByTestId("hero-specs");
    expect(specs).toHaveTextContent("Εμβαδόν");
    expect(specs).toHaveTextContent("Υπνοδωμάτια");
    expect(specs).toHaveTextContent("Πλειστηριασμός");
    expect(specs).toHaveTextContent(/Αυγ/);
    expect(specs).not.toHaveTextContent(/\bAug\b/);
  });
});
