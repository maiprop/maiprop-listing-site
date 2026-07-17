import { describe, expect, it } from "vitest";
import {
  averageDefinedPercentages,
  calculateInvestorDealMetrics,
  countDealsCreatedWithinDays,
} from "@/lib/investorMetrics";

describe("investor deal metrics", () => {
  it("does not invent an asking price or market comparison when either value is missing", () => {
    expect(calculateInvestorDealMetrics({ askingPrice: null, aiMarketEstimate: 225_000 })).toEqual({
      askingPrice: null,
      aiMarketEstimate: 225_000,
      discountPct: null,
      valueSpreadPct: null,
    });

    expect(calculateInvestorDealMetrics({ askingPrice: 180_000, aiMarketEstimate: null })).toEqual({
      askingPrice: 180_000,
      aiMarketEstimate: null,
      discountPct: null,
      valueSpreadPct: null,
    });
  });

  it("rejects zero, negative, and non-finite monetary evidence", () => {
    expect(calculateInvestorDealMetrics({ askingPrice: 0, aiMarketEstimate: 200_000 })).toEqual({
      askingPrice: null,
      aiMarketEstimate: 200_000,
      discountPct: null,
      valueSpreadPct: null,
    });
    expect(calculateInvestorDealMetrics({ askingPrice: -1, aiMarketEstimate: Number.POSITIVE_INFINITY })).toEqual({
      askingPrice: null,
      aiMarketEstimate: null,
      discountPct: null,
      valueSpreadPct: null,
    });
  });

  it("uses market value as the denominator for discount and signed value spread", () => {
    expect(calculateInvestorDealMetrics({ askingPrice: 100_000, aiMarketEstimate: 200_000 })).toEqual({
      askingPrice: 100_000,
      aiMarketEstimate: 200_000,
      discountPct: 50,
      valueSpreadPct: 50,
    });
  });

  it("reports an above-market spread without calling it a discount", () => {
    expect(calculateInvestorDealMetrics({ askingPrice: 120_000, aiMarketEstimate: 100_000 })).toEqual({
      askingPrice: 120_000,
      aiMarketEstimate: 100_000,
      discountPct: null,
      valueSpreadPct: -20,
    });
  });

  it("averages only percentages backed by complete evidence", () => {
    expect(averageDefinedPercentages([50, null, -20, undefined])).toBe(15);
    expect(averageDefinedPercentages([null, undefined])).toBeNull();
  });

  it("counts only valid deal timestamps inside the requested evidence window", () => {
    const now = Date.parse("2026-07-17T12:00:00Z");
    expect(countDealsCreatedWithinDays([
      "2026-07-17T11:00:00Z",
      "2026-07-10T12:00:00Z",
      "2026-07-10T11:59:59Z",
      "not-a-date",
      null,
    ], 7, now)).toBe(2);
  });
});
