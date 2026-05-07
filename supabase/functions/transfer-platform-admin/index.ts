import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("transfer-platform-admin");

type TransferRequest = {
  targetEmail?: unknown;
};

function parseTargetEmail(body: TransferRequest): string {
  if (typeof body.targetEmail !== "string") {
    throw new AuthError("targetEmail is required", 400);
  }
  const targetEmail = body.targetEmail.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail) || targetEmail.length > 320) {
    throw new AuthError("targetEmail is invalid", 400);
  }
  return targetEmail;
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

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
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
    const body = await req.json().catch(() => ({})) as TransferRequest;
    const targetEmail = parseTargetEmail(body);

    const { data: isAdmin, error: adminError } = await supabase.rpc("has_platform_admin", {
      _user_id: caller.id,
    });
    if (adminError) throw adminError;
    if (isAdmin !== true) {
      throw new AuthError("Forbidden", 403);
    }

    const { error } = await supabase.rpc("grant_platform_admin_by_email_for_caller", {
      caller_user_id: caller.id,
      target_email: targetEmail,
    });
    if (error) throw error;

    log.info("platform admin transferred", {
      caller_id: caller.id,
      target_domain: targetEmail.split("@")[1] ?? "unknown",
    });

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Transfer failed";
    log.warn("transfer failed", { status, err: message });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
