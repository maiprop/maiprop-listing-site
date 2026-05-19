import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

const toastSuccess = vi.fn();
const toastInfo = vi.fn();
const streetViewMock = vi.fn();

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, info: toastInfo },
}));

vi.mock("@/lib/config", () => ({
  APP_ORIGIN: "https://maiprop.test",
}));

vi.mock("@/lib/auctionStreetView", () => ({
  AUCTION_FALLBACK_LOGO_URL: "/images/maiprop-logo.webp",
  getAuctionStreetViewImageUrl: (auction: unknown) => streetViewMock(auction),
}));

const auction = (overrides: Record<string, unknown> = {}) => ({
  id: "a1",
  title: "Auction Apartment",
  address: "Court St 5",
  city: "Athens",
  auction_date: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  auction_starting_bid: 95000,
  price: 120000,
  property_type: "apartment",
  year_built: 1980,
  sqm: 76,
  tags: ["ownership:common", "ownership_pct:50"],
  auction_court: "Athens Court",
  is_featured: true,
  website_url: "https://auction.example.test",
  ...overrides,
});

describe("AuctionCard behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    streetViewMock.mockReturnValue("https://example.test/street.jpg");
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("renders featured auction metadata, ownership, saved state, and external eAuction link", async () => {
    const { AuctionCard } = await import("@/components/auctions/AuctionCard");
    const onToggleFav = vi.fn();

    renderWithProviders(
      <AuctionCard a={auction()} favoritedIds={new Set(["a1"])} onToggleFav={onToggleFav} />,
    );

    expect(screen.getByText("Featured")).toBeInTheDocument();
    expect(screen.getAllByText(/Διαμ/).length).toBeGreaterThan(0);
    expect(screen.getByText("Athens Court")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /eauction/i })).toHaveAttribute("href", "https://auction.example.test");

    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onToggleFav).toHaveBeenCalledWith("a1", true);
  });

  it("copies auction links when Web Share is unavailable and reports via toast", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: writeTextMock } });
    const { AuctionCard } = await import("@/components/auctions/AuctionCard");

    renderWithProviders(
      <AuctionCard a={auction({ id: "copy-me", is_featured: false })} favoritedIds={new Set()} onToggleFav={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(writeTextMock).toHaveBeenCalledWith("https://maiprop.test/auction/copy-me"));
    expect(toastSuccess).toHaveBeenCalledWith("Link copied to clipboard");

    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    expect(toastInfo).toHaveBeenCalledWith("Report submitted. Our team will review it.");
  });

  it("swallows cancelled native share and falls back from broken street-view images", async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error("cancelled"));
    Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
    const { AuctionCard } = await import("@/components/auctions/AuctionCard");

    renderWithProviders(
      <AuctionCard
        a={auction({ property_type: "", tags: ["commercial_type:store"], auction_court: "CODE_ONLY" })}
        favoritedIds={new Set()}
        onToggleFav={vi.fn()}
      />,
    );

    expect(screen.getAllByText("Store / Retail").length).toBeGreaterThan(0);
    expect(screen.queryByText("CODE_ONLY")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Share" }));
    await waitFor(() => expect(shareMock).toHaveBeenCalled());

    const image = screen.getByAltText("Auction Apartment") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
  });

  it("uses cover image after Street View fails, then the maiProp logo if cover also fails", async () => {
    const { AuctionCard } = await import("@/components/auctions/AuctionCard");

    renderWithProviders(
      <AuctionCard
        a={auction({ cover_image_url: "https://example.test/cover.jpg" })}
        favoritedIds={new Set()}
        onToggleFav={vi.fn()}
      />,
    );

    const image = screen.getByAltText("Auction Apartment") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src).toBe("https://example.test/cover.jpg");
    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
    expect(image.style.objectFit).toBe("contain");
  });

  it("uses the maiProp logo and minimal price fallback when street-view and prices are absent", async () => {
    streetViewMock.mockReturnValue(null);
    const { AuctionCard } = await import("@/components/auctions/AuctionCard");

    renderWithProviders(
      <AuctionCard
        a={auction({ auction_starting_bid: null, price: null, property_type: "", tags: [], sqm: 1, year_built: null })}
        favoritedIds={new Set()}
        onToggleFav={vi.fn()}
      />,
    );

    expect(screen.getByAltText("Auction Apartment")).toHaveAttribute("src", "/images/maiprop-logo.webp");
    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toHaveTextContent("Save");
  });
});
