import { describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { BrowseByTypeSection } from "@/components/index/BrowseByTypeSection";

vi.mock("@/hooks/useInView", () => ({
  useInView: () => ({ ref: vi.fn(), inView: true }),
}));

describe("BrowseByTypeSection", () => {
  it("renders a grouped browse board with distinct residential, project, and commercial lanes", () => {
    renderWithProviders(<BrowseByTypeSection />);

    const board = screen.getByTestId("browse-by-type-board");
    expect(board).toHaveClass("grid", "grid-cols-1", "xl:grid-cols-12");

    const homesGroup = screen.getByTestId("browse-by-type-group-homes");
    const projectsGroup = screen.getByTestId("browse-by-type-group-projects");
    const commercialGroup = screen.getByTestId("browse-by-type-group-commercial");
    const homesCards = screen.getByTestId("browse-by-type-group-homes-cards");
    const projectsCards = screen.getByTestId("browse-by-type-group-projects-cards");
    const commercialCards = screen.getByTestId("browse-by-type-group-commercial-cards");

    expect(within(homesGroup).getByText("Living Spaces")).toBeInTheDocument();
    expect(within(projectsGroup).getByText("Projects & Hybrid")).toBeInTheDocument();
    expect(within(commercialGroup).getByText("Business Space")).toBeInTheDocument();
    expect(board.textContent).not.toMatch(/\b\d+\b/);
    expect(homesGroup).not.toHaveClass("border");
    expect(projectsGroup).not.toHaveClass("border");
    expect(commercialGroup).not.toHaveClass("border");
    expect(homesCards).toHaveClass("overflow-x-auto", "snap-x", "sm:grid", "sm:overflow-visible");
    expect(projectsCards).toHaveClass("overflow-x-auto", "snap-x", "sm:grid", "sm:overflow-visible");
    expect(commercialCards).toHaveClass("overflow-x-auto", "snap-x", "sm:grid", "sm:overflow-visible");

    const links = within(board).getAllByRole("link");
    expect(links).toHaveLength(9);

    const apartmentLink = within(homesGroup).getByRole("link", { name: /Browse apartments/i });
    const newBuildLink = within(projectsGroup).getByRole("link", { name: /Browse new buildings/i });
    const mixedUseLink = within(projectsGroup).getByRole("link", { name: /Browse mixed-use/i });
    expect(apartmentLink).toHaveAttribute("data-card-variant", "hero");
    expect(newBuildLink).toHaveAttribute("data-card-variant", "spotlight");
    expect(newBuildLink).toHaveClass("sm:min-h-[132px]");
    expect(mixedUseLink).toHaveClass("sm:min-h-[132px]");
    expect(within(homesGroup).getByText("Homes, apartments and land.")).toBeInTheDocument();
    expect(within(projectsGroup).getByText("New-build and mixed-use stock.")).toBeInTheDocument();
    expect(within(commercialGroup).getByText("Offices, retail and income assets.")).toBeInTheDocument();

    expect(screen.getByRole("link", { name: /Browse apartments/i })).toHaveAttribute("href", "/listings?type=apartment");
    expect(screen.getByRole("link", { name: /Browse houses/i })).toHaveAttribute("href", "/listings?type=house");
    expect(screen.getByRole("link", { name: /Browse land/i })).toHaveAttribute("href", "/listings?type=land");
    expect(screen.getByRole("link", { name: /Browse new buildings/i })).toHaveAttribute("href", "/listings?listing_type=new_build");
    expect(screen.getByRole("link", { name: /Browse retail shops/i })).toHaveAttribute("href", "/listings?type=commercial&subtype=shop");
    expect(screen.getByRole("link", { name: /Browse offices/i })).toHaveAttribute("href", "/listings?type=office");
    expect(screen.getByRole("link", { name: /Browse stores/i })).toHaveAttribute("href", "/listings?type=storage");
    expect(screen.getByRole("link", { name: /Browse mixed-use/i })).toHaveAttribute("href", "/listings?type=mixed_use");
    expect(screen.getByRole("link", { name: /Browse commercial/i })).toHaveAttribute("href", "/listings?type=commercial");

    expect(within(homesGroup).getByText("Apartment")).toBeInTheDocument();
    expect(within(homesGroup).getByText("Houses")).toBeInTheDocument();
    expect(within(homesGroup).getByText("Land")).toBeInTheDocument();
    expect(within(projectsGroup).getByText("New Build")).toBeInTheDocument();
    expect(within(projectsGroup).getByText("Mixed Use")).toBeInTheDocument();
    expect(within(commercialGroup).getByText("Offices")).toBeInTheDocument();
    expect(within(commercialGroup).getByText("Retail")).toBeInTheDocument();
    expect(within(commercialGroup).getByText("Stores")).toBeInTheDocument();
    expect(within(commercialGroup).getByText("Commercial")).toBeInTheDocument();

    expect(screen.queryByRole("link", { name: /Open House/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /Auctions/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/listings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/No active/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Off-plan homes/i)).not.toBeInTheDocument();
  });
});
