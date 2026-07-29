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
  safeDecimal,
  safeInt,
  safeText,
  safeToken,
  supabaseRpcJson,
  upstreamUnavailable,
  type PublicCatalogueQueryRpcRow,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { publicListingRows } from "./_fixture-content";

type OpenHouseRow = Record<string, unknown>;
const OPEN_HOUSE_LIMIT_MAX = 200;
const OPEN_HOUSE_CACHE_VERSION = "open-house-publication-cursor-v8";
const OPEN_HOUSE_TRANSACTION_TYPES = ["sale", "rent"] as const;
const OPEN_HOUSE_PROPERTY_TYPES = ["apartment", "house", "villa", "commercial", "office", "land"] as const;
const OPEN_HOUSE_ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G"] as const;
const OPEN_HOUSE_FEATURES = new Set([
  "has_parking",
  "has_elevator",
  "has_balcony",
  "has_pool",
  "pets_allowed",
  "has_furnished",
  "has_garden",
  "has_ac",
  "has_fireplace",
  "has_storage",
  "has_view",
  "has_smart_home",
  "has_attic",
  "has_double_glazing",
  "has_secure_door",
  "has_alarm",
]);
function isPastRequest(requestUrl: URL): boolean {
  return requestUrl.searchParams.get("showPast") === "true" || requestUrl.searchParams.get("showPast") === "1";
}

type OpenHouseFilters = {
  city: string | null;
  propertyType: (typeof OPEN_HOUSE_PROPERTY_TYPES)[number] | null;
  priceMin: string | null;
  priceMax: string | null;
  sqmMin: string | null;
  sqmMax: string | null;
  bedroomsMin: string | null;
  energyClass: (typeof OPEN_HOUSE_ENERGY_CLASSES)[number] | null;
  yearMin: string | null;
  yearMax: string | null;
  features: string[];
  boundsWest: string | null;
  boundsSouth: string | null;
  boundsEast: string | null;
  boundsNorth: string | null;
};

type OpenHouseCursor = {
  v: 3;
  publicationId: number;
  showPast: boolean;
  asOf: string;
  scope: string;
  date: string;
  id: string;
};

function safeCoordinate(value: string | null, min: number, max: number): string | null {
  if (value == null || value.trim() === "") return null;
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric < min || numeric > max) return null;
  return String(numeric);
}

const OPEN_HOUSE_BOUND_KEYS = [
  "boundsWest",
  "boundsSouth",
  "boundsEast",
  "boundsNorth",
] as const;

function hasOpenHouseBounds(requestUrl: URL): boolean {
  return OPEN_HOUSE_BOUND_KEYS.some((key) => requestUrl.searchParams.has(key));
}

function readOpenHouseBounds(requestUrl: URL): Pick<
  OpenHouseFilters,
  "boundsWest" | "boundsSouth" | "boundsEast" | "boundsNorth"
> {
  const boundsWest = safeCoordinate(requestUrl.searchParams.get("boundsWest"), -180, 180);
  const boundsSouth = safeCoordinate(requestUrl.searchParams.get("boundsSouth"), -90, 90);
  const boundsEast = safeCoordinate(requestUrl.searchParams.get("boundsEast"), -180, 180);
  const boundsNorth = safeCoordinate(requestUrl.searchParams.get("boundsNorth"), -90, 90);
  if (
    boundsWest == null ||
    boundsSouth == null ||
    boundsEast == null ||
    boundsNorth == null ||
    Number(boundsWest) > Number(boundsEast) ||
    Number(boundsSouth) > Number(boundsNorth)
  ) {
    return {
      boundsWest: null,
      boundsSouth: null,
      boundsEast: null,
      boundsNorth: null,
    };
  }
  return { boundsWest, boundsSouth, boundsEast, boundsNorth };
}

function readOpenHouseFilters(requestUrl: URL): OpenHouseFilters {
  const features = requestUrl.searchParams
    .getAll("features")
    .flatMap((value) => value.split(","))
    .filter((feature) => OPEN_HOUSE_FEATURES.has(feature));
  return {
    city: safeText(requestUrl.searchParams.get("city")),
    propertyType: safeToken(requestUrl.searchParams.get("propertyType"), OPEN_HOUSE_PROPERTY_TYPES),
    priceMin: safeDecimal(requestUrl.searchParams.get("priceMin")),
    priceMax: safeDecimal(requestUrl.searchParams.get("priceMax")),
    sqmMin: safeDecimal(requestUrl.searchParams.get("sqmMin")),
    sqmMax: safeDecimal(requestUrl.searchParams.get("sqmMax")),
    bedroomsMin: safeDecimal(requestUrl.searchParams.get("bedroomsMin")),
    energyClass: safeToken(requestUrl.searchParams.get("energyClass"), OPEN_HOUSE_ENERGY_CLASSES),
    yearMin: safeDecimal(requestUrl.searchParams.get("yearMin")),
    yearMax: safeDecimal(requestUrl.searchParams.get("yearMax")),
    features: [...new Set(features)].sort(),
    ...readOpenHouseBounds(requestUrl),
  };
}

