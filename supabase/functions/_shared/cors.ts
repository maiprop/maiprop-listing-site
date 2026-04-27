/**
 * Shared CORS helper for Supabase Edge Functions.
 * Restricts origins to production + local dev. Blocks arbitrary third-party sites
 * from triggering expensive AI / data operations via cross-origin requests.
 */

const ALLOWED_ORIGINS = [
  "https://maiprop.co",
  "https://www.maiprop.co",
  "https://app.maiprop.co",
  "https://portal.maiprop.co",
  "https://os.maiprop.co",
  // Local dev
  "http://localhost:8080",
  "http://localhost:8081",
  "http://localhost:8082",
  "http://localhost:8083",
  "http://localhost:5173",
  "http://localhost:4173",
  "http://localhost:3000",
];

export function getCorsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers":
      "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version",
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
