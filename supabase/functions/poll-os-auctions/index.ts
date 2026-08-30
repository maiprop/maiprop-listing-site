/**
 * poll-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches auctions from maiProp OS via POST /api/v1/auctions/filter/details
 * and bulk-upserts them as Hub listings (listing_type='auction', status='active').
 *
 * Uses AuctionFilterRequest to filter future auctions and maps
 * AuctionOutputDto fields to the Hub listings schema.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { fetchBufferedProviderResponse } from "../_shared/providerFetch.ts";
import { getAuctionSamplePageNumbers } from "../fetch-os-auctions/auctionSampling.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import {
  type CanonicalOsListing,
  dedupeOsAuctionsById,
  insertOsAuctionRows,
  lookupCanonicalOsListings,
  mergeOsAuctionTags,
  type OsAuctionListingTable,
  requireOsAuctionId,
  requireValidOsAuctionBatch,
  updateCanonicalOsListing,
} from "../_shared/osAuctionIdentity.ts";
import {
  parsePollOsAuctionsRequest,
  type PollOsAuctionsRequest,
} from "./request.ts";

const log = createLogger("poll-os-auctions");
const limiter = makeRateLimiter({
  bucket: "poll-os-auctions",
  maxRequests: 3,
  windowMs: 60_000,
});
export const OS_TOKEN_RESPONSE_MAX_BYTES = 64 * 1_024;
export const OS_AUCTION_PAGE_RESPONSE_MAX_BYTES = 8 * 1_024 * 1_024;

// Edge Functions use the service-role Supabase client with generated DB types
// unavailable in Deno. Keep helper signatures aligned with the inferred client.
type SupabaseAdminClient = ReturnType<
  typeof createClient<Record<string, unknown>>
>;
type SupabaseError = { message?: string } | null;
type SupabaseQueryResult<T> = {
  data?: T[] | null;
  count?: number | null;
  error: SupabaseError;
};
type SupabaseQueryBuilder<T = unknown> = PromiseLike<SupabaseQueryResult<T>> & {
  select: (
    columns: string,
    options?: { count?: "exact"; head?: boolean },
  ) => SupabaseQueryBuilder<T>;
  insert: (values: Record<string, unknown>) => Promise<SupabaseQueryResult<T>>;
  update: (
    values: Record<string, unknown>,
    options?: { count?: "exact" },
  ) => SupabaseQueryBuilder<T>;
  eq: (column: string, value: unknown) => SupabaseQueryBuilder<T>;
  is: (column: string, value: null) => SupabaseQueryBuilder<T>;
  not: (
    column: string,
    operator: string,
    value: unknown,
  ) => SupabaseQueryBuilder<T>;
  contains: (column: string, value: unknown[]) => SupabaseQueryBuilder<T>;
  or: (filters: string) => SupabaseQueryBuilder<T>;
  order: (
    column: string,
    options?: Record<string, unknown>,
  ) => SupabaseQueryBuilder<T>;
  range: (from: number, to: number) => SupabaseQueryBuilder<T>;
};
type UntypedSupabaseClient = {
  from: <T = unknown>(tableName: string) => SupabaseQueryBuilder<T>;
};

function table<T = unknown>(
  sb: SupabaseAdminClient,
  tableName: string,
): SupabaseQueryBuilder<T> {
  return (sb as unknown as UntypedSupabaseClient).from<T>(tableName);
}

/** Maximum number of OS auctions to sync per UTC calendar day. */
const DAILY_AUCTION_LIMIT = 600;

/**
 * Number of distinct pages we cycle through before repeating.
 * With DAILY_AUCTION_LIMIT = 200 this covers up to 10 × 200 = 2 000 auctions
 * in rotation over 10 days, giving broad variety without hammering OS.
 */
const NATIONAL_SYNC_PAGE_COUNT = 4;

// OS propertyCategory → Hub property_type (and optional land_type / commercial_type for filters)
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

// OS category → land_type tag value (for Auctions page filter; must match PROPERTY_TYPES in Auctions.tsx)
const LAND_TYPE_TAG: Record<string, string> = {
  LAND: "land",
  PLOT: "plot",
  PLOT_WITH_BUILDING: "plot_with_building",
  LAND_WITH_BUILDING: "land_with_building",
};

// OS category → commercial_type tag value (for Auctions page filter)
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

