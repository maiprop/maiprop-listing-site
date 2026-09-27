/**
 * aiUsage - per-user monthly cost ceiling for AI endpoints.
 *
 * Reservation pattern:
 *   1. Call `enforceAiQuota(req, bucket, corsHeaders)` early in the request
 *      handler. It verifies the Bearer token and reserves one quota unit in
 *      Postgres before provider work starts.
 *
 * Buckets are seeded in migration 20260623160000_ai_usage_tracking.sql.
 * The DB enforces strict caps via an atomic reservation RPC and a BEFORE
 * INSERT trigger. Provider work must not run unless reservation succeeds.
 *
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

type SupabaseClient = ReturnType<typeof createClient>;

let _client: SupabaseClient | null = null;

function getClient(): SupabaseClient | null {
  if (_client) return _client;
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return null;
  _client = createClient(url, key, { auth: { persistSession: false } });
  return _client;
}

export interface QuotaResult {
  allowed: boolean;
  reason: string | null;
  used: number;
  limit: number;
}

export interface EnforceResult {
  userId: string | null;
  errorResponse: Response | null;
  reserved: boolean;
}

type ReserveResult = QuotaResult & {
  reservation_id?: string;
};

type ReserveAiQuotaForUserRpc = (
  fn: "reserve_ai_quota_for_user",
  args: { _user_id: string; p_bucket: string },
) => Promise<{ data: unknown; error: { message: string } | null }>;

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
  corsHeaders: Record<string, string>,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function quotaDeniedResponse(
  quota: ReserveResult,
  corsHeaders: Record<string, string>,
): Response {
  const reason = quota.reason ?? "monthly_limit_reached";
  const status = reason === "plan_does_not_include_feature" ? 402 : 429;
  return jsonResponse(
    {
      error: reason === "plan_does_not_include_feature"
        ? "This AI feature is not included in your plan. Please upgrade."
        : "Monthly AI usage limit reached. Resets on the 1st of next month.",
      reason,
      used: quota.used,
      limit: quota.limit,
    },
    status,
    corsHeaders,
  );
}

function quotaUnavailableResponse(
  corsHeaders: Record<string, string>,
): Response {
  return jsonResponse(
    { error: "AI quota service unavailable. Please retry shortly." },
    503,
    corsHeaders,
  );
}

/**
 * Verifies the Authorization Bearer token, looks up the user, and reserves one
 * per-month quota unit for the given bucket. On any failure (auth, quota,
 * infra error) returns an `errorResponse` ready to be returned by the caller.
 *
 * Fails closed on quota infra errors so paid provider calls cannot run when the
 * quota system cannot prove the request is allowed.
 */
export async function enforceAiQuota(
  req: Request,
  bucket: string,
  corsHeaders: Record<string, string>,
): Promise<EnforceResult> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return {
      userId: null,
      errorResponse: jsonResponse({ error: "Authentication required" }, 401, corsHeaders),
      reserved: false,
    };
  }

  if (
    Deno.env.get("MAIPROP_EDGE_TEST_AUTH_BYPASS") === "true" &&
    Deno.env.get("SUPABASE_URL")?.includes("test.supabase.co") &&
    authHeader === "Bearer test-valid-token"
  ) {
    return { userId: "test-user-id", errorResponse: null, reserved: true };
  }

  // Quota and token verification require Supabase. Missing configuration is a
  // fail-closed path because otherwise provider calls would be unmetered.
  const client = getClient();
  if (!client) {
    console.error("[aiUsage] no SUPABASE_URL/SERVICE_ROLE_KEY - denying AI request");
    return {
      userId: null,
      errorResponse: quotaUnavailableResponse(corsHeaders),
      reserved: false,
    };
  }

  const token = authHeader.slice(7).trim();
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return {
      userId: null,
      errorResponse: jsonResponse({ error: "Invalid or expired token" }, 401, corsHeaders),
      reserved: false,
    };
  }

  const userId = userData.user.id;

  // The Edge Function has already verified the user's JWT. Reserve quota via a
  // service-role-only RPC that receives the verified user id explicitly, so the
  // legacy caller-context RPC can be removed from browser-role EXECUTE grants.
  const reserveAiQuotaForUser = client.rpc.bind(client) as unknown as ReserveAiQuotaForUserRpc;
  const { data: quotaData, error: quotaError } = await reserveAiQuotaForUser(
    "reserve_ai_quota_for_user",
    { _user_id: userId, p_bucket: bucket },
  );

  if (quotaError) {
    console.error(
      `[aiUsage] reserve_ai_quota failed for bucket=${bucket} userId=${userId}: ${quotaError.message} - failing closed`,
    );
    return {
      userId,
      errorResponse: quotaUnavailableResponse(corsHeaders),
      reserved: false,
    };
  }

  const quota = quotaData as unknown as ReserveResult;
  if (!quota.allowed) {
    return {
      userId,
      errorResponse: quotaDeniedResponse(quota, corsHeaders),
      reserved: false,
    };
  }

  return { userId, errorResponse: null, reserved: true };
}
