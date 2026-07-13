import React from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ListingsAdvancedFilters } from "@/components/listings/ListingsAdvancedFilters";

const {
  configState,
  filterState,
  locale,
  paramState,
  setParam,
  setParams,
  toggleMulti,
} = vi.hoisted(() => {
  const setParam = vi.fn();
  const setParams = vi.fn();
  const toggleMulti = vi.fn();
  const clearAllFilters = vi.fn();
  const paramState: Record<string, string> = {};
  const filterState = {
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
    setParams,
    toggleMulti,
    clearAllFilters,
    getParam: vi.fn((key: string, fallback = "") => paramState[key] ?? fallback),
    getMulti: vi.fn((key: string) => (paramState[key] ?? "").split(",").filter(Boolean)),
  };
  const configState = {
    loading: false,
    config: {
      sections: [] as string[],
      sizeLabel: "Size (m²)" as string | undefined,
      bedsLabel: "Bedrooms" as string | undefined,
      featuresLabel: "Features",
      features: [] as Array<{ key: string; label: string }>,
    },
  };
  return {
    clearAllFilters,
    configState,
    filterState,
    locale: { value: "en" },
    paramState,
    setParam,
    setParams,
    toggleMulti,
  };
});

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: locale.value },
  }),
}));

vi.mock("@/hooks/useListingsFilters", () => ({
  useListingsFilters: () => filterState,
}));

vi.mock("@/hooks/useSmartFilters", () => ({
  useSmartFilters: () => configState,
}));

const section = (label: string) => {
  const heading = screen.getByText(label);
  const container = heading.closest(".space-y-2");
  if (!container) throw new Error(`No section container for ${label}`);
  return within(container as HTMLElement);
};

