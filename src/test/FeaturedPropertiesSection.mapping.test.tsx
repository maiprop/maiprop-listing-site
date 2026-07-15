import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { FeaturedPropertiesSection } from "@/components/index/FeaturedPropertiesSection";

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

vi.mock("@/components/PropertyCardSkeleton", () => ({
  PropertyCardSkeleton: () => <div data-testid="property-card-skeleton" />,
}));

vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: {
    title: string;
    listingType: string;
    isPreSale?: boolean;
    images: string[];
    newBuildUnitSizeMin?: number;
    newBuildUnitSizeMax?: number;
    newBuildUnitCount?: number;
    newBuildAvailableUnitCount?: number;
    newBuildDeliveryYear?: number;
    isFeatured?: boolean;
    hasVideo?: boolean;
    hasVirtualTour?: boolean;
    views?: number;
    agent?: { name: string };
  } }) => (
    <article
      data-testid="featured-property"
      data-listing-type={property.listingType}
      data-is-pre-sale={String(Boolean(property.isPreSale))}
      data-is-featured={String(Boolean(property.isFeatured))}
      data-has-video={String(Boolean(property.hasVideo))}
      data-has-virtual-tour={String(Boolean(property.hasVirtualTour))}
      data-image={property.images[0] ?? ""}
      data-views={property.views ?? ""}
      data-agent={property.agent?.name ?? ""}
      data-unit-size-min={property.newBuildUnitSizeMin ?? ""}
      data-unit-size-max={property.newBuildUnitSizeMax ?? ""}
      data-unit-count={property.newBuildUnitCount ?? ""}
      data-available-unit-count={property.newBuildAvailableUnitCount ?? ""}
      data-delivery-year={property.newBuildDeliveryYear ?? ""}
    >
      {property.title}
    </article>
  ),
}));

describe("FeaturedPropertiesSection mapping", () => {
  it("treats orphaned stale new-build rows as standalone sale cards", () => {
    render(
      <MemoryRouter>
        <FeaturedPropertiesSection
          isLoading={false}
          isError={false}
          listings={[
            {
              id: "0308050d-8d62-4fc8-b421-7c74116343b3",
              title: "Glifada Loft",
              address: "11 Dimarchou Angelou Metaxa",
              city: "Glyfada",
              price: 275000,
              price_per_sqm: 7051,
              sqm: 39,
              property_type: "apartment",
              listing_type: "new_build",
              project_id: null,
              is_featured: true,
              has_video_tour: true,
              has_virtual_tour: true,
              views_count: 110,
              profiles: {
                user_id: "owner-1",
                display_name: "K R",
                avatar_url: null,
                role: "agent",
              },
              cover_image_url: "https://cdn.test/glifada-cover.webp",
              listing_images: [{ url: "https://cdn.test/glifada-gallery.webp", sort_order: 1 }],
            },
          ]}
        />
      </MemoryRouter>,
    );

    const card = screen.getByTestId("featured-property");
    expect(card).toHaveAttribute("data-listing-type", "sale");
    expect(card).toHaveAttribute("data-is-pre-sale", "false");
    expect(card).toHaveAttribute("data-is-featured", "false");
    expect(card).toHaveAttribute("data-has-video", "true");
    expect(card).toHaveAttribute("data-has-virtual-tour", "true");
    expect(card).toHaveAttribute("data-views", "110");
    expect(card).toHaveAttribute("data-agent", "K R");
    expect(card).toHaveAttribute("data-image", "https://cdn.test/glifada-cover.webp");
  });

  it("maps project inventory and delivery data into new-build cards", () => {
    render(
      <MemoryRouter>
        <FeaturedPropertiesSection
          isLoading={false}
          isError={false}
          listings={[
            {
              id: "project-listing-1",
              title: "Glifada GV",
              address: "11 Dimarchou Angelou Metaxa",
              city: "Glyfada",
              price: 275000,
              price_per_sqm: 7051,
              sqm: 39,
              property_type: "apartment",
              listing_type: "new_build",
              project_id: "project-1",
              cover_image_url: "https://cdn.test/new-cover.webp",
              project: {
                delivery_date: "2026-11-01",
                project_units: [
                  { id: "u1", availability_status: "available", internal_sqm: 39 },
                  { id: "u2", availability_status: "reserved", internal_sqm: 42 },
                  { id: "u3", availability_status: "sold", internal_sqm: 56 },
                  { id: "u4", availability_status: "under_offer", internal_sqm: 49 },
                ],
              },
            },
          ]}
        />
      </MemoryRouter>,
    );

    const card = screen.getByTestId("featured-property");
    expect(card).toHaveAttribute("data-listing-type", "new_build");
    expect(card).toHaveAttribute("data-is-pre-sale", "true");
    expect(card).toHaveAttribute("data-image", "https://cdn.test/new-cover.webp");
    expect(card).toHaveAttribute("data-unit-size-min", "39");
    expect(card).toHaveAttribute("data-unit-size-max", "56");
    expect(card).toHaveAttribute("data-unit-count", "4");
    expect(card).toHaveAttribute("data-available-unit-count", "3");
    expect(card).toHaveAttribute("data-delivery-year", "2026");
  });
});