function mapCategory(cat?: string): string {
  if (!cat) return "apartment";
  return CATEGORY_MAP[cat.toUpperCase()] ?? "apartment";
}

/** Returns optional land_type or commercial_type tag for filter matching on Auctions page. */
function getSubtypeTag(cat?: string): string | null {
  if (!cat) return null;
  const u = cat.toUpperCase();
  if (LAND_TYPE_TAG[u]) return `land_type:${LAND_TYPE_TAG[u]}`;
  if (COMMERCIAL_TYPE_TAG[u]) {
    return `commercial_type:${COMMERCIAL_TYPE_TAG[u]}`;
  }
  return null;
}

function mapOwnershipStatusToTag(rawOwnership?: string | null): string | null {
  if (!rawOwnership) return null;
  const occ = rawOwnership.toUpperCase().trim();
  if (occ === "FULL" || occ === "COMPLETE" || occ === "FULL_OWNERSHIP") {
    return "ownership:full";
  }
  if (occ === "BARE" || occ === "BARE_OWNERSHIP") return "ownership:bare";
  if (
    occ === "COMMON" || occ === "JOINT" || occ === "SHARED" ||
    occ === "CO_OWNERSHIP"
  ) return "ownership:common";
  if (occ === "USUFRUCT" || occ === "PSILI_KYPHIOTITA") {
    return "ownership:usufruct";
  }
  if (occ === "VERTICAL" || occ === "VERTICAL_OWNERSHIP") {
    return "ownership:vertical";
  }
  if (occ === "HORIZONTAL" || occ === "HORIZONTAL_OWNERSHIP") {
    return "ownership:horizontal";
  }
  return `ownership:${occ.toLowerCase()}`;
}

function getUtcPoolDate(): string {
  return new Date().toISOString().slice(0, 10);
}

function getDailyPoolTag(poolDate: string): string {
  return `auction_pool:${poolDate}`;
}

// AuctionOutputDto from the OS API. The OS service does not publish a typed
// schema, so we describe only the fields this function reads. All fields are
// optional because OS may omit any of them depending on the auction state.
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

function buildTitle(a: OsAuction): string {
  const catKey = mapCategory(a.propertyCategory);
  const catGr = CATEGORY_GR[catKey] ?? "Ακίνητο";
  const city = a.propertyMunicipalityName ?? "Ελλάδα";
  const price = Number(a.firstPriceOffer ?? 0);
  const priceStr = price > 0 ? ` – €${price.toLocaleString("el-GR")}` : "";
  return `Πλειστηριασμός ${catGr} | ${city}${priceStr}`;
}

/** Fetch and buffer the response under one absolute provider deadline. */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
  maxResponseBytes = OS_AUCTION_PAGE_RESPONSE_MAX_BYTES,
): Promise<Response> {
  return await fetchBufferedProviderResponse(url, options, {
    timeoutMs,
    maxResponseBytes,
    timeoutMessage: "OS provider request timed out",
  });
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
    45_000,
    OS_TOKEN_RESPONSE_MAX_BYTES,
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) {
    throw new Error(
      `OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`,
    );
  }
  return token;
}

async function logSync(
  sb: SupabaseAdminClient,
  status: string,
  error_message?: string | null,
  payload?: unknown,
  records_affected = 0,
): Promise<void> {
  try {
    await table(sb, "sync_log").insert({
      direction: "os_to_hub",
      entity_type: "auction",
      entity_id: "poll-batch",
      status,
      error_message: error_message ?? null,
      payload: payload ?? null,
      records_affected,
    });
  } catch (e) {
    log.warn("logSync failed", {
      err: e instanceof Error ? e.message : String(e),
    });
  }
}

/** Hub `listings` row produced from one OS auction. The full DB row type isn't
 *  in the generated Supabase types since columns vary across migrations. */
type MappedListingRow = {
  title: string;
  description: string | null;
  website_url: string | null;
  cover_image_url: string | null;
  price: number;
  price_per_sqm: number | null;
  auction_starting_bid: number;
  auction_date: string | null;
  auction_court: string | null;
  property_type: string;
  listing_type: string;
  status: string;
  city: string;
  region: string | null;
  address: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  sqm: number;
  floor: number | null;
  total_floors: number | null;
  year_built: number | null;
  cadastre_number: string | null;
  owner_id: string | null;
  ai_score: number;
  tags: string[];
};

