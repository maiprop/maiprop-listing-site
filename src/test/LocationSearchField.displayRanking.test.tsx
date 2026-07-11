import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { LocationSearchField } from "@/components/listings/LocationSearchField";

vi.mock("@/hooks/useAddressAutocomplete", () => ({
  useAddressAutocomplete: () => ({
    loading: false,
    clear: vi.fn(),
    predictions: [
      {
        id: "google:piraeus-kalymnou-27",
        provider: "google",
        value: "27 Καλύμνου Πειραιάς - Δήμος Πειραιώς - Περιφέρεια Αττικής - 185 38",
        title: "27 Καλύμνου Πειραιάς - Δήμος Πειραιώς - Περιφέρεια Αττικής - 185 38",
        addressLine: "27 Καλύμνου Πειραιάς - Δήμος Πειραιώς - Περιφέρεια Αττικής - 185 38",
        latitude: "37.9339270",
        longitude: "23.6330747",
        googleTypes: ["street_address", "geocode"],
      },
      {
        id: "google:agioi-kalymnou-27",
        provider: "google",
        value: "27 Καλύμνου Δημοτική Ενότητα Αγίων Αναργύρων - Δήμος Αγίων Αναργύρων – Καματερού - Περιφέρεια Αττικής - 135 62",
        title: "27 Καλύμνου Δημοτική Ενότητα Αγίων Αναργύρων - Δήμος Αγίων Αναργύρων – Καματερού - Περιφέρεια Αττικής - 135 62",
        addressLine: "27 Καλύμνου Δημοτική Ενότητα Αγίων Αναργύρων - Δήμος Αγίων Αναργύρων – Καματερού - Περιφέρεια Αττικής - 135 62",
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
      target: { value: "Καλύμνου 27 Άγιοι Ανάργυροι" },
    });

    const options = within(screen.getByRole("listbox")).getAllByRole("option");
    expect(options[0]).toHaveTextContent("Αγίων Αναργύρων");
    expect(options[1]).toHaveTextContent("Πειραιάς");
  });
});
