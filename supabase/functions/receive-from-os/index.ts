import { createClient } from "npm:@supabase/supabase-js@2";
import { verifyHmacSignature, HmacVerifyError } from "../_shared/webhookHmac.ts";
import { errorResponse, unavailableResponse } from "../_shared/response.ts";
import { createLogger } from "../_shared/logger.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import {
  asLooseSupabaseClient,
  type LooseSupabaseClient,
} from "../_shared/supabaseClientTypes.ts";

const log = createLogger("receive-from-os");

// OS webhook payload envelope. The OS API doesn't ship typed schemas, so we
// shape the inbound JSON as discriminated unions of "data" payloads keyed by
// `entity_type` and validate field-by-field at the handler boundary instead
// of trusting the wire shape.
type WebhookEnvelope = {
  event?: string;
  entity_type?: string;
  data?: Record<string, unknown>;
};

type HandlerResult = { processed: boolean; id?: string; error?: string };

/** Read a field from an unknown OS payload, narrowing common scalar types. */
function pick<T = unknown>(d: Record<string, unknown>, key: string): T | undefined {
  return d[key] as T | undefined;
}
function pickStr(d: Record<string, unknown>, key: string): string | null {
  const v = d[key];
  return typeof v === "string" ? v : null;
}
function pickStrOrUndef(d: Record<string, unknown>, key: string): string | undefined {
  const v = d[key];
  return typeof v === "string" ? v : undefined;
}
/** OS sometimes serialises identifiers as numbers (see `auctionListingId` in
 *  `poll-os-auctions`); coerce numeric ids to string so `os_id:` tags and
 *  `sync_log.entity_id` are stable regardless of wire shape. */
