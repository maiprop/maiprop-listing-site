import {
  cachedJson,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeDecimal,
  safeInt,
  safeText,
  safeToken,
  supabaseJson,
  upstreamUnavailable,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { publicListingRows } from "./_fixture-content";
import {
  applyCatalogueStreamCursor,
  buildNextCatalogueCursor,
  canAdvanceCatalogueCursor,
  catalogueStreamOffsetsForOutputOffset,
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
const PROJECT_UNIT_CARD_SELECT = ["id", "availability_status", "internal_sqm"].join(",");
const LISTING_PROJECT_CARD_SELECT = "name,delivery_date";
const LISTING_PROJECT_CARD_SELECT_WITH_UNITS = [
  "name",
  "delivery_date",
  `project_units!project_units_project_id_fkey(${PROJECT_UNIT_CARD_SELECT})`,
].join(",");
const LISTINGS_CACHE_VERSION = "catalogue-stream-cursor-promotions-v2";
const LISTINGS_CACHE_OPTIONS = {
  edgeTtlSeconds: 300,
  browserTtlSeconds: 60,
  staleSeconds: 900,
  producerTimeoutMs: 5_000,
};
const LISTINGS_SUPABASE_TIMEOUT_MS = 4_500;
const DEFAULT_LOCATION_RADIUS_M = 750;
const MAX_LOCATION_RADIUS_M = 5_000;
const METERS_PER_LATITUDE_DEGREE = 111_320;

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
  "listing_images(url,sort_order)",
];

function listingSelect(includeProjectUnits: boolean): string {
  const projectSelect = includeProjectUnits ? LISTING_PROJECT_CARD_SELECT_WITH_UNITS : LISTING_PROJECT_CARD_SELECT;
  return [
    ...LISTING_SELECT_BASE.slice(0, -1),
    `project:projects!listings_project_id_fkey(${projectSelect})`,
    LISTING_SELECT_BASE[LISTING_SELECT_BASE.length - 1],
  ].join(",");
}

function shouldIncludeProjectUnits(requestUrl: URL): boolean {
  const listingType = safeToken(requestUrl.searchParams.get("listing_type"), LISTING_TYPES);
  return listingType === "new_build" ||
    listingType === "sale" ||
    requestUrl.searchParams.get("is_pre_sale") === "true";
}

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

  params.set("select", listingSelect(shouldIncludeProjectUnits(requestUrl)));
  params.set("status", "eq.active");
  params.set("listing_images.order", "sort_order.asc");
  params.set("listing_images.limit", "3");
  params.set("is_off_market", "eq.false");

  const listingType = safeToken(requestUrl.searchParams.get("listing_type"), LISTING_TYPES);
  if (listingType) {
    params.set("listing_type", CATALOG_TYPES_WITH_NEW_BUILD[listingType] ?? `eq.${listingType}`);
  } else if (requestUrl.searchParams.get("includeAuctions") !== "true") {
    params.set("listing_type", "in.(sale,rent,firesale,new_build)");
  }

  const locationBounds = listingLocationBounds(requestUrl);
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

function catalogueCursorForLegacyOffset(
  sort: CatalogueSort,
  offset: number,
): CatalogueCursor | null {
  if (offset <= 0) return null;
  const streamOffsets = catalogueStreamOffsetsForOutputOffset(offset);
  return {
    v: 1,
    sort: sort.name,
    slot: streamOffsets.slot,
    priorityOffset: streamOffsets.priorityOffset,
    organicOffset: streamOffsets.organicOffset,
  };
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

async function publicListings(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const { params, page, pageSize, offset: legacyOutputOffset, sort } = buildListingParams(requestUrl);
  const encodedCursor = requestUrl.searchParams.get("cursor");
  const decodedCursor = decodeCatalogueCursor(encodedCursor, sort);
  if (encodedCursor && !decodedCursor) return invalidCursorResponse();

  const cursor = decodedCursor ?? catalogueCursorForLegacyOffset(sort, legacyOutputOffset);
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
      const now = new Date().toISOString();
      const streamLimit = pageSize + 1;
      const legacyOffset = !decodedCursor && legacyOutputOffset > 0;
      const priorityParams = buildCatalogueStreamParams(
        params,
        sort,
        cursor,
        "priority",
        now,
        streamLimit,
        legacyOffset,
      );
      const organicParams = buildCatalogueStreamParams(
        params,
        sort,
        cursor,
        "organic",
        now,
        streamLimit,
        legacyOffset,
      );
      const fetchOptions = {
        failOnTransient: true,
        timeoutMs: LISTINGS_SUPABASE_TIMEOUT_MS,
      } as const;
      const streamResults = await Promise.allSettled([
        supabaseJson<ListingRow>(ctx.env, "/rest/v1/listings", priorityParams, fetchOptions),
        supabaseJson<ListingRow>(ctx.env, "/rest/v1/listings", organicParams, fetchOptions),
      ]);
      const failedStream = streamResults.find((result) => result.status === "rejected");
      if (failedStream?.status === "rejected") throw failedStream.reason;
      const [priorityResult, organicResult] = streamResults;
      if (priorityResult.status !== "fulfilled" || organicResult.status !== "fulfilled") {
        throw new Error("Catalogue stream did not settle");
      }
      const priorityRows = priorityResult.value;
      const organicRows = organicResult.value;
      const nowMs = Date.parse(now);
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
      const nextCursor = hasMore ? buildNextCatalogueCursor(cursor, sort, pageResult) : null;
      const ownerIds = pageResult.data
        .map((row) => row.owner_id)
        .filter((id): id is string => typeof id === "string");
      const profiles = await fetchPublicProfileSummaries(ctx.env, ownerIds);
      const data = pageResult.data.map((row) => ({
        ...row,
        profiles: publicProfileDisplay(row.owner_id ? profiles.get(row.owner_id) : null),
        ownerParticipantType: row.owner_id ? profiles.get(row.owner_id)?.owner_participant_type ?? null : null,
      }));

      return jsonResponse({
        data,
        hasMore,
        nextCursor,
        page,
        pageSize,
        offset: outputOffset,
      });
    } catch (error) {
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  }, LISTINGS_CACHE_OPTIONS);
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicListings(ctx, new URL(ctx.request.url));
};
