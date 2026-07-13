import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { useListingsFilters } from "@/hooks/useListingsFilters";

const wrapperAt = (entry: string) =>
  function RouterWrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={[entry]}>{children}</MemoryRouter>;
  };

describe("useListingsFilters URL contract", () => {
  it("reads the complete sale filter state and excludes private URL controls from saved filters", () => {
    const query = new URLSearchParams({
      city: "Athens",
      listing_type: "sale",
      type: "apartment",
      subtype: "penthouse",
      price: "200000-500000",
      sort: "price-desc",
      beds_min: "2",
      beds_max: "4",
      baths_min: "1",
      baths_max: "3",
      floor_min: "1",
      floor_max: "8",
      year_min: "2010",
      year_max: "2026",
      sqm_min: "70",
      sqm_max: "180",
      energy: "A+,A",
      features: "has_parking,has_pool",
      heating: "autonomous_gas",
      construction: "new",
      pre_sale: "1",
      video_viewing: "1",
      virtual_tour: "1",
      messaging: "1",
      min_ai_score: "80",
      min_walkability: "70",
      off_market: "1",
      ignored_empty: "",
    });

    const { result } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt(`/listings?${query}`),
    });

    expect(result.current).toMatchObject({
      searchQuery: "Athens",
      selectedListingType: "sale",
      selectedType: "apartment",
      selectedSubtype: "penthouse",
      selectedPrice: "200000-500000",
      selectedSort: "price-desc",
      bedsRange: ["2", "4"],
      bathsRange: ["1", "3"],
      floorRange: ["1", "8"],
      yearRange: ["2010", "2026"],
      minSqm: "70",
      maxSqm: "180",
      selectedEnergyClasses: ["A+", "A"],
      selectedFeatures: ["has_parking", "has_pool"],
      selectedHeating: "autonomous_gas",
      selectedConstruction: "new",
      preSaleOnly: true,
      hasVideoViewing: true,
      hasVirtualTour: true,
      hasMessaging: true,
      minAiScore: 80,
      minWalkability: 70,
      proFilterCount: 5,
      isRent: false,
    });
    expect(result.current.activeFilterCount).toBe(25);
    expect(result.current.currentFilters).not.toHaveProperty("off_market");
    expect(result.current.currentFilters).not.toHaveProperty("ignored_empty");
    expect(result.current.getParam("missing", "fallback")).toBe("fallback");
    expect(result.current.getMulti("missing")).toEqual([]);
  });

  it("uses safe defaults and recognizes canonical rent and new-build states", () => {
    const { result: empty } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt("/listings"),
    });
    expect(empty.current).toMatchObject({
      selectedSort: "relevant",
      preSaleOnly: false,
      proFilterCount: 0,
      activeFilterCount: 0,
      isRent: false,
      minAiScore: 0,
      minWalkability: 0,
    });

    const { result: rent } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt("/listings?listing_type=rent"),
    });
    expect(rent.current.isRent).toBe(true);
    expect(rent.current.preSaleOnly).toBe(false);

    const { result: project } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt("/listings?listing_type=new_build"),
    });
    expect(project.current.preSaleOnly).toBe(true);
  });

  it("sets, batches, deletes, and toggles URL values without adding history entries", async () => {
    const { result } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt("/listings?city=Athens&energy=A"),
    });

    act(() => result.current.setParam("price", "100000-300000"));
    await waitFor(() => expect(result.current.selectedPrice).toBe("100000-300000"));
    act(() => result.current.setParam("price", ""));
    await waitFor(() => expect(result.current.selectedPrice).toBe(""));

    act(() => result.current.setParams([
      ["listing_type", "rent"],
      ["type", "house"],
      ["city", ""],
    ]));
    await waitFor(() => expect(result.current).toMatchObject({
      selectedListingType: "rent",
      selectedType: "house",
      searchQuery: "",
      isRent: true,
    }));

    act(() => result.current.toggleMulti("energy", "B+"));
    await waitFor(() => expect(result.current.selectedEnergyClasses).toEqual(["A", "B+"]));
    act(() => result.current.toggleMulti("energy", "A"));
    await waitFor(() => expect(result.current.selectedEnergyClasses).toEqual(["B+"]));
    act(() => result.current.toggleMulti("energy", "B+"));
    await waitFor(() => expect(result.current.selectedEnergyClasses).toEqual([]));
  });

  it("clears filters while preserving the typed location and valid geographic scope", async () => {
    const { result } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt(
        "/listings?city=Agioi+Anargyroi&location_lat=38.0301&location_lng=23.7228&location_radius_m=1500&type=apartment&price=1-2",
      ),
    });

    act(() => result.current.clearAllFilters());
    await waitFor(() => expect(result.current.selectedType).toBe(""));
    expect(result.current.searchQuery).toBe("Agioi Anargyroi");
    expect(result.current.getParam("location_lat")).toBe("38.0301");
    expect(result.current.getParam("location_lng")).toBe("23.7228");
    expect(result.current.getParam("location_radius_m")).toBe("1500");
    expect(result.current.selectedPrice).toBe("");

    const { result: emptyLocation } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt("/listings?type=land"),
    });
    act(() => emptyLocation.current.clearAllFilters());
    await waitFor(() => expect(emptyLocation.current.currentFilters).toEqual({}));
  });

  it("maps complete AI criteria to URL filters and removes stale optional values", async () => {
    const { result } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt(
        "/listings?listing_type=sale&type=house&beds_max=9&features=old&energy=G&heating=oil",
      ),
    });

    act(() => result.current.applyAIFilters({
      city: "Thessaloniki",
      listing_type: "rent",
      property_type: "apartment",
      price_min: 700,
      price_max: 1800,
      beds_min: 1,
      beds_max: 3,
      sqm_min: 45,
      sqm_max: 120,
      heating: "autonomous_gas",
      features: ["has_balcony", "has_elevator"],
      energy: ["A", "B+"],
    }));

    await waitFor(() => expect(result.current.selectedListingType).toBe("rent"));
    expect(result.current).toMatchObject({
      searchQuery: "Thessaloniki",
      selectedType: "apartment",
      selectedPrice: "700-1800",
      bedsRange: ["1", "3"],
      minSqm: "45",
      maxSqm: "120",
      selectedHeating: "autonomous_gas",
      selectedFeatures: ["has_balcony", "has_elevator"],
      selectedEnergyClasses: ["A", "B+"],
      isRent: true,
    });

    act(() => result.current.applyAIFilters({
      price_max: 900,
      beds_min: null,
      beds_max: "",
      sqm_min: undefined,
      sqm_max: null,
      heating: "",
      features: [],
      energy: [],
    }));
    await waitFor(() => expect(result.current.selectedListingType).toBe(""));
    expect(result.current.selectedType).toBe("");
    expect(result.current.selectedPrice).toBe("0-900");
    expect(result.current.bedsRange).toEqual(["", ""]);
    expect(result.current.minSqm).toBe("");
    expect(result.current.maxSqm).toBe("");
    expect(result.current.selectedHeating).toBe("");
  });

  it("builds an open-ended AI price range when only the minimum is supplied", async () => {
    const { result } = renderHook(() => useListingsFilters(), {
      wrapper: wrapperAt("/listings"),
    });
    act(() => result.current.applyAIFilters({ price_min: 250000 }));
    await waitFor(() => expect(result.current.selectedPrice).toBe("250000-9999999"));
  });
});
