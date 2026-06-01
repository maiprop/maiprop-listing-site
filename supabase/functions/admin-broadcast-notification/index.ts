/**
 * admin-broadcast-notification - authenticated admin broadcast endpoint.
 *
 * Keeps the broadcast SECURITY DEFINER RPC off the browser role. The function
 * verifies the caller JWT, then passes the caller id into a service-role-only
 * explicit-admin RPC that enforces platform-admin authorization in Postgres.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";

const log = createLogger("admin-broadcast-notification");
const limiter = makeRateLimiter({
  bucket: "admin-broadcast-notification",
  maxRequests: 60,
  windowMs: 60_000,
});

type Segment = "all" | "investors" | "sellers" | "agents" | "professionals" | "developers";

type BroadcastRequest = {
  segment?: unknown;
  title?: unknown;
  body?: unknown;
  link?: unknown;
};

const SEGMENTS = new Set<Segment>([
  "all",
  "investors",
  "sellers",
  "agents",
  "professionals",
  "developers",
]);

const jsonResponse = (
  body: unknown,
  status: number,
  corsHeaders: Record<string, string>,
) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function parseSegment(value: unknown): Segment {
  if (typeof value !== "string" || !SEGMENTS.has(value as Segment)) {
    throw new AuthError("Invalid segment", 400);
  }
  return value as Segment;
}

function requiredText(value: unknown, field: "title" | "body", maxLength: number): string {
  if (typeof value !== "string") throw new AuthError(`Invalid ${field}`, 400);
  const trimmed = value.trim();
  if (!trimmed) throw new AuthError("Title and message are required", 400);
  if (trimmed.length > maxLength) throw new AuthError(`${field} is too long`, 400);
  return trimmed;
}

function optionalLink(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== "string") throw new AuthError("Invalid link", 400);
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > 2048) throw new AuthError("link is too long", 400);
  return trimmed;
}

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Admin broadcast failed";
}

function statusForRpcError(message: string): number {
  if (message.includes("forbidden")) return 403;
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
    const body = await req.json().catch(() => ({})) as BroadcastRequest;
    const segment = parseSegment(body.segment);
    const title = requiredText(body.title, "title", 120);
    const message = requiredText(body.body, "body", 1000);
    const link = optionalLink(body.link);

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const caller = await verifyBearerToken(req, supabase);

    const { data, error } = await supabase.rpc("admin_broadcast_notification_for_user", {
      _admin_user_id: caller.id,
      p_segment: segment,
      p_title: title,
      p_body: message,
      p_type: "admin_broadcast",
      p_link: link,
    });

    if (error) {
      const messageText = errorMessage(error);
      log.warn("admin broadcast rejected", { segment, adminId: caller.id, err: messageText });
      return jsonResponse({ data: null, error: messageText }, statusForRpcError(messageText), corsHeaders);
    }

    log.info("admin broadcast completed", { segment, count: data ?? 0, adminId: caller.id });
    return jsonResponse({ data: data ?? 0, error: null }, 200, corsHeaders);
  } catch (err: unknown) {
    const status = err instanceof AuthError ? err.status : 500;
    const message = errorMessage(err);
    log.warn("admin broadcast failed", { status, err: message });
    return jsonResponse({ error: message }, status, corsHeaders);
  }
});
