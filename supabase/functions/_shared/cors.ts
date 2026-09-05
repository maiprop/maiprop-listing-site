/**
 * Shared CORS helper for Supabase Edge Functions.
 * Restricts origins to production + local dev. Blocks arbitrary third-party sites
 * from triggering expensive AI / data operations via cross-origin requests.
 */

const PRODUCTION_ORIGINS = [
  "https://maiprop.co",
  "https://www.maiprop.co",
  "https://app.maiprop.co",
  "https://portal.maiprop.co",
  "https://os.maiprop.co",
];

const LOCAL_DEV_ORIGINS = [
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:8090",
  "http://127.0.0.1:8080",
  "http://127.0.0.1:8081",
  "http://127.0.0.1:8082",
  "http://127.0.0.1:8083",
  "http://127.0.0.1:8090",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "http://localhost:3000",
  "http://127.0.0.1:3000",
];

/** Cloudflare Pages preview deploys use `<branch>.maiprop-listing-site.pages.dev`. */
const CF_PAGES_PATTERN = /^https:\/\/[\w-]+\.maiprop-listing-site\.pages\.dev$/;
const STAGING_CF_PAGES_ORIGIN =
  "https://maiprop-listing-site-staging.pages.dev";
const STAGING_CF_PAGES_HASH_PATTERN =
  /^https:\/\/[0-9a-f]{8}\.maiprop-listing-site-staging\.pages\.dev$/;

const isProduction = Deno.env.get("ENVIRONMENT") === "production";

const ALLOWED_ORIGINS = isProduction
  ? PRODUCTION_ORIGINS
  : [...PRODUCTION_ORIGINS, ...LOCAL_DEV_ORIGINS];

function isAllowedOrigin(origin: string): boolean {
  const isStagingPagesOrigin = Deno.env.get("ENVIRONMENT") === "staging" &&
    (origin === STAGING_CF_PAGES_ORIGIN ||
      STAGING_CF_PAGES_HASH_PATTERN.test(origin));
  return ALLOWED_ORIGINS.includes(origin) || CF_PAGES_PATTERN.test(origin) ||
    isStagingPagesOrigin;
}

const BASE_ALLOWED_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, baggage, sentry-trace";

export function getCorsHeaders(
  req: Request,
  extraAllowedHeaders?: string,
): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = isAllowedOrigin(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": extraAllowedHeaders
      ? `${BASE_ALLOWED_HEADERS}, ${extraAllowedHeaders}`
      : BASE_ALLOWED_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function handleCors(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: getCorsHeaders(req) });
  }
  return null;
}