type MappedAuction = { osId: string; tagKey: string; row: MappedListingRow };
type PoolTagRow = {
  id: string;
  os_auction_id: string;
  tags?: string[] | null;
};

/**
 * Map an AuctionOutputDto from the OS API to a Hub listing row.
 */
function mapAuctionToListing(
  a: OsAuction,
  poolDate = getUtcPoolDate(),
): MappedAuction {
  const osId = requireOsAuctionId(a.auctionListingId);
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(a.propertyCategory);
  const price = Number(a.firstPriceOffer ?? 0);

  // Extract the auction URL — OS may return it as `url`, `auctionUrl`, or `listingUrl`
  const auctionUrl: string | null = a.url ?? a.auctionUrl ?? a.listingUrl ??
    a.eAuctionUrl ?? null;

  // Build Street View via proxy (key never in DB or client URLs)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const lat = a.propertyLatitude != null ? Number(a.propertyLatitude) : null;
  const lng = a.propertyLongitude != null ? Number(a.propertyLongitude) : null;
  const streetViewUrl = supabaseUrl && lat != null && lng != null
    ? `${supabaseUrl}/functions/v1/streetview-proxy?size=800x450&lat=${lat}&lng=${lng}`
    : null;

  // Map ownershipStatus from OS API to normalized tags used by frontend filters
  // Canonical values: full, bare, common, usufruct, vertical, horizontal
  const rawOwnership: string | undefined = a.ownershipStatus;
  const ownershipPct: number | undefined = a.ownershipPercentage != null
    ? Number(a.ownershipPercentage)
    : undefined;
  let ownershipTag: string | null = mapOwnershipStatusToTag(rawOwnership);
  if (!ownershipTag && ownershipPct != null) {
    // Fallback: best-effort derivation when status is absent
    if (ownershipPct >= 100) ownershipTag = "ownership:full";
    else if (ownershipPct > 0) ownershipTag = "ownership:common";
  }

  return {
    osId,
    tagKey,
    row: {
      title: buildTitle(a),
      description: null,
      website_url: auctionUrl,
      cover_image_url: streetViewUrl,
      price,
      price_per_sqm: a.pricePerSquareMeter != null
        ? Number(a.pricePerSquareMeter)
        : null,
      auction_starting_bid: price,
      auction_date: a.auctionDate ?? null,
      auction_court: a.auctionStatus ?? null,
      property_type: catKey,
      listing_type: "auction",
      status: "active",
      city: a.propertyMunicipalityName ?? "Ελλάδα",
      region: a.propertyPrefectureName ?? null,
      address: a.propertyAddress ?? null,
      postal_code: a.propertyPostalCode ?? null,
      latitude: a.propertyLatitude != null ? Number(a.propertyLatitude) : null,
      longitude: a.propertyLongitude != null
        ? Number(a.propertyLongitude)
        : null,
      sqm: a.propertySquareMeters != null ? Number(a.propertySquareMeters) : 1,
      floor: a.propertyFloor != null
        ? Math.round(Number(a.propertyFloor))
        : null,
      total_floors: a.numberOfFloors != null
        ? Math.round(Number(a.numberOfFloors))
        : null,
      year_built: a.constructionYear != null
        ? Number(a.constructionYear)
        : null,
      cadastre_number: a.propertyFullKaek ?? null,
      owner_id: null,
      ai_score: 80,
      tags: [
        tagKey,
        "source:maiprop-os",
        `auction_pool:${poolDate}`,
        `auction_status:${a.auctionStatus ?? "scheduled"}`,
        ...(a.currentRound != null ? [`round:${a.currentRound}`] : []),
        ...(ownershipTag ? [ownershipTag] : []),
        ...(ownershipPct != null ? [`ownership_pct:${ownershipPct}`] : []),
        ...(getSubtypeTag(a.propertyCategory)
          ? [getSubtypeTag(a.propertyCategory)!]
          : []),
      ],
    },
  };
}

// ── Require cron bearer or platform-admin JWT before any sync work ───────────
function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

async function sha256Bytes(value: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return new Uint8Array(digest);
}

async function sha256Hex(value: string): Promise<string> {
  return Array.from(
    await sha256Bytes(value),
    (byte) => byte.toString(16).padStart(2, "0"),
  ).join("");
}

