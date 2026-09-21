import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import {
  hasAIProviderCredentials,
  openAIChatCompletion,
  readOpenAITextContent,
} from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { buildVettedAnswerRules } from "../_shared/aiSafety.ts";
import { errorResponse } from "../_shared/response.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("neighbourhood-report");

const BUCKET = "neighbourhood-report";
const neighbourhoodLimiter = makeRateLimiter({
  bucket: BUCKET,
  maxRequests: 15,
  windowMs: 60_000,
  failClosed: true,
});
const OS_MARKET_TIMEOUT_MS = 25_000;
const VETTED_NEIGHBOURHOOD_RULES = buildVettedAnswerRules({
  scope: "neighbourhood intelligence reports",
  timeSensitiveTopics: [
    "development projects",
    "transport changes",
    "safety trends",
    "price-per-sqm trends",
  ],
});

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

const optionalBoundedText = (label: string, maxLength: number) =>
  z.preprocess(
    (value) => value === null || value === undefined ? undefined : value,
    z.string().trim().max(maxLength, `Invalid ${label}`).optional(),
  );

const optionalCoordinate = (label: string, min: number, max: number) =>
  z.preprocess(
    (value) =>
      value === null || value === undefined || value === "" ? undefined : value,
    z.union([
      z.number(),
      z.string().trim().min(1, `Invalid ${label}`),
    ])
      .transform((value) => typeof value === "number" ? value : Number(value))
      .pipe(
        z.number(`Invalid ${label}`)
          .finite(`Invalid ${label}`)
          .min(min, `Invalid ${label}`)
          .max(max, `Invalid ${label}`),
      )
      .optional(),
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

const optionalListingId = z.preprocess(
  (value) =>
    value === null || value === undefined || value === "" ? undefined : value,
  z.string().uuid("Invalid listing id").optional(),
);

const neighbourhoodReportRequestSchema = z.object({
  city: z.string("city is required")
    .trim()
    .min(1, "city is required")
    .max(120, "Invalid neighbourhood city"),
  address: optionalBoundedText("neighbourhood address", 240),
  region: optionalBoundedText("neighbourhood region", 120),
  municipality: optionalBoundedText("neighbourhood municipality", 120),
  propertyType: optionalPropertyType,
  lat: optionalCoordinate("neighbourhood latitude", -90, 90),
  lng: optionalCoordinate("neighbourhood longitude", -180, 180),
  listingId: optionalListingId,
  responseVersion: z.literal(2).optional(),
}).strict().superRefine((body, ctx) => {
  if ((body.lat === undefined) !== (body.lng === undefined)) {
    const missing = body.lat === undefined ? "lat" : "lng";
    ctx.addIssue({
      code: "custom",
      path: [missing],
      message: "Latitude and longitude must be provided together",
    });
  }
});

type JsonRecord = Record<string, unknown>;

type MunicipalityContext = {
  status: "missing_config" | "not_requested" | "no_match" | "ok" | "error";
  promptContext: string;
  municipalityId?: number;
  municipalityName?: string;
  prefectureName?: string;
  detail?: string;
  marketReportText?: string;
  privateSalesAverage?: number;
  publicListingsAverage?: number;
  blendedSaleAverage?: number;
  sourceDivergencePct?: number;
  largeDivergence?: boolean;
};

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

const optionalString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

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
      normalized = compact.replace(new RegExp(`\\${thousands}`, "g"), "")
        .replace(decimal, ".");
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

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clampScore = (
  value: unknown,
  min: number,
  max: number,
): number | null => {
  const numeric = coerceFiniteNumber(value);
  return numeric == null ? null : Math.round(clampNumber(numeric, min, max));
};

const reportText = z.string().trim().min(1).max(2000);
const nullableSection = <T>(schema: z.ZodType<T>, value: unknown): T | null => {
  const result = schema.safeParse(value);
  return result.success ? result.data : null;
};

// Model output is never evidence. Validate each section independently so a
// malformed section cannot break the rest of a partial report.
const normalizeNeighbourhoodReport = (
  report: JsonRecord,
  city: string,
  address?: string,
): JsonRecord => {
  const noise = nullableSection(
    z.object({ score: z.unknown(), label: reportText, notes: reportText }),
    report.noiseLevel,
  );
  const safety = nullableSection(
    z.object({
      score: z.unknown(),
      label: reportText,
      trend: reportText,
      notes: reportText,
    }),
    report.safetyScore,
  );
  const noiseScore = clampScore(noise?.score, 1, 10);
  const safetyScore = clampScore(safety?.score, 1, 100);
  return {
    ...fallbackReport(city, address),
    areaName: optionalString(report.areaName) ?? address ?? city,
    walkabilityScore: clampScore(report.walkabilityScore, 0, 100),
    noiseLevel: noise && noiseScore != null
      ? { ...noise, score: noiseScore }
      : null,
    safetyScore: safety && safetyScore != null
      ? { ...safety, score: safetyScore }
      : null,
    demographics: nullableSection(
      z.object({
        primaryResidents: reportText,
        avgAge: z.number().finite().min(0).max(120).nullable(),
        tourismImpact: reportText,
      }),
      report.demographics,
    ),
    investmentOutlook: nullableSection(
      z.object({ rating: reportText, summary: reportText }),
      report.investmentOutlook,
    ),
    areaHighlights:
      nullableSection(z.array(reportText).max(4), report.areaHighlights) ?? [],
    generatedBy: "openai",
  };
};

const normalizeOsCategory = (value: unknown): string => {
  const key =
    optionalString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
  return OS_PROPERTY_CATEGORY[key] ??
    OS_PROPERTY_CATEGORY[key.replace(/_property$/, "")] ?? "RESIDENCE";
};

const transliterateGreek = (value: string): string => {
  const map: Record<string, string> = {
    α: "a",
    β: "v",
    γ: "g",
    δ: "d",
    ε: "e",
    ζ: "z",
    η: "i",
    θ: "th",
    ι: "i",
    κ: "k",
    λ: "l",
    μ: "m",
    ν: "n",
    ξ: "x",
    ο: "o",
    π: "p",
    ρ: "r",
    σ: "s",
    ς: "s",
    τ: "t",
    υ: "y",
    φ: "f",
    χ: "ch",
    ψ: "ps",
    ω: "o",
  };
  return Array.from(value).map((char) => map[char] ?? char).join("");
};

const normalizeSearchText = (value: unknown): string => {
  const base = optionalString(value) ?? "";
  const noAccents = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noAccents
    .toLowerCase()
    .replace(
      /δημος|municipality of|municipality|prefecture|regional unit|perifereia/gi,
      " ",
    )
    .replace(/[^a-z0-9\u0370-\u03ff]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
};

const searchVariants = (value: unknown): string[] => {
  const normalized = normalizeSearchText(value);
  const transliterated = normalizeSearchText(transliterateGreek(normalized));
  const genitiveAdjusted = transliterated
    .split(" ")
    .map((token) => token.replace(/ioy$/i, "ios").replace(/oy$/i, "os"))
    .join(" ");
  return Array.from(
    new Set([normalized, transliterated, genitiveAdjusted].filter(Boolean)),
  );
};

const tokenSimilarity = (left: string, right: string): number => {
  const leftTokens = left.split(" ").filter((token) => token.length >= 3);
  const rightTokens = right.split(" ").filter((token) => token.length >= 3);
  let score = 0;
  for (const leftToken of leftTokens) {
    for (const rightToken of rightTokens) {
      if (leftToken === rightToken) score += 12;
      else if (
        leftToken.startsWith(rightToken.slice(0, 5)) ||
        rightToken.startsWith(leftToken.slice(0, 5))
      ) score += 7;
    }
  }
  return score;
};

const readJsonSafely = async (
  response: Response,
): Promise<JsonRecord | null> => {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed as JsonRecord
      : null;
  } catch (_error) {
    return null;
  }
};

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
  const token = candidates.find((candidate) =>
    typeof candidate === "string" && candidate.trim()
  );
  return typeof token === "string" ? token : null;
};

