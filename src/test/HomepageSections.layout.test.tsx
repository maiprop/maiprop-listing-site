import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import type { HomepageListing } from "@/lib/homepageListings";
import i18n from "@/i18n";

vi.unmock("react-i18next");

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

  afterEach(async () => {
    await i18n.changeLanguage("en");
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

  it("shows a localized retry state instead of stale Spotlight data after a failed request", async () => {
    const { FeaturedPropertiesSection } = await import("@/components/index/FeaturedPropertiesSection");
    const onRetry = vi.fn();
    await i18n.changeLanguage("el");

    renderWithProviders(
      <FeaturedPropertiesSection
        listings={[listing(1)]}
        isLoading={false}
        isError
        onRetry={onRetry}
      />,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Δεν ήταν δυνατή η φόρτωση των επιλεγμένων ακινήτων");
    expect(screen.queryByTestId("featured-property-card")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Δοκιμάστε ξανά" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
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

  it("stacks Greek catalogue headers so their CTAs stay inside a 320px viewport", async () => {
    const { HomepageAuctionsSection } = await import("@/components/index/HomepageAuctionsSection");
    const { HomepageOpenHousesSection } = await import("@/components/index/HomepageOpenHousesSection");
    await i18n.changeLanguage("el");

    const auctions = renderWithProviders(
      <HomepageAuctionsSection listings={[]} isLoading={false} />,
    );
    const auctionsLink = auctions.container.querySelector('a[href="/auctions"]');
    expect(auctionsLink?.closest(".reveal")).toHaveClass("flex-col", "sm:flex-row");
    auctions.unmount();

    const openHouses = renderWithProviders(
      <HomepageOpenHousesSection listings={[]} isLoading={false} />,
    );
    const openHousesLink = openHouses.container.querySelector('a[href="/open-houses"]');
    expect(openHousesLink?.closest(".reveal")).toHaveClass("flex-col", "sm:flex-row");
  });
});
