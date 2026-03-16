// Public configuration constants
// These are publishable/public keys safe to store in client code.
// In production, env vars are required; no hardcoded fallbacks (security audit).

const env = (import.meta as any).env ?? {};
const isProd = env.PROD === true || env.MODE === "production";

const _url = env.VITE_SUPABASE_URL ?? env.VITE_SUPABASE_PROJECT_URL;
const _anonKey = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
const _mapbox = env.VITE_MAPBOX_TOKEN;

if (isProd) {
  if (!_url || !_anonKey) throw new Error("VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY are required in production");
  if (!_mapbox) throw new Error("VITE_MAPBOX_TOKEN is required in production");
}

// Supabase — dev fallbacks for local/Lovable; production requires env
export const SUPABASE_URL =
  _url ?? "https://jglqlaynezspefoovqyc.supabase.co";
export const SUPABASE_ANON_KEY =
  _anonKey ?? "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbHFsYXluZXpzcGVmb292cXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MzEyNTUsImV4cCI6MjA4ODQwNzI1NX0.lHq_GYad1eWXba5n0IPiC2-6tj-f_U_fHGjDsEURGsE";

// Mapbox — dev fallback; production requires env
export const MAPBOX_TOKEN =
  _mapbox ?? "pk.eyJ1Ijoia3JlbmlvczkyIiwiYSI6ImNtbWh0MjlxYjBza3YydXBqcThqeXBoYmcifQ.BElf3IJI7DGBjj2o2dTDqw";

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