const fetchOsAuthToken = async (
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> => {
  const response = await fetchWithTimeout(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  }, OS_MARKET_TIMEOUT_MS);
  const payload = await readJsonSafely(response);
  const token = extractOsToken(payload);
  if (!response.ok || !token) {
    throw new Error(`OS auth failed with status ${response.status}`);
  }
  return token;
};

const stripHtmlForPrompt = (html: string): string =>
  html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&euro;|&#8364;/gi, "EUR")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 2800);

const getMunicipalityRows = async (
  baseUrl: string,
  token: string,
): Promise<JsonRecord[]> => {
  const response = await fetchWithTimeout(`${baseUrl}/api/v1/municipalities`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }, OS_MARKET_TIMEOUT_MS);
  const payload = await readJsonSafely(response);
  const data = payload?.data;
  if (!response.ok || !Array.isArray(data)) {
    throw new Error(`OS municipalities failed with status ${response.status}`);
  }
  return data.filter((row): row is JsonRecord =>
    row && typeof row === "object" && !Array.isArray(row)
  );
};

const findMunicipality = (
  rows: JsonRecord[],
  candidates: unknown[],
): JsonRecord | null => {
  const candidateVariants = candidates.flatMap(searchVariants);
  if (candidateVariants.length === 0) return null;

  let best: { row: JsonRecord; score: number } | null = null;
  for (const row of rows) {
    const nameVariants = searchVariants(row.municipalityName);
    const prefectureVariants = searchVariants(row.prefectureName);
    let score = 0;
    for (const candidate of candidateVariants) {
      for (const name of nameVariants) {
        if (candidate === name) score = Math.max(score, 100);
        else if (candidate.includes(name) || name.includes(candidate)) {
          score = Math.max(score, 80);
        } else score = Math.max(score, tokenSimilarity(candidate, name));
      }
      for (const prefecture of prefectureVariants) {
        if (candidate.includes(prefecture) || prefecture.includes(candidate)) {
          score += 8;
        }
      }
    }
    if (!best || score > best.score) best = { row, score };
  }

  return best && best.score >= 20 ? best.row : null;
};

