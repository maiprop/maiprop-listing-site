/**
 * admin-featured-listing-action - authenticated Spotlight listing moderation.
 *
 * Keeps admin-only Spotlight listing updates off direct browser table writes.
 * The function verifies the caller JWT, checks platform-admin authorization,
 * validates the update body, then applies only the allowed listing fields.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { AuthError, verifyBearerToken } from "../_shared/auth.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { errorResponse, jsonResponse as sharedJsonResponse } from "../_shared/response.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";

const log = createLogger("admin-featured-listing-action");
const limiter = makeRateLimiter({
  bucket: "admin-featured-listing-action",
  maxRequests: 120,
  windowMs: 60_000,
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const featuredListingUpdatesSchema = z.object({
  is_featured: z.boolean().optional(),
  priority_placement: z.number().int().min(1).max(10).optional(),
  featured_until: z.union([
    z.null(),
    z.string().refine((value) => !Number.isNaN(Date.parse(value)), "Invalid featured_until"),
  ]).optional(),
}).strict().refine((updates) => Object.keys(updates).length > 0, {
  message: "Invalid request body",
});

const featuredListingActionSchema = z.object({
  id: z.string().regex(UUID_RE, "Invalid listing id"),
  updates: featuredListingUpdatesSchema,
}).strict();

type FeaturedListingAction = z.infer<typeof featuredListingActionSchema>;

const jsonResponse = (
  req: Request,
  body: Record<string, unknown>,
  status = 200,
) =>
  sharedJsonResponse(body, status, getCorsHeaders(req));

const jsonErrorResponse = (
  req: Request,
  message: string,
  status: number,
  options: Parameters<typeof errorResponse>[3] = {},
) => errorResponse(message, status, getCorsHeaders(req), options);

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const message = (err as Record<string, unknown>).message;
    if (typeof message === "string" && message.length > 0) return message;
  }
  return "Spotlight listing update failed";
}

function databaseStatus(message: string): number {
  if (message.includes("forbidden") || message.includes("admin_only")) return 403;
  if (message.includes("not_found")) return 404;
  return 400;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;

  if (req.method !== "POST") {
    return jsonErrorResponse(req, "Method not allowed", 405);
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(getCorsHeaders(req));

  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  if (!serviceRoleKey || !supabaseUrl) {
    return jsonErrorResponse(req, "Service unavailable", 503);
  }

  try {
    const action: FeaturedListingAction = await parseJsonBody(req, featuredListingActionSchema);
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });
    const caller = await verifyBearerToken(req, supabase);

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", caller.id)
      .single();

    if (profileError) {
      log.warn("admin profile lookup failed", { userId: caller.id, err: profileError.message });
      return jsonErrorResponse(req, "Platform admin only", 403);
    }

    const profileRow = profile as { role?: string | null } | null;
    if (profileRow?.role !== "admin") {
      return jsonErrorResponse(req, "Platform admin only", 403);
    }

    const { error } = await supabase
      .from("listings")
      .update(action.updates)
      .eq("id", action.id);

    if (error) {
      const message = errorMessage(error);
      log.warn("spotlight listing update rejected", { listingId: action.id, err: message });
      return jsonErrorResponse(req, message, databaseStatus(message));
    }

    log.info("spotlight listing update completed", { listingId: action.id, adminId: caller.id });
    return jsonResponse(req, { ok: true });
  } catch (err: unknown) {
    const status = err instanceof AuthError
      ? err.status
      : err instanceof SchemaValidationError
      ? 400
      : 500;
    const message = errorMessage(err);
    log.warn("spotlight listing update failed", { status, err: message });
    return jsonErrorResponse(
      req,
      message,
      status,
      err instanceof SchemaValidationError ? { code: err.code, issues: err.issues } : {},
    );
  }
});
