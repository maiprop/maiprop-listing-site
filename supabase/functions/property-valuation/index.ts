import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("property-valuation");

const BUCKET = "property-valuation";
const NEW_BUILD_OPENAI_MODEL = "gpt-5.4";
const NEW_BUILD_OPENAI_REASONING_EFFORT = "medium";
const valuationLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 15, windowMs: 60_000, failClosed: true });
const OS_VALUATION_TIMEOUT_MS = 25_000;

const OS_PROPERTY_CATEGORY: Record<string, string> = {
  apartment: "RESIDENCE",
  house: "RESIDENCE",
  villa: "RESIDENCE",
  studio: "RESIDENCE",
  maisonette: "RESIDENCE",
  land: "LAND",
  plot: "PLOT",
  commercial: "OTHER_BUSINESS_SPACE",
  office: "OFFICE",
  store: "STORE",
  shop: "STORE",
  parking: "PARKING",
  storage: "STOREROOM",
  warehouse: "INDUSTRIAL",
  industrial: "INDUSTRIAL",
  hotel: "HOTEL",
};

type JsonRecord = Record<string, unknown>;

type StructuredValuationInput = {
  listingId?: string | null;
  city: string;
  address?: unknown;
  price: number;
  sqm: number;
  propertyType?: unknown;
  listingType?: unknown;
  latitude?: unknown;
  longitude?: unknown;
  floor?: unknown;
  yearBuilt?: unknown;
  condition?: unknown;
};

const coerceFiniteNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const compact = value.trim().replace(/[^\d.,+-]/g, "");
    if (!compact) return null;
    const lastComma = compact.lastIndexOf(",");
    const lastDot = compact.lastIndexOf(".");
    let normalized = compact;
    if (lastComma >= 0 && lastDot >= 0) {
      const decimal = lastComma > lastDot ? "," : ".";
      const thousands = decimal === "," ? "." : ",";
      normalized = compact.replace(new RegExp(`\\${thousands}`, "g"), "").replace(decimal, ".");
    } else if (lastComma >= 0) {
      const parts = compact.split(",");
      normalized = parts.length > 1 && parts.at(-1)?.length === 3
        ? compact.replace(/,/g, "")
        : compact.replace(",", ".");
    } else if (lastDot >= 0) {
      const parts = compact.split(".");
      normalized = parts.length > 1 && parts.at(-1)?.length === 3
        ? compact.replace(/\./g, "")
        : compact;
    }
    const parsed = Number(normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
};

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const roundNumber = (value: number, digits = 0): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

const normalizeAnnualYield = (value: unknown): number | null => {
  const numeric = coerceFiniteNumber(value);
  if (numeric == null) return null;
  return roundNumber(numeric > 1 ? numeric : numeric * 100, 1);
};

const normalizeYearBuilt = (value: unknown): number => {
  const year = coerceFiniteNumber(value);
  if (year != null && year >= 1900 && year <= 2200) return Math.round(year);
  return 2000;
};

const normalizeFloor = (value: unknown): number => {
  const floor = coerceFiniteNumber(value);
  return floor == null ? 0 : Math.round(floor);
};

const normalizeOsCategory = (value: unknown): string => {
  const key = optionalString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
  return OS_PROPERTY_CATEGORY[key] ?? OS_PROPERTY_CATEGORY[key.replace(/_property$/, "")] ?? "RESIDENCE";
};

const readJsonSafely = async (response: Response): Promise<JsonRecord | null> => {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : null;
  } catch (_error) {
    return null;
  }
};

const isAbortError = (error: unknown): boolean =>
  error instanceof DOMException && error.name === "AbortError";

const extractOsToken = (payload: JsonRecord | null): string | null => {
  const data = payload?.data as JsonRecord | undefined;
  const user = payload?.user as JsonRecord | undefined;
  const candidates = [
    payload?.token,
    payload?.accessToken,
    payload?.access_token,
    payload?.jwt,
    data?.token,
    data?.accessToken,
    data?.access_token,
    user?.token,
  ];
  const token = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof token === "string" ? token : null;
};

const fetchOsAuthToken = async (baseUrl: string, email: string, password: string): Promise<string> => {
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ email, password }),
    }, OS_VALUATION_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`OS auth timed out after ${OS_VALUATION_TIMEOUT_MS}ms`);
    }
    throw error;
  }

  const payload = await readJsonSafely(response);
  const token = extractOsToken(payload);
  if (!response.ok || !token) {
    throw new Error(`OS auth failed with status ${response.status}`);
  }
  return token;
};

const buildOsValuationBody = (input: StructuredValuationInput): JsonRecord | null => {
  const latitude = coerceFiniteNumber(input.latitude);
  const longitude = coerceFiniteNumber(input.longitude);
  const sqm = coerceFiniteNumber(input.sqm);
  if (latitude == null || longitude == null || sqm == null || sqm <= 0) return null;

  const addressParts = [optionalString(input.address), input.city].filter(Boolean);
  const listingType = optionalString(input.listingType)?.toLowerCase() ?? "sale";

  return {
    constructionYear: normalizeYearBuilt(input.yearBuilt),
    propertyLongitude: longitude,
    propertyLatitude: latitude,
    propertySquareMeters: sqm,
    propertyCategory: normalizeOsCategory(input.propertyType),
    propertyFloor: normalizeFloor(input.floor),
    ...(addressParts.length ? { address: addressParts.join(", ") } : {}),
    valuationModel: listingType === "auction" ? "auction" : "market",
    rangesForSimilar: [0.5, 1, 2, 5],
    maxSimilarReturned: 5,
  };
};

const unwrapOsData = (payload: JsonRecord | null): JsonRecord | null => {
  const data = payload?.data;
  if (data && typeof data === "object" && !Array.isArray(data)) return data as JsonRecord;
  return payload;
};

const fetchStructuredOsValuation = async (input: StructuredValuationInput): Promise<JsonRecord | null> => {
  const baseUrl = (Deno.env.get("MAIPROP_OS_API_URL") ?? Deno.env.get("MAIPROP_OS_URL"))?.replace(/\/+$/, "");
  const email = Deno.env.get("MAIPROP_OS_EMAIL");
  const password = Deno.env.get("MAIPROP_OS_PASSWORD");
  const requestBody = buildOsValuationBody(input);

  if (!baseUrl || !email || !password || !requestBody) return null;

  const token = await fetchOsAuthToken(baseUrl, email, password);
  let response: Response;
  try {
    response = await fetchWithTimeout(`${baseUrl}/api/v1/property/valuation`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestBody),
    }, OS_VALUATION_TIMEOUT_MS);
  } catch (error) {
    if (isAbortError(error)) {
      throw new Error(`OS valuation timed out after ${OS_VALUATION_TIMEOUT_MS}ms`);
    }
    throw error;
  }

  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw new Error(`OS valuation failed with status ${response.status}`);
  }

  const data = unwrapOsData(payload);
  const predictedPrice = coerceFiniteNumber(data?.propertyPredictedPrice);
  return predictedPrice != null && predictedPrice > 0 ? data : null;
};

const countOverviewComparables = (value: unknown): number => {
  if (!Array.isArray(value)) return 0;
  return value.reduce((total, overview) => {
    if (!overview || typeof overview !== "object") return total;
    const record = overview as JsonRecord;
    const comparableKeys = ["similarListings", "similarRentals", "comparableListings", "comparableRentals"];
    return total + comparableKeys.reduce((count, key) => {
      const comparables = record[key];
      return count + (Array.isArray(comparables) ? comparables.length : 0);
    }, 0);
  }, 0);
};

const firstOverviewNumber = (overviews: unknown, key: string): number | null => {
  if (!Array.isArray(overviews)) return null;
  for (const overview of overviews) {
    if (!overview || typeof overview !== "object") continue;
    const numeric = coerceFiniteNumber((overview as JsonRecord)[key]);
    if (numeric != null) return numeric;
  }
  return null;
};

const toMarketComparison = (deltaPct: number): "below_market" | "at_market" | "above_market" => {
  if (deltaPct > 5) return "above_market";
  if (deltaPct < -5) return "below_market";
  return "at_market";
};

