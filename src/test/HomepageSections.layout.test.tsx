import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { HomepageListing } from "@/lib/homepageListings";

const fetchPublicApiMock = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => fetchPublicApiMock(...args),
  isPublicApiAbort: () => false,
}));

vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: { title: string } }) => (
    <article data-testid="featured-property-card">{property.title}</article>
  ),
}));

const listing = (index: number): HomepageListing => ({
  id: `featured-${index}`,
  title: `Spotlight ${index}`,
  address: `Address ${index}`,
  city: "Athens",
  price: 200_000 + index,
  sqm: 80,
  property_type: "apartment",
  listing_type: "sale",
  tags: [],
});

describe("homepage section layout contracts", () => {
  beforeEach(() => {
    fetchPublicApiMock.mockClear();
  });

  it("renders the featured property section as a single four-card row", async () => {
    const { FeaturedPropertiesSection } = await import("@/components/index/FeaturedPropertiesSection");

    renderWithProviders(
      <FeaturedPropertiesSection
        listings={Array.from({ length: 6 }, (_, index) => listing(index + 1))}
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.getAllByTestId("featured-property-card")).toHaveLength(4);
    expect(screen.queryByText("Spotlight 5")).not.toBeInTheDocument();
  });

  it("collapses the Spotlight section when no paid placements are active", async () => {
    const { FeaturedPropertiesSection } = await import("@/components/index/FeaturedPropertiesSection");

    const { container } = renderWithProviders(
      <FeaturedPropertiesSection
        listings={[]}
        isLoading={false}
        isError={false}
      />,
    );

    expect(screen.queryByText("Spotlight Properties")).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "View All" })).not.toBeInTheDocument();
    expect(container.querySelector("section")).toBeNull();
  });

  it("keeps popular location imagery but uses the smaller landscape card shape", async () => {
    const { PopularLocationsSection } = await import("@/components/index/PopularLocationsSection");

    renderWithProviders(<PopularLocationsSection />);

    const athensCard = screen.getByRole("link", { name: /Athens/i }).firstElementChild;
    expect(athensCard).toHaveClass("aspect-[4/3]");
    expect(screen.getByAltText("Athens")).toBeInTheDocument();
  });

  it("does not fetch popular location stats before the homepage gate enables it", async () => {
    const { PopularLocationsSection } = await import("@/components/index/PopularLocationsSection");

    renderWithProviders(<PopularLocationsSection enabled={false} />);

    expect(screen.getByAltText("Athens")).toBeInTheDocument();
    expect(screen.getAllByText("Explore listings")).toHaveLength(4);
    expect(screen.queryByText("24,860 listings")).not.toBeInTheDocument();
    expect(fetchPublicApiMock).not.toHaveBeenCalled();
  });

  it("uses the tighter professionals band spacing on the homepage", async () => {
    const { ProfessionalsCTASection } = await import("@/components/index/ProfessionalsCTASection");

    renderWithProviders(<ProfessionalsCTASection />);

    expect(screen.getByText(/The right expert/i).closest("section")).toHaveClass("py-8", "sm:py-12");
  });
});
