export const positiveFiniteNumber = (value: unknown): number | null => {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
};

export function calculatePricePerSqm(input: {
  price?: unknown;
  sqm?: unknown;
  storedPricePerSqm?: unknown;
}): number | null {
  const price = positiveFiniteNumber(input.price);
  const sqm = positiveFiniteNumber(input.sqm);

  if (price != null && sqm != null) {
    return Math.round(price / sqm);
  }

  const stored = positiveFiniteNumber(input.storedPricePerSqm);
  return stored != null ? Math.round(stored) : null;
}

export function calculatePercentDelta(input: {
  value?: unknown;
  baseline?: unknown;
}): number | null {
  const value = Number(input.value);
  const baseline = positiveFiniteNumber(input.baseline);
  if (!Number.isFinite(value) || baseline == null) return null;
  return Math.round(((value - baseline) / baseline) * 100);
}

export function calculateAuctionDiscountPercent(input: {
  price?: unknown;
  auctionStartingBid?: unknown;
}): number | null {
  const price = positiveFiniteNumber(input.price);
  const bid = positiveFiniteNumber(input.auctionStartingBid);
  if (price == null || bid == null) return null;
  return Math.round((1 - bid / price) * 100);
}

export function calculateMonthlyRentEstimate(input: {
  price?: unknown;
  sqm?: unknown;
  eurPerSqm?: unknown;
}): number {
  const price = positiveFiniteNumber(input.price);
  const sqm = positiveFiniteNumber(input.sqm);
  const eurPerSqm = positiveFiniteNumber(input.eurPerSqm) ?? 8;
  if (price == null || sqm == null) return 0;
  return Math.round((price / sqm) * eurPerSqm);
}
