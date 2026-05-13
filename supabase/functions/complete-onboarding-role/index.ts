import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("complete-onboarding-role");

type OnboardingRequest = {
  role?: unknown;
  participantType?: unknown;
  displayName?: unknown;
  city?: unknown;
  phone?: unknown;
};

const ROLES = new Set(["buyer", "seller", "agent", "developer", "professional"]);

const optionalString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
};

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
    const body = await req.json().catch(() => ({})) as OnboardingRequest;
    const role = typeof body.role === "string" ? body.role : "";
    const participantType = typeof body.participantType === "string" ? body.participantType : "";
    if (!ROLES.has(role) || participantType.length === 0 || participantType.length > 80) {
      throw new AuthError("Invalid onboarding payload", 400);
    }

    const { error } = await supabase.rpc("complete_onboarding_role_for_user", {
      p_user_id: caller.id,
      p_role: role,
      p_participant_type: participantType,
      p_display_name: optionalString(body.displayName, 120),
      p_city: optionalString(body.city, 120),
      p_phone: optionalString(body.phone, 40),
    });
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Onboarding failed";
    log.warn("complete failed", { status, err: message });
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
