export type ValuationEstimateSource = {
  estimatedValue?: unknown;
  estimated_value?: unknown;
  auctionAdjustedValue?: unknown;
  auction_adjusted_value?: unknown;
};

export type MarketComparison = "below_market" | "at_market" | "above_market";

const toFinitePositiveNumber = (value: unknown): number | null => {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : null;
};

export function getRemoteValuationEstimate(data: ValuationEstimateSource | null | undefined): number | null {
  return (
    toFinitePositiveNumber(data?.auctionAdjustedValue) ??
    toFinitePositiveNumber(data?.auction_adjusted_value) ??
    toFinitePositiveNumber(data?.estimatedValue) ??
    toFinitePositiveNumber(data?.estimated_value)
  );
}

export function getPrimaryValuationEstimate(
  data: ValuationEstimateSource | null | undefined,
  fallback: number,
): number {
  return getRemoteValuationEstimate(data) ?? fallback;
}

export function deriveListingMarketComparison(
  listingPrice: unknown,
  marketEstimate: unknown,
): { marketComparison: MarketComparison; marketComparisonPct: number } {
  const price = toFinitePositiveNumber(listingPrice);
  const estimate = toFinitePositiveNumber(marketEstimate);
  if (!price || !estimate) {
    return { marketComparison: "at_market", marketComparisonPct: 0 };
  }

  const marketComparisonPct = Math.round(((price - estimate) / estimate) * 100);
  const marketComparison =
    marketComparisonPct > 5 ? "above_market" :
    marketComparisonPct < -5 ? "below_market" :
    "at_market";

  return { marketComparison, marketComparisonPct };
}
