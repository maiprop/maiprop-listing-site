import { useQuery, useInfiniteQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Enums } from "@/integrations/supabase/types";
import { useAuth } from "@/contexts/AuthContext";
import { getOwnerParticipantType } from "@/lib/participantConfig";
import { CATALOG_STATIC_QUERY_STALE_TIME, USER_SCOPED_QUERY_STALE_TIME } from "@/lib/queryCachePolicy";
import { fetchPublicApi } from "@/lib/publicApi";
import { getListingLocationSearchTokenGroups } from "@/lib/location/locationSearchSemantics";
import { readInitialListingsPage } from "@/lib/homepageSnapshotCache";
import type { NewBuildProject } from "@/lib/newBuildProjectDetail";
import { getInitialListingsPlaceholder } from "@/hooks/listingsInitialPlaceholder";

export {
  useCreateListing,
  useDeleteListing,
  useTrackListingView,
  useUpdateListing,
} from "@/hooks/useListingMutations";

/**
 * Minimal shape we need from a listings row to enrich it with profiles. The
 * runtime rows come from `buildListingsQuery` which selects `*, listing_images(...)`,
 * so they are at minimum a `listings` row but we only ever read `owner_id`
 * during enrichment.
 */
type ListingRowWithOwner = Database["public"]["Tables"]["listings"]["Row"] & {
  listing_images?: { url: string; sort_order: number }[];
};

const PROJECT_UNIT_CARD_SELECT = ["id", "availability_status", "internal_sqm"].join(",");
const LISTING_PROJECT_CARD_SELECT = [
  "name",
  "delivery_date",
  `project_units!project_units_project_id_fkey(${PROJECT_UNIT_CARD_SELECT})`,
].join(",");
const LISTING_CARD_SCALAR_COLUMNS = [
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
];
const LISTING_CARD_SELECT = [
  ...LISTING_CARD_SCALAR_COLUMNS,
  `project:projects!listings_project_id_fkey(${LISTING_PROJECT_CARD_SELECT})`,
].join(",");

const LISTING_MANAGEMENT_CARD_SELECT = `${LISTING_CARD_SELECT}, listing_images`;
const PUBLIC_LISTING_CARD_SELECT = [...LISTING_CARD_SCALAR_COLUMNS, "project", "listing_images"].join(",");
/** Paginated listings for grid view — loads the first visible cards fast, then fills the 40-card window. */
export const PAGE_SIZE = 40;
export const INITIAL_GRID_PAGE_SIZE = 12;
const DEFAULT_LOCATION_RADIUS_M = 750;
const MAX_LOCATION_RADIUS_M = 5_000;
const METERS_PER_LATITUDE_DEGREE = 111_320;

const CATALOG_TYPES_WITH_NEW_BUILD: Partial<Record<Enums<"listing_type">, Enums<"listing_type">[]>> = {
  sale: ["sale", "new_build"],
};

/**
 * A listings row augmented with joined tables and computed fields added by useListing().
 * Using this type eliminates type casting in consuming components.
 */
export type ListingWithJoins = Database["public"]["Tables"]["listings"]["Row"] & {
  /** Immutable catalogue publication that produced this public row. */
  publicationId?: number;
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
  /** Public project detail attached to canonical new-build publications. */
  project?: NewBuildProject | null;
  projects?: NewBuildProject | null;
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
  boundsWest?: number;
  boundsSouth?: number;
  boundsEast?: number;
  boundsNorth?: number;
  listing_type?: string;
  property_type?: string;
  status?: string;
  owner_id?: string;
  personalOnly?: boolean;
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
  has_video_tour?: boolean;
  has_virtual_tour?: boolean;
  ai_score_min?: number;
  walkability_min?: number;
  features?: string[];
  sort?: "relevant" | "featured" | "newest" | "price-asc" | "price-desc" | "ai-score" | "views";
};

