/**
 * sync-to-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Pushes a Hub listing to maiProp OS using token-based auth.
 *
 * Auth: POST /auth/login → { data: { token } }
 * Push: POST /bo/auctions/save
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Hub property_type → OS propertyCategory
const TYPE_MAP: Record<string, string> = {
  apartment:  "RESIDENCE",
  house:      "HOUSE",
  villa:      "VILLA",
  land:       "LAND",
  commercial: "COMMERCIAL",
  office:     "OFFICE",
};

// ── Verified auth helper ──────────────────────────────────────────────────────
async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetch(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) {
    throw new Error(`OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 300)}`);
  }
  return token;
}

// ── Sync logger ───────────────────────────────────────────────────────────────
async function logSync(
  supabase: any,
  direction: string,
  entity_type: string,
  entity_id: string,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0,
) {
  await supabase.from("sync_log").insert({
    direction, entity_type, entity_id, status,
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

  try {
    const body = await req.json().catch(() => ({}));
    const { listing_id, entity_type = "listing" } = body;

    if (!listing_id) {
      return new Response(JSON.stringify({ error: "listing_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch listing + images
    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("*, listing_images(url, sort_order)")
      .eq("id", listing_id)
      .single();

    if (listingError || !listing) {
      await logSync(supabase, "hub_to_os", entity_type, listing_id, "error", "Listing not found");
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sortedImages = (listing.listing_images ?? [])
      .sort((a: any, b: any) => a.sort_order - b.sort_order)
      .map((img: any) => img.url);

    // Build OS payload — maps Hub fields → OS AuctionInputDto field names
    const osPayload = {
      externalId:           listing.id,
      source:               "maiprop-hub",
      title:                listing.title,
      description:          listing.description,
      firstPriceOffer:      listing.auction_starting_bid ?? listing.price,
      registrationAmount:   listing.price,
      pricePerSquareMeter:  listing.price_per_sqm,
      auctionDate:          listing.auction_date,
      auctionStatus:        listing.auction_court ?? "ACTIVE",
      propertyCategory:     TYPE_MAP[listing.property_type] ?? "RESIDENCE",
      propertySquareMeters: listing.sqm,
      propertyAddress:      listing.address,
      propertyMunicipalityName: listing.city,
      propertyPrefectureName:   listing.region,
      propertyPostalCode:   listing.postal_code,
      propertyLatitude:     listing.latitude,
      propertyLongitude:    listing.longitude,
      propertyFloor:        listing.floor,
      numberOfFloors:       listing.total_floors,
      constructionYear:     listing.year_built,
      propertyFullKaek:     listing.cadastre_number,
      // Extra Hub-specific fields
      listingType:          listing.listing_type?.toUpperCase(),
      status:               listing.status?.toUpperCase(),
      energyClass:          listing.energy_class,
      hasParking:           listing.has_parking,
      hasElevator:          listing.has_elevator,
      hasPool:              listing.has_pool,
      hasGarden:            listing.has_garden,
      hasBalcony:           listing.has_balcony,
      hasFurnished:         listing.has_furnished,
      hasAc:                listing.has_ac,
      imageUrls:            sortedImages,
      coverImage:           listing.cover_image_url,
      aiScore:              listing.ai_score,
      tags:                 listing.tags,
      createdAt:            listing.created_at,
      updatedAt:            listing.updated_at,
    };

    // No credentials → queue as skipped
    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      await logSync(supabase, "hub_to_os", entity_type, listing_id, "skipped",
        "OS credentials not configured", osPayload);
      return new Response(JSON.stringify({
        ok: true, status: "skipped",
        message: "OS credentials not configured.",
        payload: osPayload,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authenticate
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // Push to OS backoffice
    const osResponse = await fetch(`${OS_URL}/bo/auctions/save`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Source": "maiprop-hub",
      },
      body: JSON.stringify(osPayload),
    });

    if (!osResponse.ok) {
      const errText = await osResponse.text();
      await logSync(supabase, "hub_to_os", entity_type, listing_id, "error",
        `OS returned ${osResponse.status}: ${errText}`, osPayload);
      return new Response(JSON.stringify({ error: `OS sync failed: ${osResponse.status}: ${errText}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const osResult = await osResponse.json().catch(() => ({}));
    await logSync(supabase, "hub_to_os", entity_type, listing_id, "success", null, osPayload, 1);

    return new Response(JSON.stringify({ ok: true, osResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("sync-to-os error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