const toPricingPosition = (deltaPct: number): "overpriced" | "fair" | "underpriced" => {
  if (deltaPct > 5) return "underpriced";
  if (deltaPct < -5) return "overpriced";
  return "fair";
};

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clampScore = (value: unknown, fallback: number): number => {
  const numeric = coerceFiniteNumber(value);
  return Math.round(clampNumber(numeric ?? fallback, 0, 100));
};

const isAuctionListing = (value: unknown): boolean =>
  optionalString(value)?.toLowerCase() === "auction";

const isRentalListing = (value: unknown): boolean => {
  const listingType = optionalString(value)?.toLowerCase();
  return listingType === "rent" || listingType === "rental";
};

const isNewBuildListing = (value: unknown): boolean => {
  const listingType = optionalString(value)?.toLowerCase() ?? "";
  return listingType === "new_build" || listingType === "new-building" || listingType === "pre_sale" || listingType === "pre-sale";
};

const isResidentialType = (value: unknown): boolean => {
  const propertyType = optionalString(value)?.toLowerCase() ?? "";
  return ["apartment", "house", "villa", "studio", "maisonette", "residence"].includes(propertyType);
};

const hasConfirmedLegalPlanningDefect = (source: JsonRecord): boolean =>
  source.withinCityPlan === false || source.withinSettlement === false || source.isBuildable === false;

const computeListingQualityScore = (source: JsonRecord, osData: JsonRecord | null): number => {
  let score = 10;
  if (optionalString(source.title)) score += 4;
  if (optionalString(source.city)) score += 8;
  if (optionalString(source.address)) score += 8;
  if (coerceFiniteNumber(source.latitude) != null && coerceFiniteNumber(source.longitude) != null) score += 10;
  if ((coerceFiniteNumber(source.price) ?? 0) > 0) score += 10;
  if ((coerceFiniteNumber(source.sqm) ?? 0) > 0) score += 10;
  if (optionalString(source.propertyType)) score += 7;
  if (optionalString(source.listingType)) score += 5;
  if (coerceFiniteNumber(source.floor) != null) score += 3;
  if (coerceFiniteNumber(source.yearBuilt) != null) score += 4;
  if (coerceFiniteNumber(source.bedrooms) != null) score += 3;
  if (coerceFiniteNumber(source.bathrooms) != null) score += 3;
  if (optionalString(source.energyClass)) score += 3;
  if (optionalString(source.condition)) score += 4;
  if (optionalString(source.description) && optionalString(source.description)!.length >= 80) score += 4;
  if ([
    source.hasParking,
    source.hasPool,
    source.hasElevator,
    source.hasGarden,
    source.hasStorage,
    source.hasBalcony,
    source.hasView,
    source.hasFurnished,
  ].some((value) => value === true)) score += 4;
  if ([
    source.cadastreNumber,
    source.withinCityPlan,
    source.withinSettlement,
    source.buildingAllowance,
    source.coverageRatio,
    source.isBuildable,
    source.landUse,
    source.ownershipStatus,
    source.auctionCourt,
  ].some((value) => value != null && value !== "")) score += 8;
  if (osData) score += 15;

  if (!osData) score = Math.min(score, 85);
  if (coerceFiniteNumber(source.latitude) == null || coerceFiniteNumber(source.longitude) == null) score = Math.min(score, 75);
  return Math.round(clampNumber(score, 20, 95));
};

const removeUnconfirmedLegalFlags = (
  redFlags: unknown,
  source: JsonRecord,
): string[] => {
  const flags = Array.isArray(redFlags)
    ? redFlags.filter((flag): flag is string => typeof flag === "string" && flag.trim().length > 0).map((flag) => flag.trim())
    : [];
  const cityPlanKnownNegative = source.withinCityPlan === false || source.withinSettlement === false;
  const buildabilityKnownNegative = source.isBuildable === false;
  const cadastreKnownMissing = false;

  return flags.filter((flag) => {
    const normalized = flag.toLowerCase();
    if (!cadastreKnownMissing && /cadastre|kaek|registration/.test(normalized)) return false;
    if (!cityPlanKnownNegative && /(outside|out of).*(city|settlement|plan)|city.*settlement.*plan/.test(normalized)) return false;
    if (!buildabilityKnownNegative && /buildability|buildable|building rights/.test(normalized)) return false;
    return true;
  });
};

const normalizeValuationResult = (
  result: JsonRecord,
  source: JsonRecord,
  osData: JsonRecord | null,
): JsonRecord => {
  const listedPrice = coerceFiniteNumber(source.price) ?? 0;
  const estimatedValue = coerceFiniteNumber(result.estimatedValue);
  const cleanAuctionMarketValue = coerceFiniteNumber(result.auctionAdjustedValue);
  const isAuction = isAuctionListing(source.listingType);
  const isRental = isRentalListing(source.listingType);
  const marketAnchor = isAuction && cleanAuctionMarketValue != null && cleanAuctionMarketValue > 0
    ? cleanAuctionMarketValue
    : estimatedValue;

  if (isRental) {
    const estimatedMonthlyRent =
      coerceFiniteNumber(result.estimatedMonthlyRent) ??
      coerceFiniteNumber(result.monthlyRentEstimate) ??
      coerceFiniteNumber(result.marketRentEstimate);
    if (listedPrice > 0 && estimatedValue != null && estimatedValue > listedPrice * 24) {
      result.rentalYieldEstimate = roundNumber((listedPrice * 12 / estimatedValue) * 100, 1);
    } else {
      result.rentalYieldEstimate = normalizeAnnualYield(result.rentalYieldEstimate) ?? result.rentalYieldEstimate ?? 0;
    }

    if (listedPrice > 0 && estimatedMonthlyRent != null && estimatedMonthlyRent > 0) {
      const deltaPct = roundNumber(((listedPrice - estimatedMonthlyRent) / estimatedMonthlyRent) * 100);
      result.marketComparisonPct = deltaPct;
      result.marketComparison = toMarketComparison(deltaPct);
      result.pricingPosition = deltaPct > 5 ? "overpriced" : deltaPct < -5 ? "underpriced" : "fair";
    } else {
      const remoteDelta = coerceFiniteNumber(result.marketComparisonPct);
      const shouldKeepRemoteDelta = remoteDelta != null && Math.abs(remoteDelta) <= 50;
      result.marketComparisonPct = shouldKeepRemoteDelta ? remoteDelta : 0;
      result.marketComparison = shouldKeepRemoteDelta ? toMarketComparison(remoteDelta) : "at_market";
      result.pricingPosition = shouldKeepRemoteDelta
        ? remoteDelta > 5 ? "overpriced" : remoteDelta < -5 ? "underpriced" : "fair"
        : "fair";
    }
  } else if (listedPrice > 0 && marketAnchor != null && marketAnchor > 0) {
    const deltaPct = roundNumber(((marketAnchor - listedPrice) / listedPrice) * 100);
    result.marketComparisonPct = deltaPct;
    result.marketComparison = toMarketComparison(deltaPct);
    result.pricingPosition = toPricingPosition(deltaPct);
  }

  const residential = isResidentialType(source.propertyType);
  if (residential) {
    const legalFloor = isAuction ? 50 : 60;
    const planningFloor = isAuction ? 60 : 65;
    const transferFloor = isAuction ? 45 : 55;
    const taxCeiling = isAuction ? 55 : 35;
    const hasConfirmedDefect = hasConfirmedLegalPlanningDefect(source);
    if (hasConfirmedDefect) {
      const legalCap = isAuction ? 35 : 50;
      const planningCap = isAuction ? 40 : 55;
      const transferCap = isAuction ? 45 : 60;
      const taxFloor = isAuction ? 60 : 50;
      const taxConfirmedCeiling = isAuction ? 85 : 80;
      result.legalCleanliness = Math.min(clampScore(result.legalCleanliness, legalCap), legalCap);
      result.planningCertainty = Math.min(clampScore(result.planningCertainty, planningCap), planningCap);
      result.transferReadiness = Math.min(clampScore(result.transferReadiness, transferCap), transferCap);
      result.taxFriction = clampNumber(clampScore(result.taxFriction, taxFloor), taxFloor, taxConfirmedCeiling);
    } else {
      result.legalCleanliness = Math.max(clampScore(result.legalCleanliness, legalFloor), legalFloor);
      result.planningCertainty = Math.max(clampScore(result.planningCertainty, planningFloor), planningFloor);
      result.transferReadiness = Math.max(clampScore(result.transferReadiness, transferFloor), transferFloor);
      result.taxFriction = Math.min(clampScore(result.taxFriction, taxCeiling), taxCeiling);
    }
    result.redFlags = removeUnconfirmedLegalFlags(result.redFlags, source);

    const legalSummary = optionalString(result.legalSummary) ?? "";
    if (!hasConfirmedDefect && /outside|no cadastre|buildability|buildable/i.test(legalSummary)) {
      result.legalSummary = isAuction
        ? "Listing data does not include verified cadastre, title, occupancy, or permit documents. Treat legal and planning status as unverified; auction due diligence remains required before relying on the estimate."
        : "Listing data does not include verified cadastre, title, or permit documents. Treat legal and planning status as unverified; no confirmed legal defect is present in the supplied fields.";
    }
  }

  result.confidence = clampScore(result.confidence, 50);
  result.liquidityScore = clampScore(result.liquidityScore, 50);
  result.listingQualityScore = computeListingQualityScore(source, osData);
  return result;
};

