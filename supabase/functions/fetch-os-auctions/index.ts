/**
 * fetch-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Live proxy to POST /api/v1/auctions/filter/details on the maiProp OS API.
 * Used by the Auctions page to show real-time data without waiting for the
 * poll-os-auctions background sync to run.
 *
 * Plan caps (enforced server-side):
 *   - anonymous / free : 60 auctions
 *   - authenticated    : 600 auctions
 *   - platform admin   : unlimited
 *
 * Required Supabase secrets (shared with poll-os-auctions):
 *   MAIPROP_OS_URL      e.g. https://app.os.maiprop.co
 *   MAIPROP_OS_EMAIL
 *   MAIPROP_OS_PASSWORD
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const log = createLogger("fetch-os-auctions");
const limiter = makeRateLimiter({ bucket: "fetch-os-auctions", maxRequests: 20, windowMs: 60_000 });

const FREE_CAP = 60;
const AUTH_CAP = 600;
type SupabaseAdminClient = ReturnType<typeof createClient<Record<string, unknown>>>;

// ── Category mapping (mirrors poll-os-auctions) ─────────────────────────────

const CATEGORY_MAP: Record<string, string> = {
  RESIDENCE: "apartment",
  APARTMENT: "apartment",
  HOUSE: "house",
  VILLA: "villa",
  LAND: "land",
  PLOT: "land",
  PLOT_WITH_BUILDING: "land",
  LAND_WITH_BUILDING: "land",
  COMMERCIAL: "commercial",
  OFFICE: "office",
  STORE: "commercial",
  WAREHOUSE: "commercial",
  INDUSTRIAL: "commercial",
  STOREROOM: "commercial",
  PARKING: "commercial",
  HOTEL: "commercial",
  OTHER_BUSINESS_SPACE: "commercial",
};

const LAND_TYPE_TAG: Record<string, string> = {
  LAND: "land",
  PLOT: "plot",
  PLOT_WITH_BUILDING: "plot_with_building",
  LAND_WITH_BUILDING: "land_with_building",
};

const COMMERCIAL_TYPE_TAG: Record<string, string> = {
  STORE: "store",
  WAREHOUSE: "warehouse",
  INDUSTRIAL: "industrial",
  STOREROOM: "storeroom",
  PARKING: "parking",
  HOTEL: "hotel",
  OFFICE: "office",
  OTHER_BUSINESS_SPACE: "other_business_space",
  COMMERCIAL: "other_business_space",
};

const CATEGORY_GR: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house: "Κατοικία",
  villa: "Βίλα",
  land: "Γη / Οικόπεδο",
  commercial: "Επαγγελματικός Χώρος",
  office: "Γραφείο",
};

const OWNERSHIP_STATUS_TAGS: Record<string, string> = {
  FULL: "ownership:full",
  COMPLETE: "ownership:full",
  FULL_OWNERSHIP: "ownership:full",
  BARE: "ownership:bare",
  BARE_OWNERSHIP: "ownership:bare",
  COMMON: "ownership:common",
  JOINT: "ownership:common",
  SHARED: "ownership:common",
  CO_OWNERSHIP: "ownership:common",
  USUFRUCT: "ownership:usufruct",
  PSILI_KYPHIOTITA: "ownership:usufruct",
  VERTICAL: "ownership:vertical",
  VERTICAL_OWNERSHIP: "ownership:vertical",
  HORIZONTAL: "ownership:horizontal",
  HORIZONTAL_OWNERSHIP: "ownership:horizontal",
};

const mapCategory = (category?: string): string => {
  if (!category) return "apartment";
  return CATEGORY_MAP[category.toUpperCase()] ?? "apartment";
};

const getSubtypeTag = (category?: string): string | null => {
  if (!category) return null;
  const categoryKey = category.toUpperCase();
  if (LAND_TYPE_TAG[categoryKey]) return `land_type:${LAND_TYPE_TAG[categoryKey]}`;
  if (COMMERCIAL_TYPE_TAG[categoryKey]) return `commercial_type:${COMMERCIAL_TYPE_TAG[categoryKey]}`;
  return null;
};

const mapOwnershipStatusToTag = (raw?: string | null): string | null => {
  if (!raw) return null;
  const ownershipStatus = raw.toUpperCase().trim();
  return OWNERSHIP_STATUS_TAGS[ownershipStatus] ?? `ownership:${ownershipStatus.toLowerCase()}`;
};

// ── OS DTO type (same subset as poll-os-auctions) ───────────────────────────

type OsAuction = {
  auctionListingId?: string | number;
  propertyCategory?: string;
  propertyMunicipalityName?: string;
  propertyPrefectureName?: string;
  propertyAddress?: string;
  propertyPostalCode?: string;
  propertyLatitude?: number | string;
  propertyLongitude?: number | string;
  propertySquareMeters?: number | string;
  propertyFloor?: number | string;
  propertyFullKaek?: string;
  numberOfFloors?: number | string;
  constructionYear?: number | string;
  pricePerSquareMeter?: number | string;
  firstPriceOffer?: number | string;
  auctionDate?: string;
  auctionStatus?: string;
  currentRound?: number | string;
  ownershipStatus?: string;
  ownershipPercentage?: number | string;
  url?: string;
  auctionUrl?: string;
  listingUrl?: string;
  eAuctionUrl?: string;
};

// Shape returned to the frontend — matches AuctionListingRow in useAuctionListings
type MappedAuction = {
  id: string;
  title: string;
  city: string;
  address: string | null;
  price: number;
  auction_starting_bid: number;
  auction_date: string | null;
  auction_court: string | null;
  property_type: string;
  cover_image_url: string | null;
  sqm: number;
  bedrooms: null;
  bathrooms: null;
  latitude: number | null;
  longitude: number | null;
  tags: string[];
  year_built: number | null;
  construction_status: null;
  website_url: string | null;
  region: string | null;
  is_featured: false;
  priority_placement: 0;
};

type OsResponse = {
  data?: OsAuction[];
  responseMetadata?: { pagination?: { totalElements?: number } };
};

type OsConfig = {
  url: string;
  email: string;
  password: string;
};

type SupabaseConfig = {
  url: string;
  serviceRoleKey: string;
};

type OsApiFailure = {
  kind: "os-api";
  status: number;
  detail: string;
};

const OPTIONAL_FILTER_KEYS = [
  "auctionDateTo",
  "propertyCategories",
  "prefectureId",
  "propertyMunicipalityId",
  "auctionStatuses",
  "boundingBox",
] as const;

const buildTitle = (a: OsAuction): string => {
  const catKey = mapCategory(a.propertyCategory);
  const catGr = CATEGORY_GR[catKey] ?? "Ακίνητο";
  const city = a.propertyMunicipalityName ?? "Ελλάδα";
  const price = Number(a.firstPriceOffer ?? 0);
  const priceStr = price > 0 ? ` – €${price.toLocaleString("el-GR")}` : "";
  return `Πλειστηριασμός ${catGr} | ${city}${priceStr}`;
};

const mapAuction = (a: OsAuction): MappedAuction => {
  const osId = String(a.auctionListingId ?? "unknown");
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(a.propertyCategory);
  const price = Number(a.firstPriceOffer ?? 0);

  const auctionUrl: string | null =
    a.url ?? a.auctionUrl ?? a.listingUrl ?? a.eAuctionUrl ?? null;

  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const lat = a.propertyLatitude != null ? Number(a.propertyLatitude) : null;
  const lng = a.propertyLongitude != null ? Number(a.propertyLongitude) : null;
  const streetViewUrl =
    supabaseUrl && lat != null && lng != null
      ? `${supabaseUrl}/functions/v1/streetview-proxy?size=800x450&lat=${lat}&lng=${lng}`
      : null;

  const ownershipPct =
    a.ownershipPercentage != null ? Number(a.ownershipPercentage) : undefined;
  let ownershipTag: string | null = mapOwnershipStatusToTag(a.ownershipStatus);
  if (!ownershipTag && ownershipPct != null) {
    ownershipTag = ownershipPct >= 100 ? "ownership:full" : "ownership:common";
  }
  const subtypeTag = getSubtypeTag(a.propertyCategory);

  return {
    id: osId,
    title: buildTitle(a),
    city: a.propertyMunicipalityName ?? "Ελλάδα",
    address: a.propertyAddress ?? null,
    price,
    auction_starting_bid: price,
    auction_date: a.auctionDate ?? null,
    auction_court: a.auctionStatus ?? null,
    property_type: catKey,
    cover_image_url: streetViewUrl,
    sqm: a.propertySquareMeters != null ? Number(a.propertySquareMeters) : 1,
    bedrooms: null,
    bathrooms: null,
    latitude: lat,
    longitude: lng,
    tags: [
      tagKey,
      "source:maiprop-os",
      `auction_status:${a.auctionStatus ?? "scheduled"}`,
      ...(a.currentRound != null ? [`round:${a.currentRound}`] : []),
      ...(ownershipTag ? [ownershipTag] : []),
      ...(ownershipPct != null ? [`ownership_pct:${ownershipPct}`] : []),
      ...(subtypeTag ? [subtypeTag] : []),
    ],
    year_built: a.constructionYear != null ? Number(a.constructionYear) : null,
    construction_status: null,
    website_url: auctionUrl,
    region: a.propertyPrefectureName ?? null,
    is_featured: false,
    priority_placement: 0,
  };
};

// ── Helpers ──────────────────────────────────────────────────────────────────

const fetchWithTimeout = async (
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
};

const getOsToken = async (baseUrl: string, email: string, password: string): Promise<string> => {
  const res = await fetchWithTimeout(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    15_000,
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) throw new Error(`OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  return token;
};

/** Determine plan cap from the request's JWT. Returns FREE_CAP if unauthenticated. */
const getPlanCap = async (
  req: Request,
  sb: SupabaseAdminClient,
): Promise<number> => {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return FREE_CAP;

  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return FREE_CAP;

  const { data: profileRow } = await sb
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();
  const profile = profileRow as { role?: string } | null;

  if (profile?.role === "admin") return Infinity;
  return AUTH_CAP;
};

