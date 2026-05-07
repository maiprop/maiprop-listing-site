import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const log = createLogger("record-listing-view");
const limiter = makeRateLimiter({
  bucket: "record-listing-view",
  maxRequests: 120,
  windowMs: 60_000,
});

type ViewRequest = {
  listingId?: unknown;
};

function parseListingId(body: ViewRequest): string {
  if (typeof body.listingId !== "string" || !/^[0-9a-f-]{36}$/i.test(body.listingId)) {
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

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
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
    const body = await req.json().catch(() => ({})) as ViewRequest;
    const listingId = parseListingId(body);
    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    let viewerId: string | null = null;
    if (token) {
      const { data } = await supabase.auth.getUser(token);
      viewerId = data.user?.id ?? null;
    }

    const [increment, event] = await Promise.all([
      supabase.rpc("increment_listing_views", { p_listing_id: listingId }),
      supabase.rpc("record_listing_view_event", {
        p_listing_id: listingId,
        p_viewer_id: viewerId,
      }),
    ]);

    if (increment.error) throw increment.error;
    if (event.error) throw event.error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record listing view";
    log.warn("record failed", { err: message });
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
