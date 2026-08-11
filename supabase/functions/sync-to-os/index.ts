/**
 * sync-to-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Pushes a Hub listing to maiProp OS using token-based auth.
 *
 * Auth: POST /auth/login → { data: { token } }
 * Push: POST /bo/auctions/save
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
import { parseSyncToOsRequest } from "./request.ts";

const log = createLogger("sync-to-os");

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
  direction: string,
  entity_type: string,
  entity_id: string,
  status: string,
  error_message?: string | null,
  payload?: unknown,
  records_affected = 0,
): Promise<void> {
  await supabase.from("sync_log").insert({
    direction, entity_type, entity_id, status,
    error_message: error_message ?? null,
    payload: payload ?? null,
    records_affected,
  });
}

// Subset of `listings` columns + the joined `listing_images` rows we read here.
// The full row type isn't in the generated Supabase types since the columns
// vary across this codebase's migrations.
type ListingImageRow = { url: string; sort_order: number };
type ListingRow = {
  id: string;
  title?: string | null;
  description?: string | null;
  auction_starting_bid?: number | null;
  price?: number | null;
  price_per_sqm?: number | null;
  auction_date?: string | null;
  auction_court?: string | null;
  property_type?: string | null;
  sqm?: number | null;
  address?: string | null;
  city?: string | null;
  region?: string | null;
  postal_code?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  floor?: number | null;
  total_floors?: number | null;
  year_built?: number | null;
  cadastre_number?: string | null;
  listing_type?: string | null;
  status?: string | null;
  energy_class?: string | null;
  has_parking?: boolean | null;
  has_elevator?: boolean | null;
  has_pool?: boolean | null;
  has_garden?: boolean | null;
  has_balcony?: boolean | null;
  has_furnished?: boolean | null;
  has_ac?: boolean | null;
  cover_image_url?: string | null;
  ai_score?: number | null;
  tags?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
  listing_images?: ListingImageRow[] | null;
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
    const { listing_id, entity_type } = await parseSyncToOsRequest(req);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const authErr = await requireAgent(req, asSupabaseAuthAdminClient(supabase), corsHeaders);
    if (authErr) return authErr;

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    // Fetch listing + images. Generated Supabase types cover `listings` but
    // the joined `listing_images` aliasing varies; narrow at the boundary.
    const db = asLooseSupabaseClient(supabase);
    const { data: listingRaw, error: listingError } = await db
      .from("listings")
      .select("*, listing_images(url, sort_order)")
      .eq("id", listing_id)
      .single();
    const listing = listingRaw as ListingRow | null;

    if (listingError || !listing) {
      await logSync(db, "hub_to_os", entity_type, listing_id, "error", "Listing not found");
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sortedImages = (listing.listing_images ?? [])
      .slice()
      .sort((a, b) => a.sort_order - b.sort_order)
      .map((img) => img.url);

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
      propertyCategory:     (listing.property_type ? TYPE_MAP[listing.property_type] : undefined) ?? "RESIDENCE",
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
      await logSync(db, "hub_to_os", entity_type, listing_id, "skipped",
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
    const osResponse = await fetchWithTimeout(`${OS_URL}/bo/auctions/save`, {
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
      await logSync(db, "hub_to_os", entity_type, listing_id, "error",
        `OS returned ${osResponse.status}: ${errText}`, osPayload);
      return new Response(JSON.stringify({ error: `OS sync failed: ${osResponse.status}: ${errText}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const osResult = await osResponse.json().catch(() => ({}));
    await logSync(db, "hub_to_os", entity_type, listing_id, "success", null, osPayload, 1);

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
