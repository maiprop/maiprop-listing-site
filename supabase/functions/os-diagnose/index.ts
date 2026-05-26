/**
 * os-diagnose — probes the OS API to understand data shape, filters, and
 * how many PENDING (future) auctions are available.
 * Also probes the new GET /api/auctions/future endpoint directly.
 * Requires platform admin (role='admin').
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import {
  asSupabaseAuthAdminClient,
  type AdminProfile,
  type SupabaseAuthAdminClient,
} from "../_shared/supabaseClientTypes.ts";

const log = createLogger("os-diagnose");

const limiter = makeRateLimiter({ bucket: "os-diagnose", maxRequests: 5, windowMs: 60_000 });

async function requireAgent(
  req: Request,
  sb: SupabaseAuthAdminClient,
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
  const { data: profileRaw } = await sb.from("profiles").select("role").eq("user_id", user.id).single();
  const profile = profileRaw as AdminProfile | null;
  if (profile?.role !== "admin") {
    return new Response(JSON.stringify({ error: "Platform admin required" }), {
      status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  return null;
}

async function safeCount(
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>,
): Promise<{ status: number; count: number | null }> {
  const response = await fetchWithTimeout(url, {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const json = await response.json().catch(() => null) as Record<string, unknown> | null;
  const raw = json?.count ?? json?.total ?? json?.data;
  const count = typeof raw === "number" ? raw : null;
  return { status: response.status, count };
}

async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetchWithTimeout(`${baseUrl}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  let data: unknown;
  try {
    data = await res.json();
  } catch {
    log.warn("OS auth response not JSON", { status: res.status });
    throw new Error(`OS auth returned non-JSON response (${res.status})`);
  }

  if (!res.ok) {
    log.warn("OS auth non-ok status", { status: res.status });
    throw new Error(`OS auth failed (HTTP ${res.status})`);
  }

  const obj = (typeof data === "object" && data !== null ? data : {}) as Record<string, unknown>;
  const nested = (typeof obj.data === "object" && obj.data !== null ? obj.data : {}) as Record<string, unknown>;
  const token = nested.token ?? obj.token ?? obj.accessToken ?? obj.access_token;
  if (typeof token !== "string" || !token) {
    log.warn("OS auth: no token in response", { status: res.status });
    throw new Error(`OS auth failed (HTTP ${res.status}) — no token in response`);
  }
  return token;
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
  const authErr = await requireAgent(req, asSupabaseAuthAdminClient(supabase), corsHeaders);
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
    const countAll = await safeCount(`${OS_URL}/api/v1/auctions/filter/count`, {}, authHeaders);

    // ── Probe 3: count PENDING auctions ───────────────────────────────────────
    const countPending = await safeCount(
      `${OS_URL}/api/v1/auctions/filter/count`,
      { auctionStatus: "PENDING" },
      authHeaders,
    );

    // ── Probe 4: count COMPLETED auctions ─────────────────────────────────────
    const countCompleted = await safeCount(
      `${OS_URL}/api/v1/auctions/filter/count`,
      { auctionStatus: "COMPLETED" },
      authHeaders,
    );

    // ── Probe 5: count-comparison endpoint ────────────────────────────────────
    let comp: { status: number; count: number | null } | { note: string };
    try {
      comp = await safeCount(
        `${OS_URL}/api/v1/auctions/filter/count-comparison`,
        { sortBy: "AUCTION_DATE" },
        authHeaders,
      );
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
    const internal = err instanceof Error ? err.message : String(err);
    log.warn("os-diagnose probe failed", { err: internal });

    const isSafeAuthMsg =
      internal.startsWith("OS auth returned non-JSON response") ||
      internal.startsWith("OS auth failed (HTTP");
    const safe = isSafeAuthMsg
      ? internal
      : "OS probe failed — see server logs for details";

    return new Response(
      JSON.stringify({
        error: safe,
        osReachable: false,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
