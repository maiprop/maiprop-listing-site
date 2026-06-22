import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { verifyBearerToken, AuthError } from "../_shared/auth.ts";
import { createLogger } from "../_shared/logger.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import { logAuditEvent } from "../_shared/auditLog.ts";

const log = createLogger("complete-onboarding-role");

const SELF_SERVICE_ROLES = [
  "buyer",
  "seller",
  "agent",
  "developer",
  "professional",
] as const;
const SELF_SERVICE_ROLE_SET = new Set<string>(SELF_SERVICE_ROLES);

const PROFESSIONAL_CATEGORIES = [
  "architect",
  "civil_engineer",
  "lawyer",
  "notary",
  "electrician",
  "plumber",
  "contractor",
  "property_manager",
  "valuer",
  "interior_designer",
  "financial_advisor",
  "real_estate_agent",
  "insurance_broker",
  "utility_certification_provider",
  "esg_sustainability_consultant",
  "relocation_immigration_consultant",
  "facility_manager",
  "short_term_rental_operator",
  "hotel_hospitality_operator",
  "marketing_agency",
  "crm_listing_data_provider",
  "concrete_contractor",
  "steel_structure_contractor",
  "carpenter",
  "tile_installer",
  "painter",
  "building_permit_consultant",
  "urban_planning_consultant",
  "legalization_specialist",
  "energy_certificate_inspector",
  "building_regulation_consultant",
  "fire_protection_consultant",
  "drywall_installer",
  "waterproofing_specialist",
  "insulation_contractor",
  "roofing_contractor",
  "window_aluminum_installer",
  "elevator_installer",
  "smart_home_installer",
] as const;

const optionalStringField = (field: string, maxLength: number) =>
  z.unknown().transform((value, ctx): string | null => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    const trimmed = value.trim();
    if (trimmed.length > maxLength) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return trimmed.length === 0 ? null : trimmed;
  });

const optionalBodyStringField = (field: string, maxLength: number) =>
  optionalStringField(field, maxLength)
    .optional()
    .transform((value): string | null => value ?? null);

const requiredStringField = (field: string, maxLength: number) =>
  z.unknown().transform((value, ctx): string => {
    if (typeof value !== "string") {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return trimmed;
  });

const professionalProfileSchema = z.object({
  title: requiredStringField("professionalProfile.title", 160),
  category: z.enum(PROFESSIONAL_CATEGORIES),
  displayName: optionalBodyStringField("professionalProfile.displayName", 160),
  city: optionalBodyStringField("professionalProfile.city", 120),
  licenseNumber: optionalBodyStringField("professionalProfile.licenseNumber", 120),
}).strict();

const onboardingRequestSchema = z.object({
  role: requiredStringField("role", 80),
  participantType: requiredStringField("participantType", 80),
  displayName: optionalBodyStringField("displayName", 120),
  city: optionalBodyStringField("city", 120),
  phone: optionalBodyStringField("phone", 40),
  professionalProfile: professionalProfileSchema.optional(),
}).strict();

type OnboardingRequest = z.infer<typeof onboardingRequestSchema>;

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
  const role = body.role;
  const participantType = body.participantType;
  if (!SELF_SERVICE_ROLE_SET.has(role) || !SELF_SERVICE_ROLE_SET.has(participantType)) {
    throw new AuthError("role_not_allowed", 400);
  }
  if (role !== participantType) {
    throw new AuthError("role_participant_mismatch", 400);
  }
  if (role === "professional") {
    if (!body.phone) throw new AuthError("professional_phone_required", 400);
    if (!body.professionalProfile) throw new AuthError("professional_profile_required", 400);
  }

  return {
    role,
    participantType,
    displayName: body.displayName,
    city: body.city,
    phone: body.phone,
    professionalProfile: body.professionalProfile,
  };
};

const rejectUnsupportedMethod = (req: Request): Response | null => {
  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }
  return null;
};

const upsertProfessionalProfile = async (
  supabase: { from(table: string): unknown },
  caller: { id: string },
  profile: NonNullable<OnboardingRequest["professionalProfile"]>,
): Promise<string> => {
  type ProfessionalUpsertQuery = {
    upsert(
      row: {
        user_id: string;
        title: string;
        category: string;
        display_name: string | null;
        city: string | null;
        license_number: string | null;
      },
      options: { onConflict: string },
    ): {
      select(columns: string): {
        single(): PromiseLike<{
          data: { id: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
  const professionals = supabase.from("professionals") as ProfessionalUpsertQuery;
  const { data, error } = await professionals
    .upsert({
      user_id: caller.id,
      title: profile.title,
      category: profile.category,
      display_name: profile.displayName,
      city: profile.city,
      license_number: profile.licenseNumber,
    }, { onConflict: "user_id" })
    .select("id")
    .single();

  if (error) throw error;
  const professionalId = data?.id;
  if (typeof professionalId !== "string" || professionalId.length === 0) {
    throw new Error("professional_profile_missing_id");
  }
  return professionalId;
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
    const body = await parseJsonBody(req, onboardingRequestSchema);
    const payload = parseOnboardingBody(body);
    const professionalId = payload.professionalProfile
      ? await upsertProfessionalProfile(supabase, caller, payload.professionalProfile)
      : null;

    const { error } = await supabase.rpc("complete_onboarding_role_for_user", {
      p_user_id: caller.id,
      p_role: payload.role,
      p_participant_type: payload.participantType,
      p_display_name: payload.displayName ?? payload.professionalProfile?.displayName ?? null,
      p_city: payload.city ?? payload.professionalProfile?.city ?? null,
      p_phone: payload.phone,
    });
    if (error) throw error;

    await logAuditEvent({
      actor_id: caller.id,
      target_id: caller.id,
      entity: "onboarding.role",
      action: "UPDATED",
      new_data: {
        role: payload.role,
        participant_type: payload.participantType,
        professional_id: professionalId,
      },
      reason: "complete_onboarding_role",
    });

    return jsonResponse(req, { success: true, professionalId });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status
      : err instanceof SchemaValidationError ? 400
      : 500;
    const message = err instanceof SchemaValidationError ? err.code
      : err instanceof Error ? err.message
      : "Onboarding failed";
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
