import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { BrowseByTypeSection } from "@/components/index/BrowseByTypeSection";

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

describe("BrowseByTypeSection", () => {
  it("renders a compact 3x3 property-type grid without flow tiles", () => {
    renderWithProviders(<BrowseByTypeSection />);

    const grid = screen.getByTestId("browse-by-type-grid");
    expect(grid).toHaveClass("grid-cols-3");
    const links = within(grid).getAllByRole("link");
    expect(links).toHaveLength(9);
    expect(grid.querySelectorAll("svg")).toHaveLength(0);
    expect(new Set(links.map((link) => link.getAttribute("data-accent"))).size).toBeGreaterThanOrEqual(6);

    expect(screen.getByRole("link", { name: /Browse apartments/i })).toHaveAttribute("href", "/listings?type=apartment");
    expect(screen.getByRole("link", { name: /Browse houses/i })).toHaveAttribute("href", "/listings?type=house");
    expect(screen.getByRole("link", { name: /Browse land/i })).toHaveAttribute("href", "/listings?type=land");
    expect(screen.getByRole("link", { name: /Browse new buildings/i })).toHaveAttribute("href", "/listings?listing_type=new_build");
    expect(screen.getByRole("link", { name: /Browse retail shops/i })).toHaveAttribute("href", "/listings?type=commercial&subtype=shop");
    expect(screen.getByRole("link", { name: /Browse offices/i })).toHaveAttribute("href", "/listings?type=office");
    expect(screen.getByRole("link", { name: /Browse stores/i })).toHaveAttribute("href", "/listings?type=storage");
    expect(screen.getByRole("link", { name: /Browse mixed-use/i })).toHaveAttribute("href", "/listings?type=mixed_use");
    expect(screen.getByRole("link", { name: /Browse commercial/i })).toHaveAttribute("href", "/listings?type=commercial");

    expect(screen.queryByRole("link", { name: /Open House/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Auctions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/More Commercial/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/listings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No active/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/City homes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Family homes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Off-plan homes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Business spaces/i)).not.toBeInTheDocument();
  });
});
