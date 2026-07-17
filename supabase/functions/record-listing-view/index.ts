import { createClient } from "npm:@supabase/supabase-js@2.57.2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { parseJsonBody, SchemaValidationError, z } from "../_shared/schema.ts";
import { resolveOptionalUserId } from "../_shared/optionalAuth.ts";

const log = createLogger("record-listing-view");
const maxRequestsPerMinute = readPositiveInt("VIEW_TRACKING_MAX_REQUESTS_PER_MINUTE", 120);
const rpcTimeoutMs = readPositiveInt("VIEW_TRACKING_RPC_TIMEOUT_MS", 2_000);
export const VIEW_RATE_LIMIT_TIMEOUT_MS = 350;
const limiter = makeRateLimiter({
  bucket: "record-listing-view",
  maxRequests: maxRequestsPerMinute,
  windowMs: 60_000,
  databaseTimeoutMs: VIEW_RATE_LIMIT_TIMEOUT_MS,
});
const LISTING_ID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const viewRequestSchema = z.object({
  listingId: z.string().regex(LISTING_ID_REGEX, "Invalid listingId"),
});

function readPositiveInt(key: string, fallback: number): number {
  const raw = Deno.env.get(key);
  if (!raw) return fallback;
  const value = Number(raw);
  return Number.isInteger(value) && value > 0 ? value : fallback;
}

function readSampleRate(): number {
  const raw = Deno.env.get("VIEW_TRACKING_SAMPLE_RATE");
  if (!raw) return 1;
  const value = Number(raw);
  if (!Number.isFinite(value)) return 1;
  return Math.min(1, Math.max(0, value));
}

export class ViewTrackingDeadlineError extends Error {
  constructor() {
    super("View tracking database deadline exceeded");
    this.name = "ViewTrackingDeadlineError";
  }
}

export async function withViewTrackingDeadline<T>(
  task: PromiseLike<T>,
  timeoutMs: number,
  onTimeout: () => void = () => undefined,
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      onTimeout();
      reject(new ViewTrackingDeadlineError());
    }, Math.max(1, timeoutMs));
  });

  try {
    return await Promise.race([Promise.resolve(task), timeout]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await parseJsonBody(req, viewRequestSchema);
    const listingId = body.listingId;
    const sampleRate = readSampleRate();
    if (sampleRate <= 0 || Math.random() > sampleRate) {
      return new Response(JSON.stringify({ success: true, sampled: false }), {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
    if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    if (!serviceRoleKey || !supabaseUrl) {
      return new Response(JSON.stringify({ error: "Service unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const bearerToken = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "").trim();
    const apiKey = req.headers.get("apikey")?.trim();
    // supabase-js sends the public project key in both headers for anonymous
    // invokes. It is a gateway credential, not an end-user access token.
    const userToken = bearerToken && bearerToken !== apiKey ? bearerToken : undefined;
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false },
    });

    const viewerId = await resolveOptionalUserId(
      userToken,
      (authToken) => supabase.auth.getUser(authToken),
    );
    if (userToken && !viewerId) {
      return new Response(JSON.stringify({
        success: true,
        recorded: false,
        reason: "auth_unavailable",
      }), {
        status: 202,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const controller = new AbortController();
    const rpc = supabase
      .rpc("record_listing_view", {
        p_listing_id: listingId,
        p_viewer_id: viewerId,
      })
      .abortSignal(controller.signal);
    const { error } = await withViewTrackingDeadline(
      rpc,
      rpcTimeoutMs,
      () => controller.abort(),
    );
    if (error) throw error;

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Failed to record listing view";
    log.warn("record failed", { err: message });
    const validationError = err instanceof SchemaValidationError;
    return new Response(JSON.stringify({
      error: validationError ? message : "Service unavailable",
      ...(validationError ? { code: err.code, issues: err.issues } : {}),
    }), {
      status: validationError ? 400 : 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
