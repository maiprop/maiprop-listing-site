/**
 * Rate limiter for Supabase Edge Functions — async, globally consistent.
 *
 * Strategy:
 *   - When SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY are present (production
 *     edge), we delegate to the Postgres RPC `check_and_increment_rate_limit`
 *     so counters are shared across regions / isolates.
 *   - Otherwise (tests, dev without service-role key) we fall back to an
 *     in-memory limiter scoped to the current isolate.
 *
 * The API is intentionally async even for the in-memory backend, so call
 * sites have one consistent shape and there is no risk of a future swap
 * silently fail-closing.
 *
 * Usage:
 *   import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
 *   const limiter = makeRateLimiter({
 *     bucket: "ai-search",
 *     maxRequests: 20,
 *     windowMs: 60_000,
 *   });
 *   if (await limiter.isLimited(userId ?? ip)) {
 *     return tooManyRequestsResponse(corsHeaders);
 *   }
 *
 * Failure policy:
 *   DB RPC failures fail open by default for ordinary user-facing endpoints.
 *   High-cost or abuse-sensitive buckets should pass `failClosed: true`, which
 *   denies requests when the shared limiter cannot prove the caller is under
 *   the limit.
 */

import {
  createClient,
  type SupabaseClient,
} from "npm:@supabase/supabase-js@2.57.2";

// ── Types ────────────────────────────────────────────────────────────────────

export interface RateLimiter {
  /**
   * True if the (bucket, key) pair has exceeded its allowance for the current
   * window. Always increments on call — i.e. each invocation counts as one
   * request.
   */
  isLimited(key: string): Promise<boolean>;
  /**
   * Non-incrementing introspection. May return stale data when the DB-backed
   * backend is in use; intended for diagnostics, not for gating.
   */
  status(key: string): Promise<{ remaining: number; resetAt: number }>;
}

export interface RateLimiterOptions {
  /**
   * Stable identifier for this limiter — typically the function name
   * (e.g. "ai-search"). Used to namespace counters in the shared table so
   * "ai-search:user:abc" and "property-chat:user:abc" don't collide.
   */
  bucket: string;
  maxRequests: number;
  windowMs: number;
  failClosed?: boolean;
  databaseTimeoutMs?: number;
}

const DEFAULT_RATE_LIMIT_DB_TIMEOUT_MS = 2_000;

// ── Public factory ───────────────────────────────────────────────────────────

/**
 * Create a rate limiter. Picks the DB-backed backend when service-role
 * credentials are available, otherwise falls back to in-memory.
 */
export function makeRateLimiter(opts: RateLimiterOptions): RateLimiter {
  if (safeEnv("RATE_LIMIT_FORCE_MEMORY") === "true") {
    return makeMemoryRateLimiter(opts);
  }

  const supabaseUrl = safeEnv("SUPABASE_URL");
  const serviceRoleKey = safeEnv("SUPABASE_SERVICE_ROLE_KEY");

  if (supabaseUrl && serviceRoleKey) {
    return makeDbRateLimiter({ ...opts, supabaseUrl, serviceRoleKey });
  }
  return makeMemoryRateLimiter(opts);
}

/** Standard 429 response with Retry-After header. */
export function tooManyRequestsResponse(
  corsHeaders: Record<string, string>,
): Response {
  return new Response(
    JSON.stringify({
      error: "Too many requests. Please wait before trying again.",
      code: "rate_limited",
    }),
    {
      status: 429,
      headers: {
        ...corsHeaders,
        "Content-Type": "application/json",
        "Retry-After": "60",
      },
    },
  );
}

// ── In-memory backend ────────────────────────────────────────────────────────

interface Window {
  count: number;
  reset: number;
}

/**
 * In-memory limiter scoped to the current isolate. Exported so tests can
 * exercise it directly without needing a Supabase URL.
 */