const buildOsValuationResult = (osData: JsonRecord, input: StructuredValuationInput): JsonRecord => {
  const estimatedValue = Math.round(coerceFiniteNumber(osData.propertyPredictedPrice) ?? input.price);
  const leaseEstimate = coerceFiniteNumber(osData.propertyPredictedLeasePrice);
  const annualYield = normalizeAnnualYield(osData.annualYieldPrc);
  const saleComparables = countOverviewComparables(osData.saleValuationOverviews);
  const rentalComparables = countOverviewComparables(osData.rentalValuationOverviews);
  const pricePerSqm = firstOverviewNumber(osData.saleValuationOverviews, "propertyEurPerSqm") ??
    (input.sqm > 0 ? estimatedValue / input.sqm : null);
  const deltaPct = input.price > 0 ? roundNumber(((estimatedValue - input.price) / input.price) * 100) : 0;
  const listingType = optionalString(input.listingType)?.toLowerCase() ?? "sale";
  const isAuction = listingType === "auction";
  const confidence = Math.max(55, Math.min(90, 68 + Math.min(12, saleComparables + rentalComparables)));
  const liquidityScore = isAuction ? 45 : Math.max(55, Math.min(82, 62 + Math.min(14, saleComparables)));
  const comparablesText = `${saleComparables} sale and ${rentalComparables} rental comparables`;

  return {
    estimatedValue,
    rangeLow: Math.round(estimatedValue * (isAuction ? 0.72 : 0.9)),
    rangeHigh: Math.round(estimatedValue * (isAuction ? 0.92 : 1.1)),
    confidence,
    confidenceLabel: confidence >= 75 ? "High" : confidence >= 50 ? "Medium" : "Low",
    marketComparison: toMarketComparison(deltaPct),
    marketComparisonPct: deltaPct,
    liquidityScore,
    pricePerSqmEstimate: pricePerSqm == null ? null : Math.round(pricePerSqm),
    pricingPosition: toPricingPosition(deltaPct),
    rentalYieldEstimate: annualYield,
    executionValue: Math.round(estimatedValue * (isAuction ? 0.75 : 0.88)),
    objectiveValueProxy: null,
    auctionAdjustedValue: isAuction ? Math.round(estimatedValue / 0.8) : null,
    legalCleanliness: isAuction ? 45 : 65,
    planningCertainty: 70,
    taxFriction: isAuction ? 55 : 30,
    transferReadiness: isAuction ? 42 : 62,
    legalRiskScore: isAuction ? 55 : 28,
    taxRiskScore: isAuction ? 42 : 24,
    listingQualityScore: confidence,
    summary: [
      `mAI Prop OS predicts a market value of EUR ${estimatedValue.toLocaleString("en-US")}.`,
      leaseEstimate ? `Estimated monthly lease is EUR ${Math.round(leaseEstimate).toLocaleString("en-US")}.` : null,
      annualYield != null ? `Implied annual yield is ${annualYield}%.` : null,
      `The OS model used ${comparablesText}.`,
    ].filter(Boolean).join(" "),
    keyFactors: [
      { factor: "mAI Prop OS valuation", impact: "positive", note: "Structured OS valuation API response" },
      { factor: "Comparable depth", impact: saleComparables + rentalComparables > 0 ? "positive" : "neutral", note: comparablesText },
      annualYield != null ? { factor: "Rental yield", impact: "neutral", note: `${annualYield}% implied gross yield` } : null,
      { factor: "Asking price delta", impact: Math.abs(deltaPct) <= 5 ? "neutral" : deltaPct > 0 ? "positive" : "negative", note: `${deltaPct}% versus asking price` },
      { factor: "Legal/planning data", impact: isAuction ? "negative" : "neutral", note: isAuction ? "Auction risk remains" : "Document review still required" },
    ].filter(Boolean),
    legalSummary: isAuction
      ? "The structured OS valuation does not replace auction title, occupancy, and burden review. Confirm legal status before relying on the estimate."
      : "The structured OS valuation estimates market value from coordinates and property traits. Title, permit, and building identity documents still need review.",
    taxSummary: "Assumes normal Greek transfer friction unless legal review identifies special burdens.",
    renovationPotential: null,
    highestBestUseHint: null,
    redFlags: isAuction ? ["Auction valuations can shift materially after legal and title review."] : [],
    methodUsed: "mAI Prop OS structured valuation API (/api/v1/property/valuation)",
    valuationMode: "MODE_2_PUBLIC_ENRICHED",
    generatedBy: "maiprop_os",
    osDataSources: ["mAI Prop OS structured valuation API"],
    osComparableCounts: { sale: saleComparables, rental: rentalComparables },
  };
};

const buildOsPromptContext = (osData: JsonRecord | null): string => {
  if (!osData) {
    return "No structured mAI Prop OS valuation was available for this property. Use listing data and Greece 2026 benchmarks only.";
  }

  const saleComparables = countOverviewComparables(osData.saleValuationOverviews);
  const rentalComparables = countOverviewComparables(osData.rentalValuationOverviews);
  const compact = {
    propertyPredictedPrice: osData.propertyPredictedPrice,
    propertyPredictedLeasePrice: osData.propertyPredictedLeasePrice,
    annualYieldPrc: osData.annualYieldPrc,
    saleComparables,
    rentalComparables,
    salePricePerSqm: firstOverviewNumber(osData.saleValuationOverviews, "propertyEurPerSqm"),
    rentalPricePerSqm: firstOverviewNumber(osData.rentalValuationOverviews, "propertyEurPerSqm"),
    saleAvgListingPrice: firstOverviewNumber(osData.saleValuationOverviews, "avgListingPrice"),
    rentalAvgListingPrice: firstOverviewNumber(osData.rentalValuationOverviews, "avgListingPrice"),
  };

  return JSON.stringify(compact, null, 2);
};

const mergeOsEvidence = (result: JsonRecord, osData: JsonRecord | null, osFallback: JsonRecord | null): JsonRecord => {
  if (!osData || !osFallback) return result;

  const fallbackYield = coerceFiniteNumber(osFallback.rentalYieldEstimate);
  const fallbackPricePerSqm = coerceFiniteNumber(osFallback.pricePerSqmEstimate);
  const existingFactors = Array.isArray(result.keyFactors) ? result.keyFactors : [];
  return {
    ...osFallback,
    ...result,
    estimatedValue: coerceFiniteNumber(result.estimatedValue) ?? osFallback.estimatedValue,
    rangeLow: coerceFiniteNumber(result.rangeLow) ?? osFallback.rangeLow,
    rangeHigh: coerceFiniteNumber(result.rangeHigh) ?? osFallback.rangeHigh,
    executionValue: coerceFiniteNumber(result.executionValue) ?? osFallback.executionValue,
    pricePerSqmEstimate: coerceFiniteNumber(result.pricePerSqmEstimate) ?? fallbackPricePerSqm,
    rentalYieldEstimate: coerceFiniteNumber(result.rentalYieldEstimate) ?? fallbackYield,
    methodUsed: optionalString(result.methodUsed) ?? "OpenAI enriched valuation with mAI Prop OS structured valuation data",
    valuationMode: optionalString(result.valuationMode) ?? "MODE_2_PUBLIC_ENRICHED",
    keyFactors: [
      ...existingFactors,
      {
        factor: "mAI Prop OS data",
        impact: "positive",
        note: "Structured valuation and comparable counts used as model evidence",
      },
    ],
    generatedBy: "openai_maiprop_os",
    osEstimatedValue: osFallback.estimatedValue,
    osDataSources: ["mAI Prop OS structured valuation API", "OpenAI"],
    osComparableCounts: {
      sale: countOverviewComparables(osData.saleValuationOverviews),
      rental: countOverviewComparables(osData.rentalValuationOverviews),
    },
  };
};

