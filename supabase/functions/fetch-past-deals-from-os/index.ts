/**
 * fetch-past-deals-from-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches past auction deals/history from the maiProp OS API for a given
 * auction listing. Used on the auction detail page for premium users.
 *
 * Requires authenticated user (JWT). Client should gate this feature for Pro users only.
 * OS API uses server-side credentials.
 *
 * Flow: listing_id (Hub) → lookup tags for os_auction:X → call OS past-deals API.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { requireProSubscription } from "../_shared/proGate.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const log = createLogger("fetch-past-deals-from-os");
const limiter = makeRateLimiter({ bucket: "fetch-past-deals-from-os", maxRequests: 20, windowMs: 60_000 });

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

function extractOsAuctionId(tags: string[] | null): string | null {
  if (!tags?.length) return null;
  const tag = tags.find((t) => String(t).startsWith("os_auction:"));
  if (!tag) return null;
  return String(tag).replace("os_auction:", "").trim() || null;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  // Pro subscription gate - auction deal history is an investor/institutional feature.
  const proCheck = await requireProSubscription(user.id, corsHeaders, {
    audience: ["investor", "institutional"],
  });
  if (proCheck.errorResponse) return proCheck.errorResponse;

  try {
    const body = await req.json().catch(() => ({}));
    const { listing_id } = body as { listing_id?: string };

    if (!listing_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "listing_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch listing to get os_auction tag
    const { data: listing, error: listError } = await supabase
      .from("listings")
      .select("id, tags, listing_type")
      .eq("id", listing_id)
      .maybeSingle();

    if (listError || !listing) {
      return new Response(
        JSON.stringify({ ok: false, error: "Listing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (listing.listing_type !== "auction") {
      return new Response(
        JSON.stringify({ ok: false, error: "Listing is not an auction" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const osAuctionId = extractOsAuctionId(listing.tags ?? []);
    if (!osAuctionId) {
      return new Response(
        JSON.stringify({ ok: true, past_deals: [], source: "os", reason: "No OS auction ID for this listing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      return new Response(
        JSON.stringify({ ok: true, past_deals: [], source: null, reason: "OS credentials not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    // OS endpoint: GET /api/v1/auctions/:auctionId/past-deals
    // Override with MAIPROP_OS_PAST_DEALS_PATH e.g. /api/v1/auctions/{id}/past-deals
    const pathTemplate =
      Deno.env.get("MAIPROP_OS_PAST_DEALS_PATH") || "/api/v1/auctions/:id/past-deals";
    const path = pathTemplate.replace(/\{[^}]+\}|:auctionId|:id/g, osAuctionId);
    const url = `${OS_URL}${path}`;

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
        JSON.stringify({ ok: true, past_deals: [], source: "os", reason: "No past deals for this auction" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!res.ok) {
      const text = await res.text();
      log.warn("OS returned non-ok", { status: res.status, body: text.slice(0, 200) });
      return new Response(
        JSON.stringify({ ok: true, past_deals: [], source: null, reason: `OS returned ${res.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await res.json().catch(() => null);
    // Accept array directly or { past_deals: [...] } or { data: [...] }
    const pastDeals = Array.isArray(data)
      ? data
      : data?.past_deals ?? data?.data ?? data?.deals ?? [];

    return new Response(
      JSON.stringify({ ok: true, past_deals: Array.isArray(pastDeals) ? pastDeals : [], source: "os" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    log.error("fetch-past-deals error", { err: err instanceof Error ? err.message : String(err) });
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: message, past_deals: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
