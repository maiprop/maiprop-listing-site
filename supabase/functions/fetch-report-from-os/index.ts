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
export const OS_TOKEN_TIMEOUT_MS = 7_000;
export const OS_HTML_REPORT_TIMEOUT_MS = 25_000;
export const OS_AI_REPORT_TIMEOUT_MS = 4_000;
const OS_GENERIC_REPORT_TIMEOUT_MS = 12_000;
const REPORT_GENERATION_LEASE_SECONDS = 40;
const REPORT_GENERATION_WAIT_MS = 32_000;
const REPORT_GENERATION_POLL_MS = 350;

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

type ChargePropertyReportFetchResult = {
  charged?: boolean;
  alreadyPaid?: boolean;
};

type AuthorizePropertyReportGenerationResult = {
  allowed?: boolean;
  source?: "included" | "addon";
};

type ReportBillingRpcClient = SupabaseAdminClient & {
  rpc(
    functionName: "charge_property_report_fetch_for_user",
    args: {
      p_user_id: string;
      p_listing_id: string | null;
      p_cache_generated_at: string | null;
    },
  ): PromiseLike<{
    data: ChargePropertyReportFetchResult | null;
    error: { hint?: string; message?: string } | null;
  }>;
};

type ReportAuthorizationRpcClient = SupabaseAdminClient & {
  rpc(
    functionName: "authorize_property_report_generation",
    args: { p_user_id: string },
  ): PromiseLike<{
    data: AuthorizePropertyReportGenerationResult | null;
    error: { hint?: string; message?: string } | null;
  }>;
};

type ReportCacheRpcClient = SupabaseAdminClient & {
  rpc(
    functionName: "store_property_report_cache_generation",
    args: {
      p_listing_id: string;
      p_lang: "en" | "el";
      p_html: string;
      p_ai: Json | null;
      p_features: Json;
      p_file_name: string;
      p_generated_at: string;
      p_expires_at: string;
    },
  ): PromiseLike<{
    data: PropertyReportCacheRow | null;
    error: { message?: string } | null;
  }>;
};

type ReportGenerationLeaseRpcClient = SupabaseAdminClient & {
  rpc(
    functionName: "claim_property_report_generation" | "release_property_report_generation",
    args: Record<string, unknown>,
  ): PromiseLike<{
    data: boolean | null;
    error: { message?: string } | null;
  }>;
};

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

