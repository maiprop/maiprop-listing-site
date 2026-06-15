import { describe, it, expect } from "vitest";
import { getRenderedListings, mapListingFromCard } from "@/lib/listingsPerformance";
import { getAutoListingGridColumns, getVirtualWindow } from "@/lib/virtualizedGrid";
import type { ListingCardWithRaw } from "@/lib/listingsCardUtils";

const makeListing = (overrides: Partial<ListingCardWithRaw> = {}): ListingCardWithRaw => ({
  id: "listing-1",
  title: "Athens apartment",
  address: "Kolonaki 12",
  city: "Athens",
  price: 350_000,
  pricePerSqm: 3684,
  bedrooms: 2,
  bathrooms: 1,
  sqm: 95,
  images: ["https://example.com/1.jpg", "https://example.com/2.jpg"],
  type: "apartment",
  listingType: "sale",
  latitude: 37.98,
  longitude: 23.73,
  tags: ["featured", "ownership:full"],
  floor: 3,
  yearBuilt: 2008,
  _raw: {
    created_at: "2026-05-01T00:00:00Z",
    has_video_tour: true,
    has_virtual_tour: false,
    ai_score: 82,
    walkability_score: 77,
  },
  ...overrides,
});

describe("Listings performance helpers", () => {
  it("bounds the rendered listing window without mutating the source list", () => {
    const listings = Array.from({ length: 80 }, (_, index) => makeListing({ id: `listing-${index}` }));
    const rendered = getRenderedListings(listings, 48);

    expect(rendered).toHaveLength(48);
    expect(rendered[0]).toBe(listings[0]);
    expect(rendered.at(-1)).toBe(listings[47]);
    expect(listings).toHaveLength(80);
  });

  it("computes responsive listing-grid columns for virtualization", () => {
    expect(getAutoListingGridColumns(390)).toBe(1);
    expect(getAutoListingGridColumns(640)).toBe(2);
    expect(getAutoListingGridColumns(760)).toBe(3);
    expect(getAutoListingGridColumns(1100)).toBe(4);
    expect(getAutoListingGridColumns(1440)).toBe(5);
    expect(getAutoListingGridColumns(1700)).toBe(6);
  });

  it("windows large listing collections by visible rows plus overscan", () => {
    const window = getVirtualWindow(1_000, 4, 860, 900, 430, 2);

    expect(window.startIndex).toBe(0);
    expect(window.endIndex).toBe(28);
    expect(window.totalRows).toBe(250);
  });

  it("projects card listings into a lightweight map payload", () => {
    const listing = makeListing();
    const mapListing = mapListingFromCard(listing);

    expect(mapListing).toMatchObject({
      id: "listing-1",
      title: "Athens apartment",
      price: 350_000,
      sqm: 95,
      city: "Athens",
      latitude: 37.98,
      longitude: 23.73,
      listingType: "sale",
    });
    expect(mapListing.images).toEqual(["https://example.com/1.jpg"]);
    expect(mapListing._raw).toMatchObject({
      price_per_sqm: 3684,
      property_type: "apartment",
      tags: ["featured", "ownership:full"],
      floor: 3,
      year_built: 2008,
    });
    expect(mapListing._raw).not.toHaveProperty("created_at");
    expect(mapListing._raw).not.toHaveProperty("has_video_tour");
    expect(mapListing._raw).not.toHaveProperty("ai_score");
  });
});
