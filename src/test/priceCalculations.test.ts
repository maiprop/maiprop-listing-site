import { describe, expect, it } from "vitest";
import {
  calculateAuctionDiscountPercent,
  calculateMonthlyRentEstimate,
  calculatePercentDelta,
  calculatePricePerSqm,
} from "@/lib/priceCalculations";

describe("price calculation helpers", () => {
  it("computes price per sqm from price and area before using stored values", () => {
    expect(calculatePricePerSqm({
      price: 315000,
      sqm: 102,
      storedPricePerSqm: 3000,
    })).toBe(3088);
  });

  it("falls back to stored price per sqm only when price or area is unavailable", () => {
    expect(calculatePricePerSqm({
      price: null,
      sqm: 102,
      storedPricePerSqm: 3000,
    })).toBe(3000);
  });

  it("returns null when neither computed nor stored values are usable", () => {
    expect(calculatePricePerSqm({
      price: 0,
      sqm: 0,
      storedPricePerSqm: null,
    })).toBeNull();
  });

  it("guards percentage math from zero and non-finite baselines", () => {
    expect(calculatePercentDelta({ value: 300000, baseline: 250000 })).toBe(20);
    expect(calculatePercentDelta({ value: 240000, baseline: 250000 })).toBe(-4);
    expect(calculatePercentDelta({ value: 300000, baseline: 0 })).toBeNull();
    expect(calculatePercentDelta({ value: Number.NaN, baseline: 250000 })).toBeNull();
  });

  it("computes auction discount only when both prices are usable", () => {
    expect(calculateAuctionDiscountPercent({ price: 200000, auctionStartingBid: 150000 })).toBe(25);
    expect(calculateAuctionDiscountPercent({ price: 0, auctionStartingBid: 150000 })).toBeNull();
    expect(calculateAuctionDiscountPercent({ price: 200000, auctionStartingBid: null })).toBeNull();
  });

  it("returns a stable rent heuristic instead of Infinity for missing area", () => {
    expect(calculateMonthlyRentEstimate({ price: 300000, sqm: 100 })).toBe(24000);
    expect(calculateMonthlyRentEstimate({ price: 300000, sqm: 0 })).toBe(0);
  });
});
