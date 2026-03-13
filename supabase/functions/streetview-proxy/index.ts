/**
 * streetview-proxy
 * Returns a Google Street View Static API image using server-side key so the key
 * is never exposed in client URLs (fixes "Google Maps API Key in Publicly Readable URLs").
 */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

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
