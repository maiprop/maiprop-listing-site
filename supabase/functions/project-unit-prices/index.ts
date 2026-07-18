/**
 * project-unit-prices - authenticated project unit bulk price endpoint.
 *
 * The browser does not call a SECURITY DEFINER price-update RPC directly. This
 * function verifies the caller JWT, then asks a service-role-only explicit-user
 * RPC to update available project units for projects the caller owns.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { requireProSubscription } from "../_shared/proGate.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("project-unit-prices");
const limiter = makeRateLimiter({
  bucket: "project-unit-prices",
  maxRequests: 60,
  windowMs: 60_000,
});

type PriceUpdateRequest = {
  projectId?: unknown;
  percentage?: unknown;
};

type ProfileRow = {
  role: string | null;
  role_switch_in_progress_at: string | null;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseProjectId(body: PriceUpdateRequest): string {
  if (typeof body.projectId !== "string" || !UUID_RE.test(body.projectId)) {
    throw new Error("Invalid projectId");
  }
  return body.projectId;
}

function parsePercentage(body: PriceUpdateRequest): number {
  if (
    typeof body.percentage !== "number" ||
    !Number.isFinite(body.percentage) ||
    body.percentage === 0 ||
    body.percentage < -100 ||
    body.percentage > 1000
  ) {
    throw new Error("Invalid percentage");
  }
  return body.percentage;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Failed to update project unit prices";
}

async function requireDeveloperAccess(
  supabase: ReturnType<typeof createClient>,
  userId: string,
) {
  const { data, error } = await supabase
    .from("profiles")
    .select("role, role_switch_in_progress_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  const profile = data as ProfileRow | null;
  const role = profile?.role;
  if (
    (role !== "developer" && role !== "admin") ||
    (role !== "admin" && profile?.role_switch_in_progress_at)
  ) {
    throw new AuthError("developer_role_required", 403);
  }
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
    const body = await req.json().catch(() => ({})) as PriceUpdateRequest;
    const projectId = parseProjectId(body);
    const percentage = parsePercentage(body);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const user = await verifyBearerToken(req, supabase);
    await requireDeveloperAccess(supabase, user.id);
    const proCheck = await requireProSubscription(user.id, corsHeaders, {
      audience: "developer",
    });
    if (proCheck.errorResponse) return proCheck.errorResponse;

    const { data, error } = await supabase.rpc(
      "bulk_update_project_unit_prices_for_user",
      {
        _user_id: user.id,
        p_project_id: projectId,
        p_percentage: percentage,
      },
    );
    if (error) throw error;

    return jsonResponse({ updatedCount: Number(data ?? 0) }, 200, corsHeaders);
  } catch (err: unknown) {
    if (err instanceof AuthError) {
      return jsonResponse({ error: err.message }, err.status, corsHeaders);
    }

    const message = errorMessage(err);
    log.warn("project unit bulk price update failed", { err: message });
    return jsonResponse({ error: message }, 400, corsHeaders);
  }
});
