import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LocationInput } from "@/components/index/LocationInput";
import { LocationSearchField } from "@/components/listings/LocationSearchField";

vi.mock("@/lib/config", () => ({
  GOOGLE_MAPS_API_KEY: "maps-key",
}));

vi.mock("@/lib/googleMapsPlaces", () => ({
  loadGoogleMapsPlaces: vi.fn().mockResolvedValue(undefined),
}));

const ADDRESS_SUGGESTION = "Voukourestiou 14, Athens, Attica, Greece";

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
});
