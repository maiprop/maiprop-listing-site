/**
 * ai-quota-status - authenticated quota status endpoint.
 *
 * The browser no longer calls the SECURITY DEFINER check_ai_quota RPC
 * directly. This function verifies the caller JWT, then asks a service-role-only
 * RPC for the caller's current monthly quota state.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("ai-quota-status");
const limiter = makeRateLimiter({
  bucket: "ai-quota-status",
  maxRequests: 120,
  windowMs: 60_000,
});

type QuotaStatusRequest = {
  bucket?: unknown;
  buckets?: unknown;
};

type QuotaStatus = {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number;
};

const jsonResponse = (
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const BUCKET_RE = /^[a-z0-9-]{2,64}$/;
const MAX_BATCHED_BUCKETS = 12;

function parseBucketValue(bucket: unknown): string {
  if (typeof bucket !== "string" || !BUCKET_RE.test(bucket)) {
    throw new Error("Invalid bucket");
  }
  return bucket;
}

function parseBucketRequest(body: QuotaStatusRequest): {
  buckets: string[];
  batched: boolean;
} {
  if (body.buckets !== undefined) {
    if (!Array.isArray(body.buckets)) throw new Error("Invalid buckets");
    const buckets = Array.from(new Set(body.buckets.map(parseBucketValue)));
    if (buckets.length === 0 || buckets.length > MAX_BATCHED_BUCKETS) {
      throw new Error("Invalid buckets");
    }
    return { buckets, batched: true };
  }

  return { buckets: [parseBucketValue(body.bucket)], batched: false };
}

function normalizeQuota(quota: Partial<QuotaStatus> | null): QuotaStatus {
  return {
    allowed: quota?.allowed === true,
    reason: typeof quota?.reason === "string" ? quota.reason : null,
    used: Number(quota?.used ?? 0),
    limit: Number(quota?.limit ?? 0),
  };
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Failed to resolve AI quota status";
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
    const body = await req.json().catch(() => ({})) as QuotaStatusRequest;
    const { buckets, batched } = parseBucketRequest(body);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const user = await verifyBearerToken(req, supabase);

    const quotaEntries = await Promise.all(
      buckets.map(async (bucket) => {
        const { data, error } = await supabase.rpc("check_ai_quota_for_user", {
          _user_id: user.id,
          p_bucket: bucket,
        });
        if (error) throw error;
        return [bucket, normalizeQuota(data as Partial<QuotaStatus> | null)] as const;
      }),
    );

    if (batched) {
      return jsonResponse(
        { quotas: Object.fromEntries(quotaEntries) },
        200,
        corsHeaders,
      );
    }

    return jsonResponse(
      quotaEntries[0][1],
      200,
      corsHeaders,
    );
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("quota status failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