function pickId(d: Record<string, unknown>, key: string): string | undefined {
  const v = d[key];
  if (typeof v === "string") return v;
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  return undefined;
}
function pickNum(d: Record<string, unknown>, key: string): number | null {
  const v = d[key];
  return typeof v === "number" ? v : null;
}
function pickBool(d: Record<string, unknown>, key: string): boolean {
  return d[key] === true;
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req, "x-os-signature");
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const WEBHOOK_SECRET = Deno.env.get("MAIPROP_OS_WEBHOOK_SECRET");
  if (!WEBHOOK_SECRET) {
    log.error("MAIPROP_OS_WEBHOOK_SECRET not set, rejecting webhook");
    return unavailableResponse("not_configured", corsHeaders);
  }

  try {
    const rawBody = await req.text();

    try {
      await verifyHmacSignature(rawBody, req.headers.get("x-os-signature"), WEBHOOK_SECRET);
    } catch (err) {
      if (err instanceof HmacVerifyError) {
        return errorResponse(`Unauthorized: ${err.message}`, 401, corsHeaders);
      }
      throw err;
    }

    let body: WebhookEnvelope;
    try {
      body = JSON.parse(rawBody) as WebhookEnvelope;
    } catch {
      return errorResponse("Invalid JSON body", 400, corsHeaders);
    }
    const { event, entity_type, data } = body;

    if (!event || !entity_type || !data) {
      return errorResponse("Missing event, entity_type, or data", 400, corsHeaders);
    }

    let result: HandlerResult;
    if (entity_type === "listing") {
      result = await handleListing(asLooseSupabaseClient(supabase), event, data);
    } else if (entity_type === "lead" || entity_type === "consultation") {
      result = await handleLead(asLooseSupabaseClient(supabase), event, data);
    } else if (entity_type === "profile") {
      result = await handleProfile(asLooseSupabaseClient(supabase), event, data);
    } else {
      // Unknown entity type – log and acknowledge (not an error, just unsupported)
      await logSync(
        asLooseSupabaseClient(supabase),
        "os_to_hub",
        entity_type,
        pickId(data, "id") ?? pickId(data, "externalId") ?? "unknown",
        "skipped",
        `Unknown entity_type: ${entity_type}`,
        data,
      );
      return new Response(
        JSON.stringify({ ok: true, status: "skipped", reason: "unknown entity_type" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    await logSync(
      asLooseSupabaseClient(supabase),
      "os_to_hub",
      entity_type,
      pickId(data, "id") ?? pickId(data, "externalId") ?? result.id ?? "unknown",
      result.processed ? "success" : "error",
      result.error ?? null,
      data,
      result.processed ? 1 : 0,
    );

    return new Response(
      JSON.stringify({ ok: result.processed, result }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );

  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return errorResponse(message, 500, corsHeaders);
  }
});

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleListing(
  supabase: LooseSupabaseClient,
  event: string,
  data: Record<string, unknown>,
): Promise<HandlerResult> {
  const ownerId = pickStr(data, "ownerId");
  if (!ownerId) {
    return { processed: false, error: "ownerId is required — cannot create listing without a mapped Hub user" };
  }

  const images = pick<unknown[]>(data, "images");
  const firstImage = Array.isArray(images) && typeof images[0] === "string" ? (images[0] as string) : null;
  const inboundTags = pick<unknown[]>(data, "tags");
  const tags = Array.isArray(inboundTags) ? (inboundTags.filter((t) => typeof t === "string") as string[]) : null;

  const mapped = {
    title: pickStr(data, "title"),
    description: pickStr(data, "description"),
    price: pickNum(data, "price"),
    price_per_sqm: pickNum(data, "pricePerSqm"),
    sqm: pickNum(data, "sqm"),
    bedrooms: pickNum(data, "bedrooms"),
    bathrooms: pickNum(data, "bathrooms"),
    city: pickStr(data, "city"),
    region: pickStr(data, "region"),
    address: pickStr(data, "address"),
    postal_code: pickStr(data, "postalCode"),
    latitude: pickNum(data, "latitude"),
    longitude: pickNum(data, "longitude"),
    property_type: pickStrOrUndef(data, "propertyType") ?? "apartment",
    listing_type: pickStrOrUndef(data, "listingType") ?? "sale",
    status: pickStrOrUndef(data, "status") ?? "active",
    energy_class: pickStr(data, "energyClass"),
    year_built: pickNum(data, "yearBuilt"),
    has_parking: pickBool(data, "hasParking"),
    has_elevator: pickBool(data, "hasElevator"),
    has_pool: pickBool(data, "hasPool"),
    has_garden: pickBool(data, "hasGarden"),
    has_balcony: pickBool(data, "hasBalcony"),
    has_furnished: pickBool(data, "hasFurnished"),
    has_ac: pickBool(data, "hasAc"),
    cover_image_url: pickStr(data, "coverImage") ?? firstImage,
    tags,
    owner_id: ownerId,
  };

  const externalId = pickId(data, "externalId") ?? pickId(data, "id");

  if (event === "created" || event === "upsert") {
    if (!externalId) return { processed: false, error: "externalId or id required for upsert" };

    // Check if listing with this externalId already exists (via tags)
    const { data: existingRaw } = await supabase
      .from("listings")
      .select("id")
      .contains("tags", [`os_id:${externalId}`])
      .maybeSingle();
    const existing = existingRaw as { id: string } | null;

    if (existing) {
      const { error } = await supabase
        .from("listings")
        .update({ ...mapped, updated_at: new Date().toISOString() })
        .eq("id", existing.id);
      if (error) return { processed: false, error: error.message };
      return { processed: true, id: existing.id };
    }

    // Insert new, tag with os_id for future dedup
    const insertTags = [...(tags ?? []), `os_id:${externalId}`];
    const { data: insertedRaw, error } = await supabase
      .from("listings")
      .insert({ ...mapped, tags: insertTags })
      .select("id")
      .single();
    if (error) return { processed: false, error: error.message };
    const inserted = insertedRaw as { id: string };
    return { processed: true, id: inserted.id };
  }

  if (event === "deleted") {
    if (!externalId) return { processed: false, error: "externalId or id required for delete" };
    const { error } = await supabase
      .from("listings")
      .update({ status: "expired" })
      .contains("tags", [`os_id:${externalId}`]);
    if (error) return { processed: false, error: error.message };
    return { processed: true };
  }

  return { processed: false, error: `Unknown event: ${event}` };
}

async function handleLead(
  supabase: LooseSupabaseClient,
  event: string,
  data: Record<string, unknown>,
): Promise<HandlerResult> {
  if (event === "created" || event === "upsert") {
    const professionalId = pickStr(data, "professionalId");
    if (!professionalId) {
      return { processed: false, error: "professionalId is required for lead sync" };
    }
    const { data: inserted, error } = await supabase
      .from("consultation_requests")
      .insert({
        professional_id: professionalId,
        requester_name: pickStr(data, "name") ?? pickStr(data, "contactName") ?? "Unknown",
        requester_email: pickStr(data, "email") ?? pickStr(data, "contactEmail") ?? "unknown@example.com",
        requester_phone: pickStr(data, "phone") ?? pickStr(data, "contactPhone"),
        message: pickStr(data, "message") ?? pickStr(data, "notes"),
        request_type: pickStrOrUndef(data, "type") ?? "inquiry",
        service: pickStr(data, "service"),
        status: "pending",
      })
      .select("id")
      .single();
    if (error) return { processed: false, error: error.message };
    return { processed: true, id: (inserted as { id: string } | null)?.id };
  }
  return { processed: false, error: `Unhandled lead event: ${event}` };
}

async function handleProfile(
  supabase: LooseSupabaseClient,
  _event: string,
  data: Record<string, unknown>,
): Promise<HandlerResult> {
  const userId = pickStr(data, "userId");
  if (!userId) return { processed: false, error: "userId required for profile sync" };
  const { error } = await supabase
    .from("profiles")
    .update({
      display_name: pickStr(data, "displayName"),
      first_name: pickStr(data, "firstName"),
      last_name: pickStr(data, "lastName"),
      phone: pickStr(data, "phone"),
      city: pickStr(data, "city"),
      bio: pickStr(data, "bio"),
      avatar_url: pickStr(data, "avatarUrl"),
    })
    .eq("user_id", userId);
  if (error) return { processed: false, error: error.message };
  return { processed: true, id: userId };
}

// ─── Sync Logger ─────────────────────────────────────────────────────────────

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
  // `sync_log` is unregistered in the generated Supabase types; cast through
  // the narrow `from` overload bridge that the rest of this codebase uses.
  // Wrap in try/catch so a logging failure (schema mismatch, transient DB
  // issue) never aborts the webhook response — matches `poll-os-auctions`.
  try {
    await supabase.from("sync_log").insert({
      direction,
      entity_type,
      entity_id,
      status,
      error_message: error_message ?? null,
      payload: payload ?? null,
      records_affected,
    });
  } catch (err: unknown) {
    log.error("logSync failed", { err: err instanceof Error ? err.message : String(err) });
  }
}
