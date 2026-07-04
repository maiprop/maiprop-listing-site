import { useState } from "react";
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

    const suggestionButton = await screen.findByRole("option", { name: /14 Voukourestiou/i });
    fireEvent.mouseDown(suggestionButton);
    fireEvent.click(suggestionButton);
    expect(set).toHaveBeenCalledWith("address", "14 Voukourestiou");
    expect(set).toHaveBeenCalledWith("city", "Athens");
    expect(set).toHaveBeenCalledWith("region", "Attica");
    expect(set).toHaveBeenCalledWith("postal_code", "10674");
    expect(set).toHaveBeenCalledWith("latitude", "37.9779");
    expect(set).toHaveBeenCalledWith("longitude", "23.7354");
  });

  it("keeps the address input editable instead of mounting legacy Google Places", async () => {
    const AutocompleteMock = vi.fn((input: HTMLInputElement) => {
      input.disabled = true;
      input.placeholder = "Oops! Something went wrong.";
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

    const input = screen.getByPlaceholderText("e.g. Voukourestiou 14, Athens");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(loadGoogleMapsPlaces).toHaveBeenCalled();
    expect(AutocompleteMock).not.toHaveBeenCalled();
    expect(input).not.toBeDisabled();
    const suggestionButton = await screen.findByRole("option", { name: /14 Voukourestiou/i });
    fireEvent.click(suggestionButton);
    expect(set).toHaveBeenCalledWith("address", "14 Voukourestiou");
    expect(set).toHaveBeenCalledWith("city", "Athens");
    expect(set).toHaveBeenCalledWith("region", "Attica");
    expect(set).toHaveBeenCalledWith("postal_code", "10674");
    expect(set).toHaveBeenCalledWith("latitude", "37.9779");
    expect(set).toHaveBeenCalledWith("longitude", "23.7354");
  });

  it("does not let the blur fallback overwrite a selected controlled address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([
        {
          display_name: "Ermou 12, Athens, Attica, Greece",
          lat: "37.975",
          lon: "23.731",
          address: {
            road: "Ermou",
            house_number: "12",
            city: "Athens",
            state: "Attica",
            postcode: "10563",
          },
        },
      ])),
    );
    vi.stubGlobal("fetch", fetchMock);

    function ControlledStepLocation() {
      const [data, setData] = useState(form({ address: "Ermou", city: "Athens", latitude: "", longitude: "" } as Partial<ListingFormData>));
      return (
        <StepLocation
          form={data}
          set={(key, value) => setData((current) => ({ ...current, [key]: value as never }))}
          errors={{}}
          setFieldRef={() => () => undefined}
          connections={{ loading: false, supabaseOk: true, storageOk: true, locationOk: true, locationSource: "google" }}
          stepActive
        />
      );
    }

    render(<ControlledStepLocation />);

    const addressInput = screen.getByPlaceholderText("e.g. Voukourestiou 14, Athens");
    fireEvent.focus(addressInput);
    fireEvent.change(addressInput, { target: { value: "Ermou 12" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const suggestionButton = await screen.findByRole("option", { name: /12 Ermou/i });
    fireEvent.click(suggestionButton);
    fireEvent.blur(addressInput);

    await waitFor(() => expect(addressInput).toHaveValue("12 Ermou"));
    expect(addressInput).not.toHaveValue("Ermou 12");
  });

  it("keeps address suggestions visible without giving Google Places control of the input", async () => {
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
    expect(loadGoogleMapsPlaces).toHaveBeenCalled();
    expect(AutocompleteMock).not.toHaveBeenCalled();
    expect(await screen.findByRole("option", { name: /14 Voukourestiou/i })).toBeInTheDocument();
  });

  it("auto-applies the first address suggestion on blur when typed text has no saved coordinates", async () => {
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
    await screen.findByText("14 Voukourestiou");

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
