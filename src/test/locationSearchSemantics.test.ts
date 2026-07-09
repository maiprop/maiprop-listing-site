import { describe, expect, it } from "vitest";
import type { AddressPrediction } from "@/lib/location/addressFormat";
import {
  getAddressInputDisplayValue,
  filterAddressPredictionsForQuery,
  getListingLocationSearchValue,
  getListingLocationSearchTokens,
  isBroadAdministrativePrediction,
  normalizeGreekLocationText,
  normalizeListingLocationSearchQuery,
} from "@/lib/location/locationSearchSemantics";

const prediction = (overrides: Partial<AddressPrediction>): AddressPrediction => ({
  id: "test",
  provider: "google",
  value: overrides.value ?? "test",
  title: overrides.title ?? overrides.value ?? "test",
  ...overrides,
});

describe("location search semantics", () => {
  it("normalizes Greek accents and punctuation for location search", () => {
    expect(normalizeGreekLocationText("Άγιοι Αναργύρων – Καματερού")).toBe("αγιοι αναργυρων καματερου");
    expect(normalizeGreekLocationText("Αγιοι Αναργυροι, Αττικης")).toBe("αγιοι αναργυροι αττικησ");
  });

  it("removes broad region tokens from listing location search queries", () => {
    expect(normalizeListingLocationSearchQuery("Αγιοι Αναργυροι, Αττικης")).toBe("αγιοι αναργυροι");
    expect(getListingLocationSearchTokens("Αγιοι Αναργυροι, Αττικης")).toEqual(["αγιοι", "αναργυροι"]);
    expect(normalizeListingLocationSearchQuery("Περιφέρεια Αττικής")).toBe("");
  });

  it("rejects region-only Google predictions for listing filters", () => {
    expect(isBroadAdministrativePrediction(prediction({
      title: "Περιφέρεια Αττικής",
      value: "Περιφέρεια Αττικής",
      region: "Περιφέρεια Αττικής",
      googleTypes: ["administrative_area_level_1", "political"],
    }))).toBe(true);
  });

  it("rejects broad region rows even when a provider maps the region into city", () => {
    expect(isBroadAdministrativePrediction(prediction({
      title: "Περιφέρεια Αττικής",
      value: "Περιφέρεια Αττικής",
      city: "Περιφέρεια Αττικής",
    }))).toBe(true);
    expect(getListingLocationSearchValue(prediction({
      title: "Περιφέρεια Αττικής",
      value: "Περιφέρεια Αττικής",
      city: "Περιφέρεια Αττικής",
    }))).toBe("");
  });

  it("uses city or municipality before region for listing filters", () => {
    expect(getListingLocationSearchValue(prediction({
      title: "Άγιοι Ανάργυροι Αττικής",
      city: "Άγιοι Ανάργυροι",
      municipality: "Δήμος Αγίων Αναργύρων - Καματερού",
      region: "Περιφέρεια Αττικής",
    }))).toBe("Άγιοι Ανάργυροι");
  });

  it("falls back to a specific title instead of a broad region when details are incomplete", () => {
    expect(getListingLocationSearchValue(prediction({
      title: "Άγιοι Ανάργυροι Αττικής",
      value: "Άγιοι Ανάργυροι Αττικής",
      region: "Περιφέρεια Αττικής",
      googleTypes: ["locality", "political"],
    }))).toBe("Άγιοι Ανάργυροι Αττικής");
  });

  it("uses street address lines as listing search values when they are available", () => {
    const selected = prediction({
      addressLine: "Υμηττού 6",
      city: "Άγιοι Ανάργυροι",
      municipality: "Δήμος Αγίων Αναργύρων - Καματερού",
      region: "Περιφέρεια Αττικής",
    });

    expect(getAddressInputDisplayValue(selected)).toBe("Υμηττού 6");
    expect(getListingLocationSearchValue(selected)).toBe("Υμηττού 6");
  });

  it("keeps Attica-scoped suggestions from leaking same-name places in other regions", () => {
    const results = filterAddressPredictionsForQuery([
      prediction({
        title: "Άγιοι Ανάργυροι Αττικής",
        subtitle: "Περιφέρεια Αττικής",
      }),
      prediction({
        title: "Αγιοι Αναργυροιι",
        subtitle: "Περιφέρεια Δυτικής Μακεδονίας",
      }),
    ], "Αγιοι Αναργυροι, Αττικης");

    expect(results).toHaveLength(1);
    expect(results[0].title).toBe("Άγιοι Ανάργυροι Αττικής");
  });
});
