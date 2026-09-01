import {
  cachedJson,
  getPublicCataloguePublication,
  isPublicCatalogueSnapshotExpiredError,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  publicCatalogueValidityHeaders,
  safeInt,
  supabaseRpcJson,
  SupabaseTransientError,
  upstreamUnavailable,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { PUBLIC_AUCTION_CANDIDATES_PATH } from "../../_publicListingProjection";
import { interleaveCatalogueStreams } from "./_listingRank";
import { normalizePublicPromotionState } from "./_promotionState";

type AuctionRow = Record<string, unknown> & {
  id: string;
  is_featured?: boolean | null;
  featured_until?: string | null;
  priority_placement?: number | null;
  priority_until?: string | null;
  auction_date?: string | null;
  city?: string | null;
  region?: string | null;
  price?: number | null;
  auction_starting_bid?: number | null;
  property_type?: string | null;
  sqm?: number | null;
  year_built?: number | null;
  latitude?: number | null;
  longitude?: number | null;
  tags?: string[] | null;
};

const PUBLIC_AUCTION_LIMIT_MAX = 60;
const AUCTION_CANDIDATE_LIMIT_MAX = 600;
const PUBLIC_AUCTION_LIMIT_DEFAULT = 60;
const AUCTION_PAGE_SIZE_DEFAULT = 20;
const AUCTION_PAGE_SIZE_MAX = 60;
const PUBLIC_AUCTION_PRODUCER_TIMEOUT_MS = 5_000;
const AUCTION_REQUEST_TIMEOUT_MS = 5_000;
const AUCTION_DB_TIMEOUT_MS = 2_500;
const AUCTION_AUTH_TIMEOUT_MS = 2_500;
const AUCTION_CACHE_VERSION = "canonical-server-filtered-v13";
const UNKNOWN_LOCATION_KEY = "__unknown_location__";
const PREMIUM_OWNERSHIP_FILTERS = new Set([
  "full",
  "bare",
  "common",
  "usufruct",
  "vertical",
  "horizontal",
]);
const PREMIUM_YIELD_FILTERS = new Set(["low", "medium", "high", "very_high"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL_TAG_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const REVISION_RE = /^auction_pool:\d{4}-\d{2}-\d{2}$/;
const USER_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROPERTY_TYPE_RE = /^[a-z_]+(?::[a-z_]+)?$/i;
const RANGE_RE = /^(\d+(?:\.\d+)?)-(\d+(?:\.\d+)?)$/;

type NumericRange = readonly [number, number];

type AuctionFilters = {
  city: string | null;
  propertyBase: string | null;
  propertySubtype: string | null;
  bidRange: NumericRange | null;
  yearRange: NumericRange | null;
  sqmRange: NumericRange | null;
  ownership: string | null;
  round: number | "3plus" | null;
  yield: string | null;
  ids: Set<string> | null;
  osTag: string | null;
};

type ExactAuctionFilters = Pick<AuctionFilters, "ids" | "osTag">;

type ExactAuctionFilterParseResult =
  | { valid: true; filters: ExactAuctionFilters }
  | { valid: false };

type AuctionPagePayload = {
  data: AuctionRow[];
  revision: string;
  page: number;
  pageSize: number;
  total: number;
  totalRaw: number;
  totalPages: number;
  facets: {
    cities: string[];
    rounds: number[];
  };
  stats: {
    thisWeek: number;
    avgBid: number;
    mappableCount: number;
  };
};

type ExactAuctionRpcRow = {
  publication_id?: unknown;
  listing_id?: unknown;
  detail_payload?: unknown;
};

class ExactAuctionIdentityError extends Error {
  constructor() {
    super("Auction catalogue identity mismatch");
    this.name = "ExactAuctionIdentityError";
  }
}

type AuctionEntitlement = {
  limit: number;
  authenticated: boolean;
  accessToken: string | null;
};

type AuctionCandidateLimits = {
  priority: number;
  organic: number;
};

const FULL_AUCTION_CANDIDATE_LIMITS: AuctionCandidateLimits = {
  priority: AUCTION_CANDIDATE_LIMIT_MAX,
  organic: AUCTION_CANDIDATE_LIMIT_MAX,
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function todayAuctionPoolTag(): string {
  return `auction_pool:${todayIsoDate()}`;
}

function auctionRevisionTimeMs(): number {
  return Date.parse(`${todayIsoDate()}T00:00:00.000Z`);
}

function normalizedText(value: string | null, maxLength = 100): string | null {
  const normalized = value?.trim() ?? "";
  const hasControlCharacter = [...normalized].some((character) => character.charCodeAt(0) < 32);
  if (!normalized || normalized.length > maxLength || hasControlCharacter) {
    return null;
  }
  return normalized;
}

function parseRange(
  value: string | null,
  minimum: number,
  maximum: number,
): NumericRange | null {
  const match = value?.trim().match(RANGE_RE);
  if (!match) return null;
  const lower = Number(match[1]);
  const upper = Number(match[2]);
  if (
    !Number.isFinite(lower) ||
    !Number.isFinite(upper) ||
    lower < minimum ||
    upper > maximum ||
    lower > upper
  ) {
    return null;
  }
  return [lower, upper];
}

function parseExactAuctionFilters(
  searchParams: URLSearchParams,
): ExactAuctionFilterParseResult {
  let ids: Set<string> | null = null;
  if (searchParams.has("ids")) {
    const rawIds = searchParams.getAll("ids");
    if (rawIds.length !== 1) return { valid: false };
    const values = rawIds[0]
      .split(",")
      .map((id) => id.trim().toLowerCase());
    if (
      values.length < 1 ||
      values.length > AUCTION_CANDIDATE_LIMIT_MAX ||
      values.some((id) => !UUID_RE.test(id))
    ) {
      return { valid: false };
    }
    ids = new Set(values.sort());
  }

  let osTag: string | null = null;
  if (searchParams.has("osTag")) {
    const rawTags = searchParams.getAll("osTag");
    if (rawTags.length !== 1) return { valid: false };
    const value = rawTags[0].trim();
    if (!EXTERNAL_TAG_RE.test(value)) return { valid: false };
    osTag = value;
  }

  if (ids && osTag) return { valid: false };
  return { valid: true, filters: { ids, osTag } };
}

function parseAuctionFilters(
  searchParams: URLSearchParams,
  allowPremium: boolean,
  exact: ExactAuctionFilters,
): AuctionFilters {
  const propertyType = normalizedText(searchParams.get("propertyType"), 80);
  const [rawBase = "", rawSubtype = ""] = propertyType?.split(":", 2) ?? [];
  const propertyBase = rawBase && PROPERTY_TYPE_RE.test(rawBase) ? rawBase.toLowerCase() : null;
  const propertySubtype =
    rawSubtype && PROPERTY_TYPE_RE.test(rawSubtype) ? rawSubtype.toLowerCase() : null;
  const ownershipValue = normalizedText(searchParams.get("ownership"), 24)?.toLowerCase() ?? null;
  const roundValue = normalizedText(searchParams.get("round"), 12);
  const yieldValue = normalizedText(searchParams.get("yield"), 24)?.toLowerCase() ?? null;

  return {
    city: normalizedText(searchParams.get("city"), 100),
    propertyBase,
    propertySubtype,
    bidRange: parseRange(searchParams.get("bidRange"), 0, 100_000_000),
    yearRange: parseRange(searchParams.get("yearRange"), 0, 2200),
    sqmRange: parseRange(searchParams.get("sqmRange"), 0, 1_000_000),
    ownership:
      allowPremium && ownershipValue && PREMIUM_OWNERSHIP_FILTERS.has(ownershipValue)
        ? ownershipValue
        : null,
    round: allowPremium && roundValue === "3plus"
      ? "3plus"
      : allowPremium && /^[1-9]\d?$/.test(roundValue ?? "")
        ? Number(roundValue)
        : null,
    yield:
      allowPremium && yieldValue && PREMIUM_YIELD_FILTERS.has(yieldValue)
        ? yieldValue
        : null,
    ids: exact.ids,
    osTag: exact.osTag,
  };
}

function invalidExactAuctionFilter(): Response {
  return jsonResponse(
    { error: "Invalid exact auction filter" },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function invalidExactAuctionIdentity(): Response {
  return jsonResponse(
    { error: "Auction catalogue identity mismatch" },
    {
      status: 502,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function rowTags(row: AuctionRow): string[] {
  return Array.isArray(row.tags)
    ? row.tags.filter((tag): tag is string => typeof tag === "string")
    : [];
}

function tagValue(tags: string[], prefix: string): string | null {
  const value = tags.find((tag) => tag.startsWith(prefix));
  return value ? value.slice(prefix.length) : null;
}

function normalizedOwnership(value: string | null): string | null {
  const normalized = value?.toLowerCase().trim() ?? "";
  if (!normalized) return null;
  if (["full", "full_ownership", "complete", "100"].includes(normalized)) return "full";
  if (["bare", "bare_ownership", "psili"].includes(normalized)) return "bare";
  if (["common", "shared", "undivided", "joint"].includes(normalized)) return "common";
  if (["usufruct", "epikarpia"].includes(normalized)) return "usufruct";
  if (["vertical", "vertical_ownership"].includes(normalized)) return "vertical";
  if (["horizontal", "horizontal_ownership"].includes(normalized)) return "horizontal";
  return normalized;
}

function auctionOwnershipMatches(row: AuctionRow, expected: string): boolean {
  const tags = rowTags(row);
  const status = normalizedOwnership(tagValue(tags, "ownership:"));
  const percentage = Number(tagValue(tags, "ownership_pct:"));
  const hasPercentage = Number.isFinite(percentage);
  if (expected === "full") return status === "full" || (hasPercentage && percentage >= 100);
  if (expected === "bare") return status === "bare";
  if (expected === "common") {
    return status === "common" ||
      (status == null && hasPercentage && percentage > 0 && percentage < 100);
  }
  return status === expected;
}

function auctionRound(row: AuctionRow): number | null {
  const round = Number(tagValue(rowTags(row), "round:"));
  return Number.isFinite(round) && round >= 1 ? round : null;
}

const RENT_PER_SQM: Record<string, number> = {
  athens: 9.5,
  piraeus: 7.5,
  thessaloniki: 8,
  mykonos: 18,
  santorini: 16,
  rhodes: 10,
  corfu: 9,
  heraklion: 8,
  patras: 6.5,
  "\u03b1\u03b8\u03b7\u03bd\u03b1": 9.5,
  "\u03c0\u03b5\u03b9\u03c1\u03b1\u03b9\u03b1\u03c2": 7.5,
  "\u03b8\u03b5\u03c3\u03c3\u03b1\u03bb\u03bf\u03bd\u03b9\u03ba\u03b7": 8,
  "\u03bc\u03c5\u03ba\u03bf\u03bd\u03bf\u03c2": 18,
  "\u03c3\u03b1\u03bd\u03c4\u03bf\u03c1\u03b9\u03bd\u03b7": 16,
  "\u03c1\u03bf\u03b4\u03bf\u03c2": 10,
  "\u03ba\u03b5\u03c1\u03ba\u03c5\u03c1\u03b1": 9,
  "\u03b7\u03c1\u03b1\u03ba\u03bb\u03b5\u03b9\u03bf": 8,
  "\u03c0\u03b1\u03c4\u03c1\u03b1": 6.5,
};

function normalizedCityKey(value: unknown): string {
  return typeof value === "string"
    ? value.toLowerCase().trim().normalize("NFD").replace(/\p{M}/gu, "")
    : "";
}

function estimatedAuctionYield(row: AuctionRow): number | null {
  const bid = Number(row.auction_starting_bid ?? row.price ?? 0);
  const sqm = Number(row.sqm ?? 0);
  if (!Number.isFinite(bid) || !Number.isFinite(sqm) || bid <= 0 || sqm <= 0) return null;
  const city = normalizedCityKey(row.city);
  const matchingCity = Object.entries(RENT_PER_SQM)
    .find(([key]) => city.includes(key) || key.includes(city));
  const rentPerSqm = RENT_PER_SQM[city] ?? matchingCity?.[1] ?? 6;
  return (rentPerSqm * sqm * 12) / bid * 100;
}

function yieldMatches(row: AuctionRow, bucket: string): boolean {
  const estimated = estimatedAuctionYield(row);
  if (estimated == null) return false;
  if (bucket === "low") return estimated >= 0 && estimated <= 3;
  if (bucket === "medium") return estimated >= 3 && estimated <= 6;
  if (bucket === "high") return estimated >= 6 && estimated <= 9;
  return bucket === "very_high" && estimated >= 9;
}

function auctionMatchesFilters(row: AuctionRow, filters: AuctionFilters): boolean {
  if (filters.ids && !filters.ids.has(String(row.id))) return false;
  if (filters.osTag && !rowTags(row).includes(`os_auction:${filters.osTag}`)) return false;
  if (
    filters.city &&
    !String(row.city ?? "").toLowerCase().includes(filters.city.toLowerCase())
  ) {
    return false;
  }
  if (filters.propertyBase && row.property_type !== filters.propertyBase) return false;
  if (filters.propertySubtype) {
    const prefix = filters.propertyBase === "land"
      ? "land_type:"
      : filters.propertyBase === "commercial"
        ? "commercial_type:"
        : null;
    if (!prefix || !rowTags(row).includes(`${prefix}${filters.propertySubtype}`)) return false;
  }
  if (filters.bidRange) {
    const bid = Number(row.auction_starting_bid ?? row.price ?? 0);
    if (!Number.isFinite(bid) || bid < filters.bidRange[0] || bid > filters.bidRange[1]) {
      return false;
    }
  }
  if (filters.yearRange) {
    const rawYearBuilt = row.year_built;
    if (rawYearBuilt == null) return false;
    const yearBuilt = Number(rawYearBuilt);
    if (
      !Number.isFinite(yearBuilt) ||
      yearBuilt < filters.yearRange[0] ||
      yearBuilt > filters.yearRange[1]
    ) {
      return false;
    }
  }
  if (filters.sqmRange) {
    const sqm = Number(row.sqm ?? 0);
    if (!Number.isFinite(sqm) || sqm < filters.sqmRange[0] || sqm > filters.sqmRange[1]) {
      return false;
    }
  }
  if (filters.ownership && !auctionOwnershipMatches(row, filters.ownership)) return false;
  if (filters.round) {
    const round = auctionRound(row);
    if (filters.round === "3plus" ? !round || round < 3 : round !== filters.round) return false;
  }
  if (filters.yield && !yieldMatches(row, filters.yield)) return false;
  return true;
}

function exactAuctionPayloadMatches(
  payload: AuctionPagePayload,
  exact: ExactAuctionFilters,
): boolean {
  if (exact.osTag && payload.totalRaw > 1) return false;
  if (exact.ids && payload.totalRaw > exact.ids.size) return false;
  return payload.data.every((row) => {
    if (exact.ids && !exact.ids.has(String(row.id))) return false;
    if (exact.osTag && !rowTags(row).includes(`os_auction:${exact.osTag}`)) {
      return false;
    }
    return true;
  });
}

function compareAuctionRows(a: AuctionRow, b: AuctionRow): number {
  const aDate = typeof a.auction_date === "string" ? a.auction_date : "9999-12-31";
  const bDate = typeof b.auction_date === "string" ? b.auction_date : "9999-12-31";
  const dateDelta = aDate.localeCompare(bDate);
  if (dateDelta !== 0) return dateDelta;
  return String(a.id).localeCompare(String(b.id));
}

function sortAuctionRows(rows: AuctionRow[]): AuctionRow[] {
  return [...rows].sort(compareAuctionRows);
}

function getAuctionLocationKey(row: AuctionRow): string {
  const city = typeof row.city === "string" ? row.city.trim() : "";
  if (city) return city;
  const region = typeof row.region === "string" ? row.region.trim() : "";
  return region || UNKNOWN_LOCATION_KEY;
}

function roundRobinAuctionRowsByLocation(rows: AuctionRow[]): AuctionRow[] {
  const buckets = new Map<string, AuctionRow[]>();
  for (const row of sortAuctionRows(rows)) {
    const key = getAuctionLocationKey(row);
    buckets.set(key, [...(buckets.get(key) ?? []), row]);
  }

  const locationKeys = [...buckets.keys()].sort((a, b) => {
    const aTop = buckets.get(a)?.[0];
    const bTop = buckets.get(b)?.[0];
    if (!aTop || !bTop) return a.localeCompare(b);
    const rowDelta = compareAuctionRows(aTop, bTop);
    return rowDelta !== 0 ? rowDelta : a.localeCompare(b);
  });

  const rowsByLocation: AuctionRow[] = [];
  let hasRemainingRows = true;
  while (hasRemainingRows) {
    hasRemainingRows = false;
    for (const key of locationKeys) {
      const bucket = buckets.get(key);
      const next = bucket?.shift();
      if (next) {
        rowsByLocation.push(next);
        hasRemainingRows = true;
      }
    }
  }

  return rowsByLocation;
}

function rankAuctionRows(
  priorityRows: AuctionRow[],
  organicRows: AuctionRow[],
  limit: number,
  nowMs: number,
  predicate: (row: AuctionRow) => boolean = () => true,
): AuctionRow[] {
  const seen = new Set<string>();
  const normalizedRows = [...priorityRows, ...organicRows]
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .map((row) => normalizePublicPromotionState(row, nowMs))
    .filter(predicate);
  const activePriorityRows = sortAuctionRows(
    normalizedRows.filter((row) => row.priority_placement > 0),
  );
  const activeOrganicRows = roundRobinAuctionRowsByLocation(
    normalizedRows.filter((row) => row.priority_placement === 0),
  );

  return interleaveCatalogueStreams(activePriorityRows, activeOrganicRows, limit, 0).data;
}

type AuctionStreams = {
  priorityRows: AuctionRow[];
  organicRows: AuctionRow[];
};

async function fetchDbAuctionStream(
  env: PublicApiEnv,
  limit: number,
  stream: "priority" | "organic",
  now: string,
  poolTag?: string,
  accessToken: string | null = null,
  filters: AuctionFilters | null = null,
  requestSignal?: AbortSignal,
): Promise<AuctionRow[]> {
  const params = new URLSearchParams([
    ["p_limit", String(limit)],
    ["p_stream", stream],
    ["p_today", now.slice(0, 10)],
    ["p_now", now],
  ]);
  if (poolTag) params.set("p_pool_tag", poolTag);
  if (filters?.city) params.set("p_city", filters.city);
  if (filters?.propertyBase) params.set("p_property_base", filters.propertyBase);
  if (filters?.propertySubtype) params.set("p_property_subtype", filters.propertySubtype);
  if (filters?.bidRange) {
    params.set("p_bid_min", String(filters.bidRange[0]));
    params.set("p_bid_max", String(filters.bidRange[1]));
  }
  if (filters?.yearRange) {
    params.set("p_year_min", String(filters.yearRange[0]));
    params.set("p_year_max", String(filters.yearRange[1]));
  }
  if (filters?.sqmRange) {
    params.set("p_sqm_min", String(filters.sqmRange[0]));
    params.set("p_sqm_max", String(filters.sqmRange[1]));
  }
  if (filters?.ownership) params.set("p_ownership", filters.ownership);
  if (filters?.round) params.set("p_round", String(filters.round));
  if (filters?.yield) params.set("p_yield", filters.yield);
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("missing-runtime");

  const path = PUBLIC_AUCTION_CANDIDATES_PATH;
  const url = new URL(path, runtime.url);
  for (const [key, value] of params) url.searchParams.append(key, value);

  let result: { response: Response; rows: AuctionRow[] };
  try {
    const authorizationToken = accessToken ?? runtime.key;
    result = await fetchAndConsumeWithAbortableTimeout(
      url,
      {
        headers: {
          apikey: runtime.key,
          Authorization: `Bearer ${authorizationToken}`,
          Accept: "application/json",
        },
      },
      AUCTION_DB_TIMEOUT_MS,
      async (response) => ({
        response,
        rows: response.ok ? await response.json() as AuctionRow[] : [],
      }),
      requestSignal,
    );
  } catch {
    throw new SupabaseTransientError("Auction candidate request timed out", path);
  }

  const { response, rows } = result;
  if (!response.ok) {
    if ([408, 425, 429, 500, 502, 503, 504, 520, 522, 524, 544].includes(response.status)) {
      throw new SupabaseTransientError(
        `Auction candidate request failed with ${response.status}`,
        path,
        response.status,
      );
    }
    throw new Error(`Auction candidate request failed with ${response.status}`);
  }

  return rows;
}

async function fetchDbAuctionStreams(
  env: PublicApiEnv,
  limits: AuctionCandidateLimits,
  now: string,
  poolTag?: string,
  accessToken: string | null = null,
  filters: AuctionFilters | null = null,
  requestSignal?: AbortSignal,
): Promise<AuctionStreams> {
  const [priorityRows, organicRows] = await Promise.all([
    fetchDbAuctionStream(
      env,
      limits.priority,
      "priority",
      now,
      poolTag,
      accessToken,
      filters,
      requestSignal,
    ),
    fetchDbAuctionStream(
      env,
      limits.organic,
      "organic",
      now,
      poolTag,
      accessToken,
      filters,
      requestSignal,
    ),
  ]);
  return { priorityRows, organicRows };
}

function hasAuctionRows(streams: AuctionStreams): boolean {
  return streams.priorityRows.length > 0 || streams.organicRows.length > 0;
}

async function fetchCanonicalAuctionStreams(
  env: PublicApiEnv,
  now: string,
  accessToken: string | null = null,
  filters: AuctionFilters | null = null,
  requestSignal?: AbortSignal,
): Promise<AuctionStreams> {
  const scheduledPool = await fetchDbAuctionStreams(
    env,
    FULL_AUCTION_CANDIDATE_LIMITS,
    now,
    todayAuctionPoolTag(),
    accessToken,
    filters,
    requestSignal,
  );
  if (hasAuctionRows(scheduledPool)) return scheduledPool;
  return fetchDbAuctionStreams(
    env,
    FULL_AUCTION_CANDIDATE_LIMITS,
    now,
    undefined,
    accessToken,
    filters,
    requestSignal,
  );
}

async function fetchAndConsumeWithAbortableTimeout<T>(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs: number,
  consume: (response: Response) => Promise<T>,
  parentSignal?: AbortSignal,
): Promise<T> {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) abortFromParent();
  else parentSignal?.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(
    () => controller.abort(new DOMException("Auction authorization timed out", "TimeoutError")),
    timeoutMs,
  );
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    return await consume(response);
  } finally {
    clearTimeout(timer);
    parentSignal?.removeEventListener("abort", abortFromParent);
  }
}

type AuctionRequestDeadline = {
  signal: AbortSignal;
  dispose: () => void;
};

function createAuctionRequestDeadline(parentSignal: AbortSignal): AuctionRequestDeadline {
  const controller = new AbortController();
  const abortFromParent = () => controller.abort(parentSignal.reason);
  if (parentSignal.aborted) abortFromParent();
  else parentSignal.addEventListener("abort", abortFromParent, { once: true });
  const timer = setTimeout(() => {
    controller.abort(new DOMException("Auction request timed out", "TimeoutError"));
  }, AUCTION_REQUEST_TIMEOUT_MS);
  return {
    signal: controller.signal,
    dispose: () => {
      clearTimeout(timer);
      parentSignal.removeEventListener("abort", abortFromParent);
    },
  };
}

function bearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  const match = authorization.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

function hasBearerPresence(request: Request): boolean {
  const authorization = request.headers.get("Authorization")?.trim() ?? "";
  return /^Bearer(?:\s|$)/i.test(authorization);
}

function visibleLimitFromPayload(payload: unknown): number | null {
  if (typeof payload === "number") return payload;
  if (Array.isArray(payload) && payload.length > 0) {
    return visibleLimitFromPayload(payload[0]);
  }
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    for (const key of ["get_auction_listing_visible_limit", "limit", "value"]) {
      if (key in record) return visibleLimitFromPayload(record[key]);
    }
  }
  return null;
}

async function resolveAuctionEntitlement(
  ctx: PublicApiCtx,
  requestedLimit: number,
  requestSignal: AbortSignal = ctx.request.signal,
): Promise<AuctionEntitlement> {
  const freeLimit = Math.min(requestedLimit, PUBLIC_AUCTION_LIMIT_MAX);
  if (requestedLimit <= PUBLIC_AUCTION_LIMIT_MAX) {
    return { limit: freeLimit, authenticated: false, accessToken: null };
  }

  const token = bearerToken(ctx.request);
  const publicRuntime = getSupabaseRuntime(ctx.env);
  if (!token || !publicRuntime) {
    return { limit: freeLimit, authenticated: false, accessToken: null };
  }

  let validatedAccessToken: string | null = null;
  try {
    const userResult = await fetchAndConsumeWithAbortableTimeout(
      new URL("/auth/v1/user", publicRuntime.url),
      {
        headers: {
          apikey: publicRuntime.key,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
      },
      AUCTION_AUTH_TIMEOUT_MS,
      async (response) => ({
        response,
        payload: response.ok ? await response.json() as { id?: unknown } : null,
      }),
      requestSignal,
    );
    const { response: userResponse, payload: user } = userResult;
    if (!userResponse.ok) {
      return { limit: freeLimit, authenticated: false, accessToken: null };
    }
    if (!user || typeof user.id !== "string" || !USER_ID_RE.test(user.id)) {
      return { limit: freeLimit, authenticated: false, accessToken: null };
    }
    validatedAccessToken = token;

    const limitResult = await fetchAndConsumeWithAbortableTimeout(
      new URL("/rest/v1/rpc/get_current_auction_listing_visible_limit", publicRuntime.url),
      {
        method: "POST",
        headers: {
          apikey: publicRuntime.key,
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({}),
      },
      AUCTION_AUTH_TIMEOUT_MS,
      async (response) => ({
        response,
        payload: response.ok ? await response.json() : null,
      }),
      requestSignal,
    );
    const { response: limitResponse } = limitResult;
    if (!limitResponse.ok) {
      return { limit: freeLimit, authenticated: true, accessToken: token };
    }
    const configuredLimit = visibleLimitFromPayload(limitResult.payload);
    if (!Number.isFinite(configuredLimit)) {
      return { limit: freeLimit, authenticated: true, accessToken: token };
    }
    return {
      limit: Math.min(
        requestedLimit,
        AUCTION_CANDIDATE_LIMIT_MAX,
        Math.max(PUBLIC_AUCTION_LIMIT_MAX, Math.trunc(configuredLimit ?? 0)),
      ),
      authenticated: true,
      accessToken: token,
    };
  } catch {
    if (requestSignal.aborted) {
      throw new SupabaseTransientError(
        "Auction request deadline exceeded",
        "/api/public/auctions",
      );
    }
    return {
      limit: freeLimit,
      authenticated: validatedAccessToken !== null,
      accessToken: validatedAccessToken,
    };
  }
}

export async function fetchPublicAuctionRows(
  env: PublicApiEnv,
  limit: number,
  accessToken: string | null = null,
  requestSignal?: AbortSignal,
): Promise<AuctionRow[]> {
  const requestedLimit = Math.min(
    PUBLIC_AUCTION_LIMIT_MAX,
    Math.max(1, Math.trunc(limit)),
  );
  const nowMs = auctionRevisionTimeMs();
  const now = new Date(nowMs).toISOString();
  const streams = await fetchCanonicalAuctionStreams(
    env,
    now,
    accessToken,
    null,
    requestSignal,
  );
  return rankAuctionRows(
    streams.priorityRows,
    streams.organicRows,
    PUBLIC_AUCTION_LIMIT_MAX,
    nowMs,
  ).slice(0, requestedLimit);
}

function auctionFacets(rows: AuctionRow[]): AuctionPagePayload["facets"] {
  const cities = [...new Set(
    rows
      .map((row) => typeof row.city === "string" ? row.city.trim() : "")
      .filter(Boolean),
  )].sort((a, b) => a.localeCompare(b));
  const rounds = [...new Set(
    rows
      .map(auctionRound)
      .filter((round): round is number => round != null),
  )].sort((a, b) => a - b);
  return { cities, rounds };
}

function auctionStats(rows: AuctionRow[], nowMs: number): AuctionPagePayload["stats"] {
  const weekEnd = nowMs + 7 * 24 * 60 * 60 * 1000;
  const thisWeek = rows.filter((row) => {
    const auctionAt = typeof row.auction_date === "string"
      ? Date.parse(row.auction_date)
      : Number.NaN;
    return Number.isFinite(auctionAt) && auctionAt >= nowMs && auctionAt <= weekEnd;
  }).length;
  const bids = rows
    .map((row) => Number(row.auction_starting_bid ?? row.price ?? 0))
    .filter((bid) => Number.isFinite(bid) && bid > 0);
  const avgBid = bids.length > 0
    ? Math.round(bids.reduce((sum, bid) => sum + bid, 0) / bids.length)
    : 0;
  const mappableCount = rows.filter(
    (row) =>
      row.latitude != null &&
      row.longitude != null &&
      Number.isFinite(Number(row.latitude)) &&
      Number.isFinite(Number(row.longitude)),
  ).length;
  return { thisWeek, avgBid, mappableCount };
}

function auctionPagePayload(
  canonicalRows: AuctionRow[],
  filteredRows: AuctionRow[],
  entitlementLimit: number,
  page: number,
  pageSize: number,
  revision: string,
  nowMs: number,
): AuctionPagePayload {
  const totalRaw = filteredRows.length;
  const visibleRows = filteredRows.slice(0, entitlementLimit);
  const total = visibleRows.length;
  const offset = (page - 1) * pageSize;
  return {
    data: visibleRows.slice(offset, offset + pageSize),
    revision,
    page,
    pageSize,
    total,
    totalRaw,
    totalPages: Math.max(1, Math.ceil(total / pageSize)),
    facets: auctionFacets(canonicalRows),
    stats: auctionStats(visibleRows, nowMs),
  };
}

async function fetchCanonicalAuctionPage(
  env: PublicApiEnv,
  filters: AuctionFilters,
  entitlementLimit: number,
  page: number,
  pageSize: number,
  accessToken: string | null = null,
  requestSignal?: AbortSignal,
): Promise<AuctionPagePayload> {
  const nowMs = auctionRevisionTimeMs();
  const now = new Date(nowMs).toISOString();
  const streams = await fetchCanonicalAuctionStreams(
    env,
    now,
    accessToken,
    filters,
    requestSignal,
  );
  const canonicalRows = rankAuctionRows(
    streams.priorityRows,
    streams.organicRows,
    AUCTION_CANDIDATE_LIMIT_MAX * 2,
    nowMs,
  );
  const filteredRows = rankAuctionRows(
    streams.priorityRows,
    streams.organicRows,
    AUCTION_CANDIDATE_LIMIT_MAX * 2,
    nowMs,
    (row) => auctionMatchesFilters(row, filters),
  );
  return auctionPagePayload(
    canonicalRows,
    filteredRows,
    entitlementLimit,
    page,
    pageSize,
    todayAuctionPoolTag(),
    nowMs,
  );
}

async function fetchExactAuctionPage(
  env: PublicApiEnv,
  exact: ExactAuctionFilters,
  entitlementLimit: number,
  page: number,
  pageSize: number,
  requestSignal?: AbortSignal,
): Promise<{
  payload: AuctionPagePayload;
  validityHeaders: Record<string, string>;
}> {
  const publication = await getPublicCataloguePublication(env, null, requestSignal);
  const rows = await supabaseRpcJson<ExactAuctionRpcRow>(
    env,
    "get_public_catalogue_auctions",
    {
      p_publication_id: publication.publicationId,
      p_listing_ids: exact.ids ? [...exact.ids] : null,
      p_os_tag: exact.osTag,
    },
    { failOnTransient: true, signal: requestSignal },
  );
  const requestedIds = exact.ids;
  if (
    (exact.osTag && rows.length > 1) ||
    (requestedIds && rows.length > requestedIds.size)
  ) {
    throw new ExactAuctionIdentityError();
  }

  const seenListingIds = new Set<string>();
  const exactRows = rows.map((row): AuctionRow => {
    const publicationId = Number(row.publication_id);
    const listingId = typeof row.listing_id === "string"
      ? row.listing_id.toLowerCase()
      : "";
    const detail = row.detail_payload;
    if (
      publicationId !== publication.publicationId ||
      !UUID_RE.test(listingId) ||
      seenListingIds.has(listingId) ||
      !detail ||
      typeof detail !== "object" ||
      Array.isArray(detail)
    ) {
      throw new ExactAuctionIdentityError();
    }
    const detailRow = detail as AuctionRow;
    if (
      typeof detailRow.id !== "string" ||
      detailRow.id.toLowerCase() !== listingId ||
      detailRow.listing_type !== "auction" ||
      (requestedIds && !requestedIds.has(listingId)) ||
      (
        exact.osTag &&
        !rowTags(detailRow).includes(`os_auction:${exact.osTag}`)
      )
    ) {
      throw new ExactAuctionIdentityError();
    }
    seenListingIds.add(listingId);
    return normalizePublicPromotionState(
      detailRow,
      Date.parse(publication.snapshotMinute),
    ) as AuctionRow;
  });

  const nowMs = auctionRevisionTimeMs();
  const payload = auctionPagePayload(
    exactRows,
    exactRows,
    entitlementLimit,
    page,
    pageSize,
    todayAuctionPoolTag(),
    nowMs,
  );
  if (!exactAuctionPayloadMatches(payload, exact)) {
    throw new ExactAuctionIdentityError();
  }
  return {
    payload,
    validityHeaders: publicCatalogueValidityHeaders(publication),
  };
}

function hasCanonicalQuery(searchParams: URLSearchParams, requestedLimit: number): boolean {
  if (requestedLimit > PUBLIC_AUCTION_LIMIT_MAX) return true;
  return [
    "page",
    "pageSize",
    "revision",
    "city",
    "propertyType",
    "bidRange",
    "yearRange",
    "sqmRange",
    "ownership",
    "round",
    "yield",
    "ids",
    "osTag",
  ].some((key) => searchParams.has(key));
}

function cacheParamsForAuctionQuery(
  requestUrl: URL,
  entitlementLimit: number,
  page: number,
  pageSize: number,
): URLSearchParams {
  const cacheParams = new URLSearchParams([
    ["limit", String(entitlementLimit)],
    ["page", String(page)],
    ["pageSize", String(pageSize)],
    ["day", todayIsoDate()],
    ["v", AUCTION_CACHE_VERSION],
  ]);
  for (const key of [
    "revision",
    "city",
    "propertyType",
    "bidRange",
    "yearRange",
    "sqmRange",
    "ownership",
    "round",
    "yield",
    "ids",
    "osTag",
  ]) {
    const maxLength = key === "ids" ? 40_000 : key === "osTag" ? 120 : 100;
    const value = normalizedText(requestUrl.searchParams.get(key), maxLength);
    if (value) cacheParams.set(key, value);
  }
  return cacheParams;
}

function privateAuctionResponse(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("CDN-Cache-Control", "no-store");
  const vary = headers.get("Vary");
  headers.set("Vary", vary ? `${vary}, Authorization` : "Authorization");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export async function publicAuctions(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();
  const bypassSharedCache = hasBearerPresence(ctx.request);

  const exactResult = parseExactAuctionFilters(requestUrl.searchParams);
  if (!exactResult.valid) return invalidExactAuctionFilter();

  const requestedLimit = safeInt(
    requestUrl.searchParams.get("limit"),
    PUBLIC_AUCTION_LIMIT_DEFAULT,
    1,
    AUCTION_CANDIDATE_LIMIT_MAX,
  );
  const requestedRevision = normalizedText(requestUrl.searchParams.get("revision"), 64);
  const activeRevision = todayAuctionPoolTag();
  if (
    requestUrl.searchParams.has("revision") &&
    (!requestedRevision || !REVISION_RE.test(requestedRevision) || requestedRevision !== activeRevision)
  ) {
    return jsonResponse(
      {
        error: "Auction catalogue revision is no longer active",
        revision: activeRevision,
      },
      {
        status: 409,
        headers: {
          "Cache-Control": "no-store",
          "CDN-Cache-Control": "no-store",
        },
      },
    );
  }

  const requestDeadline = createAuctionRequestDeadline(ctx.request.signal);
  const runWithinDeadline = async (): Promise<Response> => {
    const entitlement = await resolveAuctionEntitlement(
      ctx,
      requestedLimit,
      requestDeadline.signal,
    );
    const canonicalQuery = hasCanonicalQuery(requestUrl.searchParams, entitlement.limit);
    const page = canonicalQuery
      ? safeInt(requestUrl.searchParams.get("page"), 1, 1, 10_000)
      : 1;
    const pageSize = canonicalQuery
      ? safeInt(
        requestUrl.searchParams.get("pageSize"),
        AUCTION_PAGE_SIZE_DEFAULT,
        1,
        AUCTION_PAGE_SIZE_MAX,
      )
      : entitlement.limit;
    const filters = parseAuctionFilters(
      requestUrl.searchParams,
      entitlement.limit > PUBLIC_AUCTION_LIMIT_MAX,
      exactResult.filters,
    );
    const cacheParams = cacheParamsForAuctionQuery(
      requestUrl,
      entitlement.limit,
      page,
      pageSize,
    );
    const cacheKey = normalizedCacheUrl(requestUrl, "auctions", cacheParams);

    const produceResponse = async (): Promise<Response> => {
      try {
        if (exactResult.filters.ids || exactResult.filters.osTag) {
          const exactPage = await fetchExactAuctionPage(
            ctx.env,
            exactResult.filters,
            entitlement.limit,
            page,
            pageSize,
            requestDeadline.signal,
          );
          return jsonResponse(exactPage.payload, {
            headers: exactPage.validityHeaders,
          });
        }
        if (canonicalQuery) {
          const payload = await fetchCanonicalAuctionPage(
            ctx.env,
            filters,
            entitlement.limit,
            page,
            pageSize,
            entitlement.accessToken,
            requestDeadline.signal,
          );
          if (!exactAuctionPayloadMatches(payload, exactResult.filters)) {
            return invalidExactAuctionIdentity();
          }
          return jsonResponse(payload);
        }
        const nowMs = auctionRevisionTimeMs();
        const rows = await fetchPublicAuctionRows(
          ctx.env,
          entitlement.limit,
          entitlement.accessToken,
          requestDeadline.signal,
        );
        return jsonResponse(auctionPagePayload(
          rows,
          rows,
          entitlement.limit,
          1,
          Math.max(1, entitlement.limit),
          activeRevision,
          nowMs,
        ));
      } catch (error) {
        if (
          error instanceof ExactAuctionIdentityError ||
          (
            error instanceof Error &&
            error.message.includes("public_catalogue_duplicate_os_tag")
          )
        ) {
          return invalidExactAuctionIdentity();
        }
        if (isPublicCatalogueSnapshotExpiredError(error)) {
          return jsonResponse(
            { error: "Auction catalogue publication is no longer active" },
            {
              status: 409,
              headers: {
                "Cache-Control": "no-store",
                "CDN-Cache-Control": "no-store",
              },
            },
          );
        }
        if (isSupabaseTransientError(error)) return upstreamUnavailable();
        throw error;
      }
    };
    const response = bypassSharedCache || entitlement.authenticated
      ? await produceResponse()
      : await cachedJson(ctx, cacheKey, produceResponse, {
        edgeTtlSeconds: 60,
        browserTtlSeconds: 30,
        staleSeconds: 60,
        staleFallbackSeconds: 120,
        producerTimeoutMs: PUBLIC_AUCTION_PRODUCER_TIMEOUT_MS,
      });
    return bypassSharedCache || entitlement.authenticated
      ? privateAuctionResponse(response)
      : response;
  };

  try {
    return await runWithinDeadline();
  } catch (error) {
    if (requestDeadline.signal.aborted) {
      const response = upstreamUnavailable();
      return bypassSharedCache ? privateAuctionResponse(response) : response;
    }
    throw error;
  } finally {
    requestDeadline.dispose();
  }
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicAuctions(ctx, new URL(ctx.request.url));
};