async function constantTimeSecretMatch(
  supplied: string,
  expected: string,
): Promise<boolean> {
  if (supplied.length === 0 || expected.length === 0) return false;
  const suppliedHash = await sha256Bytes(supplied);
  const expectedHash = await sha256Bytes(expected);
  let diff = suppliedHash.length ^ expectedHash.length;
  for (
    let i = 0;
    i < Math.max(suppliedHash.length, expectedHash.length);
    i += 1
  ) {
    diff |= (suppliedHash[i] ?? 0) ^ (expectedHash[i] ?? 0);
  }
  return diff === 0;
}

export async function isCronBearerRequest(req: Request): Promise<boolean> {
  const cronSecret = Deno.env.get("CRON_SECRET") ?? "";
  const token = getBearerToken(req);
  if (token === null || cronSecret.length === 0) return false;
  return await constantTimeSecretMatch(token, cronSecret);
}

type SyncAuth = { kind: "cron" } | { kind: "admin"; userId: string };

export async function authorizeSyncRequest(
  req: Request,
  sb: SupabaseAdminClient,
  corsHeaders: Record<string, string>,
): Promise<SyncAuth | Response> {
  if (await isCronBearerRequest(req)) return { kind: "cron" };

  const token = getBearerToken(req);
  if (!token) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: profileRow } = await sb.from("profiles").select("role").eq(
    "user_id",
    user.id,
  ).single();
  const profile = profileRow as { role?: string } | null;
  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Platform admin required" }), {
      status: 403,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return { kind: "admin", userId: user.id };
}

async function getAuthorizedRateLimitKey(auth: SyncAuth): Promise<string> {
  return auth.kind === "cron"
    ? "cron"
    : `admin:${await sha256Hex(auth.userId)}`;
}

type OsAuctionListResponse = {
  data?: OsAuction[];
  responseMetadata?: { pagination?: { totalElements?: number } };
  pagination?: { totalElements?: number };
};

function parseAuctionListResponse(
  auctJson: OsAuctionListResponse | OsAuction[],
): {
  auctions: OsAuction[];
  totalAvailable: number;
} {
  const auctions = Array.isArray(auctJson)
    ? auctJson
    : Array.isArray(auctJson.data)
    ? auctJson.data
    : [];
  const pagination =
    (Array.isArray(auctJson)
      ? undefined
      : auctJson.responseMetadata?.pagination ?? auctJson.pagination) ?? {};
  return {
    auctions,
    totalAvailable: pagination.totalElements ?? auctions.length,
  };
}

async function fetchOsAuctionPage(
  osUrl: string,
  token: string,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<
  { auctions: OsAuction[]; totalAvailable: number; endpoint: string }
> {
  const endpoint =
    `/api/v1/auctions/filter/details?page=${page}&pageSize=${size}`;
  log.info("requesting auctions page", { endpoint, filter: filterRequest });

  const auctRes = await fetchWithTimeout(
    `${osUrl}${endpoint}`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filterRequest),
    },
    25_000,
    OS_AUCTION_PAGE_RESPONSE_MAX_BYTES,
  );

  if (!auctRes.ok) {
    const errText = await auctRes.text();
    throw new Error(
      `OS auction fetch failed (${auctRes.status}): ${errText.slice(0, 500)}`,
    );
  }

  return {
    ...parseAuctionListResponse(
      await auctRes.json() as OsAuctionListResponse | OsAuction[],
    ),
    endpoint,
  };
}

function getAuctionGroupKey(row: MappedAuction): string {
  return row.row.region || row.row.city || "Greece";
}

