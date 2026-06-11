import { describe, expect, it } from "vitest";
import { getPrimaryValuationEstimate, getRemoteValuationEstimate } from "@/lib/valuationResult";

describe("valuation result helpers", () => {
  it("prefers the hybrid clean-market value over the lower auction-adjusted estimate", () => {
    expect(getPrimaryValuationEstimate({
      estimatedValue: 130_000,
      auctionAdjustedValue: 154_000,
    }, 275_000)).toBe(154_000);
  });

  it("supports legacy snake_case response fields and falls back safely", () => {
    expect(getPrimaryValuationEstimate({
      estimated_value: 130_000,
      auction_adjusted_value: 154_000,
    }, 275_000)).toBe(154_000);
    expect(getPrimaryValuationEstimate({ estimatedValue: 130_000 }, 275_000)).toBe(130_000);
    expect(getPrimaryValuationEstimate({}, 275_000)).toBe(275_000);
  });

  it("can detect whether the remote response actually included a valuation number", () => {
    expect(getRemoteValuationEstimate({ auctionAdjustedValue: 154_000 })).toBe(154_000);
    expect(getRemoteValuationEstimate({ estimated_value: 130_000 })).toBe(130_000);
    expect(getRemoteValuationEstimate({})).toBeNull();
  });
});
