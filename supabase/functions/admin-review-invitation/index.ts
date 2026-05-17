import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("admin-review-invitation");

type ReviewBody = {
  requestId?: unknown;
  decision?: unknown;
  tier?: unknown;
  rejectionReason?: unknown;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VALID_TIERS = new Set(["private", "institutional", "developer"]);

function requireString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") {
    throw new AuthError(`${field} is required`, 400);
  }
  return value.trim();
}

function parseBody(body: ReviewBody) {
  const requestId = requireString(body.requestId, "requestId");
  if (!UUID_RE.test(requestId)) throw new AuthError("requestId is invalid", 400);

  const decision = requireString(body.decision, "decision").toLowerCase();
  if (decision !== "approved" && decision !== "rejected") {
    throw new AuthError("decision must be approved or rejected", 400);
  }

  const tier = typeof body.tier === "string" && body.tier.trim()
    ? body.tier.trim().toLowerCase()
    : "private";
  if (decision === "approved" && !VALID_TIERS.has(tier)) {
    throw new AuthError("tier is invalid", 400);
  }

  const rejectionReason = typeof body.rejectionReason === "string"
    ? body.rejectionReason.trim().slice(0, 2000)
    : null;

  return { requestId, decision, tier, rejectionReason };
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

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !serviceRoleKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const caller = await verifyBearerToken(req, supabase);
    const parsed = parseBody(await req.json().catch(() => ({})) as ReviewBody);

    const { data, error } = await supabase.rpc("admin_review_invitation_request", {
      p_admin_user_id: caller.id,
      p_request_id: parsed.requestId,
      p_decision: parsed.decision,
      p_tier: parsed.decision === "approved" ? parsed.tier : null,
      p_rejection_reason: parsed.rejectionReason,
    });
    if (error) throw error;

    const result = Array.isArray(data) ? data[0] : data;
    log.info("invitation reviewed", {
      requestId: parsed.requestId,
      decision: parsed.decision,
      adminId: caller.id,
    });

    return new Response(JSON.stringify({ success: true, result }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Invitation review failed";
    log.warn("review failed", { status, message });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
