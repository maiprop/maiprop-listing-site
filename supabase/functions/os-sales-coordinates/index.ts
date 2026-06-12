/**
 * os-sales-coordinates
 * ─────────────────────────────────────────────────────────────────────────────
 * Proxies coordinate-based sales queries to the maiProp OS API:
 *   POST $MAIPROP_OS_URL/api/v1/sales/filter/coordinates
 *
 * Reads `MAIPROP_OS_URL` from env (same secret consumed by os-diagnose,
 * sync-to-os, poll-os-auctions, etc.) and fails closed when it is unset or
 * not HTTPS.
 *
 * verify_jwt = false — callable without auth (used on public property pages).
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

/* ── Server-side caps ─────────────────────────────────────────────────────── */
const MAX_RADIUS_KM = 50;
const MAX_LIMIT = 100;
const LAT_MIN = -90;
const LAT_MAX = 90;
const LNG_MIN = -180;
const LNG_MAX = 180;

/** Fields we expose to callers — prevents upstream additions from leaking PII. */
const ALLOWED_SALE_FIELDS: readonly (keyof SaleRecord)[] = [
  "id", "address", "lat", "lng", "sale_price", "asking_price",
  "sale_date", "property_type", "sqm", "bedrooms", "status",
  "discount_pct", "source", "round",
] as const;

const pickAllowedFields = (record: Record<string, unknown>): Partial<SaleRecord> => {
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_SALE_FIELDS) {
    if (key in record) out[key] = record[key];
  }
  return out as Partial<SaleRecord>;
};

const getConfiguredOsBaseUrl = (): { url?: string; reason?: string } => {
  const raw = Deno.env.get("MAIPROP_OS_URL")?.trim();
  if (!raw) return { reason: "os_config_missing" };
  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:") return { reason: "os_config_not_https" };
    return { url: parsed.href.replace(/\/+$/, "") };
  } catch {
    return { reason: "os_config_invalid" };
  }
};


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

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return new Response(JSON.stringify({ error: "Request body must be a JSON object" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const body = raw as RequestBody;
  const { lat, lng } = body;

  if (lat === undefined || lat === null || lng === undefined || lng === null) {
    return new Response(JSON.stringify({ error: "lat and lng are required" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (typeof lat !== "number" || typeof lng !== "number" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return new Response(JSON.stringify({ error: "lat and lng must be finite numbers" }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  if (lat < LAT_MIN || lat > LAT_MAX || lng < LNG_MIN || lng > LNG_MAX) {
    return new Response(JSON.stringify({ error: `lat must be ${LAT_MIN}–${LAT_MAX}, lng must be ${LNG_MIN}–${LNG_MAX}` }), {
      status: 400, headers: { ...hdrs, "Content-Type": "application/json" },
    });
  }

  const radius_km = Math.min(Math.max(Number(body.radius_km) || 2, 0.1), MAX_RADIUS_KM);
  const limit = Math.min(Math.max(Math.floor(Number(body.limit) || 50), 1), MAX_LIMIT);

  const osConfig = getConfiguredOsBaseUrl();
  if (!osConfig.url) {
    log.warn("OS API configuration unavailable", { reason: osConfig.reason });
    return new Response(
      JSON.stringify({ available: false, reason: osConfig.reason ?? "os_config_unavailable" }),
      { status: 503, headers: { ...hdrs, "Content-Type": "application/json" } },
    );
  }

  const osBase = osConfig.url;
  const osUrl = `${osBase}/api/v1/sales/filter/coordinates`;

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

    let data: unknown;
    try {
      data = await response.json();
    } catch {
      log.warn("Unparseable upstream JSON");
      return new Response(
        JSON.stringify({ available: false, reason: "upstream_bad_response" }),
        { status: 502, headers: { ...hdrs, "Content-Type": "application/json" } },
      );
    }

    const rows = Array.isArray(data) ? data : (data as Record<string, unknown>)?.data;
    const sanitised = Array.isArray(rows)
      ? (rows as Record<string, unknown>[]).map(pickAllowedFields)
      : [];

    return new Response(
      JSON.stringify({ data: sanitised, source: "os" }),
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
