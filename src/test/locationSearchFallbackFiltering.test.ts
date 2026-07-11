import { describe, expect, it } from "vitest";
import type { AddressPrediction } from "@/lib/location/addressFormat";
import { filterAddressPredictionsForQuery } from "@/lib/location/locationSearchSemantics";

const prediction = (overrides: Partial<AddressPrediction>): AddressPrediction => ({
  id: overrides.id ?? "test",
  provider: overrides.provider ?? "mapbox",
  value: overrides.value ?? "test",
  title: overrides.title ?? overrides.value ?? "test",
  ...overrides,
});

describe("location search fallback filtering", () => {
  it("drops address fallback suggestions that match only the street and not the typed municipality", () => {
    const results = filterAddressPredictionsForQuery([
      prediction({
        id: "wrong-kalymnou-street",
        value: "Kalymnou Street Mytilene",
        title: "Kalymnou Street",
        addressLine: "Kalymnou Street",
        city: "Mytilene",
        region: "North Aegean",
      }),
      prediction({
        id: "correct-kalimnou-agioi",
        value: "Kalimnou 27 Agioi Anargiroi",
        title: "Kalimnou 27",
        addressLine: "Kalimnou 27",
        city: "Agioi Anargiroi",
        municipality: "Agioi Anargiroi - Kamatero",
        region: "Attica",
      }),
    ], "Kalimnou 27 Agioi Anargiroi");

    expect(results.map((result) => result.id)).toEqual(["correct-kalimnou-agioi"]);
  });
});
