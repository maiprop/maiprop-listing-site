/**
 * Tests for dbListingToCard — the DB→UI mapping function.
 * Verifies field normalization, image handling, tag filtering,
 * and optional ownership/coordinate inclusion.
 */

import { describe, it, expect } from "vitest";
import { dbListingToCard } from "@/lib/listingUtils";

function makeDbListing(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "listing-1",
    title: "Test Apartment",
    address: "123 Main St",
    city: "Athens",
    price: "250000",
    price_per_sqm: "2500",
    sqm: "100",
    bedrooms: 3,
    bathrooms: 2,
    floor: 2,
    total_floors: 5,
    year_built: 2010,
    energy_class: "B",
    property_type: "apartment",
    listing_type: "sale",
    cover_image_url: "https://example.com/cover.jpg",
    listing_images: [{ url: "https://example.com/img1.jpg" }],
    tags: ["has_parking"],
    is_featured: false,
    priority_placement: 0,
    is_pre_sale: false,
    has_video_tour: false,
    has_virtual_tour: false,
    views_count: 42,
    ai_score: 85,
    profiles: null,
    ...overrides,
  };
}

describe("dbListingToCard — basic field mapping", () => {
  it("maps id, title, city correctly", () => {
    const card = dbListingToCard(makeDbListing());
    expect(card.id).toBe("listing-1");
    expect(card.title).toBe("Test Apartment");
    expect(card.city).toBe("Athens");
  });

  it("converts price string to number", () => {
    const card = dbListingToCard(makeDbListing({ price: "350000" }));
    expect(card.price).toBe(350000);
  });

  it("converts sqm string to number", () => {
    const card = dbListingToCard(makeDbListing({ sqm: "80" }));
    expect(card.sqm).toBe(80);
  });

  it("computes card price per sqm from price and size instead of stale stored values", () => {
    const card = dbListingToCard(makeDbListing({
      price: "315000",
      sqm: "102",
      price_per_sqm: "3000",
    }));

    expect(card.pricePerSqm).toBe(3088);
  });

  it("maps views_count to views", () => {
    const card = dbListingToCard(makeDbListing());
    expect(card.views).toBe(42);
  });

  it("maps ai_score to aiScore", () => {
    const card = dbListingToCard(makeDbListing());
    expect(card.aiScore).toBe(85);
  });

  it("maps isFeatured as boolean", () => {
    const card = dbListingToCard(makeDbListing({ is_featured: true }));
    expect(card.isFeatured).toBe(true);
  });

  it("maps energyClass from energy_class", () => {
    const card = dbListingToCard(makeDbListing({ energy_class: "A+" }));
    expect(card.energyClass).toBe("A+");
  });

  it("maps yearBuilt from year_built", () => {
    const card = dbListingToCard(makeDbListing({ year_built: 2015 }));
    expect(card.yearBuilt).toBe(2015);
  });

  it("maps new-build project unit summaries for compact project cards", () => {
    const card = dbListingToCard(
      makeDbListing({
        listing_type: "new_build",
        project: {
          delivery_date: "2026-10-01",
          project_units: [
            { id: "u1", availability_status: "available", internal_sqm: 39 },
            { id: "u2", availability_status: "reserved", internal_sqm: 42 },
            { id: "u3", availability_status: "sold", internal_sqm: 56 },
            { id: "u4", availability_status: "under_offer", internal_sqm: 49 },
          ],
        },
      }),
    );

    expect(card.newBuildUnitSizeMin).toBe(39);
    expect(card.newBuildUnitSizeMax).toBe(56);
    expect(card.newBuildUnitCount).toBe(4);
    expect(card.newBuildAvailableUnitCount).toBe(3);
    expect(card.newBuildDeliveryYear).toBe(2026);
  });

  it("falls back to city as address when address is null", () => {
    const card = dbListingToCard(makeDbListing({ address: null }));
    expect(card.address).toBe("Athens");
  });
});

describe("dbListingToCard — image handling", () => {
  it("includes cover image first", () => {
    const card = dbListingToCard(makeDbListing());
    expect(card.images[0]).toBe("https://example.com/cover.jpg");
  });

  it("appends listing_images after cover", () => {
    const card = dbListingToCard(makeDbListing());
    expect(card.images).toContain("https://example.com/img1.jpg");
  });

  it("works with no cover_image_url", () => {
    const card = dbListingToCard(makeDbListing({ cover_image_url: null }));
    expect(card.images[0]).toBe("https://example.com/img1.jpg");
  });

  it("works with no listing_images", () => {
    const card = dbListingToCard(makeDbListing({ listing_images: null }));
    expect(card.images).toEqual(["https://example.com/cover.jpg"]);
  });

  it("respects maxImages option", () => {
    const card = dbListingToCard(
      makeDbListing({ listing_images: [{ url: "a.jpg" }, { url: "b.jpg" }, { url: "c.jpg" }] }),
      { maxImages: 2 }
    );
    expect(card.images).toHaveLength(2);
  });

  it("prefers new-build project cover and project media before stale listing media", () => {
    const card = dbListingToCard(
      makeDbListing({
        listing_type: "new_build",
        cover_image_url: "https://example.com/stale-listing-cover.jpg",
        listing_images: [{ url: "https://example.com/listing-gallery.jpg" }],
        project: {
          cover_image_url: "https://example.com/project-cover.jpg",
          project_media: [
            { url: "https://example.com/floorplan.pdf", media_type: "pdf", sort_order: 1 },
            { url: "https://example.com/project-render.jpg", media_type: "image", sort_order: 2 },
          ],
        },
      }),
    );

    expect(card.images).toEqual([
      "https://example.com/project-cover.jpg",
      "https://example.com/stale-listing-cover.jpg",
      "https://example.com/listing-gallery.jpg",
      "https://example.com/project-render.jpg",
    ]);
  });
});

