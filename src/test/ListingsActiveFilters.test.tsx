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

  it("renders all premium/market filters and clears their URL params", () => {
    const setParam = vi.fn();
    const toggleMulti = vi.fn();
    const clearAllFilters = vi.fn();

    render(
      <DesktopActiveFilterChips
        {...baseProps}
        selectedType="commercial"
        selectedSubtype="warehouse"
        selectedPrice="500000+"
        bedsRange={["4"]}
        selectedEnergyClasses={["B", "C"]}
        selectedFeatures={["garden", "parking"]}
        smartFeatures={[{ key: "garden", label: "Garden" }, { key: "parking", label: "Parking" }]}
        selectedHeating="central"
        selectedConstruction="new"
        preSaleOnly
        hasVideoViewing
        hasVirtualTour
        hasMessaging
        minAiScore={80}
        minWalkability={70}
        setParam={setParam}
        toggleMulti={toggleMulti}
        clearAllFilters={clearAllFilters}
      />,
    );

    fireEvent.click(screen.getByText(/Commercial/i));
    expect(setParam).toHaveBeenCalledWith("type", "");
    expect(setParam).toHaveBeenCalledWith("subtype", "");

    fireEvent.click(screen.getByText(/Warehouse/i));
    expect(setParam).toHaveBeenCalledWith("subtype", "");

    fireEvent.click(screen.getByText(/500000\+/i));
    expect(setParam).toHaveBeenCalledWith("price", "");

    fireEvent.click(screen.getByText(/4\+ beds/i));
    expect(setParam).toHaveBeenCalledWith("beds_min", "");

    fireEvent.click(screen.getByText(/Energy B/i));
    fireEvent.click(screen.getByText(/Energy C/i));
    expect(toggleMulti).toHaveBeenCalledWith("energy", "B");
    expect(toggleMulti).toHaveBeenCalledWith("energy", "C");

    fireEvent.click(screen.getByText(/Garden/i));
    fireEvent.click(screen.getByText(/Parking/i));
    expect(toggleMulti).toHaveBeenCalledWith("features", "garden");
    expect(toggleMulti).toHaveBeenCalledWith("features", "parking");

    fireEvent.click(screen.getByText(/Heating:/i));
    expect(setParam).toHaveBeenCalledWith("heating", "");

    fireEvent.click(screen.getByText(/^New$/i));
    expect(setParam).toHaveBeenCalledWith("construction", "");

    for (const [label, key] of [
      [/New Buildings/i, "listing_type"],
      [/Video Viewing/i, "video_viewing"],
      [/Virtual Tour/i, "virtual_tour"],
      [/Messaging/i, "messaging"],
      [/AI score 80\+/i, "min_ai_score"],
      [/Walk 70\+/i, "min_walkability"],
    ] as const) {
      fireEvent.click(screen.getByText(label));
      expect(setParam).toHaveBeenCalledWith(key, "");
    }
    expect(setParam).toHaveBeenCalledWith("pre_sale", "");
  });
});