const jsonResponse = (
  payload: unknown,
  corsHeaders: Record<string, string>,
  status?: number,
): Response => {
  const init: ResponseInit = {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  };
  if (status !== undefined) init.status = status;
  return new Response(JSON.stringify(payload), init);
};

const getOsConfig = (): OsConfig | null => {
  const url = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const email = Deno.env.get("MAIPROP_OS_EMAIL");
  const password = Deno.env.get("MAIPROP_OS_PASSWORD");
  return url && email && password ? { url, email, password } : null;
};

const getSupabaseConfig = (): SupabaseConfig | null => {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
};

const parseRequestBody = async (req: Request): Promise<Record<string, unknown>> => {
  const body = await req.json().catch(() => ({}));
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
};

const getPageRequest = (
  body: Record<string, unknown>,
  planCap: number,
): { page: number; size: number } => {
  const requestedSize = Number(body.pageSize ?? body.size ?? (planCap === Infinity ? AUTH_CAP : planCap));
  const size = planCap === Infinity ? requestedSize : Math.min(requestedSize, planCap);
  return { page: Number(body.page ?? 0), size };
};

const buildFilterRequest = (body: Record<string, unknown>): Record<string, unknown> => {
  const today = new Date().toISOString().split("T")[0];
  const filterRequest: Record<string, unknown> = {
    auctionDateFrom: body.auctionDateFrom ?? today,
  };

  for (const key of OPTIONAL_FILTER_KEYS) {
    const value = body[key];
    if (value) filterRequest[key] = value;
  }

  if (body.auctionAmountFrom != null) filterRequest.auctionAmountFrom = body.auctionAmountFrom;
  if (body.auctionAmountTo != null) filterRequest.auctionAmountTo = body.auctionAmountTo;
  return filterRequest;
};

