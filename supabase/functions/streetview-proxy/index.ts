import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { fetchWithTimeout } from "../_shared/fetchWithTimeout.ts";

/**
 * streetview-proxy
 * Returns a Google Street View Static API image using server-side key so the key
 * is never exposed in client URLs (fixes "Google Maps API Key in Publicly Readable URLs").
 * Rate limited by IP via the cross-region DB-backed limiter so the cap holds
 * across edge isolates (the previous in-memory Map was bypassable across regions).
 */

const streetviewLimiter = makeRateLimiter({ bucket: "streetview-proxy", maxRequests: 60, windowMs: 60_000 });
const DEFAULT_GOOGLE_MAPS_REFERER = "https://portal.maiprop.co/";
const GOOGLE_MAPS_REFERER_ORIGIN_PATTERN =
  /^https:\/\/((www|app|portal|os)\.)?maiprop\.co$|^https:\/\/[\w-]+\.maiprop-listing-site\.pages\.dev$/;

const normalizeReferer = (value: string): string => {
  try {
    const url = new URL(value);
    return `${url.origin}/`;
  } catch (_err: unknown) {
    return DEFAULT_GOOGLE_MAPS_REFERER;
  }
};

const getGoogleMapsReferer = (origin: string | null): string => {
  const configured = Deno.env.get("GOOGLE_MAPS_REFERER");
  if (configured) return normalizeReferer(configured);

  if (origin && GOOGLE_MAPS_REFERER_ORIGIN_PATTERN.test(origin)) {
    return normalizeReferer(origin);
  }

  return DEFAULT_GOOGLE_MAPS_REFERER;
};

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (await streetviewLimiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const url = new URL(req.url);
  const lat = url.searchParams.get("lat");
  const lng = url.searchParams.get("lng");
  const location = url.searchParams.get("location");
  const size = url.searchParams.get("size") || "800x450";

  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) {
    return new Response(JSON.stringify({ error: "Street View not configured" }), {
      status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let locParam: string;
  if (lat != null && lng != null) {
    locParam = `${lat},${lng}`;
  } else if (location) {
    locParam = encodeURIComponent(location);
  } else {
    return new Response(JSON.stringify({ error: "lat and lng or location required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const googleUrl = `https://maps.googleapis.com/maps/api/streetview?size=${size}&location=${locParam}&fov=90&pitch=10&key=${key}`;
  const imgRes = await fetchWithTimeout(googleUrl, {
    headers: {
      Referer: getGoogleMapsReferer(req.headers.get("origin")),
    },
  });
  if (!imgRes.ok) {
    const upstreamBody = await imgRes.text().catch(() => "");
    console.warn("[streetview-proxy] Google Street View unavailable", {
      status: imgRes.status,
      body: upstreamBody.slice(0, 240),
    });
    return new Response(JSON.stringify({ error: "Street View unavailable" }), {
      status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const blob = await imgRes.blob();
  return new Response(blob, {
    headers: {
      ...corsHeaders,
      "Content-Type": imgRes.headers.get("Content-Type") || "image/jpeg",
      "Cache-Control": "public, max-age=86400",
    },
  });
});