const fetchOsMunicipalityContext = async (input: {
  city: string;
  address?: unknown;
  region?: unknown;
  municipality?: unknown;
  propertyType?: unknown;
}): Promise<MunicipalityContext> => {
  const baseUrl =
    (Deno.env.get("MAIPROP_OS_API_URL") ?? Deno.env.get("MAIPROP_OS_URL"))
      ?.replace(/\/+$/, "");
  const email = Deno.env.get("MAIPROP_OS_EMAIL");
  const password = Deno.env.get("MAIPROP_OS_PASSWORD");
  if (!baseUrl || !email || !password) {
    return {
      status: "missing_config",
      promptContext:
        "mAI Prop OS municipality market data unavailable: missing OS configuration.",
    };
  }

  const token = await fetchOsAuthToken(baseUrl, email, password);
  const rows = await getMunicipalityRows(baseUrl, token);
  const match = findMunicipality(rows, [
    input.municipality,
    input.address,
    input.city,
    input.region,
  ]);
  if (!match) {
    return {
      status: "no_match",
      promptContext:
        "mAI Prop OS municipality market data unavailable: no matching municipality.",
    };
  }

  const municipalityId = coerceFiniteNumber(match.municipalityId);
  const municipalityName = optionalString(match.municipalityName);
  const prefectureName = optionalString(match.prefectureName);
  if (municipalityId == null || !municipalityName) {
    return {
      status: "no_match",
      promptContext:
        "mAI Prop OS municipality market data unavailable: matched municipality has no usable id.",
    };
  }

  const query = new URLSearchParams({ lang: "en" });
  query.append("propertyCategory", normalizeOsCategory(input.propertyType));
  const response = await fetchWithTimeout(
    `${baseUrl}/api/v1/reports/valuation/market/${municipalityId}?${query.toString()}`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/html,application/json",
      },
    },
    OS_MARKET_TIMEOUT_MS,
  );
  const text = await response.text();
  if (!response.ok) {
    throw new Error(
      `OS municipality market report failed with status ${response.status}`,
    );
  }
  const marketReportText = stripHtmlForPrompt(text);
  const diagnostics = osMarketDiagnostics(marketReportText);

  return {
    status: "ok",
    municipalityId,
    municipalityName,
    prefectureName,
    marketReportText,
    ...diagnostics,
    promptContext: JSON.stringify(
      {
        source: "mAI Prop OS market valuation report",
        municipalityId,
        municipalityName,
        prefectureName,
        propertyCategory: normalizeOsCategory(input.propertyType),
        crossCheck: {
          ...diagnostics,
          method:
            "Use private-sales and public-listings data together. Treat private sales as achieved transaction evidence, public listings as asking-market pressure, and use blendedSaleAverage as the canonical displayed benchmark.",
          warning: diagnostics.largeDivergence
            ? "Large divergence detected between achieved-sales and asking-listing sources; explain uncertainty and do not replace blendedSaleAverage with either raw source."
            : "No large source divergence detected.",
        },
        reportText: marketReportText,
      },
      null,
      2,
    ),
  };
};

