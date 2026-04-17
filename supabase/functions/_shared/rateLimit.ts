/**
 * In-memory per-key rate limiter for Supabase Edge Functions.
 *
 * Usage:
 *   import { makeRateLimiter } from "../_shared/rateLimit.ts";
 *   const limiter = makeRateLimiter({ maxRequests: 20, windowMs: 60_000 });
 *   if (limiter.isLimited(userId ?? ip)) { return tooManyRequests(); }
 *
 * NOTE: State is per-isolate. On multi-isolate deployments each isolate has
 * its own counter — limits are per-isolate, not global. This is sufficient
 * to prevent runaway bot loops on a single Supabase edge region.
 */

interface Window {
  count: number;
  reset: number;
}

export interface RateLimiter {
  /** Returns true if the key has exceeded the limit; increments counter otherwise. */
  isLimited(key: string): boolean;
  /** Returns { remaining, resetAt } for the given key without incrementing. */
  status(key: string): { remaining: number; resetAt: number };
}

export function makeRateLimiter(opts: {
  maxRequests: number;
  windowMs: number;
}): RateLimiter {
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
    isLimited(key: string): boolean {
      const w = getWindow(key);
      if (w.count >= maxRequests) return true;
      w.count++;
      return false;
    },
    status(key: string): { remaining: number; resetAt: number } {
      const w = getWindow(key);
      return { remaining: Math.max(0, maxRequests - w.count), resetAt: w.reset };
    },
  };
}

/** Standard 429 response with Retry-After header. */
export function tooManyRequestsResponse(corsHeaders: Record<string, string>): Response {
  return new Response(
    JSON.stringify({ error: "Too many requests. Please wait before trying again." }),
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
