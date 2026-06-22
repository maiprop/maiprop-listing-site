/**
 * save-professional-onboarding - authenticated professional setup boundary.
 *
 * Onboarding does not mutate professional_services, professional_availability,
 * or professional video settings directly from the browser. This function
 * verifies the caller owns the professional profile before applying setup rows.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import { logAuditEvent } from "../_shared/auditLog.ts";

const log = createLogger("save-professional-onboarding");

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const SERVICE_KEY_RE = /^[a-z0-9_:-]+$/;

const jsonResponse = (
  req: Request,
  body: Record<string, unknown>,
  status = 200,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

const uuidString = (field: string) =>
  z.unknown().transform((value, ctx): string => {
    if (typeof value !== "string" || !UUID_RE.test(value.trim())) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return value.trim();
  });

const requiredString = (field: string, maxLength: number, pattern?: RegExp) =>
  z.unknown().transform((value, ctx): string => {
    if (typeof value !== "string") {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    const trimmed = value.trim();
    if (trimmed.length === 0 || trimmed.length > maxLength || (pattern && !pattern.test(trimmed))) {
      ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
      return z.NEVER;
    }
    return trimmed;
  });

const optionalString = (field: string, maxLength: number) =>
  z.unknown()
    .optional()
    .transform((value, ctx): string | null => {
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

const optionalNumber = (field: string, max: number) =>
  z.unknown()
    .optional()
    .transform((value, ctx): number | null => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > max) {
        ctx.addIssue({ code: "custom", message: `Invalid ${field}` });
        return z.NEVER;
      }
      return value;
    });

const serviceRowSchema = z.object({
  professional_id: uuidString("professional_id"),
  service_key: requiredString("service_key", 120, SERVICE_KEY_RE),
  service_name: requiredString("service_name", 180),
  description: optionalString("description", 1000),
  category: requiredString("category", 120),
  pricing_model: requiredString("pricing_model", 80),
  rate_amount: optionalNumber("rate_amount", 1_000_000),
  currency: requiredString("currency", 12),
  estimated_hours: optionalNumber("estimated_hours", 10_000),
  video_enabled: z.boolean(),
  is_premium: z.boolean(),
  is_active: z.boolean(),
}).strict();

const availabilityRowSchema = z.object({
  professional_id: uuidString("professional_id"),
  day_of_week: z.number().int().min(0).max(6),
  start_time: requiredString("start_time", 20, TIME_RE),
  end_time: requiredString("end_time", 20, TIME_RE),
  is_active: z.boolean(),
}).strict();

const servicesRequestSchema = z.object({
  action: z.literal("services"),
  professionalId: uuidString("professionalId"),
  services: z.array(serviceRowSchema).min(1).max(100),
}).strict();

const availabilityRequestSchema = z.object({
  action: z.literal("availability"),
  professionalId: uuidString("professionalId"),
  availability: z.array(availabilityRowSchema).max(14),
}).strict();

const videoRequestSchema = z.object({
  action: z.literal("video"),
  professionalId: uuidString("professionalId"),
  videoLink: optionalString("videoLink", 500),
  calendarNotes: optionalString("calendarNotes", 2000),
}).strict();

const requestSchema = z.discriminatedUnion("action", [
  servicesRequestSchema,
  availabilityRequestSchema,
  videoRequestSchema,
]);

type RequestPayload = z.infer<typeof requestSchema>;
type DbError = { message: string };
type DbResult<T = unknown> = PromiseLike<{ data: T | null; error: DbError | null }>;
type FilterChain<T = unknown> = {
  eq(column: string, value: string | number): FilterChain<T>;
  not(column: string, operator: string, value: string): FilterChain<T>;
  maybeSingle(): DbResult<T>;
} & PromiseLike<{ data: unknown; error: DbError | null }>;
type ProfessionalSetupClient = {
  from(table: string): unknown;
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Professional onboarding setup failed";
}

async function requireOwnedProfessional(
  supabase: ProfessionalSetupClient,
  professionalId: string,
  userId: string,
) {
  type SelectQuery = {
    select(columns: string): FilterChain<{ id: string }>;
  };
  const query = supabase.from("professionals") as SelectQuery;
  const { data, error } = await query
    .select("id")
    .eq("id", professionalId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("professional_not_found", 403);
}

function requireRowsForProfessional(
  professionalId: string,
  rows: Array<{ professional_id: string }>,
) {
  if (rows.some((row) => row.professional_id !== professionalId)) {
    throw new AuthError("professional_id_mismatch", 400);
  }
}

async function saveServices(
  supabase: ProfessionalSetupClient,
  payload: Extract<RequestPayload, { action: "services" }>,
) {
  type ServicesTable = {
    upsert(rows: typeof payload.services, options: { onConflict: string }): DbResult;
    delete(): FilterChain;
  };
  const table = supabase.from("professional_services") as ServicesTable;

  const { error: upsertError } = await table.upsert(payload.services, {
    onConflict: "professional_id,service_key",
  });
  if (upsertError) throw upsertError;

  const keepKeys = payload.services.map((service) => service.service_key);
  const pruneQuery = table.delete().eq("professional_id", payload.professionalId);
  const { error: deleteError } = await pruneQuery.not("service_key", "in", `(${keepKeys.join(",")})`);
  if (deleteError) throw deleteError;
}

async function saveAvailability(
  supabase: ProfessionalSetupClient,
  payload: Extract<RequestPayload, { action: "availability" }>,
) {
  type AvailabilityTable = {
    upsert(rows: typeof payload.availability, options: { onConflict: string }): DbResult;
    delete(): FilterChain;
  };
  const table = supabase.from("professional_availability") as AvailabilityTable;

  if (payload.availability.length > 0) {
    const { error: upsertError } = await table.upsert(payload.availability, {
      onConflict: "professional_id,day_of_week",
    });
    if (upsertError) throw upsertError;
  }

  const keepDays = payload.availability.map((item) => item.day_of_week);
  const pruneQuery = table.delete().eq("professional_id", payload.professionalId);
  const { error: deleteError } = await (
    keepDays.length > 0
      ? pruneQuery.not("day_of_week", "in", `(${keepDays.join(",")})`)
      : pruneQuery
  );
  if (deleteError) throw deleteError;
}

async function saveVideo(
  supabase: ProfessionalSetupClient,
  payload: Extract<RequestPayload, { action: "video" }>,
  userId: string,
) {
  type ProfessionalsTable = {
    update(values: { video_link: string | null; calendar_notes: string | null }): {
      eq(column: string, value: string): {
        eq(column: string, value: string): {
          select(columns: string): {
            maybeSingle(): DbResult<{ id: string }>;
          };
        };
      };
    };
  };
  const table = supabase.from("professionals") as ProfessionalsTable;
  const { data, error } = await table
    .update({
      video_link: payload.videoLink,
      calendar_notes: payload.calendarNotes,
    })
    .eq("id", payload.professionalId)
    .eq("user_id", userId)
    .select("id")
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new AuthError("professional_not_found", 403);
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return jsonResponse(req, { error: "Service unavailable" }, 503);
  }

  try {
    const payload = await parseJsonBody(req, requestSchema);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const user = await verifyBearerToken(req, supabase);

    if (payload.action === "services") requireRowsForProfessional(payload.professionalId, payload.services);
    if (payload.action === "availability") requireRowsForProfessional(payload.professionalId, payload.availability);

    await requireOwnedProfessional(supabase, payload.professionalId, user.id);

    if (payload.action === "services") await saveServices(supabase, payload);
    if (payload.action === "availability") await saveAvailability(supabase, payload);
    if (payload.action === "video") await saveVideo(supabase, payload, user.id);

    await logAuditEvent({
      actor_id: user.id,
      target_id: payload.professionalId,
      entity: "professional.onboarding",
      action: "UPDATED",
      new_data: {
        action: payload.action,
        service_count: payload.action === "services" ? payload.services.length : undefined,
        availability_count: payload.action === "availability" ? payload.availability.length : undefined,
      },
      reason: "save_professional_onboarding",
    });

    return jsonResponse(req, { success: true });
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status
      : err instanceof SchemaValidationError ? 400
      : 500;
    const message = err instanceof SchemaValidationError ? err.code : errorMessage(err);
    log.warn("setup failed", { status, err: message });
    return jsonResponse(req, { error: message }, status);
  }
});