const fallbackReport = (city: string, address?: string) => ({
  responseVersion: 2,
  areaName: address?.trim() || city.trim(),
  walkabilityScore: null,
  pricePerSqmTrend: {
    current: null,
    oneYearAgo: null,
    threeYearsAgo: null,
    fiveYearsAgo: null,
    changeYoY: null,
    change5Y: null,
  },
  noiseLevel: null,
  safetyScore: null,
  developmentProjects: [],
  demographics: null,
  investmentOutlook: null,
  areaHighlights: [],
  generatedBy: "fallback",
});

const extractOsAveragePrice = (
  marketReportText: string | undefined,
  section: string,
): number | null => {
  if (!marketReportText) return null;
  const pattern = new RegExp(
    `${section}\\s*[-:]?\\s*average price\\s+([\\d.,]+)\\s*(?:EUR|€)\\s*\\/\\s*(?:sq\\.m\\.|m²)`,
    "i",
  );
  const match = marketReportText.match(pattern);
  const numeric = coerceFiniteNumber(match?.[1]);
  return numeric == null || numeric <= 0 ? null : Math.round(numeric);
};

const blendedOsSaleAverage = (
  marketReportText: string | undefined,
): number | null => {
  const privateSaleAverage = extractOsAveragePrice(
    marketReportText,
    "Private Sales Municipality",
  );
  const publicListingAverage = extractOsAveragePrice(
    marketReportText,
    "Public Listings Municipality",
  );
  if (privateSaleAverage != null && publicListingAverage != null) {
    return Math.round(privateSaleAverage * 0.7 + publicListingAverage * 0.3);
  }
  return privateSaleAverage ?? publicListingAverage;
};

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;
const percentChange = (
  current: number | null,
  previous: number | null,
): number | null =>
  current != null && previous != null && previous > 0
    ? oneDecimal(((current - previous) / previous) * 100)
    : null;
const osSourceDivergencePct = (
  privateSalesAverage: number | null,
  publicListingsAverage: number | null,
  blendedSaleAverage: number | null,
): number | null =>
  privateSalesAverage != null && publicListingsAverage != null &&
    blendedSaleAverage != null && blendedSaleAverage > 0
    ? oneDecimal(
      (Math.abs(publicListingsAverage - privateSalesAverage) /
        blendedSaleAverage) * 100,
    )
    : null;

const osMarketDiagnostics = (marketReportText: string | undefined) => {
  const privateSalesAverage = extractOsAveragePrice(
    marketReportText,
    "Private Sales Municipality",
  );
  const publicListingsAverage = extractOsAveragePrice(
    marketReportText,
    "Public Listings Municipality",
  );
  const blendedSaleAverage = blendedOsSaleAverage(marketReportText);
  const sourceDivergencePct = osSourceDivergencePct(
    privateSalesAverage,
    publicListingsAverage,
    blendedSaleAverage,
  );
  return {
    privateSalesAverage: privateSalesAverage ?? undefined,
    publicListingsAverage: publicListingsAverage ?? undefined,
    blendedSaleAverage: blendedSaleAverage ?? undefined,
    sourceDivergencePct: sourceDivergencePct ?? undefined,
    largeDivergence: sourceDivergencePct != null
      ? sourceDivergencePct > 35
      : undefined,
  };
};

