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

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  entity_type: string,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0
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
    console.warn("logSync failed:", e);
  }
}

function mapAuctionToListing(a: any) {
  const osId = String(a.auctionListingId ?? "unknown");
  const tagKey = `os_auction:${osId}`;
  const catKey = mapCategory(a.propertyCategory);
  const price = Number(a.firstPriceOffer ?? 0);
  const auctionUrl: string | null =
    a.url ?? a.auctionUrl ?? a.listingUrl ?? a.eAuctionUrl ?? null;
  const googleMapsKey = Deno.env.get("GOOGLE_MAPS_API_KEY");
  const lat = a.propertyLatitude != null ? Number(a.propertyLatitude) : null;
  const lng = a.propertyLongitude != null ? Number(a.propertyLongitude) : null;
  const streetViewUrl =
    googleMapsKey && lat && lng
      ? `https://maps.googleapis.com/maps/api/streetview?size=800x450&location=${lat},${lng}&fov=90&pitch=10&key=${googleMapsKey}`
      : null;
  const rawOwnership: string | undefined = a.ownershipStatus;
  const ownershipPct: number | undefined =
    a.ownershipPercentage != null ? Number(a.ownershipPercentage) : undefined;
  let ownershipTag: string | null = null;
  if (rawOwnership) {
    const occ = rawOwnership.toUpperCase();
    if (occ === "FULL" || occ === "COMPLETE") ownershipTag = "ownership:full";
    else if (occ === "PARTIAL" || occ === "FRACTIONAL")
      ownershipTag = "ownership:partial";
    else if (
      occ === "COMMON" ||
      occ === "JOINT" ||
      occ === "SHARED" ||
      occ === "CO_OWNERSHIP"
    )
      ownershipTag = "ownership:common";
    else if (occ === "NONE" || occ === "NO_OWNERSHIP" || occ === "ZERO")
      ownershipTag = "ownership:none";
    else ownershipTag = `ownership:${occ.toLowerCase()}`;
  } else if (ownershipPct != null) {
    if (ownershipPct >= 100) ownershipTag = "ownership:full";
    else if (ownershipPct > 0) ownershipTag = "ownership:partial";
    else ownershipTag = "ownership:none";
  }
  return {
    tagKey,
    row: {
      title: buildTitle(a),
      description: null,
      website_url: auctionUrl,
      cover_image_url: streetViewUrl,
      price,
      price_per_sqm:
        a.pricePerSquareMeter != null ? Number(a.pricePerSquareMeter) : null,
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
      latitude:
        a.propertyLatitude != null ? Number(a.propertyLatitude) : null,
      longitude:
        a.propertyLongitude != null ? Number(a.propertyLongitude) : null,
      sqm: a.propertySquareMeters != null ? Number(a.propertySquareMeters) : 1,
      floor: a.propertyFloor != null ? Math.round(Number(a.propertyFloor)) : null,
      total_floors:
        a.numberOfFloors != null ? Math.round(Number(a.numberOfFloors)) : null,
      year_built:
        a.constructionYear != null ? Number(a.constructionYear) : null,
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
      ],
    },
  };
}

const DEFAULT_PAGE_SIZE = 100;
const MAX_PAGES = 200; // safety cap

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
    await logSync(sb, "auction", "skipped", "OS credentials not configured");
    return new Response(
      JSON.stringify({
        ok: true,
        status: "skipped",
        reason: "OS credentials not configured",
        sync: { auctions: { imported: 0, updated: 0, pages: 0 } },
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json().catch(() => ({}));
    const pageSize = Math.min(
      Number(body.pageSize ?? body.size ?? DEFAULT_PAGE_SIZE),
      500
    );
    const maxPages = Math.min(Number(body.maxPages ?? MAX_PAGES), 500);
    const startPage = Math.max(0, Number(body.startPage ?? 0));

    const today = new Date().toISOString().split("T")[0];
    const baseFilter: Record<string, any> = {
      auctionDateFrom: body.auctionDateFrom ?? today,
      ...(body.auctionDateTo && { auctionDateTo: body.auctionDateTo }),
      ...(body.propertyCategories && {
        propertyCategories: body.propertyCategories,
      }),
      ...(body.prefectureId && { prefectureId: body.prefectureId }),
      ...(body.auctionStatuses && { auctionStatuses: body.auctionStatuses }),
    };

    console.log("full-sync-from-os: authenticating...");
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    let totalImported = 0;
    let totalUpdated = 0;
    let totalErrors = 0;
    let pagesDone = 0;
    let totalAvailableInOS = 0;

    for (let page = 0; page < maxPages; page++) {
      const filterRequest = { ...baseFilter };
      const endpoint = `/api/v1/auctions/filter/details?page=${page}&size=${pageSize}`;
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
        30_000
      );

      if (!auctRes.ok) {
        const errText = await auctRes.text();
        await logSync(
          sb,
          "auction",
          "error",
          `OS auction fetch failed (${auctRes.status}): ${errText.slice(0, 500)}`,
          { page, endpoint }
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
          }
        );
      }

      const auctJson: any = await auctRes.json();
      const auctions: any[] = Array.isArray(auctJson)
        ? auctJson
        : Array.isArray(auctJson.data)
        ? auctJson.data
        : [];
      const pagination = auctJson.pagination ?? {};
      totalAvailableInOS = pagination.totalElements ?? totalAvailableInOS;

      if (auctions.length === 0) {
        console.log(`full-sync-from-os: page ${page} empty, stopping`);
        break;
      }

      const mapped = auctions.map(mapAuctionToListing);
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
        const { error } = await sb.from("listings").insert(chunk);
        if (error) {
          console.error("Insert error:", error.message);
          totalErrors += chunk.length;
        } else {
          totalImported += chunk.length;
        }
      }
      for (const u of toUpdate) {
        const { error } = await sb
          .from("listings")
          .update(u.data)
          .eq("id", u.id);
        if (error) {
          console.error("Update error:", error.message);
          totalErrors++;
        } else {
          totalUpdated++;
        }
      }

      pagesDone++;
      console.log(
        `full-sync-from-os: page ${page} → imported ${toInsert.length}, updated ${toUpdate.length}`
      );

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
      totalErrors > 0 && totalImported + totalUpdated === 0 ? "error" : "success",
      totalErrors > 0 ? `${totalErrors} item(s) failed` : null,
      summary,
      totalImported + totalUpdated
    );

    console.log("full-sync-from-os done:", JSON.stringify(summary));

    return new Response(
      JSON.stringify({
        ok: true,
        status: "success",
        sync: summary,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("full-sync-from-os error:", err.message);
    return new Response(
      JSON.stringify({ ok: false, error: err.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
