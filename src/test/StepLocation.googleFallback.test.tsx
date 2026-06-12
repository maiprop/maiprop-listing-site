import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { StepLocation } from "@/components/listings/StepLocation";
import type { ListingFormData } from "@/hooks/useListingForm";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "maps-key",
  GOOGLE_PLACES_AUTOCOMPLETE_ENABLED: true,
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
          lat: "37.9779",
          lon: "23.7354",
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

    const suggestionButton = await screen.findByRole("button", { name: /Voukourestiou 14, Athens/i });
    fireEvent.mouseDown(suggestionButton);
    fireEvent.click(suggestionButton);
    expect(set).toHaveBeenCalledWith("address", "14 Voukourestiou");
    expect(set).toHaveBeenCalledWith("city", "Athens");
    expect(set).toHaveBeenCalledWith("region", "Attica");
    expect(set).toHaveBeenCalledWith("postal_code", "10674");
    expect(set).toHaveBeenCalledWith("latitude", "37.9779");
    expect(set).toHaveBeenCalledWith("longitude", "23.7354");
  });

  it("saves Google Places geometry when a Google address is selected", async () => {
    let placeChanged: (() => void) | undefined;
    const getPlace = vi.fn().mockReturnValue({
      formatted_address: "Voukourestiou 14, Athens, Greece",
      geometry: {
        location: {
          lat: () => 37.9779,
          lng: () => 23.7354,
        },
      },
      address_components: [
        { long_name: "Voukourestiou", short_name: "Voukourestiou", types: ["route"] },
        { long_name: "14", short_name: "14", types: ["street_number"] },
        { long_name: "Athens", short_name: "Athens", types: ["locality"] },
        { long_name: "Attica", short_name: "Attica", types: ["administrative_area_level_1"] },
        { long_name: "10674", short_name: "10674", types: ["postal_code"] },
      ],
    });
    vi.mocked(loadGoogleMapsPlaces).mockResolvedValue(undefined);
    const AutocompleteMock = vi.fn(function () {
      return {
        addListener: vi.fn((_event: string, cb: () => void) => {
          placeChanged = cb;
        }),
        getPlace,
      };
    });
    vi.stubGlobal("google", {
      maps: {
        places: {
          Autocomplete: AutocompleteMock,
        },
      },
    });
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
    await waitFor(() => expect(loadGoogleMapsPlaces).toHaveBeenCalled());
    placeChanged?.();

    expect(set).toHaveBeenCalledWith("address", "14 Voukourestiou");
    expect(set).toHaveBeenCalledWith("city", "Athens");
    expect(set).toHaveBeenCalledWith("region", "Attica");
    expect(set).toHaveBeenCalledWith("postal_code", "10674");
    expect(set).toHaveBeenCalledWith("latitude", "37.9779");
    expect(set).toHaveBeenCalledWith("longitude", "23.7354");
  });

  it("keeps address suggestions visible when Google Places loads but gives no prediction list", async () => {
    vi.mocked(loadGoogleMapsPlaces).mockResolvedValue(undefined);
    const AutocompleteMock = vi.fn(function () {
      return {
        addListener: vi.fn(),
        getPlace: vi.fn(),
      };
    });
    vi.stubGlobal("google", {
      maps: {
        places: {
          Autocomplete: AutocompleteMock,
        },
      },
    });
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

    render(
      <StepLocation
        form={form({ address: "Voukourestiou", city: "Athens" })}
        set={vi.fn()}
        errors={{}}
        setFieldRef={() => () => undefined}
        connections={{ loading: false, supabaseOk: true, storageOk: true, locationOk: true, locationSource: "google" }}
        stepActive
      />,
    );

    fireEvent.focus(screen.getByPlaceholderText("e.g. Voukourestiou 14, Athens"));

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await waitFor(() => expect(loadGoogleMapsPlaces).toHaveBeenCalled());
    expect(await screen.findByText(/Voukourestiou 14, Athens/i)).toBeInTheDocument();
  });

  it("auto-applies the first address suggestion on blur when typed text has no saved coordinates", async () => {
    vi.mocked(loadGoogleMapsPlaces).mockRejectedValue(new Error("Google Maps failed to load"));
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        {
          display_name: "Voukourestiou 14, Athens, Attica, Greece",
          lat: "37.9779",
          lon: "23.7354",
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
        form={form({ address: "Voukourestiou 14", city: "Athens", latitude: "", longitude: "" } as Partial<ListingFormData>)}
        set={set}
        errors={{}}
        setFieldRef={() => () => undefined}
        connections={{ loading: false, supabaseOk: true, storageOk: true, locationOk: true, locationSource: "google" }}
        stepActive
      />,
    );

    const addressInput = screen.getByPlaceholderText("e.g. Voukourestiou 14, Athens");
    fireEvent.focus(addressInput);
    await screen.findByText(/Voukourestiou 14, Athens/i);

    fireEvent.blur(addressInput);

    await waitFor(() => {
      expect(set).toHaveBeenCalledWith("address", "14 Voukourestiou");
      expect(set).toHaveBeenCalledWith("city", "Athens");
      expect(set).toHaveBeenCalledWith("region", "Attica");
      expect(set).toHaveBeenCalledWith("postal_code", "10674");
      expect(set).toHaveBeenCalledWith("latitude", "37.9779");
      expect(set).toHaveBeenCalledWith("longitude", "23.7354");
    });
  });
});
