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

const SELF_SERVICE_ROLES = new Set([
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
]);

const optionalString = (value: unknown, maxLength: number): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
};

const requiredString = (value: unknown): string => {
  return typeof value === "string" ? value.trim() : "";
};

const jsonResponse = (req: Request, body: Record<string, unknown>, status = 200): Response => {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
};

const getServiceConfig = (): { supabaseUrl: string; serviceRoleKey: string } | null => {
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  return serviceRoleKey && supabaseUrl ? { supabaseUrl, serviceRoleKey } : null;
};

const parseOnboardingBody = (body: OnboardingRequest) => {
  const role = requiredString(body.role);
  const participantType = requiredString(body.participantType);
  if (
    !SELF_SERVICE_ROLES.has(role) ||
    participantType.length === 0 ||
    participantType.length > 80
  ) {
    throw new AuthError("role_not_allowed", 400);
  }
  if (role !== participantType) {
    throw new AuthError("role_participant_mismatch", 400);
  }

  return {
    role,
    participantType,
    displayName: optionalString(body.displayName, 120),
    city: optionalString(body.city, 120),
    phone: optionalString(body.phone, 40),
  };
};

const rejectUnsupportedMethod = (req: Request): Response | null => {
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }
  return null;
};

const completeOnboarding = async (
  req: Request,
  config: { supabaseUrl: string; serviceRoleKey: string },
): Promise<Response> => {
  const supabase = createClient(config.supabaseUrl, config.serviceRoleKey, {
    auth: { persistSession: false },
  });

  try {
    const caller = await verifyBearerToken(req, supabase);
    const body = await req.json().catch(() => ({})) as OnboardingRequest;
    const payload = parseOnboardingBody(body);

    const { error } = await supabase.rpc("complete_onboarding_role_for_user", {
      p_user_id: caller.id,
      p_role: payload.role,
      p_participant_type: payload.participantType,
      p_display_name: payload.displayName,
      p_city: payload.city,
      p_phone: payload.phone,
    });
    if (error) throw error;

    return jsonResponse(req, { success: true });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = err instanceof Error ? err.message : "Onboarding failed";
    log.warn("complete failed", { status, err: message });
    return jsonResponse(req, { error: message }, status);
  }
};

const handlePost = (req: Request): Response | Promise<Response> => {
  const methodResponse = rejectUnsupportedMethod(req);
  if (methodResponse) return methodResponse;

  const config = getServiceConfig();
  if (!config) return jsonResponse(req, { error: "Service unavailable" }, 503);

  return completeOnboarding(req, config);
};

Deno.serve((req) => {
  const corsPreflightResponse = handleCors(req);
  return corsPreflightResponse ?? handlePost(req);
});
