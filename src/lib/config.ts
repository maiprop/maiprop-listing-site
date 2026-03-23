// Public configuration constants
// These are publishable/public keys safe to store in client code.
// No hardcoded fallbacks — use .env (copy from .env.example) for all environments.

const env = (import.meta as any).env ?? {};

const _url = env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_PROJECT_URL;
const _anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
const _mapbox = env.VITE_MAPBOX_TOKEN;

if (!_url || !_anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) are required. " +
      "Copy .env.example to .env and set values from your Supabase project."
  );
}

export const SUPABASE_URL = _url;
export const SUPABASE_ANON_KEY = _anonKey;

// Mapbox optional — app works without it; maps disabled until set
export const MAPBOX_TOKEN = _mapbox ?? "";

// Google Maps API key — use only for Maps JavaScript (e.g. Places autocomplete).
// Restrict to HTTP referrers in Google Cloud Console. Do NOT use for Street View
// in client URLs; use getStreetViewProxyUrl() so the key stays server-side.
export const GOOGLE_MAPS_API_KEY =
  (import.meta as any).env?.VITE_GOOGLE_MAPS_API_KEY ?? "";

/** Street View image via edge function proxy so the API key is never in client URLs. */
export function getStreetViewProxyUrl(
  params: { lat: number; lng: number } | { location: string },
  size = "800x450"
): string | null {
  const base = SUPABASE_URL;
  if (!base) return null;
  const u = new URL("/functions/v1/streetview-proxy", base);
  u.searchParams.set("size", size);
  if ("lat" in params) {
    u.searchParams.set("lat", String(params.lat));
    u.searchParams.set("lng", String(params.lng));
  } else {
    u.searchParams.set("location", params.location);
  }
  return u.toString();
}
