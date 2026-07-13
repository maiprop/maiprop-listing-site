import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { MapListing } from "@/components/map/mapConfig";

vi.mock("@/lib/config", () => ({
  getStreetViewProxyUrl: (params: { lat: number; lng: number } | { location: string }, size: string) => {
    const query = "lat" in params
      ? `lat=${params.lat}&lng=${params.lng}`
      : `location=${encodeURIComponent(params.location)}`;
    return `https://street.example/proxy?size=${size}&${query}`;
  },
}));

function makeListing(overrides: Partial<MapListing> = {}, rawOverrides: Record<string, unknown> = {}): MapListing {
  return {
    id: "listing-1",
    title: "Popup Home",
    price: 320_000,
    sqm: 80,
    latitude: 37.98,
    longitude: 23.72,
    images: ["https://cdn.example/home.jpg"],
    listingType: "sale",
    city: "Athens",
    _raw: {
      property_type: "apartment",
      tags: [],
      ...rawOverrides,
    },
    ...overrides,
  };
}

async function renderPopup(listing = makeListing()) {
  const { PropertyPopup } = await import("@/components/map/PropertyPopup");
  return renderWithProviders(<PropertyPopup listing={listing} onClose={vi.fn()} />);
}

afterEach(() => {
  vi.useRealTimers();
});

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

describe("PropertyPopup listing links and pricing", () => {
  it.each([
    ["sale", "/property/listing-1"],
    ["rent", "/property/listing-1"],
    ["open_house", "/open-house/listing-1"],
    ["new_build", "/new-build/listing-1"],
  ])("uses the canonical %s detail route", async (listingType, expectedHref) => {
    await renderPopup(makeListing({ listingType }));
    expect(screen.getByRole("link", { name: /View Property/i })).toHaveAttribute("href", expectedHref);
  });

  it("uses the auction route, starting bid, valuation copy, and auction CTA", async () => {
    await renderPopup(makeListing(
      { listingType: "auction", price: 125_000 },
      { property_type: "house", auction_starting_bid: 90_000, price: 125_000 },
    ));

    expect(screen.getByRole("link", { name: /View Auction/i })).toHaveAttribute("href", "/auction/listing-1");
    expect(screen.getByText("€90,000")).toBeInTheDocument();
    expect(screen.getByText(/val\. €125\.000/i)).toBeInTheDocument();
  });

  it.each([
    ["", "€320,000", false],
    [null, "€320,000", false],
    [0, "€0", true],
  ])("handles auction bid %j without losing a legitimate zero", async (bid, expectedPrice, showsValuation) => {
    await renderPopup(makeListing(
      { listingType: "auction" },
      { property_type: "apartment", auction_starting_bid: bid, price: 320_000 },
    ));
    expect(screen.getByText(expectedPrice)).toBeInTheDocument();
    expect(Boolean(screen.queryByText(/val\./i))).toBe(showsValuation);
  });
});

describe("PropertyPopup auction countdown", () => {
  it.each([
    [null, null],
    ["2026-07-13T12:00:00.000Z", "Today!"],
    ["2026-07-14T12:00:00.000Z", "Tomorrow"],
    ["2026-07-17T12:00:00.000Z", "4d left"],
  ])("renders auction date %j as %j", async (auctionDate, expectedText) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    await renderPopup(makeListing(
      { listingType: "auction" },
      { property_type: "apartment", auction_date: auctionDate },
    ));

    if (expectedText) expect(screen.getByText(expectedText)).toBeInTheDocument();
    else {
      expect(screen.queryByText("Today!")).not.toBeInTheDocument();
      expect(screen.queryByText(/left$/)).not.toBeInTheDocument();
    }
  });

  it("uses urgent styling for three days and calmer styling after that", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-13T12:00:00.000Z"));
    const urgent = await renderPopup(makeListing(
      { listingType: "auction" },
      { auction_date: "2026-07-16T12:00:00.000Z" },
    ));
    expect(screen.getByText("3d left")).toHaveStyle({ background: "rgba(239,68,68,0.9)" });
    urgent.unmount();

    await renderPopup(makeListing(
      { listingType: "auction" },
      { auction_date: "2026-07-18T12:00:00.000Z" },
    ));
    expect(screen.getByText("5d left")).toHaveStyle({ background: "rgba(245,197,24,0.9)" });
  });
});

