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
  it("renders as a compact footer action instead of a floating overlay", () => {
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
    expect(button).toHaveClass("h-9", "w-9", "rounded-xl");
    expect(button.className).not.toContain("absolute");
    expect(button.className).not.toContain("bottom-[5.75rem]");
  });
});
