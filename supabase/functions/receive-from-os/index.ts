import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-os-signature",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const WEBHOOK_SECRET = Deno.env.get("MAIPROP_OS_WEBHOOK_SECRET");

  try {
    // Validate webhook signature if secret is configured
    if (WEBHOOK_SECRET) {
      const signature = req.headers.get("x-os-signature");
      if (!signature || signature !== WEBHOOK_SECRET) {
        return new Response(JSON.stringify({ error: "Unauthorized: invalid signature" }), {
          status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const body = await req.json();
    const { event, entity_type, data } = body;

    if (!event || !entity_type || !data) {
      return new Response(JSON.stringify({ error: "Missing event, entity_type, or data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let result: { processed: boolean; id?: string; error?: string } = { processed: false };

    // Handle different entity types coming from OS
    if (entity_type === "listing") {
      result = await handleListing(supabase, event, data);
    } else if (entity_type === "lead" || entity_type === "consultation") {
      result = await handleLead(supabase, event, data);
    } else if (entity_type === "profile") {
      result = await handleProfile(supabase, event, data);
    } else {
      // Unknown entity type – log and acknowledge
      await logSync(supabase, "os_to_hub", entity_type,
        data.id || data.externalId || "unknown", "skipped",
        `Unknown entity_type: ${entity_type}`, data);
      return new Response(JSON.stringify({ ok: true, status: "skipped", reason: "unknown entity_type" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await logSync(
      supabase, "os_to_hub", entity_type,
      data.id || data.externalId || result.id || "unknown",
      result.processed ? "success" : "error",
      result.error ?? null,
      data,
      result.processed ? 1 : 0,
    );

    return new Response(JSON.stringify({ ok: result.processed, result }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleListing(supabase: any, event: string, data: any) {
  // Map OS fields → Hub fields
  const mapped: any = {
    title: data.title,
    description: data.description,
    price: data.price,
    price_per_sqm: data.pricePerSqm ?? null,
    sqm: data.sqm,
    bedrooms: data.bedrooms ?? null,
    bathrooms: data.bathrooms ?? null,
    city: data.city,
    region: data.region ?? null,
    address: data.address ?? null,
    postal_code: data.postalCode ?? null,
    latitude: data.latitude ?? null,
    longitude: data.longitude ?? null,
    property_type: data.propertyType ?? "apartment",
    listing_type: data.listingType ?? "sale",
    status: data.status ?? "active",
    energy_class: data.energyClass ?? null,
    year_built: data.yearBuilt ?? null,
    has_parking: data.hasParking ?? false,
    has_elevator: data.hasElevator ?? false,
    has_pool: data.hasPool ?? false,
    has_garden: data.hasGarden ?? false,
    has_balcony: data.hasBalcony ?? false,
    has_furnished: data.hasFurnished ?? false,
    has_ac: data.hasAc ?? false,
    cover_image_url: data.coverImage ?? (data.images?.[0] ?? null),
    tags: data.tags ?? null,
    // For OS-sourced listings, use a system owner_id placeholder
    // In production, map this to the actual Hub user
    owner_id: data.ownerId ?? "00000000-0000-0000-0000-000000000000",
  };

  if (event === "created" || event === "upsert") {
    // Check if listing with this externalId already exists (via tags)
    const externalId = data.externalId ?? data.id;
    const { data: existing } = await supabase
      .from("listings")
      .select("id")
      .contains("tags", [`os_id:${externalId}`])
      .maybeSingle();

    if (existing) {
      // Update existing
      const { error } = await supabase
        .from("listings")
        .update({ ...mapped, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return { processed: false, error: error.message };
      return { processed: true, id: existing.id };
    } else {
      // Insert new, tag with os_id for future dedup
      const tags = [...(mapped.tags ?? []), `os_id:${externalId}`];
      const { data: inserted, error } = await supabase
        .from("listings")
        .insert({ ...mapped, tags })
        .select("id")
        .single();
      if (error) return { processed: false, error: error.message };
      return { processed: true, id: inserted.id };
    }
  }

  if (event === "deleted") {
    const externalId = data.externalId ?? data.id;
    const { error } = await supabase
      .from("listings")
      .update({ status: "expired" })
      .contains("tags", [`os_id:${externalId}`]);
    if (error) return { processed: false, error: error.message };
    return { processed: true };
  }

  return { processed: false, error: `Unknown event: ${event}` };
}

async function handleLead(supabase: any, event: string, data: any) {
  if (event === "created" || event === "upsert") {
    const { data: inserted, error } = await supabase
      .from("consultation_requests")
      .insert({
        professional_id: data.professionalId ?? "00000000-0000-0000-0000-000000000000",
        requester_name: data.name ?? data.contactName ?? "Unknown",
        requester_email: data.email ?? data.contactEmail ?? "unknown@example.com",
        requester_phone: data.phone ?? data.contactPhone ?? null,
        message: data.message ?? data.notes ?? null,
        request_type: data.type ?? "inquiry",
        service: data.service ?? null,
        status: "pending",
      })
      .select("id")
      .single();
    if (error) return { processed: false, error: error.message };
    return { processed: true, id: inserted.id };
  }
  return { processed: false, error: `Unhandled lead event: ${event}` };
}

async function handleProfile(supabase: any, _event: string, data: any) {
  if (!data.userId) return { processed: false, error: "userId required for profile sync" };
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: data.displayName ?? null,
      first_name: data.firstName ?? null,
      last_name: data.lastName ?? null,
      phone: data.phone ?? null,
      city: data.city ?? null,
      bio: data.bio ?? null,
      avatar_url: data.avatarUrl ?? null,
    })
    .eq("user_id", data.userId);
  if (error) return { processed: false, error: error.message };
  return { processed: true, id: data.userId };
}

// ─── Sync Logger ─────────────────────────────────────────────────────────────

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
