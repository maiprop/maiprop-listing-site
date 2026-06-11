export type ValuationEstimateSource = {
  estimatedValue?: unknown;
  estimated_value?: unknown;
  auctionAdjustedValue?: unknown;
  auction_adjusted_value?: unknown;
};

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
