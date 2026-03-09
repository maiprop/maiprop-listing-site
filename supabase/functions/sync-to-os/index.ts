import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const OS_URL = Deno.env.get("MAIPROP_OS_URL");
  const OS_API_KEY = Deno.env.get("MAIPROP_OS_API_KEY");

  try {
    const body = await req.json().catch(() => ({}));
    const { listing_id, entity_type = "listing" } = body;

    if (!listing_id) {
      return new Response(JSON.stringify({ error: "listing_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch the listing with its images
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

    // Map Hub listing to OS payload format
    const osPayload = {
      externalId: listing.id,
      source: "maiprop-hub",
      title: listing.title,
      description: listing.description,
      price: listing.price,
      pricePerSqm: listing.price_per_sqm,
      sqm: listing.sqm,
      bedrooms: listing.bedrooms,
      bathrooms: listing.bathrooms,
      floor: listing.floor,
      city: listing.city,
      region: listing.region,
      address: listing.address,
      postalCode: listing.postal_code,
      latitude: listing.latitude,
      longitude: listing.longitude,
      propertyType: listing.property_type,
      listingType: listing.listing_type,
      status: listing.status,
      energyClass: listing.energy_class,
      yearBuilt: listing.year_built,
      hasParking: listing.has_parking,
      hasElevator: listing.has_elevator,
      hasPool: listing.has_pool,
      hasGarden: listing.has_garden,
      hasBalcony: listing.has_balcony,
      hasFurnished: listing.has_furnished,
      hasAc: listing.has_ac,
      images: (listing.listing_images || [])
        .sort((a: any, b: any) => a.sort_order - b.sort_order)
        .map((img: any) => img.url),
      coverImage: listing.cover_image_url,
      aiScore: listing.ai_score,
      tags: listing.tags,
      createdAt: listing.created_at,
      updatedAt: listing.updated_at,
    };

    // If no OS URL configured yet, log a skipped entry and return success
    if (!OS_URL || !OS_API_KEY) {
      await logSync(supabase, "hub_to_os", entity_type, listing_id, "skipped",
        "MAIPROP_OS_URL / MAIPROP_OS_API_KEY not configured", osPayload);
      return new Response(JSON.stringify({
        ok: true,
        status: "skipped",
        message: "OS credentials not configured. Add MAIPROP_OS_URL and MAIPROP_OS_API_KEY to enable live sync.",
        payload: osPayload,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Push to maiProp OS
    const osResponse = await fetch(`${OS_URL}/api/v1/properties/sync`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${OS_API_KEY}`,
        "X-Source": "maiprop-hub",
      },
      body: JSON.stringify(osPayload),
    });

    if (!osResponse.ok) {
      const errText = await osResponse.text();
      await logSync(supabase, "hub_to_os", entity_type, listing_id, "error",
        `OS returned ${osResponse.status}: ${errText}`, osPayload);
      return new Response(JSON.stringify({ error: `OS sync failed: ${osResponse.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const osResult = await osResponse.json();
    await logSync(supabase, "hub_to_os", entity_type, listing_id, "success", null, osPayload, 1);

    return new Response(JSON.stringify({ ok: true, osResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

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
    direction,
    entity_type,
    entity_id,
    status,
    error_message: error_message ?? null,
    payload: payload ?? null,
    records_affected,
  });
}
