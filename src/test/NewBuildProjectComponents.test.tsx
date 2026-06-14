import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { UnitShowcase } from "@/components/new-build/UnitShowcase";
import { FloorPlanSection } from "@/components/new-build/FloorPlanSection";
import { ConstructionSpecs } from "@/components/new-build/ConstructionSpecs";
import { ConstructionTimeline } from "@/components/new-build/ConstructionTimeline";

const listing = {
  price: 450000,
  price_per_sqm: 5000,
  sqm: 90,
  bedrooms: 2,
  bathrooms: 2,
  total_floors: 6,
  listing_type: "new_build",
  has_elevator: true,
  energy_class: "A",
};

const project = {
  developer_company: "Mai Developments",
  architect_group: "Aegean Studio",
  construction_company: "BuildCo",
  building_permit_number: "BP-2026-01",
  municipality: "Piraeus Municipality",
  permit_approval_date: "2026-01-15",
  construction_start_date: "2026-03-01",
  structural_completion_date: "2026-10-15",
  delivery_date: "2027-06-30",
};

const units = [
  {
    id: "unit-1",
    unit_number: "A101",
    availability_status: "available",
    internal_sqm: 82,
    balcony_sqm: 14,
    floor: 1,
    bedrooms: 2,
    bathrooms: 2,
    price: 410000,
    energy_class: "A",
    vat_included: true,
  },
];

describe("new-build project sections", () => {
  it("renders real project units instead of generic availability copy", () => {
    const onContact = vi.fn();

    render(<UnitShowcase listing={listing} units={units} onContact={onContact} />);

    expect(screen.getByRole("heading", { name: "Unit A101" })).toBeInTheDocument();
    expect(screen.getByText("Internal")).toBeInTheDocument();
    expect(screen.getByText(/82 m/)).toBeInTheDocument();
    expect(screen.getByText("VAT")).toBeInTheDocument();
    expect(screen.getByText("Included")).toBeInTheDocument();
    expect(screen.queryByText(/Additional configurations may be available/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /request schedule/i }));
    expect(onContact).toHaveBeenCalledTimes(1);
  });

  it("renders project media titles and links documents separately from visuals", () => {
    render(
      <FloorPlanSection
        images={["https://cdn/cover.jpg"]}
        media={[
          { id: "media-1", media_type: "floor_plan", title: "A101 floor plan", url: "https://cdn/floor.jpg", sort_order: 1 },
          { id: "media-2", media_type: "brochure_pdf", title: "Project brochure", url: "https://cdn/brochure.pdf", sort_order: 2 },
        ]}
        onRequestPlans={vi.fn()}
      />,
    );

    expect(screen.getAllByText("A101 floor plan").length).toBeGreaterThan(0);
    expect(screen.getByRole("link", { name: /project brochure/i })).toHaveAttribute("href", "https://cdn/brochure.pdf");
  });

  it("supports thumbnail switching and fallback labels for untitled project media", () => {
    const onRequestPlans = vi.fn();

    render(
      <FloorPlanSection
        images={["https://cdn/cover.jpg", "https://cdn/extra.jpg"]}
        media={[
          { id: "media-1", media_type: "floor_plan", url: "https://cdn/floor-1.jpg", sort_order: 1 },
          { id: "media-2", media_type: "render", url: "https://cdn/render.jpg", sort_order: 2 },
        ]}
        onRequestPlans={onRequestPlans}
      />,
    );

    expect(screen.getByRole("link", { name: /floor plan/i })).toHaveAttribute("href", "https://cdn/floor-1.jpg");
    fireEvent.click(screen.getAllByRole("button")[1]);
    expect(screen.getByRole("img", { name: /project media/i })).toHaveAttribute("src", "https://cdn/render.jpg");
    expect(onRequestPlans).not.toHaveBeenCalled();
  });

  it("renders project facts, unit availability, and project timeline dates", () => {
    render(<ConstructionSpecs listing={listing} project={project} units={units} />);
    expect(screen.getByText("Mai Developments")).toBeInTheDocument();
    expect(screen.getByText("BP-2026-01")).toBeInTheDocument();
    expect(screen.getByText("1/1 available")).toBeInTheDocument();

    const timeline = render(<ConstructionTimeline status="under_construction" project={project} />);
    expect(timeline.getByText("Mar 2026")).toBeInTheDocument();
    expect(timeline.getAllByText("Oct 2026").length).toBeGreaterThan(0);
  });
});
