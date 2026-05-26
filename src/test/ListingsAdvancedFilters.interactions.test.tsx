import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ListingsAdvancedFilters } from "@/components/listings/ListingsAdvancedFilters";

const { state, setParam, toggleMulti, clearAllFilters } = vi.hoisted(() => {
  const setParam = vi.fn();
  const toggleMulti = vi.fn();
  const clearAllFilters = vi.fn();
  const state = {
    selectedListingType: "sale",
    selectedType: "apartment",
    selectedSubtype: "",
    preSaleOnly: false,
    minSqm: "",
    maxSqm: "",
    bedsRange: ["", ""] as [string, string],
    bathsRange: ["", ""] as [string, string],
    floorRange: ["", ""] as [string, string],
    yearRange: ["", ""] as [string, string],
    selectedEnergyClasses: [] as string[],
    selectedFeatures: [] as string[],
    selectedHeating: "",
    selectedConstruction: "",
    hasVideoViewing: false,
    hasVirtualTour: false,
    hasMessaging: false,
    minAiScore: 0,
    minWalkability: 0,
    proFilterCount: 0,
    isRent: false,
    setParam,
    toggleMulti,
    clearAllFilters,
    getParam: vi.fn(() => ""),
    getMulti: vi.fn(() => [] as string[]),
  };
  return { state, setParam, toggleMulti, clearAllFilters };
});

vi.mock("@/hooks/useListingsFilters", () => ({
  useListingsFilters: () => state,
}));

vi.mock("@/hooks/useSmartFilters", () => ({
  useSmartFilters: () => ({
    loading: false,
    config: {
      sections: [
        "size",
        "bedrooms",
        "bathrooms",
        "floor",
        "year_built",
        "heating",
        "construction_status",
        "energy_class",
      ],
      sizeLabel: "Size",
      bedsLabel: "Bedrooms",
      featuresLabel: "Comfort",
      features: [
        { key: "has_parking", label: "Parking" },
        { key: "has_pool", label: "Pool" },
      ],
    },
  }),
}));

describe("ListingsAdvancedFilters interactions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(state, {
      selectedListingType: "sale",
      selectedType: "apartment",
      preSaleOnly: false,
      minSqm: "",
      maxSqm: "",
      bedsRange: ["", ""],
      bathsRange: ["", ""],
      floorRange: ["", ""],
      yearRange: ["", ""],
      selectedEnergyClasses: [],
      selectedFeatures: [],
      selectedHeating: "",
      selectedConstruction: "",
      hasVideoViewing: false,
      hasVirtualTour: false,
      hasMessaging: false,
      minAiScore: 0,
      minWalkability: 0,
      proFilterCount: 0,
      isRent: false,
    });
  });

  it("updates select, numeric, toggle, and chip filters", () => {
    const onClose = vi.fn();
    renderWithProviders(<ListingsAdvancedFilters filteredCount={12} onClose={onClose} />);

    fireEvent.click(screen.getByLabelText("Close filters"));
    expect(onClose).toHaveBeenCalledTimes(1);

    expect(screen.queryByText(/off-market only/i)).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Min m/), { target: { value: "70" } });
    fireEvent.change(screen.getByPlaceholderText(/Max m/), { target: { value: "150" } });
    expect(setParam).toHaveBeenCalledWith("sqm_min", "70");
    expect(setParam).toHaveBeenCalledWith("sqm_max", "150");

    const selects = screen.getAllByRole("combobox");
    fireEvent.change(selects[0], { target: { value: "2" } });
    fireEvent.change(selects[1], { target: { value: "4" } });
    expect(setParam).toHaveBeenCalledWith("beds_min", "2");
    expect(setParam).toHaveBeenCalledWith("beds_max", "4");

    fireEvent.click(screen.getByRole("button", { name: "Autonomous (other)" }));
    expect(setParam).toHaveBeenCalledWith("heating", "autonomous");

    fireEvent.click(screen.getByTitle("Energy class A"));
    expect(toggleMulti).toHaveBeenCalledWith("energy", "A");

    fireEvent.click(screen.getByRole("button", { name: "Parking" }));
    expect(toggleMulti).toHaveBeenCalledWith("features", "has_parking");
  });

  it("applies pro filters, resets filters, and closes on show results", () => {
    const onClose = vi.fn();
    renderWithProviders(<ListingsAdvancedFilters filteredCount={7} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: /video viewing/i }));
    fireEvent.click(screen.getByRole("button", { name: "80+" }));
    fireEvent.click(screen.getByRole("button", { name: /70\+ very/i }));
    expect(setParam).toHaveBeenCalledWith("video_viewing", "1");
    expect(setParam).toHaveBeenCalledWith("min_ai_score", "80");
    expect(setParam).toHaveBeenCalledWith("min_walkability", "70");

    fireEvent.click(screen.getByRole("button", { name: /show 7 results/i }));
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: /reset/i }));
    expect(clearAllFilters).toHaveBeenCalledTimes(1);
  });
});
