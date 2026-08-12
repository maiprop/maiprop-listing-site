import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import i18n from "@/i18n";

vi.unmock("react-i18next");

const mocks = vi.hoisted(() => ({
  streetViewCandidate: vi.fn(),
  propertyCard: vi.fn(),
}));

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

vi.mock("@/lib/auctionStreetView", () => ({
  AUCTION_FALLBACK_LOGO_URL: "/images/maiprop-logo.webp",
  getAuctionStreetViewCandidateUrl: mocks.streetViewCandidate,
}));

vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: (props: { property: { images: string[]; auctionDate?: string }; deferOffscreenRendering?: boolean }) => {
    mocks.propertyCard(props);
    return (
      <div
        data-testid="property-card"
        data-images={props.property.images.join("|")}
        data-auction-date={props.property.auctionDate}
        data-defer-offscreen={String(props.deferOffscreenRendering)}
      />
    );
  },
}));

const auctionListing = {
  id: "auction-1",
  title: "Athens Auction",
  address: "1 Ermou",
  city: "Athens",
  price: 250000,
  sqm: 80,
  property_type: "apartment" as const,
  listing_type: "auction" as const,
  auction_date: "2026-07-01",
};

describe("HomepageAuctionsSection behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.streetViewCandidate.mockReturnValue("https://street.example/auction.jpg");
  });

  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("prefers existing auction photos before Street View on the homepage", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");

    renderWithProviders(
      <HomepageAuctionsSection
        isLoading={false}
        listings={[
          {
            ...auctionListing,
            cover_image_url: " https://cdn.example/cover.jpg ",
            listing_images: [
              { url: "https://cdn.example/second.jpg", sort_order: 2 },
              { url: "https://cdn.example/first.jpg", sort_order: 1 },
            ],
            latitude: 37.98,
            longitude: 23.72,
          },
        ]}
      />,
    );

    const card = screen.getByTestId("property-card");
    expect(card).toHaveAttribute(
      "data-images",
      [
        "https://cdn.example/cover.jpg",
        "https://cdn.example/first.jpg",
        "https://cdn.example/second.jpg",
        "https://street.example/auction.jpg",
      ].join("|"),
    );
    expect(card).toHaveAttribute("data-defer-offscreen", "false");
    expect(mocks.streetViewCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "auction-1" }),
      "480x270",
    );
  });

  it("uses the smaller homepage Street View size instead of a persisted large Street View cover", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");

    renderWithProviders(
      <HomepageAuctionsSection
        isLoading={false}
        listings={[
          {
            ...auctionListing,
            cover_image_url: "https://qvvicunqcrwpioqnvzxf.supabase.co/functions/v1/streetview-proxy?size=800x450&lat=37.98&lng=23.72",
            latitude: 37.98,
            longitude: 23.72,
          },
        ]}
      />,
    );

    expect(screen.getByTestId("property-card")).toHaveAttribute(
      "data-images",
      "https://street.example/auction.jpg",
    );
    expect(mocks.streetViewCandidate).toHaveBeenCalledWith(
      expect.objectContaining({ id: "auction-1" }),
      "480x270",
    );
  });

  it("uses the homepage Street View fallback only when auction photos are missing", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");

    renderWithProviders(
      <HomepageAuctionsSection
        isLoading={false}
        listings={[auctionListing]}
      />,
    );

    expect(screen.getByTestId("property-card")).toHaveAttribute(
      "data-images",
      "https://street.example/auction.jpg",
    );
  });

  it("renders loading exclusively even when stale auction data is present", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");

    renderWithProviders(
      <HomepageAuctionsSection
        isLoading
        isError={false}
        listings={[auctionListing]}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getAllByTestId("auction-loading-card")).toHaveLength(4);
    expect(screen.queryByTestId("property-card")).not.toBeInTheDocument();
  });

  it("shows a localized targeted retry and suppresses stale auctions after an error", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");
    const onRetry = vi.fn();
    await i18n.changeLanguage("el");

    renderWithProviders(
      <HomepageAuctionsSection
        isLoading={false}
        isError
        listings={[auctionListing]}
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Δεν ήταν δυνατή η φόρτωση των πλειστηριασμών");
    expect(screen.queryByTestId("property-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Δοκιμάστε ξανά" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it("shows a truthful localized empty state after a successful empty response", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");
    await i18n.changeLanguage("el");

    renderWithProviders(
      <HomepageAuctionsSection
        isLoading={false}
        isError={false}
        listings={[]}
        onRetry={vi.fn()}
      />,
    );

    expect(screen.getByText("Δεν υπάρχουν προγραμματισμένοι πλειστηριασμοί αυτή τη στιγμή.")).toBeInTheDocument();
  });

  it("formats homepage auction month names using the active Greek locale", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");
    await i18n.changeLanguage("el");

    renderWithProviders(
      <HomepageAuctionsSection
        isLoading={false}
        listings={[{ ...auctionListing, auction_date: "2026-08-01T10:00:00.000Z" }]}
      />,
    );

    expect(screen.getByTestId("property-card")).toHaveAttribute(
      "data-auction-date",
      expect.stringMatching(/Αυγ/),
    );
    expect(screen.getByTestId("property-card")).not.toHaveAttribute(
      "data-auction-date",
      expect.stringMatching(/\bAug\b/),
    );
  });
});