const fetchOsAuctionDetails = async (
  osConfig: OsConfig,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<OsResponse | OsAuction[]> => {
  log.info("authenticating with OS API");
  const token = await getOsToken(osConfig.url, osConfig.email, osConfig.password);

  const endpoint = `${osConfig.url}/api/v1/auctions/filter/details?page=${page}&pageSize=${size}`;
  log.info("fetching auctions", { page, size, filter: filterRequest });

  const auctionResponse = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filterRequest),
    },
    20_000,
  );

  if (!auctionResponse.ok) {
    const detail = (await auctionResponse.text()).slice(0, 300);
    log.error("OS API error", { status: auctionResponse.status, detail });
    throw { kind: "os-api", status: auctionResponse.status, detail } satisfies OsApiFailure;
  }

  return (await auctionResponse.json()) as OsResponse | OsAuction[];
};

const parseOsResponse = (
  json: OsResponse | OsAuction[],
): { auctions: OsAuction[]; total: number } => {
  const auctions = Array.isArray(json)
    ? json
    : Array.isArray(json.data)
    ? json.data
    : [];
  const total = Array.isArray(json)
    ? auctions.length
    : (json.responseMetadata?.pagination?.totalElements ?? auctions.length);
  return { auctions, total };
};

const isOsApiFailure = (err: unknown): err is OsApiFailure =>
  typeof err === "object" &&
  err !== null &&
  "kind" in err &&
  (err as { kind?: unknown }).kind === "os-api";

// ── Main handler ─────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  const preflight = handleCors(req);
  if (preflight) return preflight;

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const osConfig = getOsConfig();
  if (!osConfig) return jsonResponse({ error: "OS credentials not configured" }, corsHeaders, 503);

  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) return jsonResponse({ error: "Supabase credentials not configured" }, corsHeaders, 503);

  const sb = createClient(supabaseConfig.url, supabaseConfig.serviceRoleKey);

  try {
    const body = await parseRequestBody(req);
    const planCap = await getPlanCap(req, sb);

    const { page, size } = getPageRequest(body, planCap);

    // Build AuctionFilterRequest — only future auctions by default
    const filterRequest = buildFilterRequest(body);

    const osResponse = await fetchOsAuctionDetails(osConfig, page, size, filterRequest);
    const { auctions, total } = parseOsResponse(osResponse);

    const mapped = auctions.map(mapAuction);

    log.info("returning auctions", { count: mapped.length, total, page });

    return jsonResponse(
      {
        data: mapped,
        total,
        page,
        planCap: planCap === Infinity ? null : planCap,
      },
      corsHeaders,
    );
  } catch (err: unknown) {
    if (isOsApiFailure(err)) {
      return jsonResponse({ error: `OS returned ${err.status}`, detail: err.detail }, corsHeaders, 502);
    }

    const message = err instanceof Error ? err.message : String(err);
    log.error("fetch error", { err: message });
    return jsonResponse({ error: message }, corsHeaders, 500);
  }
});
