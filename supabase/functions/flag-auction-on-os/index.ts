/**
 * flag-auction-on-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Flags a suspicious or erroneous auction on the maiProp OS API.
 * Accepts a Hub listing_id, resolves the os_auction tag, then calls
 * POST /api/v1/auctions/{auctionListingId}/flag with an optional message.
 *
 * Requires authenticated user (JWT). Any logged-in user may flag an auction.
 * OS API uses server-side credentials.
 *
 * Flow: listing_id (Hub) → lookup tags for os_auction:X → POST /api/v1/auctions/{X}/flag
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";
import { SchemaValidationError } from "../_shared/schema.ts";
import { parseFlagAuctionRequest } from "./request.ts";

const log = createLogger("flag-auction-on-os");
const limiter = makeRateLimiter({
  bucket: "flag-auction-on-os",
  maxRequests: 10,
  windowMs: 60_000,
});

async function getOsToken(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
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
    throw new Error(
      `OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`,
    );
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

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let requestBody: Awaited<ReturnType<typeof parseFlagAuctionRequest>>;
  try {
    requestBody = await parseFlagAuctionRequest(req);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (err instanceof SchemaValidationError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: message,
          code: err.code,
          issues: err.issues,
        }),
        {
          status: err.code === "payload_too_large" ? 413 : 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(
      JSON.stringify({ error: "Missing or invalid Authorization header" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(
    authHeader.slice(7),
  );
  if (authError || !user) {
    return new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }

  try {
    const { listing_id, message } = requestBody;

    // Resolve Hub listing → OS auction ID via the os_auction: tag
    const { data: listing, error: listError } = await supabase
      .from("listings")
      .select("id, tags, listing_type")
      .eq("id", listing_id)
      .maybeSingle();

    if (listError || !listing) {
      return new Response(
        JSON.stringify({ ok: false, error: "Listing not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (listing.listing_type !== "auction") {
      return new Response(
        JSON.stringify({ ok: false, error: "Listing is not an auction" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const osAuctionId = extractOsAuctionId(listing.tags ?? []);
    if (!osAuctionId) {
      // Gracefully acknowledge the flag even if no OS ID exists
      log.info("Flag submitted but no OS auction ID found", { listing_id });
      return new Response(
        JSON.stringify({
          ok: true,
          flagged: false,
          reason: "No OS auction ID for this listing",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      log.warn("OS credentials not configured");
      return new Response(
        JSON.stringify({
          ok: true,
          flagged: false,
          reason: "OS credentials not configured",
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    const res = await fetchWithTimeout(
      `${OS_URL}/api/v1/auctions/${encodeURIComponent(osAuctionId)}/flag`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message: message ?? "" }),
      },
      15_000,
    );

    if (!res.ok) {
      const text = await res.text();
      log.warn("OS flag returned non-ok", {
        status: res.status,
        body: text.slice(0, 200),
      });
      // Treat as success from user's perspective — the intent was recorded
      return new Response(
        JSON.stringify({
          ok: true,
          flagged: false,
          reason: `OS returned ${res.status}`,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    log.info("Auction flagged on OS", { osAuctionId, userId: user.id });
    return new Response(
      JSON.stringify({ ok: true, flagged: true }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err: unknown) {
    log.error("flag-auction error", {
      err: err instanceof Error ? err.message : String(err),
    });
    const message = err instanceof Error ? err.message : "Unknown error";
    if (err instanceof SchemaValidationError) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: message,
          code: err.code,
          issues: err.issues,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }
    return new Response(
      JSON.stringify({ ok: false, error: message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
