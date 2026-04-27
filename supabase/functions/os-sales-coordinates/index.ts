/**
 * os-sales-coordinates
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxies coordinate-based sales queries to the maiProp OS API:
 *   POST http://app.os.maiprop.co:8080/api/v1/sales/filter/coordinates
 *
 * Falls back to mock data if the OS API is unavailable so the UI never breaks.
 * verify_jwt = false — callable without auth (used on public property pages).
 */

import { createLogger } from "../_shared/logger.ts";

const log = createLogger("os-sales-coordinates");

const ALLOWED_ORIGINS = [
  "https://maiprop.co", "https://www.maiprop.co", "https://app.maiprop.co", "https://portal.maiprop.co",
  "http://localhost:8080", "http://localhost:8081", "http://localhost:8082",
  "http://localhost:8083", "http://localhost:5173",
];

function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") ?? "";
  return {
    "Access-Control-Allow-Origin": ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0],
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

// Simple in-memory rate limit: max 30 req/min per IP
const ipWindows = new Map<string, { count: number; reset: number }>();
function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const window = ipWindows.get(ip);
  if (!window || now > window.reset) {
    ipWindows.set(ip, { count: 1, reset: now + 60_000 });
    return false;
  }
  if (window.count >= 30) return true;
  window.count++;
  return false;
}


interface RequestBody {
  lat?: number;
  lng?: number;
  radius_km?: number;
  limit?: number;
}

interface SaleRecord {
  id: string;
  address: string;
  lat: number;
  lng: number;
  sale_price: number;
  asking_price: number;
  sale_date: string;
  property_type: string;
  sqm: number;
  bedrooms: number;
  status: string;
  discount_pct: number;
  source: string;
  round: number;
}

function generateMockSales(lat: number, lng: number, count: number): SaleRecord[] {
  const types = ["apartment", "house", "commercial", "land"];
  const statuses = ["sold", "sold", "sold", "withdrawn", "pending"];
  return Array.from({ length: Math.min(count, 20) }, (_, i) => ({
    id: `mock-${i}`,
    address: `Sample Property ${i + 1}`,
    lat: lat + (Math.random() - 0.5) * 0.02,
    lng: lng + (Math.random() - 0.5) * 0.02,
    sale_price: Math.round((80000 + Math.random() * 400000) / 1000) * 1000,
    asking_price: Math.round((90000 + Math.random() * 450000) / 1000) * 1000,
    sale_date: new Date(Date.now() - Math.random() * 365 * 2 * 24 * 3600000)
      .toISOString()
      .slice(0, 10),
    property_type: types[Math.floor(Math.random() * types.length)],
    sqm: Math.round(50 + Math.random() * 200),
    bedrooms: Math.floor(Math.random() * 5) + 1,
    status: statuses[Math.floor(Math.random() * statuses.length)],
    discount_pct: Math.round(Math.random() * 20),
    source: "court_auction",
    round: Math.floor(Math.random() * 3) + 1,
  }));
}

function _generateMockSalesDefault(): SaleRecord[] {
  return generateMockSales(37.9838, 23.7275, 15);
}

Deno.serve(async (req) => {
  const hdrs = corsHeaders(req);

  if (req.method === "OPTIONS") return new Response("ok", { headers: hdrs });

  // Rate limit by IP
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() ?? "unknown";
  if (isRateLimited(ip)) {
    return new Response(JSON.stringify({ error: "Rate limit exceeded. Max 30 requests/min." }), {
      status: 429, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed. Use POST." }), {
      status: 405, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const { lat, lng, radius_km = 2, limit = 50 } = body;
  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return new Response(JSON.stringify({ error: "lat and lng are required" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const osUrl = "http://app.os.maiprop.co:8080/api/v1/sales/filter/coordinates";

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10_000);

    let response: Response;
    try {
      response = await fetch(osUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lat, lng, radius_km, limit }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }

    if (!response.ok) {
      log.warn("OS API non-ok", { status: response.status });
      return new Response(
        JSON.stringify({ available: false, reason: "upstream_unavailable" }),
        { status: 503, headers: { ...hdrs, "Content-Type": "application/json" } },
      );
    }

    const data = await response.json();
    return new Response(
      JSON.stringify({ data, source: "os" }),
      { headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    log.warn("fetch failed", { err: message });

    return new Response(
      JSON.stringify({ available: false, reason: "upstream_unavailable" }),
      { status: 503, headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  }
});
