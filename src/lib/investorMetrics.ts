export type InvestorDealFinancialMetrics = {
  askingPrice: number | null;
  aiMarketEstimate: number | null;
  discountPct: number | null;
  valueSpreadPct: number | null;
};

type InvestorDealFinancialInput = {
  askingPrice: unknown;
  aiMarketEstimate: unknown;
};

function positiveFiniteNumber(value: unknown): number | null {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function roundPercentage(value: number): number {
  return Math.round(value * 10) / 10;
}

export function calculateInvestorDealMetrics({
  askingPrice,
  aiMarketEstimate,
}: InvestorDealFinancialInput): InvestorDealFinancialMetrics {
  const normalizedAskingPrice = positiveFiniteNumber(askingPrice);
  const normalizedMarketEstimate = positiveFiniteNumber(aiMarketEstimate);

  if (normalizedAskingPrice == null || normalizedMarketEstimate == null) {
    return {
      askingPrice: normalizedAskingPrice,
      aiMarketEstimate: normalizedMarketEstimate,
      discountPct: null,
      valueSpreadPct: null,
    };
  }

  const valueSpreadPct = roundPercentage(
    ((normalizedMarketEstimate - normalizedAskingPrice) / normalizedMarketEstimate) * 100,
  );

  return {
    askingPrice: normalizedAskingPrice,
    aiMarketEstimate: normalizedMarketEstimate,
    discountPct: valueSpreadPct >= 0 ? valueSpreadPct : null,
    valueSpreadPct,
  };
}

export function averageDefinedPercentages(
  values: ReadonlyArray<number | null | undefined>,
): number | null {
  const defined = values.filter((value): value is number => Number.isFinite(value));
  if (defined.length === 0) return null;
  return roundPercentage(defined.reduce((sum, value) => sum + value, 0) / defined.length);
}

export function countDealsCreatedWithinDays(
  timestamps: ReadonlyArray<string | null | undefined>,
  days: number,
  now = Date.now(),
): number {
  if (!Number.isFinite(days) || days < 0 || !Number.isFinite(now)) return 0;
  const earliest = now - days * 24 * 60 * 60 * 1000;

  return timestamps.reduce((count, timestamp) => {
    if (!timestamp) return count;
    const createdAt = Date.parse(timestamp);
    if (!Number.isFinite(createdAt) || createdAt < earliest || createdAt > now) return count;
    return count + 1;
  }, 0);
}

export function hasValidTimestamp(timestamp: string | null | undefined): timestamp is string {
  return Boolean(timestamp && Number.isFinite(Date.parse(timestamp)));
}
