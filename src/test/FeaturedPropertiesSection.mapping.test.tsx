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
  PropertyCard: ({ property }: { property: { title: string; listingType: string; isPreSale?: boolean; images: string[] } }) => (
    <article
      data-testid="featured-property"
      data-listing-type={property.listingType}
      data-is-pre-sale={String(Boolean(property.isPreSale))}
      data-image={property.images[0] ?? ""}
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
    expect(card).toHaveAttribute("data-image", "https://cdn.test/glifada-cover.webp");
  });
});
