/**
 * poll-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls auctions from maiProp OS using verified auth + real field names from
 * the live API schema, and upserts them as Hub listings (listing_type='auction').
 *
 * Auth: POST /auth/login → { data: { token } }
 * Fetch: POST /api/v1/auctions/filter/details → { responseMetadata, data: [...] }
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── OS propertyCategory → Hub property_type ──────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  RESIDENCE:   "apartment",
  APARTMENT:   "apartment",
  HOUSE:       "house",
  VILLA:       "villa",
  LAND:        "land",
  PLOT:        "land",
  COMMERCIAL:  "commercial",
  OFFICE:      "office",
  STORE:       "commercial",
  WAREHOUSE:   "commercial",
  INDUSTRIAL:  "commercial",
};

function mapCategory(cat?: string): string {
  if (!cat) return "apartment";
  return CATEGORY_MAP[cat.toUpperCase()] ?? "apartment";
}

function buildTitle(a: any): string {
  const cat = a.propertyCategory
    ? (CATEGORY_MAP[a.propertyCategory.toUpperCase()] ?? a.propertyCategory)
    : "Property";
  const displayCat = cat.charAt(0).toUpperCase() + cat.slice(1);
  const city = a.propertyMunicipalityName ?? a.city ?? "";
  const court = a.auctionStatus ? ` [${a.auctionStatus}]` : "";
  return `[Πλειστηριασμός] ${displayCat} – ${city}${court}`;
}

// ── Verified auth helper ──────────────────────────────────────────────────────
async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  // OS response shape: { responseMetadata: {...}, data: { token, expiresIn, ... } }
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) {
    throw new Error(`OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return token;
}

// ── Sync logger ───────────────────────────────────────────────────────────────
async function logSync(
  supabase: any,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0,
) {
  await supabase.from("sync_log").insert({
    direction: "os_to_hub",
    entity_type: "auction",
    entity_id: "poll-batch",
    status,
    error_message: error_message ?? null,
    payload: payload ?? null,
    records_affected,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const OS_URL   = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS  = Deno.env.get("MAIPROP_OS_PASSWORD");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(supabase, "skipped",
      "MAIPROP_OS_URL / MAIPROP_OS_EMAIL / MAIPROP_OS_PASSWORD not configured");
    return new Response(JSON.stringify({ ok: true, status: "skipped" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // 1. Authenticate
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // 2. Build filter — support optional overrides from caller
    // Default dateFrom = today (ISO date string) to only fetch FUTURE auctions
    const today = new Date().toISOString().split("T")[0]; // "YYYY-MM-DD"

    const filterPayload: Record<string, unknown> = {
      page:     body.page     ?? 0,
      pageSize: body.pageSize ?? body.size ?? 100,
      dateFrom: body.dateFrom ?? today, // Only future auctions by default
    };
    // Optional: filter by status, date range, region etc.
    if (body.auctionStatus)    filterPayload.auctionStatus    = body.auctionStatus;
    if (body.propertyCategory) filterPayload.propertyCategory = body.propertyCategory;
    if (body.dateTo)           filterPayload.dateTo           = body.dateTo;

    // 3. Fetch auctions
    const auctRes = await fetch(`${OS_URL}/api/v1/auctions/filter/details`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(filterPayload),
    });

    if (!auctRes.ok) {
      const errText = await auctRes.text();
      await logSync(supabase, "error", `OS auction fetch failed (${auctRes.status}): ${errText}`);
      return new Response(JSON.stringify({ error: `OS returned ${auctRes.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auctJson = await auctRes.json();
    // OS wraps list in { data: [...], responseMetadata: { pagination: { totalElements } } }
    const auctions: any[] = Array.isArray(auctJson)
      ? auctJson
      : (auctJson.data ?? auctJson.content ?? []);

    const totalAvailable = auctJson?.responseMetadata?.pagination?.totalElements ?? auctions.length;

    let imported = 0;
    let updated  = 0;
    let errors   = 0;

    // 4. Upsert each auction (skip past auctions as a safety net)
    const nowMs = Date.now();
    for (const a of auctions) {
      // Skip if auctionDate is in the past
      if (a.auctionDate) {
        const auctionMs = new Date(a.auctionDate).getTime();
        if (!isNaN(auctionMs) && auctionMs < nowMs) continue;
      }
      try {
        const osId   = String(a.auctionListingId ?? a.id ?? "unknown");
        const tagKey = `os_auction:${osId}`;

        // Map OS fields (real names from AuctionOutputDto schema) → Hub fields
        // propertyFloor can be -0.5 (semi-basement) in Greek buildings → floor(x) → int
        const safeFloor = (v: any): number | null => {
          if (v == null) return null;
          const n = Number(v);
          return isNaN(n) ? null : Math.floor(n);
        };

        const mapped: Record<string, unknown> = {
          title:                buildTitle(a),
          description:          a.description ?? null,
          price:                Number(a.firstPriceOffer ?? a.registrationAmount ?? 0),
          price_per_sqm:        a.pricePerSquareMeter ? Number(a.pricePerSquareMeter) : null,
          auction_starting_bid: Number(a.firstPriceOffer ?? a.registrationAmount ?? 0),
          auction_date:         a.auctionDate ?? null,         // "YYYY-MM-DD"
          auction_court:        a.auctionStatus ?? null,       // COMPLETED / PENDING / etc.
          property_type:        mapCategory(a.propertyCategory),
          listing_type:         "auction",
          status:               "active",
          city:                 a.propertyMunicipalityName ?? a.city ?? "Άγνωστο",
          region:               a.propertyPrefectureName   ?? null,
          address:              a.propertyAddress          ?? null,
          postal_code:          a.propertyPostalCode        ?? null,
          latitude:             a.propertyLatitude  ? Number(a.propertyLatitude)  : null,
          longitude:            a.propertyLongitude ? Number(a.propertyLongitude) : null,
          sqm:                  Number(a.propertySquareMeters ?? 1),
          floor:                safeFloor(a.propertyFloor),
          total_floors:         safeFloor(a.numberOfFloors),
          year_built:           a.constructionYear ? Number(a.constructionYear) : null,
          cadastre_number:      a.propertyFullKaek ?? null,
          // No images — OS URL field is an S3 bucket link, not a direct image URL
          cover_image_url:      null,
          // OS-imported listings have no Hub user owner (owner_id is now nullable)
          owner_id:             null,
        };

        // Extra metadata as tags
        const extraTags: string[] = [
          tagKey,
          "source:maiprop-os",
          `municipality_id:${a.propertyMunicipalityId ?? ""}`,
        ];
        if (a.ownershipStatus) extraTags.push(`ownership:${a.ownershipStatus}`);
        if (a.auctionStatus)   extraTags.push(`auction_status:${a.auctionStatus}`);

        // Dedup check
        const { data: existing } = await supabase
          .from("listings")
          .select("id")
          .contains("tags", [tagKey])
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from("listings")
            .update({ ...mapped, updated_at: new Date().toISOString() })
            .eq("id", existing.id);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await supabase
            .from("listings")
            .insert({ ...mapped, tags: extraTags });
          if (error) throw error;
          imported++;
        }
      } catch (itemErr: any) {
        console.error("Upsert error:", itemErr.message, JSON.stringify(a).slice(0, 200));
        errors++;
      }
    }

    const summary = {
      total:           auctions.length,
      totalAvailableInOS: totalAvailable,
      imported,
      updated,
      errors,
      page:            filterPayload.page,
      pageSize:        filterPayload.pageSize,
    };

    await logSync(
      supabase,
      errors > 0 && (imported + updated) === 0 ? "error" : "success",
      errors > 0 ? `${errors} item(s) failed to upsert` : null,
      summary,
      imported + updated,
    );

    console.log("poll-os-auctions summary:", summary);

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("poll-os-auctions error:", err.message);
    await logSync(supabase, "error", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
