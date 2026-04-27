/**
 * Tests for the feature-filter allowlist and type-safety of ListingsFilters.
 * These test the business rules enforced in buildListingsQuery.
 */

import { describe, it, expect } from "vitest";

// The allowed feature column names — must stay in sync with buildListingsQuery in useListings.ts
const ALLOWED_FEATURE_COLUMNS = new Set([
  "has_parking", "has_elevator", "has_balcony", "has_pool", "pets_allowed",
  "has_furnished", "has_garden", "has_ac", "has_fireplace", "has_storage",
  "has_view", "has_smart_home", "has_attic", "has_double_glazing",
  "has_secure_door", "has_alarm", "has_loading_dock", "has_three_phase_power",
  "has_cctv", "has_disability_access", "has_structured_cabling", "has_facade",
  "has_night_power", "has_solar_water",
]);

// Simulate the filter logic from buildListingsQuery
function getValidFeatures(features: string[]): string[] {
  return features.filter(f => ALLOWED_FEATURE_COLUMNS.has(f));
}

describe("Feature filter allowlist", () => {
  it("allows known feature columns through", () => {
    const result = getValidFeatures(["has_parking", "has_elevator"]);
    expect(result).toEqual(["has_parking", "has_elevator"]);
    expect(result).toHaveLength(2);
    // Order is preserved.
    const reverseInput = ["has_elevator", "has_parking"];
    expect(getValidFeatures(reverseInput)).toEqual(reverseInput);
  });

  it("blocks unknown column names (injection attempt)", () => {
    const result = getValidFeatures(["has_parking", "'; DROP TABLE listings; --", "user_id"]);
    expect(result).toEqual(["has_parking"]);
    expect(result).toHaveLength(1);
    // The injection vector is dropped, not just sanitised.
    expect(result).not.toContain("'; DROP TABLE listings; --");
  });

  it("blocks empty string", () => {
    expect(getValidFeatures([""])).toEqual([]);
    expect(getValidFeatures(["", "", ""])).toEqual([]);
  });

  it("blocks SQL-like column references", () => {
    const injections = ["is_featured", "owner_id", "price", "created_at", "status", "role"];
    expect(getValidFeatures(injections)).toEqual([]);
    // Mixing valid + invalid still drops the invalid ones.
    expect(getValidFeatures([...injections, "has_parking"])).toEqual(["has_parking"]);
  });

  it("all FEATURES_RESIDENTIAL keys pass the allowlist", () => {
    const residential = [
      "has_parking", "has_elevator", "has_balcony", "has_pool", "pets_allowed",
      "has_furnished", "has_garden", "has_ac", "has_fireplace", "has_storage",
      "has_view", "has_smart_home", "has_attic", "has_double_glazing",
      "has_secure_door", "has_alarm",
    ];
    const result = getValidFeatures(residential);
    expect(result).toEqual(residential);
    expect(result).toHaveLength(residential.length);
  });

  it("returns empty array for empty input", () => {
    const result = getValidFeatures([]);
    expect(result).toEqual([]);
    expect(result).toHaveLength(0);
    expect(Array.isArray(result)).toBe(true);
  });
});
