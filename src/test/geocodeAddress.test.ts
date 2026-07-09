import { beforeEach, describe, expect, it, vi } from "vitest";

const { loadGoogleMapsPlacesMock } = vi.hoisted(() => ({
  loadGoogleMapsPlacesMock: vi.fn(),
}));

vi.mock("@/lib/googleMapsPlaces", () => ({
  loadGoogleMapsPlaces: (...args: unknown[]) => loadGoogleMapsPlacesMock(...args),
}));

import { geocodeAddressText, hasCompleteCoordinates } from "@/lib/location/geocodeAddress";

describe("geocodeAddressText", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    loadGoogleMapsPlacesMock.mockResolvedValue(undefined);
  });

  it("does not treat blank coordinate strings as complete coordinates", () => {
    expect(hasCompleteCoordinates("", "")).toBe(false);
    expect(hasCompleteCoordinates("37.98", "")).toBe(false);
    expect(hasCompleteCoordinates("37.98", "23.73")).toBe(true);
  });

  it("returns Google geocoder coordinates for a typed address fallback", async () => {
    class Geocoder {
      geocode(
        _request: { address: string; region?: string },
        callback: (
          results: Array<{ geometry: { location: { lat: () => number; lng: () => number } } }>,
          status: string,
        ) => void,
      ) {
        callback([
          {
            geometry: {
              location: {
                lat: () => 38.0202,
                lng: () => 23.7126,
              },
            },
          },
        ], "OK");
      }
    }
    vi.stubGlobal("google", { maps: { Geocoder } });

    await expect(geocodeAddressText({
      address: "Υμηττού 6",
      city: "Άγιοι Ανάργυροι Αττικής",
    })).resolves.toEqual({
      latitude: "38.0202",
      longitude: "23.7126",
    });
  });
});
