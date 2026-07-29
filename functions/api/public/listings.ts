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
  supabaseCount,
  supabaseRpcJson,
  upstreamUnavailable,
  type PublicCatalogueQueryRpcRow,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { PUBLIC_LISTING_CATALOGUE_PATH } from "../../_publicListingProjection";
import { publicListingRows } from "./_fixture-content";
import {
  applyCatalogueStreamCursor,
  buildNextCatalogueCursor,
  canAdvanceCatalogueCursor,
  catalogueStreamOffsetsForAvailableRows,
  decodeCatalogueCursor,
  interleaveCatalogueStreams,
  resolveCatalogueSort,
  type CatalogueCursor,
  type CatalogueSort,
} from "./_listingRank";
import { fetchPublicProfileSummaries, publicProfileDisplay } from "./_publicProfiles";
import { normalizePublicPromotionState } from "./_promotionState";

type ListingRow = {
  id: string;
  owner_id?: string | null;
  is_featured?: boolean | null;
  featured_until?: string | null;
  priority_placement?: number | null;
  priority_until?: string | null;
  [key: string]: unknown;
};

const LISTING_TYPES = ["sale", "rent", "firesale", "auction", "open_house", "new_build"] as const;
const CATALOG_TYPES_WITH_NEW_BUILD: Partial<Record<(typeof LISTING_TYPES)[number], string>> = {
  sale: "in.(sale,new_build)",
};
const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office", "warehouse", "hotel"] as const;
const ENERGY_CLASSES = ["A+", "A", "B+", "B", "C", "D", "E", "F", "G"] as const;
const BOOLEAN_FEATURES = new Set([
  "has_parking", "has_elevator", "has_balcony", "has_pool", "pets_allowed",
  "has_furnished", "has_garden", "has_ac", "has_fireplace", "has_storage",
  "has_view", "has_smart_home", "has_attic", "has_double_glazing",
  "has_secure_door", "has_alarm", "has_loading_dock", "has_three_phase_power",
  "has_cctv", "has_disability_access", "has_structured_cabling", "has_facade",
  "has_night_power", "has_solar_water",
]);
const LISTINGS_CACHE_VERSION = "catalogue-publication-cursor-v7";
const LISTINGS_CACHE_OPTIONS = {
  edgeTtlSeconds: 60,
  browserTtlSeconds: 30,
  staleSeconds: 60,
  staleFallbackSeconds: 600,
  producerTimeoutMs: 5_000,
};
const LISTINGS_SUPABASE_TIMEOUT_MS = 4_500;
const DEFAULT_LOCATION_RADIUS_M = 750;
const MAX_LOCATION_RADIUS_M = 5_000;
const METERS_PER_LATITUDE_DEGREE = 111_320;

type MapBounds = {
  west: number;
  south: number;
  east: number;
  north: number;
};

function earliestActivePromotionExpiry(rows: ListingRow[], nowMs: number): string | null {
  let earliestExpiryMs = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    const candidates = [
      row.is_featured === true ? row.featured_until : null,
      Number(row.priority_placement ?? 0) > 0 ? row.priority_until : null,
    ];
    for (const candidate of candidates) {
      if (!candidate) continue;
      const expiryMs = Date.parse(candidate);
      if (Number.isFinite(expiryMs) && expiryMs > nowMs) {
        earliestExpiryMs = Math.min(earliestExpiryMs, expiryMs);
      }
    }
  }
  return Number.isFinite(earliestExpiryMs) ? new Date(earliestExpiryMs).toISOString() : null;
}

