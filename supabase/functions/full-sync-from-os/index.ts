/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * full-sync-from-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Full sync from maiProp OS → Listing site (Hub).
 * - Auctions: fetches all pages from POST /api/v1/auctions/filter/details and upserts into listings.
 * - Extensible: add reports, professionals, or other OS APIs here when available.
 *
 * Firesale → OS is unchanged (sync-firesale-to-os). This function is OS → Hub only.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { fetchBufferedProviderResponse } from "../_shared/providerFetch.ts";
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
import { type FullSyncRequest, parseFullSyncRequest } from "./request.ts";

const log = createLogger("full-sync-from-os");
const limiter = makeRateLimiter({
  bucket: "full-sync-from-os",
  maxRequests: 3,
  windowMs: 60_000,
});
export const OS_TOKEN_RESPONSE_MAX_BYTES = 64 * 1_024;
export const OS_AUCTION_PAGE_RESPONSE_MAX_BYTES = 8 * 1_024 * 1_024;

type SupabaseAdminClient = ReturnType<
  typeof createClient<Record<string, unknown>>
>;

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

function mapCategory(cat?: string): string {
  if (!cat) return "apartment";
  return CATEGORY_MAP[cat.toUpperCase()] ?? "apartment";
}

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

function buildTitle(a: any): string {
  const catKey = mapCategory(a.propertyCategory);
  const catGr = CATEGORY_GR[catKey] ?? "Ακίνητο";
  const city = a.propertyMunicipalityName ?? "Ελλάδα";
  const price = Number(a.firstPriceOffer ?? 0);
  const priceStr = price > 0 ? ` – €${price.toLocaleString("el-GR")}` : "";
  return `Πλειστηριασμός ${catGr} | ${city}${priceStr}`;
}

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
  sb: any,
  entity_type: string,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0,
) {
  try {
    await sb.from("sync_log").insert({
      direction: "os_to_hub",
      entity_type,
      entity_id: "full-sync",
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

function mapAuctionToListing(a: any) {
  const osId = requireOsAuctionId(a.auctionListingId);
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(a.propertyCategory);
  const price = Number(a.firstPriceOffer ?? 0);
  const auctionUrl: string | null = a.url ?? a.auctionUrl ?? a.listingUrl ??
    a.eAuctionUrl ?? null;
  // Street View via proxy so API key is never stored in listings
  const supabaseUrl = Deno.env.get("SUPABASE_URL")?.replace(/\/$/, "");
  const lat = a.propertyLatitude != null ? Number(a.propertyLatitude) : null;
  const lng = a.propertyLongitude != null ? Number(a.propertyLongitude) : null;
  const streetViewUrl = supabaseUrl && lat != null && lng != null
    ? `${supabaseUrl}/functions/v1/streetview-proxy?size=800x450&lat=${lat}&lng=${lng}`
    : null;
  const rawOwnership: string | undefined = a.ownershipStatus;
  const ownershipPct: number | undefined = a.ownershipPercentage != null
    ? Number(a.ownershipPercentage)
    : undefined;
  let ownershipTag: string | null = mapOwnershipStatusToTag(rawOwnership);
  if (!ownershipTag && ownershipPct != null) {
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

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety cap

async function requireAgent(
  req: Request,
  sb: SupabaseAdminClient,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
  const token = authHeader.slice(7);
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
  return null;
}

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

  const authErr = await requireAgent(req, sb, corsHeaders);
  if (authErr) return authErr;

  let body: FullSyncRequest;
  try {
    body = await parseFullSyncRequest(req);
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

  if (body.replaceAll === true || body.replace_all === true) {
    return new Response(
      JSON.stringify({
        ok: false,
        code: "replace_all_disabled",
        error:
          "replaceAll requires an atomic complete-snapshot reconciliation and is temporarily disabled",
      }),
      {
        status: 409,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(sb, "auction", "skipped", "OS credentials not configured");
    return new Response(
      JSON.stringify({
        ok: true,
        status: "skipped",
        reason: "OS credentials not configured",
        sync: { auctions: { imported: 0, updated: 0, pages: 0 } },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  try {
    const pageSize = body.pageSize ?? body.size ?? DEFAULT_PAGE_SIZE;
    const maxPages = body.maxPages ?? MAX_PAGES;
    const startPage = body.startPage ?? 0;

    const today = new Date().toISOString().split("T")[0];
    const baseFilter: Record<string, any> = {
      auctionDateFrom: body.auctionDateFrom ?? today,
      ...(body.auctionDateTo && { auctionDateTo: body.auctionDateTo }),
      ...(body.propertyCategories && {
        propertyCategories: body.propertyCategories,
      }),
      ...(body.prefectureId !== undefined && {
        prefectureId: body.prefectureId,
      }),
      ...(body.propertyMunicipalityId !== undefined && {
        propertyMunicipalityId: body.propertyMunicipalityId,
      }),
      ...(body.auctionStatuses && { auctionStatuses: body.auctionStatuses }),
    };

    log.info("authenticating with OS");
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    let totalImported = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let pagesDone = 0;
    let totalAvailableInOS = 0;

    for (let page = startPage; page < startPage + maxPages; page++) {
      const filterRequest = { ...baseFilter };
      const endpoint =
        `/api/v1/auctions/filter/details?page=${page}&pageSize=${pageSize}`;
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
        30_000,
        OS_AUCTION_PAGE_RESPONSE_MAX_BYTES,
      );

      if (!auctRes.ok) {
        const errText = await auctRes.text();
        await logSync(
          sb,
          "auction",
          "error",
          `OS auction fetch failed (${auctRes.status}): ${
            errText.slice(0, 500)
          }`,
          { page, endpoint },
        );
        return new Response(
          JSON.stringify({
            ok: false,
            error: `OS returned ${auctRes.status}`,
            detail: errText.slice(0, 300),
            sync: {
              auctions: {
                imported: totalImported,
                updated: totalUpdated,
                errors: totalErrors,
                pages: pagesDone,
              },
            },
          }),
          {
            status: 502,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          },
        );
      }

      const auctJson: any = await auctRes.json();
      const auctions: any[] = Array.isArray(auctJson)
        ? auctJson
        : Array.isArray(auctJson.data)
        ? auctJson.data
        : [];
      const pagination = auctJson.responseMetadata?.pagination ??
        auctJson.pagination ?? {};
      totalAvailableInOS = pagination.totalElements ?? totalAvailableInOS;

      if (auctions.length === 0) {
        log.info("page empty, stopping", { page });
        break;
      }

      const mapped = dedupeOsAuctionsById(auctions).map(mapAuctionToListing);
      requireValidOsAuctionBatch(auctions.length, mapped.length);
      const osIds = mapped.map((m) => m.osId);
      const existingRows = await lookupCanonicalOsListings(
        sb.from("listings") as unknown as OsAuctionListingTable,
        osIds,
      );

      const existingMap = new Map<string, CanonicalOsListing>();
      for (const row of existingRows) {
        existingMap.set(row.os_auction_id, row);
      }

      const toInsert: any[] = [];
      const toUpdate: { id: string; osId: string; data: any }[] = [];
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

      const CHUNK = 50;
      for (let i = 0; i < toInsert.length; i += CHUNK) {
        const chunk = toInsert.slice(i, i + CHUNK);
        try {
          totalImported += await insertOsAuctionRows(
            sb.from("listings") as unknown as OsAuctionListingTable,
            chunk,
          );
        } catch (error) {
          log.error("insert failed", {
            err: error instanceof Error ? error.message : String(error),
            chunk_size: chunk.length,
          });
          totalErrors += chunk.length;
        }
      }
      for (const u of toUpdate) {
        try {
          const didUpdate = await updateCanonicalOsListing(
            sb.from("listings") as unknown as OsAuctionListingTable,
            { id: u.id, osId: u.osId, data: u.data },
          );
          if (didUpdate) {
            totalUpdated++;
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
        totalErrors++;
      }

      pagesDone++;
      log.info("page processed", {
        page,
        imported: toInsert.length,
        updated: toUpdate.length,
      });

      if (auctions.length < pageSize) break;
    }

    const summary = {
      auctions: {
        imported: totalImported,
        updated: totalUpdated,
        errors: totalErrors,
        pages: pagesDone,
        totalAvailableInOS,
      },
    };

    await logSync(
      sb,
      "auction",
      totalErrors > 0 && totalImported + totalUpdated === 0
        ? "error"
        : "success",
      totalErrors > 0 ? `${totalErrors} item(s) failed` : null,
      summary,
      totalImported + totalUpdated,
    );

    log.info("sync done", { summary });

    return new Response(
      JSON.stringify({
        ok: true,
        status: "success",
        sync: summary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    const errMessage = err instanceof Error ? err.message : String(err);
    log.error("sync error", { err: errMessage });
    return new Response(
      JSON.stringify({ ok: false, error: errMessage }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
