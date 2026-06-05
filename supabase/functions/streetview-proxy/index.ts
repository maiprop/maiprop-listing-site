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

const streetviewLimiter = makeRateLimiter({
  bucket: "streetview-proxy",
  maxRequests: 60,
  windowMs: 60_000,
  failClosed: true,
});
const DEFAULT_GOOGLE_MAPS_REFERER = "https://portal.maiprop.co/";
const GOOGLE_MAPS_REFERER_ORIGIN_PATTERN =
  /^https:\/\/((www|app|portal|os)\.)?maiprop\.co$|^https:\/\/[\w-]+\.maiprop-listing-site\.pages\.dev$/;
const DEFAULT_STREETVIEW_SIZE = "800x450";
const MAX_STREETVIEW_SIZE_PX = 1200;

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

const jsonError = (
  error: string,
  status: number,
  corsHeaders: Record<string, string>,
): Response =>
  new Response(JSON.stringify({ error }), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const parseStreetViewSize = (rawSize: string | null): string | null => {
  const size = rawSize || DEFAULT_STREETVIEW_SIZE;
  const match = size.match(/^(\d{1,4})x(\d{1,4})$/);
  if (!match) return null;

  const width = Number(match[1]);
  const height = Number(match[2]);
  if (
    !Number.isInteger(width) ||
    !Number.isInteger(height) ||
    width < 1 ||
    height < 1 ||
    width > MAX_STREETVIEW_SIZE_PX ||
    height > MAX_STREETVIEW_SIZE_PX
  ) {
    return null;
  }
  return `${width}x${height}`;
};

const parseCoordinate = (
  value: string | null,
  min: number,
  max: number,
): number | null => {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed >= min && parsed <= max
    ? parsed
    : null;
};

const getLocationParam = (url: URL): string | null => {
  const rawLat = url.searchParams.get("lat");
  const rawLng = url.searchParams.get("lng");
  if (rawLat != null || rawLng != null) {
    const lat = parseCoordinate(rawLat, -90, 90);
    const lng = parseCoordinate(rawLng, -180, 180);
    return lat == null || lng == null ? null : `${lat},${lng}`;
  }

  const location = url.searchParams.get("location")?.trim();
  return location && location.length <= 200 ? location : null;
};

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (await streetviewLimiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const url = new URL(req.url);
  const size = parseStreetViewSize(url.searchParams.get("size"));
  if (!size) return jsonError("invalid size", 400, corsHeaders);

  const key = Deno.env.get("GOOGLE_MAPS_API_KEY");
  if (!key) {
    return jsonError("Street View not configured", 503, corsHeaders);
  }

  const locParam = getLocationParam(url);
  if (!locParam) return jsonError("lat and lng or location required", 400, corsHeaders);

  const googleUrl = new URL("https://maps.googleapis.com/maps/api/streetview");
  googleUrl.searchParams.set("size", size);
  googleUrl.searchParams.set("location", locParam);
  googleUrl.searchParams.set("fov", "90");
  googleUrl.searchParams.set("pitch", "10");
  googleUrl.searchParams.set("key", key);

  const imgRes = await fetchWithTimeout(googleUrl.toString(), {
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
    return jsonError("Street View unavailable", 502, corsHeaders);
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
