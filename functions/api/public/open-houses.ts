import {
  cachedJson,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeInt,
  safeToken,
  supabaseJson,
  upstreamUnavailable,
  type PublicApiCtx,
  type PublicApiEnv,
} from "./_cache";
import { getSupabaseRuntime } from "../../_seo";
import { PUBLIC_LISTING_CATALOGUE_PATH } from "../../_publicListingProjection";

type OpenHouseRow = Record<string, unknown>;

const OPEN_HOUSE_LIMIT_MAX = 200;
const OPEN_HOUSE_CACHE_VERSION = "open-house-subcategory-v2";
const OPEN_HOUSE_TRANSACTION_TYPES = ["sale", "rent"] as const;
const OPEN_HOUSE_SELECT = [
  "id",
  "title",
  "address",
  "city",
  "region",
  "status",
  "listing_type",
  "open_house_transaction_type",
  "property_type",
  "price",
  "price_per_sqm",
  "sqm",
  "bedrooms",
  "bathrooms",
  "floor",
  "total_floors",
  "year_built",
  "energy_class",
  "open_house_date",
  "ai_score",
  "views_count",
  "tags",
  "cover_image_url",
  "latitude",
  "longitude",
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
  "listing_images",
].join(",");

function isPastRequest(requestUrl: URL): boolean {
  return requestUrl.searchParams.get("showPast") === "true" || requestUrl.searchParams.get("showPast") === "1";
}

async function fetchOpenHouses(
  env: PublicApiEnv,
  showPast: boolean,
  limit: number,
  transactionType: (typeof OPEN_HOUSE_TRANSACTION_TYPES)[number] | null,
): Promise<OpenHouseRow[]> {
  const now = new Date().toISOString();
  const params = new URLSearchParams();
  params.set("select", OPEN_HOUSE_SELECT);
  params.set("status", "eq.active");
  params.set("listing_type", "eq.open_house");
  params.set("is_off_market", "eq.false");
  params.set("limit", String(limit));
  if (transactionType) params.set("open_house_transaction_type", `eq.${transactionType}`);

  if (showPast) {
    params.set("open_house_date", `lt.${now}`);
    params.set("order", "open_house_date.desc");
  } else {
    params.set("open_house_date", `gte.${now}`);
    params.set("order", "open_house_date.asc");
  }

  return supabaseJson<OpenHouseRow>(env, PUBLIC_LISTING_CATALOGUE_PATH, params, { failOnTransient: true });
}

async function publicOpenHouses(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const showPast = isPastRequest(requestUrl);
  const limit = safeInt(requestUrl.searchParams.get("limit"), OPEN_HOUSE_LIMIT_MAX, 1, OPEN_HOUSE_LIMIT_MAX);
  const transactionType = safeToken(requestUrl.searchParams.get("transactionType"), OPEN_HOUSE_TRANSACTION_TYPES);
  const cacheParams = new URLSearchParams([
    ["showPast", showPast ? "1" : "0"],
    ["limit", String(limit)],
    ["v", OPEN_HOUSE_CACHE_VERSION],
  ]);
  if (transactionType) cacheParams.set("transactionType", transactionType);
  const cacheKey = normalizedCacheUrl(requestUrl, "open-houses", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      return jsonResponse(await fetchOpenHouses(ctx.env, showPast, limit, transactionType));
    } catch (error) {
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
