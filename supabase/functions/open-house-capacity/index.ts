/**
 * open-house-capacity - authenticated open-house capacity endpoint.
 *
 * The browser no longer calls the SECURITY DEFINER get_open_house_capacity RPC
 * directly. This function verifies the caller JWT, then asks a service-role-only
 * explicit-user RPC for the aggregate capacity row.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("open-house-capacity");
const limiter = makeRateLimiter({
  bucket: "open-house-capacity",
  maxRequests: 120,
  windowMs: 60_000,
});

const UUID_RE = /^[0-9a-f-]{36}$/i;

const capacityRequestSchema = z.object({
  listingId: z.string().regex(UUID_RE, "Invalid listingId"),
});

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Failed to resolve open-house capacity";
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return jsonResponse({ error: "Service unavailable" }, 503, corsHeaders);
  }

  try {
    const body = await parseJsonBody(req, capacityRequestSchema);
    const listingId = body.listingId;

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const user = await verifyBearerToken(req, supabase);

    const { data, error } = await supabase.rpc(
      "get_open_house_capacity_for_user",
      {
        _user_id: user.id,
        p_listing_id: listingId,
      },
    );
    if (error) throw error;

    return jsonResponse(Array.isArray(data) ? data[0] ?? null : null, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }
    if (err instanceof SchemaValidationError) {
      return jsonResponse({ error: err.message, code: err.code, issues: err.issues }, 400, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("capacity lookup failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