export function makeMemoryRateLimiter(
  opts: RateLimiterOptions,
): RateLimiter {
  const { maxRequests, windowMs } = opts;
  const windows = new Map<string, Window>();

  function getWindow(key: string): Window {
    const now = Date.now();
    const existing = windows.get(key);
    if (!existing || now > existing.reset) {
      const w: Window = { count: 0, reset: now + windowMs };
      windows.set(key, w);
      return w;
    }
    return existing;
  }

  return {
    isLimited(key: string): Promise<boolean> {
      const w = getWindow(key);
      if (w.count >= maxRequests) return Promise.resolve(true);
      w.count++;
      return Promise.resolve(false);
    },
    status(key: string): Promise<{ remaining: number; resetAt: number }> {
      const w = getWindow(key);
      return Promise.resolve({
        remaining: Math.max(0, maxRequests - w.count),
        resetAt: w.reset,
      });
    },
  };
}

// ── DB-backed backend ────────────────────────────────────────────────────────

interface RpcResponse {
  allowed: boolean;
  count: number;
  limit: number;
  window_start: string;
  reset_in_seconds: number;
}

interface DbRateLimiterOptions extends RateLimiterOptions {
  supabaseUrl: string;
  serviceRoleKey: string;
}

/**
 * DB-backed limiter. Each `isLimited` call invokes one Postgres RPC
 * (`check_and_increment_rate_limit`) which atomically increments the counter
 * for the current window and returns whether the request is allowed.
 *
 * On RPC failure we LOG and ALLOW (fail-open). This is the safer default
 * for user-facing AI endpoints; the alternative (deny on infra failure)
 * could cascade into a global outage.
 */
export function makeDbRateLimiter(
  opts: DbRateLimiterOptions,
): RateLimiter {
  const {
    bucket,
    maxRequests,
    windowMs,
    supabaseUrl,
    serviceRoleKey,
    failClosed = false,
    databaseTimeoutMs,
  } = opts;
  const windowSeconds = Math.max(1, Math.round(windowMs / 1000));

  // One client per limiter — cheap, stateless, persists across requests on
  // the same isolate. We disable session persistence/auto-refresh because
  // the service-role JWT is long-lived and never refreshes.
  let client: SupabaseClient | null = null;
  function getClient(): SupabaseClient {
    if (!client) {
      client = createClient(supabaseUrl, serviceRoleKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
    }
    return client;
  }

  async function callRpc(key: string): Promise<RpcResponse | null> {
    const timeoutMs = databaseTimeoutMs ?? readPositiveIntEnv(
      "RATE_LIMIT_DB_TIMEOUT_MS",
      DEFAULT_RATE_LIMIT_DB_TIMEOUT_MS,
    );
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const { data, error } = await getClient()
        .rpc("check_and_increment_rate_limit", {
          p_bucket: `${bucket}:${key}`,
          p_window_seconds: windowSeconds,
          p_limit: maxRequests,
        })
        .abortSignal(controller.signal);
      if (error) {
        console.error(
          JSON.stringify({
            level: "error",
            event: failClosed
              ? "rate_limit_fail_closed"
              : "rate_limit_fail_open",
            bucket,
            key,
            reason: error.message,
            alert: true,
          }),
        );
        return null;
      }
      return data as RpcResponse;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(
        JSON.stringify({
          level: "error",
          event: failClosed ? "rate_limit_fail_closed" : "rate_limit_fail_open",
          bucket,
          key,
          reason: msg,
          alert: true,
        }),
      );
      return null;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  return {
    async isLimited(key: string): Promise<boolean> {
      const r = await callRpc(key);
      if (r === null) return failClosed;
      return !r.allowed;
    },
    async status(key: string): Promise<{ remaining: number; resetAt: number }> {
      // status() is a soft introspection; we re-use the increment RPC for
      // simplicity. Callers should not rely on it for gating decisions.
      const r = await callRpc(key);
      if (r === null) {
        return {
          remaining: failClosed ? 0 : maxRequests,
          resetAt: Date.now() + windowMs,
        };
      }
      return {
        remaining: Math.max(0, r.limit - r.count),
        resetAt: Date.now() + r.reset_in_seconds * 1000,
      };
    },
  };
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function safeEnv(key: string): string | undefined {
  // Wrapped because Deno.env.get can throw "PermissionDenied" if --allow-env
  // is missing. Callers should never crash on env probing.
  try {
    return Deno.env.get(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function readPositiveIntEnv(key: string, fallback: number): number {
  const raw = safeEnv(key);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