function isAbortError(err: unknown): boolean {
  return err instanceof DOMException && err.name === "AbortError";
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
    OS_TOKEN_TIMEOUT_MS
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

function getSafeReportFileName(listingId: string): string {
  const safeId = listingId.replace(/[^a-z0-9_-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "external";
  return `maiprop-property-report-${safeId}.html`;
}

function getHtmlReportFileName(fileName: string): string {
  if (/\.html?$/i.test(fileName)) return fileName;
  return fileName.replace(/\.[a-z0-9]+$/i, "") + ".html";
}

function sanitizeOsReportHtml(html: string): string {
  const csp = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src https: data:; style-src 'unsafe-inline' https:; font-src https: data:;">`;
  const sanitized = html
    .replace(/<\s*(script|iframe|object|embed|form)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|iframe|object|embed|base|form|input|button|textarea|select|link|meta)\b[^>]*\/?>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "")
    .replace(/\s+(href|src|xlink:href)\s*=\s*javascript:[^\s>]+/gi, "")
    .replace(/\s+srcdoc\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  if (/<head\b[^>]*>/i.test(sanitized)) {
    return sanitized.replace(/<head\b([^>]*)>/i, `<head$1>${csp}`);
  }
  return `<!doctype html><html><head>${csp}</head><body>${sanitized}</body></html>`;
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
  const rpcClient = supabase as ReportBillingRpcClient;
  const { data, error } = await rpcClient.rpc(
    "charge_property_report_fetch_for_user",
    {
      p_user_id: userId,
      p_listing_id: listingId,
      p_cache_generated_at: cacheGeneratedAt,
    },
  );

  if (error) {
    throw new ReportBillingError(error.hint ?? error.message ?? "Property report charge failed");
  }

  return {
    charged: data?.charged === true,
    alreadyPaid: data?.alreadyPaid === true,
  };
}

async function chargeUncachedReportFetch(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<{ charged: boolean; alreadyPaid: boolean }> {
  const rpcClient = supabase as ReportBillingRpcClient;
  const { data, error } = await rpcClient.rpc(
    "charge_property_report_fetch_for_user",
    {
      p_user_id: userId,
      p_listing_id: null,
      p_cache_generated_at: null,
    },
  );

  if (error) {
    throw new ReportBillingError(error.hint ?? error.message ?? "Property report charge failed");
  }
  return {
    charged: data?.charged === true,
    alreadyPaid: data?.alreadyPaid === true,
  };
}

async function claimReportGenerationLease(
  supabase: SupabaseAdminClient,
  listingId: string,
  lang: "en" | "el",
  holder: string,
): Promise<boolean> {
  const client = supabase as ReportGenerationLeaseRpcClient;
  const { data, error } = await client.rpc("claim_property_report_generation", {
    p_listing_id: listingId,
    p_lang: lang,
    p_holder: holder,
    p_lease_seconds: REPORT_GENERATION_LEASE_SECONDS,
  });
  if (error) throw new Error(error.message ?? "Property report generation lease failed");
  return data === true;
}

async function releaseReportGenerationLease(
  supabase: SupabaseAdminClient,
  listingId: string,
  lang: "en" | "el",
  holder: string,
): Promise<void> {
  const client = supabase as ReportGenerationLeaseRpcClient;
  const { error } = await client.rpc("release_property_report_generation", {
    p_listing_id: listingId,
    p_lang: lang,
    p_holder: holder,
  });
  if (error) {
    log.warn("property report generation lease release failed", {
      listing_id: listingId,
      message: error.message ?? "unknown error",
    });
  }
}

async function acquireOrAwaitReportGeneration(
  supabase: SupabaseAdminClient,
  listingId: string,
  lang: "en" | "el",
  holder: string,
): Promise<{ acquired: boolean; cached: PropertyReportCacheRow | null }> {
  const deadline = Date.now() + REPORT_GENERATION_WAIT_MS;
  while (Date.now() < deadline) {
    const cached = await getActiveCachedReport(supabase, listingId, lang);
    if (cached) return { acquired: false, cached };
    if (await claimReportGenerationLease(supabase, listingId, lang, holder)) {
      return { acquired: true, cached: null };
    }
    await new Promise((resolve) => setTimeout(resolve, REPORT_GENERATION_POLL_MS));
  }
  return {
    acquired: false,
    cached: await getActiveCachedReport(supabase, listingId, lang),
  };
}

async function storeReportGeneration(
  supabase: SupabaseAdminClient,
  input: {
    listingId: string;
    lang: "en" | "el";
    html: string;
    ai: unknown | null;
    features: PropertyFeaturesRequest;
    fileName: string;
    generatedAt: string;
    expiresAt: string;
  },
): Promise<PropertyReportCacheRow> {
  const rpcClient = supabase as ReportCacheRpcClient;
  const { data, error } = await rpcClient.rpc(
    "store_property_report_cache_generation",
    {
      p_listing_id: input.listingId,
      p_lang: input.lang,
      p_html: input.html,
      p_ai: input.ai as Json | null,
      p_features: input.features as unknown as Json,
      p_file_name: input.fileName,
      p_generated_at: input.generatedAt,
      p_expires_at: input.expiresAt,
    },
  );

  if (error || !data) {
    throw new Error(error?.message ?? "Property report cache publication failed");
  }
  return data;
}

async function authorizeReportGeneration(
  supabase: SupabaseAdminClient,
  userId: string,
): Promise<void> {
  const rpcClient = supabase as ReportAuthorizationRpcClient;
  const { data, error } = await rpcClient.rpc(
    "authorize_property_report_generation",
    { p_user_id: userId },
  );

  if (error) {
    throw new ReportBillingError(error.hint ?? error.message ?? "Property report is not available on this plan");
  }
  if (data?.allowed !== true) {
    throw new ReportBillingError("Property report is not available on this plan");
  }
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
        html: sanitizeOsReportHtml(cache.html),
        ai: cache.ai,
        features: cache.features,
        fileName: getHtmlReportFileName(cache.file_name),
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
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceRoleKey || !anonKey) {
    return new Response(JSON.stringify({ error: "Service unavailable" }), {
      status: 503,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient<FunctionDatabase>(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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
    const isDatabaseListing = UUID_RE.test(listing_id);

    if (!isDatabaseListing) {
      return new Response(
        JSON.stringify({ ok: false, error: "listing_id must identify a platform listing" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Resolve the listing through the caller's JWT before reading a cached
    // report or contacting the external provider. This deliberately delegates
    // draft/off-market/tenant access to the same RLS policy used by the app.
    const callerSupabase = createClient<FunctionDatabase>(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: authHeader } },
    });
    const listingSelect = "id,address,city,latitude,longitude,sqm,property_type,floor,year_built";
    const { data: publicListings, error: publicListingError } = await callerSupabase
      .rpc("get_public_listing_catalogue")
      .eq("id", listing_id)
      .select(listingSelect)
      .limit(1);
    const publicListing = publicListings?.[0] ?? null;

    if (publicListingError) {
      log.warn("public listing access check failed", {
        listing_id,
        error: publicListingError.message,
      });
      return new Response(JSON.stringify({ error: "Listing access unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const privateListingResult = publicListing
      ? { data: null, error: null }
      : await callerSupabase
        .rpc("get_listing_management_catalogue")
        .eq("id", listing_id)
        .select(listingSelect)
        .limit(1);
    const privateListing = privateListingResult.data?.[0] ?? null;
    const accessibleListing = publicListing ?? privateListing;
    const listingAccessError = privateListingResult.error;

    if (listingAccessError) {
      log.warn("private listing access check failed", {
        listing_id,
        error: listingAccessError.message,
      });
      return new Response(JSON.stringify({ error: "Listing access unavailable" }), {
        status: 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!accessibleListing) {
      return new Response(JSON.stringify({ error: "Listing not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const listingForFeatures = accessibleListing as ListingRow;

    if (report_type === "valuation" && isDatabaseListing) {
      const cached = await getActiveCachedReport(supabase, listing_id, normalizedLang);
      if (cached) {
        const charge = await chargeReportFetchIfNeeded(supabase, user.id, listing_id, cached.generated_at);
        return cachedReportResponse(cached, charge, corsHeaders, true);
      }
    }

    await authorizeReportGeneration(supabase, user.id);

    const OS_URL = Deno.env.get("MAIPROP_OS_URL")?.replace(/\/$/, "");
    const OS_EMAIL = Deno.env.get("MAIPROP_OS_EMAIL");
    const OS_PASS = Deno.env.get("MAIPROP_OS_PASSWORD");

    if (!OS_URL || !OS_EMAIL || !OS_PASS) {
      return new Response(
        JSON.stringify({ ok: true, report: null, source: null, reason: "OS credentials not configured" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (report_type === "valuation") {
      const leaseHolder = crypto.randomUUID();
      const generation = await acquireOrAwaitReportGeneration(
        supabase,
        listing_id,
        normalizedLang,
        leaseHolder,
      );
      if (generation.cached) {
        const charge = await chargeReportFetchIfNeeded(
          supabase,
          user.id,
          listing_id,
          generation.cached.generated_at,
        );
        return cachedReportResponse(generation.cached, charge, corsHeaders, true);
      }
      if (!generation.acquired) {
        return new Response(JSON.stringify({
          ok: true,
          report: null,
          source: "os",
          reason: "Report generation is already in progress. Please retry shortly.",
          retry_after_ms: 1_500,
        }), {
          status: 202,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": "2",
          },
        });
      }

      try {
      const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);
      const features = buildPropertyFeatures(listingForFeatures);
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
      const reportRes = await fetchTextIfOk(reportUrl, token, OS_HTML_REPORT_TIMEOUT_MS).catch((err: unknown) => {
        if (!isAbortError(err)) throw err;
        log.warn("OS valuation HTML report timed out", { timeout_ms: OS_HTML_REPORT_TIMEOUT_MS });
        return null;
      });
      if (!reportRes) {
        return new Response(
          JSON.stringify({
            ok: true,
            report: null,
            source: "os",
            reason: "OS HTML report generation timed out. Please try again.",
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }

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

      const html = sanitizeOsReportHtml(await reportRes.text());
      const aiRes = await fetchTextIfOk(aiUrl, token, OS_AI_REPORT_TIMEOUT_MS).catch(() => null);
      const ai = aiRes?.ok ? await aiRes.json().catch(() => null) : null;
      const fileName = getSafeReportFileName(listing_id);

      const generatedAt = new Date();
      const expiresAt = new Date(generatedAt.getTime() + 30 * 24 * 60 * 60 * 1000);

      const cache = await storeReportGeneration(supabase, {
        listingId: listing_id,
        lang: normalizedLang,
        html,
        ai,
        features,
        fileName,
        generatedAt: generatedAt.toISOString(),
        expiresAt: expiresAt.toISOString(),
      });

      const charge = await chargeReportFetchIfNeeded(
        supabase,
        user.id,
        listing_id,
        cache.generated_at,
      );

      return cachedReportResponse(cache, charge, corsHeaders, false);
      } finally {
        await releaseReportGenerationLease(
          supabase,
          listing_id,
          normalizedLang,
          leaseHolder,
        );
      }
    }

    // OS report endpoint: GET /api/v1/reports/listing/:listingId?type=valuation|neighbourhood
    // Override with MAIPROP_OS_REPORT_PATH e.g. /api/v1/analytics/report (then we use ?listingId= &type=)
    const token = await getOsToken(OS_URL, OS_EMAIL, OS_PASS);
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
      OS_GENERIC_REPORT_TIMEOUT_MS
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

    const charge = await chargeUncachedReportFetch(supabase, user.id);
    return new Response(
      JSON.stringify({ ok: true, report, source: "os", billing: charge }),
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
