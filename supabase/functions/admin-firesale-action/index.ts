/**
 * admin-firesale-action - authenticated admin firesale workflow endpoint.
 *
 * Keeps firesale admin SECURITY DEFINER RPC execution off the browser role.
 * The function verifies the caller JWT, then passes the caller id into
 * service-role-only explicit-admin RPCs that enforce platform-admin
 * authorization in Postgres.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("admin-firesale-action");
const limiter = makeRateLimiter({
  bucket: "admin-firesale-action",
  maxRequests: 120,
  windowMs: 60_000,
});

type FiresaleAction = "update_pipeline_deal" | "set_investor_publication" | "update_interest_workflow";

type FiresaleActionRequest = {
  action?: unknown;
  dealId?: unknown;
  interestId?: unknown;
  status?: unknown;
  adminNotes?: unknown;
  offerPrice?: unknown;
  sellerResponse?: unknown;
  sellerResponsePrice?: unknown;
  published?: unknown;
  reservationHours?: unknown;
  verifyProof?: unknown;
  adminNote?: unknown;
  proofAmount?: unknown;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ACTIONS = new Set<FiresaleAction>([
  "update_pipeline_deal",
  "set_investor_publication",
  "update_interest_workflow",
]);

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseAction(value: unknown): FiresaleAction {
  if (typeof value !== "string" || !ACTIONS.has(value as FiresaleAction)) {
    throw new AuthError("Invalid action", 400);
  }
  return value as FiresaleAction;
}

function parseUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AuthError(`Invalid ${field}`, 400);
  }
  return value;
}

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AuthError(`Invalid ${field}`, 400);
  return value;
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new AuthError(`Invalid ${field}`, 400);
  }
  return value;
}

function optionalNumber(value: unknown, field: string): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new AuthError(`Invalid ${field}`, 400);
  }
  return value;
}

function optionalInteger(value: unknown, field: string): number | null {
  const parsed = optionalNumber(value, field);
  if (parsed === null) return null;
  if (!Number.isInteger(parsed)) throw new AuthError(`Invalid ${field}`, 400);
  return parsed;
}

function requiredBoolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new AuthError(`Invalid ${field}`, 400);
  return value;
}

function optionalBoolean(value: unknown): boolean {
  if (value === null || value === undefined) return false;
  if (typeof value !== "boolean") throw new AuthError("Invalid verifyProof", 400);
  return value;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Admin firesale action failed";
}

function statusForRpcError(message: string): number {
  if (message.includes("forbidden") || message.includes("admin_only")) return 403;
  if (message.includes("not_found")) return 404;
  return 400;
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
    const body = await req.json().catch(() => ({})) as FiresaleActionRequest;
    const action = parseAction(body.action);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const caller = await verifyBearerToken(req, supabase);

    let rpcName: string;
    let rpcArgs: Record<string, unknown>;

    if (action === "update_pipeline_deal") {
      rpcName = "admin_update_firesale_pipeline_deal_for_user";
      rpcArgs = {
        _admin_user_id: caller.id,
        p_deal_id: parseUuid(body.dealId, "dealId"),
        p_status: requiredText(body.status, "status"),
        p_admin_notes: optionalText(body.adminNotes, "adminNotes"),
        p_offer_price: optionalNumber(body.offerPrice, "offerPrice"),
        p_seller_response: optionalText(body.sellerResponse, "sellerResponse"),
        p_seller_response_price: optionalNumber(body.sellerResponsePrice, "sellerResponsePrice"),
      };
    } else if (action === "set_investor_publication") {
      rpcName = "admin_set_firesale_investor_publication_for_user";
      rpcArgs = {
        _admin_user_id: caller.id,
        p_deal_id: parseUuid(body.dealId, "dealId"),
        p_published: requiredBoolean(body.published, "published"),
      };
    } else {
      rpcName = "admin_update_firesale_interest_workflow_for_user";
      rpcArgs = {
        _admin_user_id: caller.id,
        p_interest_id: parseUuid(body.interestId, "interestId"),
        p_status: requiredText(body.status, "status"),
        p_reservation_hours: optionalInteger(body.reservationHours, "reservationHours"),
        p_verify_pof: optionalBoolean(body.verifyProof),
        p_admin_note: optionalText(body.adminNote, "adminNote"),
        p_proof_amount: optionalNumber(body.proofAmount, "proofAmount"),
      };
    }

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) {
      const message = errorMessage(error);
      log.warn("admin firesale action rejected", { action, adminId: caller.id, err: message });
      return jsonResponse({ data: null, error: message }, statusForRpcError(message), corsHeaders);
    }

    log.info("admin firesale action completed", { action, adminId: caller.id });
    return jsonResponse({ data, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = errorMessage(err);
    log.warn("admin firesale action failed", { status, err: message });
    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
