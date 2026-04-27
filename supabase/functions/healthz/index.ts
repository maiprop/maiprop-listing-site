import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { jsonResponse } from "../_shared/response.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return handleCors(req);
  const headers = getCorsHeaders(req);

  const checks: Record<string, "ok" | "fail"> = {};
  let allOk = true;

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

  // 3. Optional integrations (report status but don't fail health check)
  checks.openai = Deno.env.get("OPENAI_API_KEY") ? "ok" : "fail";
  checks.stripe = Deno.env.get("STRIPE_SECRET_KEY") ? "ok" : "fail";
  checks.sentry = Deno.env.get("SENTRY_DSN") ? "ok" : "fail";
  checks.brevo = Deno.env.get("BREVO_API_KEY") ? "ok" : "fail";

  const status = allOk ? 200 : 503;
  return jsonResponse(
    { status: allOk ? "healthy" : "degraded", checks, timestamp: new Date().toISOString() },
    status,
    headers,
  );
});
