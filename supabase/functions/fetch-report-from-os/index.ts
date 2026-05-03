/**
 * fetch-report-from-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches a report (valuation or neighbourhood) from the maiProp OS API for a
 * given listing. If the OS has a pre-generated report for that listing, return it;
 * otherwise return null so the client can fall back to the AI edge functions
 * (property-valuation, neighbourhood-report).
 *
 * Requires authenticated user (JWT). OS API uses server-side credentials.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";

const log = createLogger("fetch-report-from-os");
const limiter = makeRateLimiter({ bucket: "fetch-report-from-os", maxRequests: 20, windowMs: 60_000 });

let corsHeaders: Record<string, string> = {};

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOsToken(
  baseUrl: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    15_000
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token)
    throw new Error(`OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  return token;
}

Deno.serve(async (req) => {
  corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const { listing_id, report_type } = body as { listing_id?: string; report_type?: string };

    if (!listing_id || !report_type) {
      return new Response(
        JSON.stringify({ ok: false, error: "listing_id and report_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedTypes = ["valuation", "neighbourhood"];
    if (!allowedTypes.includes(report_type)) {
      return new Response(
        JSON.stringify({ ok: false, error: "report_type must be 'valuation' or 'neighbourhood'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      return new Response(
        JSON.stringify({ ok: true, report: null, source: null, reason: "OS credentials not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // OS report endpoint: GET /api/v1/reports/listing/:listingId?type=valuation|neighbourhood
    // Override with MAIPROP_OS_REPORT_PATH e.g. /api/v1/analytics/report (then we use ?listingId= &type=)
    const pathTemplate = Deno.env.get("MAIPROP_OS_REPORT_PATH") || "/api/v1/reports/listing";
    const base = pathTemplate.replace(/:listingId|:id/g, listing_id);
    const url = base.includes(listing_id)
      ? `${OS_URL}${base}?type=${report_type}`
      : `${OS_URL}${base}?listingId=${encodeURIComponent(listing_id)}&type=${report_type}`;

    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      15_000
    );

    if (res.status === 404 || res.status === 204) {
      return new Response(
        JSON.stringify({ ok: true, report: null, source: "os", reason: "No report for this listing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!res.ok) {
      const text = await res.text();
      log.warn("OS returned non-ok", { status: res.status, body: text.slice(0, 200) });
      return new Response(
        JSON.stringify({ ok: true, report: null, source: null, reason: `OS returned ${res.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const report = await res.json().catch(() => null);
    if (!report) {
      return new Response(
        JSON.stringify({ ok: true, report: null, source: "os" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, report, source: "os" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    log.error("fetch-report error", { err: err instanceof Error ? err.message : String(err) });
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: message, report: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
