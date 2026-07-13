import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { CompareDrawer } from "@/components/CompareDrawer";

vi.mock("@/components/CompareAIReports", () => ({
  CompareAIReports: () => (
    <tr>
      <td>AI compare stub</td>
    </tr>
  ),
}));

const onRemove = vi.fn();
const onClear = vi.fn();

const listing = (id: string, raw: Record<string, unknown> = {}) => ({
  id,
  title: `Listing ${id}`,
  images: [],
  _raw: {
    city: "Athens",
    price: 250000,
    price_per_sqm: 3000,
    sqm: 80,
    bedrooms: 2,
    bathrooms: 1,
    floor: 0,
    year_built: 2010,
    energy_class: "A",
    heating_system: "autonomous_gas",
    construction_status: "needs_renovation",
    has_parking: true,
    has_elevator: false,
    has_pool: true,
    ...raw,
  },
});

beforeEach(() => {
  onRemove.mockReset();
  onClear.mockReset();
});

describe("CompareDrawer", () => {
  it("renders nothing for an empty compare list", () => {
    const { container } = render(<CompareDrawer listings={[]} onRemove={onRemove} onClear={onClear} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("clears and removes items from the collapsed drawer", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CompareDrawer listings={[listing("one")]} onRemove={onRemove} onClear={onClear} />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(onRemove).toHaveBeenCalledWith("one");
    fireEvent.click(screen.getByRole("button", { name: /clear all/i }));
    expect(onClear).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /^compare/i })).not.toBeInTheDocument();
  });

  it("keeps the compare controls above the floating AI assistant", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CompareDrawer listings={[listing("one")]} onRemove={onRemove} onClear={onClear} />
      </MemoryRouter>,
    );

    expect(screen.getByTestId("compare-drawer")).toHaveClass("z-[55]");
  });

  it("opens the comparison table, formats values, removes rows, and closes through the view link", () => {
    render(
      <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <CompareDrawer
          listings={[
            listing("one"),
            listing("two", {
              price: null,
              price_per_sqm: null,
              sqm: null,
              bedrooms: null,
              bathrooms: null,
              energy_class: "Z",
              heating_system: null,
              construction_status: null,
              has_parking: false,
              has_pool: false,
            }),
          ]}
          onRemove={onRemove}
          onClear={onClear}
        />
      </MemoryRouter>,
    );

    fireEvent.click(screen.getByRole("button", { name: /^compare/i }));
    expect(screen.getByText("Property Comparison")).toBeInTheDocument();
    expect(screen.getByText("AI compare stub")).toBeInTheDocument();
    expect(screen.getByText(/3,125/)).toBeInTheDocument();
    expect(screen.getByText("€250,000")).toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(2);
    expect(screen.getByText("autonomous gas")).toBeInTheDocument();
    expect(screen.getByText("needs renovation")).toBeInTheDocument();
    expect(screen.getByText("Z")).toBeInTheDocument();

    const firstColumn = screen.getAllByRole("columnheader")[1];
    fireEvent.click(within(firstColumn).getByRole("button", { name: "" }));
    expect(onRemove).toHaveBeenCalledWith("one");

    fireEvent.click(screen.getAllByRole("link", { name: /view/i })[0]);
    expect(screen.queryByText("Property Comparison")).not.toBeInTheDocument();
  });
});
