import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter } from "react-router-dom";
import { HomepageOpenHousesSection } from "@/components/index/HomepageOpenHousesSection";
import i18n from "@/i18n";

vi.unmock("react-i18next");

vi.mock("@/components/PropertyCard", () => ({
  PropertyCard: ({ property }: { property: { title: string } }) => (
    <article data-testid="property-card">{property.title}</article>
  ),
}));

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

describe("HomepageOpenHousesSection behavior", () => {
  afterEach(async () => {
    await i18n.changeLanguage("en");
  });

  it("shows loading cards instead of an empty state while deferred open houses are loading", () => {
    render(
      <MemoryRouter>
        <HomepageOpenHousesSection listings={[]} isLoading />
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId("open-house-loading-card")).toHaveLength(4);
    expect(screen.queryByText(/Open houses coming soon/i)).not.toBeInTheDocument();
  });

  it("renders loading exclusively even when stale open-house data is present", () => {
    render(
      <MemoryRouter>
        <HomepageOpenHousesSection
          listings={[{ id: "oh-1", title: "Stale Open House" }] as never}
          isLoading
          isError={false}
          onRetry={vi.fn()}
        />
      </MemoryRouter>,
    );

    expect(screen.getAllByTestId("open-house-loading-card")).toHaveLength(4);
    expect(screen.queryByTestId("property-card")).not.toBeInTheDocument();
  });

  it("shows localized retry instead of a false coming-soon state when loading fails", async () => {
    const onRetry = vi.fn();
    await i18n.changeLanguage("el");

    render(
      <MemoryRouter>
        <HomepageOpenHousesSection
          listings={[]}
          isLoading={false}
          isError
          onRetry={onRetry}
        />
      </MemoryRouter>,
    );

    expect(screen.getByRole("alert")).toHaveTextContent("Δεν ήταν δυνατή η φόρτωση των Open House");
    expect(screen.queryByText(/Open House σύντομα/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Δοκιμάστε ξανά" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