type ListingsQueryScope = {
  publicScope?: boolean;
  manageableScope?: boolean;
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
  const managementScoped = (Boolean(filters?.owner_id) || Boolean(scope.manageableScope)) && !scope.publicScope;
  const publicQuery = supabase
    .rpc("get_public_listing_catalogue")
    .select(PUBLIC_LISTING_CARD_SELECT);
  let query = publicQuery;
  if (managementScoped) {
    const ownerQuery = supabase
      .rpc(
        scope.manageableScope
          ? "get_manageable_listing_catalogue"
          : "get_listing_management_catalogue",
      )
      .select(LISTING_MANAGEMENT_CARD_SELECT);
    query = ownerQuery as unknown as typeof publicQuery;
  }

  // Paid placement requires expiry-aware fair mixing, which is implemented by
  // the public catalogue API. This constrained fallback remains organic rather
  // than ranking stale projection flags during an API outage.
  if (sort === "featured") {
    query = query.order("created_at", { ascending: false });
  } else {
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
  } else if (!managementScoped && !filters?.includeAuctions) {
    query = query.in("listing_type", ["sale", "rent", "firesale", "new_build"] as Enums<"listing_type">[]);
  }
  if (filters?.property_type) query = query.eq("property_type", filters.property_type as Enums<"property_type">);
  if (filters?.owner_id) query = query.eq("owner_id", filters.owner_id);
  if (filters?.personalOnly) query = query.is("organization_id", null);
  // Always apply status filter; for owner queries don't default to 'active' so all own listings show
  if (managementScoped) {
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
  if (filters?.has_video_tour) query = query.eq("has_video_tour", true);
  if (filters?.has_virtual_tour) query = query.eq("has_virtual_tour", true);
  if (filters?.ai_score_min != null) query = query.gte("ai_score", filters.ai_score_min);
  if (filters?.walkability_min != null) query = query.gte("walkability_score", filters.walkability_min);
  if (filters?.is_pre_sale === true && !filters?.listing_type) {
    query = query.eq("listing_type", "new_build" as Enums<"listing_type">);
  }
  if (managementScoped && filters?.is_off_market === true) query = query.eq("is_off_market", true);
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
  data: (Database["public"]["Tables"]["listings"]["Row"] & Partial<ListingWithJoins>)[];
  hasMore: boolean;
  nextCursor?: string | null;
  page: number;
  pageSize: number;
  offset?: number;
  publicationId?: number;
};

type ListingsPageParam = {
  page: number;
  pageSize: number;
  cursor?: string;
  offset?: number;
};

type ListingsPageResponse = Omit<PublicListingsResponse, "data"> & {
  data: ListingWithJoins[];
};

const INITIAL_LISTINGS_PAGE_PARAM: ListingsPageParam = {
  page: 1,
  pageSize: INITIAL_GRID_PAGE_SIZE,
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
    const cursor = typeof param.cursor === "string" && param.cursor.length <= 2_048
      ? param.cursor
      : undefined;
    return { page, pageSize, cursor, offset };
  }
  return INITIAL_LISTINGS_PAGE_PARAM;
}

function shouldUsePublicListingsApi(filters?: ListingsFilters): boolean {
  if (filters?.owner_id) return false;
  if (filters?.status && filters.status !== "active") return false;
  return true;
}

function publicListingsPath(
  filters: ListingsFilters | undefined,
  page: number,
  pageSize: number,
  cursor?: string,
  offset?: number,
): string {
  const params = new URLSearchParams();
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  if (cursor) params.set("cursor", cursor);
  else if (offset != null && offset > 0) params.set("offset", String(offset));

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
  append("boundsWest");
  append("boundsSouth");
  append("boundsEast");
  append("boundsNorth");
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
  append("has_video_tour");
  append("has_virtual_tour");
  append("ai_score_min");
  append("walkability_min");
  append("features");
  append("sort");

  return `/api/public/listings?${params.toString()}`;
}

type UseListingsOptions = {
  enabled?: boolean;
  publicScope?: boolean;
  manageableScope?: boolean;
};

