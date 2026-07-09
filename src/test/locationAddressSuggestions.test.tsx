import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocationInput } from "@/components/index/LocationInput";
import { LocationSearchField } from "@/components/listings/LocationSearchField";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";
import { loadGoogleMapsPlaces } from "@/lib/googleMapsPlaces";

const configMock = vi.hoisted(() => ({
  googlePlacesEnabled: false,
}));

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "maps-key",
  get GOOGLE_PLACES_AUTOCOMPLETE_ENABLED() {
    return configMock.googlePlacesEnabled;
  },
}));

vi.mock("@/lib/googleMapsPlaces", () => ({
  loadGoogleMapsPlaces: vi.fn().mockResolvedValue(undefined),
}));

const ADDRESS_SUGGESTION = "Voukourestiou 14, Athens, Attica, Greece";
const STRUCTURED_ADDRESS_SUGGESTION = {
  display_name: ADDRESS_SUGGESTION,
  lat: "37.9779",
  lon: "23.7354",
  address: {
    road: "Voukourestiou",
    house_number: "14",
    city: "Athens",
    municipality: "Municipality of Athens",
    postcode: "10671",
  },
};

function mockGoogleAutocomplete() {
  const fetchFields = vi.fn().mockResolvedValue(undefined);
  const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
    suggestions: [
      {
        placePrediction: {
          placeId: "google-voukourestiou-14",
          text: { toString: () => "Voukourestiou 14, Athens, Greece" },
          mainText: { toString: () => "Voukourestiou 14" },
          secondaryText: { toString: () => "Athens, Greece" },
          toPlace: () => ({
            fetchFields,
            formattedAddress: "Voukourestiou 14, Athens 10671, Greece",
            location: { lat: () => 37.9779, lng: () => 23.7354 },
            addressComponents: [
              { longText: "14", types: ["street_number"] },
              { longText: "Voukourestiou", types: ["route"] },
              { longText: "Athens", types: ["locality"] },
              { longText: "Central Athens", types: ["administrative_area_level_2"] },
              { longText: "Attica", types: ["administrative_area_level_1"] },
              { longText: "10671", types: ["postal_code"] },
              { longText: "Greece", types: ["country"] },
            ],
          }),
        },
      },
    ],
  });
  const AutocompleteMock = vi.fn();
  const importLibrary = vi.fn().mockResolvedValue({
    AutocompleteSessionToken: class AutocompleteSessionToken {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
  });
  vi.stubGlobal("google", {
    maps: {
      importLibrary,
      places: { Autocomplete: AutocompleteMock },
    },
  });
  return { AutocompleteMock, fetchAutocompleteSuggestions, fetchFields, importLibrary };
}

