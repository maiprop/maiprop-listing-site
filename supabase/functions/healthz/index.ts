import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/response.ts";
import { getStripeMode } from "../_shared/stripeMode.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req) ?? new Response("ok");
  const headers = getCorsHeaders(req);

  const checks: Record<string, "ok" | "fail" | "mock"> = {};
  let allOk = true;
  const billingMode = getStripeMode();

  // 1. Database connectivity
  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !key) throw new Error("Missing env");
    const sb = createClient(url, key);
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
  checks.openai = Deno.env.get("OPENAI_API_KEY") ? "ok" : "fail";
  checks.stripe = billingMode === "mock"
    ? "mock"
    : Deno.env.get("STRIPE_SECRET_KEY") && Deno.env.get("STRIPE_WEBHOOK_SECRET")
    ? "ok"
    : "fail";
  checks.sentry = Deno.env.get("SENTRY_DSN") ? "ok" : "fail";
  checks.brevo = Deno.env.get("BREVO_API_KEY") ? "ok" : "fail";
  if (checks.stripe === "fail") allOk = false;

  const status = allOk ? 200 : 503;
  return jsonResponse(
    {
      status: allOk ? "healthy" : "degraded",
      billing_mode: billingMode,
      checks,
      timestamp: new Date().toISOString(),
    },
    status,
    headers,
  );
});
