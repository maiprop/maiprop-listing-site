import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { StepType } from "@/components/listings/StepType";
import { renderWithProviders } from "@/test/utils";

const baseForm = {
  listing_type: "sale",
  property_type: "apartment",
  commercial_subtype: "",
  is_pre_sale: false,
  is_off_market: false,
};

describe("StepType new-build access", () => {
  it("does not expose legacy off-plan controls in the ordinary listing form", () => {
    const StepTypeWithLegacyProps = StepType as unknown as React.ComponentType<Record<string, unknown>>;

    renderWithProviders(
      <StepTypeWithLegacyProps
        form={baseForm}
        set={vi.fn()}
        toggle={vi.fn()}
        showPreSaleOption
      />,
    );

    expect(screen.queryByLabelText(/pre-sale|off-plan/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/new build details/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/construction phase/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/estimated delivery year/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /new build/i })).not.toBeInTheDocument();
  });
});
