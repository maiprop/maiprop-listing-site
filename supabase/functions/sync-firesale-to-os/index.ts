/**
 * sync-firesale-to-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Pushes a Firesale™ request to maiProp OS as an opportunity/lead.
 *
 * OS flow:
 *   1. POST /auth/login  → Bearer token
 *   2. POST /bo/firesale/save  (or /api/v1/opportunities/save)  → opportunity
 *
 * Called with { firesale_id } in the request body.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// ── Hub condition → OS condition label ───────────────────────────────────────
const CONDITION_MAP: Record<string, string> = {
  excellent:        "EXCELLENT",
  good:             "GOOD",
  needs_renovation: "NEEDS_RENOVATION",
  poor:             "POOR",
  shell:            "SHELL",
};

// ── Hub property_type → OS propertyCategory ──────────────────────────────────
const TYPE_MAP: Record<string, string> = {
  apartment:  "APARTMENT",
  house:      "HOUSE",
  villa:      "VILLA",
  land:       "LAND",
  commercial: "COMMERCIAL",
  office:     "OFFICE",
};

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
  const token = data.token ?? data.accessToken ?? data.access_token;
  if (!token) throw new Error("OS auth returned no token");
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
    entity_id,
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

  const OS_URL   = Deno.env.get("MAIPROP_OS_URL");
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

    // Build OS payload
    const osPayload = {
      externalId:      fs.id,
      source:          "maiprop-hub-firesale",
      address:         fs.address,
      city:            fs.city,
      propertyCategory: fs.property_type ? (TYPE_MAP[fs.property_type] ?? "APARTMENT") : "APARTMENT",
      sqm:             fs.sqm,
      bedrooms:        fs.bedrooms ?? null,
      condition:       CONDITION_MAP[fs.condition] ?? fs.condition,
      askingPrice:     fs.asking_price ?? null,
      aiEstimate:      fs.ai_estimate ?? null,
      offerPrice:      fs.offer_price ?? null,
      contactEmail:    fs.contact_email,
      contactPhone:    fs.contact_phone ?? null,
      notes:           fs.notes ?? null,
      adminNotes:      fs.admin_notes ?? null,
      status:          fs.status.toUpperCase(),
      submittedAt:     fs.created_at,
      updatedAt:       fs.updated_at,
    };

    // No credentials → queue as skipped
    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      await logSync(supabase, firesale_id, "skipped",
        "OS credentials not configured", osPayload);
      return new Response(JSON.stringify({
        ok: true, status: "skipped",
        message: "OS credentials not configured. Add MAIPROP_OS_URL, MAIPROP_OS_EMAIL, MAIPROP_OS_PASSWORD.",
        payload: osPayload,
      }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // Authenticate
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // Push to OS — try backoffice firesale endpoint first, fallback to opportunities
    const endpoint = `${OS_URL}/bo/firesale/save`;
    const osRes = await fetch(endpoint, {
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
      return new Response(JSON.stringify({ error: `OS sync failed: ${osRes.status}` }), {
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