function appendOpenHouseCacheFilters(params: URLSearchParams, filters: OpenHouseFilters): void {
  for (const [key, value] of Object.entries(filters)) {
    if (Array.isArray(value)) {
      for (const feature of value) params.append("features", feature);
    } else if (value) {
      params.set(key, value);
    }
  }
}

function openHouseCursorScope(
  showPast: boolean,
  transactionType: (typeof OPEN_HOUSE_TRANSACTION_TYPES)[number] | null,
  filters: OpenHouseFilters,
): string {
  const params = new URLSearchParams([["showPast", showPast ? "1" : "0"]]);
  if (transactionType) params.set("transactionType", transactionType);
  appendOpenHouseCacheFilters(params, filters);
  return params.toString();
}

function decodeBase64Url(value: string): string {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  return atob(`${base64}${padding}`);
}

function encodeBase64Url(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|[+-]\d{2}:\d{2})$/;

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= 64 &&
    ISO_TIMESTAMP_PATTERN.test(value) &&
    Number.isFinite(Date.parse(value));
}

function validSnapshotTime(value: unknown): value is string {
  if (!validIsoTimestamp(value)) return false;
  const snapshot = Date.parse(value);
  const now = Date.now();
  return snapshot <= now + 30_000 &&
    snapshot >= now - 45 * 60_000;
}

function validPublicationId(value: unknown): value is number {
  return Number.isSafeInteger(value) && Number(value) > 0;
}

function decodeOpenHouseCursor(
  value: string | null,
  showPast: boolean,
  expectedScope: string,
): OpenHouseCursor | null {
  if (!value || value.length > 2_048 || !value.startsWith("v3.")) return null;
  try {
    const parsed = JSON.parse(decodeBase64Url(value.slice(3))) as Partial<OpenHouseCursor>;
    if (
      parsed.v !== 3 ||
      !validPublicationId(parsed.publicationId) ||
      parsed.showPast !== showPast ||
      !validSnapshotTime(parsed.asOf) ||
      parsed.scope !== expectedScope ||
      !validIsoTimestamp(parsed.date) ||
      !UUID_PATTERN.test(String(parsed.id ?? ""))
    ) {
      return null;
    }
    return parsed as OpenHouseCursor;
  } catch {
    return null;
  }
}

function openHouseCursorFromRow(
  row: OpenHouseRow,
  showPast: boolean,
  publicationId: number,
  asOf: string,
  scope: string,
): OpenHouseCursor | null {
  const date = typeof row.open_house_date === "string" ? row.open_house_date : "";
  const id = typeof row.id === "string" ? row.id : "";
  if (!validIsoTimestamp(date) || !UUID_PATTERN.test(id)) return null;
  return {
    v: 3,
    publicationId,
    showPast,
    asOf,
    scope,
    date,
    id,
  };
}

function encodeOpenHouseCursor(
  row: OpenHouseRow,
  showPast: boolean,
  publicationId: number,
  asOf: string,
  scope: string,
): string | null {
  const cursor = openHouseCursorFromRow(
    row,
    showPast,
    publicationId,
    asOf,
    scope,
  );
  return cursor ? `v3.${encodeBase64Url(JSON.stringify(cursor))}` : null;
}

