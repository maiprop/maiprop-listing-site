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

type ListingRow = {
  id: string;
  owner_id?: string | null;
  [key: string]: unknown;
};

type ProfilePublicRow = {
  user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  role?: string | null;
};

const LISTING_TYPES = ["sale", "rent", "firesale", "auction", "open_house", "new_build"] as const;
const CATALOG_TYPES_WITH_NEW_BUILD: Partial<Record<(typeof LISTING_TYPES)[number], string>> = {
  sale: "in.(sale,new_build)",
};
const PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office", "warehouse", "hotel"] as const;
const SORTS = ["featured", "newest", "price-asc", "price-desc", "ai-score", "views"] as const;
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
const LISTING_PROJECT_CARD_SELECT = "delivery_date";
const LISTING_PROJECT_CARD_SELECT_WITH_UNITS = [
  "delivery_date",
  `project_units!project_units_project_id_fkey(${PROJECT_UNIT_CARD_SELECT})`,
].join(",");
const LISTINGS_CACHE_VERSION = "default-card-v3";
const LISTINGS_CACHE_OPTIONS = {
  edgeTtlSeconds: 300,
  browserTtlSeconds: 60,
  staleSeconds: 900,
  producerTimeoutMs: 5_000,
};
const LISTINGS_SUPABASE_TIMEOUT_MS = 4_500;

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
  "priority_placement",
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

function buildListingParams(requestUrl: URL): { params: URLSearchParams; page: number; pageSize: number } {
  const params = new URLSearchParams();
  const page = safeInt(requestUrl.searchParams.get("page"), 1, 1, 500);
  const pageSize = safeInt(
    requestUrl.searchParams.get("pageSize") ?? requestUrl.searchParams.get("limit"),
    40,
    1,
    200,
  );
  const from = (page - 1) * pageSize;
  const sort = safeToken(requestUrl.searchParams.get("sort"), SORTS) ?? "featured";

  params.set("select", listingSelect(shouldIncludeProjectUnits(requestUrl)));
  params.set("status", "eq.active");
  params.set("offset", String(from));
  params.set("limit", String(pageSize));
  params.set("listing_images.order", "sort_order.asc");
  params.set("listing_images.limit", "3");
  params.set("is_off_market", "eq.false");

  if (sort === "featured") {
    params.append("order", "is_featured.desc");
    params.append("order", "priority_placement.desc.nullslast");
    params.append("order", "created_at.desc");
  } else {
    params.append("order", "priority_placement.desc.nullslast");
    params.append("order", "is_featured.desc");
    if (sort === "price-asc") params.append("order", "price.asc");
    else if (sort === "price-desc") params.append("order", "price.desc");
    else if (sort === "ai-score") params.append("order", "ai_score.desc.nullslast");
    else if (sort === "views") params.append("order", "views_count.desc.nullslast");
    else params.append("order", "created_at.desc");
  }

  const listingType = safeToken(requestUrl.searchParams.get("listing_type"), LISTING_TYPES);
  if (listingType) {
    params.set("listing_type", CATALOG_TYPES_WITH_NEW_BUILD[listingType] ?? `eq.${listingType}`);
  } else if (requestUrl.searchParams.get("includeAuctions") !== "true") {
    params.set("listing_type", "in.(sale,rent,firesale,new_build)");
  }

  appendIfPresent(params, "city", safeText(requestUrl.searchParams.get("city"))?.replace(/^(.+)$/, "ilike.*$1*") ?? null);
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

  return { params, page, pageSize };
}

async function fetchOwnerProfiles(env: PublicApiEnv, ownerIds: string[]): Promise<Map<string, ProfilePublicRow>> {
  const uniqueOwnerIds = [...new Set(ownerIds)].filter(Boolean);
  if (!uniqueOwnerIds.length) return new Map();

  const params = new URLSearchParams();
  params.set("select", "user_id,display_name,avatar_url,role");
  params.set("user_id", `in.(${uniqueOwnerIds.join(",")})`);
  const rows = await supabaseJson<ProfilePublicRow>(env, "/rest/v1/profiles_public", params);
  return new Map(rows.map((profile) => [profile.user_id, profile]));
}

async function publicListings(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const { params, page, pageSize } = buildListingParams(requestUrl);
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  params.set("v", LISTINGS_CACHE_VERSION);
  const cacheKey = normalizedCacheUrl(requestUrl, "listings", params);
  params.delete("page");
  params.delete("pageSize");
  params.delete("v");

  return cachedJson(ctx, cacheKey, async () => {
    try {
      const rows = await supabaseJson<ListingRow>(ctx.env, "/rest/v1/listings", params, {
        failOnTransient: true,
        timeoutMs: LISTINGS_SUPABASE_TIMEOUT_MS,
      });
      const cleanRows = publicListingRows(rows);
      const ownerIds = cleanRows.map((row) => row.owner_id).filter((id): id is string => typeof id === "string");
      const profiles = await fetchOwnerProfiles(ctx.env, ownerIds);
      const data = cleanRows.map((row) => ({
        ...row,
        profiles: row.owner_id ? profiles.get(row.owner_id) ?? null : null,
      }));

      return jsonResponse({
        data,
        hasMore: rows.length === pageSize,
        page,
        pageSize,
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
