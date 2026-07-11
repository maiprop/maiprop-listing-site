import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LocationSearchField } from "@/components/listings/LocationSearchField";

vi.mock("@/hooks/useAddressAutocomplete", () => ({
  useAddressAutocomplete: () => ({
    loading: false,
    clear: vi.fn(),
    predictions: [
      {
        id: "google:piraeus-kalymnou-27",
        provider: "google",
        value: "Kalimnou 27 Piraeus",
        title: "Kalimnou 27",
        addressLine: "Kalimnou 27",
        city: "Piraeus",
        municipality: "Piraeus",
        region: "Attica",
        latitude: "37.9339270",
        longitude: "23.6330747",
        googleTypes: ["street_address", "geocode"],
      },
      {
        id: "google:agioi-kalymnou-27",
        provider: "google",
        value: "Kalimnou 27 Agioi Anargiroi",
        title: "Kalimnou 27",
        addressLine: "Kalimnou 27",
        city: "Agioi Anargiroi",
        municipality: "Agioi Anargiroi - Kamatero",
        region: "Attica",
        latitude: "38.027702",
        longitude: "23.71761",
        googleTypes: ["street_address", "geocode"],
      },
    ],
  }),
}));

describe("LocationSearchField display ranking", () => {
  it("renders the typed municipality match before a same-street address in a different municipality", () => {
    render(
      <LocationSearchField
        value=""
        onChange={vi.fn()}
        placeholder="City, area, address..."
        ariaLabel="Search by city or area"
      />,
    );

    const input = screen.getByLabelText("Search by city or area");
    fireEvent.focus(input);
    fireEvent.change(input, {
      target: { value: "Kalimnou 27 Agioi Anargiroi" },
    });

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Agioi Anargiroi");
    expect(options).toHaveLength(1);
  });

  it("commits the ranked visible suggestion on Enter instead of the provider's raw first result", async () => {
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
    fireEvent.change(input, {
      target: { value: "Kalimnou 27 Agioi Anargiroi" },
    });
    fireEvent.keyDown(input, { key: "Enter" });

    await waitFor(() => {
      expect(onChange).toHaveBeenCalledWith(
        "Kalimnou 27",
        expect.objectContaining({
          latitude: "38.027702",
          longitude: "23.71761",
        }),
      );
    });
  });
});
