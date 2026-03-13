/**
 * sync-firesale-to-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Pushes a Firesale™ request to maiProp OS as an auction creation request
 * (closest available endpoint: POST /api/v1/auctions/create).
 *
 * Auth: POST /auth/login → { data: { token } }
 */

import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const TYPE_MAP: Record<string, string> = {
  apartment:  "RESIDENCE",
  house:      "HOUSE",
  villa:      "VILLA",
  land:       "LAND",
  commercial: "COMMERCIAL",
  office:     "OFFICE",
};

const CONDITION_MAP: Record<string, string> = {
  excellent:        "EXCELLENT",
  good:             "GOOD",
  needs_renovation: "NEEDS_RENOVATION",
  poor:             "POOR",
  shell:            "SHELL",
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
  entity_id: string,
  status: string,
  error_message?: string | null,
  payload?: any,
  records_affected = 0,
) {
  await supabase.from("sync_log").insert({
    direction: "hub_to_os",
    entity_type: "firesale",
    entity_id, status,
    error_message: error_message ?? null,
    payload: payload ?? null,
    records_affected,
  });
}

// ── Require agent role to prevent unauthenticated sync / PII exposure ───────────
async function requireAgent(
  req: Request,
  sb: ReturnType<typeof createClient>
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: profile } = await sb.from("profiles").select("role").eq("user_id", user.id).single();
  if (profile?.role !== "agent") {
    return new Response(JSON.stringify({ error: "Agent role required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const authErr = await requireAgent(req, supabase);
  if (authErr) return authErr;

  const OS_URL   = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
  const OS_PASS  = Deno.env.get("MAIPROP_OS_PASSWORD");

  try {
    const body = await req.json().catch(() => ({}));
    const { firesale_id } = body;

    if (!firesale_id) {
      return new Response(JSON.stringify({ error: "firesale_id is required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Fetch firesale request
    const { data: fs, error: fsErr } = await supabase
      .from("firesale_requests")
      .select("*")
      .eq("id", firesale_id)
      .single();

    if (fsErr || !fs) {
      await logSync(supabase, firesale_id, "error", "Firesale request not found");
      return new Response(JSON.stringify({ error: "Firesale request not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Build OS payload using real OS field names
    const osPayload = {
      // Identification
      externalId:           fs.id,
      source:               "maiprop-hub-firesale",

      // Property details (mapped to OS AuctionOutputDto / create schema)
      propertyCategory:     fs.property_type ? (TYPE_MAP[fs.property_type] ?? "RESIDENCE") : "RESIDENCE",
      propertyAddress:      fs.address,
      propertyMunicipalityName: fs.city,
      propertySquareMeters: fs.sqm,
      numberOfBedrooms:     fs.bedrooms ?? null,
      condition:            CONDITION_MAP[fs.condition] ?? fs.condition,

      // Pricing
      firstPriceOffer:      fs.asking_price ?? fs.ai_estimate ?? null,
      registrationAmount:   fs.asking_price ?? null,
      aiEstimate:           fs.ai_estimate ?? null,
      offerPrice:           fs.offer_price ?? null,

      // Contact
      contactEmail:         fs.contact_email,
      contactPhone:         fs.contact_phone ?? null,
      notes:                fs.notes ?? null,
      adminNotes:           fs.admin_notes ?? null,

      // Status
      auctionStatus:        fs.status.toUpperCase(),
      submittedAt:          fs.created_at,
      updatedAt:            fs.updated_at,
    };

    // No credentials → queue as skipped
    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      await logSync(supabase, firesale_id, "skipped",
        "OS credentials not configured", osPayload);
      return new Response(JSON.stringify({
        ok: true, status: "skipped",
        message: "OS credentials not configured.",
        payload: osPayload,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authenticate
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // Push to OS — use /api/v1/auctions/create (the only create endpoint available)
    const osRes = await fetch(`${OS_URL}/api/v1/auctions/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
        "X-Source": "maiprop-hub",
      },
      body: JSON.stringify(osPayload),
    });

    if (!osRes.ok) {
      const errText = await osRes.text();
      await logSync(supabase, firesale_id, "error",
        `OS returned ${osRes.status}: ${errText}`, osPayload);
      return new Response(JSON.stringify({ error: `OS sync failed: ${osRes.status}: ${errText}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const osResult = await osRes.json().catch(() => ({}));
    await logSync(supabase, firesale_id, "success", null, osPayload, 1);

    return new Response(JSON.stringify({ ok: true, osResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    console.error("sync-firesale-to-os error:", err.message);
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
