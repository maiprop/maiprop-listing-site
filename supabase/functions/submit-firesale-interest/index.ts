/**
 * submit-firesale-interest - authenticated investor firesale submission endpoint.
 *
 * The browser no longer calls the SECURITY DEFINER submit_firesale_interest RPC
 * directly. This function verifies the caller JWT, validates any pre-uploaded
 * proof path belongs to that caller/deal, then invokes the service-role-only
 * explicit-user RPC.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { parseSubmitFiresaleInterestRequest } from "./request.ts";

const log = createLogger("submit-firesale-interest");
const limiter = makeRateLimiter({
  bucket: "submit-firesale-interest",
  maxRequests: 60,
  windowMs: 60_000,
});

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function validateProofPath(
  path: string | null,
  userId: string,
  dealId: string,
): void {
  if (!path) return;
  const expectedPrefix = `${userId}/firesale/${dealId}/`;
  if (
    !path.startsWith(expectedPrefix) || path.includes("..") || path.length > 512
  ) {
    throw new Error("Invalid proofOfFundsUrl");
  }
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Firesale interest submission failed";
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

  try {
    const body = await parseSubmitFiresaleInterestRequest(req);
    const payload = {
      dealId: body.dealId,
      message: body.message || null,
      proofAmount: body.proofAmount ?? null,
      proofOfFundsUrl: body.proofOfFundsUrl || null,
    };

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
    validateProofPath(payload.proofOfFundsUrl, caller.id, payload.dealId);

    const { data, error } = await supabase.rpc(
      "submit_firesale_interest_for_user",
      {
        _user_id: caller.id,
        p_deal_id: payload.dealId,
        p_message: payload.message,
        p_proof_amount: payload.proofAmount,
        p_proof_of_funds_url: payload.proofOfFundsUrl,
      },
    );

    if (error) {
      const message = errorMessage(error);
      log.warn("firesale interest rpc rejected", {
        userId: caller.id,
        err: message,
      });
      return jsonResponse(
        {
          data: null,
          error: { message, code: errorCode(error) ?? null },
        },
        200,
        corsHeaders,
      );
    }

    return jsonResponse({ data, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    if (err instanceof SchemaValidationError) {
      return jsonResponse(
        {
          error: err.message,
          code: err.code,
          issues: err.issues,
        },
        err.code === "payload_too_large" ? 413 : 400,
        corsHeaders,
      );
    }

    const message = errorMessage(err);
    log.warn("firesale interest submission failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
