import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomepageOpenHousesSection } from "@/components/index/HomepageOpenHousesSection";

vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: { title: string } }) => (
    <article data-testid="property-card">{property.title}</article>
  ),
}));

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

describe("HomepageOpenHousesSection behavior", () => {
  it("shows loading cards instead of an empty state while deferred open houses are loading", () => {
    render(
      <MemoryRouter>
        <HomepageOpenHousesSection listings={[]} isLoading />
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId("open-house-loading-card")).toHaveLength(4);
    expect(screen.queryByText(/Open houses coming soon/i)).not.toBeInTheDocument();
  });
});