const applyOsMunicipalityContext = (
  report: JsonRecord,
  context: MunicipalityContext,
  source: "openai" | "fallback",
): JsonRecord => {
  const enriched = { ...report };
  enriched.generatedBy = context.status === "ok"
    ? `${source}_maiprop_os`
    : source;
  enriched.osMunicipalityStatus = context.status;
  enriched.osMunicipalityName = context.municipalityName;
  enriched.osPrefectureName = context.prefectureName;
  const details = [
    context.blendedSaleAverage != null
      ? `OS blended benchmark: ${context.blendedSaleAverage} EUR/m²`
      : null,
    context.privateSalesAverage != null
      ? `private sales: ${context.privateSalesAverage}`
      : null,
    context.publicListingsAverage != null
      ? `public listings: ${context.publicListingsAverage}`
      : null,
    context.sourceDivergencePct != null
      ? `source divergence: ${context.sourceDivergencePct}%`
      : null,
  ].filter(Boolean);
  enriched.osMunicipalityDetail = details.join("; ");
  const current = context.status === "ok"
    ? context.blendedSaleAverage ?? null
    : null;
  const year = new Date().getFullYear();
  const historical = (yearsAgo: number) =>
    context.status === "ok"
      ? extractOsAveragePrice(
        context.marketReportText,
        `Private Sales Municipality ${year - yearsAgo}`,
      )
      : null;
  // Historical observations must be separately dated transaction evidence.
  // Current asking-price pressure cannot reconstruct earlier transaction prices.
  const oneYearAgo = historical(1),
    threeYearsAgo = historical(3),
    fiveYearsAgo = historical(5);
  enriched.pricePerSqmTrend = {
    current,
    oneYearAgo,
    threeYearsAgo,
    fiveYearsAgo,
    // Compare achieved sales with achieved sales, never the blended asking benchmark.
    changeYoY: percentChange(context.privateSalesAverage ?? null, oneYearAgo),
    change5Y: percentChange(context.privateSalesAverage ?? null, fiveYearsAgo),
  };
  const observation = (value: number | null, observationYear?: number) =>
    value == null ? null : {
      source: "maiprop_os",
      scope: "municipality",
      municipality: context.municipalityName,
      ...(observationYear
        ? { year: observationYear, method: "private_sales_average" }
        : {
          method: context.privateSalesAverage != null &&
              context.publicListingsAverage != null
            ? "70% private sales + 30% public asking listings"
            : context.privateSalesAverage != null
            ? "private_sales_average"
            : "public_asking_average",
          privateSalesAverage: context.privateSalesAverage,
          publicListingsAverage: context.publicListingsAverage,
        }),
    };
  enriched.provenance = {
    pricePerSqmTrend: {
      current: observation(current),
      oneYearAgo: observation(oneYearAgo, year - 1),
      threeYearsAgo: observation(threeYearsAgo, year - 3),
      fiveYearsAgo: observation(fiveYearsAgo, year - 5),
      changeYoY: oneYearAgo != null && context.privateSalesAverage != null
        ? { source: "derived", method: "private_sales_comparison" }
        : null,
      change5Y: fiveYearsAgo != null && context.privateSalesAverage != null
        ? { source: "derived", method: "private_sales_comparison" }
        : null,
    },
    analysis: source === "openai"
      ? { source: "ai_estimate", independentlyVerified: false }
      : null,
    developmentProjects: null,
  };
  if (source === "fallback" && current != null) {
    enriched.areaHighlights = [
      `mAI Prop OS municipality data available for ${context.municipalityName}`,
    ];
  }
  return enriched;
};

const fallbackReportWithOsContext = (
  city: string,
  address: string | undefined,
  _region: string | undefined,
  context: MunicipalityContext,
): JsonRecord =>
  applyOsMunicipalityContext(
    fallbackReport(city, address),
    context,
    "fallback",
  );

