import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("owner-pro-status");
const limiter = makeRateLimiter({
  bucket: "owner-pro-status",
  maxRequests: 120,
  windowMs: 60_000,
});

type StatusRequest = {
  listingId?: unknown;
};

function parseListingId(body: StatusRequest): string {
  if (
    typeof body.listingId !== "string" ||
    !/^[0-9a-f-]{36}$/i.test(body.listingId)
  ) {
    throw new Error("Invalid listingId");
  }
  return body.listingId;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({})) as StatusRequest;
    const listingId = parseListingId(body);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    await verifyBearerToken(req, supabase);

    const { data: listing, error: listingError } = await supabase
      .from("listings")
      .select("owner_id")
      .eq("id", listingId)
      .eq("status", "active")
      .eq("is_off_market", false)
      .maybeSingle();
    if (listingError) throw listingError;
    if (!listing?.owner_id) {
      return new Response(JSON.stringify({ isPro: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data, error } = await supabase.rpc("is_pro", {
      p_user_id: listing.owner_id,
    });
    if (error) throw error;

    return new Response(JSON.stringify({ isPro: data === true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return new Response(JSON.stringify({ error: err.message }), {
        status: err.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const message = err instanceof Error
      ? err.message
      : "Failed to resolve owner status";
    log.warn("resolve failed", { err: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
