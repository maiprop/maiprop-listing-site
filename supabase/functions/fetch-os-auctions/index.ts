/* global Deno:readonly */
/**
 * fetch-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Live proxy to POST /api/v1/auctions/filter/details on the maiProp OS API.
 * Used by the Auctions page to show real-time data without waiting for the
 * poll-os-auctions background sync to run.
 *
 * Portal caps (enforced server-side):
 *   - anonymous / free : 60 auctions
 *   - Pro/admin        : 600 auctions
 *
 * This function is a read-through proxy only. It does not write auction rows
 * into Supabase; the portal intentionally avoids mirroring the full OS
 * auction catalogue.
 *
 * Required Supabase secrets (shared with poll-os-auctions):
 *   MAIPROP_OS_URL      e.g. https://app.os.maiprop.co
 *   MAIPROP_OS_EMAIL
 *   MAIPROP_OS_PASSWORD
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const log = createLogger("fetch-os-auctions");
const limiter = makeRateLimiter({
  bucket: "fetch-os-auctions",
  maxRequests: 20,
  windowMs: 60_000,
  failClosed: true,
});

const FREE_CAP = 60;
const AUTH_CAP = 600;
const NATIONAL_SAMPLE_PAGE_COUNT = 3;
const NATIONAL_SAMPLE_SOURCE_PAGE_SIZE = 600;
const AUCTION_RESPONSE_CACHE_TTL_MS = 60_000;
const AUCTION_RESPONSE_CACHE_MAX_ENTRIES = 32;
const AUCTION_SAMPLE_SALT = "maiprop-auctions-national-v1";
const TRAILING_SLASH_RE = /\/$/;
const OS_ALLOWED_HOST_SUFFIX = ".maiprop.co";
type SupabaseAdminClient = ReturnType<
  typeof createClient<Record<string, unknown>>
>;
type ProfilePlanRow = {
  role?: string | null;
  participant_type?: string | null;
  subscription_product_id?: string | null;
  force_pro_access?: boolean | null;
};

type PricingConfigPlanRow = {
  key?: string | null;
  audience?: string | null;
  metadata?: {
    stripe_product_id?: string | null;
  } | null;
};

// ── Category mapping (mirrors poll-os-auctions) ─────────────────────────────

const CATEGORY_MAP = new Map<string, string>([
  ["RESIDENCE", "apartment"],
  ["APARTMENT", "apartment"],
  ["HOUSE", "house"],
  ["VILLA", "villa"],
  ["LAND", "land"],
  ["PLOT", "land"],
  ["PLOT_WITH_BUILDING", "land"],
  ["LAND_WITH_BUILDING", "land"],
  ["COMMERCIAL", "commercial"],
  ["OFFICE", "office"],
  ["STORE", "commercial"],
  ["WAREHOUSE", "commercial"],
  ["INDUSTRIAL", "commercial"],
  ["STOREROOM", "commercial"],
  ["PARKING", "commercial"],
  ["HOTEL", "commercial"],
  ["OTHER_BUSINESS_SPACE", "commercial"],
]);

const LAND_TYPE_TAG = new Map<string, string>([
  ["LAND", "land"],
  ["PLOT", "plot"],
  ["PLOT_WITH_BUILDING", "plot_with_building"],
  ["LAND_WITH_BUILDING", "land_with_building"],
]);

const COMMERCIAL_TYPE_TAG = new Map<string, string>([
  ["STORE", "store"],
  ["WAREHOUSE", "warehouse"],
  ["INDUSTRIAL", "industrial"],
  ["STOREROOM", "storeroom"],
  ["PARKING", "parking"],
  ["HOTEL", "hotel"],
  ["OFFICE", "office"],
  ["OTHER_BUSINESS_SPACE", "other_business_space"],
  ["COMMERCIAL", "other_business_space"],
]);

const CATEGORY_GR = new Map<string, string>([
  ["apartment", "Διαμέρισμα"],
  ["house", "Κατοικία"],
  ["villa", "Βίλα"],
  ["land", "Γη / Οικόπεδο"],
  ["commercial", "Επαγγελματικός Χώρος"],
  ["office", "Γραφείο"],
]);

const OWNERSHIP_STATUS_TAGS = new Map<string, string>([
  ["FULL", "ownership:full"],
  ["COMPLETE", "ownership:full"],
  ["FULL_OWNERSHIP", "ownership:full"],
  ["BARE", "ownership:bare"],
  ["BARE_OWNERSHIP", "ownership:bare"],
  ["COMMON", "ownership:common"],
  ["JOINT", "ownership:common"],
  ["SHARED", "ownership:common"],
  ["CO_OWNERSHIP", "ownership:common"],
  ["USUFRUCT", "ownership:usufruct"],
  ["PSILI_KYPHIOTITA", "ownership:usufruct"],
  ["VERTICAL", "ownership:vertical"],
  ["VERTICAL_OWNERSHIP", "ownership:vertical"],
  ["HORIZONTAL", "ownership:horizontal"],
  ["HORIZONTAL_OWNERSHIP", "ownership:horizontal"],
]);

function mapCategory(category?: string): string {
  if (!category) return "apartment";
  return CATEGORY_MAP.get(category.toUpperCase()) ?? "apartment";
}

function getSubtypeTag(category?: string): string | null {
  if (!category) return null;
  const categoryKey = category.toUpperCase();
  const landTag = LAND_TYPE_TAG.get(categoryKey);
  if (landTag) return `land_type:${landTag}`;
  const commercialTag = COMMERCIAL_TYPE_TAG.get(categoryKey);
  if (commercialTag) return `commercial_type:${commercialTag}`;
  return null;
}

function mapOwnershipStatusToTag(raw?: string | null): string | null {
  if (!raw) return null;
  const ownershipStatus = raw.toUpperCase().trim();
  return OWNERSHIP_STATUS_TAGS.get(ownershipStatus) ??
    `ownership:${ownershipStatus.toLowerCase()}`;
}

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

type RuntimeConfig = {
  osConfig: OsConfig;
  supabaseConfig: SupabaseConfig;
};

type OsApiFailure = {
  kind: "os-api";
  status: number;
  detail: string;
};

type AuctionResponsePayload = {
  data: MappedAuction[];
  total: number;
  page: number;
  planCap: number;
};

type AuctionCacheEntry = {
  expiresAt: number;
  payload: AuctionResponsePayload;
};

const OPTIONAL_FILTER_KEYS = [
  "auctionDateTo",
  "propertyCategories",
  "prefectureId",
  "propertyMunicipalityId",
  "auctionStatuses",
  "boundingBox",
] as const;

const AMOUNT_FILTER_KEYS = ["auctionAmountFrom", "auctionAmountTo"] as const;
const SORT_FILTER_KEYS = ["sortBy", "order"] as const;
const auctionResponseCache = new Map<string, AuctionCacheEntry>();

function buildTitle(a: OsAuction): string {
  const catKey = mapCategory(a.propertyCategory);
  const catGr = CATEGORY_GR.get(catKey) ?? "Ακίνητο";
  const city = a.propertyMunicipalityName ?? "Ελλάδα";
  const price = Number(a.firstPriceOffer ?? 0);
  const priceStr = price > 0 ? ` – €${price.toLocaleString("el-GR")}` : "";
  return `Πλειστηριασμός ${catGr} | ${city}${priceStr}`;
}

function getNullableText(value?: string | null): string | null {
  return value ?? null;
}

function getAuctionCity(auction: OsAuction): string {
  return auction.propertyMunicipalityName ?? "Ελλάδα";
}

function getAuctionUrl(auction: OsAuction): string | null {
  return auction.url ?? auction.auctionUrl ?? auction.listingUrl ??
    auction.eAuctionUrl ?? null;
}

function getNumberOrNull(value?: number | string): number | null {
  if (value == null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function getNumberOrDefault(
  value: number | string | undefined,
  fallback: number,
): number {
  if (value == null) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getStreetViewUrl(
  lat: number | null,
  lng: number | null,
): string | null {
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(
    TRAILING_SLASH_RE,
    "",
  );
  return supabaseUrl && lat != null && lng != null
    ? `${supabaseUrl}/functions/v1/streetview-proxy?size=800x450&lat=${lat}&lng=${lng}`
    : null;
}

function getOwnershipPercentage(auction: OsAuction): number | undefined {
  return getNumberOrNull(auction.ownershipPercentage) ?? undefined;
}

function getOwnershipTag(
  auction: OsAuction,
  ownershipPct: number | undefined,
): string | null {
  const ownershipTag = mapOwnershipStatusToTag(auction.ownershipStatus);
  if (ownershipTag) return ownershipTag;
  if (ownershipPct == null) return null;
  return ownershipPct >= 100 ? "ownership:full" : "ownership:common";
}

function getAuctionStatusTag(auction: OsAuction): string {
  return `auction_status:${auction.auctionStatus ?? "scheduled"}`;
}

function getCurrentRoundTag(auction: OsAuction): string | null {
  return auction.currentRound != null ? `round:${auction.currentRound}` : null;
}

function getOwnershipPercentageTag(
  ownershipPct: number | undefined,
): string | null {
  return ownershipPct != null ? `ownership_pct:${ownershipPct}` : null;
}

function isPresentTag(tag: string | null): tag is string {
  return tag != null;
}

function compactTags(tags: (string | null)[]): string[] {
  return tags.filter(isPresentTag);
}

function buildAuctionTags(
  requiredTags: string[],
  optionalTags: (string | null)[],
): string[] {
  return requiredTags.concat(compactTags(optionalTags));
}

function getSortedSerializableValue(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(getSortedSerializableValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b))
        .map((
          [key, nestedValue],
        ) => [key, getSortedSerializableValue(nestedValue)]),
    );
  }

  return value;
}

function stableJson(value: unknown): string {
  return JSON.stringify(getSortedSerializableValue(value));
}

export function getAuctionResponseCacheKey(
  page: number,
  size: number,
  planCap: number,
  sampleAcrossGreece: boolean,
  filterRequest: Record<string, unknown>,
): string {
  return stableJson({
    filterRequest,
    page,
    planCap,
    sampleAcrossGreece,
    size,
  });
}

function pruneAuctionResponseCache(now: number): void {
  for (const [key, entry] of auctionResponseCache) {
    if (entry.expiresAt <= now) auctionResponseCache.delete(key);
  }

  while (auctionResponseCache.size > AUCTION_RESPONSE_CACHE_MAX_ENTRIES) {
    const oldestKey = auctionResponseCache.keys().next().value;
    if (!oldestKey) return;
    auctionResponseCache.delete(oldestKey);
  }
}

export function clearAuctionResponseCache(): void {
  auctionResponseCache.clear();
}

export function readAuctionResponseCache(
  key: string,
  now = Date.now(),
): AuctionResponsePayload | null {
  const entry = auctionResponseCache.get(key);
  if (!entry) return null;
  if (entry.expiresAt <= now) {
    auctionResponseCache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeAuctionResponseCache(
  key: string,
  payload: AuctionResponsePayload,
  now = Date.now(),
): void {
  pruneAuctionResponseCache(now);
  auctionResponseCache.set(key, {
    expiresAt: now + AUCTION_RESPONSE_CACHE_TTL_MS,
    payload,
  });
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function getAuctionSamplingSeed(date = new Date()): string {
  return `${AUCTION_SAMPLE_SALT}:${date.toISOString().slice(0, 10)}`;
}

function getStableScore(seed: string, value: string): number {
  return hashString(`${seed}:${value}`);
}

export function getAuctionSamplePageNumbers(
  totalRows: number,
  sourcePageSize: number,
  samplePageCount: number,
  seed = getAuctionSamplingSeed(),
): number[] {
  const totalPages = Math.max(1, Math.ceil(totalRows / sourcePageSize));
  const desiredPages = Math.max(1, Math.min(samplePageCount, totalPages));
  const pages = new Set<number>();

  for (let i = 0; i < desiredPages; i += 1) {
    const bucketStart = Math.floor((i * totalPages) / desiredPages);
    const bucketEnd = Math.max(
      bucketStart,
      Math.floor(((i + 1) * totalPages) / desiredPages) - 1,
    );
    const bucketSize = Math.max(1, bucketEnd - bucketStart + 1);
    pages.add(bucketStart + (getStableScore(seed, `page:${i}`) % bucketSize));
  }

  return [...pages].sort((a, b) => a - b);
}

function getAuctionGroupKey(row: MappedAuction): string {
  return row.region || row.city || "Greece";
}

export function selectDiverseAuctionSample(
  rows: MappedAuction[],
  limit: number,
  seed = getAuctionSamplingSeed(),
): MappedAuction[] {
  const uniqueRows = new Map<string, MappedAuction>();
  for (const row of rows) uniqueRows.set(row.id, row);

  const groups = new Map<string, MappedAuction[]>();
  for (const row of uniqueRows.values()) {
    const key = getAuctionGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const orderedGroups = [...groups.entries()]
    .map(([key, groupRows]) =>
      [
        key,
        groupRows.sort((a, b) =>
          getStableScore(seed, a.id) - getStableScore(seed, b.id)
        ),
      ] as const
    )
    .sort((a, b) =>
      getStableScore(seed, `group:${a[0]}`) -
      getStableScore(seed, `group:${b[0]}`)
    );

  const selected: MappedAuction[] = [];
  let cursor = 0;
  while (
    selected.length < limit &&
    orderedGroups.some(([, group]) => cursor < group.length)
  ) {
    for (const [, group] of orderedGroups) {
      const row = group[cursor];
      if (row) selected.push(row);
      if (selected.length >= limit) break;
    }
    cursor += 1;
  }

  return selected;
}

export function mapAuction(auction: OsAuction): MappedAuction {
  const osId = String(auction.auctionListingId ?? "unknown");
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(auction.propertyCategory);
  const price = getNumberOrDefault(auction.firstPriceOffer, 0);
  const lat = getNumberOrNull(auction.propertyLatitude);
  const lng = getNumberOrNull(auction.propertyLongitude);
  const ownershipPct = getOwnershipPercentage(auction);
  const ownershipTag = getOwnershipTag(auction, ownershipPct);
  const subtypeTag = getSubtypeTag(auction.propertyCategory);
  const requiredTags = [
    tagKey,
    "source:maiprop-os",
    getAuctionStatusTag(auction),
  ];
  const optionalTags = [
    getCurrentRoundTag(auction),
    ownershipTag,
    getOwnershipPercentageTag(ownershipPct),
    subtypeTag,
  ];

  return {
    id: osId,
    title: buildTitle(auction),
    city: getAuctionCity(auction),
    address: getNullableText(auction.propertyAddress),
    price,
    auction_starting_bid: price,
    auction_date: getNullableText(auction.auctionDate),
    auction_court: null,
    property_type: catKey,
    cover_image_url: getStreetViewUrl(lat, lng),
    sqm: getNumberOrDefault(auction.propertySquareMeters, 1),
    bedrooms: null,
    bathrooms: null,
    latitude: lat,
    longitude: lng,
    tags: buildAuctionTags(requiredTags, optionalTags),
    year_built: getNumberOrNull(auction.constructionYear),
    construction_status: null,
    website_url: getAuctionUrl(auction),
    region: getNullableText(auction.propertyPrefectureName),
    is_featured: false,
    priority_placement: 0,
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(function abortRequest() {
    controller.abort();
  }, timeoutMs);
  try {
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-url
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOsToken(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
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
  if (!token) {
    throw new Error(
      `OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return token;
}

function isInvestorProfile(profile: ProfilePlanRow | null): boolean {
  return profile?.participant_type === "investor" ||
    profile?.participant_type === "institutional" ||
    profile?.role === "investor" ||
    profile?.role === "institutional";
}

async function hasInvestorSubscription(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("investor_subscriptions")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["active", "trial"])
    .limit(1)
    .maybeSingle();
  const sub = data as { status?: string } | null;
  return sub?.status === "active" || sub?.status === "trial";
}

function isOsAuctionEntitlement(row: PricingConfigPlanRow | null): boolean {
  if (!row?.key || !row?.audience) return false;
  return row.audience === "investor" || row.audience === "institutional" ||
    row.key === "investor_private" || row.key === "investor_institutional";
}

async function hasInvestorProductEntitlement(
  sb: SupabaseAdminClient,
  productId: string | null | undefined,
): Promise<boolean> {
  if (!productId) return false;
  const { data } = await sb
    .from("pricing_configs")
    .select("key, audience, metadata")
    .eq("metadata->>stripe_product_id", productId)
    .limit(1)
    .maybeSingle();
  return isOsAuctionEntitlement(data as PricingConfigPlanRow | null);
}

async function hasCanonicalProAccess(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean | null> {
  type RpcFn = (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const rpc = (sb as SupabaseAdminClient & { rpc?: RpcFn }).rpc;
  if (!rpc) return null;
  const { data, error } = await rpc("is_pro", { p_user_id: userId });
  if (error || typeof data !== "boolean") return null;
  return data;
}

export async function hasPortalProAccess(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const canonicalProAccess = await hasCanonicalProAccess(sb, userId);
  if (canonicalProAccess != null) return canonicalProAccess;

  const { data: profileRow } = await sb
    .from("profiles")
    .select("role, participant_type, subscription_product_id, force_pro_access")
    .eq("user_id", userId)
    .single();
  const profile = profileRow as ProfilePlanRow | null;

  if (profile?.role === "admin") return true;
  if (profile?.force_pro_access) return true;
  if (isInvestorProfile(profile)) {
    return await hasInvestorSubscription(sb, userId) ||
      await hasInvestorProductEntitlement(sb, profile?.subscription_product_id);
  }
  return false;
}

/** Determine portal cap from the request's JWT. Returns FREE_CAP if unauthenticated/free. */
async function getPlanCap(
  req: Request,
  sb: SupabaseAdminClient,
): Promise<number> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return FREE_CAP;

  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return FREE_CAP;

  return await hasPortalProAccess(sb, user.id) ? AUTH_CAP : FREE_CAP;
}

