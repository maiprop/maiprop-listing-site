/**
 * os-sales-coordinates
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxies coordinate-based sales queries to the maiProp OS API:
 *   POST http://app.os.maiprop.co:8080/api/v1/sales/filter/coordinates
 *
 * Falls back to mock data if the OS API is unavailable so the UI never breaks.
 * verify_jwt = false — callable without auth (used on public property pages).
 *
 * Hardening (public surface):
 *   - Strict numeric validation on lat/lng/radius_km/limit so the upstream
 *     OS API only ever sees bounded values.
 *   - Server-side caps on radius_km and limit so a caller cannot bulk-enumerate
 *     comparable-sales data by passing huge values.
 *   - Response field allowlist so any new/internal fields the OS API may
 *     start returning (owner names, internal notes, etc.) are stripped before
 *     leaving this public endpoint.
 */

import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";

const log = createLogger("os-sales-coordinates");

const limiter = makeRateLimiter({
  bucket: "os-sales-coordinates",
  maxRequests: 30,
  windowMs: 60_000,
});

// ── Input bounds ─────────────────────────────────────────────────────────────
// Greece's bounding box is roughly lat 34..42, lng 19..30, but we accept the
// global valid range so the function still works for diaspora/edge cases.
const MIN_RADIUS_KM = 0.1;
const MAX_RADIUS_KM = 5;
const DEFAULT_RADIUS_KM = 2;
const MIN_LIMIT = 1;
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 50;

interface RequestBody {
  lat?: unknown;
  lng?: unknown;
  radius_km?: unknown;
  limit?: unknown;
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

/**
 * Coerce an upstream value to a finite number, falling back to a default.
 * Strings like "42" are accepted; NaN/Infinity/null/undefined fall back.
 */
function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function clamp(value: number, min: number, max: number): number {
  if (value < min) return min;
  if (value > max) return max;
  return value;
}

/**
 * Whitelist the fields we expose to public callers. Anything the OS API may
 * add later (internal notes, owner names, raw URLs, etc.) is dropped here.
 */
function sanitizeSaleRecord(raw: unknown): SaleRecord | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" || typeof r.id === "number" ? String(r.id) : null;
  if (!id) return null;
  return {
    id,
    address: typeof r.address === "string" ? r.address : "",
    lat: toFiniteNumber(r.lat, 0),
    lng: toFiniteNumber(r.lng, 0),
    sale_price: toFiniteNumber(r.sale_price, 0),
    asking_price: toFiniteNumber(r.asking_price, 0),
    sale_date: typeof r.sale_date === "string" ? r.sale_date : "",
    property_type: typeof r.property_type === "string" ? r.property_type : "",
    sqm: toFiniteNumber(r.sqm, 0),
    bedrooms: toFiniteNumber(r.bedrooms, 0),
    status: typeof r.status === "string" ? r.status : "",
    discount_pct: toFiniteNumber(r.discount_pct, 0),
    source: typeof r.source === "string" ? r.source : "",
    round: toFiniteNumber(r.round, 0),
  };
}

function sanitizeUpstreamPayload(raw: unknown): SaleRecord[] {
  // OS API has historically returned either a bare array or { data: [...] }.
  let items: unknown[] = [];
  if (Array.isArray(raw)) {
    items = raw;
  } else if (raw && typeof raw === "object" && Array.isArray((raw as { data?: unknown }).data)) {
    items = (raw as { data: unknown[] }).data;
  }
  const out: SaleRecord[] = [];
  for (const item of items) {
    const sanitized = sanitizeSaleRecord(item);
    if (sanitized) out.push(sanitized);
  }
  return out;
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
  const corsPreflight = handleCors(req);
  if (corsPreflight) return corsPreflight;
  const hdrs = getCorsHeaders(req);

  // DB-backed rate limit shared across edge regions/isolates: 30 req/min per IP.
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(hdrs);

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

  if (
    body.lat === undefined || body.lat === null ||
    body.lng === undefined || body.lng === null
  ) {
    return new Response(JSON.stringify({ error: "lat and lng are required" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const lat = toFiniteNumber(body.lat, NaN);
  const lng = toFiniteNumber(body.lng, NaN);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response(JSON.stringify({ error: "lat and lng must be finite numbers" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) {
    return new Response(
      JSON.stringify({ error: "lat must be in [-90, 90] and lng must be in [-180, 180]" }),
      { status: 400, headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  }

  const radius_km = clamp(
    toFiniteNumber(body.radius_km, DEFAULT_RADIUS_KM),
    MIN_RADIUS_KM,
    MAX_RADIUS_KM,
  );
  const limit = clamp(
    Math.floor(toFiniteNumber(body.limit, DEFAULT_LIMIT)),
    MIN_LIMIT,
    MAX_LIMIT,
  );

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

    const raw = await response.json().catch(() => null);
    const sanitized = sanitizeUpstreamPayload(raw);
    return new Response(
      JSON.stringify({ data: sanitized, source: "os" }),
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
