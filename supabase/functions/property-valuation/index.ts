import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { errorResponse } from "../_shared/response.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("property-valuation");

const BUCKET = "property-valuation";
const NEW_BUILD_OPENAI_MODEL = "gpt-5.4";
const NEW_BUILD_OPENAI_REASONING_EFFORT = "medium";
const valuationLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 15, windowMs: 60_000, failClosed: true });
const OS_VALUATION_TIMEOUT_MS = 25_000;
const OS_AUTH_TOKEN_CACHE_TTL_MS = 10 * 60_000;
const MAX_BUILDING_ALLOWANCE_SQM = 100_000;

const PROPERTY_TYPES = [
  "apartment",
  "house",
  "villa",
  "land",
  "commercial",
  "office",
  "studio",
  "maisonette",
  "warehouse",
  "hotel",
  "mixed_use",
  "parking",
  "storage",
] as const;

const LISTING_TYPES = [
  "sale",
  "rent",
  "auction",
  "firesale",
  "open_house",
  "new_build",
] as const;

const OPEN_HOUSE_TRANSACTION_TYPES = ["sale", "rent"] as const;

const optionalBoundedText = (label: string, maxLength: number) =>
  z.preprocess(
    (value) => value === null || value === undefined ? undefined : value,
    z.string().trim().max(maxLength, `Invalid ${label}`).optional(),
  );

const boundedNumberInput = (
  label: string,
  min: number,
  max: number,
  integer = false,
) => {
  let output = z.number(`Invalid ${label}`)
    .finite(`Invalid ${label}`)
    .min(min, `Invalid ${label}`)
    .max(max, `Invalid ${label}`);
  if (integer) output = output.int(`Invalid ${label}`);
  return z.union([
    z.number(),
    z.string().trim().min(1, `Invalid ${label}`),
  ])
    .transform((value) => typeof value === "number" ? value : Number(value))
    .pipe(output);
};

const optionalBoundedNumber = (
  label: string,
  min: number,
  max: number,
  integer = false,
) =>
  z.preprocess(
    (value) => value === null || value === undefined || value === "" ? undefined : value,
    boundedNumberInput(label, min, max, integer).optional(),
  );

const optionalBoolean = z.preprocess(
  (value) => value === null || value === undefined ? undefined : value,
  z.boolean().optional(),
);

const optionalPropertyType = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  },
  z.enum(PROPERTY_TYPES).optional(),
);

const optionalListingType = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  },
  z.enum(LISTING_TYPES).optional(),
);

const optionalOpenHouseTransactionType = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return undefined;
    if (typeof value !== "string") return value;
    const normalized = value.trim();
    return normalized === "" ? undefined : normalized;
  },
  z.enum(OPEN_HOUSE_TRANSACTION_TYPES).optional(),
);

