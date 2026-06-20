/**
 * Admin-only pricing configuration writes.
 *
 * Browser code may read pricing_configs through normal RLS, but billing-facing
 * mutations go through this function so request bodies are schema-validated and
 * platform-admin authorization is verified server-side before service-role DB
 * writes.
 */
import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { parseJsonBody, SchemaValidationError } from "../_shared/schema.ts";
import { adminPricingActionSchema } from "./schema.ts";

const limiter = makeRateLimiter({
  bucket: "admin-pricing-config",
  maxRequests: 20,
  windowMs: 60_000,
});

const jsonResponse = (
  req: Request,
  body: Record<string, unknown>,
  status = 200,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  if (req.method !== "POST") {
    return jsonResponse(req, { error: "Method not allowed" }, 405);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(getCorsHeaders(req));

  try {
    const action = await parseJsonBody(req, adminPricingActionSchema);

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(req, { error: "No authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!supabaseUrl || !serviceRoleKey) {
      return jsonResponse(req, { error: "Service not configured" }, 503);
    }

    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    if (userError || !userData.user) return jsonResponse(req, { error: "Unauthenticated" }, 401);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", userData.user.id)
      .single();
    if (profileError) return jsonResponse(req, { error: "Platform admin only" }, 403);
    if ((profile as { role?: string | null } | null)?.role !== "admin") {
      return jsonResponse(req, { error: "Platform admin only" }, 403);
    }

    if (action.action === "delete") {
      const { error } = await supabase
        .from("pricing_configs")
        .delete()
        .eq("id", action.id);
      if (error) throw error;
      return jsonResponse(req, { ok: true, deleted: 1 });
    }

    const rows = action.rows.map((row) => ({
      ...row,
      metadata: row.metadata ?? {},
      updated_at: new Date().toISOString(),
    }));
    const { error } = await supabase
      .from("pricing_configs")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;

    return jsonResponse(req, { ok: true, rows: rows.length });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    const status = error instanceof SchemaValidationError ? 400 : 500;
    return jsonResponse(req, { error: message }, status);
  }
});
