export type MarketComparison = "below_market" | "at_market" | "above_market";
export type ValuationUnit = "EUR" | "EUR/month";
export type ValuationBasis = "market_value" | "monthly_rent" | "auction_value" | "os_auction_model";
export type ValuationFieldSource = "os_prediction" | "derived_os" | "ai_estimate" | "derived_ai" | "listing_completeness" | "unavailable";
export type ValuationNumericField =
  | "estimatedValue" | "auctionAdjustedValue" | "rangeLow" | "rangeHigh"
  | "executionValue" | "pricePerSqmEstimate" | "rentalYieldEstimate"
  | "objectiveValueProxy" | "confidence" | "liquidityScore"
  | "legalCleanliness" | "planningCertainty" | "taxFriction"
  | "transferReadiness" | "listingQualityScore" | "marketComparisonPct";

export type ValuationResponseV2 = {
  responseVersion: 2;
  status: "available" | "partial";
  transaction: "sale" | "rent" | "auction";
  valueUnit: ValuationUnit;
  estimateBasis: ValuationBasis;
  providerPrediction: { value: number; field: "propertyPredictedPrice" | "propertyPredictedLeasePrice"; model: "market" | "auction"; unit: ValuationUnit | null } | null;
  estimatedValue: number | null;
  auctionAdjustedValue: number | null;
  rangeLow: number | null;
  rangeHigh: number | null;
  rangeBasis: "estimatedValue" | "auctionAdjustedValue" | null;
  executionValue: number | null;
  pricePerSqmEstimate: number | null;
  rentalYieldEstimate: number | null;
  objectiveValueProxy: number | null;
  confidence: number | null;
  confidenceLabel: "High" | "Medium" | "Low" | null;
  liquidityScore: number | null;
  legalCleanliness: number | null;
  planningCertainty: number | null;
  taxFriction: number | null;
  transferReadiness: number | null;
  listingQualityScore: number | null;
  marketComparison: MarketComparison | null;
  marketComparisonPct: number | null;
  pricingPosition: "underpriced" | "fair" | "overpriced" | null;
  summary: string | null;
  legalSummary: string | null;
  taxSummary: string | null;
  renovationPotential: string | null;
  highestBestUseHint: string | null;
  keyFactors: Array<{ factor: string; impact: "positive" | "neutral" | "negative"; note: string }>;
  redFlags: string[];
  methodUsed: string;
  evidence: {
    independentlyVerified: false;
    fields: Record<ValuationNumericField, ValuationFieldSource>;
    analysis: "ai_estimate" | "os_summary" | "unavailable";
    limitations: string[];
  };
};

export type PrimaryValuation = {
  value: number;
  basis: ValuationBasis;
  source: Exclude<ValuationFieldSource, "unavailable" | "listing_completeness">;
  unit: ValuationUnit;
  rangeLow: number | null;
  rangeHigh: number | null;
};

const NUMERIC_FIELDS: ValuationNumericField[] = [
  "estimatedValue", "auctionAdjustedValue", "rangeLow", "rangeHigh", "executionValue",
  "pricePerSqmEstimate", "rentalYieldEstimate", "objectiveValueProxy", "confidence",
  "liquidityScore", "legalCleanliness", "planningCertainty", "taxFriction",
  "transferReadiness", "listingQualityScore", "marketComparisonPct",
];
const FIELD_SOURCES: ValuationFieldSource[] = ["os_prediction", "derived_os", "ai_estimate", "derived_ai", "listing_completeness", "unavailable"];
const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const isFiniteNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const nullableNumber = (value: unknown): value is number | null => value === null || isFiniteNumber(value);
const nullableString = (value: unknown): value is string | null => value === null || typeof value === "string";
const enumValue = <T extends string>(value: unknown, values: readonly T[]): value is T => typeof value === "string" && values.includes(value as T);

