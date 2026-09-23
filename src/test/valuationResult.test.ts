import { describe, expect, it } from "vitest";
import {
  deriveListingMarketComparison,
  parseValuationResponseV2,
  selectPrimaryValuation,
} from "@/lib/valuationResult";

describe("valuation result helpers", () => {
  it("derives listing price position from the displayed market estimate", () => {
    expect(deriveListingMarketComparison(275_000, 220_000)).toEqual({
      marketComparison: "above_market",
      marketComparisonPct: 25,
    });
    expect(deriveListingMarketComparison(200_000, 250_000)).toEqual({
      marketComparison: "below_market",
      marketComparisonPct: -20,
    });
    expect(deriveListingMarketComparison(450_000, 470_000)).toEqual({
      marketComparison: "at_market",
      marketComparisonPct: -4,
    });
    expect(deriveListingMarketComparison(null, 470_000)).toEqual({
      marketComparison: null,
      marketComparisonPct: null,
    });
  });
});

const v2 = (overrides: Record<string, unknown> = {}) => ({
  responseVersion: 2,
  status: "available",
  transaction: "sale",
  valueUnit: "EUR",
  estimateBasis: "market_value",
  providerPrediction: null,
  estimatedValue: 400000,
  auctionAdjustedValue: null,
  rangeLow: 380000,
  rangeHigh: 420000,
  rangeBasis: "estimatedValue",
  executionValue: null,
  pricePerSqmEstimate: 4000,
  rentalYieldEstimate: null,
  objectiveValueProxy: null,
  confidence: 0,
  confidenceLabel: "Low",
  liquidityScore: null,
  legalCleanliness: null,
  planningCertainty: null,
  taxFriction: null,
  transferReadiness: null,
  listingQualityScore: null,
  marketComparison: "below_market",
  marketComparisonPct: -20,
  pricingPosition: "underpriced",
  summary: "Supported OS estimate.",
  legalSummary: null,
  taxSummary: null,
  renovationPotential: null,
  highestBestUseHint: null,
  keyFactors: [],
  redFlags: [],
  methodUsed: "OS market-model prediction",
  evidence: {
    independentlyVerified: false,
    fields: {
      estimatedValue: "os_prediction",
      auctionAdjustedValue: "unavailable",
      rangeLow: "derived_os",
      rangeHigh: "derived_os",
      executionValue: "unavailable",
      pricePerSqmEstimate: "derived_os",
      rentalYieldEstimate: "unavailable",
      objectiveValueProxy: "unavailable",
      confidence: "ai_estimate",
      liquidityScore: "unavailable",
      legalCleanliness: "unavailable",
      planningCertainty: "unavailable",
      taxFriction: "unavailable",
      transferReadiness: "unavailable",
      listingQualityScore: "unavailable",
      marketComparisonPct: "derived_os",
    },
    analysis: "os_summary",
    limitations: [],
  },
  ...overrides,
});

describe("valuation v2 evidence parser", () => {
  it("retains true zero scores and comparisons without coercing null or strings", () => {
    const parsed = parseValuationResponseV2(v2());
    expect(parsed?.confidence).toBe(0);
    expect(parsed?.marketComparisonPct).toBe(-20);
    expect(parseValuationResponseV2(v2({ estimatedValue: "400000" }))).toBeNull();
    expect(parseValuationResponseV2(v2({ responseVersion: 1 }))).toBeNull();
  });

  it("keeps the selected amount, source, basis, unit and matching range together", () => {
    const parsed = parseValuationResponseV2(v2({
      transaction: "auction",
      estimateBasis: "os_auction_model",
      estimatedValue: 250000,
      auctionAdjustedValue: 310000,
      rangeLow: 295000,
      rangeHigh: 325000,
      rangeBasis: "auctionAdjustedValue",
      evidence: {
        ...v2().evidence,
        fields: {
          ...(v2().evidence as { fields: Record<string, string> }).fields,
          estimatedValue: "os_prediction",
          auctionAdjustedValue: "ai_estimate",
          rangeLow: "ai_estimate",
          rangeHigh: "ai_estimate",
        },
      },
    }));
    expect(selectPrimaryValuation(parsed)).toEqual({
      value: 310000,
      basis: "market_value",
      source: "ai_estimate",
      unit: "EUR",
      rangeLow: 295000,
      rangeHigh: 325000,
    });
  });

  it("rejects invalid ranges while preserving other supported evidence", () => {
    const parsed = parseValuationResponseV2(v2({ rangeLow: 410000, rangeHigh: 390000 }));
    expect(parsed).not.toBeNull();
    expect(parsed?.rangeLow).toBeNull();
    expect(parsed?.rangeHigh).toBeNull();
    expect(parsed?.rangeBasis).toBeNull();
  });
});