const LISTING_SELECT_BASE = [
  "id",
  "owner_id",
  "created_at",
  "title",
  "address",
  "city",
  "price",
  "price_per_sqm",
  "bedrooms",
  "bathrooms",
  "sqm",
  "floor",
  "total_floors",
  "year_built",
  "energy_class",
  "cover_image_url",
  "property_type",
  "listing_type",
  "open_house_date",
  "open_house_transaction_type",
  "auction_date",
  "auction_starting_bid",
  "ai_score",
  "views_count",
  "tags",
  "has_video_tour",
  "has_virtual_tour",
  "is_featured",
  "featured_until",
  "priority_placement",
  "priority_until",
  "is_pre_sale",
  "construction_status",
  "walkability_score",
  "safety_score",
  "noise_score",
  "latitude",
  "longitude",
  "has_parking",
  "has_pool",
  "has_elevator",
  "has_garden",
  "has_smart_home",
  "project",
  "listing_images",
];

const LISTING_SELECT = LISTING_SELECT_BASE.join(",");

function appendIfPresent(params: URLSearchParams, name: string, value: string | null): void {
  if (value) params.set(name, value);
}

function normalizeLocationText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("el-GR")
    .replace(/ς/g, "σ")
    .replace(/[’'`´]/g, "")
    .replace(/[–—-]/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const GREEK_CHAR_RE = /[\u0370-\u03ff]/;
const LOCATION_TOKEN_ALIASES: Record<string, string[]> = {
  agioi: ["agion", "agios"],
  agion: ["agioi", "agios"],
  agios: ["agioi", "agion"],
  anargiroi: ["anargiron", "anargyroi", "anargyron"],
  anargiron: ["anargiroi", "anargyroi", "anargyron"],
  anargyroi: ["anargiroi", "anargiron", "anargyron"],
  anargyron: ["anargiroi", "anargiron", "anargyroi"],
  kalimnou: ["kalymnou"],
  kalymnou: ["kalimnou"],
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function transliterateGreekToGreeklish(value: string, upsilon: "i" | "y" = "i"): string {
  const normalized = normalizeLocationText(value).replace(/ου/g, "ou");
  const multi = normalized
    .replace(/θ/g, "th")
    .replace(/χ/g, "ch")
    .replace(/ψ/g, "ps");
  const source = "αβγδεζηικλμνξοπρστυφω";
  const target = upsilon === "i" ? "avgdeziiklmnxoprstifo" : "avgdeziiklmnxoprstyfo";
  return multi
    .split("")
    .map((char) => {
      const index = source.indexOf(char);
      return index >= 0 ? target[index] : char;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLatinGreeklish(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/y/g, "i").replace(/\s+/g, " ").trim();
}

function normalizeListingLocationSearchQuery(value: string): string {
  const stopWords = new Set(["περιφερεια", "αττικη", "αττικησ", "ελλαδα", "greece", "attica", "attikis", "perifereia", "ellada"]);
  return normalizeLocationText(value)
    .split(" ")
    .filter((token) => token && !stopWords.has(token))
    .join(" ")
    .trim();
}

function listingLocationSearchTokenGroups(value: string): string[][] {
  const stopWords = new Set(["περιφερεια", "αττικη", "αττικησ", "ελλαδα", "greece", "attica", "attikis", "perifereia", "ellada"]);
  const expandToken = (token: string) => {
    if (!token || stopWords.has(token)) return [];
    const expanded = [token];
    if (GREEK_CHAR_RE.test(token)) {
      const greeklishI = transliterateGreekToGreeklish(token, "i");
      const greeklishY = transliterateGreekToGreeklish(token, "y");
      expanded.push(greeklishI);
      expanded.push(greeklishY);
      expanded.push(...(LOCATION_TOKEN_ALIASES[greeklishI] ?? []));
      expanded.push(...(LOCATION_TOKEN_ALIASES[greeklishY] ?? []));
    } else {
      const latin = normalizeLatinGreeklish(token);
      expanded.push(latin);
      expanded.push(...(LOCATION_TOKEN_ALIASES[latin] ?? []));
    }
    return unique(expanded).filter((item) => !stopWords.has(item));
  };
  return unique(normalizeListingLocationSearchQuery(value).split(" ").filter(Boolean))
    .map((token) => expandToken(token).slice(0, 6))
    .filter((group) => group.length > 0)
    .slice(0, 6);
}

type LocationBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

function finiteCoordinate(value: string | null, min: number, max: number): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function listingLocationBounds(requestUrl: URL): LocationBounds | null {
  const lat = finiteCoordinate(requestUrl.searchParams.get("location_lat"), -90, 90);
  const lng = finiteCoordinate(requestUrl.searchParams.get("location_lng"), -180, 180);
  if (lat == null || lng == null) return null;

  const requestedRadius = Number(requestUrl.searchParams.get("location_radius_m") ?? DEFAULT_LOCATION_RADIUS_M);
  const radiusM = Number.isFinite(requestedRadius)
    ? Math.min(Math.max(requestedRadius, 50), MAX_LOCATION_RADIUS_M)
    : DEFAULT_LOCATION_RADIUS_M;
  const latDelta = radiusM / METERS_PER_LATITUDE_DEGREE;
  const lngScale = Math.max(0.2, Math.cos((lat * Math.PI) / 180));
  const lngDelta = radiusM / (METERS_PER_LATITUDE_DEGREE * lngScale);

  return {
    minLat: Number((lat - latDelta).toFixed(7)),
    maxLat: Number((lat + latDelta).toFixed(7)),
    minLng: Number((lng - lngDelta).toFixed(7)),
    maxLng: Number((lng + lngDelta).toFixed(7)),
  };
}

function listingMapBounds(requestUrl: URL): MapBounds | null {
  const west = finiteCoordinate(requestUrl.searchParams.get("boundsWest"), -180, 180);
  const south = finiteCoordinate(requestUrl.searchParams.get("boundsSouth"), -90, 90);
  const east = finiteCoordinate(requestUrl.searchParams.get("boundsEast"), -180, 180);
  const north = finiteCoordinate(requestUrl.searchParams.get("boundsNorth"), -90, 90);
  if (west == null || south == null || east == null || north == null) return null;
  if (west > east || south > north) return null;
  return { west, south, east, north };
}

const LISTING_BOUND_KEYS = [
  "boundsWest",
  "boundsSouth",
  "boundsEast",
  "boundsNorth",
] as const;

function hasListingBounds(requestUrl: URL): boolean {
  return LISTING_BOUND_KEYS.some((key) => requestUrl.searchParams.has(key));
}

function buildListingParams(requestUrl: URL): {
  params: URLSearchParams;
  page: number;
  pageSize: number;
  offset: number;
  sort: CatalogueSort;
} {
  const params = new URLSearchParams();
  const page = safeInt(requestUrl.searchParams.get("page"), 1, 1, 500);
  const pageSize = safeInt(
    requestUrl.searchParams.get("pageSize") ?? requestUrl.searchParams.get("limit"),
    40,
    1,
    200,
  );
  const offset = safeInt(requestUrl.searchParams.get("offset"), (page - 1) * pageSize, 0, 100_000);
  const sort = resolveCatalogueSort(requestUrl.searchParams.get("sort"));

  params.set("select", LISTING_SELECT);
  params.set("status", "eq.active");
  params.set("is_off_market", "eq.false");

  const listingType = safeToken(requestUrl.searchParams.get("listing_type"), LISTING_TYPES);
  if (listingType) {
    params.set("listing_type", CATALOG_TYPES_WITH_NEW_BUILD[listingType] ?? `eq.${listingType}`);
  } else if (requestUrl.searchParams.get("includeAuctions") !== "true") {
    params.set("listing_type", "in.(sale,rent,firesale,new_build)");
  }

  const mapBounds = listingMapBounds(requestUrl);
  const locationBounds = listingLocationBounds(requestUrl);
  if (mapBounds) {
    params.append("latitude", `gte.${mapBounds.south}`);
    params.append("latitude", `lte.${mapBounds.north}`);
    params.append("longitude", `gte.${mapBounds.west}`);
    params.append("longitude", `lte.${mapBounds.east}`);
  }
  if (locationBounds) {
    params.append("latitude", `gte.${locationBounds.minLat}`);
    params.append("latitude", `lte.${locationBounds.maxLat}`);
    params.append("longitude", `gte.${locationBounds.minLng}`);
    params.append("longitude", `lte.${locationBounds.maxLng}`);
  } else {
    const locationQuery = safeText(requestUrl.searchParams.get("city"));
    for (const locationGroup of locationQuery ? listingLocationSearchTokenGroups(locationQuery) : []) {
      if (locationGroup.length === 1) {
        params.append("location_search_text", `ilike.*${locationGroup[0]}*`);
      } else {
        params.append(
          "or",
          `(${locationGroup.map((locationToken) => `location_search_text.ilike.*${locationToken}*`).join(",")})`,
        );
      }
    }
  }
  appendIfPresent(params, "property_type", safeToken(requestUrl.searchParams.get("property_type"), PROPERTY_TYPES)?.replace(/^(.+)$/, "eq.$1") ?? null);

  for (const [source, target, op] of [
    ["price_min", "price", "gte"],
    ["price_max", "price", "lte"],
    ["beds_min", "bedrooms", "gte"],
    ["beds_max", "bedrooms", "lte"],
    ["baths_min", "bathrooms", "gte"],
    ["baths_max", "bathrooms", "lte"],
    ["sqm_min", "sqm", "gte"],
    ["sqm_max", "sqm", "lte"],
    ["floor_min", "floor", "gte"],
    ["floor_max", "floor", "lte"],
    ["year_min", "year_built", "gte"],
    ["year_max", "year_built", "lte"],
  ] as const) {
    const value = safeDecimal(requestUrl.searchParams.get(source));
    if (value) params.append(target, `${op}.${value}`);
  }

  const heating = safeText(requestUrl.searchParams.get("heating_system"), 40);
  if (heating) params.set("heating_system", `eq.${heating}`);
  const construction = safeText(requestUrl.searchParams.get("construction_status"), 40);
  if (construction) params.set("construction_status", `eq.${construction}`);
  const commercialSubtype = safeText(requestUrl.searchParams.get("commercial_subtype"), 40);
  if (commercialSubtype) params.set("commercial_subtype", `eq.${commercialSubtype}`);
  if (requestUrl.searchParams.get("has_video_tour") === "true") {
    params.set("has_video_tour", "eq.true");
  }
  if (requestUrl.searchParams.get("has_virtual_tour") === "true") {
    params.set("has_virtual_tour", "eq.true");
  }
  const aiScoreMin = safeDecimal(requestUrl.searchParams.get("ai_score_min"));
  if (aiScoreMin) params.set("ai_score", `gte.${aiScoreMin}`);
  const walkabilityMin = safeDecimal(requestUrl.searchParams.get("walkability_min"));
  if (walkabilityMin) params.set("walkability_score", `gte.${walkabilityMin}`);

  if (requestUrl.searchParams.get("is_pre_sale") === "true" && !listingType) {
    params.set("listing_type", "eq.new_build");
  }
  if (requestUrl.searchParams.get("is_off_market") === "true") {
    params.set("id", "eq.00000000-0000-0000-0000-000000000000");
  }

  const energy = requestUrl.searchParams
    .getAll("energy_class")
    .flatMap((value) => value.split(","))
    .filter((value) => ENERGY_CLASSES.includes(value as (typeof ENERGY_CLASSES)[number]));
  if (energy.length) params.set("energy_class", `in.(${[...new Set(energy)].join(",")})`);

  const features = requestUrl.searchParams
    .getAll("features")
    .flatMap((value) => value.split(","))
    .filter((feature) => BOOLEAN_FEATURES.has(feature));
  for (const feature of new Set(features)) params.set(feature, "eq.true");

  return { params, page, pageSize, offset, sort };
}

function catalogueCursorScope(params: URLSearchParams, sort: CatalogueSort): string {
  const scopeParams = new URLSearchParams(params);
  scopeParams.delete("select");
  return `${sort.name}:${scopeParams.toString()}`;
}

function invalidCursorResponse(): Response {
  return jsonResponse(
    { error: "Invalid catalogue cursor" },
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
    { error: "Invalid catalogue bounds" },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function buildCatalogueStreamParams(
  baseParams: URLSearchParams,
  sort: CatalogueSort,
  cursor: CatalogueCursor | null,
  stream: "priority" | "organic",
  now: string,
  limit: number,
  legacyOffset: boolean,
): URLSearchParams {
  const params = new URLSearchParams(baseParams);
  params.set("limit", String(limit));
  params.set("p_as_of", now);
  if (stream === "priority") {
    params.set("priority_placement", "gt.0");
    params.set("priority_until", `gt.${now}`);
  } else {
    params.append(
      "or",
      `(priority_placement.lte.0,priority_placement.is.null,priority_until.lte.${now},priority_until.is.null)`,
    );
  }

  applyCatalogueStreamCursor(params, sort, stream === "priority" ? cursor?.priority : cursor?.organic);
  if (legacyOffset && cursor) {
    const streamOffset = stream === "priority" ? cursor.priorityOffset : cursor.organicOffset;
    if (streamOffset > 0) params.set("offset", String(streamOffset));
  }
  return params;
}

function lightweightLegacyStreamParams(
  baseParams: URLSearchParams,
  sort: CatalogueSort,
  stream: "priority" | "organic",
  now: string,
  limit: number,
): URLSearchParams {
  const params = buildCatalogueStreamParams(baseParams, sort, null, stream, now, limit, false);
  // PostgREST applies filters/order to the projected result of a set-returning
  // RPC. Keep the probe lightweight, but retain the active sort column so the
  // generated `order=<field>,id` clause remains valid.
  params.set("select", `id,${sort.field}`);
  return params;
}

async function catalogueCursorForLegacyOffset(
  env: PublicApiEnv,
  baseParams: URLSearchParams,
  sort: CatalogueSort,
  offset: number,
  publicationId: number,
  snapshotMinute: string,
  scope: string,
): Promise<CatalogueCursor | null> {
  if (offset <= 0) return null;

  const countParams = (stream: "priority" | "organic") => {
    const params = lightweightLegacyStreamParams(
      baseParams,
      sort,
      stream,
      snapshotMinute,
      1,
    );
    params.delete("limit");
    params.delete("order");
    return params;
  };
  const [availablePriorityRows, availableOrganicRows] = await Promise.all([
    supabaseCount(env, PUBLIC_LISTING_CATALOGUE_PATH, countParams("priority"), {
      failOnTransient: true,
      countStrategy: "exact",
      timeoutMs: LISTINGS_SUPABASE_TIMEOUT_MS,
    }),
    supabaseCount(env, PUBLIC_LISTING_CATALOGUE_PATH, countParams("organic"), {
      failOnTransient: true,
      countStrategy: "exact",
      timeoutMs: LISTINGS_SUPABASE_TIMEOUT_MS,
    }),
  ]);

  const streamOffsets = catalogueStreamOffsetsForAvailableRows(
    offset,
    availablePriorityRows,
    availableOrganicRows,
  );
  return {
    v: 3,
    publicationId,
    sort: sort.name,
    asOf: snapshotMinute,
    scope,
    slot: streamOffsets.slot,
    priorityOffset: streamOffsets.priorityOffset,
    organicOffset: streamOffsets.organicOffset,
  };
}

function comparisonValue(
  params: URLSearchParams,
  name: string,
  operator: "eq" | "gte" | "lte",
): string | null {
  const prefix = `${operator}.`;
  const match = params.getAll(name).find((value) => value.startsWith(prefix));
  return match ? match.slice(prefix.length) : null;
}

function numericComparison(
  params: URLSearchParams,
  name: string,
  operator: "gte" | "lte",
): number | null {
  const raw = comparisonValue(params, name, operator);
  if (raw == null) return null;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : null;
}

function listingTypeFilter(params: URLSearchParams): string | null {
  const raw = params.get("listing_type");
  if (!raw) return null;
  if (raw.startsWith("eq.")) return raw.slice(3);
  if (raw.startsWith("in.(") && raw.endsWith(")")) {
    return raw.slice(4, -1);
  }
  return null;
}

function energyClassFilter(params: URLSearchParams): string[] | null {
  const raw = params.get("energy_class");
  if (!raw?.startsWith("in.(") || !raw.endsWith(")")) return null;
  const values = raw.slice(4, -1).split(",").filter(Boolean);
  return values.length > 0 ? values : null;
}

function featureFilter(params: URLSearchParams): string[] | null {
  const values = [...BOOLEAN_FEATURES]
    .filter((feature) => params.get(feature) === "eq.true");
  for (const feature of ["has_video_tour", "has_virtual_tour"]) {
    if (params.get(feature) === "eq.true") values.push(feature);
  }
  return values.length > 0 ? values.sort() : null;
}

function boundedComparison(
  params: URLSearchParams,
  name: "latitude" | "longitude",
  operator: "gte" | "lte",
): number | null {
  const values = params.getAll(name)
    .filter((value) => value.startsWith(`${operator}.`))
    .map((value) => Number(value.slice(4)))
    .filter(Number.isFinite);
  if (values.length === 0) return null;
  return operator === "gte" ? Math.max(...values) : Math.min(...values);
}

function catalogueRpcSort(sort: CatalogueSort): string {
  if (sort.name === "price-asc") return "price_asc";
  if (sort.name === "price-desc") return "price_desc";
  if (sort.name === "ai-score") return "ai_score";
  if (sort.name === "views") return "views";
  return "newest";
}

function catalogueRpcBody(
  baseParams: URLSearchParams,
  publicationId: number,
  location: string | null,
  locationGroups: string[][] | null,
  sort: CatalogueSort,
  cursor: CatalogueCursor | null,
  stream: "priority" | "organic",
  limit: number,
): Record<string, unknown> {
  const anchor = stream === "priority" ? cursor?.priority : cursor?.organic;
  const streamOffset = stream === "priority"
    ? cursor?.priorityOffset ?? 0
    : cursor?.organicOffset ?? 0;
  const numericAnchor = anchor && sort.field !== "created_at" &&
      typeof anchor.value === "number"
    ? anchor.value
    : null;
  const timestampAnchor = anchor && sort.field === "created_at" &&
      typeof anchor.value === "string"
    ? anchor.value
    : null;

  return {
    p_publication_id: publicationId,
    p_listing_type: listingTypeFilter(baseParams),
    p_property_type: comparisonValue(baseParams, "property_type", "eq"),
    p_city: null,
    p_location: location,
    p_price_min: numericComparison(baseParams, "price", "gte"),
    p_price_max: numericComparison(baseParams, "price", "lte"),
    p_bedrooms_min: numericComparison(baseParams, "bedrooms", "gte"),
    p_bedrooms_max: numericComparison(baseParams, "bedrooms", "lte"),
    p_bathrooms_min: numericComparison(baseParams, "bathrooms", "gte"),
    p_bathrooms_max: numericComparison(baseParams, "bathrooms", "lte"),
    p_sqm_min: numericComparison(baseParams, "sqm", "gte"),
    p_sqm_max: numericComparison(baseParams, "sqm", "lte"),
    p_floor_min: numericComparison(baseParams, "floor", "gte"),
    p_floor_max: numericComparison(baseParams, "floor", "lte"),
    p_year_min: numericComparison(baseParams, "year_built", "gte"),
    p_year_max: numericComparison(baseParams, "year_built", "lte"),
    p_energy_classes: energyClassFilter(baseParams),
    p_heating_system: comparisonValue(baseParams, "heating_system", "eq"),
    p_construction_status: comparisonValue(
      baseParams,
      "construction_status",
      "eq",
    ),
    p_commercial_subtype: comparisonValue(
      baseParams,
      "commercial_subtype",
      "eq",
    ),
    p_transaction_type: null,
    p_features: featureFilter(baseParams),
    p_ai_score_min: numericComparison(baseParams, "ai_score", "gte"),
    p_walkability_min: numericComparison(
      baseParams,
      "walkability_score",
      "gte",
    ),
    p_bounds_west: boundedComparison(baseParams, "longitude", "gte"),
    p_bounds_south: boundedComparison(baseParams, "latitude", "gte"),
    p_bounds_east: boundedComparison(baseParams, "longitude", "lte"),
    p_bounds_north: boundedComparison(baseParams, "latitude", "lte"),
    p_priority_mode: stream,
    p_open_house_mode: null,
    p_sort: catalogueRpcSort(sort),
    p_cursor_timestamp: timestampAnchor,
    p_cursor_numeric: numericAnchor,
    p_cursor_listing_id: anchor?.id ?? null,
    p_cursor_is_null: sort.name === "ai-score" && anchor?.value === null,
    p_limit: limit,
    p_offset: anchor ? 0 : streamOffset,
    p_location_groups: locationGroups,
  };
}

function catalogueRows(
  rows: PublicCatalogueQueryRpcRow[],
  publicationId: number,
): ListingRow[] {
  return rows.map((row) => {
    if (Number(row.publication_id) !== publicationId) {
      throw new Error("Catalogue RPC returned a different publication");
    }
    if (
      !row.card_payload ||
      typeof row.card_payload !== "object" ||
      Array.isArray(row.card_payload)
    ) {
      throw new Error("Catalogue RPC returned an invalid card payload");
    }
    return {
      ...(row.card_payload as ListingRow),
      publicationId,
    };
  });
}

async function fetchCatalogueStream(
  env: PublicApiEnv,
  baseParams: URLSearchParams,
  publicationId: number,
  location: string | null,
  locationGroups: string[][] | null,
  sort: CatalogueSort,
  cursor: CatalogueCursor | null,
  stream: "priority" | "organic",
  limit: number,
): Promise<ListingRow[]> {
  const rows = await supabaseRpcJson<PublicCatalogueQueryRpcRow>(
    env,
    "query_public_catalogue",
    catalogueRpcBody(
      baseParams,
      publicationId,
      location,
      locationGroups,
      sort,
      cursor,
      stream,
      limit,
    ),
    {
      failOnTransient: true,
      timeoutMs: LISTINGS_SUPABASE_TIMEOUT_MS,
    },
  );
  return catalogueRows(rows, publicationId);
}

async function publicListings(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();
  if (hasListingBounds(requestUrl) && !listingMapBounds(requestUrl)) {
    return invalidBoundsResponse();
  }

  const { params, page, pageSize, offset: legacyOutputOffset, sort } = buildListingParams(requestUrl);
  const cursorScope = catalogueCursorScope(params, sort);
  const encodedCursor = requestUrl.searchParams.get("cursor");
  const decodedCursor = decodeCatalogueCursor(encodedCursor, sort, cursorScope);
  if (encodedCursor && !decodedCursor) return invalidCursorResponse();

  const outputOffset = decodedCursor
    ? decodedCursor.priorityOffset + decodedCursor.organicOffset
    : legacyOutputOffset;
  const cacheParams = new URLSearchParams(params);
  cacheParams.set("page", String(page));
  cacheParams.set("pageSize", String(pageSize));
  cacheParams.set("offsetKey", String(outputOffset));
  cacheParams.set("sortKey", sort.name);
  if (encodedCursor) cacheParams.set("cursorKey", encodedCursor);
  cacheParams.set("v", LISTINGS_CACHE_VERSION);
  const cacheKey = normalizedCacheUrl(requestUrl, "listings", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      const publication = await getPublicCataloguePublication(
        ctx.env,
        decodedCursor?.publicationId ?? null,
      );
      if (
        decodedCursor &&
        decodedCursor.asOf !== publication.snapshotMinute
      ) {
        return invalidCursorResponse();
      }
      const location = listingLocationBounds(requestUrl)
        ? null
        : safeText(requestUrl.searchParams.get("city"));
      const normalizedLocation = location
        ? normalizeListingLocationSearchQuery(location)
        : null;
      const locationGroups = location
        ? listingLocationSearchTokenGroups(location)
        : [];
      const streamLimit = Math.min(201, pageSize + 1);
      const cursor = decodedCursor ?? await catalogueCursorForLegacyOffset(
        ctx.env,
        params,
        sort,
        legacyOutputOffset,
        publication.publicationId,
        publication.snapshotMinute,
        cursorScope,
      );
      const streamResults = await Promise.allSettled([
        fetchCatalogueStream(
          ctx.env,
          params,
          publication.publicationId,
          locationGroups.length > 0 ? null : normalizedLocation,
          locationGroups.length > 0 ? locationGroups : null,
          sort,
          cursor,
          "priority",
          streamLimit,
        ),
        fetchCatalogueStream(
          ctx.env,
          params,
          publication.publicationId,
          locationGroups.length > 0 ? null : normalizedLocation,
          locationGroups.length > 0 ? locationGroups : null,
          sort,
          cursor,
          "organic",
          streamLimit,
        ),
      ]);
      const failedStream = streamResults.find((result) => result.status === "rejected");
      if (failedStream?.status === "rejected") throw failedStream.reason;
      const [priorityResult, organicResult] = streamResults;
      if (priorityResult.status !== "fulfilled" || organicResult.status !== "fulfilled") {
        throw new Error("Catalogue stream did not settle");
      }
      const priorityRows = priorityResult.value;
      const organicRows = organicResult.value;
      const nowMs = Date.parse(publication.snapshotMinute);
      const cleanPriorityRows = publicListingRows(priorityRows)
        .map((row) => normalizePublicPromotionState(row, nowMs));
      const cleanOrganicRows = publicListingRows(organicRows)
        .map((row) => normalizePublicPromotionState(row, nowMs));
      const pageResult = interleaveCatalogueStreams(
        cleanPriorityRows,
        cleanOrganicRows,
        pageSize,
        cursor?.slot ?? 0,
      );
      const hasUnreadRows = pageResult.consumedPriority < cleanPriorityRows.length ||
        pageResult.consumedOrganic < cleanOrganicRows.length;
      const mayHaveMoreRows = priorityRows.length === streamLimit || organicRows.length === streamLimit;
      const hasMore = pageResult.data.length === pageSize &&
        (hasUnreadRows || mayHaveMoreRows) &&
        canAdvanceCatalogueCursor(cursor, sort, pageResult);
      const nextCursor = hasMore
        ? buildNextCatalogueCursor(
            cursor,
            sort,
            pageResult,
            publication.publicationId,
            publication.snapshotMinute,
            cursorScope,
          )
        : null;
      const ownerIds = pageResult.data
        .map((row) => row.owner_id)
        .filter((id): id is string => typeof id === "string");
      const profiles = await fetchPublicProfileSummaries(ctx.env, ownerIds);
      const data = pageResult.data.map((row) => ({
        ...row,
        profiles: publicProfileDisplay(row.owner_id ? profiles.get(row.owner_id) : null),
        ownerParticipantType: row.owner_id ? profiles.get(row.owner_id)?.owner_participant_type ?? null : null,
      }));
      const promotionValidUntil = earliestActivePromotionExpiry(data, nowMs);

      return jsonResponse(
        {
          data,
          hasMore,
          nextCursor,
          page,
          pageSize,
          offset: outputOffset,
          publicationId: publication.publicationId,
        },
        {
          headers: publicCatalogueValidityHeaders(
            publication,
            promotionValidUntil,
          ),
        },
      );
    } catch (error) {
      if (isPublicCatalogueSnapshotExpiredError(error)) {
        return invalidCursorResponse();
      }
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  }, LISTINGS_CACHE_OPTIONS);
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicListings(ctx, new URL(ctx.request.url));
};
