import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PropertyScoresSection } from "@/components/property/PropertyScoresSection";

const baseProps = {
  walkScore: null,
  walkabilityScore: null,
  safetyScore: null,
  noiseScore: null,
};

describe("PropertyScoresSection walk-score provenance", () => {
  it("keeps a stored zero distinct from an unavailable score and qualifies its source", () => {
    render(<PropertyScoresSection {...baseProps} walkabilityScore={0} />);

    expect(screen.getByText("0")).toBeInTheDocument();
    expect(screen.getByText("Car Dependent")).toBeInTheDocument();
    expect(screen.getByText(/Stored listing data.*not independently verified/i)).toBeInTheDocument();
  });

  it("does not display an unsupported runtime score when no stored listing score exists", () => {
    const { container } = render(<PropertyScoresSection {...baseProps} walkScore={79} />);

    expect(container).toBeEmptyDOMElement();
    expect(screen.queryByText("79")).not.toBeInTheDocument();
  });

  it("rejects malformed stored values instead of rendering NaN", () => {
    const { container } = render(
      <PropertyScoresSection
        {...baseProps}
        walkabilityScore={Number.NaN}
      />,
    );

    expect(container).toBeEmptyDOMElement();
    expect(document.body.textContent).not.toMatch(/NaN/);
  });
});
