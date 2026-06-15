import { describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { ListingCompareButton } from "@/components/listings/ListingCompareButton";
import type { ListingCard } from "@/types";

const listing: ListingCard = {
  id: "listing-1",
  title: "Athens Loft",
  address: "Ermou 10",
  city: "Athens",
  price: 250000,
  sqm: 100,
  images: [],
  type: "apartment",
  listingType: "sale",
};

describe("ListingCompareButton layout", () => {
  it("anchors to the standardized card action zone instead of a legacy pixel offset", () => {
    renderWithProviders(
      <div className="relative group">
        <ListingCompareButton
          listing={listing}
          isSelected={false}
          isLimitReached={false}
          onToggle={vi.fn()}
        />
      </div>,
    );

    const button = screen.getByRole("button", { name: "Compare" });
    expect(button).toHaveClass("bottom-[5.75rem]");
    expect(button.className).not.toContain("bottom-[108px]");
  });
});