const withOsDiagnostics = (
  result: JsonRecord,
  status: string,
  detail?: string,
): JsonRecord => ({
  ...result,
  osValuationStatus: status,
  ...(detail ? { osValuationDetail: detail } : {}),
});

const buildValuationEvidenceSection = (osData: JsonRecord | null, newBuildAiOnly: boolean): string => {
  if (newBuildAiOnly) {
    return `=== NEW-BUILD AI-ONLY COMPARABLE VALUATION ===
mAI Prop OS structured valuation is intentionally disabled for new-build and pre-sale inventory.
Use AI reasoning only, anchored to the supplied unit/project metrics, current Greek benchmark bands, and the most similar new-build, off-plan, or recently completed properties by:
- nearby micro-location first, then same neighbourhood/submarket, then adjacent municipality only if nearby evidence is sparse
- unit size, floor, layout, penthouse/top-floor status, energy class, parking/storage, pool/shared facilities, balcony/view, and delivery year
- construction phase, permit certainty, developer/project quality, and VAT/new-build premium
- asking €/sqm versus comparable new-build/off-plan unit archetypes
For every supplied property spec and facility, adjust premium or discount explicitly: parking, penthouse/top-floor, pool, elevator, storage, balcony, view, garden, energy class, delivery year, and finish/condition must be reflected in keyFactors when material.
Do not compare a project-average input against a starting-from price unless the supplied input explicitly represents that starting unit.
Do not invent exact comparable addresses or transactions; describe comparable archetypes and confidence limits instead.`;
  }

  return `=== MAIPROP OS STRUCTURED VALUATION DATA ===
${buildOsPromptContext(osData)}

Use mAI Prop OS data as primary quantitative evidence when available, then enrich it with OpenAI qualitative reasoning. Explain where the OS data, listing price, micro-location, liquidity, legal risk, and qualitative asset traits agree or diverge.`;
};

// ── Greece 2026 market benchmarks ─────────────────────────────────────────────
const MARKET_BENCHMARKS = `
GREECE 2026 — PROPERTY MARKET BENCHMARKS (Bank of Greece, REDS, AADE data):

RESIDENTIAL (€/sqm asking prices, Q1 2026):
- Athens premium (Kolonaki, Psychiko, Kifissia, Ekali): €4,800–9,500/sqm
- Athens central (Pagkrati, Mets, Koukaki, Plaka, Exarchia): €2,900–5,000/sqm
- Athens north (Marousi, Halandri, Cholargos): €2,700–4,400/sqm
- Athens south (Glyfada, Voula, Vouliagmeni): €3,800–7,500/sqm
- Athens east (Zografou, Kaesariani, Vyronas): €2,000–3,200/sqm
- Athens west (Peristeri, Ilion, Aegaleo): €1,400–2,500/sqm
- Piraeus center: €1,900–3,200/sqm
- Thessaloniki center: €2,400–3,800/sqm; suburbs: €1,500–2,600/sqm
- Heraklion Crete: €1,800–3,200/sqm; Chania: €2,200–4,200/sqm
- Patras: €900–1,900/sqm; Larissa: €900–1,800/sqm; Ioannina: €1,000–1,900/sqm

ISLANDS — RESIDENTIAL (€/sqm, Q1 2026):
- Mykonos (town/beach): €9,000–25,000+/sqm
- Santorini (Caldera rim): €12,000–30,000+/sqm; other areas €5,000–10,000/sqm
- Paros/Antiparos: €3,500–9,000/sqm; Rhodes: €2,500–6,000/sqm
- Corfu (sea view): €3,000–7,000/sqm; inland: €1,500–3,000/sqm
- Cephalonia/Zakynthos: €2,000–5,000/sqm; Lefkada: €2,000–4,500/sqm

VILLAS — PREMIUM LOCATIONS (€/sqm, Q1 2026):
- Attica (Kifissia/Ekali): €4,000–10,000/sqm; South Attica (Saronida): €3,000–7,000/sqm
- Halkidiki (Kassandra/Sithonia): €2,000–5,500/sqm
- Luxury island villas (Mykonos/Santorini): €8,000–35,000/sqm for turnkey

COMMERCIAL (€/sqm, yield bands, Q1 2026):
- Prime Athens retail (Ermou/Kolonaki): €4,000–9,000/sqm; yield 4.5–6.5%
- Secondary Athens retail: €1,500–3,500/sqm; yield 7–10%
- Athens CBD Grade-A office: €2,500–5,000/sqm; yield 5.5–7.5%
- Thessaloniki prime retail: €2,500–5,500/sqm; yield 5.5–8%

INDUSTRIAL / WAREHOUSE (€/sqm, Q1 2026):
- Attica industrial zone (Aspropyrgos/Elefsina): €400–900/sqm; yield 7–9%
- Secondary industrial: €200–500/sqm; yield 9–13%

LAND / PLOTS (€/sqm):
- Athens urban buildable plot: €500–3,000+/sqm depending on SD and location
- Agricultural land: €1–15/sqm; Tourist coastal: €5–120/sqm

MARKET DYNAMICS 2026 (Bank of Greece):
- Residential price trend: Athens +5–8% YoY; islands +7–12% YoY; regional +2–5% YoY
- PACE IS DECELERATING from 2022–2024 peaks
- Commercial market behaves DIFFERENTLY from residential
- Transaction costs buyer: ~8–11% total (FMA 3%, notary 1–1.5%, legal 0.5–1%, agent 2–3%)
- Transfer tax: 3% on objective/taxable value + municipal levy (~0.3%)
- New builds: 25–40% premium over resale same area/floor

RENTAL YIELDS 2026 (gross, asking):
- Athens center long-term: 3.5–5.5% gross
- Athens center short-term (Airbnb zones): 6–9% gross
- Tourist islands seasonal: 7–14% gross
- Regional cities: 4.5–7% gross
`;