describe("dbListingToCard — agent/profiles", () => {
  it("maps profiles to agent field", () => {
    const card = dbListingToCard(
      makeDbListing({ profiles: { display_name: "John Doe", verified: true, avatar_url: "avatar.jpg" } })
    );
    expect(card.agent?.name).toBe("John Doe");
    expect(card.agent?.verified).toBe(true);
    expect(card.agent?.avatar).toBe("avatar.jpg");
  });

  it("defaults agent name to 'Owner' when display_name is absent", () => {
    const card = dbListingToCard(
      makeDbListing({ profiles: { display_name: null, verified: false, avatar_url: null } })
    );
    expect(card.agent?.name).toBe("Owner");
  });

  it("sets agent to undefined when profiles is null", () => {
    const card = dbListingToCard(makeDbListing({ profiles: null }));
    expect(card.agent).toBeUndefined();
  });
});

describe("dbListingToCard — ownership option", () => {
  it("does not include ownershipStatus by default", () => {
    const card = dbListingToCard(makeDbListing({ tags: ["ownership:full"] }));
    expect((card as unknown as Record<string, unknown>).ownershipStatus).toBeUndefined();
  });

  it("includes ownershipStatus when includeOwnership=true", () => {
    const card = dbListingToCard(
      makeDbListing({ tags: ["ownership:bare"] }),
      { includeOwnership: true }
    );
    expect((card as unknown as Record<string, unknown>).ownershipStatus).toBe("bare");
  });

  it("includes ownershipPercentage when includeOwnership=true", () => {
    const card = dbListingToCard(
      makeDbListing({ tags: ["ownership_pct:75"] }),
      { includeOwnership: true }
    );
    expect((card as unknown as Record<string, unknown>).ownershipPercentage).toBe(75);
  });
});

describe("dbListingToCard — coordinates option", () => {
  it("does not include coordinates by default", () => {
    const card = dbListingToCard(makeDbListing({ latitude: 37.98, longitude: 23.73 }));
    expect((card as unknown as Record<string, unknown>).latitude).toBeUndefined();
  });

  it("includes latitude/longitude when includeCoordinates=true", () => {
    const card = dbListingToCard(
      makeDbListing({ latitude: 37.98, longitude: 23.73 }),
      { includeCoordinates: true }
    );
    expect((card as unknown as Record<string, unknown>).latitude).toBe(37.98);
    expect((card as unknown as Record<string, unknown>).longitude).toBe(23.73);
  });
});

describe("dbListingToCard — tag filtering", () => {
  it("passes all tags through by default", () => {
    const card = dbListingToCard(makeDbListing({ tags: ["has_parking", "ownership:full"] }));
    expect(card.tags).toContain("ownership:full");
  });

  it("filters system tags when filterDisplayTags=true", () => {
    const card = dbListingToCard(
      makeDbListing({ tags: ["has_parking", "ownership:full", "round:2", "auction_pool:2026-06-04"] }),
      { filterDisplayTags: true }
    );
    expect(card.tags).not.toContain("ownership:full");
    expect(card.tags).not.toContain("round:2");
    expect(card.tags).not.toContain("auction_pool:2026-06-04");
    expect(card.tags).toContain("has_parking");
  });

  it("falls back to feature-derived tags when all tags are system tags", () => {
    const card = dbListingToCard(
      makeDbListing({ tags: ["ownership:full"], has_parking: true, has_pool: false }),
      { filterDisplayTags: true }
    );
    expect(card.tags).toContain("Parking");
  });
});

describe("dbListingToCard — raw option", () => {
  it("includes _raw when includeRaw=true", () => {
    const db = makeDbListing();
    const card = dbListingToCard(db, { includeRaw: true });
    expect((card as unknown as Record<string, unknown>)._raw).toBeDefined();
  });

  it("does not include _raw by default", () => {
    const card = dbListingToCard(makeDbListing());
    expect((card as unknown as Record<string, unknown>)._raw).toBeUndefined();
  });
});
