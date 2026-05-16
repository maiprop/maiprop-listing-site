/**
 * fetch-report-from-os
 * ─────────────────────────────────────────────────────────────────────────────
 * Fetches a report from the maiProp OS API for a given listing.
 *
 * For valuation reports, this uses the current OS printable HTML endpoint:
 * GET /api/v1/reports/valuation/property
 *
 * Older report types still use the legacy listing report endpoint as a fallback
 * so existing callers can continue to degrade to local AI functions.
 *
 * Requires authenticated user (JWT). OS API uses server-side credentials.
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import { makeRateLimiter, tooManyRequestsResponse } from "../_shared/rateLimit.ts";
import { getCorsHeaders } from "../_shared/cors.ts";
import type { Database, Json } from "../../../src/integrations/supabase/types.ts";

const log = createLogger("fetch-report-from-os");
const limiter = makeRateLimiter({ bucket: "fetch-report-from-os", maxRequests: 20, windowMs: 60_000 });

type ListingRow = {
  id: string;
  address?: string | null;
  city?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  sqm?: number | null;
  property_type?: string | null;
  floor?: number | null;
  year_built?: number | null;
};

type PropertyFeaturesRequest = {
  constructionYear: number;
  propertyLongitude: number;
  propertyLatitude: number;
  propertySquareMeters: number;
  propertyCategory?: string;
  propertyFloor: number;
  address?: string;
};

type PropertyReportCacheRow = {
  id: string;
  listing_id: string;
  report_type: "valuation";
  lang: "en" | "el";
  source: "os";
  html: string;
  ai: unknown | null;
  features: PropertyFeaturesRequest;
  file_name: string;
  generated_at: string;
  expires_at: string;
};

type PropertyReportCacheDbRow = {
  id: string;
  listing_id: string;
  report_type: string;
  lang: string;
  report_payload: Json;
  generated_at: string;
  expires_at: string;
  created_by: string | null;
};

type FunctionDatabase = Database & {
  public: Database["public"] & {
    Tables: Database["public"]["Tables"] & {
      property_report_cache: {
        Row: PropertyReportCacheDbRow;
        Insert: Omit<PropertyReportCacheDbRow, "id" | "generated_at" | "expires_at"> & {
          id?: string;
          generated_at?: string;
          expires_at?: string;
        };
        Update: Partial<PropertyReportCacheDbRow>;
        Relationships: [];
      };
    };
  };
};

type SupabaseAdminClient = ReturnType<typeof createClient<FunctionDatabase>>;

class ReportBillingError extends Error {
  status = 402;
}

const OS_PROPERTY_CATEGORY: Record<string, string> = {
  apartment: "RESIDENCE",
  house: "RESIDENCE",
  villa: "RESIDENCE",
  studio: "RESIDENCE",
  maisonette: "RESIDENCE",
  commercial: "OTHER_BUSINESS_SPACE",
  office: "OFFICE",
  store: "STORE",
  parking: "PARKING",
  storage: "STOREROOM",
  industrial: "INDUSTRIAL",
  land: "LAND",
  plot: "PLOT",
  hotel: "HOTEL",
};

function errorMessage(err: unknown): string {
  if (err instanceof Error) return err.message;
  if (typeof err === "string") return err;
  try {
    return JSON.stringify(err);
  } catch {
    return "Unknown error";
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOsToken(
  baseUrl: string,
  email: string,
  password: string
): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    15_000
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token)
    throw new Error(`OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`);
  return token;
}

function coerceFiniteNumber(value: unknown): number | null {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function buildPropertyFeatures(listing: ListingRow): PropertyFeaturesRequest | null {
  const propertyLatitude = coerceFiniteNumber(listing.latitude);
  const propertyLongitude = coerceFiniteNumber(listing.longitude);
  const propertySquareMeters = coerceFiniteNumber(listing.sqm);

  if (propertyLatitude == null || propertyLongitude == null || propertySquareMeters == null) {
    return null;
  }

  const rawYear = coerceFiniteNumber(listing.year_built);
  const constructionYear =
    rawYear != null && rawYear >= 1900 && rawYear <= 2200 ? Math.round(rawYear) : 2000;
  const propertyFloor = coerceFiniteNumber(listing.floor) ?? 0;
  const address = [listing.address, listing.city].filter(Boolean).join(", ");
  const propertyCategory = listing.property_type
    ? OS_PROPERTY_CATEGORY[listing.property_type] ?? "RESIDENCE"
    : "RESIDENCE";

  return {
    constructionYear,
    propertyLongitude,
    propertyLatitude,
    propertySquareMeters,
    propertyCategory,
    propertyFloor,
    ...(address ? { address } : {}),
  };
}

function appendFeatures(params: URLSearchParams, features: PropertyFeaturesRequest): void {
  for (const [key, value] of Object.entries(features)) {
    if (value == null || value === "") continue;
    params.append(key, String(value));
  }
}

async function fetchTextIfOk(url: string, token: string, timeoutMs = 30_000): Promise<Response> {
  return await fetchWithTimeout(
    url,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "text/html,application/json",
      },
    },
    timeoutMs,
  );
}

async function getActiveCachedReport(
  supabase: SupabaseAdminClient,
  listingId: string,
  lang: "en" | "el",
): Promise<PropertyReportCacheRow | null> {
  const { data, error } = await supabase
    .from("property_report_cache")
    .select("id,listing_id,report_type,lang,source,html,ai,features,file_name,generated_at,expires_at")
    .eq("listing_id", listingId)
    .eq("report_type", "valuation")
    .eq("lang", lang)
    .gt("expires_at", new Date().toISOString())
    .maybeSingle();

  if (error) throw error;
  return data as PropertyReportCacheRow | null;
}

async function chargeReportFetchIfNeeded(
  supabase: SupabaseAdminClient,
  userId: string,
  listingId: string,
  cacheGeneratedAt: string,
): Promise<{ charged: boolean; alreadyPaid: boolean }> {
  const { data: existing, error: existingError } = await supabase
    .from("usage_property_reports")
    .select("id")
    .eq("user_id", userId)
    .eq("listing_id", listingId)
    .gte("created_at", cacheGeneratedAt)
    .limit(1);

  if (existingError) throw existingError;
  if ((existing ?? []).length > 0) return { charged: false, alreadyPaid: true };

  const { error: insertError } = await supabase
    .from("usage_property_reports")
    .insert({ user_id: userId, listing_id: listingId });

  if (insertError) {
    throw new ReportBillingError(insertError.hint ?? insertError.message ?? "Property report charge failed");
  }
  return { charged: true, alreadyPaid: false };
}

function cachedReportResponse(
  cache: PropertyReportCacheRow,
  charge: { charged: boolean; alreadyPaid: boolean },
  corsHeaders: Record<string, string>,
  cached: boolean,
): Response {
  return new Response(
    JSON.stringify({
      ok: true,
      report: {
        kind: "valuation-property-html",
        html: cache.html,
        ai: cache.ai,
        features: cache.features,
        fileName: cache.file_name,
        cache: {
          id: cache.id,
          cached,
          generatedAt: cache.generated_at,
          expiresAt: cache.expires_at,
        },
      },
      source: cache.source,
      billing: charge,
    }),
    { headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
}

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "anonymous";
  if (await limiter.isLimited(ip)) return tooManyRequestsResponse(corsHeaders);

  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Missing or invalid Authorization header" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );
  const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
  if (authError || !user) {
    return new Response(JSON.stringify({ error: "Invalid or expired token" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const {
      listing_id,
      report_type,
      lang = "en",
      since,
      to,
    } = body as {
      listing_id?: string;
      report_type?: string;
      lang?: string;
      since?: string;
      to?: string;
    };

    if (!listing_id || !report_type) {
      return new Response(
        JSON.stringify({ ok: false, error: "listing_id and report_type are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const allowedTypes = ["valuation", "neighbourhood"];
    if (!allowedTypes.includes(report_type)) {
      return new Response(
        JSON.stringify({ ok: false, error: "report_type must be 'valuation' or 'neighbourhood'" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const normalizedLang: "en" | "el" = lang === "el" ? "el" : "en";

    if (report_type === "valuation") {
      const cached = await getActiveCachedReport(supabase, listing_id, normalizedLang);
      if (cached) {
        const charge = await chargeReportFetchIfNeeded(supabase, user.id, listing_id, cached.generated_at);
        return cachedReportResponse(cached, charge, corsHeaders, true);
      }
    }

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      return new Response(
        JSON.stringify({ ok: true, report: null, source: null, reason: "OS credentials not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);

    if (report_type === "valuation") {
      const { data: listing, error: listingError } = await supabase
        .from("listings")
        .select("id,address,city,latitude,longitude,sqm,property_type,floor,year_built")
        .eq("id", listing_id)
        .maybeSingle();

      if (listingError) throw listingError;

      const features = listing ? buildPropertyFeatures(listing as ListingRow) : null;
      if (!features) {
        return new Response(
          JSON.stringify({
            ok: true,
            report: null,
            source: "os",
            reason: "Listing is missing coordinates or square meters required by OS reports",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const params = new URLSearchParams({ lang: normalizedLang });
      if (since) params.set("since", since);
      if (to) params.set("to", to);
      appendFeatures(params, features);

      const reportUrl = `${OS_URL}/api/v1/reports/valuation/property?${params.toString()}`;
      const aiUrl = `${OS_URL}/api/v1/reports/valuation/property/ai?${params.toString()}`;
      const reportRes = await fetchTextIfOk(reportUrl, token);

      if (reportRes.status === 404 || reportRes.status === 204) {
        return new Response(
          JSON.stringify({ ok: true, report: null, source: "os", reason: "No valuation report for this listing" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      if (!reportRes.ok) {
        const text = await reportRes.text();
        log.warn("OS valuation report returned non-ok", { status: reportRes.status, body: text.slice(0, 200) });
        return new Response(
          JSON.stringify({ ok: true, report: null, source: null, reason: `OS returned ${reportRes.status}` }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

      const html = await reportRes.text();
      const aiRes = await fetchTextIfOk(aiUrl, token, 5_000).catch(() => null);
      const ai = aiRes?.ok ? await aiRes.json().catch(() => null) : null;
      const generatedAt = new Date();
      const expiresAt = new Date(generatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);
      const fileName = `maiprop-property-report-${listing_id}.pdf`;

      const { data: cache, error: cacheError } = await supabase
        .from("property_report_cache")
        .upsert(
          {
            listing_id,
            report_type: "valuation",
            lang: normalizedLang,
            source: "os",
            html,
            ai,
            features,
            file_name: fileName,
            generated_at: generatedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            updated_at: generatedAt.toISOString(),
          },
          { onConflict: "listing_id,report_type,lang" },
        )
        .select("id,listing_id,report_type,lang,source,html,ai,features,file_name,generated_at,expires_at")
        .single();

      if (cacheError) throw cacheError;

      const charge = await chargeReportFetchIfNeeded(
        supabase,
        user.id,
        listing_id,
        (cache as PropertyReportCacheRow).generated_at,
      );

      return cachedReportResponse(cache as PropertyReportCacheRow, charge, corsHeaders, false);
    }

    // OS report endpoint: GET /api/v1/reports/listing/:listingId?type=valuation|neighbourhood
    // Override with MAIPROP_OS_REPORT_PATH e.g. /api/v1/analytics/report (then we use ?listingId= &type=)
    const pathTemplate = Deno.env.get("MAIPROP_OS_REPORT_PATH") || "/api/v1/reports/listing";
    const base = pathTemplate.replace(/:listingId|:id/g, listing_id);
    const url = base.includes(listing_id)
      ? `${OS_URL}${base}?type=${report_type}`
      : `${OS_URL}${base}?listingId=${encodeURIComponent(listing_id)}&type=${report_type}`;

    const res = await fetchWithTimeout(
      url,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
      },
      15_000
    );

    if (res.status === 404 || res.status === 204) {
      return new Response(
        JSON.stringify({ ok: true, report: null, source: "os", reason: "No report for this listing" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!res.ok) {
      const text = await res.text();
      log.warn("OS returned non-ok", { status: res.status, body: text.slice(0, 200) });
      return new Response(
        JSON.stringify({ ok: true, report: null, source: null, reason: `OS returned ${res.status}` }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const report = await res.json().catch(() => null);
    if (!report) {
      return new Response(
        JSON.stringify({ ok: true, report: null, source: "os" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ ok: true, report, source: "os" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err: unknown) {
    const message = errorMessage(err);
    log.error("fetch-report error", { err: message });
    if (err instanceof ReportBillingError) {
      return new Response(
        JSON.stringify({ ok: false, error: message, report: null, code: "report_billing_failed" }),
        { status: err.status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ ok: false, error: message, report: null }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
