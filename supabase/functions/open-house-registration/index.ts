/**
 * open-house-registration - authenticated open-house registration endpoint.
 *
 * The browser no longer calls the SECURITY DEFINER create_open_house_registration
 * RPC directly. This function verifies the caller JWT, then invokes the
 * service-role-only explicit-user RPC. Database business errors are returned in
 * a 200 RPC-style envelope so the frontend can keep its visitor-friendly error
 * mapping for capacity and validation failures.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("open-house-registration");
const limiter = makeRateLimiter({
  bucket: "open-house-registration",
  maxRequests: 60,
  windowMs: 60_000,
});

type RegistrationRequest = {
  listingId?: unknown;
  timeslotIndex?: unknown;
  contactName?: unknown;
  contactEmail?: unknown;
  contactPhone?: unknown;
  visitPurpose?: unknown;
  note?: unknown;
  contactPermission?: unknown;
  idVerificationConsent?: unknown;
  privacyAcknowledgement?: unknown;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseListingId(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new Error("Invalid listingId");
  }
  return value;
}

function optionalString(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new Error("Invalid request body");
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, maxLength);
}

function optionalTimeslot(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 999) {
    throw new Error("Invalid timeslotIndex");
  }
  return value;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Open-house registration failed";
}

function errorCode(err: unknown): string | undefined {
  if (err && typeof err === "object") {
    const code = (err as Record<string, unknown>).code;
    return typeof code === "string" && code.length > 0 ? code : undefined;
  }
  return undefined;
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
    const body = await req.json().catch(() => ({})) as RegistrationRequest;
    const payload = {
      listingId: parseListingId(body.listingId),
      timeslotIndex: optionalTimeslot(body.timeslotIndex),
      contactName: optionalString(body.contactName, 160),
      contactEmail: optionalString(body.contactEmail, 254),
      contactPhone: optionalString(body.contactPhone, 80),
      visitPurpose: optionalString(body.visitPurpose, 400),
      note: optionalString(body.note, 1000),
      contactPermission: body.contactPermission === true,
      idVerificationConsent: body.idVerificationConsent === true,
      privacyAcknowledgement: body.privacyAcknowledgement === true,
    };

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const user = await verifyBearerToken(req, supabase);

    const { data, error } = await supabase.rpc(
      "create_open_house_registration_for_user",
      {
        _user_id: user.id,
        p_listing_id: payload.listingId,
        p_timeslot_index: payload.timeslotIndex,
        p_contact_name: payload.contactName,
        p_contact_email: payload.contactEmail,
        p_contact_phone: payload.contactPhone,
        p_visit_purpose: payload.visitPurpose,
        p_note: payload.note,
        p_contact_permission: payload.contactPermission,
        p_id_verification_consent: payload.idVerificationConsent,
        p_privacy_acknowledgement: payload.privacyAcknowledgement,
      },
    );

    if (error) {
      const message = errorMessage(error);
      log.warn("registration rpc rejected", { err: message });
      return jsonResponse({
        data: null,
        error: { message, code: errorCode(error) ?? null },
      }, 200, corsHeaders);
    }

    return jsonResponse({ data, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("registration failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
