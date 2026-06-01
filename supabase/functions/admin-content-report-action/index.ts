/**
 * admin-content-report-action - authenticated AdminReports moderation endpoint.
 *
 * Keeps report moderation RPC execution off the browser role. The function
 * verifies the caller JWT, then passes the caller id into service-role-only
 * explicit-admin RPCs that enforce platform-admin authorization in Postgres.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("admin-content-report-action");
const limiter = makeRateLimiter({
  bucket: "admin-content-report-action",
  maxRequests: 120,
  windowMs: 60_000,
});

type ReportAction = "resolve" | "suspend_listing" | "ban_owner";

type ReportActionRequest = {
  action?: unknown;
  reportId?: unknown;
  reason?: unknown;
};

const UUID_RE = /^[0-9a-f-]{36}$/i;
const ACTIONS = new Set<ReportAction>(["resolve", "suspend_listing", "ban_owner"]);

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseAction(value: unknown): ReportAction {
  if (typeof value !== "string" || !ACTIONS.has(value as ReportAction)) {
    throw new AuthError("Invalid action", 400);
  }
  return value as ReportAction;
}

function parseReportId(value: unknown): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new AuthError("Invalid reportId", 400);
  }
  return value;
}

function optionalReason(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AuthError("Invalid reason", 400);
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed.slice(0, 1000);
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Admin report action failed";
}

function statusForRpcError(message: string): number {
  if (message.includes("forbidden")) return 403;
  if (message.includes("not_found")) return 404;
  return 400;
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
    const body = await req.json().catch(() => ({})) as ReportActionRequest;
    const action = parseAction(body.action);
    const reportId = parseReportId(body.reportId);
    const reason = optionalReason(body.reason);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const caller = await verifyBearerToken(req, supabase);

    const rpcName = action === "resolve"
      ? "admin_resolve_listing_report_for_user"
      : action === "suspend_listing"
      ? "admin_suspend_reported_listing_for_user"
      : "admin_ban_reported_content_owner_for_user";

    const rpcArgs = action === "resolve"
      ? { _admin_user_id: caller.id, p_report_id: reportId }
      : {
        _admin_user_id: caller.id,
        p_report_id: reportId,
        p_reason: reason,
      };

    const { data, error } = await supabase.rpc(rpcName, rpcArgs);
    if (error) {
      const message = errorMessage(error);
      log.warn("admin report action rejected", { action, reportId, err: message });
      return jsonResponse({ data: null, error: message }, statusForRpcError(message), corsHeaders);
    }

    log.info("admin report action completed", { action, reportId, adminId: caller.id });
    return jsonResponse({ data, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = errorMessage(err);
    log.warn("admin report action failed", { status, err: message });
    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