function mockGoogleBroadAtticaAutocomplete() {
  const fetchFields = vi.fn().mockResolvedValue(undefined);
  const fetchAutocompleteSuggestions = vi.fn().mockResolvedValue({
    suggestions: [
      {
        placePrediction: {
          placeId: "google-attica-region",
          types: ["administrative_area_level_1", "political"],
          text: { toString: () => "Περιφέρεια Αττικής, Ελλάδα" },
          mainText: { toString: () => "Περιφέρεια Αττικής" },
          secondaryText: { toString: () => "Ελλάδα" },
          toPlace: () => ({
            fetchFields,
            formattedAddress: "Περιφέρεια Αττικής, Ελλάδα",
            addressComponents: [
              { longText: "Περιφέρεια Αττικής", types: ["administrative_area_level_1", "political"] },
              { longText: "Ελλάδα", types: ["country", "political"] },
            ],
            types: ["administrative_area_level_1", "political"],
          }),
        },
      },
    ],
  });
  const importLibrary = vi.fn().mockResolvedValue({
    AutocompleteSessionToken: class AutocompleteSessionToken {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
  });
  vi.stubGlobal("google", {
    maps: {
      importLibrary,
      places: { Autocomplete: vi.fn() },
    },
  });
  return { fetchAutocompleteSuggestions, fetchFields };
}

function mockGoogleLegacyAutocompleteFallback() {
  const fetchAutocompleteSuggestions = vi.fn().mockRejectedValue(new Error("new-places-rpc-403"));
  const getPlacePredictions = vi.fn((_request, callback) => callback([
    {
      place_id: "legacy-voukourestiou-14",
      description: "Voukourestiou 14, Athens, Greece",
      structured_formatting: {
        main_text: "Voukourestiou 14",
        secondary_text: "Athens, Greece",
      },
      types: ["street_address", "geocode"],
    },
  ], "OK"));
  const importLibrary = vi.fn().mockResolvedValue({
    AutocompleteSessionToken: class AutocompleteSessionToken {},
    AutocompleteSuggestion: { fetchAutocompleteSuggestions },
  });
  vi.stubGlobal("google", {
    maps: {
      importLibrary,
      places: {
        Autocomplete: vi.fn(),
        AutocompleteService: vi.fn(function AutocompleteService() {
          return { getPlacePredictions };
        }),
        PlacesServiceStatus: { OK: "OK", ZERO_RESULTS: "ZERO_RESULTS" },
      },
    },
  });
  return { fetchAutocompleteSuggestions, getPlacePredictions };
}

const AGIOI_ANARGYROI_SUGGESTION = {
  display_name: "Άγιοι Ανάργυροι, Δήμος Αγίων Αναργύρων - Καματερού, Περιφέρεια Αττικής, Ελλάδα",
  lat: "38.0301",
  lon: "23.7241",
  address: {
    suburb: "Άγιοι Ανάργυροι",
    municipality: "Δήμος Αγίων Αναργύρων - Καματερού",
    state: "Περιφέρεια Αττικής",
    country: "Ελλάδα",
  },
};

function mockAddressFetch() {
  const fetchMock = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([{ display_name: ADDRESS_SUGGESTION }])),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

async function typeAddress(label: string) {
  fireEvent.focus(screen.getByLabelText(label));
  fireEvent.change(screen.getByLabelText(label), { target: { value: "Voukourestiou 14" } });

  await act(async () => {
    vi.advanceTimersByTime(450);
    await Promise.resolve();
    await Promise.resolve();
  });
}

describe("location address suggestions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    configMock.googlePlacesEnabled = false;
    vi.mocked(loadGoogleMapsPlaces).mockClear();
    vi.mocked(loadGoogleMapsPlaces).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("shows address suggestions in the homepage location bar when the user types a street address", async () => {
    const fetchMock = mockAddressFetch();

    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={vi.fn()} />;
    }

    render(<ControlledLocationInput />);
    await typeAddress("Location search");
    vi.useRealTimers();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("countrycodes=gr");
    expect(String(fetchMock.mock.calls[0][0])).toContain("Voukourestiou%2014");
    expect(await screen.findByText("Voukourestiou 14")).toBeInTheDocument();
    expect(screen.getByText("Athens - Attica")).toBeInTheDocument();
  });

  it("keeps the homepage location field isolated from mobile browser autocomplete overlays", () => {
    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={vi.fn()} />;
    }

    render(<ControlledLocationInput />);
    const input = screen.getByLabelText("Location search");

    expect(input).toHaveAttribute("type", "search");
    expect(input).toHaveAttribute("autocomplete", "off");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("enterkeyhint", "search");
    expect(input).toHaveAttribute("data-lpignore", "true");
    expect(input).toHaveAttribute("data-1p-ignore", "true");
    expect(input).toHaveAttribute("data-bwignore", "true");
    expect(input).toHaveAttribute("data-form-type", "other");

    fireEvent.change(input, { target: { value: "Κα" } });
    expect(screen.getByRole("button", { name: "Clear location" })).toBeInTheDocument();
  });

  it("shows real popular options for a one-character Greek prefix instead of echoing the raw input", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={vi.fn()} />;
    }

    render(<ControlledLocationInput />);
    const input = screen.getByLabelText("Location search");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "\u039A" } });

    expect(screen.getByRole("option", { name: "Kallithea" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Kalamata" })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: "\u039A" })).not.toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows Greek location options from a two-character mobile prefix", async () => {
    const greekSuggestion = "Καλλιθέα, Νότιος Τομέας Αθηνών, Αττική, Ελλάδα";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([{ display_name: greekSuggestion }])),
    );
    vi.stubGlobal("fetch", fetchMock);

    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={vi.fn()} />;
    }

    render(<ControlledLocationInput />);
    fireEvent.focus(screen.getByLabelText("Location search"));
    fireEvent.change(screen.getByLabelText("Location search"), { target: { value: "Κα" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("q=%CE%9A%CE%B1");
    expect(await screen.findByText(greekSuggestion.split(",")[0])).toBeInTheDocument();
  });

  it("shows address suggestions in the listings location filter when the user types a street address", async () => {
    const fetchMock = mockAddressFetch();

    function ControlledLocationSearchField() {
      const [value, setValue] = useState("");
      return (
        <LocationSearchField
          value={value}
          onChange={setValue}
          placeholder="City, area, address..."
          ariaLabel="Search by city or area"
        />
      );
    }

    render(<ControlledLocationSearchField />);
    await typeAddress("Search by city or area");
    vi.useRealTimers();

    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(String(fetchMock.mock.calls[0][0])).toContain("countrycodes=gr");
    expect(String(fetchMock.mock.calls[0][0])).toContain("Voukourestiou%2014");
    expect(await screen.findByText("Voukourestiou 14")).toBeInTheDocument();
    expect(screen.getByText("Athens - Attica")).toBeInTheDocument();
  });

  it("keeps the listings location filter controlled instead of attaching Google Places directly", async () => {
    configMock.googlePlacesEnabled = true;
    const { AutocompleteMock } = mockGoogleAutocomplete();

    function ControlledLocationSearchField() {
      const [value, setValue] = useState("");
      return (
        <LocationSearchField
          value={value}
          onChange={setValue}
          placeholder="City, area, address..."
          ariaLabel="Search by city or area"
        />
      );
    }

    render(<ControlledLocationSearchField />);
    fireEvent.focus(screen.getByLabelText("Search by city or area"));

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
    });

    expect(loadGoogleMapsPlaces).not.toHaveBeenCalled();
    expect(AutocompleteMock).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Search by city or area")).not.toBeDisabled();
  });

  it("keeps typed full addresses visible while listings URL filters reconcile", () => {
    const onChange = vi.fn();

    render(
      <LocationSearchField
        value=""
        onChange={onChange}
        placeholder="City, area, address..."
        ariaLabel="Search by city or area"
      />,
    );

    const input = screen.getByLabelText("Search by city or area");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Ermou 12 Athens" } });

    expect(input).toHaveValue("Ermou 12 Athens");
    expect(onChange).toHaveBeenLastCalledWith("Ermou 12 Athens");
  });

  it("uses a selected listings address suggestion's address line for the location filter", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([STRUCTURED_ADDRESS_SUGGESTION])),
    );
    vi.stubGlobal("fetch", fetchMock);

    function DeferredLocationSearchField() {
      const [value, setValue] = useState("");
      return (
        <LocationSearchField
          value={value}
          onChange={setValue}
          placeholder="City, area, address..."
          ariaLabel="Search by city or area"
        />
      );
    }

    render(<DeferredLocationSearchField />);
    const input = screen.getByLabelText("Search by city or area");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.click(await screen.findByRole("option", { name: /14 Voukourestiou/i }));

    await waitFor(() => expect(input).toHaveValue("14 Voukourestiou"));
  });

  it("uses the first provider suggestion when a listings user presses Enter after typing an address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([STRUCTURED_ADDRESS_SUGGESTION])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onChange = vi.fn();

    render(
      <LocationSearchField
        value=""
        onChange={onChange}
        placeholder="City, area, address..."
        ariaLabel="Search by city or area"
      />,
    );

    const input = screen.getByLabelText("Search by city or area");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(input).toHaveValue("14 Voukourestiou"));
    expect(onChange).toHaveBeenLastCalledWith("14 Voukourestiou", expect.objectContaining({
      latitude: "37.9779",
      longitude: "23.7354",
      radiusM: 750,
    }));
  });

  it("shows popular city options in shared location input fields", () => {
    function ControlledCityField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="project-city">Project city</label>
          <LocationAutocompleteInput
            id="project-city"
            mode="city"
            value={value}
            onChange={setValue}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledCityField />);

    const input = screen.getByRole("combobox", { name: "Project city" });
    expect(input).toHaveAttribute("aria-expanded", "false");

    fireEvent.focus(input);
    expect(input).toHaveAttribute("aria-expanded", "true");
    fireEvent.click(screen.getByRole("option", { name: "Athens" }));

    expect(input).toHaveValue("Athens");
  });

  it("returns structured details when a shared address field suggestion is selected", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([STRUCTURED_ADDRESS_SUGGESTION])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSuggestionSelect = vi.fn();

    function ControlledAddressField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="project-address">Project address</label>
          <LocationAutocompleteInput
            id="project-address"
            mode="address"
            value={value}
            onChange={setValue}
            onSuggestionSelect={onSuggestionSelect}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledAddressField />);
    fireEvent.focus(screen.getByLabelText("Project address"));
    fireEvent.change(screen.getByLabelText("Project address"), { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    const option = await screen.findByRole("option", { name: /14 Voukourestiou/i });
    expect(option).toHaveTextContent("14 Voukourestiou");
    expect(option).toHaveTextContent("Athens - Municipality of Athens - 10671");
    expect(screen.queryByText(ADDRESS_SUGGESTION)).not.toBeInTheDocument();

    fireEvent.click(option);

    expect(screen.getByLabelText("Project address")).toHaveValue("14 Voukourestiou");
    expect(onSuggestionSelect).toHaveBeenCalledWith(expect.objectContaining({
      city: "Athens",
      municipality: "Municipality of Athens",
      postalCode: "10671",
      latitude: "37.9779",
      longitude: "23.7354",
    }));
  });

  it("auto-applies the first shared address suggestion on blur", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([STRUCTURED_ADDRESS_SUGGESTION])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSuggestionSelect = vi.fn();

    function ControlledAddressField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="blur-project-address">Project address</label>
          <LocationAutocompleteInput
            id="blur-project-address"
            mode="address"
            value={value}
            onChange={setValue}
            onSuggestionSelect={onSuggestionSelect}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledAddressField />);
    const input = screen.getByLabelText("Project address");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    const option = await screen.findByRole("option", { name: /14 Voukourestiou/i });
    expect(option).toHaveTextContent("Athens - Municipality of Athens - 10671");
    fireEvent.blur(input);

    expect(input).toHaveValue("14 Voukourestiou");
    expect(onSuggestionSelect).toHaveBeenCalledWith(expect.objectContaining({
      city: "Athens",
      municipality: "Municipality of Athens",
      postalCode: "10671",
      latitude: "37.9779",
      longitude: "23.7354",
    }));
  });

  it("keeps shared address fields editable when Google Places is enabled but unavailable", async () => {
    configMock.googlePlacesEnabled = true;
    vi.stubGlobal("google", {
      maps: {
        places: {
          Autocomplete: vi.fn((input: HTMLInputElement) => {
            input.disabled = true;
            input.placeholder = "Oops! Something went wrong.";
            return { addListener: vi.fn(), getPlace: vi.fn() };
          }),
        },
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([STRUCTURED_ADDRESS_SUGGESTION])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSuggestionSelect = vi.fn();

    function ControlledAddressField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="google-project-address">Project address</label>
          <LocationAutocompleteInput
            id="google-project-address"
            mode="address"
            value={value}
            onChange={setValue}
            onSuggestionSelect={onSuggestionSelect}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledAddressField />);
    const input = screen.getByLabelText("Project address");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(loadGoogleMapsPlaces).toHaveBeenCalled();
    expect(window.google?.maps?.places?.Autocomplete).not.toHaveBeenCalled();
    expect(input).not.toBeDisabled();
    const option = await screen.findByRole("option", { name: /14 Voukourestiou/i });
    fireEvent.click(option);

    expect(input).toHaveValue("14 Voukourestiou");
    expect(onSuggestionSelect).toHaveBeenCalledWith(expect.objectContaining({
      city: "Athens",
      municipality: "Municipality of Athens",
      postalCode: "10671",
      latitude: "37.9779",
      longitude: "23.7354",
    }));
  });

  it("uses Google Places predictions through the controlled dropdown and resolves details on selection", async () => {
    configMock.googlePlacesEnabled = true;
    const { AutocompleteMock, fetchAutocompleteSuggestions, fetchFields } = mockGoogleAutocomplete();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);
    const onSuggestionSelect = vi.fn();

    function ControlledAddressField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="google-details-address">Project address</label>
          <LocationAutocompleteInput
            id="google-details-address"
            mode="address"
            value={value}
            onChange={setValue}
            onSuggestionSelect={onSuggestionSelect}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledAddressField />);
    const input = screen.getByLabelText("Project address");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(loadGoogleMapsPlaces).toHaveBeenCalled();
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({
      input: "Voukourestiou 14",
      includedRegionCodes: ["gr"],
      language: "el",
      region: "gr",
    }));
    expect(AutocompleteMock).not.toHaveBeenCalled();

    expect(screen.getByText("Powered by")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("option", { name: /Voukourestiou 14/i }));

    await waitFor(() => expect(fetchFields).toHaveBeenCalledWith(expect.objectContaining({
      fields: expect.arrayContaining(["formattedAddress", "location", "addressComponents"]),
    })));
    await waitFor(() => expect(input).toHaveValue("14 Voukourestiou"));
    expect(onSuggestionSelect).toHaveBeenCalledWith(expect.objectContaining({
      provider: "google",
      addressLine: "14 Voukourestiou",
      city: "Athens",
      municipality: "Central Athens",
      region: "Attica",
      postalCode: "10671",
      latitude: "37.9779",
      longitude: "23.7354",
    }));
  });

  it("uses a Google prediction's resolved address line for listing location filters", async () => {
    configMock.googlePlacesEnabled = true;
    const { AutocompleteMock, fetchAutocompleteSuggestions, fetchFields } = mockGoogleAutocomplete();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);
    const onFilterChange = vi.fn();

    function ControlledLocationSearchField() {
      const [value, setValue] = useState("");
      return (
        <LocationSearchField
          value={value}
          onChange={(next, selection) => {
            setValue(next);
            onFilterChange(next, selection);
          }}
          placeholder="City, area, address..."
          ariaLabel="Search by city or area"
        />
      );
    }

    render(<ControlledLocationSearchField />);
    const input = screen.getByLabelText("Search by city or area");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(loadGoogleMapsPlaces).toHaveBeenCalled();
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({
      input: "Voukourestiou 14",
    }));
    expect(AutocompleteMock).not.toHaveBeenCalled();
    expect(screen.getByText("Powered by")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("option", { name: /Voukourestiou 14/i }));

    await waitFor(() => expect(fetchFields).toHaveBeenCalled());
    await waitFor(() => expect(onFilterChange).toHaveBeenLastCalledWith("14 Voukourestiou", expect.objectContaining({
      latitude: "37.9779",
      longitude: "23.7354",
      radiusM: 750,
      provider: "google",
    })));
    expect(input).toHaveValue("14 Voukourestiou");
  });

  it("uses a Google prediction's resolved address line for homepage searches", async () => {
    configMock.googlePlacesEnabled = true;
    const { AutocompleteMock, fetchAutocompleteSuggestions, fetchFields } = mockGoogleAutocomplete();
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([])));
    vi.stubGlobal("fetch", fetchMock);
    const onSearch = vi.fn();

    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={onSearch} />;
    }

    render(<ControlledLocationInput />);
    const input = screen.getByLabelText("Location search");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(loadGoogleMapsPlaces).toHaveBeenCalled();
    expect(fetchAutocompleteSuggestions).toHaveBeenCalledWith(expect.objectContaining({
      input: "Voukourestiou 14",
    }));
    expect(AutocompleteMock).not.toHaveBeenCalled();
    expect(screen.getByText("Powered by")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("option", { name: /Voukourestiou 14/i }));

    await waitFor(() => expect(fetchFields).toHaveBeenCalled());
    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("14 Voukourestiou", expect.objectContaining({
      latitude: "37.9779",
      longitude: "23.7354",
      radiusM: 750,
      provider: "google",
    })));
    expect(input).toHaveValue("14 Voukourestiou");
  });

  it("uses legacy Google autocomplete before the new Places RPC when available", async () => {
    configMock.googlePlacesEnabled = true;
    const { fetchAutocompleteSuggestions, getPlacePredictions } = mockGoogleLegacyAutocompleteFallback();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify([]))));

    function ControlledAddressField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="legacy-google-address">Project address</label>
          <LocationAutocompleteInput
            id="legacy-google-address"
            mode="address"
            value={value}
            onChange={setValue}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledAddressField />);
    const input = screen.getByLabelText("Project address");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(fetchAutocompleteSuggestions).not.toHaveBeenCalled();
    expect(getPlacePredictions).toHaveBeenCalledWith(expect.objectContaining({
      input: "Voukourestiou 14",
      componentRestrictions: { country: "gr" },
    }), expect.any(Function));
    expect(screen.getByText("Powered by")).toBeInTheDocument();
    expect(screen.getByText("Google")).toBeInTheDocument();

    fireEvent.click(await screen.findByRole("option", { name: /Voukourestiou 14/i }));
    expect(input).toHaveValue("Voukourestiou 14");
  });

  it("does not let a broad Google Attica prediction override a specific listings municipality fallback", async () => {
    configMock.googlePlacesEnabled = true;
    mockGoogleBroadAtticaAutocomplete();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([AGIOI_ANARGYROI_SUGGESTION])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onFilterChange = vi.fn();

    function ControlledLocationSearchField() {
      const [value, setValue] = useState("");
      return (
        <LocationSearchField
          value={value}
          onChange={(next, selection) => {
            setValue(next);
            onFilterChange(next, selection);
          }}
          placeholder="City, area, address..."
          ariaLabel="Search by city or area"
        />
      );
    }

    render(<ControlledLocationSearchField />);
    const input = screen.getByLabelText("Search by city or area");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Αγιοι Αναργυροι, Αττικης" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(await screen.findByRole("option", { name: /Δήμος Αγίων Αναργύρων/i })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /^Περιφέρεια Αττικής/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("option", { name: /Δήμος Αγίων Αναργύρων/i }));

    await waitFor(() => expect(onFilterChange).toHaveBeenLastCalledWith("Άγιοι Ανάργυροι", expect.objectContaining({
      latitude: "38.0301",
      longitude: "23.7241",
      radiusM: 750,
      provider: "nominatim",
    })));
    expect(input).toHaveValue("Άγιοι Ανάργυροι");
  });

  it("uses the same specific municipality semantics in the homepage location search", async () => {
    configMock.googlePlacesEnabled = true;
    mockGoogleBroadAtticaAutocomplete();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
      new Response(JSON.stringify([AGIOI_ANARGYROI_SUGGESTION])),
    ));
    const onSearch = vi.fn();

    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={onSearch} />;
    }

    render(<ControlledLocationInput />);
    const input = screen.getByLabelText("Location search");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Αγιοι Αναργυροι, Αττικης" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.click(await screen.findByRole("option", { name: /Δήμος Αγίων Αναργύρων/i }));

    await waitFor(() => expect(onSearch).toHaveBeenLastCalledWith("Άγιοι Ανάργυροι", expect.objectContaining({
      latitude: "38.0301",
      longitude: "23.7241",
      radiusM: 750,
      provider: "nominatim",
    })));
    expect(input).toHaveValue("Άγιοι Ανάργυροι");
  });

  it("uses the first provider suggestion when a homepage user presses Enter after typing an address", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([STRUCTURED_ADDRESS_SUGGESTION])),
    );
    vi.stubGlobal("fetch", fetchMock);
    const onSearch = vi.fn();

    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={onSearch} />;
    }

    render(<ControlledLocationInput />);
    const input = screen.getByLabelText("Location search");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(input).toHaveValue("14 Voukourestiou"));
    expect(onSearch).toHaveBeenLastCalledWith("14 Voukourestiou", expect.objectContaining({
      latitude: "37.9779",
      longitude: "23.7354",
      radiusM: 750,
    }));
  });

  it("supports a second controlled address selection after the first one is applied", async () => {
    vi.useRealTimers();
    configMock.googlePlacesEnabled = true;
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify([STRUCTURED_ADDRESS_SUGGESTION])))
      .mockResolvedValueOnce(new Response(JSON.stringify([{
        display_name: "Ermou 12, Athens, Attica, Greece",
        lat: "37.975",
        lon: "23.731",
        address: {
          road: "Ermou",
          house_number: "12",
          city: "Athens",
          municipality: "Municipality of Athens",
          postcode: "10563",
        },
      }])));
    vi.stubGlobal("fetch", fetchMock);

    function ControlledAddressField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="repeat-google-project-address">Project address</label>
          <LocationAutocompleteInput
            id="repeat-google-project-address"
            mode="address"
            value={value}
            onChange={setValue}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledAddressField />);
    const input = screen.getByLabelText("Project address");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    fireEvent.click(await screen.findByRole("option", { name: /14 Voukourestiou/i }));
    expect(input).toHaveValue("14 Voukourestiou");

    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Ermou 12" } });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    fireEvent.click(await screen.findByRole("option", { name: /12 Ermou/i }));
    expect(input).toHaveValue("12 Ermou");
  });

  it("keeps shared city fields on the controlled popular-suggestion path when Google is enabled", () => {
    configMock.googlePlacesEnabled = true;
    const onSuggestionSelect = vi.fn();

    function ControlledCityField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="google-project-city">Project city</label>
          <LocationAutocompleteInput
            id="google-project-city"
            mode="city"
            value={value}
            onChange={setValue}
            onSuggestionSelect={onSuggestionSelect}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledCityField />);
    const input = screen.getByLabelText("Project city");
    fireEvent.focus(input);
    fireEvent.click(screen.getByRole("option", { name: "Athens" }));

    expect(input).toHaveValue("Athens");
    expect(loadGoogleMapsPlaces).not.toHaveBeenCalled();
    expect(onSuggestionSelect).toHaveBeenCalledWith(expect.objectContaining({
      city: "Athens",
    }));
  });

  it("keeps the fallback address panel available when Google Places cannot provide predictions", async () => {
    configMock.googlePlacesEnabled = true;
    const fetchMock = mockAddressFetch();

    function ControlledAddressField() {
      const [value, setValue] = useState("");
      return (
        <>
          <label htmlFor="google-primary-address">Project address</label>
          <LocationAutocompleteInput
            id="google-primary-address"
            mode="address"
            value={value}
            onChange={setValue}
            inputClassName="border"
          />
        </>
      );
    }

    render(<ControlledAddressField />);
    const input = screen.getByLabelText("Project address");
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "Voukourestiou 14" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    expect(await screen.findByRole("listbox")).toBeInTheDocument();
    expect(screen.getByText("Address Suggestions")).toBeInTheDocument();
    expect(loadGoogleMapsPlaces).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalled();
  });
});
