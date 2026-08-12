// Public configuration constants
// These are publishable/public keys safe to store in client code.
// No hardcoded fallbacks — use .env (copy from .env.example) for all environments.
//
// ENV VALIDATION — canonical check point. All env var format checks live here.
// The localStorage key for locale persistence is "maiprop_lang" (see src/i18n.ts).

import {
  assertRuntimeConfigLoaded,
  getRuntimeValue,
} from "@/lib/runtimeConfig";

assertRuntimeConfigLoaded({
  productionBuild: import.meta.env.PROD,
  hostname: typeof window === "undefined" ? "" : window.location.hostname,
});

const _url =
  getRuntimeValue("VITE_SUPABASE_URL") ??
  getRuntimeValue("VITE_SUPABASE_PROJECT_URL");
const _anonKey =
  getRuntimeValue("VITE_SUPABASE_PUBLISHABLE_KEY") ??
  getRuntimeValue("VITE_SUPABASE_ANON_KEY");
const _mapbox = getRuntimeValue("VITE_MAPBOX_TOKEN");

if (!_url || !_anonKey) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY (or VITE_SUPABASE_ANON_KEY) are required. " +
      "Copy .env.example to .env and set values from your Supabase project."
  );
}

// Format-level validation catches placeholder stubs before they reach the app.
// Supabase custom domains are valid here too; they are required for branded
// OAuth callback hosts such as https://auth.example.com.
const JWT_RE = /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;
const PUBLISHABLE_RE = /^sb_publishable_[A-Za-z0-9_-]+$/;

function validateSupabaseOrigin(value: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return "Expected a valid URL origin such as https://<ref>.supabase.co or https://auth.example.com.";
  }

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    return "Expected http or https.";
  }

  if (import.meta.env.PROD && parsed.protocol !== "https:") {
    return "Production Supabase URLs must use https.";
  }

  if (parsed.pathname !== "/" || parsed.search || parsed.hash) {
    return "Expected only the origin, without a path, query, or hash.";
  }

  return null;
}

const supabaseUrlError = validateSupabaseOrigin(_url);
if (supabaseUrlError) {
  const msg = `VITE_SUPABASE_URL looks malformed: "${_url}". ${supabaseUrlError}`;
  if (import.meta.env.DEV) console.warn("[maiProp]", msg);
  else throw new Error(msg);
}
if (!JWT_RE.test(_anonKey) && !PUBLISHABLE_RE.test(_anonKey)) {
  const msg = "VITE_SUPABASE_PUBLISHABLE_KEY does not look like a JWT or sb_publishable_ key. Check your .env file.";
  if (import.meta.env.DEV) console.warn("[maiProp]", msg);
  else throw new Error(msg);
}

export const SUPABASE_URL = _url;
export const SUPABASE_ANON_KEY = _anonKey;

// Mapbox optional — app works without it; maps disabled until set
export const MAPBOX_TOKEN = _mapbox ?? "";
if (!_mapbox && !import.meta.env.SSR && import.meta.env.DEV) {
  // Warn in dev only — ops can verify VITE_MAPBOX_TOKEN via the deployment dashboard.
  console.warn(
    "[maiProp] VITE_MAPBOX_TOKEN is not set. Map components (MapView, " +
      "PropertyMiniMap, auction map overlays) will render a placeholder. " +
      "Set the token in your .env or hosting provider environment to enable maps."
  );
}

// Google Street View / Maps optional — auction cards and POI lookups degrade
// gracefully when missing. Warn once in the console so ops notice.
if (!getRuntimeValue("VITE_GOOGLE_MAPS_API_KEY") && import.meta.env.PROD) {
  console.info(
    "[maiProp] VITE_GOOGLE_MAPS_API_KEY not set — auction cards will use " +
      "Mapbox/Unsplash fallbacks and Places autocomplete is disabled."
  );
}

// Google Maps API key — use only for Maps JavaScript (e.g. Places autocomplete).
// Vite embeds VITE_* values in browser JS, so this key must be restricted in
// Google Cloud Console to HTTP referrers for maiprop.co, portal.maiprop.co, and
// project-specific Cloudflare Pages previews, with APIs limited to Maps
// JavaScript API and Places API. Do NOT use it for Street View client URLs; use
// getStreetViewProxyUrl() so the Street View key stays server-side.
export const GOOGLE_MAPS_API_KEY =
  getRuntimeValue("VITE_GOOGLE_MAPS_API_KEY") ?? "";
export const GOOGLE_PLACES_AUTOCOMPLETE_ENABLED =
  Boolean(GOOGLE_MAPS_API_KEY) &&
  getRuntimeValue("VITE_ENABLE_GOOGLE_PLACES_AUTOCOMPLETE") === "true";

/**
 * Safe app origin for OAuth redirects — never derived from window.location
 * so it cannot be influenced by iframe/postMessage tricks.
 *
 * Set VITE_APP_URL in .env for local dev (e.g. http://localhost:8080) and in
 * CI secrets for production. The hardcoded fallback points at
 * `portal.maiprop.co` because that is the only domain currently pointing at
 * the Cloudflare Pages deployment (maiprop.co is parked on Namecheap).
 * When DNS is re-pointed, update this fallback and the VITE_APP_URL secret
 * together so OAuth/Stripe redirect-URI allowlists only need rotating once.
 */
export const APP_ORIGIN =
  getRuntimeValue("VITE_APP_URL") ?? "https://portal.maiprop.co";

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
