import { describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { Home } from "lucide-react";
import { renderWithProviders } from "@/test/utils";
import {
  FeatureChip,
  FeatureSection,
  SectionHeader,
} from "@/components/property/DetailPrimitives";

describe("DetailPrimitives responsive layout", () => {
  it("keeps long feature labels inside the chip text column", () => {
    renderWithProviders(
      <FeatureChip icon={Home} label="Double Glazed Windows With Thermal Insulation" />,
    );

    const label = screen.getByText("Double Glazed Windows With Thermal Insulation");
    expect(label).toHaveClass("min-w-0");
    expect(label).toHaveClass("break-words");
  });

  it("lets section-header badges drop beneath the title on narrow layouts", () => {
    renderWithProviders(
      <SectionHeader
        icon={Home}
        title="Features & Amenities"
        badge={<span data-testid="feature-count-badge">8 features</span>}
      />,
    );

    expect(screen.getByText("Features & Amenities")).toHaveClass("min-w-0");
    expect(screen.getByTestId("feature-count-badge").parentElement).toHaveClass("w-full");
  });

  it("uses a one-column feature grid on narrow screens before switching to two columns", () => {
    renderWithProviders(
      <FeatureSection
        title="Internal"
        accent="bg-primary"
        features={[
          { label: "Elevator" },
          { label: "Air Conditioning" },
        ]}
      />,
    );

    const grid = screen.getByText("Elevator").closest(".grid");
    expect(grid).toHaveClass("grid-cols-1");
    expect(grid).toHaveClass("min-[430px]:grid-cols-2");
  });
});