describe("ListingsAdvancedFilters conditional branches", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    for (const key of Object.keys(paramState)) delete paramState[key];
    locale.value = "en";
    Object.assign(filterState, {
      selectedListingType: "sale",
      selectedType: "apartment",
      selectedSubtype: "",
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
    Object.assign(configState, {
      loading: false,
      config: {
        sections: [],
        sizeLabel: "Size (m²)",
        bedsLabel: "Bedrooms",
        featuresLabel: "Features",
        features: [],
      },
    });
  });

  it("renders the loading shell and generic panel when no property type is selected", () => {
    filterState.selectedType = "";
    configState.loading = true;
    const { container } = render(<ListingsAdvancedFilters filteredCount={0} onClose={vi.fn()} />);

    expect(screen.getByText("Advanced Filters")).toBeInTheDocument();
    expect(screen.queryByText(/AI-curated for this property type/i)).not.toBeInTheDocument();
    expect(container.querySelectorAll(".animate-pulse")).toHaveLength(4);
    expect(screen.getByRole("checkbox", { name: /new buildings only/i })).toBeInTheDocument();
  });

  it("covers all sale filter sections and both selected and unselected controls", () => {
    Object.assign(filterState, {
      selectedSubtype: "penthouse",
      selectedEnergyClasses: ["A"],
      selectedFeatures: ["has_parking"],
      selectedHeating: "autonomous",
      selectedConstruction: "renovated",
      hasVideoViewing: true,
      minAiScore: 80,
      minWalkability: 70,
      proFilterCount: 3,
    });
    Object.assign(paramState, {
      road_type: "main",
      slope: "flat",
      style: "penthouse",
    });
    configState.config = {
      sections: [
        "size",
        "bedrooms",
        "bathrooms",
        "floor",
        "year_built",
        "heating",
        "construction_status",
        "land_details",
        "commercial_details",
        "energy_class",
      ],
      sizeLabel: "Size (m²)",
      bedsLabel: "Bedrooms",
      featuresLabel: "Comfort",
      features: [
        { key: "has_parking", label: "Parking" },
        { key: "has_pool", label: "Pool" },
      ],
    };

    render(<ListingsAdvancedFilters filteredCount={19} onClose={vi.fn()} />);

    expect(screen.getByText(/Penthouse Filters/i)).toBeInTheDocument();
    expect(screen.getByText(/AI-curated for this property type/i)).toBeInTheDocument();
    expect(screen.getByText(/3 active/i)).toBeInTheDocument();

    const bathrooms = section("Bathrooms").getAllByRole("combobox");
    fireEvent.change(bathrooms[0], { target: { value: "2" } });
    fireEvent.change(bathrooms[1], { target: { value: "4" } });
    expect(setParam).toHaveBeenCalledWith("baths_min", "2");
    expect(setParam).toHaveBeenCalledWith("baths_max", "4");

    const floor = section("Floor").getAllByRole("combobox");
    fireEvent.change(floor[0], { target: { value: "0" } });
    fireEvent.change(floor[1], { target: { value: "10+" } });
    expect(setParam).toHaveBeenCalledWith("floor_min", "0");
    expect(setParam).toHaveBeenCalledWith("floor_max", "10+");

    const year = section("Year Built").getAllByRole("combobox");
    fireEvent.change(year[0], { target: { value: "2000" } });
    fireEvent.change(year[1], { target: { value: "2025" } });
    expect(setParam).toHaveBeenCalledWith("year_min", "2000");
    expect(setParam).toHaveBeenCalledWith("year_max", "2025");

    fireEvent.click(screen.getByRole("button", { name: "Autonomous (other)" }));
    expect(setParam).toHaveBeenCalledWith("heating", "");
    fireEvent.change(section("Condition").getByRole("combobox"), { target: { value: "new" } });
    expect(setParam).toHaveBeenCalledWith("construction", "new");

    fireEvent.change(section("Road Type").getByRole("combobox"), { target: { value: "corner" } });
    fireEvent.click(screen.getByRole("button", { name: "Flat" }));
    expect(setParam).toHaveBeenCalledWith("road_type", "corner");
    expect(setParam).toHaveBeenCalledWith("slope", "");

    fireEvent.change(section("Road Frontage").getByRole("combobox"), { target: { value: "secondary" } });
    expect(setParam).toHaveBeenCalledWith("road_type", "secondary");

    fireEvent.click(screen.getByTitle("Energy class A"));
    fireEvent.click(screen.getByTitle("Energy class B"));
    expect(toggleMulti).toHaveBeenCalledWith("energy", "A");
    expect(toggleMulti).toHaveBeenCalledWith("energy", "B");

    fireEvent.click(screen.getByRole("button", { name: /Penthouse/i }));
    fireEvent.click(screen.getByRole("button", { name: "Pool" }));
    expect(toggleMulti).toHaveBeenCalledWith("style", "penthouse");
    expect(toggleMulti).toHaveBeenCalledWith("features", "has_pool");

    fireEvent.click(screen.getByRole("button", { name: /Video Viewing/i }));
    fireEvent.click(screen.getByRole("button", { name: /Virtual Tour/i }));
    fireEvent.click(screen.getByRole("button", { name: /Messaging/i }));
    expect(setParam).toHaveBeenCalledWith("video_viewing", "");
    expect(setParam).toHaveBeenCalledWith("virtual_tour", "1");
    expect(setParam).toHaveBeenCalledWith("messaging", "1");

    fireEvent.click(screen.getAllByRole("button", { name: "Any" })[0]);
    fireEvent.click(screen.getByRole("button", { name: /90\+ Paradise/i }));
    expect(setParam).toHaveBeenCalledWith("min_ai_score", "");
    expect(setParam).toHaveBeenCalledWith("min_walkability", "90");
  });

  it("uses rent bedroom labels and toggles rental duration without exposing new-build controls", () => {
    Object.assign(filterState, {
      selectedListingType: "rent",
      isRent: true,
      bedsRange: ["0", "3"],
    });
    paramState.min_rental = "3";
    configState.config = {
      sections: ["bedrooms", "rental_extras"],
      sizeLabel: undefined,
      bedsLabel: "Bedrooms",
      featuresLabel: "Features",
      features: [],
    };

    render(<ListingsAdvancedFilters filteredCount={4} onClose={vi.fn()} />);

    const bedrooms = section("Bedrooms").getAllByRole("combobox");
    expect(within(bedrooms[0]).getByRole("option", { name: "Studio" })).toBeInTheDocument();
    expect(screen.queryByLabelText("New Buildings only")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "3 mo" }));
    fireEvent.click(screen.getByRole("button", { name: "1 yr" }));
    expect(setParam).toHaveBeenCalledWith("min_rental", "");
    expect(setParam).toHaveBeenCalledWith("min_rental", "12");
  });

  it("localizes Greek labels, handles emoji labels, and omits unavailable style and feature groups", () => {
    locale.value = "el-GR";
    filterState.selectedType = "land";
    filterState.selectedSubtype = "";
    configState.config = {
      sections: ["size", "floor", "heating", "energy_class"],
      sizeLabel: "Plot Size (m²)",
      bedsLabel: undefined,
      featuresLabel: "Features",
      features: [],
    };

    render(<ListingsAdvancedFilters filteredCount={2} onClose={vi.fn()} />);

    expect(screen.queryByText("Property Style")).not.toBeInTheDocument();
    expect(screen.queryByText("Features")).not.toBeInTheDocument();
    expect(screen.queryByText("Most efficient")).not.toBeInTheDocument();
    expect(screen.getByTitle(/A\+$/)).toBeInTheDocument();

    const floor = screen.getAllByRole("combobox").find((select) =>
      Array.from(select.querySelectorAll("option")).some((option) => option.value === "-1"),
    );
    expect(floor).toBeDefined();
    expect(floor?.querySelector('option[value="-1"]')?.textContent).not.toBe("Basement");
    expect(floor?.querySelector('option[value="0"]')?.textContent).not.toBe("Ground");
  });

  it("turns off an already-selected new-build toggle in one batched URL update", () => {
    filterState.selectedListingType = "new_build";
    filterState.preSaleOnly = true;
    render(<ListingsAdvancedFilters filteredCount={3} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("checkbox", { name: /new buildings only/i }));
    expect(setParams).toHaveBeenCalledWith([
      ["listing_type", ""],
      ["pre_sale", ""],
    ]);
  });
});
