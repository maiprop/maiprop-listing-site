import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

/**
 * streetview-proxy
 * Returns a Google Street View Static API image using server-side key so the key
 * is never exposed in client URLs (fixes "Google Maps API Key in Publicly Readable URLs").
 * Rate limited by IP to reduce abuse (security audit).
 */

const RATE_LIMIT_PER_MIN = 60;
const RATE_WINDOW_MS = 60_000;
const ipCounts = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = ipCounts.get(ip);
  if (!entry) {
    ipCounts.set(ip, { count: 1, resetAt: now + RATE_WINDOW_MS });
    return true;
  }
  if (now > entry.resetAt) {
    entry = { count: 1, resetAt: now + RATE_WINDOW_MS };
    ipCounts.set(ip, entry);
    return true;
  }
  entry.count++;
  if (entry.count > RATE_LIMIT_PER_MIN) return false;
  return true;
}

Deno.serve(async (req) => {
  const corsPreflightResponse = handleCors(req);
  if (corsPreflightResponse) return corsPreflightResponse;
  const corsHeaders = getCorsHeaders(req);


  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? req.headers.get("x-real-ip") ?? "unknown";
  if (!checkRateLimit(ip)) {
    return new Response(JSON.stringify({ error: "Too many requests. Try again later." }), {
      status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

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
  const imgRes = await fetch(googleUrl);
  if (!imgRes.ok) {
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