function selectDiverseMappedAuctions(
  rows: MappedAuction[],
  limit: number,
): MappedAuction[] {
  const uniqueRows = new Map<string, MappedAuction>();
  for (const row of rows) uniqueRows.set(row.tagKey, row);

  const groups = new Map<string, MappedAuction[]>();
  for (const row of uniqueRows.values()) {
    const key = getAuctionGroupKey(row);
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  const orderedGroups = [...groups.entries()].sort(([a], [b]) =>
    a.localeCompare(b)
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

async function getActiveDailyPoolCount(
  sb: SupabaseAdminClient,
  poolDate: string,
): Promise<number> {
  const { count, error } = await table(sb, "listings")
    .select("id", { count: "exact", head: true })
    .eq("listing_type", "auction")
    .is("owner_id", null)
    .not("os_auction_id", "is", null)
    .eq("status", "active")
    .eq("is_off_market", false)
    .contains("tags", ["source:maiprop-os", getDailyPoolTag(poolDate)])
    .or(`auction_date.gte.${poolDate},auction_date.is.null`);

  if (error) throw error;
  return count ?? 0;
}

async function removeDailyPoolTagFromRows(
  sb: SupabaseAdminClient,
  poolTag: string,
  rows: PoolTagRow[],
): Promise<number> {
  let removed = 0;
  const chunkSize = 25;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const results = await Promise.all(chunk.map(async (row) => {
      const tags = (row.tags ?? []).filter((tag) => tag !== poolTag);
      return updateCanonicalOsListing(
        sb.from("listings") as unknown as OsAuctionListingTable,
        {
          id: row.id,
          osId: row.os_auction_id,
          data: { tags },
          requiredTags: [poolTag],
        },
      );
    }));
    for (const didUpdate of results) {
      if (!didUpdate) throw new Error("canonical_os_pool_listing_changed");
      removed += 1;
    }
  }
  return removed;
}

async function fetchActiveDailyPoolRows(
  sb: SupabaseAdminClient,
  poolDate: string,
  selectColumns: string,
): Promise<PoolTagRow[]> {
  const poolTag = getDailyPoolTag(poolDate);
  const pageSize = 500;
  const rows: PoolTagRow[] = [];
  let from = 0;

  while (from < 5_000) {
    const to = from + pageSize - 1;
    const { data, error } = await table<PoolTagRow>(sb, "listings")
      .select(selectColumns)
      .eq("listing_type", "auction")
      .is("owner_id", null)
      .not("os_auction_id", "is", null)
      .eq("status", "active")
      .eq("is_off_market", false)
      .contains("tags", ["source:maiprop-os", poolTag])
      .or(`auction_date.gte.${poolDate},auction_date.is.null`)
      .order("updated_at", { ascending: false })
      .range(from, to);

    if (error) throw error;
    const pageRows = (data ?? []) as PoolTagRow[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function trimDailyPoolToLatest(
  sb: SupabaseAdminClient,
  poolDate: string,
  limit: number,
): Promise<number> {
  const poolTag = getDailyPoolTag(poolDate);
  const rows = await fetchActiveDailyPoolRows(
    sb,
    poolDate,
    "id, os_auction_id, tags",
  );
  const staleRows = rows.slice(limit);
  return removeDailyPoolTagFromRows(sb, poolTag, staleRows);
}

async function pruneUnselectedDailyPoolRows(
  sb: SupabaseAdminClient,
  poolDate: string,
  selectedAuctionTags: string[],
): Promise<number> {
  const poolTag = getDailyPoolTag(poolDate);
  const selected = new Set(selectedAuctionTags);
  const rows = await fetchActiveDailyPoolRows(
    sb,
    poolDate,
    "id, os_auction_id, tags",
  );
  const staleRows = rows.filter((row) =>
    !(row.tags ?? []).some((tag) => selected.has(tag))
  );
  return removeDailyPoolTagFromRows(sb, poolTag, staleRows);
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const auth = await authorizeSyncRequest(req, sb, corsHeaders);
  if (auth instanceof Response) return auth;

  let body: PollOsAuctionsRequest;
  try {
    body = await parsePollOsAuctionsRequest(req);
  } catch (err: unknown) {
    if (err instanceof SchemaValidationError) {
      return new Response(
        JSON.stringify({
          error: err.message,
          code: err.code,
          issues: err.issues,
        }),
        {
          status: err.status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    throw err;
  }

  if (await limiter.isLimited(await getAuthorizedRateLimitKey(auth))) {
    return tooManyRequestsResponse(corsHeaders);
  }

  // ── Daily pool guard ─────────────────────────────────────────────────────
  // Use the actual pool tag instead of sync_log so retries and interrupted
  // pg_net calls cannot grow the visible daily catalogue beyond 600.
  const poolDate = getUtcPoolDate();
  const existingDailyPoolCount = await getActiveDailyPoolCount(sb, poolDate);

  if (existingDailyPoolCount >= DAILY_AUCTION_LIMIT) {
    const prunedPoolRows = existingDailyPoolCount > DAILY_AUCTION_LIMIT
      ? await trimDailyPoolToLatest(sb, poolDate, DAILY_AUCTION_LIMIT)
      : 0;
    const finalDailyPoolCount = existingDailyPoolCount - prunedPoolRows;
    log.info("Daily auction pool already populated — skipping", {
      existingDailyPoolCount,
      finalDailyPoolCount,
      prunedPoolRows,
      limit: DAILY_AUCTION_LIMIT,
    });
    return new Response(
      JSON.stringify({
        ok: true,
        status: "skipped",
        reason:
          `Daily pool of ${DAILY_AUCTION_LIMIT} auctions already populated`,
        poolDate,
        pool_count_before: existingDailyPoolCount,
        pool_count_after: finalDailyPoolCount,
        prunedPoolRows,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(sb, "skipped", "OS credentials not configured");
    return new Response(
      JSON.stringify({
        ok: true,
        status: "skipped",
        reason: "OS credentials not configured",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    // Build the provider filter only from the validated allowlist.
    const filterRequest: Record<string, unknown> = {};

    // Only fetch future auctions by default
    const today = new Date().toISOString().split("T")[0]; // yyyy-mm-dd
    filterRequest.auctionDateFrom = body.auctionDateFrom ?? today;
    if (body.auctionDateTo) filterRequest.auctionDateTo = body.auctionDateTo;

    // Optional filters from caller
    if (body.propertyCategories) {
      filterRequest.propertyCategories = body.propertyCategories;
    }
    if (body.prefectureId !== undefined) {
      filterRequest.prefectureId = body.prefectureId;
    }
    if (body.propertyMunicipalityId !== undefined) {
      filterRequest.propertyMunicipalityId = body.propertyMunicipalityId;
    }
    if (body.auctionStatuses) {
      filterRequest.auctionStatuses = body.auctionStatuses;
    }
    if (body.auctionAmountFrom != null) {
      filterRequest.auctionAmountFrom = body.auctionAmountFrom;
    }
    if (body.auctionAmountTo != null) {
      filterRequest.auctionAmountTo = body.auctionAmountTo;
    }
    if (body.boundingBox) filterRequest.boundingBox = body.boundingBox;

    // Sorting: newest auctions first — use sortField object format
    if (body.sortBy) {
      filterRequest.sortBy = body.sortBy;
      filterRequest.order = body.order ?? "ASC";
    }

    // ── Canonical daily national pool ───────────────────────────────────────
    // When no explicit page is supplied, sample multiple pages once and write
    // a canonical national auction pool for the portal to serve locally.
    const page = body.page ?? 0;

    // Hard cap: never exceed what's left of today's daily quota, and never
    // exceed DAILY_AUCTION_LIMIT in a single call regardless of the caller.
    const size = body.size ?? body.pageSize ?? DAILY_AUCTION_LIMIT;
    const sampleAcrossGreece = body.sampleAcrossGreece !== false &&
      body.page == null;

    log.info("authenticating against OS", { os_url: OS_URL });
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const firstPage = await fetchOsAuctionPage(
      OS_URL,
      token,
      page,
      size,
      filterRequest,
    );

    const samplePages = sampleAcrossGreece
      ? getAuctionSamplePageNumbers(
        firstPage.totalAvailable,
        size,
        NATIONAL_SYNC_PAGE_COUNT,
      )
      : [page];
    const remainingPages = samplePages.filter((samplePage) =>
      samplePage !== page
    );
    const extraPageResults = await Promise.allSettled(
      remainingPages.map((samplePage) =>
        fetchOsAuctionPage(OS_URL, token, samplePage, size, filterRequest)
      ),
    );
    const extraAuctions = extraPageResults.flatMap((result) =>
      result.status === "fulfilled" ? result.value.auctions : []
    );
    const auctions = [firstPage.auctions, ...extraAuctions].flat();

    // The v1 API wraps data in AnalyticaResponse → data is the list
    const totalAvailable = firstPage.totalAvailable;
    const endpoint = firstPage.endpoint;

    log.info("received auctions", {
      received: auctions.length,
      total_available: totalAvailable,
      page,
      source_pages: samplePages,
      daily_limit: DAILY_AUCTION_LIMIT,
      pool_count_before: existingDailyPoolCount,
    });

    if (auctions.length === 0) {
      await logSync(sb, "success", null, { endpoint, total: 0, page }, 0);
      return new Response(
        JSON.stringify({
          ok: true,
          total: 0,
          imported: 0,
          updated: 0,
          page,
          daily_limit: DAILY_AUCTION_LIMIT,
          pool_count_before: existingDailyPoolCount,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const validAuctions = dedupeOsAuctionsById(auctions);
    requireValidOsAuctionBatch(auctions.length, validAuctions.length);
    const mapped = selectDiverseMappedAuctions(
      validAuctions.map((auction) => mapAuctionToListing(auction, poolDate)),
      size,
    );

    // Fetch existing OS auction IDs in one query
    const osIds = mapped.map((m) => m.osId);
    const existingRows = await lookupCanonicalOsListings(
      sb.from("listings") as unknown as OsAuctionListingTable,
      osIds,
    );

    const existingMap = new Map<string, CanonicalOsListing>();
    for (const row of existingRows) {
      existingMap.set(row.os_auction_id, row);
    }

    type ListingUpdate = Partial<MappedListingRow> & { updated_at?: string };
    const toInsert: MappedListingRow[] = [];
    const toUpdate: { id: string; osId: string; data: ListingUpdate }[] = [];

    for (const { osId, row } of mapped) {
      const existing = existingMap.get(osId);
      if (existing) {
        toUpdate.push({
          id: existing.id,
          osId,
          data: {
            price: row.price,
            price_per_sqm: row.price_per_sqm,
            auction_starting_bid: row.auction_starting_bid,
            auction_date: row.auction_date,
            auction_court: row.auction_court,
            address: row.address,
            latitude: row.latitude,
            longitude: row.longitude,
            sqm: row.sqm,
            floor: row.floor,
            total_floors: row.total_floors,
            year_built: row.year_built,
            cadastre_number: row.cadastre_number,
            postal_code: row.postal_code,
            region: row.region,
            tags: mergeOsAuctionTags(existing.tags ?? [], row.tags),
            website_url: row.website_url,
            // Only set cover_image_url if we have a Street View URL to avoid overwriting existing photos
            ...(row.cover_image_url
              ? { cover_image_url: row.cover_image_url }
              : {}),
            status: "active",
            updated_at: new Date().toISOString(),
          },
        });
      } else {
        toInsert.push(row);
      }
    }

    let imported = 0,
      updated = 0,
      errors = 0;
    const CHUNK = 50;

    // Bulk insert new auctions
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      try {
        imported += await insertOsAuctionRows(
          sb.from("listings") as unknown as OsAuctionListingTable,
          chunk,
        );
      } catch (error) {
        log.error("insert failed", {
          err: error instanceof Error ? error.message : String(error),
          chunk_size: chunk.length,
        });
        errors += chunk.length;
      }
    }

    // Update existing auctions
    for (const u of toUpdate) {
      try {
        const didUpdate = await updateCanonicalOsListing(
          sb.from("listings") as unknown as OsAuctionListingTable,
          { id: u.id, osId: u.osId, data: u.data },
        );
        if (didUpdate) {
          updated++;
          continue;
        }
        log.error("update failed", {
          err: "canonical_os_listing_changed",
          listing_id: u.id,
        });
      } catch (error) {
        log.error("update failed", {
          err: error instanceof Error ? error.message : String(error),
          listing_id: u.id,
        });
      }
      errors++;
    }

    const prunedPoolRows = await pruneUnselectedDailyPoolRows(
      sb,
      poolDate,
      mapped.map((row) => row.tagKey),
    );
    const finalDailyPoolCount = await getActiveDailyPoolCount(sb, poolDate);

    const summary = {
      endpoint,
      total: auctions.length,
      totalAvailableInOS: totalAvailable,
      imported,
      updated,
      errors,
      page,
      sourcePages: samplePages,
      size,
      poolDate,
      auth: auth.kind,
      filter: filterRequest,
      daily_limit: DAILY_AUCTION_LIMIT,
      pool_count_before: existingDailyPoolCount,
      pool_count_after: finalDailyPoolCount,
      prunedPoolRows,
    };

    await logSync(
      sb,
      errors > 0 && imported + updated === 0 ? "error" : "success",
      errors > 0 ? `${errors} item(s) failed` : null,
      summary,
      imported + updated,
    );

    log.info("poll done", { summary });

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    log.error("poll error", { err: message });
    await logSync(sb, "error", message);
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
