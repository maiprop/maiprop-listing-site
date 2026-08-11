/**
 * sync-firesale-to-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Pushes a Firesale™ request to maiProp OS as an auction creation request
 * (closest available endpoint: POST /api/v1/auctions/create).
 *
 * Auth: POST /auth/login → { data: { token } }
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import {
  asLooseSupabaseClient,
  asSupabaseAuthAdminClient,
  type AdminProfile,
  type LooseSupabaseClient,
  type SupabaseAuthAdminClient,
} from "../_shared/supabaseClientTypes.ts";
import { parseSyncFiresaleToOsRequest } from "./request.ts";

const log = createLogger("sync-firesale-to-os");

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
  const res = await fetchWithTimeout(`${baseUrl}/auth/login`, {
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
  supabase: LooseSupabaseClient,
  entity_id: string,
  status: string,
  error_message?: string | null,
  payload?: unknown,
  records_affected = 0,
): Promise<void> {
  // `sync_log` is unregistered in the generated Supabase types; cast through
  // the narrow `from` overload bridge that the rest of this codebase uses.
  await supabase.from("sync_log").insert({
    direction: "hub_to_os",
    entity_type: "firesale",
    entity_id, status,
    error_message: error_message ?? null,
    payload: payload ?? null,
    records_affected,
  });
}

// Shape of `firesale_requests` rows we read here. Full row type isn't in the
// generated Supabase types since the table is unregistered.
type FiresaleRow = {
  id: string;
  property_type?: string | null;
  address?: string | null;
  city?: string | null;
  sqm?: number | null;
  bedrooms?: number | null;
  condition?: string | null;
  asking_price?: number | null;
  ai_estimate?: number | null;
  offer_price?: number | null;
  contact_email?: string | null;
  contact_phone?: string | null;
  notes?: string | null;
  admin_notes?: string | null;
  status: string;
  created_at?: string | null;
  updated_at?: string | null;
};

// ── Require agent role to prevent unauthenticated sync / PII exposure ───────────
async function requireAgent(
  req: Request,
  sb: SupabaseAuthAdminClient,
  corsHeaders: Record<string, string>,
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
  const { data: profileRaw } = await sb.from("profiles").select("role").eq("user_id", user.id).single();
  const profile = profileRaw as AdminProfile | null;
  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Platform admin required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

// ── Main handler ──────────────────────────────────────────────────────────────
Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { firesale_id } = await parseSyncFiresaleToOsRequest(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authErr = await requireAgent(req, asSupabaseAuthAdminClient(supabase), corsHeaders);
    if (authErr) return authErr;

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    // Fetch firesale request — `firesale_requests` isn't in the generated
    // Supabase types; cast through the narrow `from` overload bridge.
    const db = asLooseSupabaseClient(supabase);
    const { data: fsRaw, error: fsErr } = await db
      .from("firesale_requests")
      .select("*")
      .eq("id", firesale_id)
      .single();
    const fs = fsRaw as FiresaleRow | null;

    if (fsErr || !fs) {
      await logSync(db, firesale_id, "error", "Firesale request not found");
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
      condition:            (fs.condition && CONDITION_MAP[fs.condition]) ?? fs.condition ?? null,

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
      auctionStatus:        fs.status?.toUpperCase() ?? "PENDING",
      submittedAt:          fs.created_at,
      updatedAt:            fs.updated_at,
    };

    // No credentials → queue as skipped
    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      await logSync(db, firesale_id, "skipped",
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
    const osRes = await fetchWithTimeout(`${OS_URL}/api/v1/auctions/create`, {
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
      await logSync(db, firesale_id, "error",
        `OS returned ${osRes.status}: ${errText}`, osPayload);
      return new Response(JSON.stringify({ error: `OS sync failed: ${osRes.status}: ${errText}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const osResult = await osRes.json().catch(() => ({}));
    await logSync(db, firesale_id, "success", null, osPayload, 1);

    return new Response(JSON.stringify({ ok: true, osResult }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: unknown) {
    if (err instanceof SchemaValidationError) {
      return new Response(JSON.stringify({
        error: err.message,
        code: err.code,
        issues: err.issues,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const message = err instanceof Error ? err.message : String(err);
    log.error("sync error", { err: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
