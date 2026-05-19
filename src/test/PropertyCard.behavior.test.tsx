import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { Property } from "@/components/PropertyCard";

const navigateMock = vi.fn();
const toastSuccess = vi.fn();
const toastError = vi.fn();
const authMock = vi.fn();
const isFavoritedMock = vi.fn();
const toggleFavoriteMock = vi.fn();
const insertMock = vi.fn();
const fromMock = vi.fn(() => ({ insert: insertMock }));

vi.mock("react-router-dom", async () => {
  const actual = await vi.importActual<typeof import("react-router-dom")>("react-router-dom");
  return { ...actual, useNavigate: () => navigateMock };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authMock(),
}));

vi.mock("@/hooks/useFavorites", () => ({
  useIsFavorited: () => isFavoritedMock(),
  useToggleFavorite: () => ({ mutate: toggleFavoriteMock }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: fromMock },
}));

vi.mock("sonner", () => ({
  toast: { success: toastSuccess, error: toastError },
}));

vi.mock("@/lib/config", () => ({
  APP_ORIGIN: "https://maiprop.test",
}));

const baseProperty = (overrides: Partial<Property> = {}): Property => ({
  id: "p1",
  title: "Athens Loft",
  address: "Ermou 10",
  city: "Athens",
  price: 250000,
  pricePerSqm: 2500,
  bedrooms: 2,
  bathrooms: 1,
  sqm: 100,
  images: [],
  type: "apartment",
  listingType: "sale",
  ...overrides,
});

