/**
 * begin-role-switch - authenticated role-switch initiator.
 *
 * The browser no longer calls the SECURITY DEFINER begin_role_switch RPC
 * directly. This function verifies the caller JWT, then invokes a
 * service-role-only RPC with the verified user id.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  parseBoundedJsonBody,
  SchemaValidationError,
  z,
} from "../_shared/schema.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("begin-role-switch");
const limiter = makeRateLimiter({
  bucket: "begin-role-switch",
  maxRequests: 30,
  windowMs: 60_000,
});
export const MAX_BEGIN_ROLE_SWITCH_REQUEST_BODY_BYTES = 8_192;
export const BEGIN_ROLE_SWITCH_REQUEST_BODY_TIMEOUT_MS = 2_000;

const jsonResponse = (
  body: Record<string, unknown>,
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
  return "Failed to begin role switch";
}

const roleSwitchRequestSchema = z.union([
  z.object({ audit_id: z.string().uuid() }).strict(),
  z.object({ validate_only: z.literal(true) }).strict(),
  z.object({ validateOnly: z.literal(true) }).strict(),
  z.object({ dry_run: z.literal(true) }).strict(),
  z.object({ dryRun: z.literal(true) }).strict(),
]).transform((body) => ({
  validateOnly: !("audit_id" in body),
  auditId: "audit_id" in body ? body.audit_id : null,
}));

export function parseBeginRoleSwitchRequest(
  req: Request,
  options: { timeoutMs?: number } = {},
) {
  return parseBoundedJsonBody(req, roleSwitchRequestSchema, {
    maxBytes: MAX_BEGIN_ROLE_SWITCH_REQUEST_BODY_BYTES,
    timeoutMs: options.timeoutMs ?? BEGIN_ROLE_SWITCH_REQUEST_BODY_TIMEOUT_MS,
  });
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, 405, corsHeaders);
  }

  try {
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceRoleKey || !supabaseUrl) {
      return jsonResponse({ error: "Service unavailable" }, 503, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const user = await verifyBearerToken(req, supabase);
    const { validateOnly, auditId } = await parseBeginRoleSwitchRequest(req);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anonymous";
    if (await limiter.isLimited(ip)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    const { error } = await supabase.rpc(
      validateOnly
        ? "validate_role_switch_for_user"
        : "begin_role_switch_for_user",
      validateOnly
        ? { _user_id: user.id }
        : { _user_id: user.id, _audit_id: auditId },
    );
    if (error) throw error;

    return jsonResponse(
      { success: true, validate_only: validateOnly },
      200,
      corsHeaders,
    );
  } catch (err: unknown) {
    if (err instanceof SchemaValidationError) {
      return jsonResponse(
        { error: err.message, code: err.code, issues: err.issues },
        err.status,
        corsHeaders,
      );
    }
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("begin role switch failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