function jsonResponse(
  payload: unknown,
  corsHeaders: Record<string, string>,
  status?: number,
): Response {
  const init: ResponseInit = {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  };
  if (status !== undefined) init.status = status;
  return new Response(JSON.stringify(payload), init);
}

function isAllowedOsApiUrl(url: URL): boolean {
  return url.protocol === "https:" && (
    url.hostname === "app.os.maiprop.co" ||
    url.hostname.endsWith(OS_ALLOWED_HOST_SUFFIX)
  );
}

function normalizeOsUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!isAllowedOsApiUrl(url)) return null;
    return url.toString().replace(TRAILING_SLASH_RE, "");
  } catch {
    return null;
  }
}

function getOsConfig(): OsConfig | null {
  const url = normalizeOsUrl(Deno.env.get("MAIPROP_OS_URL"));
  const email = Deno.env.get("MAIPROP_OS_EMAIL");
  const password = Deno.env.get("MAIPROP_OS_PASSWORD");
  return url && email && password ? { url, email, password } : null;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

async function parseRequestBody(
  req: Request,
): Promise<Record<string, unknown>> {
  const body = await req.json().catch(function getEmptyBody() {
    return {};
  });
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

function getDefaultPageSize(planCap: number): number {
  return planCap;
}

function getFiniteInteger(
  body: Record<string, unknown>,
  key: string,
  fallback: number,
): number | null {
  const raw = body[key];
  const value = raw == null ? fallback : Number(raw);
  return Number.isFinite(value) && Number.isInteger(value) ? value : null;
}

export function getValidatedPagination(
  body: Record<string, unknown>,
  planCap: number,
): { page: number; size: number } | { error: string } {
  const page = getFiniteInteger(body, "page", 0);
  if (page == null || page < 0) {
    return { error: "page must be a finite non-negative integer" };
  }

  const rawSize = body.pageSize ?? body.size;
  const size = rawSize == null
    ? getDefaultPageSize(planCap)
    : getFiniteInteger({ size: rawSize }, "size", planCap);
  if (size == null || size < 1 || size > planCap) {
    return {
      error: `pageSize must be a finite integer between 1 and ${planCap}`,
    };
  }

  return { page, size };
}

type FilterEntry = readonly [string, unknown];

function hasTruthyFilterValue([, value]: FilterEntry): boolean {
  return Boolean(value);
}

function getOptionalFilters(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return Object.fromEntries(
    OPTIONAL_FILTER_KEYS
      .map(function getOptionalFilterEntry(key) {
        return [key, body[key]] as const;
      })
      .filter(hasTruthyFilterValue),
  );
}

function getAmountFilterEntries(body: Record<string, unknown>): FilterEntry[] {
  return AMOUNT_FILTER_KEYS.flatMap(function getAmountFilterEntry(key) {
    return body[key] == null ? [] : [[key, body[key]] as const];
  });
}

function getStringFilterEntries(
  body: Record<string, unknown>,
  keys: readonly string[],
): FilterEntry[] {
  return keys.flatMap(function getStringFilterEntry(key) {
    return typeof body[key] === "string" ? [[key, body[key]] as const] : [];
  });
}

export function buildFilterRequest(
  body: Record<string, unknown>,
): Record<string, unknown> {
  return {
    auctionDateFrom: body.auctionDateFrom ??
      new Date().toISOString().split("T")[0],
    ...getOptionalFilters(body),
    ...Object.fromEntries(getAmountFilterEntries(body)),
    ...Object.fromEntries(getStringFilterEntries(body, SORT_FILTER_KEYS)),
  };
}

async function fetchOsAuctionDetails(
  osConfig: OsConfig,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<OsResponse | OsAuction[]> {
  log.info("authenticating with OS API");
  const token = await getOsToken(
    osConfig.url,
    osConfig.email,
    osConfig.password,
  );

  return await fetchOsAuctionDetailsWithToken(
    osConfig,
    token,
    page,
    size,
    filterRequest,
  );
}

async function fetchOsAuctionDetailsWithToken(
  osConfig: OsConfig,
  token: string,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<OsResponse | OsAuction[]> {
  const endpoint =
    `${osConfig.url}/api/v1/auctions/filter/details?page=${page}&pageSize=${size}`;
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
    throw {
      kind: "os-api",
      status: auctionResponse.status,
      detail,
    } satisfies OsApiFailure;
  }

  return (await auctionResponse.json()) as OsResponse | OsAuction[];
}

function parseOsResponse(
  json: OsResponse | OsAuction[],
): { auctions: OsAuction[]; total: number } {
  const auctions = Array.isArray(json)
    ? json
    : Array.isArray(json.data)
    ? json.data
    : [];
  const total = Array.isArray(json)
    ? auctions.length
    : (json.responseMetadata?.pagination?.totalElements ?? auctions.length);
  return { auctions, total };
}

function isNationalSampleRequest(
  body: Record<string, unknown>,
  filterRequest: Record<string, unknown>,
): boolean {
  return body.sampleAcrossGreece !== false &&
    !filterRequest.prefectureId &&
    !filterRequest.propertyMunicipalityId &&
    !filterRequest.boundingBox;
}

async function fetchNationalAuctionSample(
  osConfig: OsConfig,
  responseSize: number,
  filterRequest: Record<string, unknown>,
): Promise<{ auctions: OsAuction[]; total: number; sourcePages: number[] }> {
  log.info("authenticating with OS API");
  const token = await getOsToken(
    osConfig.url,
    osConfig.email,
    osConfig.password,
  );
  const sourcePageSize = Math.max(
    responseSize,
    NATIONAL_SAMPLE_SOURCE_PAGE_SIZE,
  );
  const firstResponse = await fetchOsAuctionDetailsWithToken(
    osConfig,
    token,
    0,
    sourcePageSize,
    filterRequest,
  );
  const firstPage = parseOsResponse(firstResponse);
  const samplePages = getAuctionSamplePageNumbers(
    firstPage.total,
    sourcePageSize,
    NATIONAL_SAMPLE_PAGE_COUNT,
  );
  const remainingPages = samplePages.filter((page) => page !== 0);
  const successfulPages: OsAuction[][] = [];
  const failedPages: number[] = [];
  const pageResults = await Promise.allSettled(
    remainingPages.map((page) =>
      fetchOsAuctionDetailsWithToken(
        osConfig,
        token,
        page,
        sourcePageSize,
        filterRequest,
      )
    ),
  );

  pageResults.forEach((result, index) => {
    const page = remainingPages[index];
    if (result.status === "fulfilled") {
      successfulPages.push(parseOsResponse(result.value).auctions);
      return;
    }
    failedPages.push(page);
    log.warn("national auction sample page failed, retrying sequentially", {
      page,
      error: result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
    });
  });

  for (const page of failedPages) {
    try {
      const pageResponse = await fetchOsAuctionDetailsWithToken(
        osConfig,
        token,
        page,
        sourcePageSize,
        filterRequest,
      );
      successfulPages.push(parseOsResponse(pageResponse).auctions);
    } catch (err) {
      log.warn("national auction sample page failed", {
        page,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    auctions: [firstPage.auctions, ...successfulPages].flat(),
    total: firstPage.total,
    sourcePages: [0, ...remainingPages],
  };
}

function isOsApiFailure(err: unknown): err is OsApiFailure {
  return typeof err === "object" &&
    err !== null &&
    "kind" in err &&
    (err as { kind?: unknown }).kind === "os-api";
}

export function getFetchErrorPayload(
  err: unknown,
): { error: string; status: number } {
  return isOsApiFailure(err)
    ? { error: "Auction provider temporarily unavailable", status: 502 }
    : { error: "Unable to fetch auctions", status: 500 };
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), function toHex(byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

export async function getRateLimitKey(req: Request): Promise<string> {
  const bearerToken = getBearerToken(req);
  return bearerToken ? `auth:${await sha256Hex(bearerToken)}` : "anonymous";
}

async function getGuardResponse(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  return await limiter.isLimited(await getRateLimitKey(req))
    ? tooManyRequestsResponse(corsHeaders)
    : null;
}

function getRuntimeConfig(
  corsHeaders: Record<string, string>,
): RuntimeConfig | Response {
  const osConfig = getOsConfig();
  if (!osConfig) {
    return jsonResponse(
      { error: "OS credentials not configured" },
      corsHeaders,
      503,
    );
  }

  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    return jsonResponse(
      { error: "Supabase credentials not configured" },
      corsHeaders,
      503,
    );
  }

  return { osConfig, supabaseConfig };
}

function buildAuctionResponsePayload(
  mapped: MappedAuction[],
  total: number,
  page: number,
  planCap: number,
): AuctionResponsePayload {
  return {
    data: mapped,
    total,
    page,
    planCap,
  };
}

function handleFetchError(
  err: unknown,
  corsHeaders: Record<string, string>,
): Response {
  if (isOsApiFailure(err)) {
    log.error("OS API request failed", {
      status: err.status,
      detail: err.detail,
    });
    const payload = getFetchErrorPayload(err);
    return jsonResponse({ error: payload.error }, corsHeaders, payload.status);
  }

  const message = err instanceof Error ? err.message : String(err);
  log.error("fetch error", { err: message });
  const payload = getFetchErrorPayload(err);
  return jsonResponse({ error: payload.error }, corsHeaders, payload.status);
}

async function handleAuctionRequest(
  req: Request,
  corsHeaders: Record<string, string>,
  runtimeConfig: RuntimeConfig,
): Promise<Response> {
  const sb = createClient(
    runtimeConfig.supabaseConfig.url,
    runtimeConfig.supabaseConfig.serviceRoleKey,
  );

  try {
    const body = await parseRequestBody(req);
    const planCap = await getPlanCap(req, sb);
    const pagination = getValidatedPagination(body, planCap);
    if ("error" in pagination) {
      return jsonResponse({ error: pagination.error }, corsHeaders, 400);
    }
    const { page, size } = pagination;
    const filterRequest = buildFilterRequest(body);
    const sampleAcrossGreece = isNationalSampleRequest(body, filterRequest);
    const cacheKey = getAuctionResponseCacheKey(
      page,
      size,
      planCap,
      sampleAcrossGreece,
      filterRequest,
    );
    const cachedPayload = readAuctionResponseCache(cacheKey);
    if (cachedPayload) {
      log.info("returning cached auctions", {
        count: cachedPayload.data.length,
        total: cachedPayload.total,
        page,
        sample_across_greece: sampleAcrossGreece,
      });
      return jsonResponse(cachedPayload, corsHeaders);
    }

    const osResult = sampleAcrossGreece
      ? await fetchNationalAuctionSample(
        runtimeConfig.osConfig,
        size,
        filterRequest,
      )
      : {
        ...parseOsResponse(
          await fetchOsAuctionDetails(
            runtimeConfig.osConfig,
            page,
            size,
            filterRequest,
          ),
        ),
        sourcePages: [page],
      };
    const mapped = sampleAcrossGreece
      ? selectDiverseAuctionSample(osResult.auctions.map(mapAuction), size)
      : osResult.auctions.map(mapAuction);

    log.info("returning auctions", {
      count: mapped.length,
      total: osResult.total,
      page,
      source_pages: osResult.sourcePages,
      sample_across_greece: sampleAcrossGreece,
    });
    const payload = buildAuctionResponsePayload(
      mapped,
      osResult.total,
      page,
      planCap,
    );
    writeAuctionResponseCache(cacheKey, payload);
    return jsonResponse(
      payload,
      corsHeaders,
    );
  } catch (err: unknown) {
    return handleFetchError(err, corsHeaders);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);
  const guardResponse = await getGuardResponse(req, corsHeaders);
  if (guardResponse) return guardResponse;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);
  }

  const runtimeConfig = getRuntimeConfig(corsHeaders);
  if (runtimeConfig instanceof Response) return runtimeConfig;

  return await handleAuctionRequest(req, corsHeaders, runtimeConfig);
}

Deno.serve(handleRequest);
