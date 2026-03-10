/**
 * poll-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls FUTURE auctions from maiProp OS via GET /api/auctions/future and
 * upserts them as Hub listings (listing_type='auction', status='active').
 *
 * Endpoint: GET /api/auctions/future?city=...&limit=1000
 * Response:  { data: [...], total: N }
 *
 * Fields returned per auction:
 *   id, title, address, city, lat, lng,
 *   auction_date, starting_price, category, status
 *
 * AI Enhancement: For each NEW auction, Lovable AI generates a rich Greek
 * listing title and description based on the property metadata.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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
  land:       "Γη",
  commercial: "Επαγγελματικός χώρος",
  office:     "Γραφείο",
};

function mapCategory(cat?: string): string {
  if (!cat) return "apartment";
  return CATEGORY_MAP[cat.toUpperCase()] ?? "apartment";
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

// ── AI listing generator ──────────────────────────────────────────────────────
async function generateAiListing(
  a: any,
  lovableKey: string,
): Promise<{ title: string; description: string }> {
  const catKey = mapCategory(a.category);
  const catGr  = CATEGORY_GR[catKey] ?? "Ακίνητο";
  const city   = a.city ?? "Ελλάδα";
  const price  = Number(a.starting_price ?? 0);
  const date   = a.auction_date ?? "προσεχώς";

  const prompt = `Είσαι ειδικός σύντακτης αγγελιών ακινήτων για την ελληνική αγορά.

Δημιούργησε έναν επαγγελματικό τίτλο και μια πλήρη περιγραφή αγγελίας για τον παρακάτω πλειστηριασμό ακινήτου:

- Τύπος: ${catGr}
- Πόλη: ${city}
- Διεύθυνση: ${a.address ?? ""}
- Τιμή εκκίνησης: €${price.toLocaleString("el-GR")}
- Ημερομηνία πλειστηριασμού: ${date}
- Κατάσταση: ${a.status ?? "scheduled"}

ΟΔΗΓΙΕΣ:
1. Τίτλος: Σύντομος, περιεκτικός, επαγγελματικός τίτλος (max 80 χαρακτήρες). ΜΗΝ χρησιμοποιήσεις αγκύλες [].
2. Περιγραφή: 3-4 παράγραφοι στα ελληνικά. Ξεκίνα με τα βασικά χαρακτηριστικά, συνέχισε με τη θέση και τις επενδυτικές δυνατότητες, τέλειωσε με τις λεπτομέρειες του πλειστηριασμού. Γράψε επαγγελματικά, σαν μεγάλο μεσιτικό γραφείο.

Επέστρεψε ΜΟΝΟ έγκυρο JSON χωρίς markdown:
{"title": "string", "description": "string"}`;

  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${lovableKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.4,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`AI gateway error ${res.status}: ${errText.slice(0, 200)}`);
  }

  const json  = await res.json();
  const raw   = json?.choices?.[0]?.message?.content ?? "";
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();

  try {
    const parsed = JSON.parse(clean);
    return {
      title:       String(parsed.title       ?? "").slice(0, 200),
      description: String(parsed.description ?? ""),
    };
  } catch {
    return {
      title:       `Πλειστηριασμός ${catGr} – ${city}`,
      description: clean.slice(0, 2000),
    };
  }
}

// ── Sync logger ───────────────────────────────────────────────────────────────
async function logSync(
  sb: any,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0,
) {
  await sb.from("sync_log").insert({
    direction:        "os_to_hub",
    entity_type:      "auction",
    entity_id:        "poll-batch",
    status,
    error_message:    error_message ?? null,
    payload:          payload ?? null,
    records_affected,
  });
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const OS_URL      = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL    = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS     = Deno.env.get("MAIPROP_OS_PASSWORD");
  const LOVABLE_KEY = Deno.env.get("LOVABLE_API_KEY");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(sb, "skipped", "OS credentials not configured");
    return new Response(JSON.stringify({ ok: true, status: "skipped" }), {
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

    const auctRes = await fetch(`${OS_URL}/api/auctions/future?${params.toString()}`, {
      method: "GET",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json",
      },
    });

    if (!auctRes.ok) {
      const errText = await auctRes.text();
      await logSync(sb, "error", `OS auction fetch failed (${auctRes.status}): ${errText}`);
      return new Response(JSON.stringify({ error: `OS returned ${auctRes.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auctJson: any = await auctRes.json();
    // Expected shape: { data: [...], total: N }
    const auctions: any[]    = Array.isArray(auctJson) ? auctJson : (auctJson.data ?? []);
    const totalAvailable: number = auctJson?.total ?? auctions.length;

    let imported    = 0;
    let updated     = 0;
    let errors      = 0;
    let aiGenerated = 0;

    // 3. Upsert each auction
    for (const a of auctions) {
      try {
        const osId   = String(a.id ?? "unknown");
        const tagKey = `os_auction:${osId}`;

        // Dedup check — avoid re-generating AI title for existing records
        const { data: existing } = await sb
          .from("listings")
          .select("id, title")
          .contains("tags", [tagKey])
          .maybeSingle();

        let aiTitle       = existing?.title ?? null;
        let aiDescription: string | null = null;

        if (!existing && LOVABLE_KEY) {
          try {
            const ai  = await generateAiListing(a, LOVABLE_KEY);
            aiTitle       = ai.title;
            aiDescription = ai.description;
            aiGenerated++;
          } catch (aiErr: any) {
            console.warn(`AI generation failed for ${osId}:`, aiErr.message);
            const catGr = CATEGORY_GR[mapCategory(a.category)] ?? "Ακίνητο";
            aiTitle = `Πλειστηριασμός ${catGr} – ${a.city ?? "Ελλάδα"}`;
          }
        }

        // Map /api/auctions/future fields → Hub listings row
        const mapped: Record<string, unknown> = {
          title:                aiTitle ?? a.title ?? `Πλειστηριασμός – ${a.city ?? "Ελλάδα"}`,
          description:          aiDescription ?? null,
          price:                Number(a.starting_price ?? 0),
          auction_starting_bid: Number(a.starting_price ?? 0),
          auction_date:         a.auction_date ?? null,
          auction_court:        a.status ?? null,
          property_type:        mapCategory(a.category),
          listing_type:         "auction",
          status:               "active",
          city:                 a.city ?? "Άγνωστο",
          address:              a.address ?? null,
          latitude:             a.lat != null ? Number(a.lat) : null,
          longitude:            a.lng != null ? Number(a.lng) : null,
          sqm:                  1, // not returned by this endpoint
          cover_image_url:      null,
          owner_id:             null,
          ai_score:             85,
        };

        const extraTags: string[] = [
          tagKey,
          "source:maiprop-os",
          "ai:generated",
          `auction_status:${a.status ?? "scheduled"}`,
        ];

        if (existing) {
          const { error } = await sb.from("listings").update({
            price:                mapped.price,
            auction_starting_bid: mapped.auction_starting_bid,
            auction_date:         mapped.auction_date,
            auction_court:        mapped.auction_court,
            status:               "active",
            updated_at:           new Date().toISOString(),
          }).eq("id", existing.id);
          if (error) throw error;
          updated++;
        } else {
          const { error } = await sb.from("listings").insert({ ...mapped, tags: extraTags });
          if (error) throw error;
          imported++;
        }
      } catch (itemErr: any) {
        console.error("Upsert error:", itemErr.message, JSON.stringify(a).slice(0, 200));
        errors++;
      }
    }

    const summary = {
      endpoint:           "/api/auctions/future",
      total:              auctions.length,
      totalAvailableInOS: totalAvailable,
      imported,
      updated,
      errors,
      aiGenerated,
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

    console.log("poll-os-auctions summary:", summary);

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
