import type { ValuationResponseV2 } from "@/lib/valuationResult";

export const valuationV2 = (overrides: Partial<ValuationResponseV2> = {}): ValuationResponseV2 => ({
  responseVersion: 2, status: "available", transaction: "sale", valueUnit: "EUR", estimateBasis: "market_value",
  providerPrediction: null, estimatedValue: 400000, auctionAdjustedValue: null, rangeLow: 380000, rangeHigh: 420000,
  rangeBasis: "estimatedValue", executionValue: null, pricePerSqmEstimate: 4000, rentalYieldEstimate: null,
  objectiveValueProxy: null, confidence: 0, confidenceLabel: "Low", liquidityScore: null, legalCleanliness: null,
  planningCertainty: null, taxFriction: null, transferReadiness: null, listingQualityScore: null,
  marketComparison: "below_market", marketComparisonPct: -20, pricingPosition: "underpriced",
  summary: "Supported valuation evidence.", legalSummary: null, taxSummary: null, renovationPotential: null,
  highestBestUseHint: null, keyFactors: [], redFlags: [], methodUsed: "OS market-model prediction",
  evidence: {
    independentlyVerified: false,
    fields: {
      estimatedValue: "os_prediction", auctionAdjustedValue: "unavailable", rangeLow: "derived_os", rangeHigh: "derived_os",
      executionValue: "unavailable", pricePerSqmEstimate: "derived_os", rentalYieldEstimate: "unavailable",
      objectiveValueProxy: "unavailable", confidence: "ai_estimate", liquidityScore: "unavailable",
      legalCleanliness: "unavailable", planningCertainty: "unavailable", taxFriction: "unavailable",
      transferReadiness: "unavailable", listingQualityScore: "unavailable", marketComparisonPct: "derived_os",
    },
    analysis: "os_summary",
    limitations: ["Not a formal appraisal."],
  },
  ...overrides,
});
