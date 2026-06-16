import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
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

    renderWithProviders(<PropertyCard property={baseProperty({ listingType: "new_build" })} />);
    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.share" }));

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("https://maiprop.test/new-build/p1");
    });
    expect(toastSuccess).toHaveBeenCalledWith("propertyCard.linkCopied");
  });

  it("keeps sale listings with a construction condition on the property route", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: writeTextMock } });
    const { PropertyCard } = await import("@/components/PropertyCard");

    const { container } = renderWithProviders(
      <PropertyCard
        property={baseProperty({
          constructionStatus: "renovated",
          isPreSale: false,
          listingType: "sale",
        })}
      />,
    );

    expect(container.querySelector('a[href="/property/p1"]')).toBeTruthy();
    expect(container.querySelector('a[href="/new-build/p1"]')).toBeNull();
    expect(screen.queryByText("propertyCard.badges.newBuild")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.share" }));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("https://maiprop.test/property/p1");
    });
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

  it("covers open-house countdowns, universal specs, and image error fallback", async () => {
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
    expect(screen.queryByText(/propertyCard.ownership.partial 50%/)).not.toBeInTheDocument();
    expect(screen.queryByText("propertyCard.privateSeller")).not.toBeInTheDocument();
    expect(screen.queryByText("Z")).not.toBeInTheDocument();
    expect(screen.queryByText(/^25$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^80$/)).not.toBeInTheDocument();
    expect(screen.getByText("360°")).toBeInTheDocument();

    const image = screen.getByAltText("Athens Loft") as HTMLImageElement;
    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
    expect(image.style.objectFit).toBe("contain");
  });

  it("keeps rental open houses on the open-house route while showing monthly rent pricing", async () => {
    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: writeTextMock } });
    const { PropertyCard } = await import("@/components/PropertyCard");

    const { container } = renderWithProviders(
      <PropertyCard
        property={baseProperty({
          listingType: "open_house",
          openHouseTransactionType: "rent",
          price: 1800,
        })}
      />,
    );

    expect(container.querySelector('a[href="/open-house/p1"]')).toBeTruthy();
    expect(screen.getAllByText(/€1[.,]800\/mo/).length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.share" }));
    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalledWith("https://maiprop.test/open-house/p1");
    });
  });

  it("renders only universal card specs so property types stay the same size", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");

    renderWithProviders(
      <PropertyCard
        property={baseProperty({
          bedrooms: 4,
          bathrooms: 3,
          sqm: 280,
          floor: 2,
          totalFloors: 4,
          yearBuilt: 2026,
          energyClass: "A",
          walkabilityScore: 75,
          safetyScore: 75,
          ownershipStatus: "full",
          tags: ["Pool", "Garden", "Parking", "exclusive"],
        })}
      />,
    );

    expect(screen.getByText("280 common.sqm")).toBeInTheDocument();
    expect(screen.getByText("2propertyCard.floor/4")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();

    expect(screen.queryByText(/common.bed/)).not.toBeInTheDocument();
    expect(screen.queryByText(/common.bath/)).not.toBeInTheDocument();
    expect(screen.queryByText("A")).not.toBeInTheDocument();
    expect(screen.queryByText("75")).not.toBeInTheDocument();
    expect(screen.queryByText("propertyCard.ownership.full")).not.toBeInTheDocument();
    expect(screen.queryByText("Pool")).not.toBeInTheDocument();
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
    expect(screen.queryByText("Parking")).not.toBeInTheDocument();
    expect(screen.queryByText("exclusive")).not.toBeInTheDocument();
  });

  it("uses fixed compact layout slots so long and short cards keep the same frame", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    const { rerender } = renderWithProviders(
      <PropertyCard
        property={baseProperty({
          title: "Short title",
          address: "Short street",
          city: "Athens",
          sqm: 39,
          floor: 1,
          totalFloors: 4,
          yearBuilt: 2026,
        })}
      />,
    );

    const card = screen.getByTestId("property-card");
    expect(card).toHaveClass("h-[332px]");
    expect(screen.getByTestId("property-card-media")).toHaveClass("h-[132px]");
    expect(screen.getByTestId("property-card-body")).toHaveClass("grid");
    expect(screen.getByTestId("property-card-specs")).toHaveClass("grid", "h-[1.5rem]", "overflow-hidden");
    expect(screen.getByTestId("property-card-footer")).toHaveClass("min-h-[2.5rem]");

    rerender(
      <PropertyCard
        property={baseProperty({
          title: "Boutique Hotel with an intentionally long title that should not push the card taller",
          address: "A very long address that should be truncated inside its fixed location slot",
          city: "Santorini",
          sqm: 540,
          floor: 0,
          totalFloors: 2,
          yearBuilt: 2004,
          bedrooms: 14,
          bathrooms: 12,
          tags: ["Pool", "Garden", "Parking", "Sea view"],
        })}
      />,
    );

    expect(screen.getByTestId("property-card")).toHaveClass("h-[332px]");
    const specs = within(screen.getByTestId("property-card-specs"));
    expect(specs.getByText("540 common.sqm")).toBeInTheDocument();
    expect(specs.getByText("propertyCard.groundFloor/2")).toBeInTheDocument();
    expect(specs.getByText("2004")).toBeInTheDocument();
    expect(screen.queryByText("Pool")).not.toBeInTheDocument();
    expect(screen.queryByText("Garden")).not.toBeInTheDocument();
    expect(screen.queryByText("Parking")).not.toBeInTheDocument();
  });

  it("uses project-specific compact specs for new-build cards", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");

    renderWithProviders(
      <PropertyCard
        property={baseProperty({
          listingType: "new_build",
          sqm: 39,
          floor: 0,
          totalFloors: 4,
          yearBuilt: 2026,
          newBuildUnitSizeMin: 39,
          newBuildUnitSizeMax: 56,
          newBuildUnitCount: 4,
          newBuildAvailableUnitCount: 3,
          newBuildDeliveryYear: 2026,
        })}
      />,
    );

    expect(screen.getByText("39-56 common.sqm")).toBeInTheDocument();
    expect(screen.getByText("3/4 units")).toBeInTheDocument();
    expect(screen.getByText("2026")).toBeInTheDocument();
    expect(screen.queryByText("propertyCard.groundFloor/4")).not.toBeInTheDocument();
  });

  it("falls back from auction Street View to cover imagery before the logo", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");

    renderWithProviders(
      <PropertyCard
        property={baseProperty({
          listingType: "auction",
          images: [
            "https://street.example/auction.jpg",
            "https://cdn.example/auction-cover.jpg",
          ],
        })}
      />,
    );

    const image = screen.getByAltText("Athens Loft") as HTMLImageElement;
    expect(image.src).toBe("https://street.example/auction.jpg");

    fireEvent.error(image);
    expect(image.src).toBe("https://cdn.example/auction-cover.jpg");
    expect(image.style.objectFit).toBe("cover");

    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
    expect(image.style.objectFit).toBe("contain");
  });

  it("uses public Supabase object URLs directly instead of 403-prone transform srcsets", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    const supabaseImage =
      "https://qvvicunqcrwpioqnvzxf.supabase.co/storage/v1/object/public/listing-images/user/photo.webp";

    renderWithProviders(<PropertyCard property={baseProperty({ images: [supabaseImage] })} />);

    const image = screen.getByAltText("Athens Loft") as HTMLImageElement;
    expect(image).toHaveAttribute("src", supabaseImage);
    expect(image).not.toHaveAttribute("srcset");
  });

  it("can prioritize above-the-fold card images without enabling Supabase transform srcsets", async () => {
    const { PropertyCard } = await import("@/components/PropertyCard");
    const supabaseImage =
      "https://qvvicunqcrwpioqnvzxf.supabase.co/storage/v1/object/public/listing-images/user/hero.webp";

    renderWithProviders(<PropertyCard property={baseProperty({ images: [supabaseImage] })} imagePriority />);

    const image = screen.getByAltText("Athens Loft") as HTMLImageElement;
    expect(image).toHaveAttribute("src", supabaseImage);
    expect(image).not.toHaveAttribute("srcset");
    expect(image).toHaveAttribute("loading", "eager");
    expect(image).not.toHaveAttribute("fetchpriority");
    expect(image).toHaveAttribute("decoding", "async");
  });

  it("renders remaining badges, non-urgent timers, price deltas, universal specs, and report errors", async () => {
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
    expect(screen.queryByText("propertyCard.ownership.full")).not.toBeInTheDocument();
    expect(screen.queryByText(/^50$/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^20$/)).not.toBeInTheDocument();
    expect(screen.getByText("Agent One")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "propertyCard.actions.report" }));
    await waitFor(() => expect(toastError).toHaveBeenCalledWith("propertyCard.errorReport"));

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

    expect(screen.queryByText("propertyCard.badges.newBuild")).not.toBeInTheDocument();
    expect(screen.getByText("propertyCard.badges.new")).toBeInTheDocument();
    expect(screen.getByText("+7%")).toBeInTheDocument();
    expect(screen.getByText("3propertyCard.floor/6")).toBeInTheDocument();
    expect(screen.queryByText(/leasehold 40%/)).not.toBeInTheDocument();
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
    expect(screen.queryByText("Sea view")).not.toBeInTheDocument();
    expect(screen.queryByText("Renovated")).not.toBeInTheDocument();
    expect(screen.queryByText("Top floor")).not.toBeInTheDocument();
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
    expect(screen.getByText("100 common.sqm")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
  });
});