const reportResponse = (
  report: JsonRecord,
  responseVersion: number | undefined,
  corsHeaders: Record<string, string>,
) => {
  // The deployed consumer formats every price unconditionally and cannot show
  // per-section estimate provenance. Negotiate v2 before returning partial data.
  if (responseVersion !== 2) {
    return errorResponse(
      "Neighbourhood report data is unavailable. Please try again later.",
      503,
      corsHeaders,
      { code: "neighbourhood_data_unavailable" },
    );
  }
  return new Response(JSON.stringify(report), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
};

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, provider JSON parsing, fallback, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await neighbourhoodLimiter.isLimited(ip)) {
    return tooManyRequestsResponse(corsHeaders);
  }

  // Signed-in access gate is handled by enforceAiQuota; free vs Pro caps live in the DB.
  try {
    const {
      city,
      address,
      region,
      municipality,
      propertyType,
      lat,
      lng,
      responseVersion,
    } = await parseJsonBody(req, neighbourhoodReportRequestSchema);

    const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
    if (quota.errorResponse) return quota.errorResponse;

    const locationStr = [address, city, region, "Greece"].filter(Boolean).join(
      ", ",
    );
    const coordStr = lat != null && lng != null
      ? ` (coords: ${lat}, ${lng})`
      : "";
    let osMunicipalityContext: MunicipalityContext = {
      status: "not_requested",
      promptContext: "mAI Prop OS municipality market data was not requested.",
    };

    try {
      osMunicipalityContext = await fetchOsMunicipalityContext({
        city: String(city),
        address,
        region,
        municipality,
        propertyType,
      });
    } catch (osError) {
      osMunicipalityContext = {
        status: "error",
        promptContext:
          "mAI Prop OS municipality market data unavailable due to an upstream error.",
        detail: osError instanceof Error
          ? osError.message.slice(0, 120)
          : String(osError).slice(0, 120),
      };
      log.warn(
        "neighbourhood-report: OS municipality context unavailable; continuing with OpenAI",
        {
          city,
          municipality,
          err: osError instanceof Error ? osError.message : String(osError),
        },
      );
    }

    if (!hasAIProviderCredentials()) {
      log.warn(
        "neighbourhood-report: AI provider key missing; using fallback report",
        { city },
      );
      const fallback = fallbackReportWithOsContext(
        String(city),
        address,
        region,
        osMunicipalityContext,
      );
      await recordAiCall(quota.userId, BUCKET);
      return reportResponse(fallback, responseVersion, corsHeaders);
    }

    const prompt =
      `You are a Greek real estate market analyst. Generate a cautious neighbourhood intelligence report for a property at: ${locationStr}${coordStr}.

${VETTED_NEIGHBOURHOOD_RULES}

=== MAIPROP OS MUNICIPALITY MARKET DATA ===
${osMunicipalityContext.promptContext}

Use mAI Prop OS municipality market data as primary local quantitative evidence when status is ok. If unavailable, clearly keep the report cautious and do not invent municipality-level figures.

Return ONLY valid JSON, no markdown, no explanation. The JSON must be parseable. Return null for unsupported sections and numeric observations. Current market evidence does not establish historical prices. All non-market analysis is an unverified AI estimate:
{
  "areaName": "string (specific neighbourhood name, e.g. 'Kolonaki' or 'Nea Smyrni')",
  "walkabilityScore": number (0-100; 90+ = walker's paradise, 70-89 = very walkable, 50-69 = somewhat walkable, below 50 = car-dependent),
  "pricePerSqmTrend": {
    "current": number (EUR/m² today),
    "oneYearAgo": number,
    "threeYearsAgo": number,
    "fiveYearsAgo": number,
    "changeYoY": number (% change year-on-year, e.g. 7.2),
    "change5Y": number (% change over 5 years)
  },
  "noiseLevel": {
    "score": number (1-10, 1=silent, 10=very loud),
    "label": "Very Quiet" | "Quiet" | "Moderate" | "Busy" | "Very Busy",
    "notes": "string (brief description, e.g. 'Residential street, low traffic')"
  },
  "safetyScore": {
    "score": number (1-100, higher=safer),
    "label": "Excellent" | "Good" | "Average" | "Below Average",
    "trend": "Improving" | "Stable" | "Declining",
    "notes": "string"
  },
  "developmentProjects": [
    {
      "name": "string (project name quoted in the supplied source)",
      "type": "infrastructure" | "commercial" | "residential" | "transport" | "public",
      "status": "planned" | "under_construction" | "recently_completed",
      "impact": "positive" | "negative" | "neutral",
      "estimatedCompletion": "string (e.g. '2026' or 'Q3 2025')",
      "distanceKm": number
    }
  ],
  "demographics": {
    "primaryResidents": "string (e.g. 'Young professionals and families')",
    "avgAge": number,
    "tourismImpact": "Low" | "Moderate" | "High"
  },
  "investmentOutlook": {
    "rating": "Excellent" | "Good" | "Fair" | "Poor",
    "summary": "string (2 sentences)"
  },
  "areaHighlights": ["string"]
}

Rules:
- Base estimates on stable general knowledge of ${city}, Greece neighbourhoods and the supplied address/coordinates. Do not present street-level details as verified unless supplied.
- walkabilityScore: reflect proximity to shops, public transport, restaurants, parks
- developmentProjects: include only known or context-supported projects; if not confident, return an empty array
- areaHighlights: 3-4 short cautious bullet points; do not invent exact amenities or distances
- Unsupported price observations and history must be null. Never reconstruct history with percentages.
- developmentProjects: return [] unless supplied provider text explicitly verifies the project.
- The service currently omits development projects because the market feed has no structured project evidence contract.
- Only return the JSON object
- Do not include comments, trailing commas, prose, markdown, or incomplete arrays`;

    const response = await openAIChatCompletion({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.5,
      max_tokens: 4096,
    });

    if (!response.ok) {
      const status = response.status;
      const text = await response.text();
      log.warn(
        "neighbourhood-report: AI provider unavailable; using fallback report",
        {
          city,
          status,
          body: text.slice(0, 500),
        },
      );
      const fallback = fallbackReportWithOsContext(
        String(city),
        address,
        region,
        osMunicipalityContext,
      );
      await recordAiCall(quota.userId, BUCKET);
      return reportResponse(fallback, responseVersion, corsHeaders);
    }

    const aiData = await readJsonSafely(response);
    const raw = readOpenAITextContent(aiData ?? {})
      .replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    // Extract only the outermost JSON object
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1
      ? raw.slice(start, end + 1)
      : raw;

    // The shape of the AI's parsed JSON is unknown until we run the
    // downstream guardrails on it; intentionally typed broadly here and
    // narrowed at every read site.
    let parsed: unknown;
    let usedFallback = false;
    try {
      parsed = JSON.parse(jsonStr);
    } catch {
      const repaired = jsonStr
        .replace(/,\s*}/g, "}")
        .replace(/,\s*]/g, "]")
        .replace(/\)\s*}/g, "}")
        .replace(/\)\s*,/g, ",")
        // eslint-disable-next-line no-control-regex
        .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
      try {
        parsed = JSON.parse(repaired);
      } catch {
        log.warn(
          "neighbourhood-report: AI returned invalid JSON; using fallback report",
          {
            city,
            rawLength: jsonStr.length,
            sample: jsonStr.slice(0, 240),
          },
        );
        usedFallback = true;
        parsed = fallbackReportWithOsContext(
          String(city),
          address,
          region,
          osMunicipalityContext,
        );
      }
    }

    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      parsed = fallbackReportWithOsContext(
        String(city),
        address,
        region,
        osMunicipalityContext,
      );
    } else if (!usedFallback) {
      parsed = applyOsMunicipalityContext(
        normalizeNeighbourhoodReport(parsed as JsonRecord, city, address),
        osMunicipalityContext,
        "openai",
      );
    }

    // No provider in this endpoint supplies measured listing-level scores.
    // Model estimates and unavailable defaults must not enter listing filters.
    await recordAiCall(quota.userId, BUCKET);
    return reportResponse(parsed as JsonRecord, responseVersion, corsHeaders);
  } catch (e) {
    if (e instanceof SchemaValidationError) {
      return errorResponse(e.message, 400, corsHeaders, {
        code: e.code,
        issues: e.issues,
      });
    }
    log.error("neighbourhood-report error", {
      err: e instanceof Error ? e.message : String(e),
    });
    return new Response(
      JSON.stringify({
        error: e instanceof Error ? e.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
