/**
 * os-diagnose — probes the OS API to understand data shape, filters, and
 * how many PENDING (future) auctions are available.
 * Also probes the new GET /api/auctions/future endpoint directly.
 * Requires platform admin (role='admin').
 *
 * Hardening note: even though this function is admin-only and rate-limited,
 * the diagnostic output is intentionally kept terse and free of upstream
 * response bodies / credentials. Failures are logged server-side but the
 * response only carries a stable, non-secret status string so we never
 * accidentally echo back tokens or upstream debug payloads.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";

const log = createLogger("os-diagnose");

const limiter = makeRateLimiter({ bucket: "os-diagnose", maxRequests: 5, windowMs: 60_000 });

async function requireAgent(
  req: Request,
  sb: ReturnType<typeof createClient>,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const token = authHeader.slice(7);
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const { data: profile } = await sb.from("profiles").select("role").eq("user_id", user.id).single();
  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Platform admin required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

/**
 * Authenticate against the OS API and return the bearer token.
 *
 * On failure, throws an Error whose message contains ONLY the upstream HTTP
 * status code — never the response body. The body is logged server-side via
 * `log.warn` so operators can debug, but is not echoed back to callers.
 */
async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetchWithTimeout(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => null);
  const token =
    (data && typeof data === "object" &&
      ((data as Record<string, unknown>).data as Record<string, unknown> | undefined)?.token) ??
    (data as Record<string, unknown> | null)?.token ??
    (data as Record<string, unknown> | null)?.accessToken ??
    (data as Record<string, unknown> | null)?.access_token;
  if (typeof token !== "string" || token.length === 0) {
    // Log a sanitized snapshot of the upstream body server-side so operators
    // can debug, without exposing it to callers. Anything resembling a token
    // (`token`, `accessToken`, `access_token`) is redacted.
    const sanitizedBody = sanitizeAuthErrorBody(data);
    log.warn("OS auth failed", { status: res.status, body: sanitizedBody });
    throw new Error(`OS auth failed (status=${res.status})`);
  }
  return token;
}

/**
 * Strip token-like fields out of an OS auth error payload before it is logged
 * server-side. Returns a short string snapshot, never echoed to callers.
 */
function sanitizeAuthErrorBody(data: unknown): string {
  if (data === null || data === undefined) return "<empty>";
  if (typeof data !== "object") return String(data).slice(0, 200);
  const TOKEN_KEYS = new Set(["token", "accessToken", "access_token", "refresh_token"]);
  const redact = (val: unknown): unknown => {
    if (Array.isArray(val)) return val.map(redact);
    if (val && typeof val === "object") {
      const out: Record<string, unknown> = {};
      for (const [k, v] of Object.entries(val)) {
        out[k] = TOKEN_KEYS.has(k) ? "<redacted>" : redact(v);
      }
      return out;
    }
    return val;
  };
  try {
    return JSON.stringify(redact(data)).slice(0, 300);
  } catch {
    return "<unserializable>";
  }
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const authErr = await requireAgent(req, supabase, corsHeaders);
  if (authErr) return authErr;

  const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "") ?? "";
  const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL") ?? "";
  const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD") ?? "";

  try {
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const authHeaders = {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    };

    // ── Probe 1: GET /api/auctions/future (new endpoint) ──────────────────────
    const futureUrl = `${OS_URL}/api/auctions/future?limit=5`;
    const futureRes = await fetchWithTimeout(futureUrl, { headers: authHeaders });
    const futureJson = await futureRes.json().catch(() => null);
    const futureTotal: number = futureJson?.total ?? futureJson?.data?.length ?? 0;
    type FutureAuction = {
      id?: string;
      title?: string;
      city?: string;
      auction_date?: string;
      starting_price?: number;
      status?: string;
      lat?: number | null;
      lng?: number | null;
    };
    const futureSample = ((futureJson?.data ?? []) as FutureAuction[]).slice(0, 3).map((a) => ({
      id: a.id,
      title: a.title,
      city: a.city,
      auction_date: a.auction_date,
      starting_price: a.starting_price,
      status: a.status,
      has_lat: a.lat != null,
      has_lng: a.lng != null,
    }));

    // ── Probe 2: count all via /api/v1/auctions/filter/count ──────────────────
    const countAllRes = await fetchWithTimeout(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({}),
    });
    const countAll = await countAllRes.json().catch(() => null);

    // ── Probe 3: count PENDING auctions ───────────────────────────────────────
    const countPendingRes = await fetchWithTimeout(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ auctionStatus: "PENDING" }),
    });
    const countPending = await countPendingRes.json().catch(() => null);

    // ── Probe 4: count COMPLETED auctions ─────────────────────────────────────
    const countCompletedRes = await fetchWithTimeout(`${OS_URL}/api/v1/auctions/filter/count`, {
      method: "POST",
      headers: authHeaders,
      body: JSON.stringify({ auctionStatus: "COMPLETED" }),
    });
    const countCompleted = await countCompletedRes.json().catch(() => null);

    // ── Probe 5: count-comparison endpoint ────────────────────────────────────
    // This endpoint has a server-side NullPointerException bug in the OS API — captured for awareness
    let comp: unknown = null;
    try {
      const compRes = await fetchWithTimeout(`${OS_URL}/api/v1/auctions/filter/count-comparison`, {
        method: "POST",
        headers: authHeaders,
        body: JSON.stringify({ sortBy: "AUCTION_DATE" }),
      });
      comp = await compRes.json().catch(() => null);
    } catch {
      comp = { note: "count-comparison endpoint unavailable on OS API (server-side bug)" };
    }

    // ── Probe 6: full future count via /api/auctions/future?limit=9999 ────────
    let futureFullTotal = futureTotal;
    try {
      const fullRes = await fetchWithTimeout(`${OS_URL}/api/auctions/future?limit=9999`, { headers: authHeaders });
      const fullJson = await fullRes.json().catch(() => null);
      futureFullTotal = fullJson?.total ?? fullJson?.data?.length ?? futureTotal;
    } catch {
      /* non-critical */
    }

    return new Response(
      JSON.stringify(
        {
          auth: "✅ OK",
          osReachable: true,
          // ── New endpoint probe ──────────────────────────────────────────────────
          futureAuctionsEndpoint: {
            url: "/api/auctions/future",
            status: futureRes.status,
            available: futureFullTotal,
            sample: futureSample,
            hasCoordinates: futureSample.filter((a) => a.has_lat).length,
          },
          // ── Legacy endpoint probes ──────────────────────────────────────────────
          counts: {
            all: countAll,
            pending: countPending,
            completed: countCompleted,
            comparison: comp,
          },
          detail: `${futureFullTotal} future auctions available at /api/auctions/future`,
        },
        null,
        2,
      ),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (err: unknown) {
    // Log full error server-side, return only a stable diagnostic string to
    // the caller. Concrete error messages are useful to operators in logs but
    // could theoretically include OS endpoint paths/params, so they don't
    // belong in the response body — even for admin-only endpoints.
    const message = err instanceof Error ? err.message : String(err);
    log.warn("os-diagnose failed", { err: message });
    return new Response(
      JSON.stringify({
        osReachable: false,
        error: "os_unreachable",
        detail: "OS API probe failed; see server logs for details.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