describe("PropertyPopup listing metadata", () => {
  it.each([
    [{ property_type: "apartment", tags: [] }, "Apartment"],
    [{ property_type: "multi_family_home", tags: [] }, "Multi Family Home"],
    [{ property_type: null, tags: ["land_type:plot_with_building"] }, "Plot w/ Building"],
    [{ property_type: "land", tags: ["land_type:unknown"] }, "Land"],
    [{ property_type: null, tags: ["commercial_type:store"] }, "Store"],
    [{ property_type: "commercial", tags: ["commercial_type:unknown"] }, "Commercial"],
  ])("derives the visible property type from raw metadata %#", async (raw, expectedLabel) => {
    await renderPopup(makeListing({}, raw));
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
  });

  it("omits empty type and pill rows when source metadata is not displayable", async () => {
    await renderPopup(makeListing(
      { sqm: 1 },
      { property_type: null, tags: [42, null], floor: "not-a-floor", year_built: null },
    ));

    expect(screen.queryByText("Apartment")).not.toBeInTheDocument();
    expect(screen.queryByText(/m²/)).not.toBeInTheDocument();
    expect(screen.queryByText(/fl\./)).not.toBeInTheDocument();
  });

  it.each([
    [-1, "Basement"],
    [0, "Ground"],
    [1, "1st fl."],
    [2, "2nd fl."],
    [3, "3rd fl."],
    [4, "4th fl."],
  ])("formats floor %s as %s", async (floor, expectedLabel) => {
    await renderPopup(makeListing({}, { property_type: "apartment", floor, year_built: 2008 }));
    expect(screen.getByText(expectedLabel)).toBeInTheDocument();
    expect(screen.getByText("80 m²")).toBeInTheDocument();
    expect(screen.getByText("2008")).toBeInTheDocument();
  });

  it("accepts numeric floor strings but drops empty floor strings", async () => {
    const numeric = await renderPopup(makeListing({}, { property_type: "apartment", floor: "5" }));
    expect(screen.getByText("5th fl.")).toBeInTheDocument();
    numeric.unmount();

    await renderPopup(makeListing({}, { property_type: "apartment", floor: "" }));
    expect(screen.queryByText(/fl\.$/)).not.toBeInTheDocument();
  });
});

describe("PropertyPopup ownership disclosure", () => {
  it.each([
    [["ownership:full", "ownership_pct:55"], "Πλήρης", false],
    [["ownership:partial", "ownership_pct:33"], "Μερική 33%", true],
    [["ownership:common"], "Εξ αδιαιρέτου", false],
    [["ownership:none", "ownership_pct:0"], "Χωρίς κυριότητα 0%", true],
  ])("renders ownership tags %j", async (tags, expectedText, hasPercent) => {
    await renderPopup(makeListing({}, { property_type: "apartment", tags }));
    expect(screen.getByText(expectedText)).toBeInTheDocument();
    expect(screen.getByText(expectedText).textContent?.includes("%")).toBe(hasPercent);
  });

  it("omits unsupported, missing, and non-array ownership metadata", async () => {
    const unsupported = await renderPopup(makeListing({}, { tags: ["ownership:usufruct"] }));
    expect(screen.queryByText(/Πλήρης|Μερική|Εξ αδιαιρέτου|Χωρίς κυριότητα/)).not.toBeInTheDocument();
    unsupported.unmount();

    const missing = await renderPopup(makeListing({}, { tags: [] }));
    expect(screen.queryByText(/Πλήρης|Μερική|Εξ αδιαιρέτου|Χωρίς κυριότητα/)).not.toBeInTheDocument();
    missing.unmount();

    await renderPopup(makeListing({}, { tags: "ownership:full" }));
    expect(screen.queryByText("Πλήρης")).not.toBeInTheDocument();
  });
});

describe("PropertyPopup image fallbacks", () => {
  it("uses address-based Street View when coordinates are unavailable", async () => {
    await renderPopup(makeListing(
      { latitude: null, longitude: null, images: [] },
      { address: "Ermou 10", region: "Attica", property_type: "apartment" },
    ));
    expect(screen.getByAltText("Popup Home")).toHaveAttribute(
      "src",
      "https://street.example/proxy?size=400x200&location=Ermou%2010%2C%20Athens%2C%20Attica%2C%20Greece",
    );
  });

  it("uses the MaiProp logo presentation when no image location or fallback exists", async () => {
    await renderPopup(makeListing(
      { latitude: null, longitude: null, images: [], city: "" },
      { property_type: "apartment", address: null, region: null, listing_images: [] },
    ));
    const image = screen.getByAltText("Popup Home");
    expect(image).toHaveAttribute("src", expect.stringContaining("/images/maiprop-logo.webp"));
    expect(image).toHaveClass("object-contain", "p-6", "bg-background");
    expect(image).toHaveAttribute("data-image-fallback-index", "0");
    fireEvent.load(image);
  });
});
