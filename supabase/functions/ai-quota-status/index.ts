/**
 * ai-quota-status - authenticated quota status endpoint.
 *
 * The browser no longer calls the SECURITY DEFINER check_ai_quota RPC
 * directly. This function verifies the caller JWT, then asks a service-role-only
 * RPC for the caller's current monthly quota state.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError } from "../_shared/auth.ts";
import { verifiedGatewayUserFromJwt } from "../_shared/gatewayJwt.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  parseJsonBody,
  SchemaValidationError,
  z,
} from "../_shared/schema.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("ai-quota-status");
const limiter = makeRateLimiter({
  bucket: "ai-quota-status",
  maxRequests: 120,
  windowMs: 60_000,
  databaseTimeoutMs: 500,
});

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
const bucketSchema = z.string().regex(BUCKET_RE, "Invalid bucket");
const quotaStatusRequestSchema = z.object({
  bucket: bucketSchema.optional(),
  buckets: z.array(bucketSchema)
    .min(1, "Invalid buckets")
    .max(MAX_BATCHED_BUCKETS, "Invalid buckets")
    .optional(),
}).strict().superRefine((body, ctx) => {
  const requestModes = Number(body.bucket !== undefined) +
    Number(body.buckets !== undefined);
  if (requestModes !== 1) {
    ctx.addIssue({
      code: "custom",
      path: [],
      message: body.buckets !== undefined ? "Invalid buckets" : "Invalid bucket",
    });
  }
});

function parseBucketRequest(
  body: z.infer<typeof quotaStatusRequestSchema>,
): {
  buckets: string[];
  batched: boolean;
} {
  if (body.buckets !== undefined) {
    const buckets = Array.from(new Set(body.buckets));
    return { buckets, batched: true };
  }

  return { buckets: [body.bucket as string], batched: false };
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

  try {
    const body = await parseJsonBody(req, quotaStatusRequestSchema);
    const { buckets, batched } = parseBucketRequest(body);

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      "anonymous";
    if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceRoleKey || !supabaseUrl) {
      return jsonResponse({ error: "Service unavailable" }, 503, corsHeaders);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const userId = verifiedGatewayUserFromJwt(req).id;

    const { data, error } = await supabase.rpc("check_ai_quotas_for_user", {
      _user_id: userId,
      p_buckets: buckets,
    });
    if (error) throw error;

    const quotaMap = data && typeof data === "object" && !Array.isArray(data)
      ? data as Record<string, Partial<QuotaStatus> | null>
      : {};
    const quotaEntries = buckets.map((bucket) =>
      [bucket, normalizeQuota(quotaMap[bucket] ?? null)] as const
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
    if (err instanceof SchemaValidationError) {
      return jsonResponse(
        { error: err.message, code: err.code, issues: err.issues },
        400,
        corsHeaders,
      );
    }
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("quota status failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
