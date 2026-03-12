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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// OS propertyCategory → Hub property_type
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

function buildTitle(a: any): string {
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
  sb: any,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0
) {
  try {
    await sb.from("sync_log").insert({
      direction: "os_to_hub",
      entity_type: "auction",
      entity_id: "poll-batch",
      status,
      error_message: error_message ?? null,
      payload: payload ?? null,
      records_affected,
    });
  } catch (e) {
    console.warn("logSync failed:", e);
  }
}

/**
 * Map an AuctionOutputDto from the OS API to a Hub listing row.
 */
function mapAuctionToListing(a: any) {
  const osId = String(a.auctionListingId ?? "unknown");
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(a.propertyCategory);
  const price = Number(a.firstPriceOffer ?? 0);

  // Extract the auction URL — OS may return it as `url`, `auctionUrl`, or `listingUrl`
  const auctionUrl: string | null =
    a.url ?? a.auctionUrl ?? a.listingUrl ?? a.eAuctionUrl ?? null;

  return {
    tagKey,
    row: {
      title: buildTitle(a),
      description: null,
      website_url: auctionUrl,
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
      cover_image_url: null,
      owner_id: null,
      ai_score: 80,
      tags: [
        tagKey,
        "source:maiprop-os",
        `auction_status:${a.auctionStatus ?? "scheduled"}`,
        ...(a.currentRound != null ? [`round:${a.currentRound}`] : []),
      ],
    },
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

Deno.serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

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

    // Build AuctionFilterRequest from caller params
    const filterRequest: Record<string, any> = {};

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

    // Pagination
    const page = Number(body.page ?? 0);
    const size = Math.min(Number(body.size ?? 100), 500);

    console.log(
      `poll-os-auctions: authenticating against ${OS_URL}...`
    );
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const endpoint = `/api/v1/auctions/filter/details?page=${page}&size=${size}`;
    console.log(
      `poll-os-auctions: POST ${OS_URL}${endpoint}`,
      JSON.stringify(filterRequest)
    );

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

    const auctJson: any = await auctRes.json();

    // The v1 API wraps data in AnalyticaResponse → data is the list
    const auctions: any[] = Array.isArray(auctJson)
      ? auctJson
      : Array.isArray(auctJson.data)
      ? auctJson.data
      : [];
    const pagination = auctJson.pagination ?? {};
    const totalAvailable = pagination.totalElements ?? auctions.length;

    console.log(
      `poll-os-auctions: received ${auctions.length} auctions (total: ${totalAvailable}, page: ${page})`
    );

    if (auctions.length === 0) {
      await logSync(sb, "success", null, { endpoint, total: 0, page }, 0);
      return new Response(
        JSON.stringify({ ok: true, total: 0, imported: 0, updated: 0, page }),
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

    const existingMap: Record<string, string> = {};
    for (const row of existingRows ?? []) {
      for (const tag of row.tags ?? []) {
        if (tag.startsWith("os_auction:")) existingMap[tag] = row.id;
      }
    }

    const toInsert: any[] = [];
    const toUpdate: { id: string; data: any }[] = [];

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
        console.error("Insert error:", error.message);
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
        console.error("Update error:", error.message);
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
    };

    await logSync(
      sb,
      errors > 0 && imported + updated === 0 ? "error" : "success",
      errors > 0 ? `${errors} item(s) failed` : null,
      summary,
      imported + updated
    );

    console.log("poll-os-auctions done:", JSON.stringify(summary));

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("poll-os-auctions error:", err.message);
    await logSync(sb, "error", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
