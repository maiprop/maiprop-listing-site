import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepLocation } from "@/components/listings/StepLocation";
import type { ListingFormData } from "@/hooks/useListingForm";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "maps-key",
}));

vi.mock("@/lib/googleMapsPlaces", () => ({
  loadGoogleMapsPlaces: vi.fn(),
}));

const form = (overrides: Partial<ListingFormData> = {}) => ({
  city: "",
  address: "",
  region: "",
  postal_code: "",
  cadastre_number: "",
  enfia_zone: "",
  ...overrides,
}) as ListingFormData;

describe("StepLocation Google Places fallback", () => {
  beforeEach(() => {
    vi.mocked(loadGoogleMapsPlaces).mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uses Nominatim suggestions when a Google key exists but Places cannot load", async () => {
    vi.mocked(loadGoogleMapsPlaces).mockRejectedValue(new Error("Google Maps failed to load"));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        {
          display_name: "Voukourestiou 14, Athens, Attica, Greece",
          address: {
            road: "Voukourestiou",
            house_number: "14",
            city: "Athens",
            state: "Attica",
            postcode: "10674",
          },
        },
      ])),
    );
    vi.stubGlobal("fetch", fetchMock);

    const set = vi.fn();
    render(
      <StepLocation
        form={form({ address: "Voukourestiou", city: "Athens" })}
        set={set}
        errors={{}}
        setFieldRef={() => () => undefined}
        connections={{ loading: false, supabaseOk: true, storageOk: true, locationOk: true, locationSource: "google" }}
        stepActive
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText("e.g. Voukourestiou 14, Athens"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("countrycodes=gr");
    expect(String(fetchMock.mock.calls[0][0])).toContain("Voukourestiou");

    fireEvent.click(await screen.findByText(/Voukourestiou 14, Athens/i));
    expect(set).toHaveBeenCalledWith("address", "14 Voukourestiou");
    expect(set).toHaveBeenCalledWith("city", "Athens");
    expect(set).toHaveBeenCalledWith("region", "Attica");
    expect(set).toHaveBeenCalledWith("postal_code", "10674");
  });
});
