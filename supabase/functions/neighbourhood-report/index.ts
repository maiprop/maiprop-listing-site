import { createClient } from "npm:@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { hasAIProviderCredentials, openAIChatCompletion, readOpenAITextContent } from "../_shared/openai.ts";
import { enforceAiQuota, recordAiCall } from "../_shared/aiUsage.ts";
import { createLogger } from "../_shared/logger.ts";
import { buildVettedAnswerRules } from "../_shared/aiSafety.ts";

const log = createLogger("neighbourhood-report");

const BUCKET = "neighbourhood-report";
const neighbourhoodLimiter = makeRateLimiter({ bucket: BUCKET, maxRequests: 15, windowMs: 60_000, failClosed: true });
const OS_MARKET_TIMEOUT_MS = 25_000;
const VETTED_NEIGHBOURHOOD_RULES = buildVettedAnswerRules({
  scope: "neighbourhood intelligence reports",
  timeSensitiveTopics: ["development projects", "transport changes", "safety trends", "price-per-sqm trends"],
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

const clampNumber = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const clampScore = (value: unknown, min: number, max: number): number | null => {
  const numeric = coerceFiniteNumber(value);
  return numeric == null ? null : Math.round(clampNumber(numeric, min, max));
};

const normalizeNeighbourhoodReport = (report: JsonRecord): JsonRecord => {
  const normalized = { ...report };
  const walkabilityScore = clampScore(normalized.walkabilityScore, 0, 100);
  if (walkabilityScore != null) normalized.walkabilityScore = walkabilityScore;

  const noiseLevel = normalized.noiseLevel;
  if (noiseLevel && typeof noiseLevel === "object" && !Array.isArray(noiseLevel)) {
    const score = clampScore((noiseLevel as JsonRecord).score, 1, 10);
    if (score != null) normalized.noiseLevel = { ...(noiseLevel as JsonRecord), score };
  }

  const safetyScore = normalized.safetyScore;
  if (safetyScore && typeof safetyScore === "object" && !Array.isArray(safetyScore)) {
    const score = clampScore((safetyScore as JsonRecord).score, 1, 100);
    if (score != null) normalized.safetyScore = { ...(safetyScore as JsonRecord), score };
  }

  return normalized;
};

const normalizeOsCategory = (value: unknown): string => {
  const key = optionalString(value)?.toLowerCase().replace(/[^a-z0-9]+/g, "_") ?? "";
  return OS_PROPERTY_CATEGORY[key] ?? OS_PROPERTY_CATEGORY[key.replace(/_property$/, "")] ?? "RESIDENCE";
};

const transliterateGreek = (value: string): string => {
  const map: Record<string, string> = {
    α: "a", β: "v", γ: "g", δ: "d", ε: "e", ζ: "z", η: "i", θ: "th", ι: "i",
    κ: "k", λ: "l", μ: "m", ν: "n", ξ: "x", ο: "o", π: "p", ρ: "r", σ: "s",
    ς: "s", τ: "t", υ: "y", φ: "f", χ: "ch", ψ: "ps", ω: "o",
  };
  return Array.from(value).map((char) => map[char] ?? char).join("");
};

const normalizeSearchText = (value: unknown): string => {
  const base = optionalString(value) ?? "";
  const noAccents = base.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  return noAccents
    .toLowerCase()
    .replace(/δημος|municipality of|municipality|prefecture|regional unit|perifereia/gi, " ")
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
  return Array.from(new Set([normalized, transliterated, genitiveAdjusted].filter(Boolean)));
};

const tokenSimilarity = (left: string, right: string): number => {
  const leftTokens = left.split(" ").filter((token) => token.length >= 3);
  const rightTokens = right.split(" ").filter((token) => token.length >= 3);
  let score = 0;
  for (const leftToken of leftTokens) {
    for (const rightToken of rightTokens) {
      if (leftToken === rightToken) score += 12;
      else if (leftToken.startsWith(rightToken.slice(0, 5)) || rightToken.startsWith(leftToken.slice(0, 5))) score += 7;
    }
  }
  return score;
};

const readJsonSafely = async (response: Response): Promise<JsonRecord | null> => {
  try {
    const parsed = await response.json();
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as JsonRecord : null;
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
  const token = candidates.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof token === "string" ? token : null;
};

const fetchOsAuthToken = async (baseUrl: string, email: string, password: string): Promise<string> => {
  const response = await fetchWithTimeout(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ email, password }),
  }, OS_MARKET_TIMEOUT_MS);
  const payload = await readJsonSafely(response);
  const token = extractOsToken(payload);
  if (!response.ok || !token) throw new Error(`OS auth failed with status ${response.status}`);
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

const getMunicipalityRows = async (baseUrl: string, token: string): Promise<JsonRecord[]> => {
  const response = await fetchWithTimeout(`${baseUrl}/api/v1/municipalities`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  }, OS_MARKET_TIMEOUT_MS);
  const payload = await readJsonSafely(response);
  const data = payload?.data;
  if (!response.ok || !Array.isArray(data)) throw new Error(`OS municipalities failed with status ${response.status}`);
  return data.filter((row): row is JsonRecord => row && typeof row === "object" && !Array.isArray(row));
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
        else if (candidate.includes(name) || name.includes(candidate)) score = Math.max(score, 80);
        else score = Math.max(score, tokenSimilarity(candidate, name));
      }
      for (const prefecture of prefectureVariants) {
        if (candidate.includes(prefecture) || prefecture.includes(candidate)) score += 8;
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
  const baseUrl = (Deno.env.get("MAIPROP_OS_API_URL") ?? Deno.env.get("MAIPROP_OS_URL"))?.replace(/\/+$/, "");
  const email = Deno.env.get("MAIPROP_OS_EMAIL");
  const password = Deno.env.get("MAIPROP_OS_PASSWORD");
  if (!baseUrl || !email || !password) {
    return { status: "missing_config", promptContext: "mAI Prop OS municipality market data unavailable: missing OS configuration." };
  }

  const token = await fetchOsAuthToken(baseUrl, email, password);
  const rows = await getMunicipalityRows(baseUrl, token);
  const match = findMunicipality(rows, [input.municipality, input.address, input.city, input.region]);
  if (!match) {
    return { status: "no_match", promptContext: "mAI Prop OS municipality market data unavailable: no matching municipality." };
  }

  const municipalityId = coerceFiniteNumber(match.municipalityId);
  const municipalityName = optionalString(match.municipalityName);
  const prefectureName = optionalString(match.prefectureName);
  if (municipalityId == null || !municipalityName) {
    return { status: "no_match", promptContext: "mAI Prop OS municipality market data unavailable: matched municipality has no usable id." };
  }

  const query = new URLSearchParams({ lang: "en" });
  query.append("propertyCategory", normalizeOsCategory(input.propertyType));
  const response = await fetchWithTimeout(`${baseUrl}/api/v1/reports/valuation/market/${municipalityId}?${query.toString()}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: "text/html,application/json" },
  }, OS_MARKET_TIMEOUT_MS);
  const text = await response.text();
  if (!response.ok) throw new Error(`OS municipality market report failed with status ${response.status}`);
  const marketReportText = stripHtmlForPrompt(text);
  const diagnostics = osMarketDiagnostics(marketReportText);

  return {
    status: "ok",
    municipalityId,
    municipalityName,
    prefectureName,
    marketReportText,
    ...diagnostics,
    promptContext: JSON.stringify({
      source: "mAI Prop OS market valuation report",
      municipalityId,
      municipalityName,
      prefectureName,
      propertyCategory: normalizeOsCategory(input.propertyType),
      crossCheck: {
        ...diagnostics,
        method: "Use private-sales and public-listings data together. Treat private sales as achieved transaction evidence, public listings as asking-market pressure, and use blendedSaleAverage as the canonical displayed benchmark.",
        warning: diagnostics.largeDivergence
          ? "Large divergence detected between achieved-sales and asking-listing sources; explain uncertainty and do not replace blendedSaleAverage with either raw source."
          : "No large source divergence detected.",
      },
      reportText: marketReportText,
    }, null, 2),
  };
};

const fallbackReport = (city: string, address?: string, region?: string) => { // skipcq: JS-R1005 - Deterministic fallback report keeps section defaults together when AI output is unavailable.
  const areaName = address?.trim() || city.trim();
  const isAthens = city.toLowerCase().includes("athens") || city.toLowerCase().includes("athina");
  const current = isAthens ? 4200 : 2600;
  return {
    areaName,
    walkabilityScore: isAthens ? 82 : 68,
    pricePerSqmTrend: {
      current,
      oneYearAgo: Math.round(current * 0.94),
      threeYearsAgo: Math.round(current * 0.82),
      fiveYearsAgo: Math.round(current * 0.7),
      changeYoY: 6.4,
      change5Y: 42.9,
    },
    noiseLevel: {
      score: isAthens ? 6 : 4,
      label: isAthens ? "Moderate" : "Quiet",
      notes: "Generated from conservative city-level defaults after AI output could not be parsed.",
    },
    safetyScore: {
      score: isAthens ? 74 : 78,
      label: "Good",
      trend: "Stable",
      notes: "Use local due diligence for street-level validation.",
    },
    developmentProjects: [
      {
        name: `${city} public realm improvements`,
        type: "public",
        status: "planned",
        impact: "positive",
        estimatedCompletion: "2026",
        distanceKm: 1.5,
      },
    ],
    demographics: {
      primaryResidents: "Mixed local residents, professionals, and families",
      avgAge: 39,
      tourismImpact: isAthens || region?.toLowerCase().includes("attica") ? "Moderate" : "Low",
    },
    investmentOutlook: {
      rating: "Good",
      summary: "The area has resilient demand, but this report used fallback benchmarks because the AI provider returned malformed JSON. Validate street-level conditions before making an investment decision.",
    },
    areaHighlights: [
      "City-level market benchmark available",
      "Local amenities likely within normal urban range",
      "Independent inspection recommended",
    ],
    generatedBy: "fallback",
  };
};

const extractOsAveragePrice = (marketReportText: string | undefined, section: string): number | null => {
  if (!marketReportText) return null;
  const pattern = new RegExp(`${section}[\\s\\S]{0,160}?average price\\s+([\\d.,]+)`, "i");
  const match = marketReportText.match(pattern);
  const numeric = coerceFiniteNumber(match?.[1]);
  return numeric == null ? null : Math.round(numeric);
};

const blendedOsSaleAverage = (marketReportText: string | undefined): number | null => {
  const privateSaleAverage = extractOsAveragePrice(marketReportText, "Private Sales Municipality");
  const publicListingAverage = extractOsAveragePrice(marketReportText, "Public Listings Municipality");
  if (privateSaleAverage != null && publicListingAverage != null) {
    return Math.round(privateSaleAverage * 0.7 + publicListingAverage * 0.3);
  }
  return privateSaleAverage ?? publicListingAverage;
};

const oneDecimal = (value: number): number => Math.round(value * 10) / 10;
const percentChange = (current: number, previous: number, fallback: number): number =>
  previous > 0 ? oneDecimal(((current - previous) / previous) * 100) : fallback;
const osSourceDivergencePct = (privateSalesAverage: number | null, publicListingsAverage: number | null, blendedSaleAverage: number | null): number | null =>
  privateSalesAverage != null && publicListingsAverage != null && blendedSaleAverage != null && blendedSaleAverage > 0
    ? oneDecimal((Math.abs(publicListingsAverage - privateSalesAverage) / blendedSaleAverage) * 100)
    : null;

const osMarketDiagnostics = (marketReportText: string | undefined) => {
  const privateSalesAverage = extractOsAveragePrice(marketReportText, "Private Sales Municipality");
  const publicListingsAverage = extractOsAveragePrice(marketReportText, "Public Listings Municipality");
  const blendedSaleAverage = blendedOsSaleAverage(marketReportText);
  const sourceDivergencePct = osSourceDivergencePct(privateSalesAverage, publicListingsAverage, blendedSaleAverage);
  return {
    privateSalesAverage: privateSalesAverage ?? undefined,
    publicListingsAverage: publicListingsAverage ?? undefined,
    blendedSaleAverage: blendedSaleAverage ?? undefined,
    sourceDivergencePct: sourceDivergencePct ?? undefined,
    largeDivergence: sourceDivergencePct != null ? sourceDivergencePct > 35 : undefined,
  };
};

const applyOsMunicipalityContext = (
  report: JsonRecord,
  osMunicipalityContext: MunicipalityContext,
  source: "openai" | "fallback",
): JsonRecord => {
  const enriched = report;
  if (!optionalString(enriched.generatedBy)) {
    enriched.generatedBy = osMunicipalityContext.status === "ok"
      ? source === "fallback" ? "fallback_maiprop_os" : "openai_maiprop_os"
      : source;
  } else if (source === "fallback" && enriched.generatedBy === "fallback" && osMunicipalityContext.status === "ok") {
    enriched.generatedBy = "fallback_maiprop_os";
  }

  enriched.osMunicipalityStatus = osMunicipalityContext.status;
  if (osMunicipalityContext.municipalityName) enriched.osMunicipalityName = osMunicipalityContext.municipalityName;
  if (osMunicipalityContext.prefectureName) enriched.osPrefectureName = osMunicipalityContext.prefectureName;
  if (osMunicipalityContext.detail) enriched.osMunicipalityDetail = osMunicipalityContext.detail;
  if (osMunicipalityContext.blendedSaleAverage != null) {
    const parts = [
      `OS blended benchmark: ${osMunicipalityContext.blendedSaleAverage} EUR/m²`,
      osMunicipalityContext.privateSalesAverage != null ? `private sales: ${osMunicipalityContext.privateSalesAverage}` : null,
      osMunicipalityContext.publicListingsAverage != null ? `public listings: ${osMunicipalityContext.publicListingsAverage}` : null,
      osMunicipalityContext.sourceDivergencePct != null ? `source divergence: ${osMunicipalityContext.sourceDivergencePct}%` : null,
    ].filter(Boolean);
    enriched.osMunicipalityDetail = parts.join("; ");
  }

  if (osMunicipalityContext.status === "ok") {
    const current = osMunicipalityContext.blendedSaleAverage ?? blendedOsSaleAverage(osMunicipalityContext.marketReportText);
    if (current != null) {
      const trend = enriched.pricePerSqmTrend && typeof enriched.pricePerSqmTrend === "object"
        ? enriched.pricePerSqmTrend as JsonRecord
        : {};
      const oneYearAgo = coerceFiniteNumber(trend.oneYearAgo) ?? Math.round(current * 0.95);
      const threeYearsAgo = coerceFiniteNumber(trend.threeYearsAgo) ?? Math.round(current * 0.84);
      const fiveYearsAgo = coerceFiniteNumber(trend.fiveYearsAgo) ?? Math.round(current * 0.72);
      enriched.pricePerSqmTrend = {
        ...trend,
        current,
        oneYearAgo,
        threeYearsAgo,
        fiveYearsAgo,
        changeYoY: percentChange(current, oneYearAgo, 0),
        change5Y: percentChange(current, fiveYearsAgo, 0),
      };
    }
  }

  if (source === "fallback" && osMunicipalityContext.status === "ok") {
    const highlights = Array.isArray(enriched.areaHighlights)
      ? enriched.areaHighlights.filter((item): item is string => typeof item === "string")
      : [];
    if (!highlights.some((highlight) => highlight.includes("mAI Prop OS"))) {
      highlights.unshift(`mAI Prop OS municipality data available for ${osMunicipalityContext.municipalityName}`);
    }
    enriched.areaHighlights = highlights.slice(0, 4);

    const outlook = enriched.investmentOutlook && typeof enriched.investmentOutlook === "object"
      ? enriched.investmentOutlook as JsonRecord
      : {};
    enriched.investmentOutlook = {
      ...outlook,
      summary: `Fallback report enriched with mAI Prop OS municipality data for ${osMunicipalityContext.municipalityName}. Use it as municipal market evidence, not street-level due diligence.`,
    };
  }

  return enriched;
};

const fallbackReportWithOsContext = (
  city: string,
  address: string | undefined,
  region: string | undefined,
  osMunicipalityContext: MunicipalityContext,
): JsonRecord =>
  applyOsMunicipalityContext(fallbackReport(city, address, region) as JsonRecord, osMunicipalityContext, "fallback");

Deno.serve(async (req) => { // skipcq: JS-R1005 - One Edge handler coordinates auth, quota, provider JSON parsing, fallback, and response shaping.
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);
  const quota = await enforceAiQuota(req, BUCKET, corsHeaders);
  if (quota.errorResponse) return quota.errorResponse;

  const _ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? quota.userId ?? "anonymous";
  if (await neighbourhoodLimiter.isLimited(_ip)) return tooManyRequestsResponse(corsHeaders);

  // Signed-in access gate is handled by enforceAiQuota; free vs Pro caps live in the DB.
  try {
    const { city, address, region, municipality, propertyType, lat, lng, listingId } = await req.json();

    if (!city) {
      return new Response(
        JSON.stringify({ error: "city is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const locationStr = [address, city, region, "Greece"].filter(Boolean).join(", ");
    const coordStr = lat && lng ? ` (coords: ${lat}, ${lng})` : "";
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
        promptContext: "mAI Prop OS municipality market data unavailable due to an upstream error.",
        detail: osError instanceof Error ? osError.message.slice(0, 120) : String(osError).slice(0, 120),
      };
      log.warn("neighbourhood-report: OS municipality context unavailable; continuing with OpenAI", {
        city,
        municipality,
        err: osError instanceof Error ? osError.message : String(osError),
      });
    }

    if (!hasAIProviderCredentials()) {
      log.warn("neighbourhood-report: AI provider key missing; using fallback report", { city });
      const fallback = fallbackReportWithOsContext(String(city), address, region, osMunicipalityContext);
      await recordAiCall(quota.userId, BUCKET);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const prompt = `You are a Greek real estate market analyst. Generate a cautious neighbourhood intelligence report for a property at: ${locationStr}${coordStr}.

${VETTED_NEIGHBOURHOOD_RULES}

=== MAIPROP OS MUNICIPALITY MARKET DATA ===
${osMunicipalityContext.promptContext}

Use mAI Prop OS municipality market data as primary local quantitative evidence when status is ok. If unavailable, clearly keep the report cautious and do not invent municipality-level figures.

Return ONLY valid JSON, no markdown, no explanation. The JSON must be complete and parseable:
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
      "name": "string (realistic project name)",
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
- All numbers must be realistic for the Greek market
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
      log.warn("neighbourhood-report: AI provider unavailable; using fallback report", {
        city,
        status,
        body: text.slice(0, 500),
      });
      const fallback = fallbackReportWithOsContext(String(city), address, region, osMunicipalityContext);
      await recordAiCall(quota.userId, BUCKET);
      return new Response(JSON.stringify(fallback), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiData = await response.json();
    const raw = readOpenAITextContent(aiData)
      .replace(/```json\s*/gi, "").replace(/```\s*/gi, "").trim();

    // Extract only the outermost JSON object
    const start = raw.indexOf("{");
    const end = raw.lastIndexOf("}");
    const jsonStr = start !== -1 && end !== -1 ? raw.slice(start, end + 1) : raw;

    // The shape of the AI's parsed JSON is unknown until we run the
    // downstream guardrails on it; intentionally typed broadly here and
    // narrowed at every read site.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let parsed: any;
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
        log.warn("neighbourhood-report: AI returned invalid JSON; using fallback report", {
          city,
          rawLength: jsonStr.length,
          sample: jsonStr.slice(0, 240),
        });
        parsed = fallbackReportWithOsContext(String(city), address, region, osMunicipalityContext);
      }
    }

    if (parsed && typeof parsed === "object") {
      parsed = normalizeNeighbourhoodReport(
        applyOsMunicipalityContext(parsed as JsonRecord, osMunicipalityContext, "openai"),
      );
    }

    // Persist neighbourhood scores back to the listing row so they can be filtered on.
    // SECURITY: verify the caller owns the listing before writing scores.
    if (listingId && parsed.walkabilityScore != null) {
      const adminClient = createClient(
        Deno.env.get("SUPABASE_URL")!,
        Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      );
      const { data: listing } = await adminClient
        .from("listings")
        .select("owner_id")
        .eq("id", listingId)
        .single();
      if (listing && listing.owner_id === quota.userId) {
        await adminClient.from("listings").update({
          walkability_score: parsed.walkabilityScore,
          safety_score:      parsed.safetyScore?.score,
          noise_score:       parsed.noiseLevel?.score,
        }).eq("id", listingId);
      } else {
        log.warn("neighbourhood-report: listing ownership mismatch", { listingId, userId: quota.userId });
      }
    }

    await recordAiCall(quota.userId, BUCKET);
    return new Response(JSON.stringify(parsed), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    log.error("neighbourhood-report error", { err: e instanceof Error ? e.message : String(e) });
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
