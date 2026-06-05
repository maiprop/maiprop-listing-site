import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/response.ts";
import { getStripeMode } from "../_shared/stripeMode.ts";

type CheckStatus = "ok" | "fail" | "mock";
type HealthChecks = Record<string, CheckStatus>;

const HEALTHZ_DB_TIMEOUT_MS = 1500;

const createTimedFetch = (timeoutMs = HEALTHZ_DB_TIMEOUT_MS): typeof fetch => {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
};

const createHealthzClient = (
  url: string,
  serviceRoleKey: string,
) =>
  createClient(url, serviceRoleKey, {
    auth: { persistSession: false },
    global: { fetch: createTimedFetch() },
  });

const getBearerToken = (req: Request): string | null => {
  const authHeader = req.headers.get("Authorization");
  const match = authHeader?.match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() || null;
};

const hasMonitorSecret = (req: Request): boolean => {
  const secret = Deno.env.get("HEALTHZ_MONITOR_SECRET");
  if (!secret) return false;

  const suppliedSecret = req.headers.get("x-healthz-monitor-secret") ??
    getBearerToken(req);
  return suppliedSecret === secret;
};

const isAuthorizedAdmin = async (
  req: Request,
  url: string | undefined,
  serviceRoleKey: string | undefined,
): Promise<boolean> => {
  const token = getBearerToken(req);
  if (!token || !url || !serviceRoleKey) return false;
  if (Deno.env.get("HEALTHZ_MONITOR_SECRET") === token) return false;

  try {
    const sb = createHealthzClient(url, serviceRoleKey);
    const { data: authData, error: authError } = await sb.auth.getUser(token);
    const userId = authData.user?.id;
    if (authError || !userId) return false;

    const { data, error } = await sb
      .from("profiles")
      .select("role, is_platform_admin")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return false;

    return data?.role === "admin" || data?.is_platform_admin === true;
  } catch {
    return false;
  }
};

Deno.serve(async (req) => {
  const headers = getCorsHeaders(
    req,
    "x-healthz-detailed, x-healthz-monitor-secret",
  );
  if (req.method === "OPTIONS") return new Response("ok", { headers });

  const checks: HealthChecks = {};
  let allOk = true;
  const billingMode = getStripeMode();
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const wantsAdminDetailed = req.headers.get("x-healthz-detailed") === "true";
  const detailed = hasMonitorSecret(req) ||
    (wantsAdminDetailed && await isAuthorizedAdmin(req, url, key));

  if (!detailed) {
    return jsonResponse(
      { status: "healthy", timestamp: new Date().toISOString() },
      200,
      headers,
    );
  }

  // 1. Database connectivity
  try {
    if (!url || !key) throw new Error("Missing env");
    const sb = createHealthzClient(url, key);
    const { error } = await sb.from("profiles").select("user_id").limit(1);
    checks.database = error ? "fail" : "ok";
  } catch {
    checks.database = "fail";
  }
  if (checks.database === "fail") allOk = false;

  // 2. Required env vars
  const requiredEnvs = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];
  const missingEnvs = requiredEnvs.filter((k) => !Deno.env.get(k));
  checks.env_vars = missingEnvs.length === 0 ? "ok" : "fail";
  if (checks.env_vars === "fail") allOk = false;

  // 3. Integrations. Billing is a release-critical dependency: a missing
  // Stripe secret should degrade health instead of hiding behind "healthy".
  checks.openai =
    Deno.env.get("GEMINI_API_KEY") || Deno.env.get("OPENAI_API_KEY")
      ? "ok"
      : "fail";
  checks.stripe = billingMode === "mock"
    ? "mock"
    : Deno.env.get("STRIPE_SECRET_KEY") && Deno.env.get("STRIPE_WEBHOOK_SECRET")
    ? "ok"
    : "fail";
  checks.sentry = Deno.env.get("SENTRY_DSN") ? "ok" : "fail";
  checks.brevo = Deno.env.get("BREVO_API_KEY") ? "ok" : "fail";
  if (checks.stripe === "fail") allOk = false;

  const status = allOk ? 200 : 503;
  const basePayload = {
    status: allOk ? "healthy" : "degraded",
    timestamp: new Date().toISOString(),
  };

  return jsonResponse(
    { ...basePayload, billing_mode: billingMode, checks },
    status,
    headers,
  );
});
