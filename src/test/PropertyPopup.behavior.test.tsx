import { describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";

vi.mock("@/lib/config", () => ({
  getStreetViewProxyUrl: (params: { lat: number; lng: number } | { location: string }, size: string) => {
    const query = "lat" in params
      ? `lat=${params.lat}&lng=${params.lng}`
      : `location=${encodeURIComponent(params.location)}`;
    return `https://street.example/proxy?size=${size}&${query}`;
  },
}));

describe("PropertyPopup auction imagery", () => {
  it("shows Street View before cover and listing images, then falls back through the chain", async () => {
    const { PropertyPopup } = await import("@/components/map/PropertyPopup");

    renderWithProviders(
      <PropertyPopup
        listing={{
          id: "auction-1",
          title: "Auction Popup",
          price: 120000,
          sqm: 80,
          latitude: 37.98,
          longitude: 23.72,
          images: ["https://cdn.example/listing-image.jpg"],
          listingType: "auction",
          city: "Athens",
          _raw: {
            address: "Ermou 10",
            auction_starting_bid: 90000,
            auction_date: new Date(Date.now() + 86_400_000).toISOString(),
            cover_image_url: "https://cdn.example/cover.jpg",
            price: 120000,
            property_type: "apartment",
            tags: [],
          },
        }}
        onClose={vi.fn()}
      />,
    );

    const image = screen.getByAltText("Auction Popup") as HTMLImageElement;
    expect(image.src).toBe("https://street.example/proxy?size=400x200&lat=37.98&lng=23.72");

    fireEvent.error(image);
    expect(image.src).toBe("https://cdn.example/cover.jpg");

    fireEvent.error(image);
    expect(image.src).toBe("https://cdn.example/listing-image.jpg");

    fireEvent.error(image);
    expect(image.src).toContain("/images/maiprop-logo.webp");
  });

  it("uses the canonical new-build route for new-build map pins", async () => {
    const { PropertyPopup } = await import("@/components/map/PropertyPopup");

    renderWithProviders(
      <PropertyPopup
        listing={{
          id: "new-build-1",
          title: "New Build Popup",
          price: 420000,
          sqm: 95,
          latitude: 37.98,
          longitude: 23.72,
          images: [],
          listingType: "new_build",
          city: "Athens",
          _raw: { property_type: "apartment", tags: [] },
        }}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByRole("link", { name: /view property/i })).toHaveAttribute("href", "/new-build/new-build-1");
  });
});