// ── Greek legal/tax overlay framework ─────────────────────────────────────────
const LEGAL_TAX_FRAMEWORK = `
GREEK LEGAL & TAX OVERLAY — GREECE 2026 (AADE, Cadastre, e-Πολεοδομία):

SCORING MODEL (produce all four scores 0–100):

1. LEGAL_CLEANLINESS_SCORE (0–100):
   Inputs: cadastre clarity, title chain, permit status, building identity, ownership complexity, restriction risk.
   - Unknown listing fields are UNKNOWN, not confirmed defects. Do not mark absent listing metadata as illegal/title risk.
   - Standard urban apartment/house with no adverse signal but no documents = 60-75, not below 50.
   - Co-ownership or partial ownership = -10 to -25
   - Auction property with no title info = -30
   - Signs of illegal enclosures/extensions from photos/description = -15 to -25
   - Coastal/island/neoclassical/forest proximity = -10 to -20 (protection risk)
   - Standard urban apartment, no red flags mentioned = 65–80
   - Fully documented unit (permit cited, no issues) = 85–95

2. PLANNING_CERTAINTY_SCORE (0–100):
   Inputs: inside/outside plan certainty, SD/coverage/height data, land use, change-of-use feasibility.
   - For standard apartments, do not require buildability/SD fields unless the listing is land/plot/development.
   - Apartment/house in established urban area = 70–85 (assumed inside plan)
   - Plot with SD stated explicitly = 75–90
   - Plot with SD unknown = 30–50
   - Land outside settlement, no buildability data = 20–40
   - Hotel/commercial conversion claimed without use permit = 30–55
   - Standard apartment, no land complexity = 70–80

3. TAX_FRICTION_SCORE (0–100, higher = MORE friction):
   Inputs: transfer tax burden, objective value divergence, transfer complexity, doc readiness.
   - Standard transfer: ~3% FMA + notary + legal + agent = total buyer cost ~8–11%
   - Auction: add eviction/legal uncertainty friction
   - Foreign buyer Golden Visa property: add process complexity
   - Inheritance/donation path: higher friction
   - Commercial/industrial: higher complexity = higher friction
   - Scale: 10–25 = normal residential transfer; 30–50 = commercial/complex; 50–70 = auction/foreign/inheritance; 70–90 = very complex

4. TRANSFER_READINESS_SCORE (0–100):
   Inputs: building identity completeness, E9 consistency, digital transfer readiness, doc completeness, auction burden.
   - Digital transfer via myPROPERTY with all docs: 85–95
   - Standard apartment with likely complete docs: 65–80
   - Auction with unknown occupancy: 20–40
   - Missing building identity / permit issues: 30–55
   - Island property with multiple ownership unknowns: 25–50

PROPERTY-TYPE LEGAL RULES:
- RESIDENCE: Check horizontal property status, building identity, illegal enclosure risk, ENFIA/objective cross-check
- COMMERCIAL: Check allowed commercial use, lease tax completeness, change-of-use feasibility
- LAND: Check inside/outside plan, forest/coastal/archaeology protection, road access legality
- PLOT: Check SD/coverage/height/frontage, demolition obligations, planning constraint consistency
- VILLA/VACATION/ISLAND: Coastal restrictions, pool/extension legality, traditional settlement restrictions, tourism-use feasibility
- HOTEL: Hospitality-use legality, room count confidence, conversion feasibility
- MIXED-USE: Legality of use split, horizontal division, change-of-use, vacant-possession difficulty
- INDUSTRIAL: Industrial use legality, fire/operational compliance, environmental constraints
- AUCTION: Title burden, occupancy, eviction risk, document completeness, inspection access

VALUATION MODES (infer from available data):
- MODE 1 (LISTING ONLY): No legal data available — use conservative defaults, note as UNKNOWN
- MODE 2 (PUBLIC-ENRICHED): Objective value proxy, planning zone clues, auction flags — use where inferable
- MODE 3 (DOC-VERIFIED): Not applicable for listing sites — do not claim

OBJECTIVE VALUE:
- Use only as cross-check / tax reference, NOT as commercial AVM answer
- If objective value >> AVM estimate: flag transfer/tax mismatch risk
- If objective value << asking price: note tax/market divergence (do not reduce market value)

EXECUTION VALUE:
execution_value = market_value MINUS transaction_friction MINUS legal_uncertainty_discount
- legal_uncertainty_discount = 0–15% of market value based on legal_cleanliness_score
- transaction_friction = 8–11% for normal; 15–25% for auction; 20–35% for complex structures
`;

// ── Property-type specific methodology ────────────────────────────────────────
const getTypeInstructions = (propertyType: string, listingType: string): string => {
  const isAuction = listingType === "auction";

  const base: Record<string, string> = {
    apartment: `
METHODOLOGY: RESIDENTIAL APARTMENT — Comparable hedonic model (primary) + rental yield sense-check.
1. Extract micro-location → baseline €/sqm from benchmark table.
2. Adjustments: floor (ground -8 to -15%, semi-basement -20 to -35%, 5+ with elevator +3-8%), elevator absence above floor 2 = -5 to -10%, year built pre-1980 without reno = -10 to -25%, post-2010 = +5 to +15%, new build = +25-40%, condition poor -20 to -30% / luxury +15 to +30%, parking +4-8%, storage +1-3%, balcony +2-6%, sea view +10-40%, noisy road -5 to -12%.
3. Rental yield sanity check vs benchmark.
4. Range: ±6-10% urban with strong comps; ±12-20% for atypical/sparse.
Legal check: horizontal property, building identity, illegal enclosure risk, ENFIA cross-check.`,

    house: `
METHODOLOGY: DETACHED HOUSE — Comparable + cost support.
1. Separate building from land value contribution.
2. Building €/sqm for house subtype + garden premium (small <200sqm low; >500sqm significant).
3. Apply condition, year, view, corner adjustments. Cost floor: €900-1,600/sqm replacement cost.
4. Range: ±8-14% typical.
Legal check: building identity, extension legality, horizontal property if divided.`,

    villa: `
METHODOLOGY: VILLA — Premium feature nearest-neighbor (primary) + STR support (secondary in tourism).
DO NOT rely only on €/sqm.
1. Feature premium score: sea view direct +20-60%, pool +8-25%, land >1k sqm +10-30%, luxury finish +15-35%, privacy +5-15%, caldera/horizon +20-50%, guesthouse +5-20%.
2. Nearest-neighbor comps with high feature matching.
3. STR support: Mykonos/Santorini €120-500k/year; Crete/Rhodes €40-150k/year.
4. Range: ±12-25%. Liquidity: 0.3-0.6 non-prime; 0.6-0.8 prime island.
Legal check: coastal restrictions, pool/extension legality, traditional settlement, tourism-use feasibility.`,

    land: `
METHODOLOGY: AGRICULTURAL/NON-URBAN LAND — Conservative comparable + optional development scenario.
CRITICAL: DO NOT assume buildability from seller language.
1. Classify: agricultural | speculative | coastal/tourism | non-buildable rural.
2. Outside settlement: assume max 200sqm buildable unless SD clearly stated.
3. Comparable land €/sqm + premiums (sea proximity, access, flat, utilities).
4. Range: ±20-40%. Liquidity: 0.2-0.4 unless prime coastal.
Legal check: inside/outside plan, forest/coastal/archaeology, road access legality.`,

    commercial: `
METHODOLOGY: COMMERCIAL — Income-capitalization-informed comparable.
1. Subtype: retail | office | mixed small commercial.
2. RETAIL: market rent/sqm/month (prime Athens €20-50; secondary €8-18; regional €4-12), annual ERV × cap rate (prime 4.5-6.5%, secondary 7-10%, regional 9-13%), frontage +10-30%, basement dependence -15 to -30%.
3. OFFICE: Grade A €18-28/sqm/month Athens CBD; cap rate 5.5-7.5%; vacancy ~10-14% (hybrid work effect).
4. Cross-check sales comps. Range: ±10-18%.
NOTE: commercial ≠ residential momentum (Bank of Greece).
Legal check: allowed use, lease tax completeness, change-of-use feasibility.`,

    office: `
METHODOLOGY: OFFICE — Yield-informed comparable (Grade-based).
1. Grade inference from condition/description.
2. Market rent: Athens CBD Grade A €18-28; Grade B €10-18; peripheral €7-12/sqm/month.
3. Cap rate: Grade A 5.5-7%; Grade B 7-9.5%; Grade C 9-13%.
4. Vacancy Athens CBD ~10-14% (2026 hybrid-work). Range: ±10-15%.
Legal check: allowed use, building identity.`,
  };

  const auctionSuffix = isAuction ? `

AUCTION OVERLAY — Apply AFTER estimating clean market value:
- Estimate clean market value first (as if normal sale).
- Total auction discount = sum of: liquidity 5-15%, due diligence 3-8%, inspection uncertainty 3-10%, occupancy/eviction risk 5-20%, legal uncertainty 3-12%, repair unknown 2-8%.
- Typical total: 15-45% from clean market value.
- Smaller discount: standard urban apartment, vacant, good photos, many comps.
- Larger discount: occupied, no photos, special asset, island, industrial complexity.
- Output: estimated_market_value_if_clean (= auctionAdjustedValue) AND auction-adjusted value (= estimatedValue).` : "";

  const fallback = `
METHODOLOGY: GENERAL PROPERTY — Comparable model with type-specific adjustments.
Use benchmark table. Apply condition, location, feature adjustments. Range: ±15-25%. Liquidity: moderate 0.3-0.5.`;

  return (base[propertyType] || fallback) + auctionSuffix;
};