export function parseValuationResponseV2(value: unknown): ValuationResponseV2 | null {
  if (!isRecord(value) || value.responseVersion !== 2) return null;
  if (!enumValue(value.status, ["available", "partial"]) || !enumValue(value.transaction, ["sale", "rent", "auction"]) ||
      !enumValue(value.valueUnit, ["EUR", "EUR/month"]) || !enumValue(value.estimateBasis, ["market_value", "monthly_rent", "auction_value", "os_auction_model"])) return null;
  for (const key of NUMERIC_FIELDS) if (!nullableNumber(value[key])) return null;
  if (!enumValue(value.rangeBasis, ["estimatedValue", "auctionAdjustedValue"]) && value.rangeBasis !== null) return null;
  if (!enumValue(value.confidenceLabel, ["High", "Medium", "Low"]) && value.confidenceLabel !== null) return null;
  if (!enumValue(value.marketComparison, ["below_market", "at_market", "above_market"]) && value.marketComparison !== null) return null;
  if (!enumValue(value.pricingPosition, ["underpriced", "fair", "overpriced"]) && value.pricingPosition !== null) return null;
  for (const key of ["summary", "legalSummary", "taxSummary", "renovationPotential", "highestBestUseHint"] as const) if (!nullableString(value[key])) return null;
  if (typeof value.methodUsed !== "string" || !Array.isArray(value.redFlags) || !value.redFlags.every((item) => typeof item === "string")) return null;
  if (!Array.isArray(value.keyFactors) || !value.keyFactors.every((item) => isRecord(item) && typeof item.factor === "string" && enumValue(item.impact, ["positive", "neutral", "negative"]) && typeof item.note === "string")) return null;
  if (value.providerPrediction !== null && (!isRecord(value.providerPrediction) || !isFiniteNumber(value.providerPrediction.value) || value.providerPrediction.value <= 0 ||
      !enumValue(value.providerPrediction.field, ["propertyPredictedPrice", "propertyPredictedLeasePrice"]) || !enumValue(value.providerPrediction.model, ["market", "auction"]) ||
      (!enumValue(value.providerPrediction.unit, ["EUR", "EUR/month"]) && value.providerPrediction.unit !== null))) return null;
  if (!isRecord(value.evidence) || value.evidence.independentlyVerified !== false || !isRecord(value.evidence.fields) ||
      !enumValue(value.evidence.analysis, ["ai_estimate", "os_summary", "unavailable"]) || !Array.isArray(value.evidence.limitations) ||
      !value.evidence.limitations.every((item) => typeof item === "string")) return null;
  for (const key of NUMERIC_FIELDS) {
    const source = value.evidence.fields[key];
    if (!enumValue(source, FIELD_SOURCES) || ((value[key] === null) !== (source === "unavailable"))) return null;
  }
  for (const key of ["estimatedValue", "auctionAdjustedValue", "rangeLow", "rangeHigh", "executionValue", "pricePerSqmEstimate", "objectiveValueProxy"] as const) {
    if (value[key] !== null && (value[key] as number) <= 0) return null;
  }
  for (const key of ["confidence", "liquidityScore", "legalCleanliness", "planningCertainty", "taxFriction", "transferReadiness", "listingQualityScore"] as const) {
    if (value[key] !== null && ((value[key] as number) < 0 || (value[key] as number) > 100)) return null;
  }
  const parsed = value as unknown as ValuationResponseV2;
  const rangeValue = parsed.rangeBasis ? parsed[parsed.rangeBasis] : null;
  if (!(parsed.rangeLow !== null && parsed.rangeHigh !== null && parsed.rangeBasis !== null && rangeValue !== null && parsed.rangeLow <= rangeValue && rangeValue <= parsed.rangeHigh)) {
    parsed.rangeLow = null; parsed.rangeHigh = null; parsed.rangeBasis = null;
    parsed.evidence.fields.rangeLow = "unavailable"; parsed.evidence.fields.rangeHigh = "unavailable";
  }
  return parsed;
}

export function selectPrimaryValuation(data: ValuationResponseV2 | null | undefined): PrimaryValuation | null {
  if (!data) return null;
  const key = data.transaction === "auction" && data.auctionAdjustedValue != null ? "auctionAdjustedValue" : "estimatedValue";
  const value = data[key];
  const source = data.evidence.fields[key];
  if (value == null || source === "unavailable" || source === "listing_completeness") return null;
  return { value, basis: key === "auctionAdjustedValue" ? "market_value" : data.estimateBasis, source, unit: data.valueUnit,
    rangeLow: data.rangeBasis === key ? data.rangeLow : null, rangeHigh: data.rangeBasis === key ? data.rangeHigh : null };
}

const toFinitePositiveNumber = (value: unknown): number | null => isFiniteNumber(value) && value > 0 ? value : null;
export function deriveListingMarketComparison(listingPrice: unknown, marketEstimate: unknown): { marketComparison: MarketComparison | null; marketComparisonPct: number | null } {
  const price = toFinitePositiveNumber(listingPrice); const estimate = toFinitePositiveNumber(marketEstimate);
  if (price == null || estimate == null) return { marketComparison: null, marketComparisonPct: null };
  const rawPct = ((price - estimate) / estimate) * 100;
  return { marketComparison: rawPct > 5 ? "above_market" : rawPct < -5 ? "below_market" : "at_market", marketComparisonPct: Math.round(rawPct) };
}
