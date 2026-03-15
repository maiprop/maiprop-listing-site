// Public configuration constants
// These are publishable/public keys safe to store in client code.

// Supabase — fallbacks for deployment when env vars are not set (e.g. Lovable Cloud)
export const SUPABASE_URL =
  (import.meta as any).env?.VITE_SUPABASE_URL ??
  (import.meta as any).env?.VITE_SUPABASE_PROJECT_URL ??
  "https://jglqlaynezspefoovqyc.supabase.co";
export const SUPABASE_ANON_KEY =
  (import.meta as any).env?.VITE_SUPABASE_PUBLISHABLE_KEY ??
  (import.meta as any).env?.VITE_SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImpnbHFsYXluZXpzcGVmb292cXljIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzI4MzEyNTUsImV4cCI6MjA4ODQwNzI1NX0.lHq_GYad1eWXba5n0IPiC2-6tj-f_U_fHGjDsEURGsE";

// Mapbox public token — publishable key, safe to commit
export const MAPBOX_TOKEN =
  (import.meta as any).env?.VITE_MAPBOX_TOKEN ??
  "pk.eyJ1Ijoia3JlbmlvczkyIiwiYSI6ImNtbWh0MjlxYjBza3YydXBqcThqeXBoYmcifQ.BElf3IJI7DGBjj2o2dTDqw";

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
