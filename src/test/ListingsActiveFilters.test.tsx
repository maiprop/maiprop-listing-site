import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopActiveFilterChips } from "@/pages/listings/ListingsActiveFilters";

const baseProps = {
  selectedType: "",
  selectedSubtype: "",
  selectedPrice: "",
  bedsRange: [],
  selectedEnergyClasses: [],
  selectedFeatures: [],
  selectedHeating: "",
  selectedConstruction: "",
  preSaleOnly: false,
  hasVideoViewing: false,
  hasVirtualTour: false,
  hasMessaging: false,
  minAiScore: 0,
  minWalkability: 0,
  smartFeatures: [],
  setParam: vi.fn(),
  toggleMulti: vi.fn(),
  clearAllFilters: vi.fn(),
  isGreek: false,
};

describe("DesktopActiveFilterChips", () => {
  it("renders active listing filters and delegates chip actions", async () => {
    const setParam = vi.fn();
    const toggleMulti = vi.fn();
    const clearAllFilters = vi.fn();

    render(
      <DesktopActiveFilterChips
        {...baseProps}
        selectedType="apartment"
        selectedSubtype="2bedroom"
        selectedPrice="100000-200000"
        bedsRange={["2"]}
        selectedEnergyClasses={["A+"]}
        selectedFeatures={["pool"]}
        smartFeatures={[{ key: "pool", label: "Pool" }]}
        selectedHeating="autonomous"
        selectedConstruction="renovated"
        hasMessaging
        setParam={setParam}
        toggleMulti={toggleMulti}
        clearAllFilters={clearAllFilters}
      />,
    );

    expect(screen.getByText(/Active filters/i)).toBeInTheDocument();
    expect(screen.getByText(/Pool/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Energy A\+/i));
    expect(toggleMulti).toHaveBeenCalledWith("energy", "A+");

    fireEvent.click(screen.getByText(/Clear all/i));
    expect(clearAllFilters).toHaveBeenCalled();

    fireEvent.click(screen.getByText(/Messaging/i));
    expect(setParam).toHaveBeenCalledWith("messaging", "");
  });
});
