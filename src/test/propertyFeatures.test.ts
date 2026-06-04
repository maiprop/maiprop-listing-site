import { describe, expect, it } from "vitest";
import { buildDetailGroups, buildDetailRows, buildPropertyFeatureGroups } from "@/lib/propertyFeatures";

type FeatureInput = Parameters<typeof buildPropertyFeatureGroups>[0];
type DetailInput = Parameters<typeof buildDetailRows>[0];

const baseListing = {
  created_at: "2026-05-01T00:00:00Z",
  updated_at: "2026-05-10T00:00:00Z",
} as unknown as DetailInput;

describe("propertyFeatures helpers", () => {
  it("groups every truthy feature into the expected display buckets", () => {
    const groups = buildPropertyFeatureGroups({
      has_elevator: true,
      has_ac: true,
      has_solar_water: true,
      has_storage: true,
      has_secure_door: true,
      has_alarm: true,
      has_cctv: true,
      has_security: true,
      has_fireplace: true,
      has_underfloor_heating: true,
      has_furnished: true,
      has_internal_staircase: true,
      has_double_glazing: true,
      has_window_screens: true,
      has_night_power: true,
      has_attic: true,
      has_satellite: true,
      has_smart_home: true,
      has_equipped: true,
      has_three_phase_power: true,
      has_structured_cabling: true,
      has_parking: true,
      has_balcony: true,
      has_garden: true,
      has_pool: true,
      has_view: true,
      has_facade: true,
      has_awning: true,
      has_disability_access: true,
      is_corner: true,
      has_loading_dock: true,
      is_buildable: true,
      within_city_plan: true,
      within_settlement: true,
      has_water_supply: true,
      has_electricity_supply: true,
      has_land_concession: true,
      is_penthouse: true,
      is_neoclassical: true,
      is_preserved: true,
      has_virtual_tour: true,
      has_video_tour: true,
      suitable_student: true,
      suitable_holiday: true,
      suitable_investment: true,
      suitable_commercial_use: true,
    } as unknown as FeatureInput);

    expect(groups.internalFeatures.map((item) => item.label)).toContain("Elevator");
    expect(groups.internalFeatures).toHaveLength(21);
    expect(groups.externalFeatures.map((item) => item.label)).toContain("Parking Space");
    expect(groups.externalFeatures).toHaveLength(16);
    expect(groups.constructionFeatures.map((item) => item.label)).toEqual([
      "Penthouse",
      "Neoclassical",
      "Preserved Building",
      "Virtual Tour",
      "Video Tour",
    ]);
    expect(groups.suitabilityFeatures.map((item) => item.label)).toEqual([
      "Students",
      "Holiday Home",
      "Investment",
      "Commercial Use",
    ]);
  });

  it("omits falsey features and formats residential detail rows", () => {
    const rows = buildDetailRows({
      ...baseListing,
      year_built: 2004,
      floor: 0,
      total_floors: 5,
      levels: 2,
      kitchens: 1,
      living_rooms: 1,
      wc_count: 2,
      heating_system: "autonomous_gas",
      energy_class: "A",
      construction_status: "renovated",
      cadastre_number: "KAEK-1",
      enfia_zone: "A1",
      postal_code: "11528",
      region: "Attica",
      commercial_subtype: "office",
      plot_surface: 300,
      floor_height: 3.2,
    } as unknown as DetailInput, 250000, 100, 2500, false);

    expect(rows).toEqual(expect.arrayContaining([
      { label: "Price", value: "€250,000" },
      { label: "Price / m²", value: "€2,500" },
      { label: "Floor", value: "Ground" },
      { label: "Heating", value: "Autonomous (gas)" },
      { label: "Condition", value: "Renovated" },
    ]));
    expect(rows.find((row) => row.label === "Coverage Ratio")).toBeUndefined();
  });

  it("formats unknown enum fallbacks and land-only detail rows", () => {
    const rows = buildDetailRows({
      ...baseListing,
      floor: 3,
      total_floors: 7,
      heating_system: "district_heat",
      construction_status: "custom_state",
      coverage_ratio: 40,
      building_allowance: 180,
      facade_length: 12,
      plot_depth: 30,
      slope: "flat",
      zone_type: "residential",
      road_type: "asphalt",
      distance_from_sea: 450,
      distance_from_city: 2000,
    } as unknown as DetailInput, 120000, 500, null, true);

    expect(rows).toEqual(expect.arrayContaining([
      { label: "Price / m²", value: "—" },
      { label: "Floor", value: "3 of 7" },
      { label: "Heating", value: "district heat" },
      { label: "Condition", value: "custom state" },
      { label: "Coverage Ratio", value: "40%" },
      { label: "Build Allowance", value: "180 m²" },
      { label: "From City", value: "2000 m" },
    ]));
  });

  it("keeps auction detail groups user-facing and omits raw court/status metadata", () => {
    const groups = buildDetailGroups({
      ...baseListing,
      listing_type: "auction",
      property_type: "apartment",
      auction_date: "2026-06-10T00:00:00Z",
      auction_court: "POSTED",
      tags: ["ownership:full", "ownership_pct:100"],
    } as unknown as DetailInput, 128000, 106.54, 1201, false);

    const auctionGroup = groups.find((group) => group.title === "Auction");

    expect(auctionGroup?.rows).toEqual(expect.arrayContaining([
      { label: "Auction Date", value: "10/06/2026" },
      { label: "Ownership", value: "Full" },
      { label: "Ownership Share", value: "100%" },
    ]));
    expect(auctionGroup?.rows.some((row) => row.label === "Auction Court")).toBe(false);
    expect(JSON.stringify(groups)).not.toContain("POSTED");
  });

  it("keeps location details free of cadastre/legal section labels", () => {
    const groups = buildDetailGroups({
      ...baseListing,
      listing_type: "sale",
      property_type: "apartment",
      region: "Attica",
      postal_code: "11528",
      cadastre_number: "KAEK-1",
      enfia_zone: "A1",
    } as unknown as DetailInput, 250000, 100, 2500, false);

    const locationGroup = groups.find((group) => group.title === "Location");

    expect(locationGroup).toBeDefined();
    expect(groups.some((group) => group.title === "Location & Legal")).toBe(false);
    expect(JSON.stringify(groups)).not.toContain("Cadastre No.");
    expect(JSON.stringify(groups)).not.toContain("KAEK-1");
  });
});
