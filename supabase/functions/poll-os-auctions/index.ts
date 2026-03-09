/**
 * poll-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Pulls auctions from maiProp OS using token-based auth, maps them to Hub
 * listing schema (listing_type = 'auction'), and upserts them.
 *
 * Triggered manually (POST with optional filters) or by a pg_cron job.
 *
 * OS flow:
 *   1. POST /auth/login  → Bearer token
 *   2. POST /api/v1/auctions/filter/details  → auction list
 *   3. Upsert each into Hub listings (dedup via tags: os_auction:{id})
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── OS Property Category → Hub property_type ─────────────────────────────────
const CATEGORY_MAP: Record<string, string> = {
  RESIDENCE: "apartment",
  APARTMENT: "apartment",
  HOUSE: "house",
  VILLA: "villa",
  LAND: "land",
  PLOT: "land",
  COMMERCIAL: "commercial",
  OFFICE: "office",
  STORE: "commercial",
  WAREHOUSE: "commercial",
};

function mapCategory(cat?: string): string {
  if (!cat) return "apartment";
  return CATEGORY_MAP[cat.toUpperCase()] ?? "apartment";
}

function buildTitle(a: any): string {
  const type = a.propertyCategory ? CATEGORY_MAP[a.propertyCategory.toUpperCase()] ?? a.propertyCategory : "Property";
  const city = a.city ?? a.municipalityName ?? "";
  const court = a.courtName ? ` · ${a.courtName}` : "";
  return `[Auction] ${type.charAt(0).toUpperCase() + type.slice(1)} in ${city}${court}`;
}

// ── Auth helper ───────────────────────────────────────────────────────────────
async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`OS auth failed (${res.status}): ${txt}`);
  }
  const data = await res.json();
  // Support both { token } and { accessToken } response shapes
  const token = data.token ?? data.accessToken ?? data.access_token;
  if (!token) throw new Error("OS auth returned no token");
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

  const OS_URL    = Deno.env.get("MAIPROP_OS_URL");
  const OS_EMAIL  = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS   = Deno.env.get("MAIPROP_OS_PASSWORD");

  if (!OS_URL || !OS_EMAIL || !OS_PASS) {
    await logSync(supabase, "skipped",
      "MAIPROP_OS_URL / MAIPROP_OS_EMAIL / MAIPROP_OS_PASSWORD not configured");
    return new Response(JSON.stringify({
      ok: true, status: "skipped",
      message: "OS credentials not configured. Add MAIPROP_OS_URL, MAIPROP_OS_EMAIL, MAIPROP_OS_PASSWORD to enable live poll.",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  try {
    // 1. Authenticate
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // 2. Parse optional filter overrides from request body
    const body = await req.json().catch(() => ({}));
    const filterPayload = {
      page: body.page ?? 0,
      size: body.size ?? 100,
      // Optional filters passed through as-is
      ...(body.filters ?? {}),
    };

    // 3. Fetch auctions from OS
    const auctionsRes = await fetch(`${OS_URL}/api/v1/auctions/filter/details`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(filterPayload),
    });

    if (!auctionsRes.ok) {
      const errText = await auctionsRes.text();
      await logSync(supabase, "error", `OS auctions fetch failed (${auctionsRes.status}): ${errText}`);
      return new Response(JSON.stringify({ error: `OS returned ${auctionsRes.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const auctionsData = await auctionsRes.json();
    // OS may return { content: [...] } (Spring Page) or a plain array
    const auctions: any[] = Array.isArray(auctionsData)
      ? auctionsData
      : (auctionsData.content ?? auctionsData.data ?? auctionsData.auctions ?? []);

    let imported = 0;
    let updated  = 0;
    let errors   = 0;

    // 4. Upsert each auction as a Hub listing
    for (const a of auctions) {
      try {
        const osId = String(a.auctionListingId ?? a.id ?? a.auctionId);
        const tagKey = `os_auction:${osId}`;

        const mapped = {
          title:                buildTitle(a),
          description:          a.description ?? a.additionalInfo ?? null,
          price:                Number(a.firstPriceOffer ?? a.startingBid ?? a.price ?? 0),
          auction_starting_bid: Number(a.firstPriceOffer ?? a.startingBid ?? 0),
          auction_date:         a.auctionDate ?? null,
          auction_court:        a.courtName ?? null,
          property_type:        mapCategory(a.propertyCategory) as any,
          listing_type:         "auction" as const,
          status:               "active" as const,
          city:                 a.city ?? a.municipalityName ?? a.area ?? "Unknown",
          region:               a.region ?? a.prefecture ?? null,
          address:              a.auctionAddress ?? a.address ?? null,
          latitude:             a.latitude ? Number(a.latitude) : null,
          longitude:            a.longitude ? Number(a.longitude) : null,
          sqm:                  Number(a.sqm ?? a.propertyArea ?? 1),
          bedrooms:             a.bedrooms ? Number(a.bedrooms) : null,
          bathrooms:            a.bathrooms ? Number(a.bathrooms) : null,
          floor:                a.floor ? Number(a.floor) : null,
          year_built:           a.yearBuilt ? Number(a.yearBuilt) : null,
          cadastre_number:      a.propertyKaek ?? a.kaek ?? null,
          cover_image_url:      (a.imageUrls ?? a.images ?? [])[0] ?? null,
          // System owner placeholder — OS-sourced listings are platform-owned
          owner_id:             "00000000-0000-0000-0000-000000000001",
        };

        // Check dedup via tag
        const { data: existing } = await supabase
          .from("listings")
          .select("id, tags")
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
          const tags = [tagKey, "source:maiprop-os"];
          const { error } = await supabase
            .from("listings")
            .insert({ ...mapped, tags });
          if (error) throw error;

          // Insert images if present
          if (a.imageUrls?.length > 1 || a.images?.length > 1) {
            const imgList = a.imageUrls ?? a.images ?? [];
            const { data: newListing } = await supabase
              .from("listings")
              .select("id")
              .contains("tags", [tagKey])
              .single();
            if (newListing) {
              await supabase.from("listing_images").insert(
                imgList.slice(0, 20).map((url: string, i: number) => ({
                  listing_id: newListing.id,
                  url,
                  sort_order: i,
                }))
              );
            }
          }
          imported++;
        }
      } catch (itemErr: any) {
        console.error("Error upserting auction:", itemErr.message);
        errors++;
      }
    }

    const summary = { total: auctions.length, imported, updated, errors };
    await logSync(supabase, errors === 0 ? "success" : "error",
      errors > 0 ? `${errors} item(s) failed` : null,
      summary, imported + updated);

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
