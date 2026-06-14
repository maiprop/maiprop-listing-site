import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { UnitShowcase } from "@/components/new-build/UnitShowcase";

describe("UnitShowcase", () => {
  it("renders project units as scannable cards with price, status, and labeled specs", () => {
    const onContact = vi.fn();
    render(
      <UnitShowcase
        listing={{ price: 275000, sqm: 39, bedrooms: 1, bathrooms: 1 }}
        onContact={onContact}
        units={[
          {
            id: "u1",
            unit_number: "1",
            availability_status: "available",
            internal_sqm: 39,
            floor: 1,
            bedrooms: 1,
            bathrooms: 1,
            price: 275000,
            price_per_sqm: 7051,
            vat_included: false,
          },
          {
            id: "u2",
            unit_number: "2",
            availability_status: "available",
            internal_sqm: 49,
            balcony_sqm: 20,
            bedrooms: 1,
            bathrooms: 1,
            price: 350000,
            price_per_sqm: 714.29,
            vat_included: true,
          },
        ]}
      />,
    );

    expect(screen.getByRole("heading", { name: "Units & Availability" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unit 1" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Unit 2" })).toBeInTheDocument();
    expect(screen.getAllByText("Internal").length).toBeGreaterThan(0);
    expect(screen.getByText("Balcony")).toBeInTheDocument();
    expect(screen.getAllByText("VAT").length).toBeGreaterThan(0);
    expect(screen.getByText("Not included")).toBeInTheDocument();
    expect(screen.getByText("Included")).toBeInTheDocument();
    expect(screen.getByText(/7\.143/)).toBeInTheDocument();
    expect(screen.queryByText(/714,29/)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Request schedule" }));
    expect(onContact).toHaveBeenCalledTimes(1);
  });
});
