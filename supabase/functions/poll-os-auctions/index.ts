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
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const log = createLogger("poll-os-auctions");
const limiter = makeRateLimiter({ bucket: "poll-os-auctions", maxRequests: 3, windowMs: 60_000 });

// Edge Functions use the service-role Supabase client with generated DB types
// unavailable in Deno. Keep helper signatures aligned with the inferred client.
type SupabaseAdminClient = ReturnType<typeof createClient<Record<string, unknown>>>;

/** Maximum number of OS auctions to sync per UTC calendar day. */
const DAILY_AUCTION_LIMIT = 200;

/**
 * Number of distinct pages we cycle through before repeating.
 * With DAILY_AUCTION_LIMIT = 200 this covers up to 10 × 200 = 2 000 auctions
 * in rotation over 10 days, giving broad variety without hammering OS.
 */
const ROTATION_PAGE_COUNT = 10;


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
  if (COMMERCIAL_TYPE_TAG[u]) return `commercial_type:${COMMERCIAL_TYPE_TAG[u]}`;
  return null;
}

function mapOwnershipStatusToTag(rawOwnership?: string | null): string | null {
  if (!rawOwnership) return null;
  const occ = rawOwnership.toUpperCase().trim();
  if (occ === "FULL" || occ === "COMPLETE" || occ === "FULL_OWNERSHIP") return "ownership:full";
  if (occ === "BARE" || occ === "BARE_OWNERSHIP") return "ownership:bare";
  if (occ === "COMMON" || occ === "JOINT" || occ === "SHARED" || occ === "CO_OWNERSHIP") return "ownership:common";
  if (occ === "USUFRUCT" || occ === "PSILI_KYPHIOTITA") return "ownership:usufruct";
  if (occ === "VERTICAL" || occ === "VERTICAL_OWNERSHIP") return "ownership:vertical";
  if (occ === "HORIZONTAL" || occ === "HORIZONTAL_OWNERSHIP") return "ownership:horizontal";
  return `ownership:${occ.toLowerCase()}`;
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

/** Fetch with an AbortController timeout. */
async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOsToken(
  baseUrl: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    45_000
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token)
    throw new Error(
      `OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`
    );
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
    // `sync_log` is unregistered in the generated Supabase types; cast through
    // the narrow `from` overload bridge that the rest of this codebase uses.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (sb.from as any)("sync_log").insert({
      direction: "os_to_hub",
      entity_type: "auction",
      entity_id: "poll-batch",
      status,
      error_message: error_message ?? null,
      payload: payload ?? null,
      records_affected,
    });
  } catch (e) {
    log.warn("logSync failed", { err: e instanceof Error ? e.message : String(e) });
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

type MappedAuction = { tagKey: string; row: MappedListingRow };

/**
 * Map an AuctionOutputDto from the OS API to a Hub listing row.
 */
function mapAuctionToListing(a: OsAuction): MappedAuction {
  const osId = String(a.auctionListingId ?? "unknown");
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(a.propertyCategory);
  const price = Number(a.firstPriceOffer ?? 0);

  // Extract the auction URL — OS may return it as `url`, `auctionUrl`, or `listingUrl`
  const auctionUrl: string | null =
    a.url ?? a.auctionUrl ?? a.listingUrl ?? a.eAuctionUrl ?? null;

  // Build Street View via proxy (key never in DB or client URLs)
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const lat = a.propertyLatitude != null ? Number(a.propertyLatitude) : null;
  const lng = a.propertyLongitude != null ? Number(a.propertyLongitude) : null;
  const streetViewUrl =
    supabaseUrl && lat != null && lng != null
      ? `${supabaseUrl}/functions/v1/streetview-proxy?size=800x450&lat=${lat}&lng=${lng}`
      : null;

  // Map ownershipStatus from OS API to normalized tags used by frontend filters
  // Canonical values: full, bare, common, usufruct, vertical, horizontal
  const rawOwnership: string | undefined = a.ownershipStatus;
  const ownershipPct: number | undefined = a.ownershipPercentage != null ? Number(a.ownershipPercentage) : undefined;
  let ownershipTag: string | null = mapOwnershipStatusToTag(rawOwnership);
  if (!ownershipTag && ownershipPct != null) {
    // Fallback: best-effort derivation when status is absent
    if (ownershipPct >= 100) ownershipTag = "ownership:full";
    else if (ownershipPct > 0) ownershipTag = "ownership:common";
  }

  return {
    tagKey,
    row: {
      title: buildTitle(a),
      description: null,
      website_url: auctionUrl,
      cover_image_url: streetViewUrl,
      price,
      price_per_sqm: a.pricePerSquareMeter != null ? Number(a.pricePerSquareMeter) : null,
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
      longitude: a.propertyLongitude != null ? Number(a.propertyLongitude) : null,
      sqm: a.propertySquareMeters != null ? Number(a.propertySquareMeters) : 1,
      floor: a.propertyFloor != null ? Math.round(Number(a.propertyFloor)) : null,
      total_floors: a.numberOfFloors != null ? Math.round(Number(a.numberOfFloors)) : null,
      year_built: a.constructionYear != null ? Number(a.constructionYear) : null,
      cadastre_number: a.propertyFullKaek ?? null,
      owner_id: null,
      ai_score: 80,
      tags: [
        tagKey,
        "source:maiprop-os",
        `auction_status:${a.auctionStatus ?? "scheduled"}`,
        ...(a.currentRound != null ? [`round:${a.currentRound}`] : []),
        ...(ownershipTag ? [ownershipTag] : []),
        ...(ownershipPct != null ? [`ownership_pct:${ownershipPct}`] : []),
        ...(getSubtypeTag(a.propertyCategory) ? [getSubtypeTag(a.propertyCategory)!] : []),
      ],
    },
  };
}

// ── Require agent role (JWT) to prevent unauthenticated PII/sync abuse ───────
async function requireAgent(
  req: Request,
  sb: SupabaseAdminClient,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: profileRow } = await sb.from("profiles").select("role").eq("user_id", user.id).single();
  const profile = profileRow as { role?: string } | null;
  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Platform admin required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const authErr = await requireAgent(req, sb, corsHeaders);
  if (authErr) return authErr;

  // ── Daily quota guard ────────────────────────────────────────────────────
  // Count auctions already synced in this UTC calendar day. We use sync_log
  // records_affected which holds imported + updated from each run.
  const utcDayStart = new Date();
  utcDayStart.setUTCHours(0, 0, 0, 0);

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: todayLogs } = await (sb.from as any)("sync_log")
    .select("records_affected")
    .eq("direction", "os_to_hub")
    .eq("entity_type", "auction")
    .eq("status", "success")
    .gte("created_at", utcDayStart.toISOString()) as {
      data: { records_affected: number }[] | null;
    };

  const todaySynced = (todayLogs ?? []).reduce(
    (sum, r) => sum + (r.records_affected ?? 0),
    0,
  );

  if (todaySynced >= DAILY_AUCTION_LIMIT) {
    log.info("Daily auction limit reached — skipping", { todaySynced, limit: DAILY_AUCTION_LIMIT });
    return new Response(
      JSON.stringify({
        ok: true,
        status: "skipped",
        reason: `Daily limit of ${DAILY_AUCTION_LIMIT} auctions already reached`,
        today_synced: todaySynced,
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
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));

    // Build AuctionFilterRequest from caller params. Fields are passed through
    // verbatim to the OS API, which doesn't publish a typed schema, so we
    // accept arbitrary JSON-serialisable values.
    const filterRequest: Record<string, unknown> = {};

    // Only fetch future auctions by default
    const today = new Date().toISOString().split("T")[0]; // yyyy-mm-dd
    filterRequest.auctionDateFrom = body.auctionDateFrom ?? today;
    if (body.auctionDateTo) filterRequest.auctionDateTo = body.auctionDateTo;

    // Optional filters from caller
    if (body.propertyCategories) filterRequest.propertyCategories = body.propertyCategories;
    if (body.prefectureId) filterRequest.prefectureId = body.prefectureId;
    if (body.propertyMunicipalityId) filterRequest.propertyMunicipalityId = body.propertyMunicipalityId;
    if (body.auctionStatuses) filterRequest.auctionStatuses = body.auctionStatuses;
    if (body.auctionAmountFrom != null) filterRequest.auctionAmountFrom = body.auctionAmountFrom;
    if (body.auctionAmountTo != null) filterRequest.auctionAmountTo = body.auctionAmountTo;
    if (body.boundingBox) filterRequest.boundingBox = body.boundingBox;

    // Sorting: newest auctions first — use sortField object format
    if (body.sortBy) {
      filterRequest.sortBy = body.sortBy;
      filterRequest.order = body.order ?? "ASC";
    }

    // ── Pagination with daily rotation ──────────────────────────────────────
    // When no explicit page is supplied, rotate through ROTATION_PAGE_COUNT
    // pages using today's UTC day number as a deterministic seed. This means
    // a different slice of OS auctions surfaces each calendar day, giving the
    // auction page variety without fetching the same first page every run.
    const dayNumber = Math.floor(Date.now() / (24 * 60 * 60 * 1000));
    const defaultPage = dayNumber % ROTATION_PAGE_COUNT;
    const page = Number(body.page ?? defaultPage);

    // Hard cap: never exceed what's left of today's daily quota, and never
    // exceed DAILY_AUCTION_LIMIT in a single call regardless of the caller.
    const remaining = DAILY_AUCTION_LIMIT - todaySynced;
    const size = Math.min(Number(body.size ?? body.pageSize ?? DAILY_AUCTION_LIMIT), remaining);

    log.info("authenticating against OS", { os_url: OS_URL });
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const endpoint = `/api/v1/auctions/filter/details?page=${page}&pageSize=${size}`;
    log.info("requesting auctions page", { endpoint, filter: filterRequest });

    const auctRes = await fetchWithTimeout(
      `${OS_URL}${endpoint}`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(filterRequest),
      },
      25_000
    );

    if (!auctRes.ok) {
      const errText = await auctRes.text();
      await logSync(
        sb,
        "error",
        `OS auction fetch failed (${auctRes.status}): ${errText.slice(0, 500)}`
      );
      return new Response(
        JSON.stringify({
          error: `OS returned ${auctRes.status}`,
          detail: errText.slice(0, 300),
        }),
        {
          status: 502,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    type OsAuctionListResponse = {
      data?: OsAuction[];
      responseMetadata?: { pagination?: { totalElements?: number } };
      pagination?: { totalElements?: number };
    };
    const auctJson = (await auctRes.json()) as OsAuctionListResponse | OsAuction[];

    // The v1 API wraps data in AnalyticaResponse → data is the list
    const auctions: OsAuction[] = Array.isArray(auctJson)
      ? auctJson
      : Array.isArray(auctJson.data)
      ? auctJson.data
      : [];
    const pagination = (Array.isArray(auctJson)
      ? undefined
      : auctJson.responseMetadata?.pagination ?? auctJson.pagination) ?? {};
    const totalAvailable = pagination.totalElements ?? auctions.length;

    log.info("received auctions", {
      received: auctions.length,
      total_available: totalAvailable,
      page,
      daily_limit: DAILY_AUCTION_LIMIT,
      today_synced_before: todaySynced,
      remaining,
    });

    if (auctions.length === 0) {
      await logSync(sb, "success", null, { endpoint, total: 0, page }, 0);
      return new Response(
        JSON.stringify({ ok: true, total: 0, imported: 0, updated: 0, page, daily_limit: DAILY_AUCTION_LIMIT, today_synced: todaySynced }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Map all auctions
    const mapped = auctions.map(mapAuctionToListing);

    // Fetch existing OS auction IDs in one query
    const osIds = mapped.map((m) => m.tagKey);
    const { data: existingRows } = await sb
      .from("listings")
      .select("id, tags")
      .overlaps("tags", osIds);

    type ListingIdTagsRow = { id: string; tags?: string[] | null };
    const existingMap: Record<string, string> = {};
    for (const row of (existingRows ?? []) as ListingIdTagsRow[]) {
      for (const tag of row.tags ?? []) {
        if (tag.startsWith("os_auction:")) existingMap[tag] = row.id;
      }
    }

    type ListingUpdate = Partial<MappedListingRow> & { updated_at?: string };
    const toInsert: MappedListingRow[] = [];
    const toUpdate: { id: string; data: ListingUpdate }[] = [];

    for (const { tagKey, row } of mapped) {
      if (existingMap[tagKey]) {
        toUpdate.push({
          id: existingMap[tagKey],
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
            tags: row.tags,
            website_url: row.website_url,
            // Only set cover_image_url if we have a Street View URL to avoid overwriting existing photos
            ...(row.cover_image_url ? { cover_image_url: row.cover_image_url } : {}),
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
      const { error } = await sb.from("listings").insert(chunk);
      if (error) {
        log.error("insert failed", { err: error.message, chunk_size: chunk.length });
        errors += chunk.length;
      } else {
        imported += chunk.length;
      }
    }

    // Update existing auctions
    for (const u of toUpdate) {
      const { error } = await sb
        .from("listings")
        .update(u.data)
        .eq("id", u.id);
      if (error) {
        log.error("update failed", { err: error.message, listing_id: u.id });
        errors++;
      } else {
        updated++;
      }
    }

    const summary = {
      endpoint,
      total: auctions.length,
      totalAvailableInOS: totalAvailable,
      imported,
      updated,
      errors,
      page,
      size,
      filter: filterRequest,
      daily_limit: DAILY_AUCTION_LIMIT,
      today_synced_before: todaySynced,
      today_synced_after: todaySynced + imported + updated,
    };

    await logSync(
      sb,
      errors > 0 && imported + updated === 0 ? "error" : "success",
      errors > 0 ? `${errors} item(s) failed` : null,
      summary,
      imported + updated
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