const fetchListingsPageFromSupabase = async (
  filters?: ListingsFilters,
  page = 1,
  pageSize = PAGE_SIZE,
  options: UseListingsOptions = {},
  signal?: AbortSignal,
  offset?: number,
): Promise<ListingsPageResponse> => { // skipcq: JS-R1005 - Page fetch keeps listing rows and owner profile enrichment together.
  const from = offset ?? (page - 1) * pageSize;
  const { data, error } = await withAbortSignal(
    buildListingsQuery(filters, from, pageSize, {
      publicScope: options.publicScope,
      manageableScope: options.manageableScope,
    }),
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

  const enriched = typedRows.map((r) => normalizeListingWithJoins({
    ...r,
    profiles: r.owner_id ? profileMap.get(r.owner_id) ?? null : null,
  }));

  // ORDER BY is applied server-side in buildListingsQuery; no client sort needed.
  return {
    data: enriched,
    hasMore: rows.length === pageSize,
    nextCursor: null,
    page,
    pageSize,
    offset: from,
  };
};

const fetchListingsPage = async (
  filters?: ListingsFilters,
  page = 1,
  pageSize = PAGE_SIZE,
  options: UseListingsOptions = {},
  signal?: AbortSignal,
  offset?: number,
  cursor?: string,
): Promise<ListingsPageResponse> => { // skipcq: JS-R1005 - Page fetch keeps listing rows and owner profile enrichment together.
  if (!options.manageableScope && shouldUsePublicListingsApi(filters)) {
    const cached = await fetchPublicApi<PublicListingsResponse>(
      publicListingsPath(filters, page, pageSize, cursor, offset),
      { throwOnError: true, signal },
    );
    if (!cached) throw new Error("Public listings API returned no data");
    return { ...cached, data: cached.data.map(normalizeListingWithJoins) };
  }

  return fetchListingsPageFromSupabase(filters, page, pageSize, options, signal, offset);
};

export const useListingsPaginated = (
  filters?: ListingsFilters,
  options?: UseListingsOptions,
) => {
  const placeholderData = getInitialListingsPlaceholder({
    filters,
    initialGridPageSize: INITIAL_GRID_PAGE_SIZE,
    initialPageParam: INITIAL_LISTINGS_PAGE_PARAM,
    normalizeListing: normalizeListingWithJoins,
    readInitialListingsPage,
  });
  return useInfiniteQuery({
    queryKey: [
      "listings-paginated",
      filters,
      {
        publicScope: Boolean(options?.publicScope),
        manageableScope: Boolean(options?.manageableScope),
      },
    ],
    queryFn: ({ pageParam = INITIAL_LISTINGS_PAGE_PARAM, signal }) => {
      const { page, pageSize, cursor, offset } = normalizeListingsPageParam(pageParam);
      return fetchListingsPage(filters, page, pageSize, options, signal, offset, cursor);
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
        ...(typeof lastPage.nextCursor === "string" && lastPage.nextCursor
          ? { cursor: lastPage.nextCursor }
          : {}),
        offset: nextOffset,
      };
    },
    initialPageParam: INITIAL_LISTINGS_PAGE_PARAM,
    placeholderData,
    enabled: options?.enabled ?? true,
    staleTime:
      (filters?.owner_id || options?.manageableScope) && !options?.publicScope
        ? USER_SCOPED_QUERY_STALE_TIME
        : CATALOG_STATIC_QUERY_STALE_TIME,
  });
};

/** All listings for map/split view — single bounded fetch, max 200 rows. Set enabled: false to skip. */
export const MAP_FETCH_LIMIT = 200;

export const useListingsWindow = (
  filters?: ListingsFilters,
  options?: UseListingsOptions
) => {
  return useQuery({
    queryKey: [
      "listings",
      filters,
      {
        publicScope: Boolean(options?.publicScope),
        manageableScope: Boolean(options?.manageableScope),
      },
    ],
    enabled: options?.enabled ?? true,
    staleTime:
      (filters?.owner_id || options?.manageableScope) && !options?.publicScope
        ? USER_SCOPED_QUERY_STALE_TIME
        : CATALOG_STATIC_QUERY_STALE_TIME,
    queryFn: async ({ signal }) => { // skipcq: JS-R1005 - Owner profile enrichment keeps the map fetch result self-contained.
      const limit = filters?.limit ?? MAP_FETCH_LIMIT;
      if (!options?.manageableScope && shouldUsePublicListingsApi(filters)) {
        const cached = await fetchPublicApi<PublicListingsResponse>(
          publicListingsPath(filters, 1, limit),
          { throwOnError: true, signal },
        );
        if (!cached) throw new Error("Public listings API returned no data");
        return { ...cached, data: cached.data.map(normalizeListingWithJoins) };
      }

      return fetchListingsPageFromSupabase(filters, 1, limit, options, signal);
    },
  });
};

export const useListings = (
  filters?: ListingsFilters,
  options?: UseListingsOptions,
) => {
  const query = useListingsWindow(filters, options);
  return {
    ...query,
    data: query.data?.data,
  };
};

type ListingDetailSeed = Database["public"]["Tables"]["listings"]["Row"] &
  Omit<Partial<ListingWithJoins>, "listing_images"> & {
    listing_images?: ListingWithJoins["listing_images"] | null;
  };

type UseListingOptions = {
  initialData?: ListingDetailSeed | null;
  publicScope?: boolean;
  publicationId?: number;
};

function normalizeListingWithJoins(listing: ListingDetailSeed): ListingWithJoins {
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
}

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
  data: ListingDetailSeed | null;
};

const fetchListingById = async (
  id: string,
  options: { publicScope?: boolean; publicationId?: number } = {},
  signal?: AbortSignal,
): Promise<ListingWithJoins | null> => {
  if (options.publicScope) {
    const response = await fetchPublicApi<PublicListingResponse>(
      `/api/public/listing?id=${encodeURIComponent(id)}${
        options.publicationId != null
          ? `&publicationId=${encodeURIComponent(String(options.publicationId))}`
          : ""
      }`,
      { throwOnError: true, signal },
    );
    return response?.data ? normalizeListingWithJoins(response.data) : null;
  }

  const { data, error } = await withAbortSignal(supabase
    .rpc("get_listing_management_catalogue")
    .select("*")
    .eq("id", id)
    .maybeSingle(), signal);

  // PGRST116 (no rows) now handled by maybeSingle() — only real errors thrown
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as ListingDetailSeed;
  const { profiles, ownerParticipantType } = await fetchListingOwnerContext(row.owner_id, signal);
  return normalizeListingWithJoins({ ...row, profiles, ownerParticipantType });
};

