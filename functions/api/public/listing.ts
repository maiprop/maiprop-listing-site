import {
  cachedJson,
  isSupabaseTransientError,
  jsonResponse,
  methodNotAllowed,
  missingRuntime,
  normalizedCacheUrl,
  safeText,
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL_TAG_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const LISTING_DETAIL_CACHE_VERSION = "open-house-transaction-v1";
const PROJECT_UNIT_SELECT = [
  "id",
  "listing_id",
  "unit_id",
  "unit_number",
  "floor",
  "availability_status",
  "internal_sqm",
  "balcony_sqm",
  "storage_sqm",
  "parking_sqm",
  "bedrooms",
  "bathrooms",
  "kitchen_type",
  "living_rooms",
  "price",
  "price_per_sqm",
  "vat_included",
  "parking_price",
  "storage_price",
  "sea_view",
  "city_view",
  "mountain_view",
  "energy_class",
  "heating_system",
  "cooling_system",
].join(",");
const PROJECT_MEDIA_SELECT = ["id", "url", "media_type", "title", "sort_order"].join(",");
const PROJECT_SELECT = [
  "id",
  "name",
  "description",
  "address",
  "city",
  "municipality",
  "latitude",
  "longitude",
  "cover_image_url",
  "developer_company",
  "architect_group",
  "construction_company",
  "building_permit_number",
  "area_description",
  "permit_approval_date",
  "construction_start_date",
  "structural_completion_date",
  "delivery_date",
  "status",
  `project_units!project_units_project_id_fkey(${PROJECT_UNIT_SELECT})`,
  `project_media!project_media_project_id_fkey(${PROJECT_MEDIA_SELECT})`,
].join(",");
const LISTING_DETAIL_SELECT = [
  "id",
  "owner_id",
  "project_id",
  "created_at",
  "updated_at",
  "status",
  "title",
  "description",
  "address",
  "city",
  "region",
  "postal_code",
  "price",
  "price_per_sqm",
  "sqm",
  "bedrooms",
  "bathrooms",
  "wc_count",
  "kitchens",
  "living_rooms",
  "floor",
  "total_floors",
  "levels",
  "year_built",
  "energy_class",
  "cover_image_url",
  "property_type",
  "listing_type",
  "open_house_transaction_type",
  "commercial_subtype",
  "heating_system",
  "construction_status",
  "available_from",
  "deposit_months",
  "monthly_expenses",
  "agent_fee_included",
  "min_rental_months",
  "open_house_date",
  "auction_date",
  "auction_starting_bid",
  "auction_court",
  "website_url",
  "ai_score",
  "views_count",
  "tags",
  "has_video_tour",
  "has_virtual_tour",
  "is_featured",
  "priority_placement",
  "is_pre_sale",
  "walkability_score",
  "safety_score",
  "noise_score",
  "latitude",
  "longitude",
  "distance_from_city",
  "distance_from_sea",
  "plot_surface",
  "plot_depth",
  "coverage_ratio",
  "building_allowance",
  "facade_length",
  "floor_height",
  "slope",
  "zone_type",
  "road_type",
  "land_use",
  "is_buildable",
  "is_corner",
  "is_neoclassical",
  "is_penthouse",
  "is_preserved",
  "within_city_plan",
  "within_settlement",
  "short_term_rental",
  "suitable_commercial_use",
  "suitable_holiday",
  "suitable_investment",
  "suitable_student",
  "pets_allowed",
  "has_ac",
  "has_alarm",
  "has_attic",
  "has_awning",
  "has_balcony",
  "has_cctv",
  "has_disability_access",
  "has_double_glazing",
  "has_electricity_supply",
  "has_elevator",
  "has_equipped",
  "has_facade",
  "has_fireplace",
  "has_furnished",
  "has_garden",
  "has_internal_staircase",
  "has_land_concession",
  "has_loading_dock",
  "has_night_power",
  "has_painted",
  "has_parking",
  "has_pool",
  "has_satellite",
  "has_secure_door",
  "has_security",
  "has_smart_home",
  "has_solar_water",
  "has_storage",
  "has_structured_cabling",
  "has_three_phase_power",
  "has_underfloor_heating",
  "has_view",
  "has_water_supply",
  "has_window_screens",
  `project:projects!listings_project_id_fkey(${PROJECT_SELECT})`,
  "listing_images(url,sort_order)",
].join(",");

function invalidListingRequest(): Response {
  return jsonResponse(
    { error: "Invalid listing id" },
    {
      status: 400,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

async function fetchOwnerProfile(env: PublicApiEnv, ownerId: string | null | undefined): Promise<ProfilePublicRow | null> {
  if (!ownerId) return null;

  const params = new URLSearchParams();
  params.set("select", "user_id,display_name,avatar_url,role");
  params.set("user_id", `eq.${ownerId}`);
  params.set("limit", "1");
  try {
    const rows = await supabaseJson<ProfilePublicRow>(env, "/rest/v1/profiles_public", params);
    return rows[0] ?? null;
  } catch (error) {
    console.warn("[public-api] Public owner profile lookup failed; returning listing without profile", error);
    return null;
  }
}

function buildListingDetailParams(requestUrl: URL): URLSearchParams | null {
  const id = requestUrl.searchParams.get("id")?.trim() ?? "";
  const osTag = safeText(requestUrl.searchParams.get("osTag"), 120);
  const params = new URLSearchParams();
  params.set("select", LISTING_DETAIL_SELECT);
  params.set("status", "eq.active");
  params.set("is_off_market", "eq.false");
  params.set("limit", "1");
  params.set("listing_images.order", "sort_order.asc");
  params.set("project.project_units.order", "floor.asc.nullslast,unit_number.asc.nullslast");
  params.set("project.project_media.order", "media_type.asc,sort_order.asc");

  if (UUID_RE.test(id)) {
    params.set("id", `eq.${id}`);
    return params;
  }

  if (osTag && EXTERNAL_TAG_RE.test(osTag)) {
    params.set("listing_type", "eq.auction");
    params.set("tags", `cs.{os_auction:${osTag}}`);
    return params;
  }

  return null;
}

async function publicListing(ctx: PublicApiCtx, requestUrl: URL): Promise<Response> {
  if (!getSupabaseRuntime(ctx.env)) return missingRuntime();

  const params = buildListingDetailParams(requestUrl);
  if (!params) return invalidListingRequest();

  const cacheParams = new URLSearchParams(params);
  cacheParams.set("v", LISTING_DETAIL_CACHE_VERSION);
  const cacheKey = normalizedCacheUrl(requestUrl, "listing", cacheParams);

  return cachedJson(ctx, cacheKey, async () => {
    try {
      const rows = await supabaseJson<ListingRow>(ctx.env, "/rest/v1/listings", params, { failOnTransient: true });
      const cleanRows = publicListingRows(rows);
      const row = cleanRows[0] ?? null;
      const profile = await fetchOwnerProfile(ctx.env, row?.owner_id);

      return jsonResponse({
        data: row
          ? {
            ...row,
            profiles: profile,
          }
          : null,
      });
    } catch (error) {
      if (isSupabaseTransientError(error)) return upstreamUnavailable();
      throw error;
    }
  }, {
    edgeTtlSeconds: 300,
    browserTtlSeconds: 60,
    staleSeconds: 900,
  });
}

export const onRequest: PagesFunction<PublicApiEnv> = async (ctx) => {
  if (ctx.request.method !== "GET") return methodNotAllowed();
  return publicListing(ctx, new URL(ctx.request.url));
};
