/**
 * aiUsage — per-user monthly cost ceiling for AI endpoints.
 *
 * Two-step pattern:
 *   1. Call `enforceAiQuota(req, bucket, corsHeaders)` early in the
 *      request handler. It does Bearer-token auth + a pre-flight quota
 *      check. Returns either a userId you can use for downstream work,
 *      OR a Response you should return immediately.
 *   2. After the AI call succeeds, call `recordAiCall(userId, bucket)`
 *      to persist the usage. This is best-effort — a recording failure
 *      logs but does not affect the user's response.
 *
 * Buckets are seeded in migration 20260623160000_ai_usage_tracking.sql.
 * The DB enforces strict caps via a BEFORE INSERT trigger; the
 * pre-flight check is for UX (return 429 before burning OpenAI credits).
 *
 * Anonymous endpoints (e.g. ai-translate with verify_jwt=false) should
 * NOT use this helper — their abuse vector is rate limiting, not
 * per-user quota.
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
}

/**
 * Verifies the Authorization Bearer token, looks up the user, and
 * checks their per-month quota for the given bucket. On any failure
 * (auth, quota, infra error) returns an `errorResponse` ready to be
 * returned by the caller.
 *
 * Fails OPEN on infra error (e.g. RPC unreachable) so a quota-system
 * outage cannot take down AI endpoints. The trigger on usage_ai_calls
 * still provides defence-in-depth.
 */
export async function enforceAiQuota(
  req: Request,
  bucket: string,
  corsHeaders: Record<string, string>,
): Promise<EnforceResult> {
  const client = getClient();
  if (!client) {
    console.warn("[aiUsage] no SUPABASE_URL/SERVICE_ROLE_KEY — failing open");
    return { userId: null, errorResponse: null };
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.toLowerCase().startsWith("bearer ")) {
    return {
      userId: null,
      errorResponse: new Response(
        JSON.stringify({ error: "Authentication required" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const token = authHeader.slice(7).trim();
  const { data: userData, error: userError } = await client.auth.getUser(token);
  if (userError || !userData.user) {
    return {
      userId: null,
      errorResponse: new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  const userId = userData.user.id;

  // Pre-flight quota: the RPC reads auth.uid() so we need a request-scoped
  // client. Cheaper to spin one up here than to thread it through.
  const userClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    },
  );

  const { data: quotaData, error: quotaError } = await userClient.rpc(
    "check_ai_quota",
    { p_bucket: bucket },
  );

  if (quotaError) {
    console.warn(
      `[aiUsage] check_ai_quota failed for bucket=${bucket} userId=${userId}: ${quotaError.message} — failing open`,
    );
    return { userId, errorResponse: null };
  }

  const quota = quotaData as unknown as QuotaResult;
  if (!quota.allowed) {
    return {
      userId,
      errorResponse: new Response(
        JSON.stringify({
          error: quota.reason === "plan_does_not_include_feature"
            ? "This AI feature is not included in your plan. Please upgrade."
            : "Monthly AI usage limit reached. Resets on the 1st of next month.",
          reason: quota.reason,
          used: quota.used,
          limit: quota.limit,
        }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      ),
    };
  }

  return { userId, errorResponse: null };
}

/**
 * Records one AI call against the user's monthly quota. Best-effort:
 * a recording failure is logged but does not throw — the user already
 * received their AI response, and the next request will still go
 * through the pre-flight check.
 *
 * If the BEFORE INSERT trigger raises (i.e. a concurrent burst pushed
 * the user past the cap between the pre-flight check and now), the
 * error is swallowed too — we don't punish the user for a race window.
 */
export async function recordAiCall(
  userId: string | null,
  bucket: string,
): Promise<void> {
  if (!userId) return;

  // Use a request-scoped client with the user's JWT so the RPC sees
  // auth.uid(). We don't have the JWT here, so we use a service-role
  // client and pass user_id explicitly via the trigger (the trigger
  // reads NEW.user_id, not auth.uid).
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;

  const client = createClient(url, key, { auth: { persistSession: false } });

  // Direct insert with service role — the BEFORE INSERT trigger
  // enforces the cap atomically. Cast through `unknown` because the
  // generated supabase-js types may not yet include usage_ai_calls.
  const { error } = await (client.from("usage_ai_calls") as unknown as {
    insert: (row: { user_id: string; bucket: string }) => Promise<{ error: { message: string } | null }>;
  }).insert({ user_id: userId, bucket });

  if (error) {
    console.warn(
      `[aiUsage] recordAiCall failed for bucket=${bucket} userId=${userId}: ${error.message}`,
    );
  }
}