const getTransactionInstructions = (listingType: string): string => {
  if (listingType === "auction") {
    return `
AUCTION-SPECIFIC RISK MODEL:
- This is not a normal listing valuation. Estimate clean market value first, then separately estimate auction execution value.
- Explicitly price legal risk, title-burden uncertainty, eviction/occupancy risk, and limited observability of the interior/property condition.
- Limited observability means no full buyer inspection, incomplete photos, unknown hidden defects, unknown access, and unknown repair scope unless supplied data proves otherwise.
- Do not treat the starting bid or listing price as market value. Use it only as a comparison point after deriving the clean market value.
- auctionAdjustedValue must be the clean market value before auction discounts. estimatedValue must be the auction-adjusted value after legal, liquidity, observability, and execution discounts.
- Red flags may include only auction-specific due diligence risks or confirmed property defects; do not list AI/provider fallback status as a property red flag.`;
  }

  if (listingType === "rent") {
    return `
CLEAN LISTING ASSUMPTION:
- This is a normal rental listing, not an auction. Assume the property is clean, marketable, and ready to transact unless supplied fields explicitly confirm a legal/planning defect.
- Focus valuation on rent level, yield, location, asset quality, tenant demand, condition, amenities, floor, energy class, liquidity, and neighbourhood desirability.
- Do not apply auction discounts, eviction risk, title-burden discounts, or limited-observability penalties to normal listings.
- Missing cadastre, buildability, or city-plan fields on standard apartments/houses are data gaps, not red flags.`;
  }

  return `
CLEAN LISTING ASSUMPTION:
- This is a normal sale/listing ad, not an auction. Assume the property is clean, marketable, and ready to transact unless supplied fields explicitly confirm a legal/planning defect.
- Focus valuation on market benchmarks, micro-location, size, floor, age, condition, energy class, amenities, views/noise, renovation risk, liquidity, buyer depth, and qualitative desirability.
- Do not apply auction discounts, eviction risk, title-burden discounts, or limited-observability penalties to normal listings.
- Legal/tax overlay should stay light: standard transfer friction unless the listing data confirms complexity.
- Missing cadastre, buildability, or city-plan fields on standard apartments/houses are data gaps, not red flags.`;
};

// ── Main handler ───────────────────────────────────────────────────────────────
const fallbackBenchmarkPricePerSqm = (input: {
  city: string;
  region?: string;
  address?: string;
  propertyType?: string;
  listingType?: string;
}): number => {
  const location = [input.address, input.city, input.region].filter(Boolean).join(" ").toLowerCase();
  const propertyType = input.propertyType?.toLowerCase() ?? "apartment";
  const listingType = input.listingType?.toLowerCase() ?? "sale";

  let benchmark = 2_600;
  if (propertyType.includes("commercial") || propertyType.includes("retail")) benchmark = 2_800;
  else if (propertyType.includes("office")) benchmark = 2_900;
  else if (propertyType.includes("land") || propertyType.includes("plot")) benchmark = 850;
  else if (propertyType.includes("villa")) benchmark = 4_800;

  if (/glyf|γλυφ|voula|βούλα|vouliag|βουλιαγ|south athens|νότι/.test(location)) benchmark = 5_200;
  else if (/kolonaki|κολων|psychiko|ψυχικ|kifiss|κηφισ|ekali|εκαλ/.test(location)) benchmark = 6_200;
  else if (/pagkrati|παγκ|mets|koukaki|κουκακ|plaka|πλακ|exarch/.test(location)) benchmark = 3_900;
  else if (/marousi|μαρουσ|halandri|χαλανδρ|cholarg|χολαργ/.test(location)) benchmark = 3_400;
  else if (/zograf|ζωγραφ|kaisarian|καισαριαν|vyron|βυρων/.test(location)) benchmark = 2_600;
  else if (/perister|περιστερ|ilion|ιλιον|aigaleo|αιγαλ/.test(location)) benchmark = 1_900;
  else if (/piraeus|πειραι/.test(location)) benchmark = 2_550;
  else if (/thessaloniki|θεσσαλον/.test(location)) benchmark = /center|κεντρ/.test(location) ? 3_100 : 2_050;
  else if (/chania|χανι/.test(location)) benchmark = 3_200;
  else if (/heraklion|ηρακλ/.test(location)) benchmark = 2_450;
  else if (/mykonos|μυκον/.test(location)) benchmark = 12_000;
  else if (/santorini|σαντοριν/.test(location)) benchmark = 14_000;
  else if (/paros|παροσ|antiparos|αντιπαρ/.test(location)) benchmark = 5_500;

  if (listingType.includes("new_build") || listingType.includes("pre_sale")) benchmark *= 1.2;
  if (propertyType.includes("villa")) benchmark *= 1.15;
  if (propertyType.includes("land") || propertyType.includes("plot")) benchmark *= 0.55;

  return Math.round(benchmark);
};