const propertyValuationRequestSchema = z.object({
  responseVersion: z.literal(2).optional(),
  listingId: optionalBoundedText("listing id", 120),
  title: optionalBoundedText("valuation title", 180),
  city: z.string("Invalid valuation city")
    .trim()
    .min(1, "Invalid valuation city")
    .max(120, "Invalid valuation city"),
  address: optionalBoundedText("valuation address", 500),
  price: boundedNumberInput("valuation price", 1, 1_000_000_000),
  sqm: boundedNumberInput("valuation size", 1, 10_000_000),
  bedrooms: optionalBoundedNumber("bedroom count", 0, 100, true),
  bathrooms: optionalBoundedNumber("bathroom count", 0, 100, true),
  propertyType: optionalPropertyType,
  listingType: optionalListingType,
  openHouseTransactionType: optionalOpenHouseTransactionType,
  askingMonthlyRent: optionalBoundedNumber("asking monthly rent", 1, 10_000_000),
  floor: optionalBoundedNumber("floor", -20, 250, true),
  totalFloors: optionalBoundedNumber("total floors", 0, 250, true),
  yearBuilt: optionalBoundedNumber("construction year", 1000, 2100, true),
  heatingSystem: optionalBoundedText("heating system", 120),
  energyClass: optionalBoundedText("energy class", 40),
  pricePerSqm: optionalBoundedNumber("price per sqm", 0, 1_000_000),
  hasParking: optionalBoolean,
  hasPool: optionalBoolean,
  hasElevator: optionalBoolean,
  hasGarden: optionalBoolean,
  hasStorage: optionalBoolean,
  hasBalcony: optionalBoolean,
  hasView: optionalBoolean,
  hasFurnished: optionalBoolean,
  region: optionalBoundedText("valuation region", 120),
  description: optionalBoundedText("valuation description", 5000),
  tags: z.preprocess(
    (value) => value === null || value === undefined ? undefined : value,
    z.array(
      z.string().trim().min(1, "Invalid valuation tag").max(80, "Invalid valuation tag"),
    ).max(30, "Invalid valuation tags").optional(),
  ),
  ownershipStatus: optionalBoundedText("ownership status", 80),
  ownershipPercentage: optionalBoundedNumber("ownership percentage", 0, 100),
  auctionCourt: optionalBoundedText("auction court", 240),
  plotSurface: optionalBoundedNumber("plot surface", 0, 100_000_000),
  condition: optionalBoundedText("property condition", 1000),
  isNeoclassical: optionalBoolean,
  isPreserved: optionalBoolean,
  distanceFromSea: optionalBoundedNumber("distance from sea", 0, 2_000_000),
  withinCityPlan: optionalBoolean,
  withinSettlement: optionalBoolean,
  buildingAllowance: optionalBoundedNumber(
    "building allowance",
    0,
    MAX_BUILDING_ALLOWANCE_SQM,
  ),
  coverageRatio: optionalBoundedNumber("coverage ratio", 0, 100),
  isBuildable: optionalBoolean,
  cadastreNumber: optionalBoundedText("cadastre number", 160),
  hasLandConcession: optionalBoolean,
  landUse: optionalBoundedText("land use", 240),
  latitude: optionalBoundedNumber("property latitude", -90, 90),
  longitude: optionalBoundedNumber("property longitude", -180, 180),
}).strict();

type CachedOsAuthToken = {
  cacheKey: string;
  token: string;
  expiresAt: number;
};

let cachedOsAuthToken: CachedOsAuthToken | null = null;

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

const osAuthCacheKey = (baseUrl: string, email: string): string => `${baseUrl}\n${email}`;

const getCachedOsAuthToken = (baseUrl: string, email: string): string | null => {
  const cacheKey = osAuthCacheKey(baseUrl, email);
  if (!cachedOsAuthToken || cachedOsAuthToken.cacheKey !== cacheKey) return null;
  if (cachedOsAuthToken.expiresAt <= Date.now()) {
    cachedOsAuthToken = null;
    return null;
  }
  return cachedOsAuthToken.token;
};

const invalidateCachedOsAuthToken = (baseUrl: string, email: string): void => {
  if (cachedOsAuthToken?.cacheKey === osAuthCacheKey(baseUrl, email)) {
    cachedOsAuthToken = null;
  }
};

const fetchCachedOsAuthToken = async (baseUrl: string, email: string, password: string): Promise<string> => {
  const cached = getCachedOsAuthToken(baseUrl, email);
  if (cached) return cached;

  const token = await fetchOsAuthToken(baseUrl, email, password);
  cachedOsAuthToken = {
    cacheKey: osAuthCacheKey(baseUrl, email),
    token,
    expiresAt: Date.now() + OS_AUTH_TOKEN_CACHE_TTL_MS,
  };
  return token;
};

