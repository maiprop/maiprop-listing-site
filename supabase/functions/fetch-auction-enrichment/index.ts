/**
 * fetch-auction-enrichment
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches auction enrichment data (legal status, encumbrances, key documents)
 * from the maiProp OS API for a given auction listing.
 *
 * Requires authenticated Pro user (JWT). Client should gate for Pro users only.
 * OS API uses server-side credentials.
 *
 * Flow: listing_id (Hub) → lookup tags for os_auction:X → GET /api/v1/auctions/{X}/enrichment
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { requireProSubscription } from "../_shared/proGate.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

const log = createLogger("fetch-auction-enrichment");
const limiter = makeRateLimiter({ bucket: "fetch-auction-enrichment", maxRequests: 20, windowMs: 60_000 });

async function getOsToken(baseUrl: string, email: string, password: string): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    15_000,
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) {
    throw new Error(`OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  }
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
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
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
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Pro subscription gate - auction enrichment is an investor/institutional feature.
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
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve Hub listing → OS auction ID via the os_auction: tag
    const { data: listing, error: listError } = await supabase
      .from("listings")
      .select("id, tags, listing_type")
      .eq("id", listing_id)
      .maybeSingle();

    if (listError || !listing) {
      return new Response(
        JSON.stringify({ ok: false, error: "Listing not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (listing.listing_type !== "auction") {
      return new Response(
        JSON.stringify({ ok: false, error: "Listing is not an auction" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const osAuctionId = extractOsAuctionId(listing.tags ?? []);
    if (!osAuctionId) {
      return new Response(
        JSON.stringify({ ok: true, enrichment: null, source: "os", reason: "No OS auction ID for this listing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      return new Response(
        JSON.stringify({ ok: true, enrichment: null, source: null, reason: "OS credentials not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const res = await fetchWithTimeout(
      `${OS_URL}/api/v1/auctions/${encodeURIComponent(osAuctionId)}/enrichment`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      15_000,
    );

    if (res.status === 404 || res.status === 204) {
      return new Response(
        JSON.stringify({ ok: true, enrichment: null, source: "os", reason: "No enrichment for this auction" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!res.ok) {
      const text = await res.text();
      log.warn("OS enrichment returned non-ok", { status: res.status, body: text.slice(0, 200) });
      return new Response(
        JSON.stringify({ ok: true, enrichment: null, source: null, reason: `OS returned ${res.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const data = await res.json().catch(() => null);
    // Unwrap AnalyticaResponseAuctionEnrichmentOutputDto: { data: AuctionEnrichmentOutputDto, ... }
    const enrichment = data?.data ?? data;

    log.info("Enrichment fetched", { osAuctionId, userId: user.id });
    return new Response(
      JSON.stringify({ ok: true, enrichment, source: "os" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    log.error("fetch-auction-enrichment error", { err: err instanceof Error ? err.message : String(err) });
    const message = err instanceof Error ? err.message : "Unknown error";
    return new Response(
      JSON.stringify({ ok: false, error: message, enrichment: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
