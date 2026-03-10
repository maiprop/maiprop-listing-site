/**
 * poll-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls FUTURE auctions from maiProp OS via GET /api/auctions/future and
 * bulk-upserts them as Hub listings (listing_type='auction', status='active').
 *
 * Endpoint: GET /api/auctions/future?city=...&limit=1000
 * Response:  { data: [...], total: N }
 *
 * Fields returned per auction:
 *   id, title, address, city, lat, lng,
 *   auction_date, starting_price, category, status
 *
 * AI Enhancement: only for single-item calls (ai=true in body).
 * Bulk runs use structured Greek titles for speed.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── OS category → Hub property_type ──────────────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  RESIDENCE:          "apartment",
  APARTMENT:          "apartment",
  HOUSE:              "house",
  VILLA:              "villa",
  LAND:               "land",
  PLOT:               "land",
  PLOT_WITH_BUILDING: "land",
  LAND_WITH_BUILDING: "land",
  COMMERCIAL:         "commercial",
  OFFICE:             "office",
  STORE:              "commercial",
  WAREHOUSE:          "commercial",
  INDUSTRIAL:         "commercial",
  STOREROOM:          "commercial",
};

const CATEGORY_GR: Record<string, string> = {
  apartment:  "Διαμέρισμα",
  house:      "Κατοικία",
  villa:      "Βίλα",
  land:       "Γη / Οικόπεδο",
  commercial: "Επαγγελματικός Χώρος",
  office:     "Γραφείο",
};

function mapCategory(cat?: string): string {
  if (!cat) return "apartment";
  return CATEGORY_MAP[cat.toUpperCase()] ?? "apartment";
}

function buildTitle(a: any): string {
  const catKey = mapCategory(a.category);
  const catGr  = CATEGORY_GR[catKey] ?? "Ακίνητο";
  const city   = a.city ?? "Ελλάδα";
  const price  = Number(a.starting_price ?? 0);
  const priceStr = price > 0 ? ` – €${price.toLocaleString("el-GR")}` : "";
  return `Πλειστηριασμός ${catGr} | ${city}${priceStr}`;
}

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) throw new Error(`OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  return token;
}

// ── Sync logger ───────────────────────────────────────────────────────────────
async function logSync(
  sb: any,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0,
) {
  try {
    await sb.from("sync_log").insert({
      direction:     "os_to_hub",
      entity_type:   "auction",
      entity_id:     "poll-batch",
      status,
      error_message: error_message ?? null,
      payload:       payload ?? null,
      records_affected,
    });
  } catch (e) {
    console.warn("logSync failed:", e);
  }
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const OS_URL   = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS  = Deno.env.get("MAIPROP_OS_PASSWORD");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(sb, "skipped", "OS credentials not configured");
    return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "OS credentials not configured" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body  = await req.json().catch(() => ({}));
    const city  = body.city  ?? null;
    const limit = body.limit ?? 1000;

    // 1. Authenticate
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // 2. Call GET /api/auctions/future
    const params = new URLSearchParams({ limit: String(limit) });
    if (city) params.set("city", city);

    const endpoint = `/api/auctions/future?${params.toString()}`;
    console.log(`Fetching: ${OS_URL}${endpoint}`);

    const auctRes = await fetch(`${OS_URL}${endpoint}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!auctRes.ok) {
      const errText = await auctRes.text();
      await logSync(sb, "error", `OS auction fetch failed (${auctRes.status}): ${errText.slice(0, 500)}`);
      return new Response(JSON.stringify({ error: `OS returned ${auctRes.status}`, detail: errText.slice(0, 300) }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auctJson: any       = await auctRes.json();
    const auctions: any[]     = Array.isArray(auctJson) ? auctJson : (auctJson.data ?? []);
    const totalAvailable      = auctJson?.total ?? auctions.length;

    if (auctions.length === 0) {
      await logSync(sb, "success", null, { endpoint, total: 0, city: city ?? "all" }, 0);
      return new Response(JSON.stringify({ ok: true, endpoint, total: 0, imported: 0, updated: 0 }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 3. Fetch existing OS auction IDs in one query
    const osIds = auctions.map((a: any) => `os_auction:${a.id}`);
    const { data: existingRows } = await sb
      .from("listings")
      .select("id, tags")
      .overlaps("tags", osIds);

    // Build a lookup: tag → listing id
    const existingMap: Record<string, string> = {};
    for (const row of (existingRows ?? [])) {
      for (const tag of (row.tags ?? [])) {
        if (tag.startsWith("os_auction:")) existingMap[tag] = row.id;
      }
    }

    // 4. Build insert/update batches
    const toInsert: any[] = [];
    const toUpdate: { id: string; price: number; auction_starting_bid: number; auction_date: string | null; auction_court: string | null }[] = [];

    for (const a of auctions) {
      const osId   = String(a.id ?? "unknown");
      const tagKey = `os_auction:${osId}`;

      const price   = Number(a.starting_price ?? 0);
      const catKey  = mapCategory(a.category);

      if (existingMap[tagKey]) {
        toUpdate.push({
          id:                   existingMap[tagKey],
          price,
          auction_starting_bid: price,
          auction_date:         a.auction_date ?? null,
          auction_court:        a.status ?? null,
        });
      } else {
        toInsert.push({
          title:                buildTitle(a),
          description:          null,
          price,
          auction_starting_bid: price,
          auction_date:         a.auction_date ?? null,
          auction_court:        a.status ?? null,
          property_type:        catKey,
          listing_type:         "auction",
          status:               "active",
          city:                 a.city ?? "Ελλάδα",
          address:              a.address ?? null,
          latitude:             a.lat   != null ? Number(a.lat)  : null,
          longitude:            a.lng   != null ? Number(a.lng)  : null,
          sqm:                  1,
          cover_image_url:      null,
          owner_id:             null,
          ai_score:             80,
          tags:                 [tagKey, "source:maiprop-os", `auction_status:${a.status ?? "scheduled"}`],
        });
      }
    }

    let imported = 0;
    let updated  = 0;
    let errors   = 0;

    // 5a. Bulk insert new auctions in chunks of 50
    const CHUNK = 50;
    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await sb.from("listings").insert(chunk);
      if (error) {
        console.error("Bulk insert error:", error.message);
        errors += chunk.length;
      } else {
        imported += chunk.length;
      }
    }

    // 5b. Bulk update existing auctions (individual updates — Supabase doesn't support true bulk update)
    for (const u of toUpdate) {
      const { error } = await sb.from("listings").update({
        price:                u.price,
        auction_starting_bid: u.auction_starting_bid,
        auction_date:         u.auction_date,
        auction_court:        u.auction_court,
        status:               "active",
        updated_at:           new Date().toISOString(),
      }).eq("id", u.id);
      if (error) {
        console.error("Update error:", error.message);
        errors++;
      } else {
        updated++;
      }
    }

    const summary = {
      endpoint,
      total:              auctions.length,
      totalAvailableInOS: totalAvailable,
      imported,
      updated,
      errors,
      aiGenerated:        0,
      city:               city ?? "all",
      limit,
    };

    await logSync(
      sb,
      errors > 0 && (imported + updated) === 0 ? "error" : "success",
      errors > 0 ? `${errors} item(s) failed` : null,
      summary,
      imported + updated,
    );

    console.log("poll-os-auctions summary:", JSON.stringify(summary));

    return new Response(JSON.stringify({ ok: true, ...summary }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("poll-os-auctions error:", err.message);
    await logSync(sb, "error", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