describe("PropertyCard behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authMock.mockReturnValue({ user: null, profile: null, loading: false });
    isFavoritedMock.mockReturnValue({ data: false });
    insertMock.mockResolvedValue({ error: null });
    Object.defineProperty(navigator, "share", { configurable: true, value: undefined });
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
    });
  });

  it("routes favorite clicks from guests to login and toggles saved state for signed-in users", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    const property = baseProperty();

    const { unmount } = renderWithProviders(<PropertyCard property={property} />);
    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.save" }));
    expect(navigateMock).toHaveBeenCalledWith("/login");

    unmount();
    authMock.mockReturnValue({ user: { id: "u1" }, profile: null, loading: false });
    isFavoritedMock.mockReturnValue({ data: true });
    renderWithProviders(<PropertyCard property={property} />);
    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.unsave" }));
    expect(toggleFavoriteMock).toHaveBeenCalledWith({ listing_id: "p1", isFavorited: true });
  });

  it("falls back from Web Share API to clipboard when sharing fails", async () => {
    const shareMock = vi.fn().mockRejectedValue(new Error("cancelled"));
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "share", { configurable: true, value: shareMock });
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: writeTextMock } });
    const { PropertyCard } = await import("@/components/PropertyCard");

    renderWithProviders(<PropertyCard property={baseProperty({ isPreSale: true })} />);
    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.share" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("https://maiprop.test/new-build/p1");
    });
    expect(toastSuccess).toHaveBeenCalledWith("propertyCard.linkCopied");
  });

  it("reports signed-in listings and uses the firesale entity type", async () => {
    authMock.mockReturnValue({ user: { id: "reporter-1" }, profile: null, loading: false });
    const { PropertyCard } = await import("@/components/PropertyCard");

    renderWithProviders(<PropertyCard property={baseProperty({ listingType: "firesale" })} />);
    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.report" }));

    await waitFor(() => {
      expect(insertMock).toHaveBeenCalledWith({
        entity_type: "firesale_request",
        entity_id: "p1",
        reporter_id: "reporter-1",
      });
    });
    expect(toastSuccess).toHaveBeenCalledWith("propertyCard.reportSubmitted");
  });

  it("covers open-house countdowns, floor labels, ownership, scores, and image error fallback", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    const soon = new Date(Date.now() + 90 * 60_000).toISOString();

    renderWithProviders(
      <PropertyCard
        property={baseProperty({
          listingType: "open_house",
          auctionDate: "May 20, 2026",
          openHouseDateIso: soon,
          images: ["https://example.test/photo.jpg"],
          floor: 0,
          totalFloors: 5,
          yearBuilt: 1998,
          energyClass: "Z",
          walkabilityScore: 25,
          safetyScore: 80,
          ownershipStatus: "partial",
          ownershipPercentage: 50,
          ownerParticipantType: "seller",
          hasVideo: true,
          hasVirtualTour: true,
        })}
      />,
    );

    expect(screen.getByText(/1h (2[89]|30)m/)).toBeInTheDocument();
    expect(screen.getByText("propertyCard.groundFloor/5")).toBeInTheDocument();
    expect(screen.getByText(/propertyCard.ownership.partial 50%/)).toBeInTheDocument();
    expect(screen.getByText("propertyCard.privateSeller")).toBeInTheDocument();
    expect(screen.getByText("Z")).toBeInTheDocument();
    expect(screen.getByText("360°")).toBeInTheDocument();

    const image = screen.getByAltText("Athens Loft") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
    expect(image.style.objectFit).toBe("contain");
  });

  it("renders remaining badges, non-urgent timers, price deltas, score tiers, and report errors", async () => {
    authMock.mockReturnValue({ user: { id: "u-error" }, profile: null, loading: false });
    insertMock.mockResolvedValueOnce({ error: new Error("duplicate") });
    const { PropertyCard } = await import("@/components/PropertyCard");
    const later = new Date(Date.now() + 8 * 60 * 60_000).toISOString();

    const { rerender } = renderWithProviders(
      <PropertyCard
        property={baseProperty({
          listingType: "open_house",
          openHouseDateIso: later,
          isFeatured: true,
          priceChange: -4,
          views: 42,
          floor: -1,
          walkabilityScore: 50,
          safetyScore: 20,
          ownershipStatus: "full",
          ownershipPercentage: 100,
          agent: { name: "Agent One", verified: false },
        })}
      />,
    );

    expect(screen.getByText(/8h|7h/)).toBeInTheDocument();
    expect(screen.getByText("propertyCard.badges.featured")).toBeInTheDocument();
    expect(screen.getByText("-4%")).toBeInTheDocument();
    expect(screen.getByText("42")).toBeInTheDocument();
    expect(screen.getByText("propertyCard.basement")).toBeInTheDocument();
    expect(screen.getByText("propertyCard.ownership.full")).toBeInTheDocument();
    expect(screen.getByText("Agent One")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.report" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("propertyCard.copyFailed"));

    rerender(
      <PropertyCard
        property={baseProperty({
          listingType: "sale",
          isNew: true,
          isPremium: true,
          constructionStatus: "under_construction",
          priceChange: 7,
          floor: 3,
          totalFloors: 6,
          ownershipStatus: "leasehold",
          ownershipPercentage: 40,
          walkabilityScore: 75,
          safetyScore: 45,
          bedrooms: undefined,
          bathrooms: undefined,
        })}
      />,
    );

    expect(screen.getByText("propertyCard.badges.newBuild")).toBeInTheDocument();
    expect(screen.getByText("+7%")).toBeInTheDocument();
    expect(screen.getByText("3propertyCard.floor/6")).toBeInTheDocument();
    expect(screen.getByText(/leasehold 40%/)).toBeInTheDocument();
    expect(screen.queryByText(/common.bed/)).not.toBeInTheDocument();
  });

  it("covers auction/rent/compact branches, tag filtering, clipboard failures, and guest reports", async () => {
    const writeTextMock = vi.fn().mockRejectedValue(new Error("denied"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: writeTextMock } });
    const { PropertyCard } = await import("@/components/PropertyCard");

    const { rerender } = renderWithProviders(
      <PropertyCard
        property={baseProperty({
          listingType: "auction",
          auctionDate: "June 10, 2026",
          auctionStartingBid: 180000,
          price: 300000,
          images: [],
          tags: ["Sea view", "source:sync", "posted internal", "Renovated", "ownership:partial", "Top floor"],
          agent: { name: "Verified Agent", verified: true },
        })}
      />,
    );

    expect(screen.getByText("propertyCard.badges.auction")).toBeInTheDocument();
    expect(screen.getByText("-40% off")).toBeInTheDocument();
    expect(screen.getByText("From €180,000")).toBeInTheDocument();
    expect(screen.getByText("Sea view")).toBeInTheDocument();
    expect(screen.getByText("Renovated")).toBeInTheDocument();
    expect(screen.getByText("Top floor")).toBeInTheDocument();
    expect(screen.queryByText("source:sync")).not.toBeInTheDocument();
    expect(screen.getByText("propertyCard.badges.verified")).toBeInTheDocument();
    expect(screen.getByAltText("Athens Loft")).toHaveAttribute("src", "/images/maiprop-logo.webp");

    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.share" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("propertyCard.copyFailed"));

    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.report" }));
    expect(toastError).toHaveBeenCalledWith("propertyCard.signInToReport");
    expect(navigateMock).toHaveBeenCalledWith("/login");

    rerender(<PropertyCard property={baseProperty({ listingType: "rent", price: 1200 })} compact />);
    expect(screen.getByText("€1.200/mo")).toBeInTheDocument();

    rerender(<PropertyCard property={baseProperty({ images: ["https://example.test/thumb.jpg"], bedrooms: 0 })} compact />);
    expect(screen.getByAltText("Athens Loft")).toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument();
  });
});
