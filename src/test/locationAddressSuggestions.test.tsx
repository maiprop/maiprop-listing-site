import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocationInput } from "@/components/index/LocationInput";
import { LocationSearchField } from "@/components/listings/LocationSearchField";
import { LocationAutocompleteInput } from "@/components/location/LocationAutocompleteInput";

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "maps-key",
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
    expect(await screen.findByRole("button", { name: ADDRESS_SUGGESTION })).toBeInTheDocument();
  });

  it("keeps the homepage location field isolated from mobile browser autocomplete overlays", () => {
    function ControlledLocationInput() {
      const [value, setValue] = useState("");
      return <LocationInput value={value} onChange={setValue} onSearch={vi.fn()} />;
    }

    render(<ControlledLocationInput />);
    const input = screen.getByLabelText("Location search");

    expect(input).toHaveAttribute("autocomplete", "new-password");
    expect(input).toHaveAttribute("autocorrect", "off");
    expect(input).toHaveAttribute("autocapitalize", "none");
    expect(input).toHaveAttribute("spellcheck", "false");
    expect(input).toHaveAttribute("enterkeyhint", "search");

    fireEvent.change(input, { target: { value: "Κα" } });
    expect(screen.getByRole("button", { name: "Clear location" })).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: greekSuggestion })).toBeInTheDocument();
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
    expect(await screen.findByRole("button", { name: ADDRESS_SUGGESTION })).toBeInTheDocument();
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

    fireEvent.focus(screen.getByLabelText("Project city"));
    fireEvent.click(screen.getByRole("option", { name: "Athens" }));

    expect(screen.getByLabelText("Project city")).toHaveValue("Athens");
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

    fireEvent.click(await screen.findByRole("option", { name: ADDRESS_SUGGESTION }));

    expect(screen.getByLabelText("Project address")).toHaveValue("14 Voukourestiou");
    expect(onSuggestionSelect).toHaveBeenCalledWith(expect.objectContaining({
      city: "Athens",
      municipality: "Municipality of Athens",
      postalCode: "10671",
      latitude: "37.9779",
      longitude: "23.7354",
    }));
  });
});
