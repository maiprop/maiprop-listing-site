import { describe, expect, it } from "vitest";
import { OPEN_HOUSE_CARD_LAYOUT_CLASS } from "@/components/open-houses/OpenHousePrimitives";

describe("Open house card layout primitives", () => {
  it("does not force property cards taller than the universal card frame", () => {
    expect(OPEN_HOUSE_CARD_LAYOUT_CLASS).not.toContain("h-full");
    expect(OPEN_HOUSE_CARD_LAYOUT_CLASS).not.toContain("[&_.property-card]:h-full");
  });
});