const fallbackValuation = (input: { // skipcq: JS-R1005 - Deterministic valuation fallback keeps comparable scoring and confidence fields aligned.
  city: string;
  address?: string;
  region?: string;
  price: number;
  sqm: number;
  propertyType?: string;
  listingType?: string;
  reason?: string;
}) => {
  const sqm = Number.isFinite(input.sqm) && input.sqm > 0 ? input.sqm : 1;
  const listedPrice = Number.isFinite(input.price) && input.price > 0 ? input.price : 0;
  const pricePerSqm = fallbackBenchmarkPricePerSqm(input);
  const isAuction = input.listingType === "auction";
  const cleanMarketValue = Math.round(pricePerSqm * sqm);
  const estimatedValue = isAuction ? Math.round(cleanMarketValue * 0.82) : cleanMarketValue;
  const comparisonAnchor = isAuction ? cleanMarketValue : estimatedValue;
  const deltaPct = listedPrice > 0 ? roundNumber(((comparisonAnchor - listedPrice) / listedPrice) * 100, 1) : 0;
  const rangeLow = Math.round(comparisonAnchor * 0.88);
  const rangeHigh = Math.round(comparisonAnchor * 1.14);
  const executionValue = Math.round(comparisonAnchor * (1 - (isAuction ? 0.25 : 0.12)));

  return {
    estimatedValue,
    rangeLow,
    rangeHigh,
    executionValue,
    pricePerSqmEstimate: pricePerSqm,
    confidence: 45,
    confidenceLabel: "Low",
    liquidityScore: input.propertyType === "apartment" ? 68 : 45,
    marketComparison: toMarketComparison(deltaPct),
    marketComparisonPct: deltaPct,
    pricingPosition: toPricingPosition(deltaPct),
    methodUsed: "Deterministic fallback using 2026 Greece location/type benchmark ranges",
    valuationMode: "MODE_1_LISTING_ONLY",
    summary: `Preliminary benchmark valuation for ${input.city}: this uses a ${pricePerSqm.toLocaleString()} EUR/sqm 2026 market benchmark for the location and asset type rather than copying the listed price. Treat this as a temporary estimate until a full OS/OpenAI valuation can be generated.`,
    keyFactors: [
      { factor: "Location benchmark", impact: "neutral", note: `${pricePerSqm.toLocaleString()} EUR/sqm fallback benchmark` },
      { factor: "2026 market uncertainty", impact: "neutral", note: "Conservative confidence applied" },
      { factor: "Transaction costs", impact: "negative", note: "Execution value includes friction" },
      { factor: "Legal/planning data", impact: "negative", note: "Document status unknown" },
    ],
    legalCleanliness: 45,
    planningCertainty: input.propertyType === "apartment" ? 65 : 45,
    taxFriction: isAuction ? 55 : 30,
    transferReadiness: 50,
    legalSummary: "Legal and planning documents were not verified by this fallback valuation. Confirm title, building identity, permits, and restrictions before relying on the estimate.",
    taxSummary: "Assumes normal Greek transaction costs unless the asset is an auction or complex transfer.",
    objectiveValueProxy: null,
    renovationPotential: null,
    rentalYieldEstimate: input.propertyType === "apartment" ? 4.5 : 3.5,
    highestBestUseHint: null,
    redFlags: isAuction ? ["Auction legal, occupancy, and inspection status require independent verification."] : [],
    auctionAdjustedValue: isAuction ? cleanMarketValue : null,
    listingQualityScore: 40,
    generatedBy: "fallback",
    fallbackReason: input.reason ?? "the AI provider returned malformed JSON",
  };
};

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, valuation parsing, fallback, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await valuationLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  // Signed-in access gate is handled by enforceAiQuota; free vs Pro caps live in the DB.
  try {
    const body = await req.json();
    const {
      listingId, title, city, address, price, sqm, bedrooms, bathrooms,
      propertyType, listingType, floor, totalFloors, yearBuilt,
      heatingSystem, energyClass, pricePerSqm, hasParking, hasPool, hasElevator,
      hasGarden, hasStorage, hasBalcony, hasView, hasFurnished,
      region, description, tags,
      ownershipStatus, ownershipPercentage,
      auctionCourt, plotSurface, condition,
      isNeoclassical, isPreserved, distanceFromSea, withinCityPlan,
      withinSettlement, buildingAllowance, coverageRatio, isBuildable,
      cadastreNumber, hasLandConcession, landUse,
      latitude, longitude,
    } = body;

    const numericPrice = coerceFiniteNumber(price);
    const numericSqm = coerceFiniteNumber(sqm);
    if (!city || numericPrice == null || numericPrice <= 0 || numericSqm == null || numericSqm <= 0) {
      return new Response(
        JSON.stringify({ error: "city, sqm and price are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;
    const quotaUserId = quota.userId;

    const structuredValuationInput: StructuredValuationInput = {
      listingId: typeof listingId === "string" ? listingId : null,
      city: String(city),
      address,
      price: numericPrice,
      sqm: numericSqm,
      propertyType,
      listingType,
      latitude,
      longitude,
      floor,
      yearBuilt,
      condition,
    };

    let osValuationData: JsonRecord | null = null;
    let osValuationStatus = "not_requested";
    let osValuationDetail: string | undefined;
    const newBuildAiOnly = isNewBuildListing(listingType);
    const hasOsConfig = Boolean(
      (Deno.env.get("MAIPROP_OS_API_URL") ?? Deno.env.get("MAIPROP_OS_URL")) &&
        Deno.env.get("MAIPROP_OS_EMAIL") &&
        Deno.env.get("MAIPROP_OS_PASSWORD")
    );
    const hasOsInputs = buildOsValuationBody(structuredValuationInput) != null;
    if (newBuildAiOnly) osValuationStatus = "skipped_new_build_ai_only";
    else if (!hasOsConfig) osValuationStatus = "missing_config";
    else if (!hasOsInputs) osValuationStatus = "missing_inputs";
    else osValuationStatus = "requested";

    if (!newBuildAiOnly) {
      try {
        osValuationData = await fetchStructuredOsValuation(structuredValuationInput);
        osValuationStatus = osValuationData ? "ok" : osValuationStatus === "requested" ? "no_prediction" : osValuationStatus;
      } catch (osError) {
        osValuationStatus = "error";
        osValuationDetail = osError instanceof Error ? osError.message.slice(0, 120) : String(osError).slice(0, 120);
        log.warn("property-valuation: OS structured valuation unavailable; continuing with OpenAI", {
          listingId: structuredValuationInput.listingId,
          city,
          err: osError instanceof Error ? osError.message : String(osError),
        });
      }
    }
    const osValuationFallback = osValuationData
      ? buildOsValuationResult(osValuationData, structuredValuationInput)
      : null;

    if (!hasAIProviderCredentials()) {
      log.warn("property-valuation: AI provider key missing; using OS/fallback valuation", { city });
      const fallback = normalizeValuationResult(withOsDiagnostics(osValuationFallback ?? fallbackValuation({
        city: String(city),
        address: optionalString(address),
        region: optionalString(region),
        price: numericPrice,
        sqm: numericSqm,
        propertyType: typeof propertyType === "string" ? propertyType : undefined,
        listingType: typeof listingType === "string" ? listingType : undefined,
        reason: "the AI provider is not configured",
      }), osValuationStatus, osValuationDetail), body as JsonRecord, osValuationData);
      await recordAiCall(quotaUserId, BUCKET);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── Key property specifics (construction year, condition, heating) for valuation ──
    const keySpecifics = [
      yearBuilt != null && yearBuilt !== "" ? `Construction year: ${yearBuilt}` : null,
      condition ? `Condition: ${String(condition).replace(/_/g, " ")}` : null,
      heatingSystem ? `Heating: ${String(heatingSystem).replace(/_/g, " ")}` : null,
    ].filter(Boolean).join(". ") || "Not specified";

    // ── Build observed features layer ──────────────────────────────────────────
    const observedFeatures = [
      floor != null && `Floor: ${floor}${totalFloors ? `/${totalFloors}` : ""}`,
      yearBuilt && `Year built: ${yearBuilt}`,
      heatingSystem && `Heating: ${String(heatingSystem).replace(/_/g, " ")}`,
      energyClass && `Energy class: ${energyClass}`,
      bedrooms != null && `Bedrooms: ${bedrooms}`,
      bathrooms != null && `Bathrooms: ${bathrooms}`,
      hasParking && "Has parking",
      hasPool && "Has pool",
      hasElevator && "Has elevator",
      hasGarden && "Has garden",
      hasStorage && "Has storage",
      hasBalcony && "Has balcony",
      hasView && "Has view",
      hasFurnished && "Furnished",
      plotSurface && `Plot area: ${plotSurface}sqm`,
      condition && `Condition: ${String(condition).replace(/_/g, " ")}`,
      ownershipStatus && ownershipStatus !== "full" && `Ownership: ${ownershipStatus}${ownershipPercentage ? ` (${ownershipPercentage}%)` : ""}`,
      auctionCourt && `Auction court: ${auctionCourt}`,
      tags?.length && `Tags: ${tags.join(", ")}`,
    ].filter(Boolean).join(" | ") || "standard specification";

    // ── Legal/planning signals from listing data ────────────────────────────────
    const legalSignals = [
      cadastreNumber ? `Cadastre number: ${cadastreNumber} (KNOWN)` : "Cadastre: UNKNOWN",
      withinCityPlan != null ? `Within city plan: ${withinCityPlan ? "YES" : "NO"}` : "City plan status: UNKNOWN",
      withinSettlement != null ? `Within settlement: ${withinSettlement ? "YES" : "NO"}` : null,
      isBuildable != null ? `Buildable: ${isBuildable ? "YES" : "NO"}` : "Buildability: UNKNOWN",
      buildingAllowance ? `Building allowance (SD): ${buildingAllowance}` : "SD: UNKNOWN",
      coverageRatio ? `Coverage ratio: ${coverageRatio}` : null,
      isNeoclassical ? "Neoclassical (preservation risk)" : null,
      isPreserved ? "Preserved building (protection constraint)" : null,
      distanceFromSea != null ? `Distance from sea: ${distanceFromSea}m (coastal zone risk if <100m)` : null,
      hasLandConcession ? "Has land concession" : null,
      landUse ? `Land use: ${landUse}` : null,
      ownershipStatus && ownershipStatus !== "full" ? `Partial/complex ownership: ${ownershipStatus}` : null,
    ].filter(Boolean).join(" | ") || "No legal/planning fields available — use MODE 1 defaults";

    const listingDesc = description
      ? `Description excerpt: "${String(description).slice(0, 500)}"`
      : "";

    const normalizedListingType = optionalString(listingType)?.toLowerCase() ?? "sale";
    const normalizedPropertyType = optionalString(propertyType)?.toLowerCase() ?? "apartment";
    const transactionInstructions = getTransactionInstructions(normalizedListingType);
    const typeInstructions = getTypeInstructions(normalizedPropertyType, normalizedListingType);
    const promptPricePerSqm = coerceFiniteNumber(pricePerSqm) ?? Math.round(numericPrice / numericSqm);

    const prompt = `You are a senior Greek real estate valuation expert (RICS-equivalent) specialising in the 2026 Greek market. Produce a RIGOROUS, EVIDENCE-BASED valuation including a legal/tax overlay layer.

${MARKET_BENCHMARKS}

${LEGAL_TAX_FRAMEWORK}

=== PROPERTY TO VALUE ===
KEY PROPERTY SPECIFICS (use these in your methodology): ${keySpecifics}

Title: ${title || "Property"}
Location: ${address ? `${address}, ` : ""}${city}${region ? `, ${region}` : ""}, Greece
Type: ${propertyType || "apartment"} | Transaction: ${listingType || "sale"}
Size: ${sqm} sqm
Listed price: €${numericPrice.toLocaleString()} (€${Math.round(promptPricePerSqm)}/sqm)
Observed features: ${observedFeatures}
Legal/planning signals: ${legalSignals}
${listingDesc}

${buildValuationEvidenceSection(osValuationData, newBuildAiOnly)}

=== TRANSACTION CONTEXT ===
${transactionInstructions}

=== METHODOLOGY TO APPLY ===
${typeInstructions}

=== OUTPUT REQUIREMENTS ===
CRITICAL RULES:
1. DO NOT echo the listed price as your estimate. Cross-reference against benchmarks only; do not invent comparable sales or addresses.
2. Output a RANGE, not false precision. Range width must reflect data quality.
3. Apply TYPE-SPECIFIC logic — one formula for all types is wrong.
4. Missing legal data = UNKNOWN; never assume clean title or invent document status.
5. Produce all four legal/tax scores using the scoring model above.
6. execution_value = market_value minus transaction_friction minus legal_uncertainty_discount.
7. Price growth is DECELERATING in 2026 — do not extrapolate past rates.
8. Commercial behavior is DISTINCT from residential.
9. All figures must be supportable from the benchmarks and methodology above; do not hallucinate local comps or unsourced premiums.
10. Explicitly assess liquidity, buyer depth, area-specific micro-market quality, street/noise/view factors, renovation or fit-out risk, and qualitative desirability.

Return ONLY valid JSON, no markdown, no explanation outside the JSON:

{
  "estimatedValue": number (market value in EUR — auction-adjusted if auction),
  "rangeLow": number (conservative execution value),
  "rangeHigh": number (optimistic but supportable value),
  "executionValue": number (market_value minus transaction friction and legal uncertainty discount),
  "pricePerSqmEstimate": number (your 2026 benchmark €/sqm for this submarket),
  "confidence": number (0–100),
  "confidenceLabel": "High" | "Medium" | "Low",
  "liquidityScore": number (0–100),
  "marketComparison": "below_market" | "at_market" | "above_market",
  "marketComparisonPct": number (e.g. -12 = 12% below market; +8 = 8% above),
  "pricingPosition": "underpriced" | "fair" | "overpriced",
  "methodUsed": "string",
  "valuationMode": "MODE_1_LISTING_ONLY" | "MODE_2_PUBLIC_ENRICHED",
  "summary": "string (3–5 sentences: cite specific €/sqm benchmark, local 2026 trend, key drivers)",
  "keyFactors": [
    { "factor": "string", "impact": "positive" | "negative" | "neutral", "note": "string (max 100 chars)" }
  ],
  "legalCleanliness": number (0–100 — legal cleanliness score per framework above),
  "planningCertainty": number (0–100 — planning certainty score per framework above),
  "taxFriction": number (0–100 — tax/transfer friction score — higher = more friction),
  "transferReadiness": number (0–100 — transfer readiness score per framework above),
  "legalSummary": "string (2–3 sentences: key legal/planning signals observed, what is unknown, any red flags)",
  "taxSummary": "string (1–2 sentences: estimated transfer tax burden and key friction factors)",
  "objectiveValueProxy": number | null (rough ENFIA/objective value proxy in EUR — use for cross-check only; null if cannot estimate),
  "renovationPotential": "string or null",
  "rentalYieldEstimate": number (2026 gross yield %),
  "highestBestUseHint": "string or null",
  "redFlags": ["string"],
  "auctionAdjustedValue": number | null (clean market value before auction discounts — only if auction, else null),
  "listingQualityScore": number (0–100)
}

Rules:
- listingQualityScore is normalized by the server from supplied inputs and OS evidence.
- legalCleanliness reflects ONLY data available in the listing; do not fabricate certainty or treat unknown fields as confirmed defects.
- redFlags include only confirmed or strongly indicated problems. Missing cadastre/buildability/city-plan fields on standard apartments are data gaps, not red flags.
- marketComparisonPct uses the clean market value anchor. For auctions, compare listed price with auctionAdjustedValue, not executionValue or the auction-adjusted bid value.
- pricingPosition is "underpriced" only when the listed price is meaningfully below clean market value; "overpriced" only when listed price is above it.
- keyFactors: 4–7 items; always include a 2026 trend factor, transaction cost factor, and a legal/planning factor
- confidenceLabel: High = 75+, Medium = 50–74, Low = <50
- legalCleanliness: reflects ONLY data available in the listing — do not fabricate certainty
- Range width: ±6-10% urban apartment strong data; ±15-25% villa/land; ±20-40% island/hotel/plot
- liquidityScore: 80-100 = standard urban apartment; 60-80 = suburban/commercial; 40-60 = villa/vacation; 20-40 = island/land/industrial; 0-20 = hotel/special`;

    let response: Response;
    try {
      response = await openAIChatCompletion({
        messages: [{ role: "user", content: prompt }],
        temperature: 0.15,
        max_tokens: 4096,
        ...(newBuildAiOnly ? { reasoning_effort: NEW_BUILD_OPENAI_REASONING_EFFORT } : {}),
      }, newBuildAiOnly ? NEW_BUILD_OPENAI_MODEL : undefined);
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      log.error("AI gateway transport error", { detail });
      const fallback = normalizeValuationResult(withOsDiagnostics(osValuationFallback ?? fallbackValuation({
        city: String(city),
        address: optionalString(address),
        region: optionalString(region),
        price: numericPrice,
        sqm: numericSqm,
        propertyType: typeof propertyType === "string" ? propertyType : undefined,
        listingType: typeof listingType === "string" ? listingType : undefined,
        reason: "the AI provider request failed",
      }), osValuationStatus, osValuationDetail), body as JsonRecord, osValuationData);
      await recordAiCall(quotaUserId, BUCKET);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (!response.ok) {
      const txt = await response.text();
      log.error("AI gateway error", { status: response.status, body: txt.slice(0, 500) });
      const fallback = normalizeValuationResult(withOsDiagnostics(osValuationFallback ?? fallbackValuation({
        city: String(city),
        address: optionalString(address),
        region: optionalString(region),
        price: numericPrice,
        sqm: numericSqm,
        propertyType: typeof propertyType === "string" ? propertyType : undefined,
        listingType: typeof listingType === "string" ? listingType : undefined,
        reason: `the AI provider returned ${response.status}`,
      }), osValuationStatus, osValuationDetail), body as JsonRecord, osValuationData);
      await recordAiCall(quotaUserId, BUCKET);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await response.json();
    let raw = readOpenAITextContent(aiData);

    // Step 1: strip markdown code fences (greedy to capture full JSON)
    const fenceMatch = raw.match(/```(?:json)?\s*([\s\S]+?)```\s*$/);
    if (fenceMatch) {
      raw = fenceMatch[1].trim();
    } else {
      // Fallback: grab first { ... } block (greedy)
      const braceMatch = raw.match(/\{[\s\S]+\}/);
      if (braceMatch) raw = braceMatch[0];
    }

    // Step 2: minimal JSON repair
    raw = raw
      .replace(/,\s*([}\]])/g, "$1")   // trailing commas
      .replace(/\)\s*\}/g, "}")          // stray closing paren
      .trim();

    let result;
    try {
      result = JSON.parse(raw);
    } catch (parseErr) {
      log.warn("property-valuation: AI returned invalid JSON; using fallback valuation", {
        err: parseErr instanceof Error ? parseErr.message : String(parseErr),
        city,
        rawLength: raw.length,
        sample: raw.slice(0, 240),
      });
      result = osValuationFallback ?? fallbackValuation({
        city: String(city),
        address: optionalString(address),
        region: optionalString(region),
        price: numericPrice,
        sqm: numericSqm,
        propertyType: typeof propertyType === "string" ? propertyType : undefined,
        listingType: typeof listingType === "string" ? listingType : undefined,
        reason: "the AI provider returned malformed JSON",
      });
    }

    // Ensure backwards-compatible fields
    if (!result.executionValue) {
      const discount = (100 - (result.legalCleanliness || 70)) / 100 * 0.1;
      result.executionValue = Math.round(result.estimatedValue * (1 - 0.09 - discount));
    }
    if (!result.legalCleanliness) result.legalCleanliness = 50;
    if (!result.planningCertainty) result.planningCertainty = 60;
    if (!result.taxFriction) result.taxFriction = 30;
    if (!result.transferReadiness) result.transferReadiness = 55;
    if (!result.valuationMode) result.valuationMode = "MODE_1_LISTING_ONLY";
    if (!result.generatedBy) result.generatedBy = "openai";
    result = withOsDiagnostics(mergeOsEvidence(result, osValuationData, osValuationFallback), osValuationStatus, osValuationDetail);
    result = normalizeValuationResult(result, body as JsonRecord, osValuationData);

    // Record usage after successful AI call
    await recordAiCall(quotaUserId, BUCKET);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    log.error("valuation error", { err: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
