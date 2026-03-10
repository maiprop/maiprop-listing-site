/**
 * poll-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls FUTURE auctions from maiProp OS via GET /api/auctions/future and
 * bulk-upserts them as Hub listings (listing_type='auction', status='active').
 *
 * Uses EdgeRuntime.waitUntil() to process in the background so the HTTP
 * response returns immediately and avoids gateway timeouts.
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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
  const catKey  = mapCategory(a.category);
  const catGr   = CATEGORY_GR[catKey] ?? "Ακίνητο";
  const city    = a.city ?? "Ελλάδα";
  const price   = Number(a.starting_price ?? 0);
  const priceStr = price > 0 ? ` – €${price.toLocaleString("el-GR")}` : "";
  return `Πλειστηριασμός ${catGr} | ${city}${priceStr}`;
}

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

async function runPoll(sb: any, city: string | null, limit: number) {
  const OS_URL   = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS  = Deno.env.get("MAIPROP_OS_PASSWORD");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(sb, "skipped", "OS credentials not configured");
    return;
  }

  try {
    console.log("poll-os-auctions: authenticating...");
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const params = new URLSearchParams({ limit: String(limit) });
    if (city) params.set("city", city);
    const endpoint = `/api/auctions/future?${params.toString()}`;
    console.log(`poll-os-auctions: fetching ${OS_URL}${endpoint}`);

    const auctRes = await fetch(`${OS_URL}${endpoint}`, {
      method: "GET",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
    });

    if (!auctRes.ok) {
      const errText = await auctRes.text();
      await logSync(sb, "error", `OS auction fetch failed (${auctRes.status}): ${errText.slice(0, 500)}`);
      return;
    }

    const auctJson: any   = await auctRes.json();
    const auctions: any[] = Array.isArray(auctJson) ? auctJson : (auctJson.data ?? []);
    const totalAvailable  = auctJson?.total ?? auctions.length;

    console.log(`poll-os-auctions: got ${auctions.length} auctions (total in OS: ${totalAvailable})`);

    if (auctions.length === 0) {
      await logSync(sb, "success", null, { endpoint, total: 0, city: city ?? "all" }, 0);
      return;
    }

    // Fetch existing tags in one query
    const osIds = auctions.map((a: any) => `os_auction:${a.id}`);
    const { data: existingRows } = await sb
      .from("listings")
      .select("id, tags")
      .overlaps("tags", osIds);

    const existingMap: Record<string, string> = {};
    for (const row of (existingRows ?? [])) {
      for (const tag of (row.tags ?? [])) {
        if (tag.startsWith("os_auction:")) existingMap[tag] = row.id;
      }
    }

    const toInsert: any[] = [];
    const toUpdate: any[] = [];

    for (const a of auctions) {
      const osId   = String(a.id ?? "unknown");
      const tagKey = `os_auction:${osId}`;
      const price  = Number(a.starting_price ?? 0);
      const catKey = mapCategory(a.category);

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
          latitude:             a.lat != null ? Number(a.lat) : null,
          longitude:            a.lng != null ? Number(a.lng) : null,
          sqm:                  1,
          cover_image_url:      null,
          owner_id:             null,
          ai_score:             80,
          tags:                 [tagKey, "source:maiprop-os", `auction_status:${a.status ?? "scheduled"}`],
        });
      }
    }

    let imported = 0, updated = 0, errors = 0;
    const CHUNK = 50;

    for (let i = 0; i < toInsert.length; i += CHUNK) {
      const chunk = toInsert.slice(i, i + CHUNK);
      const { error } = await sb.from("listings").insert(chunk);
      if (error) { console.error("Bulk insert error:", error.message); errors += chunk.length; }
      else imported += chunk.length;
    }

    for (const u of toUpdate) {
      const { error } = await sb.from("listings").update({
        price:                u.price,
        auction_starting_bid: u.auction_starting_bid,
        auction_date:         u.auction_date,
        auction_court:        u.auction_court,
        status:               "active",
        updated_at:           new Date().toISOString(),
      }).eq("id", u.id);
      if (error) { console.error("Update error:", error.message); errors++; }
      else updated++;
    }

    const summary = { endpoint, total: auctions.length, totalAvailableInOS: totalAvailable, imported, updated, errors, city: city ?? "all", limit };
    await logSync(sb, errors > 0 && (imported + updated) === 0 ? "error" : "success", errors > 0 ? `${errors} item(s) failed` : null, summary, imported + updated);
    console.log("poll-os-auctions done:", JSON.stringify(summary));

  } catch (err: any) {
    console.error("poll-os-auctions error:", err.message);
    await logSync(sb, "error", err.message);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const body  = await req.json().catch(() => ({}));
  const city  = body.city  ?? null;
  const limit = body.limit ?? 1000;

  // Return immediately — process in background to avoid gateway timeout
  const jobId = crypto.randomUUID();
  console.log(`poll-os-auctions: queued job ${jobId}`);

  // @ts-ignore — EdgeRuntime.waitUntil keeps the function alive after response
  EdgeRuntime.waitUntil(runPoll(sb, city, limit));

  return new Response(
    JSON.stringify({ ok: true, status: "queued", jobId, message: "Auction poll started in background. Check sync_log for results." }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