export const useListing = (id: string, options: UseListingOptions = {}) => {
  return useQuery({
    queryKey: [
      "listing",
      id,
      {
        publicScope: Boolean(options.publicScope),
        publicationId: options.publicationId ?? null,
      },
    ],
    queryFn: ({ signal }) => fetchListingById(
      id,
      {
        publicScope: options.publicScope,
        publicationId: options.publicationId,
      },
      signal,
    ),
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

/** Personal inventory used for user-funded quota calculations. */
export const useActorOwnedListings = () => {
  const { user } = useAuth();
  return useListings(
    { owner_id: user?.id, personalOnly: true },
    { enabled: Boolean(user) },
  );
};

export const MANAGEABLE_LISTINGS_PAGE_SIZE = 50;

type ManageableListingCursor = {
  createdAt: string;
  id: string;
};

type ManageableListingsPage = {
  data: ListingWithJoins[];
  total: number;
  nextCursor: ManageableListingCursor | null;
};

export type ManageableListingSummary = {
  totalListings: number;
  activeListings: number;
  totalViews: number;
  averageViews: number;
  averageActiveDays: number;
  bestListing: {
    id: string;
    title: string;
    viewsCount: number;
  } | null;
};

const EMPTY_MANAGEABLE_LISTING_SUMMARY: ManageableListingSummary = {
  totalListings: 0,
  activeListings: 0,
  totalViews: 0,
  averageViews: 0,
  averageActiveDays: 0,
  bestListing: null,
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteNonNegativeNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
}

async function fetchManageableListingsPage(
  cursor: ManageableListingCursor | null,
  signal?: AbortSignal,
): Promise<ManageableListingsPage> {
  const args = {
    p_limit: MANAGEABLE_LISTINGS_PAGE_SIZE,
    ...(cursor
      ? {
          p_before_created_at: cursor.createdAt,
          p_before_id: cursor.id,
        }
      : {}),
  };
  const { data, error } = await withAbortSignal(
    supabase.rpc("get_manageable_listing_catalogue_page", args),
    signal,
  );
  if (error) throw error;

  const response = Array.isArray(data) ? data[0] : null;
  const rows = response && Array.isArray(response.data) ? response.data : [];
  const listings = rows
    .map(asRecord)
    .filter((row): row is Record<string, unknown> => row !== null)
    .map((row) => normalizeListingWithJoins(
      row as unknown as Database["public"]["Tables"]["listings"]["Row"] & Partial<ListingWithJoins>,
    ));
  const nextCursor =
    response?.next_created_at && response?.next_id
      ? { createdAt: response.next_created_at, id: response.next_id }
      : null;

  return {
    data: listings,
    total: finiteNonNegativeNumber(response?.total_count),
    nextCursor,
  };
}

/** Personal plus organization inventory the current actor can manage. */
export const useMyListings = () => {
  const { user } = useAuth();
  const query = useInfiniteQuery({
    queryKey: ["manageable-listings", user?.id],
    queryFn: ({ pageParam, signal }) =>
      fetchManageableListingsPage(pageParam, signal),
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    initialPageParam: null as ManageableListingCursor | null,
    enabled: Boolean(user),
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
  const pages = query.data?.pages ?? [];
  const listings = pages.flatMap((page) => page.data);

  return {
    ...query,
    data: listings,
    total: pages[0]?.total ?? 0,
    loadedCount: listings.length,
  };
};

export const useManageableListingSummary = () => {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["manageable-listing-summary", user?.id],
    queryFn: async (): Promise<ManageableListingSummary> => {
      const { data, error } = await supabase.rpc("get_manageable_listing_summary");
      if (error) throw error;

      const summary = asRecord(data);
      if (!summary) return EMPTY_MANAGEABLE_LISTING_SUMMARY;
      const best = asRecord(summary.bestListing);

      return {
        totalListings: finiteNonNegativeNumber(summary.totalListings),
        activeListings: finiteNonNegativeNumber(summary.activeListings),
        totalViews: finiteNonNegativeNumber(summary.totalViews),
        averageViews: finiteNonNegativeNumber(summary.averageViews),
        averageActiveDays: finiteNonNegativeNumber(summary.averageActiveDays),
        bestListing: best && typeof best.id === "string" && typeof best.title === "string"
          ? {
              id: best.id,
              title: best.title,
              viewsCount: finiteNonNegativeNumber(best.viewsCount),
            }
          : null,
      };
    },
    enabled: Boolean(user),
    staleTime: USER_SCOPED_QUERY_STALE_TIME,
  });
};
