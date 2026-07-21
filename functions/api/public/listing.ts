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
import { PUBLIC_LISTING_CATALOGUE_PATH } from "../../_publicListingProjection";
import { publicListingRows } from "./_fixture-content";
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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EXTERNAL_TAG_RE = /^[A-Za-z0-9:_-]{1,120}$/;
const LISTING_DETAIL_CACHE_VERSION = "promotion-expiry-v2";
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
  "featured_until",
  "priority_placement",
  "priority_until",
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
  "project:project_detail",
  "listing_images:listing_images_detail",
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

async function fetchOwnerProfile(env: PublicApiEnv, ownerId: string | null | undefined) {
  if (!ownerId) return null;

  try {
    return (await fetchPublicProfileSummaries(env, [ownerId])).get(ownerId) ?? null;
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
      const rows = await supabaseJson<ListingRow>(ctx.env, PUBLIC_LISTING_CATALOGUE_PATH, params, { failOnTransient: true });
      const cleanRows = publicListingRows(rows);
      const row = cleanRows[0]
        ? normalizePublicPromotionState(cleanRows[0], Date.now())
        : null;
      const profile = await fetchOwnerProfile(ctx.env, row?.owner_id);

      return jsonResponse({
        data: row
          ? {
            ...row,
            profiles: publicProfileDisplay(profile),
            ownerParticipantType: profile?.owner_participant_type ?? null,
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