const buildOsValuationBody = (input: StructuredValuationInput): JsonRecord | null => {
  const latitude = coerceFiniteNumber(input.latitude);
  const longitude = coerceFiniteNumber(input.longitude);
  const sqm = coerceFiniteNumber(input.sqm);
  const year = coerceFiniteNumber(input.yearBuilt);
  const floor = coerceFiniteNumber(input.floor);
  if (latitude == null || longitude == null || sqm == null || sqm <= 0 || year == null || year < 1900 || year > 2100 || floor == null) return null;

  const addressParts = [optionalString(input.address), input.city].filter(Boolean);
  const listingType = optionalString(input.listingType)?.toLowerCase() ?? "sale";

  const categoryKey = optionalString(input.propertyType)?.toLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
  const category = OS_PROPERTY_CATEGORY[categoryKey] ?? OS_PROPERTY_CATEGORY[categoryKey.replace(/_property$/, "")];
  return {
    constructionYear: Math.round(year),
    propertyLongitude: longitude,
    propertyLatitude: latitude,
    propertySquareMeters: sqm,
    ...(category ? { propertyCategory: category } : {}),
    propertyFloor: Math.round(floor),
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

const fetchOsValuationResponse = async (
  baseUrl: string,
  token: string,
  requestBody: JsonRecord,
): Promise<Response> => {
  try {
    return await fetchWithTimeout(`${baseUrl}/api/v1/property/valuation`, {
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
};

const fetchStructuredOsValuation = async (input: StructuredValuationInput): Promise<JsonRecord | null> => {
  const baseUrl = (Deno.env.get("MAIPROP_OS_API_URL") ?? Deno.env.get("MAIPROP_OS_URL"))?.replace(/\/+$/, "");
  const email = Deno.env.get("MAIPROP_OS_EMAIL");
  const password = Deno.env.get("MAIPROP_OS_PASSWORD");
  const requestBody = buildOsValuationBody(input);

  if (!baseUrl || !email || !password || !requestBody) return null;

  let token = await fetchCachedOsAuthToken(baseUrl, email, password);
  let response = await fetchOsValuationResponse(baseUrl, token, requestBody);
  if (response.status === 401 || response.status === 403) {
    invalidateCachedOsAuthToken(baseUrl, email);
    token = await fetchCachedOsAuthToken(baseUrl, email, password);
    response = await fetchOsValuationResponse(baseUrl, token, requestBody);
  }

  const payload = await readJsonSafely(response);
  if (!response.ok) {
    throw new Error(`OS valuation failed with status ${response.status}`);
  }

  const data = unwrapOsData(payload);
  const predictedPrice = coerceFiniteNumber(data?.propertyPredictedPrice);
  const predictedLeasePrice = coerceFiniteNumber(data?.propertyPredictedLeasePrice);
  const hasUsefulData = (predictedPrice != null && predictedPrice > 0) ||
    (predictedLeasePrice != null && predictedLeasePrice > 0) ||
    Array.isArray(data?.valuationOverviews) || Array.isArray(data?.rentalValuationOverviews);
  return hasUsefulData ? data : null;
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

const isNewBuildListing = (value: unknown): boolean => {
  const listingType = optionalString(value)?.toLowerCase() ?? "";
  return listingType === "new_build" || listingType === "new-building" || listingType === "pre_sale" || listingType === "pre-sale";
};

const isNewOrRecentConstruction = (source: JsonRecord): boolean => {
  const condition = optionalString(source.condition)?.toLowerCase() ?? "";
  const yearBuilt = coerceFiniteNumber(source.yearBuilt);
  return isNewBuildListing(source.listingType) ||
    /new|recent|under.?construction|off.?plan|first.?occupancy/.test(condition) ||
    (yearBuilt != null && yearBuilt >= 2021);
};

const buildOsPromptContext = (osData: JsonRecord | null): string => {
  if (!osData) {
    return "No structured mAI Prop OS valuation was available for this property. Do not infer a numeric value from the listing price or unsupported market defaults.";
  }

  const saleComparables = countOverviewComparables(osData.saleValuationOverviews);
  const rentalComparables = countOverviewComparables(osData.rentalValuationOverviews);
  const compact = {
    propertyPredictedPrice: osData.propertyPredictedPrice,
    propertyPredictedLeasePrice: osData.propertyPredictedLeasePrice == null ? null : {
      value: osData.propertyPredictedLeasePrice,
      unit: null,
      limitation: "Provider rental period is unavailable; do not use this observation as monthly rent or as a monthly valuation anchor.",
    },
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

const buildValuationEvidenceSection = (osData: JsonRecord | null, newBuildAiOnly: boolean): string => {
  if (newBuildAiOnly) {
    return `=== NEW-BUILD AI-ONLY COMPARABLE VALUATION ===
mAI Prop OS structured valuation is intentionally disabled for new-build and pre-sale inventory.
Use AI reasoning only from the supplied unit/project metrics and provider observations. Qualitative comparison may consider new-build, off-plan, or recently completed property archetypes by:
- nearby micro-location first, then same neighbourhood/submarket, then adjacent municipality only if nearby evidence is sparse
- unit size, floor, layout, penthouse/top-floor status, energy class, parking/storage, pool/shared facilities, balcony/view, and delivery year
- construction phase, permit certainty, developer/project quality, and VAT/new-build premium
- asking €/sqm only when an independent provider observation supplies a comparison anchor
For every supplied property spec and facility, describe its qualitative relevance without inventing a premium or discount: parking, penthouse/top-floor, pool, elevator, storage, balcony, view, garden, energy class, delivery year, and finish/condition must be reflected in keyFactors when material.
Do not compare a project-average input against a starting-from price unless the supplied input explicitly represents that starting unit.
Do not invent exact comparable addresses or transactions; describe comparable archetypes and confidence limits instead.`;
  }

  return `=== MAIPROP OS STRUCTURED VALUATION DATA ===
${buildOsPromptContext(osData)}

Use mAI Prop OS fields with established units as quantitative evidence when available, then enrich them with OpenAI qualitative reasoning. An unknown-period lease observation is context only and is not a monthly valuation anchor. Explain where the OS data, listing price, micro-location, liquidity, legal risk, and qualitative asset traits agree or diverge.`;
};

const V2_NUMERIC_FIELDS = [
  "estimatedValue", "auctionAdjustedValue", "rangeLow", "rangeHigh", "executionValue",
  "pricePerSqmEstimate", "rentalYieldEstimate", "objectiveValueProxy", "confidence",
  "liquidityScore", "legalCleanliness", "planningCertainty", "taxFriction",
  "transferReadiness", "listingQualityScore", "marketComparisonPct",
] as const;
type V2NumericField = typeof V2_NUMERIC_FIELDS[number];
type V2FieldSource = "os_prediction" | "derived_os" | "ai_estimate" | "derived_ai" | "listing_completeness" | "unavailable";

const strictFinite = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;
const positiveStrict = (value: unknown): number | null => {
  const numeric = strictFinite(value);
  return numeric != null && numeric > 0 ? numeric : null;
};
const scoreStrict = (value: unknown): number | null => {
  const numeric = strictFinite(value);
  return numeric != null && numeric >= 0 && numeric <= 100 ? numeric : null;
};
const textStrict = (value: unknown): string | null =>
  typeof value === "string" && value.trim() ? value.trim() : null;
const stringArray = (value: unknown): string[] => Array.isArray(value)
  ? value.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim())
  : [];
const keyFactors = (value: unknown): Array<{ factor: string; impact: "positive" | "neutral" | "negative"; note: string }> =>
  Array.isArray(value) ? value.flatMap((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return [];
    const record = item as JsonRecord;
    const factor = textStrict(record.factor);
    const note = textStrict(record.note);
    const impact = record.impact;
    return factor && note && (impact === "positive" || impact === "neutral" || impact === "negative")
      ? [{ factor, impact, note }]
      : [];
  }) : [];

const normalizeTransaction = (source: JsonRecord): "sale" | "rent" | "auction" => {
  const listingType = optionalString(source.listingType)?.toLowerCase();
  if (listingType === "auction") return "auction";
  if (listingType === "rent" || listingType === "rental" ||
      (listingType === "open_house" && optionalString(source.openHouseTransactionType)?.toLowerCase() === "rent")) return "rent";
  return "sale";
};

const buildV2Valuation = (source: JsonRecord, osData: JsonRecord | null, aiValue: unknown, osStatus: string): JsonRecord | null => {
  const ai = aiValue && typeof aiValue === "object" && !Array.isArray(aiValue) ? aiValue as JsonRecord : null;
  const transaction = normalizeTransaction(source);
  const valueUnit = transaction === "rent" ? "EUR/month" : "EUR";
  const osSale = positiveStrict(osData?.propertyPredictedPrice);
  const osLease = positiveStrict(osData?.propertyPredictedLeasePrice);
  const aiEstimate = positiveStrict(ai?.estimatedValue);
  const aiClean = transaction === "auction" ? positiveStrict(ai?.auctionAdjustedValue) : null;
  const estimatedValue = transaction === "sale" ? (osSale ?? aiEstimate) :
    transaction === "rent" ? aiEstimate : osSale;
  const estimatedSource: V2FieldSource = estimatedValue == null ? "unavailable" :
    ((transaction === "sale" && osSale != null) || (transaction === "auction" && osSale != null)) ? "os_prediction" : "ai_estimate";
  const auctionAdjustedValue = aiClean;
  const primaryForDensity = transaction === "auction" ? (auctionAdjustedValue ?? estimatedValue) : estimatedValue;
  const primarySource = transaction === "auction" && auctionAdjustedValue != null ? "ai_estimate" : estimatedSource;
  const sqm = positiveStrict(source.sqm);
  const pricePerSqmEstimate = primaryForDensity != null && sqm != null ? roundNumber(primaryForDensity / sqm, 2) : null;
  const comparisonAnchor = transaction === "auction" ? auctionAdjustedValue : estimatedValue;
  const asking = positiveStrict(source.price);
  const rawComparison = comparisonAnchor != null && asking != null ? ((asking - comparisonAnchor) / comparisonAnchor) * 100 : null;
  const marketComparisonPct = rawComparison == null ? null : Math.round(rawComparison);
  const marketComparison = rawComparison == null ? null : toMarketComparison(rawComparison);
  const pricingPosition = rawComparison == null ? null : rawComparison > 5 ? "overpriced" : rawComparison < -5 ? "underpriced" : "fair";
  const confidence = scoreStrict(ai?.confidence);
  const liquidityScore = scoreStrict(ai?.liquidityScore);
  const confidenceLabel = confidence == null ? null : confidence >= 75 ? "High" : confidence >= 50 ? "Medium" : "Low";
  const rangeLowCandidate = positiveStrict(ai?.rangeLow);
  const rangeHighCandidate = positiveStrict(ai?.rangeHigh);
  const rangeBasis = transaction === "auction" ? (auctionAdjustedValue != null ? "auctionAdjustedValue" : null) :
    (estimatedValue != null && estimatedSource === "ai_estimate" ? "estimatedValue" : null);
  const rangeAnchor = rangeBasis === "auctionAdjustedValue" ? auctionAdjustedValue : rangeBasis === "estimatedValue" ? estimatedValue : null;
  const validRange = rangeLowCandidate != null && rangeHighCandidate != null && rangeAnchor != null && rangeLowCandidate <= rangeAnchor && rangeAnchor <= rangeHighCandidate;
  const rangeLow = validRange ? rangeLowCandidate : null;
  const rangeHigh = validRange ? rangeHighCandidate : null;
  const summary = textStrict(ai?.summary);
  const legalSummary = textStrict(ai?.legalSummary);
  const taxSummary = textStrict(ai?.taxSummary);
  const renovationPotential = textStrict(ai?.renovationPotential);
  const highestBestUseHint = textStrict(ai?.highestBestUseHint);
  const factors = keyFactors(ai?.keyFactors);
  const redFlags = stringArray(ai?.redFlags);
  const providerPrediction = transaction === "rent" && osLease != null
    ? { value: osLease, field: "propertyPredictedLeasePrice", model: "market", unit: null }
    : osSale != null
      ? { value: osSale, field: "propertyPredictedPrice", model: transaction === "auction" ? "auction" : "market", unit: "EUR" }
      : null;
  const hasUsefulAnalysis = Boolean(
    summary || legalSummary || taxSummary || renovationPotential || highestBestUseHint || factors.length || redFlags.length,
  );
  if (estimatedValue == null && auctionAdjustedValue == null && providerPrediction == null && !hasUsefulAnalysis) return null;

  const fields = Object.fromEntries(V2_NUMERIC_FIELDS.map((field) => [field, "unavailable"])) as Record<V2NumericField, V2FieldSource>;
  fields.estimatedValue = estimatedSource;
  fields.auctionAdjustedValue = auctionAdjustedValue == null ? "unavailable" : "ai_estimate";
  fields.rangeLow = rangeLow == null ? "unavailable" : "ai_estimate";
  fields.rangeHigh = rangeHigh == null ? "unavailable" : "ai_estimate";
  fields.pricePerSqmEstimate = pricePerSqmEstimate == null ? "unavailable" : primarySource === "os_prediction" ? "derived_os" : "derived_ai";
  fields.confidence = confidence == null ? "unavailable" : "ai_estimate";
  fields.liquidityScore = liquidityScore == null ? "unavailable" : "ai_estimate";
  fields.marketComparisonPct = marketComparisonPct == null ? "unavailable" : (transaction === "auction" || estimatedSource === "ai_estimate") ? "derived_ai" : "derived_os";
  const limitations = [
    "No legal documents, live comparable transactions, or formal appraisal were independently verified.",
    osStatus === "missing_inputs" ? "OS valuation was skipped because required source attributes were unavailable." : null,
    transaction === "rent" && osLease != null ? "The OS rental prediction period is unavailable, so it is retained only as an unknown-period provider observation." : null,
    transaction === "auction" && osSale != null ? "The OS auction-model prediction is not represented as a clean-market value, bid, or execution value." : null,
    ai ? "Model estimates and qualitative assessments are unverified." : null,
  ].filter((item): item is string => Boolean(item));
  return {
    responseVersion: 2,
    status: estimatedValue != null || auctionAdjustedValue != null ? "available" : "partial",
    transaction,
    valueUnit,
    estimateBasis: transaction === "rent" ? "monthly_rent" : transaction === "auction" && osSale != null ? "os_auction_model" : "market_value",
    providerPrediction,
    estimatedValue,
    auctionAdjustedValue,
    rangeLow,
    rangeHigh,
    rangeBasis: validRange ? rangeBasis : null,
    executionValue: null,
    pricePerSqmEstimate,
    rentalYieldEstimate: null,
    objectiveValueProxy: null,
    confidence,
    confidenceLabel,
    liquidityScore,
    legalCleanliness: null,
    planningCertainty: null,
    taxFriction: null,
    transferReadiness: null,
    listingQualityScore: null,
    marketComparison,
    marketComparisonPct,
    pricingPosition,
    summary,
    legalSummary,
    taxSummary,
    renovationPotential,
    highestBestUseHint,
    keyFactors: factors,
    redFlags,
    methodUsed: estimatedSource === "os_prediction" ? (transaction === "auction" ? "OS auction-model prediction" : "OS market-model prediction") :
      ai ? "Unverified AI valuation analysis" : "OS provider observation",
    evidence: {
      independentlyVerified: false,
      fields,
      analysis: ai && hasUsefulAnalysis ? "ai_estimate" : osData ? "os_summary" : "unavailable",
      limitations,
    },
  };
};

const valuationUnavailable = (corsHeaders: Record<string, string>): Response =>
  errorResponse("Valuation evidence unavailable", 503, corsHeaders, { code: "valuation_unavailable" });

const legacyCompatibilityResponse = async (req: Request, corsHeaders: Record<string, string>): Promise<Response> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) return errorResponse("Authentication required", 401, corsHeaders);
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return errorResponse("Authentication service unavailable", 503, corsHeaders);
  const authResponse = await fetch(`${url}/auth/v1/user`, { headers: { Authorization: authHeader, apikey: key } });
  if (!authResponse.ok) return errorResponse("Invalid or expired token", 401, corsHeaders);
  return valuationUnavailable(corsHeaders);
};

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, valuation parsing, fallback, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await valuationLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  // Signed-in access gate is handled by enforceAiQuota; free vs Pro caps live in the DB.
  try {
    const body = await parseJsonBody(req, propertyValuationRequestSchema);
    const {
      responseVersion,
      listingId, title, city, address, price, sqm, bedrooms, bathrooms,
      propertyType, listingType, floor, totalFloors, yearBuilt,
      openHouseTransactionType, askingMonthlyRent,
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

    if (responseVersion !== 2) return await legacyCompatibilityResponse(req, corsHeaders);

    if (listingType === "open_house" && openHouseTransactionType === "rent" && askingMonthlyRent != null && askingMonthlyRent !== price) {
      return errorResponse("Rental asking values must match", 400, corsHeaders, { code: "validation_error" });
    }

    const numericPrice = price;
    const numericSqm = sqm;

    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;

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
        log.warn("property-valuation: OS structured valuation unavailable; continuing with OpenAI", {
          listingId: structuredValuationInput.listingId,
          city,
          err: osError instanceof Error ? osError.message : String(osError),
        });
      }
    }
    if (!hasAIProviderCredentials()) {
      log.warn("property-valuation: AI provider key missing; returning supported OS evidence only", { city });
      const fallback = buildV2Valuation(body as JsonRecord, osValuationData, null, osValuationStatus);
      return fallback ? new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }) : valuationUnavailable(corsHeaders);
    }

    // ── Key property specifics (construction year, condition, heating) for valuation ──
    const keySpecifics = [
      yearBuilt != null ? `Construction year: ${yearBuilt}` : null,
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
      buildingAllowance
        ? `Maximum building allowance: ${buildingAllowance} m2`
        : "Maximum building allowance: UNKNOWN",
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

    const transaction = normalizeTransaction(body as JsonRecord);
    const transactionInstructions = `Analyse only the supplied transaction context. Do not assume fixed discounts, premiums, costs, legal status, tax treatment, or market trends. Asking price is comparison context, not valuation evidence.`;
    const typeInstructions = `Use only supplied property features and provider observations. Missing fields remain null. Do not claim live market search, exact comparable sales, legal-document review, or current-year benchmarks.`;
    const promptPricePerSqm = coerceFiniteNumber(pricePerSqm) ?? Math.round(numericPrice / numericSqm);
    const isRentalValuation = transaction === "rent";
    const newOrRecentConstruction = isNewOrRecentConstruction(body as JsonRecord);
    const listedPriceLine = isRentalValuation
      ? `Listed monthly rent: EUR ${numericPrice.toLocaleString()} (EUR ${roundNumber(promptPricePerSqm, 2)}/sqm/month)`
      : `Listed price: EUR ${numericPrice.toLocaleString()} (EUR ${Math.round(promptPricePerSqm)}/sqm)`;
    const comparableRequirement = newOrRecentConstruction
      ? `COMPARABLE-ASSET REQUIREMENT:
This listing is new-build or recent construction. Compare it with similar new or recent assets first. Match age band, construction quality, energy class, floor, elevator, parking, amenities, and micro-location. Older stock may only provide lower-bound context after an explicit age, condition, and energy adjustment.`
      : `COMPARABLE-ASSET REQUIREMENT:
Use similar assets first by transaction type, property type, micro-location, size band, construction age, floor, condition, energy class, and amenities.`;
    const rentalOverride = isRentalValuation
      ? `RENTAL VALUATION OVERRIDE:
- Treat the listing price as monthly rent, not sale value.
- estimatedValue, rangeLow, rangeHigh, and executionValue must be monthly rent in EUR.
- pricePerSqmEstimate must be EUR/sqm/month.
- propertyPredictedLeasePrice is an unknown-period provider observation. Do not use it as monthly rent or as a monthly valuation anchor.
- A monthly AI estimate is allowed only when it is explicit model analysis supported by supplied attributes or provider evidence with a known unit.
- Do not output sale value, purchase value, transfer execution value, buyer transaction costs, or auction bid value.
- If independent lease evidence is unavailable, the asking rent is only a low-confidence reference, not a market appraisal.`
      : "";

    const prompt = `You are a property valuation analyst. Produce cautious analysis from only the supplied listing attributes and provider observations.

Do not invent current-year benchmarks, named comparable transactions, financial assumptions, legal-document findings, fixed discounts or premiums, tax assumptions, or required trend factors. Missing fields remain null. Asking price is context and never valuation evidence.

=== PROPERTY TO VALUE ===
KEY PROPERTY SPECIFICS (use these in your methodology): ${keySpecifics}

Title: ${title || "Property"}
Location: ${address ? `${address}, ` : ""}${city}${region ? `, ${region}` : ""}, Greece
Type: ${propertyType || "apartment"} | Transaction: ${transaction}
Size: ${sqm} sqm
${listedPriceLine}
Observed features: ${observedFeatures}
Legal/planning signals: ${legalSignals}
${listingDesc}

${buildValuationEvidenceSection(osValuationData, newBuildAiOnly)}

=== TRANSACTION CONTEXT ===
${transactionInstructions}

${rentalOverride}

${comparableRequirement}

=== METHODOLOGY TO APPLY ===
${typeInstructions}

=== OUTPUT REQUIREMENTS ===
CRITICAL RULES:
1. DO NOT echo the listed price as your estimate. Use only supplied provider evidence; do not invent benchmarks, comparable sales, or addresses.
2. Output a RANGE, not false precision. Range width must reflect data quality.
3. Apply TYPE-SPECIFIC logic — one formula for all types is wrong.
4. Missing legal data = UNKNOWN; never assume clean title or invent document status.
5. Do not produce numeric legal, planning, tax, readiness, execution, objective-value, or yield fields without explicit mapped evidence; use null.
6. ${isRentalValuation ? "For rentals, any explicit model estimate must be monthly rent in EUR." : "Do not synthesize execution value from the estimate."}
7. Do not assert a market trend unless it is present in supplied evidence.
8. Commercial behavior is DISTINCT from residential.
9. All figures must be supportable from supplied attributes and provider observations; do not hallucinate local comps or unsourced premiums.
10. Explicitly assess liquidity, buyer depth, area-specific micro-market quality, street/noise/view factors, renovation or fit-out risk, and qualitative desirability.
11. For rentals, every value estimate is monthly rent; never return sale or purchase value.
12. For new or recent construction, use similar new or recent assets before older stock.

Return ONLY valid JSON, no markdown, no explanation outside the JSON:

{
  "estimatedValue": number | null (${isRentalValuation ? "monthly market rent in EUR" : "market value in EUR; for auctions this is not a clean-market estimate"}),
  "rangeLow": number | null (${isRentalValuation ? "supported lower monthly-rent bound" : "supported lower market-value bound"}),
  "rangeHigh": number | null (${isRentalValuation ? "supported upper monthly-rent bound" : "supported upper market-value bound"}),
  "executionValue": null,
  "pricePerSqmEstimate": number | null (${isRentalValuation ? "EUR/sqm/month" : "EUR/sqm"}; null without supported numeric evidence),
  "confidence": number | null (0–100; null without explicit model support),
  "confidenceLabel": "High" | "Medium" | "Low" | null,
  "liquidityScore": number | null (0–100; null without explicit model support),
  "marketComparison": "below_market" | "at_market" | "above_market" | null,
  "marketComparisonPct": number | null,
  "pricingPosition": "underpriced" | "fair" | "overpriced" | null,
  "methodUsed": "string",
  "valuationMode": "MODE_1_LISTING_ONLY" | "MODE_2_PUBLIC_ENRICHED",
  "summary": "string or null (cite only supplied provider observations and property-specific drivers)",
  "keyFactors": [
    { "factor": "string", "impact": "positive" | "negative" | "neutral", "note": "string (max 100 chars)" }
  ],
  "legalCleanliness": null,
  "planningCertainty": null,
  "taxFriction": null,
  "transferReadiness": null,
  "legalSummary": "string or null (key supplied legal/planning signals and unknowns; no document-verification claims)",
  "taxSummary": "string or null (only supplied tax/friction evidence; no assumed rates)",
  "objectiveValueProxy": null,
  "renovationPotential": "string or null",
  "rentalYieldEstimate": null,
  "highestBestUseHint": "string or null",
  "redFlags": ["string"],
  "auctionAdjustedValue": number | null (clean market value before auction discounts — only if auction, else null),
  "listingQualityScore": null
}

Rules:
- listingQualityScore remains null; do not convert input completeness into valuation evidence.
- legalCleanliness remains null unless the provider output contains independently supported numeric evidence; unknown fields are not confirmed defects.
- redFlags include only confirmed or strongly indicated problems. Missing cadastre/buildability/city-plan fields on standard apartments are data gaps, not red flags.
- marketComparisonPct uses the clean market value anchor. For auctions, compare listed price with auctionAdjustedValue, not executionValue or the auction-adjusted bid value.
- pricingPosition is "underpriced" only when the listed price is meaningfully below clean market value; "overpriced" only when listed price is above it.
- keyFactors: include only factors supported by supplied attributes or provider observations
- confidenceLabel: High = 75+, Medium = 50–74, Low = <50; null when confidence is null
- legalCleanliness: do not fabricate certainty
- ranges and liquidity scores must be null unless supported by supplied evidence or explicit model analysis; never use property-type defaults`;

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
      const fallback = buildV2Valuation(body as JsonRecord, osValuationData, null, osValuationStatus);
      return fallback ? new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }) : valuationUnavailable(corsHeaders);
    }

    if (!response.ok) {
      const txt = await response.text();
      log.error("AI gateway error", { status: response.status, body: txt.slice(0, 500) });
      const fallback = buildV2Valuation(body as JsonRecord, osValuationData, null, osValuationStatus);
      return fallback ? new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }) : valuationUnavailable(corsHeaders);
    }

    let raw = "";
    try {
      raw = readOpenAITextContent(await response.json());
    } catch (parseEnvelopeError) {
      log.warn("property-valuation: AI returned malformed envelope", {
        err: parseEnvelopeError instanceof Error ? parseEnvelopeError.message : String(parseEnvelopeError),
        city,
      });
    }

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
      result = null;
    }

    result = buildV2Valuation(body as JsonRecord, osValuationData, result, osValuationStatus);


    return result ? new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }) : valuationUnavailable(corsHeaders);
  } catch (err) {
    if (err instanceof SchemaValidationError) {
      return errorResponse(err.message, 400, corsHeaders, {
        code: err.code,
        issues: err.issues,
      });
    }
    log.error("valuation error", { err: err instanceof Error ? err.message : String(err) });
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
