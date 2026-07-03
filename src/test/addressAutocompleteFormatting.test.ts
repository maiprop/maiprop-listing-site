import { describe, expect, it } from "vitest";
import {
  formatAddressPrediction,
  mapNominatimSuggestionToAddressPrediction,
} from "@/lib/location/addressFormat";

describe("address autocomplete formatting", () => {
  it("turns raw Nominatim address data into a short title and useful context", () => {
    const prediction = mapNominatimSuggestionToAddressPrediction({
      display_name: "Voukourestiou 14, Athens, Attica, Greece",
      lat: "37.9779",
      lon: "23.7354",
      address: {
        house_number: "14",
        road: "Voukourestiou",
        city: "Athens",
        municipality: "Municipality of Athens",
        postcode: "10671",
      },
    });

    expect(prediction).toMatchObject({
      value: "14 Voukourestiou",
      title: "14 Voukourestiou",
      city: "Athens",
      municipality: "Municipality of Athens",
      postalCode: "10671",
      latitude: "37.9779",
      longitude: "23.7354",
    });
    expect(formatAddressPrediction(prediction)).toEqual({
      title: "14 Voukourestiou",
      subtitle: "Athens - Municipality of Athens - 10671",
    });
  });

  it("does not dump provider display_name when structured pieces exist", () => {
    const prediction = mapNominatimSuggestionToAddressPrediction({
      display_name: "Kallimarmaro, Pagkrati, Municipality of Athens, Regional Unit of Central Athens, Attica, Greece",
      lat: "37.9684",
      lon: "23.7410",
      address: {
        neighbourhood: "Kallimarmaro",
        suburb: "Pagkrati",
        municipality: "Municipality of Athens",
        state: "Attica",
      },
    });

    const formatted = formatAddressPrediction(prediction);

    expect(formatted.title).toBe("Kallimarmaro");
    expect(formatted.subtitle).toBe("Pagkrati - Municipality of Athens - Attica");
    expect(formatted.title).not.toContain("Regional Unit");
    expect(formatted.subtitle).not.toContain("Greece");
  });
});
