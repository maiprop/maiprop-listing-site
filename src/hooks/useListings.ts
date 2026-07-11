import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Enums, TablesInsert, TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import { getPlanLimitErrorMessage } from "@/lib/planLimitErrors";
import { logger } from "@/lib/logger";
import { getOwnerParticipantType } from "@/lib/participantConfig";
import { CATALOG_STATIC_QUERY_STALE_TIME, USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { fetchPublicApi, isPublicApiAbort } from "@/lib/publicApi";
import {
  listingIdSchema,
  listingUpdateMutationSchema,
  listingWriteSchema,
  parseMutationInput,
} from "@/lib/mutationSchemas";
import { getListingLocationSearchTokenGroups } from "@/lib/location/locationSearchSemantics";

/**
 * Minimal shape we need from a listings row to enrich it with profiles. The
 * runtime rows come from `buildListingsQuery` which selects `*, listing_images(...)`,
 * so they are at minimum a `listings` row but we only ever read `owner_id`
 * during enrichment.
 */
type ListingRowWithOwner = Database["public"]["Tables"]["listings"]["Row"] & {
  listing_images?: { url: string; sort_order: number }[];
};

const LISTING_CARD_IMAGE_LIMIT = 3;
const PROJECT_UNIT_CARD_SELECT = ["id", "availability_status", "internal_sqm"].join(",");
const LISTING_PROJECT_CARD_SELECT = [
  "name",
  "delivery_date",
  `project_units!project_units_project_id_fkey(${PROJECT_UNIT_CARD_SELECT})`,
].join(",");
const LISTING_CARD_SELECT = [
  "id",
  "owner_id",
  "created_at",
  "status",
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
  "project_id",
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
  `project:projects!listings_project_id_fkey(${LISTING_PROJECT_CARD_SELECT})`,
].join(",");

const LISTING_CARD_SELECT_WITH_IMAGES = `${LISTING_CARD_SELECT}, listing_images(url, sort_order)`;
/** Paginated listings for grid view — loads the first visible cards fast, then fills the 40-card window. */
export const PAGE_SIZE = 40;
export const INITIAL_GRID_PAGE_SIZE = 12;
const DEFAULT_LOCATION_RADIUS_M = 750;
const MAX_LOCATION_RADIUS_M = 5_000;
const METERS_PER_LATITUDE_DEGREE = 111_320;

const CATALOG_TYPES_WITH_NEW_BUILD: Partial<Record<Enums<"listing_type">, Enums<"listing_type">[]>> = {
  sale: ["sale", "new_build"],
};

const LISTING_DETAIL_SELECT = [
  "id",
  "owner_id",
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
  "commercial_subtype",
  "heating_system",
  "construction_status",
  "available_from",
  "deposit_months",
  "monthly_expenses",
  "agent_fee_included",
  "min_rental_months",
  "open_house_date",
  "open_house_transaction_type",
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
  "listing_images(url, sort_order)",
].join(",");

/**
 * A listings row augmented with joined tables and computed fields added by useListing().
 * Using this type eliminates type casting in consuming components.
 */
export type ListingWithJoins = Database["public"]["Tables"]["listings"]["Row"] & {
  /** Images joined from listing_images table */
  listing_images: { url: string; sort_order: number }[];
  /** Owner profile joined from profiles_public */
  profiles: {
    user_id: string;
    display_name: string | null;
    avatar_url: string | null;
    verified?: boolean | null;
    role?: string | null;
    bio?: string | null;
    phone?: string | null;
  } | null;
  /** Whether the listing owner has an active Pro subscription */
  ownerIsPro: boolean;
  /** Participant role of the owner (agent vs private seller) */
  ownerParticipantType: "agent" | "seller" | null;
  /** Score columns stored by neighbourhood-report edge function (not in generated types yet) */
  walkability_score?: number | null;
  safety_score?: number | null;
  noise_score?: number | null;
};

export type ListingsFilters = {
  city?: string;
  location_lat?: number;
  location_lng?: number;
  location_radius_m?: number;
  listing_type?: string;
  property_type?: string;
  status?: string;
  owner_id?: string;
  includeAuctions?: boolean;
  limit?: number;
  page?: number;
  pageSize?: number;
  price_min?: number;
  price_max?: number;
  beds_min?: number;
  beds_max?: number;
  baths_min?: number;
  baths_max?: number;
  sqm_min?: number;
  sqm_max?: number;
  floor_min?: number;
  floor_max?: number;
  year_min?: number;
  year_max?: number;
  energy_class?: string[];
  heating_system?: string;
  construction_status?: string;
  commercial_subtype?: string;
  is_pre_sale?: boolean;
  is_off_market?: boolean;
  features?: string[];
  sort?: "featured" | "newest" | "price-asc" | "price-desc" | "ai-score" | "views";
};

type ListingsQueryScope = {
  publicScope?: boolean;
};

type AbortableQuery<T> = T & { abortSignal?: (signal: AbortSignal) => T };

const withAbortSignal = <T>(query: T, signal?: AbortSignal): T => {
  const abortable = query as AbortableQuery<T>;
  return signal && typeof abortable.abortSignal === "function"
    ? abortable.abortSignal(signal)
    : query;
};

type LocationBounds = {
  minLat: number;
  maxLat: number;
  minLng: number;
  maxLng: number;
};

function finiteCoordinate(value: unknown, min: number, max: number): number | null {
  if (value === undefined || value === null || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) return null;
  return parsed;
}

function listingLocationBounds(filters?: ListingsFilters): LocationBounds | null {
  const lat = finiteCoordinate(filters?.location_lat, -90, 90);
  const lng = finiteCoordinate(filters?.location_lng, -180, 180);
  if (lat == null || lng == null) return null;

  const requestedRadius = Number(filters?.location_radius_m ?? DEFAULT_LOCATION_RADIUS_M);
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

/**
 * Builds the Supabase query used by `useListings` / `useListingsPaginated`.
 * Exported so unit tests can verify each filter branch without requiring a
 * full hook + react-query wrapper. The shape of the returned object mirrors
 * the supabase-js query builder so consumers can `await` it directly.
 */
export const buildListingsQuery = (filters?: ListingsFilters, from = 0, pageSize = PAGE_SIZE, scope: ListingsQueryScope = {}) => { // skipcq: JS-R1005 - Listing filters intentionally map one public search model onto Supabase query clauses.
  const sort = filters?.sort ?? "featured";
  const ownerScoped = Boolean(filters?.owner_id) && !scope.publicScope;
  let query = supabase
    .from("listings")
    .select(LISTING_CARD_SELECT_WITH_IMAGES)
    .order("sort_order", { referencedTable: "listing_images", ascending: true })
    .limit(LISTING_CARD_IMAGE_LIMIT, { referencedTable: "listing_images" });

  // Promoted listings (is_featured OR priority_placement > 0) always lead, then
  // ties broken by the user-selected sort. The client (Listings.tsx) applies
  // the same promoted-first rule for all non-featured sorts; the server must
  // match so that paginated infinite scroll does not produce list jumps when
  // a later page contains a promoted row that the client then re-sorts to the
  // top of the already-rendered list.
  //
  // For the explicit "featured" sort the client groups by is_featured first,
  // then priority. For every other sort the client groups by priority first
  // (treating any priority_placement > 0 row as promoted, regardless of
  // is_featured), then user-key. The server must mirror that exact precedence
  // — so the leading ORDER BY column flips between the two sort families.
  if (sort === "featured") {
    query = query
      .order("is_featured", { ascending: false })
      .order("priority_placement", { ascending: false, nullsFirst: false })
      .order("created_at", { ascending: false });
  } else {
    query = query
      .order("priority_placement", { ascending: false, nullsFirst: false })
      .order("is_featured", { ascending: false });
    if (sort === "price-asc") query = query.order("price", { ascending: true });
    else if (sort === "price-desc") query = query.order("price", { ascending: false });
    else if (sort === "newest") query = query.order("created_at", { ascending: false });
    else if (sort === "ai-score") query = query.order("ai_score", { ascending: false, nullsFirst: false });
    else if (sort === "views") query = query.order("views_count", { ascending: false, nullsFirst: false });
    else query = query.order("created_at", { ascending: false });
  }

  query = query.range(from, from + pageSize - 1);

  const locationBounds = listingLocationBounds(filters);
  if (locationBounds) {
    query = query
      .gte("latitude", locationBounds.minLat)
      .lte("latitude", locationBounds.maxLat)
      .gte("longitude", locationBounds.minLng)
      .lte("longitude", locationBounds.maxLng);
  } else if (filters?.city) {
    for (const locationGroup of getListingLocationSearchTokenGroups(filters.city)) {
      if (locationGroup.length === 1) {
        query = query.ilike("location_search_text", `%${locationGroup[0]}%`);
      } else {
        query = query.or(
          locationGroup.map((locationToken) => `location_search_text.ilike.%${locationToken}%`).join(","),
        );
      }
    }
  }
  if (filters?.listing_type) {
    const listingType = filters.listing_type as Enums<"listing_type">;
    const catalogTypes = CATALOG_TYPES_WITH_NEW_BUILD[listingType];
    query = catalogTypes ? query.in("listing_type", catalogTypes) : query.eq("listing_type", listingType);
  } else if (!ownerScoped && !filters?.includeAuctions) {
    query = query.in("listing_type", ["sale", "rent", "firesale", "new_build"] as Enums<"listing_type">[]);
  }
  if (filters?.property_type) query = query.eq("property_type", filters.property_type as Enums<"property_type">);
  if (filters?.owner_id) query = query.eq("owner_id", filters.owner_id);
  // Always apply status filter; for owner queries don't default to 'active' so all own listings show
  if (ownerScoped) {
    if (filters?.status) query = query.eq("status", filters.status as Enums<"listing_status">);
  } else {
    query = query.eq("status", (filters?.status || "active") as Enums<"listing_status">);
    query = query.eq("is_off_market", false);
    if (filters?.is_off_market === true) {
      query = query.eq("id", "00000000-0000-0000-0000-000000000000");
    }
  }

  // Numeric filters
  if (filters?.price_min != null) query = query.gte("price", filters.price_min);
  if (filters?.price_max != null) query = query.lte("price", filters.price_max);
  if (filters?.beds_min != null) query = query.gte("bedrooms", filters.beds_min);
  if (filters?.beds_max != null) query = query.lte("bedrooms", filters.beds_max);
  if (filters?.baths_min != null) query = query.gte("bathrooms", filters.baths_min);
  if (filters?.baths_max != null) query = query.lte("bathrooms", filters.baths_max);
  if (filters?.sqm_min != null) query = query.gte("sqm", filters.sqm_min);
  if (filters?.sqm_max != null) query = query.lte("sqm", filters.sqm_max);
  if (filters?.floor_min != null) query = query.gte("floor", filters.floor_min);
  if (filters?.floor_max != null) query = query.lte("floor", filters.floor_max);
  if (filters?.year_min != null) query = query.gte("year_built", filters.year_min);
  if (filters?.year_max != null) query = query.lte("year_built", filters.year_max);
  if (filters?.heating_system) query = query.eq("heating_system", filters.heating_system);
  if (filters?.construction_status) query = query.eq("construction_status", filters.construction_status);
  if (filters?.commercial_subtype) query = query.eq("commercial_subtype", filters.commercial_subtype);
  if (filters?.is_pre_sale === true && !filters?.listing_type) {
    query = query.eq("listing_type", "new_build" as Enums<"listing_type">);
  }
  if (ownerScoped && filters?.is_off_market === true) query = query.eq("is_off_market", true);
  if (filters?.energy_class?.length) query = query.in("energy_class", filters.energy_class);

  // Feature booleans — only allow known DB column names to prevent column injection
  const ALLOWED_FEATURE_COLUMNS = new Set([
    "has_parking", "has_elevator", "has_balcony", "has_pool", "pets_allowed",
    "has_furnished", "has_garden", "has_ac", "has_fireplace", "has_storage",
    "has_view", "has_smart_home", "has_attic", "has_double_glazing",
    "has_secure_door", "has_alarm", "has_loading_dock", "has_three_phase_power",
    "has_cctv", "has_disability_access", "has_structured_cabling", "has_facade",
    "has_night_power", "has_solar_water",
  ]);
  for (const feat of filters?.features ?? []) {
    if (!ALLOWED_FEATURE_COLUMNS.has(feat)) continue;
     
    query = query.eq(feat, true);
  }

  return query;
};

type PublicListingsResponse = {
  data: ListingWithJoins[];
  hasMore: boolean;
  page: number;
  pageSize: number;
  offset?: number;
};

type ListingsPageParam = {
  page: number;
  pageSize: number;
  offset?: number;
};

const INITIAL_LISTINGS_PAGE_PARAM: ListingsPageParam = {
  page: 1,
  pageSize: INITIAL_GRID_PAGE_SIZE,
  offset: 0,
};

function normalizeListingsPageParam(pageParam: unknown): ListingsPageParam {
  if (typeof pageParam === "number" && Number.isFinite(pageParam)) {
    return { page: Math.max(1, Math.floor(pageParam)), pageSize: PAGE_SIZE };
  }
  if (pageParam && typeof pageParam === "object") {
    const param = pageParam as Partial<ListingsPageParam>;
    const page = Number.isFinite(Number(param.page)) ? Math.max(1, Math.floor(Number(param.page))) : 1;
    const pageSize = Number.isFinite(Number(param.pageSize))
      ? Math.max(1, Math.min(PAGE_SIZE, Math.floor(Number(param.pageSize))))
      : PAGE_SIZE;
    const offset = Number.isFinite(Number(param.offset)) ? Math.max(0, Math.floor(Number(param.offset))) : undefined;
    return { page, pageSize, offset };
  }
  return INITIAL_LISTINGS_PAGE_PARAM;
}

function shouldUsePublicListingsApi(filters?: ListingsFilters): boolean {
  if (filters?.owner_id) return false;
  if (filters?.status && filters.status !== "active") return false;
  return true;
}

function publicListingsPath(filters: ListingsFilters | undefined, page: number, pageSize: number, offset?: number): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (offset != null) params.set("offset", String(offset));

  const append = (key: keyof ListingsFilters, value = filters?.[key]) => {
    if (value === undefined || value === null || value === "") return;
    if (Array.isArray(value)) {
      for (const item of value) params.append(key, String(item));
      return;
    }
    params.set(key, String(value));
  };

  append("city");
  append("location_lat");
  append("location_lng");
  append("location_radius_m");
  append("listing_type");
  append("property_type");
  append("includeAuctions");
  append("price_min");
  append("price_max");
  append("beds_min");
  append("beds_max");
  append("baths_min");
  append("baths_max");
  append("sqm_min");
  append("sqm_max");
  append("floor_min");
  append("floor_max");
  append("year_min");
  append("year_max");
  append("energy_class");
  append("heating_system");
  append("construction_status");
  append("commercial_subtype");
  append("is_pre_sale");
  append("is_off_market");
  append("features");
  append("sort");

  return `/api/public/listings?${params.toString()}`;
}

type UseListingsOptions = {
  enabled?: boolean;
  publicScope?: boolean;
};

const fetchListingsPageFromSupabase = async (
  filters?: ListingsFilters,
  page = 1,
  pageSize = PAGE_SIZE,
  options: UseListingsOptions = {},
  signal?: AbortSignal,
  offset?: number,
) => { // skipcq: JS-R1005 - Page fetch keeps listing rows and owner profile enrichment together.
  const from = offset ?? (page - 1) * pageSize;
  const { data, error } = await withAbortSignal(
    buildListingsQuery(filters, from, pageSize, { publicScope: options.publicScope }),
    signal,
  );

  if (error) throw error;
  const rows = data ?? [];

  // Enrich with owner profiles
  const typedRows = rows as unknown as ListingRowWithOwner[];
  const ownerIds = [
    ...new Set(typedRows.map((r) => r.owner_id).filter((id): id is string => Boolean(id))),
  ];
  let profileMap = new Map<string, { user_id: string; display_name: string | null; avatar_url: string | null }>();
  if (ownerIds.length > 0) {
    const { data: ownerProfiles = [] } = await withAbortSignal(supabase
      .from("profiles_public")
      .select("user_id, display_name, avatar_url")
      .in("user_id", ownerIds), signal);
    profileMap = new Map((ownerProfiles ?? []).map((p) => [p.user_id, p]));
  }

  const enriched = typedRows.map((r) => ({
    ...r,
    profiles: r.owner_id ? profileMap.get(r.owner_id) ?? null : null,
  }));

  // ORDER BY is applied server-side in buildListingsQuery; no client sort needed.
  return { data: enriched, hasMore: rows.length === pageSize, page, pageSize, offset: from };
};

const fetchListingsPage = async (
  filters?: ListingsFilters,
  page = 1,
  pageSize = PAGE_SIZE,
  options: UseListingsOptions = {},
  signal?: AbortSignal,
  offset?: number,
) => { // skipcq: JS-R1005 - Page fetch keeps listing rows and owner profile enrichment together.
  if (shouldUsePublicListingsApi(filters)) {
    try {
      const cached = await fetchPublicApi<PublicListingsResponse>(
        publicListingsPath(filters, page, pageSize, offset),
        { throwOnError: true, signal },
      );
      if (!cached) throw new Error("Public listings API returned no data");
      return cached;
    } catch (error) {
      if (isPublicApiAbort(error)) throw error;
      logger.warn("Public listings API failed; falling back to constrained Supabase listing read:", error);
      return fetchListingsPageFromSupabase(filters, page, pageSize, { ...options, publicScope: true }, signal, offset);
    }
  }

  return fetchListingsPageFromSupabase(filters, page, pageSize, options, signal, offset);
};

export const useListingsPaginated = (
  filters?: ListingsFilters,
  options?: UseListingsOptions,
) => {
  return useInfiniteQuery({
    queryKey: ["listings-paginated", filters, { publicScope: Boolean(options?.publicScope) }],
    queryFn: ({ pageParam = INITIAL_LISTINGS_PAGE_PARAM, signal }) => {
      const { page, pageSize, offset } = normalizeListingsPageParam(pageParam);
      return fetchListingsPage(filters, page, pageSize, options, signal, offset);
    },
    getNextPageParam: (lastPage, allPages): ListingsPageParam | undefined => {
      if (!lastPage.hasMore) return undefined;
      const loadedRows = allPages.reduce((sum, page) => sum + page.data.length, 0);
      const lastOffset = Number.isFinite(Number(lastPage.offset))
        ? Math.max(0, Math.floor(Number(lastPage.offset)))
        : Math.max(0, loadedRows - lastPage.data.length);
      const lastPageSize = Number.isFinite(Number(lastPage.pageSize))
        ? Math.max(1, Math.floor(Number(lastPage.pageSize)))
        : Math.max(1, lastPage.data.length || PAGE_SIZE);
      const nextOffset = lastOffset + lastPageSize;
      const nextPageSize = nextOffset < PAGE_SIZE ? PAGE_SIZE - nextOffset : PAGE_SIZE;
      return {
        page: Math.floor(nextOffset / PAGE_SIZE) + 1,
        pageSize: nextPageSize,
        offset: nextOffset,
      };
    },
    initialPageParam: INITIAL_LISTINGS_PAGE_PARAM,
    enabled: options?.enabled ?? true,
    staleTime: filters?.owner_id && !options?.publicScope ? USER_SCOPED_QUERY_STALE_TIME : CATALOG_STATIC_QUERY_STALE_TIME,
  });
};

/** All listings for map/split view — single bounded fetch, max 200 rows. Set enabled: false to skip. */
export const MAP_FETCH_LIMIT = 200;

export const useListings = (
  filters?: ListingsFilters,
  options?: UseListingsOptions
) => {
  return useQuery({
    queryKey: ["listings", filters, { publicScope: Boolean(options?.publicScope) }],
    enabled: options?.enabled ?? true,
    staleTime: filters?.owner_id && !options?.publicScope ? USER_SCOPED_QUERY_STALE_TIME : CATALOG_STATIC_QUERY_STALE_TIME,
    queryFn: async ({ signal }) => { // skipcq: JS-R1005 - Owner profile enrichment keeps the map fetch result self-contained.
      const limit = filters?.limit ?? MAP_FETCH_LIMIT;
      if (shouldUsePublicListingsApi(filters)) {
        try {
          const cached = await fetchPublicApi<PublicListingsResponse>(
            publicListingsPath(filters, 1, limit),
            { throwOnError: true, signal },
          );
          if (!cached) throw new Error("Public listings API returned no data");
          return cached.data;
        } catch (error) {
          if (isPublicApiAbort(error)) throw error;
          logger.warn("Public listings API failed; falling back to constrained Supabase listing read:", error);
          const fallback = await fetchListingsPageFromSupabase(filters, 1, limit, { ...options, publicScope: true }, signal);
          return fallback.data as ListingWithJoins[];
        }
      }

      const fallback = await fetchListingsPageFromSupabase(filters, 1, limit, options, signal);
      return fallback.data as ListingWithJoins[];
    },
  });
};

type UseListingOptions = {
  initialData?: ListingWithJoins | null;
  publicScope?: boolean;
};

const normalizeListingWithJoins = (listing: Database["public"]["Tables"]["listings"]["Row"] & Partial<ListingWithJoins>): ListingWithJoins => {
  const profiles = listing.profiles ?? null;
  return {
    ...listing,
    listing_images: listing.listing_images ?? [],
    profiles,
    ownerIsPro: listing.ownerIsPro ?? false,
    ownerParticipantType: listing.ownerParticipantType !== undefined
      ? listing.ownerParticipantType
      : getOwnerParticipantType(profiles),
  } as ListingWithJoins;
};

type ListingOwnerContext = Pick<ListingWithJoins, "profiles" | "ownerParticipantType">;

const EMPTY_OWNER_CONTEXT: ListingOwnerContext = {
  profiles: null,
  ownerParticipantType: null,
};

const fetchListingOwnerContext = async (
  ownerId: string | null,
  signal?: AbortSignal,
  includeRole = true,
): Promise<ListingOwnerContext> => { // skipcq: JS-R1005 - Owner context fetch handles nullable owner ids and fallback profile state.
  if (!ownerId) return EMPTY_OWNER_CONTEXT;

  try {
    const query = includeRole
      ? supabase
          .from("profiles_public")
          .select("user_id, display_name, avatar_url, role")
          .eq("user_id", ownerId)
          .maybeSingle()
      : supabase
          .from("profiles_public")
          .select("user_id, display_name, avatar_url")
          .eq("user_id", ownerId)
          .maybeSingle();
    const { data: profilePublic } = await withAbortSignal(query, signal);
    const profiles = (profilePublic ?? null) as ListingWithJoins["profiles"];
    return {
      profiles,
      ownerParticipantType: includeRole && profiles
        ? getOwnerParticipantType(profiles as { role?: string; bio?: string | null })
        : null,
    };
  } catch (_err: unknown) {
    return EMPTY_OWNER_CONTEXT;
  }
};

type PublicListingResponse = {
  data: (Database["public"]["Tables"]["listings"]["Row"] & Partial<ListingWithJoins>) | null;
};

const fetchPublicListingFromSupabase = async (id: string, signal?: AbortSignal): Promise<ListingWithJoins | null> => {
  const { data, error } = await withAbortSignal(supabase
    .from("listings")
    .select(LISTING_DETAIL_SELECT)
    .eq("id", id)
    .eq("status", "active")
    .eq("is_off_market", false)
    .order("sort_order", { referencedTable: "listing_images", ascending: true })
    .maybeSingle(), signal);

  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as Database["public"]["Tables"]["listings"]["Row"] & Partial<ListingWithJoins>;
  const { profiles, ownerParticipantType } = await fetchListingOwnerContext(row.owner_id, signal, false);
  return normalizeListingWithJoins({ ...row, profiles, ownerParticipantType });
};

const fetchListingById = async (
  id: string,
  options: { publicScope?: boolean } = {},
  signal?: AbortSignal,
): Promise<ListingWithJoins | null> => {
  if (options.publicScope) {
    try {
      const response = await fetchPublicApi<PublicListingResponse>(
        `/api/public/listing?id=${encodeURIComponent(id)}`,
        { throwOnError: true, signal },
      );
      return response?.data ? normalizeListingWithJoins(response.data) : null;
    } catch (error) {
      if (isPublicApiAbort(error)) throw error;
      logger.warn("Public listing API failed; falling back to constrained Supabase detail read:", error);
      return fetchPublicListingFromSupabase(id, signal);
    }
  }

  const { data, error } = await withAbortSignal(supabase
    .from("listings")
    .select(`
      *,
      listing_images(url, sort_order)
    `)
    .eq("id", id)
    .maybeSingle(), signal);

  // PGRST116 (no rows) now handled by maybeSingle() — only real errors thrown
  if (error) throw error;
  if (!data) return null;

  const { profiles, ownerParticipantType } = await fetchListingOwnerContext(data.owner_id, signal);
  return normalizeListingWithJoins({ ...data, profiles, ownerParticipantType });
};

export const useListing = (id: string, options: UseListingOptions = {}) => {
  return useQuery({
    queryKey: ["listing", id, { publicScope: Boolean(options.publicScope) }],
    queryFn: ({ signal }) => fetchListingById(id, { publicScope: options.publicScope }, signal),
    enabled: Boolean(id),
    placeholderData: options.initialData ? normalizeListingWithJoins(options.initialData) : undefined,
    staleTime: CATALOG_STATIC_QUERY_STALE_TIME,
  });
};

type UseOwnerProStatusOptions = {
  enabled?: boolean;
  initialData?: boolean;
};

export const useOwnerProStatus = (
  listingId?: string,
  ownerId?: string | null,
  options: UseOwnerProStatusOptions = {},
) => {
  const hasListingId = Boolean(listingId);
  const hasOwnerId = Boolean(ownerId);
  const enabled = (options.enabled ?? true) && hasListingId && hasOwnerId;

  return useQuery({
    queryKey: ["owner-pro-status", listingId, ownerId],
    queryFn: async () => {
      if (!hasListingId || !hasOwnerId) return false;
      const { data, error } = await supabase.functions.invoke("owner-pro-status", {
        body: { listingId },
      });
      if (error) throw error;
      return (data as { isPro?: boolean } | null)?.isPro === true;
    },
    enabled,
    initialData: options.initialData,
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
};

/**
 * Tracks a listing view — call from the detail page component, not inside a queryFn.
 * Deduplicates within the same browser session so refetches don't double-count.
 * Uses an Edge Function wrapper so public page views do not require browser
 * execute grants on SECURITY DEFINER database functions.
 */
export const useTrackListingView = () => {
  return useMutation({
    mutationFn: async (listingId: string) => {
      const parsedListingId = parseMutationInput(listingIdSchema, listingId, "listing id");
      const viewTtlMs = 6 * 60 * 60 * 1000;
      const storageKey = `maiprop_viewed_${parsedListingId}`;
      const now = Date.now();
      const lastTracked = Number(localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey) ?? "0");
      if (Number.isFinite(lastTracked) && now - lastTracked < viewTtlMs) return;

      localStorage.setItem(storageKey, String(now));
      sessionStorage.setItem(storageKey, String(now));

      const sampleRate = Number(import.meta.env.VITE_VIEW_TRACKING_SAMPLE_RATE ?? "1");
      if (Number.isFinite(sampleRate) && sampleRate >= 0 && sampleRate < 1 && Math.random() > sampleRate) return;

      await supabase.functions.invoke("record-listing-view", {
        body: { listingId: parsedListingId },
      }).catch((e: unknown) => logger.warn("View tracking failed:", e));
    },
  });
};

export const useCreateListing = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (listing: {
      title: string; city: string; price: number; sqm: number;
      property_type: string; listing_type: string; description?: string;
      address?: string; bedrooms?: number; bathrooms?: number;
      cover_image_url?: string; tags?: string[];
      latitude?: number; longitude?: number;
      auction_date?: string; auction_starting_bid?: number;
    }) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(listingWriteSchema, {
        ...listing,
        owner_id: user.id,
        status: "active" as Enums<"listing_status">,
        listing_type: listing.listing_type as TablesInsert<"listings">["listing_type"],
        property_type: listing.property_type as TablesInsert<"listings">["property_type"],
      }, "listing") as TablesInsert<"listings">;
      const { data, error } = await supabase.from("listings").insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Listing published successfully!");
    },
    onError: (err: Error) => {
      const msg = getPlanLimitErrorMessage(err);
      toast.error(msg ?? err.message);
    },
  });
};

export const useUpdateListing = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: TablesUpdate<"listings"> }) => {
      if (!user) throw new Error("Must be logged in");
      const payload = parseMutationInput(listingUpdateMutationSchema, { id, updates }, "listing update");
      const { data, error } = await supabase
        .from("listings")
        .update(payload.updates as TablesUpdate<"listings">)
        .eq("id", payload.id)
        .eq("owner_id", user.id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (_, { id }) => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
      queryClient.invalidateQueries({ queryKey: ["listing", id] });
      toast.success("Listing updated!");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

export const useDeleteListing = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: async (id: string) => {
      if (!user) throw new Error("Must be logged in");
      const listingId = parseMutationInput(listingIdSchema, id, "listing id");
      const { error } = await supabase.from("listings").delete().eq("id", listingId).eq("owner_id", user.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["listings"] });
      queryClient.invalidateQueries({ queryKey: ["listings-paginated"] });
      toast.success("Listing deleted.");
    },
    onError: (err: Error) => toast.error(err.message),
  });
};

/** Shorthand: returns all listings owned by the currently logged-in user. */
export const useMyListings = () => {
  const { user } = useAuth();
  return useListings({ owner_id: user?.id });
};
