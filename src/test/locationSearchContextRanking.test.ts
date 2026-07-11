import { describe, expect, it } from "vitest";
import type { AddressPrediction } from "@/lib/location/addressFormat";
import {
  getListingLocationRadiusM,
  rankAddressPredictionsForQuery,
} from "@/lib/location/locationSearchSemantics";

const prediction = (overrides: Partial<AddressPrediction>): AddressPrediction => ({
  id: "test",
  provider: "google",
  value: overrides.value ?? "test",
  title: overrides.title ?? overrides.value ?? "test",
  ...overrides,
});

describe("location search context ranking", () => {
  it("ranks same street-number predictions by typed municipality context", () => {
    const piraeus = prediction({
      id: "piraeus-kalimnou-27",
      value: "27 Kalimnou, Piraeus, Attica",
      title: "27 Kalimnou",
      addressLine: "27 Kalimnou",
      city: "Piraeus",
      municipality: "Municipality of Piraeus",
      region: "Attica",
      postalCode: "18538",
      latitude: "37.9339270",
      longitude: "23.6330747",
      googleTypes: ["street_address", "geocode"],
    });
    const agioi = prediction({
      id: "agioi-kalimnou-27",
      value: "27 Kalimnou, Agioi Anargiroi, Attica",
      title: "27 Kalimnou",
      addressLine: "27 Kalimnou",
      city: "Agioi Anargiroi",
      municipality: "Agioi Anargiroi - Kamatero",
      region: "Attica",
      postalCode: "13562",
      latitude: "38.030103",
      longitude: "23.724004",
      googleTypes: ["street_address", "geocode"],
    });

    expect(rankAddressPredictionsForQuery([piraeus, agioi], "Kalimnou 27, Agioi Anargiroi")[0]).toBe(agioi);
    expect(rankAddressPredictionsForQuery([piraeus, agioi], "Kalimnou 27, Agioi Anargyroi")[0]).toBe(agioi);
  });

  it("uses street radius for addresses and municipality radius for locality searches", () => {
    expect(getListingLocationRadiusM(prediction({
      addressLine: "27 Kalimnou",
      latitude: "38.030103",
      longitude: "23.724004",
      googleTypes: ["street_address", "geocode"],
    }))).toBe(750);

    expect(getListingLocationRadiusM(prediction({
      title: "Agioi Anargiroi Attica",
      city: "Agioi Anargiroi",
      municipality: "Agioi Anargiroi - Kamatero",
      latitude: "38.027702",
      longitude: "23.71761",
      googleTypes: ["locality", "political"],
    }))).toBe(5000);

    expect(getListingLocationRadiusM(prediction({
      title: "Attica",
      region: "Attica",
      googleTypes: ["administrative_area_level_1", "political"],
    }))).toBeUndefined();
  });
});
