/**
 * poll-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls FUTURE auctions from maiProp OS and upserts them as Hub listings
 * (listing_type='auction', status='active').
 *
 * AI Enhancement: For each new auction, the Lovable AI generates a rich Greek
 * listing title and description based on the property metadata.
 *
 * Future status set (verified 2026-03-09):
 *   POSTED                  9,222   ← upcoming, published on eauction.gr
 *   READY_TO_CONDUCT          179   ← imminent
 *   FINALIZED_PARTICIPANT_LIST 364  ← participant list finalised
 *
 * The OS API ignores all server-side filters — we filter client-side.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const FUTURE_STATUSES = new Set([
  "POSTED",
  "READY_TO_CONDUCT",
  "FINALIZED_PARTICIPANT_LIST",
]);

// ── OS propertyCategory → Hub property_type ──────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  RESIDENCE:   "apartment",
  APARTMENT:   "apartment",
  HOUSE:       "house",
  VILLA:       "villa",
  LAND:        "land",
  PLOT:        "land",
  PLOT_WITH_BUILDING: "land",
  LAND_WITH_BUILDING: "land",
  COMMERCIAL:  "commercial",
  OFFICE:      "office",
  STORE:       "commercial",
  WAREHOUSE:   "commercial",
  INDUSTRIAL:  "commercial",
  STOREROOM:   "commercial",
};

const CATEGORY_GR: Record<string, string> = {
  apartment: "Διαμέρισμα",
  house:     "Κατοικία",
  villa:     "Βίλα",
  land:      "Γη",
  commercial:"Επαγγελματικός χώρος",
  office:    "Γραφείο",
};

function mapCategory(cat?: string): string {
  if (!cat) return "apartment";
  return CATEGORY_MAP[cat.toUpperCase()] ?? CATEGORY_MAP[cat] ?? "apartment";
}

// ── Verified auth helper ──────────────────────────────────────────────────────
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
  const catKey  = mapCategory(a.propertyCategory);
  const catGr   = CATEGORY_GR[catKey] ?? "Ακίνητο";
  const city    = a.propertyMunicipalityName ?? a.city ?? "Ελλάδα";
  const region  = a.propertyPrefectureName ?? "";
  const sqm     = a.propertySquareMeters ?? "?";
  const price   = Number(a.firstPriceOffer ?? a.registrationAmount ?? 0);
  const date    = a.auctionDate ?? "προσεχώς";
  const floor   = a.propertyFloor != null ? `${Math.floor(Number(a.propertyFloor))}ος όροφος` : "";
  const kaek    = a.propertyFullKaek ? `ΚΑΕΚ: ${a.propertyFullKaek}` : "";
  const address = a.propertyAddress ?? "";
  const ownership = a.ownershipStatus === "FULL" ? "Πλήρης κυριότητα" : a.ownershipStatus ?? "";
  const leaseRate = a.leaseRate ? `Μισθωτική απόδοση: ${(Number(a.leaseRate) * 100).toFixed(1)}%` : "";

  const prompt = `Είσαι ειδικός σύντακτης αγγελιών ακινήτων για την ελληνική αγορά.

Δημιούργησε έναν επαγγελματικό τίτλο και μια πλήρη περιγραφή αγγελίας για τον παρακάτω πλειστηριασμό ακινήτου:

- Τύπος: ${catGr}
- Πόλη/Δήμος: ${city}${region ? `, ${region}` : ""}
- Διεύθυνση: ${address}
- Εμβαδόν: ${sqm} τ.μ.
- Τιμή εκκίνησης: €${price.toLocaleString("el-GR")}
${floor ? `- Όροφος: ${floor}` : ""}
${kaek}
${ownership}
${leaseRate}
- Ημερομηνία πλειστηριασμού: ${date}
- Κατάσταση: ${a.auctionStatus ?? "POSTED"}

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

  const json = await res.json();
  const raw  = json?.choices?.[0]?.message?.content ?? "";

  // Strip markdown fences if present
  const clean = raw.replace(/```json\s*/gi, "").replace(/```\s*/g, "").trim();
  try {
    const parsed = JSON.parse(clean);
    return {
      title:       String(parsed.title       ?? "").slice(0, 200),
      description: String(parsed.description ?? ""),
    };
  } catch {
    // Fallback if AI returns malformed JSON
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

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const OS_URL       = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL     = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS      = Deno.env.get("MAIPROP_OS_PASSWORD");
  const LOVABLE_KEY  = Deno.env.get("LOVABLE_API_KEY");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(sb, "skipped", "OS credentials not configured");
    return new Response(JSON.stringify({ ok: true, status: "skipped" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));

    // 1. Authenticate with OS
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // 2. Build filter payload (OS ignores most filters but we send them anyway)
    const filterPayload: Record<string, unknown> = {
      page:     body.page     ?? 0,
      pageSize: body.pageSize ?? 100,
    };

    // 3. Fetch auctions from OS
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
      await logSync(sb, "error", `OS auction fetch failed (${auctRes.status}): ${errText}`);
      return new Response(JSON.stringify({ error: `OS returned ${auctRes.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auctJson = await auctRes.json();
    const auctions: any[] = Array.isArray(auctJson)
      ? auctJson
      : (auctJson.data ?? auctJson.content ?? []);
    const totalAvailable = auctJson?.responseMetadata?.pagination?.totalElements ?? auctions.length;

    let imported    = 0;
    let updated     = 0;
    let errors      = 0;
    let skippedPast = 0;
    let aiGenerated = 0;

    const safeFloor = (v: any): number | null => {
      if (v == null) return null;
      const n = Number(v);
      return isNaN(n) ? null : Math.floor(n);
    };

    // 4. Upsert each future auction
    for (const a of auctions) {
      // ── Primary guard: skip non-future OS statuses ────────────────────────
      if (a.auctionStatus && !FUTURE_STATUSES.has(a.auctionStatus)) {
        skippedPast++;
        continue;
      }
      // ── Secondary guard: skip if auction date is in the past ──────────────
      if (a.auctionDate) {
        const auctionMs = new Date(a.auctionDate).getTime();
        if (!isNaN(auctionMs) && auctionMs < Date.now()) {
          skippedPast++;
          continue;
        }
      }

      try {
        const osId   = String(a.auctionListingId ?? a.id ?? "unknown");
        const tagKey = `os_auction:${osId}`;

        // Dedup check — skip full AI generation for already-existing listings
        const { data: existing } = await sb
          .from("listings")
          .select("id, title")
          .contains("tags", [tagKey])
          .maybeSingle();

        // ── AI listing generation (new listings only) ─────────────────────
        let aiTitle       = existing?.title ?? null;
        let aiDescription = null;

        if (!existing && LOVABLE_KEY) {
          try {
            const ai = await generateAiListing(a, LOVABLE_KEY);
            aiTitle       = ai.title;
            aiDescription = ai.description;
            aiGenerated++;
          } catch (aiErr: any) {
            console.warn(`AI generation failed for ${osId}:`, aiErr.message);
            // Fall back to rule-based title
            const catKey = mapCategory(a.propertyCategory);
            const catGr  = CATEGORY_GR[catKey] ?? "Ακίνητο";
            const city   = a.propertyMunicipalityName ?? "Ελλάδα";
            aiTitle = `Πλειστηριασμός ${catGr} – ${city}`;
          }
        }

        // ── Map OS fields → Hub listing ───────────────────────────────────
        const mapped: Record<string, unknown> = {
          title:                aiTitle ?? `Πλειστηριασμός – ${a.propertyMunicipalityName ?? "Ελλάδα"}`,
          description:          aiDescription ?? a.description ?? null,
          price:                Number(a.firstPriceOffer ?? a.registrationAmount ?? 0),
          price_per_sqm:        a.pricePerSquareMeter ? Number(a.pricePerSquareMeter) : null,
          auction_starting_bid: Number(a.firstPriceOffer ?? a.registrationAmount ?? 0),
          auction_date:         a.auctionDate ?? null,
          auction_court:        a.auctionStatus ?? null,
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
          cover_image_url:      null,
          owner_id:             null,
          ai_score:             85, // AI-generated listings get a base score
        };

        const extraTags: string[] = [
          tagKey,
          "source:maiprop-os",
          "ai:generated",
          `municipality_id:${a.propertyMunicipalityId ?? ""}`,
        ];
        if (a.ownershipStatus) extraTags.push(`ownership:${a.ownershipStatus}`);
        if (a.auctionStatus)   extraTags.push(`auction_status:${a.auctionStatus}`);

        if (existing) {
          // Update price/date/status but keep the AI title/description
          const updatePayload: Record<string, unknown> = {
            price:                mapped.price,
            price_per_sqm:        mapped.price_per_sqm,
            auction_starting_bid: mapped.auction_starting_bid,
            auction_date:         mapped.auction_date,
            auction_court:        mapped.auction_court,
            status:               "active",
            updated_at:           new Date().toISOString(),
          };
          const { error } = await sb.from("listings").update(updatePayload).eq("id", existing.id);
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
      total:              auctions.length,
      skippedPast,
      futureFound:        auctions.length - skippedPast,
      imported,
      updated,
      errors,
      aiGenerated,
      totalAvailableInOS: totalAvailable,
      page:               filterPayload.page,
      pageSize:           filterPayload.pageSize,
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
