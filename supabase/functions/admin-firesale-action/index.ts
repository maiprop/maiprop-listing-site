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
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { MAX_FIRE_SALE_AMOUNT_EUR } from "../_shared/firesale.ts";

const log = createLogger("admin-firesale-action");
const limiter = makeRateLimiter({
  bucket: "admin-firesale-action",
  maxRequests: 120,
  windowMs: 60_000,
});

const optionalText = (field: string, maxLength: number) =>
  z.preprocess(
    (value) => {
      if (value === null || value === undefined) return null;
      if (typeof value !== "string") return value;
      const trimmed = value.trim();
      return trimmed.length === 0 ? null : trimmed;
    },
    z.string().max(maxLength, `Invalid ${field}`).nullable(),
  ).optional();
const optionalAmount = (field: string) =>
  z.number()
    .finite(`Invalid ${field}`)
    .min(0, `Invalid ${field}`)
    .max(MAX_FIRE_SALE_AMOUNT_EUR, `Invalid ${field}`)
    .nullable()
    .optional();
const optionalSellerResponse = z.preprocess(
  (value) => {
    if (value === null || value === undefined) return null;
    if (typeof value !== "string") return value;
    const normalized = value.trim().toLowerCase();
    return normalized.length === 0 ? null : normalized;
  },
  z.enum(["accepted", "countered", "rejected"], {
    error: "Invalid sellerResponse",
  }).nullable(),
).optional();
const firesaleActionRequestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("update_pipeline_deal"),
    dealId: z.string().uuid("Invalid dealId"),
    status: z.enum(["pending", "reviewed", "offer_sent", "closed"], {
      error: "Invalid status",
    }),
    adminNotes: optionalText("adminNotes", 4_000),
    offerPrice: optionalAmount("offerPrice"),
    sellerResponse: optionalSellerResponse,
    sellerResponsePrice: optionalAmount("sellerResponsePrice"),
  }).strict(),
  z.object({
    action: z.literal("set_investor_publication"),
    dealId: z.string().uuid("Invalid dealId"),
    published: z.boolean({ error: "Invalid published" }),
  }).strict(),
  z.object({
    action: z.literal("update_interest_workflow"),
    interestId: z.string().uuid("Invalid interestId"),
    status: z.enum([
      "interested",
      "prioritized",
      "reserved",
      "engaged",
      "won",
      "passed",
      "expired",
    ], { error: "Invalid status" }),
    reservationHours: z.number()
      .int("Invalid reservationHours")
      .min(1, "Invalid reservationHours")
      .max(24 * 30, "Invalid reservationHours")
      .nullable()
      .optional(),
    verifyProof: z.boolean({ error: "Invalid verifyProof" }).optional().default(
      false,
    ),
    adminNote: optionalText("adminNote", 2_000),
    proofAmount: optionalAmount("proofAmount"),
  }).strict(),
], { error: "Invalid action" });

const jsonResponse = (
  body: unknown,
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
  return "Admin firesale action failed";
}

function statusForRpcError(message: string): number {
  if (message.includes("forbidden") || message.includes("admin_only")) {
    return 403;
  }
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

  try {
    const body = await parseJsonBody(req, firesaleActionRequestSchema);
    const action = body.action;

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anonymous";
    if (await limiter.isLimited(ip)) {
      return tooManyRequestsResponse(corsHeaders);
    }

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceRoleKey || !supabaseUrl) {
      return jsonResponse({ error: "Service unavailable" }, 503, corsHeaders);
    }

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
        p_deal_id: body.dealId,
        p_status: body.status,
        p_admin_notes: body.adminNotes ?? null,
        p_offer_price: body.offerPrice ?? null,
        p_seller_response: body.sellerResponse ?? null,
        p_seller_response_price: body.sellerResponsePrice ?? null,
      };
    } else if (action === "set_investor_publication") {
      rpcName = "admin_set_firesale_investor_publication_for_user";
      rpcArgs = {
        _admin_user_id: caller.id,
        p_deal_id: body.dealId,
        p_published: body.published,
      };
    } else {
      rpcName = "admin_update_firesale_interest_workflow_for_user";
      rpcArgs = {
        _admin_user_id: caller.id,
        p_interest_id: body.interestId,
        p_status: body.status,
        p_reservation_hours: body.reservationHours ?? null,
        p_verify_pof: body.verifyProof,
        p_admin_note: body.adminNote ?? null,
        p_proof_amount: body.proofAmount ?? null,
      };
    }

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) {
      const message = errorMessage(error);
      log.warn("admin firesale action rejected", {
        action,
        adminId: caller.id,
        err: message,
      });
      return jsonResponse(
        { data: null, error: message },
        statusForRpcError(message),
        corsHeaders,
      );
    }

    log.info("admin firesale action completed", { action, adminId: caller.id });
    return jsonResponse({ data, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof SchemaValidationError) {
      return jsonResponse(
        { error: err.message, code: err.code, issues: err.issues },
        400,
        corsHeaders,
      );
    }
    const status = err instanceof AuthError ? err.status : 500;
    const message = errorMessage(err);
    log.warn("admin firesale action failed", { status, err: message });
    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
