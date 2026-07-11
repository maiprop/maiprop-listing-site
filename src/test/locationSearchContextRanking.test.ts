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

  it("ranks Greek same-street suggestions by municipality inflection before selecting", () => {
    const piraeus = prediction({
      id: "piraeus-kalymnou-27",
      value: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5",
      title: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5",
      addressLine: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5",
      fullAddress: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5, \u03a0\u03b5\u03b9\u03c1\u03b1\u03b9\u03ac\u03c2, \u0394\u03ae\u03bc\u03bf\u03c2 \u03a0\u03b5\u03b9\u03c1\u03b1\u03b9\u03ce\u03c2, \u03a0\u03b5\u03c1\u03b9\u03c6\u03ad\u03c1\u03b5\u03b9\u03b1 \u0391\u03c4\u03c4\u03b9\u03ba\u03ae\u03c2",
      city: "\u03a0\u03b5\u03b9\u03c1\u03b1\u03b9\u03ac\u03c2",
      municipality: "\u0394\u03ae\u03bc\u03bf\u03c2 \u03a0\u03b5\u03b9\u03c1\u03b1\u03b9\u03ce\u03c2",
      region: "\u03a0\u03b5\u03c1\u03b9\u03c6\u03ad\u03c1\u03b5\u03b9\u03b1 \u0391\u03c4\u03c4\u03b9\u03ba\u03ae\u03c2",
      latitude: "37.9339270",
      longitude: "23.6330747",
      googleTypes: ["street_address", "geocode"],
    });
    const agioi = prediction({
      id: "agioi-kalymnou-27",
      value: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5",
      title: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5",
      addressLine: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5",
      fullAddress: "27 \u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5, \u0394\u03b7\u03bc\u03bf\u03c4\u03b9\u03ba\u03ae \u0395\u03bd\u03cc\u03c4\u03b7\u03c4\u03b1 \u0391\u03b3\u03af\u03c9\u03bd \u0391\u03bd\u03b1\u03c1\u03b3\u03cd\u03c1\u03c9\u03bd, \u0394\u03ae\u03bc\u03bf\u03c2 \u0391\u03b3\u03af\u03c9\u03bd \u0391\u03bd\u03b1\u03c1\u03b3\u03cd\u03c1\u03c9\u03bd \u2013 \u039a\u03b1\u03bc\u03b1\u03c4\u03b5\u03c1\u03bf\u03cd, \u03a0\u03b5\u03c1\u03b9\u03c6\u03ad\u03c1\u03b5\u03b9\u03b1 \u0391\u03c4\u03c4\u03b9\u03ba\u03ae\u03c2",
      city: "\u0386\u03b3\u03b9\u03bf\u03b9 \u0391\u03bd\u03ac\u03c1\u03b3\u03c5\u03c1\u03bf\u03b9",
      municipality: "\u0394\u03ae\u03bc\u03bf\u03c2 \u0391\u03b3\u03af\u03c9\u03bd \u0391\u03bd\u03b1\u03c1\u03b3\u03cd\u03c1\u03c9\u03bd \u2013 \u039a\u03b1\u03bc\u03b1\u03c4\u03b5\u03c1\u03bf\u03cd",
      region: "\u03a0\u03b5\u03c1\u03b9\u03c6\u03ad\u03c1\u03b5\u03b9\u03b1 \u0391\u03c4\u03c4\u03b9\u03ba\u03ae\u03c2",
      latitude: "38.027702",
      longitude: "23.71761",
      googleTypes: ["street_address", "geocode"],
    });

    expect(rankAddressPredictionsForQuery([piraeus, agioi], "\u039a\u03b1\u03bb\u03cd\u03bc\u03bd\u03bf\u03c5 27 \u0386\u03b3\u03b9\u03bf\u03b9 \u0391\u03bd\u03ac\u03c1\u03b3\u03c5\u03c1\u03bf\u03b9")[0]).toBe(agioi);
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
      title: "Agioi Anargiroi Attica",
      addressLine: "Agioi Anargiroi Attica",
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