function invalidCursorResponse(): Response {
  return jsonResponse(
    { error: "Invalid open house cursor" },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function invalidBoundsResponse(): Response {
  return jsonResponse(
    { error: "Invalid open house bounds" },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

async function fetchOpenHouses(
  env: PublicApiEnv,
  publicationId: number,
  showPast: boolean,
  limit: number,
  transactionType: (typeof OPEN_HOUSE_TRANSACTION_TYPES)[number] | null,
  filters: OpenHouseFilters,
  cursor: OpenHouseCursor | null,
): Promise<OpenHouseRow[]> {
  const rows = await supabaseRpcJson<PublicCatalogueQueryRpcRow>(
    env,
    "query_public_catalogue",
    {
      p_publication_id: publicationId,
      p_listing_type: "open_house",
      p_property_type: filters.propertyType,
      p_city: null,
      p_location: filters.city,
      p_price_min: filters.priceMin == null ? null : Number(filters.priceMin),
      p_price_max: filters.priceMax == null ? null : Number(filters.priceMax),
      p_bedrooms_min: filters.bedroomsMin == null
        ? null
        : Number(filters.bedroomsMin),
      p_bedrooms_max: null,
      p_bathrooms_min: null,
      p_bathrooms_max: null,
      p_sqm_min: filters.sqmMin == null ? null : Number(filters.sqmMin),
      p_sqm_max: filters.sqmMax == null ? null : Number(filters.sqmMax),
      p_floor_min: null,
      p_floor_max: null,
      p_year_min: filters.yearMin == null ? null : Number(filters.yearMin),
      p_year_max: filters.yearMax == null ? null : Number(filters.yearMax),
      p_energy_classes: filters.energyClass ? [filters.energyClass] : null,
      p_heating_system: null,
      p_construction_status: null,
      p_commercial_subtype: null,
      p_transaction_type: transactionType,
      p_features: filters.features.length > 0 ? filters.features : null,
      p_ai_score_min: null,
      p_walkability_min: null,
      p_bounds_west: filters.boundsWest == null
        ? null
        : Number(filters.boundsWest),
      p_bounds_south: filters.boundsSouth == null
        ? null
        : Number(filters.boundsSouth),
      p_bounds_east: filters.boundsEast == null
        ? null
        : Number(filters.boundsEast),
      p_bounds_north: filters.boundsNorth == null
        ? null
        : Number(filters.boundsNorth),
      p_priority_mode: "all",
      p_open_house_mode: showPast ? "past" : "upcoming",
      p_sort: "newest",
      p_cursor_timestamp: cursor?.date ?? null,
      p_cursor_numeric: null,
      p_cursor_listing_id: cursor?.id ?? null,
      p_cursor_is_null: false,
      p_limit: Math.min(201, limit),
      p_offset: 0,
      p_location_groups: null,
    },
    { failOnTransient: true },
  );
  return rows.map((row) => {
    if (Number(row.publication_id) !== publicationId) {
      throw new Error("Open House RPC returned a different publication");
    }
    if (
      !row.card_payload ||
      typeof row.card_payload !== "object" ||
      Array.isArray(row.card_payload)
    ) {
      throw new Error("Open House RPC returned an invalid card payload");
    }
    return {
      ...(row.card_payload as OpenHouseRow),
      publicationId,
    };
  });
}

export async function publicOpenHouses(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const showPast = isPastRequest(requestUrl);
  const limit = safeInt(requestUrl.searchParams.get("limit"), OPEN_HOUSE_LIMIT_MAX, 1, OPEN_HOUSE_LIMIT_MAX);
  const transactionType = safeToken(requestUrl.searchParams.get("transactionType"), OPEN_HOUSE_TRANSACTION_TYPES);
  const filters = readOpenHouseFilters(requestUrl);
  if (
    hasOpenHouseBounds(requestUrl) &&
    (
      filters.boundsWest == null ||
      filters.boundsSouth == null ||
      filters.boundsEast == null ||
      filters.boundsNorth == null
    )
  ) {
    return invalidBoundsResponse();
  }
  const cursorScope = openHouseCursorScope(showPast, transactionType, filters);
  const includeMeta = requestUrl.searchParams.get("includeMeta") === "1";
  const encodedCursor = requestUrl.searchParams.get("cursor");
  const cursor = encodedCursor ? decodeOpenHouseCursor(encodedCursor, showPast, cursorScope) : null;
  if (encodedCursor && !cursor) return invalidCursorResponse();
  const cacheParams = new URLSearchParams([
    ["showPast", showPast ? "1" : "0"],
    ["limit", String(limit)],
    ["v", OPEN_HOUSE_CACHE_VERSION],
  ]);
  if (transactionType) cacheParams.set("transactionType", transactionType);
  if (includeMeta) cacheParams.set("includeMeta", "1");
  if (encodedCursor) cacheParams.set("cursor", encodedCursor);
  appendOpenHouseCacheFilters(cacheParams, filters);
  const cacheKey = normalizedCacheUrl(requestUrl, "open-houses", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      const publication = await getPublicCataloguePublication(
        ctx.env,
        cursor?.publicationId ?? null,
      );
      if (cursor && cursor.asOf !== publication.snapshotMinute) {
        return invalidCursorResponse();
      }
      const queryLimit = limit + 1;
      const rows = publicListingRows(await fetchOpenHouses(
        ctx.env,
        publication.publicationId,
        showPast,
        queryLimit,
        transactionType,
        filters,
        cursor,
      ));
      const data = rows.slice(0, limit);
      const hasMore = rows.length > limit;
      const nextCursor = hasMore && data.length > 0
        ? encodeOpenHouseCursor(
            data[data.length - 1],
            showPast,
            publication.publicationId,
            publication.snapshotMinute,
            cursorScope,
          )
        : null;
      return jsonResponse(
        includeMeta
          ? {
              data,
              hasMore,
              nextCursor,
              limit,
              publicationId: publication.publicationId,
            }
          : data,
        { headers: publicCatalogueValidityHeaders(publication) },
      );
    } catch (error) {
      if (isPublicCatalogueSnapshotExpiredError(error)) {
        return invalidCursorResponse();
      }
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  }, {
    edgeTtlSeconds: 180,
    browserTtlSeconds: 60,
    staleSeconds: 600,
    producerTimeoutMs: 1_600,
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicOpenHouses(ctx, new URL(ctx.request.url));
};
