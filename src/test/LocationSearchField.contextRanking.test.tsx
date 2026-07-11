import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocationSearchField } from "@/components/listings/LocationSearchField";

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "",
  GOOGLE_PLACES_AUTOCOMPLETE_ENABLED: false,
}));

describe("LocationSearchField context ranking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("submits the municipality-matching address when same street-number suggestions exist", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify([
      {
        display_name: "27 Kalimnou, Piraeus, Attica, Greece",
        lat: "37.9339270",
        lon: "23.6330747",
        address: {
          house_number: "27",
          road: "Kalimnou",
          city: "Piraeus",
          municipality: "Municipality of Piraeus",
          state: "Attica",
          postcode: "18538",
        },
      },
      {
        display_name: "27 Kalimnou, Agioi Anargiroi, Attica, Greece",
        lat: "38.030103",
        lon: "23.724004",
        address: {
          house_number: "27",
          road: "Kalimnou",
          city: "Agioi Anargiroi",
          municipality: "Agioi Anargiroi - Kamatero",
          state: "Attica",
          postcode: "13562",
        },
      },
    ])));
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
    fireEvent.change(input, { target: { value: "Kalimnou 27, Agioi Anargiroi" } });

    await act(async () => {
      vi.advanceTimersByTime(450);
      await Promise.resolve();
      await Promise.resolve();
    });
    vi.useRealTimers();

    fireEvent.keyDown(input, { key: "Enter", code: "Enter" });

    await waitFor(() => expect(onFilterChange).toHaveBeenLastCalledWith("27 Kalimnou", expect.objectContaining({
      latitude: "38.030103",
      longitude: "23.724004",
      radiusM: 750,
      provider: "nominatim",
    })));
  });
});
