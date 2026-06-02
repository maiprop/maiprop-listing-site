/* global Deno:readonly */
/**
 * fetch-os-auctions
 * ─────────────────────────────────────────────────────────────────────────────
 * Live proxy to POST /api/v1/auctions/filter/details on the maiProp OS API.
 * Used by the Auctions page to show real-time data without waiting for the
 * poll-os-auctions background sync to run.
 *
 * Portal caps (enforced server-side):
 *   - anonymous / free : 60 auctions
 *   - Pro/admin        : 600 auctions
 *
 * This function is a read-through proxy only. It does not write auction rows
 * into Supabase; the portal intentionally avoids mirroring the full OS
 * auction catalogue.
 *
 * Required Supabase secrets (shared with poll-os-auctions):
 *   MAIPROP_OS_URL      e.g. https://app.os.maiprop.co
 *   MAIPROP_OS_EMAIL
 *   MAIPROP_OS_PASSWORD
 */

import { createClient } from "npm:@supabase/supabase-js@2";
import { createLogger } from "../_shared/logger.ts";
import {
  makeRateLimiter,
  tooManyRequestsResponse,
} from "../_shared/rateLimit.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import {
  AUTH_CAP,
  FREE_CAP,
  NATIONAL_SAMPLE_PAGE_COUNT,
  NATIONAL_SAMPLE_SOURCE_PAGE_SIZE,
  OS_ALLOWED_HOST_SUFFIX,
  TRAILING_SLASH_RE,
} from "./constants.ts";
import {
  clearAuctionResponseCache,
  getAuctionResponseCacheKey,
  readAuctionResponseCache,
  writeAuctionResponseCache,
} from "./auctionCache.ts";
import { mapAuction } from "./auctionMapping.ts";
import {
  getAuctionSamplePageNumbers,
  selectDiverseAuctionSample,
} from "./auctionSampling.ts";
import {
  buildFilterRequest,
  getValidatedPagination,
} from "./requestFilters.ts";
import { getFetchErrorPayload, isOsApiFailure } from "./fetchErrors.ts";
import type {
  AuctionResponsePayload,
  MappedAuction,
  OsApiFailure,
  OsAuction,
  OsConfig,
  OsResponse,
  PricingConfigPlanRow,
  ProfilePlanRow,
  RuntimeConfig,
  SupabaseConfig,
} from "./types.ts";

export {
  buildFilterRequest,
  clearAuctionResponseCache,
  getAuctionResponseCacheKey,
  getAuctionSamplePageNumbers,
  getFetchErrorPayload,
  getValidatedPagination,
  mapAuction,
  readAuctionResponseCache,
  selectDiverseAuctionSample,
};

const log = createLogger("fetch-os-auctions");
const limiter = makeRateLimiter({
  bucket: "fetch-os-auctions",
  maxRequests: 20,
  windowMs: 60_000,
  failClosed: true,
});

type SupabaseAdminClient = ReturnType<
  typeof createClient<Record<string, unknown>>
>;

// ── Helpers ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(function abortRequest() {
    controller.abort();
  }, timeoutMs);
  try {
    // nosemgrep: javascript.lang.security.audit.detect-non-literal-url
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

async function getOsToken(
  baseUrl: string,
  email: string,
  password: string,
): Promise<string> {
  const res = await fetchWithTimeout(
    `${baseUrl}/auth/login`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    },
    15_000,
  );
  const json = await res.json();
  const token = json?.data?.token ?? json?.token ?? json?.accessToken;
  if (!token) {
    throw new Error(
      `OS auth failed (${res.status}): ${JSON.stringify(json).slice(0, 200)}`,
    );
  }
  return token;
}

function isInvestorProfile(profile: ProfilePlanRow | null): boolean {
  return profile?.participant_type === "investor" ||
    profile?.participant_type === "institutional" ||
    profile?.role === "investor" ||
    profile?.role === "institutional";
}

async function hasInvestorSubscription(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const { data } = await sb
    .from("investor_subscriptions")
    .select("status")
    .eq("user_id", userId)
    .in("status", ["active", "trial"])
    .limit(1)
    .maybeSingle();
  const sub = data as { status?: string } | null;
  return sub?.status === "active" || sub?.status === "trial";
}

function isOsAuctionEntitlement(row: PricingConfigPlanRow | null): boolean {
  if (!row?.key || !row?.audience) return false;
  return row.audience === "investor" || row.audience === "institutional" ||
    row.key === "investor_private" || row.key === "investor_institutional";
}

async function hasInvestorProductEntitlement(
  sb: SupabaseAdminClient,
  productId: string | null | undefined,
): Promise<boolean> {
  if (!productId) return false;
  const { data } = await sb
    .from("pricing_configs")
    .select("key, audience, metadata")
    .eq("metadata->>stripe_product_id", productId)
    .limit(1)
    .maybeSingle();
  return isOsAuctionEntitlement(data as PricingConfigPlanRow | null);
}

async function hasCanonicalProAccess(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean | null> {
  type RpcFn = (
    functionName: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: unknown }>;
  const client = sb as SupabaseAdminClient & { rpc?: RpcFn };
  if (!client.rpc) return null;
  const { data, error } = await client.rpc("is_pro", { p_user_id: userId });
  if (error || typeof data !== "boolean") return null;
  return data;
}

export async function hasPortalProAccess(
  sb: SupabaseAdminClient,
  userId: string,
): Promise<boolean> {
  const canonicalProAccess = await hasCanonicalProAccess(sb, userId);
  if (canonicalProAccess != null) return canonicalProAccess;

  const { data: profileRow } = await sb
    .from("profiles")
    .select("role, participant_type, subscription_product_id, force_pro_access")
    .eq("user_id", userId)
    .single();
  const profile = profileRow as ProfilePlanRow | null;

  if (profile?.role === "admin") return true;
  if (profile?.force_pro_access) return true;
  if (isInvestorProfile(profile)) {
    return await hasInvestorSubscription(sb, userId) ||
      await hasInvestorProductEntitlement(sb, profile?.subscription_product_id);
  }
  return false;
}

/** Determine portal cap from the request's JWT. Returns FREE_CAP if unauthenticated/free. */
async function getPlanCap(
  req: Request,
  sb: SupabaseAdminClient,
): Promise<number> {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader?.startsWith("Bearer ")) return FREE_CAP;

  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return FREE_CAP;

  return await hasPortalProAccess(sb, user.id) ? AUTH_CAP : FREE_CAP;
}

function jsonResponse(
  payload: unknown,
  corsHeaders: Record<string, string>,
  status?: number,
): Response {
  const init: ResponseInit = {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  };
  if (status !== undefined) init.status = status;
  return new Response(JSON.stringify(payload), init);
}

function isAllowedOsApiUrl(url: URL): boolean {
  return url.protocol === "https:" && (
    url.hostname === "app.os.maiprop.co" ||
    url.hostname.endsWith(OS_ALLOWED_HOST_SUFFIX)
  );
}

function normalizeOsUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl) return null;
  try {
    const url = new URL(rawUrl);
    if (!isAllowedOsApiUrl(url)) return null;
    return url.toString().replace(TRAILING_SLASH_RE, "");
  } catch {
    return null;
  }
}

function getOsConfig(): OsConfig | null {
  const url = normalizeOsUrl(Deno.env.get("MAIPROP_OS_URL"));
  const email = Deno.env.get("MAIPROP_OS_EMAIL");
  const password = Deno.env.get("MAIPROP_OS_PASSWORD");
  return url && email && password ? { url, email, password } : null;
}

function getSupabaseConfig(): SupabaseConfig | null {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  return url && serviceRoleKey ? { url, serviceRoleKey } : null;
}

async function parseRequestBody(
  req: Request,
): Promise<Record<string, unknown>> {
  const body = await req.json().catch(function getEmptyBody() {
    return {};
  });
  return body && typeof body === "object" && !Array.isArray(body)
    ? body as Record<string, unknown>
    : {};
}

async function fetchOsAuctionDetails(
  osConfig: OsConfig,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<OsResponse | OsAuction[]> {
  log.info("authenticating with OS API");
  const token = await getOsToken(
    osConfig.url,
    osConfig.email,
    osConfig.password,
  );

  return await fetchOsAuctionDetailsWithToken(
    osConfig,
    token,
    page,
    size,
    filterRequest,
  );
}

async function fetchOsAuctionDetailsWithToken(
  osConfig: OsConfig,
  token: string,
  page: number,
  size: number,
  filterRequest: Record<string, unknown>,
): Promise<OsResponse | OsAuction[]> {
  const endpoint =
    `${osConfig.url}/api/v1/auctions/filter/details?page=${page}&pageSize=${size}`;
  log.info("fetching auctions", { page, size, filter: filterRequest });

  const auctionResponse = await fetchWithTimeout(
    endpoint,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(filterRequest),
    },
    20_000,
  );

  if (!auctionResponse.ok) {
    const detail = (await auctionResponse.text()).slice(0, 300);
    log.error("OS API error", { status: auctionResponse.status, detail });
    throw {
      kind: "os-api",
      status: auctionResponse.status,
      detail,
    } satisfies OsApiFailure;
  }

  return (await auctionResponse.json()) as OsResponse | OsAuction[];
}

function parseOsResponse(
  json: OsResponse | OsAuction[],
): { auctions: OsAuction[]; total: number } {
  const auctions = Array.isArray(json)
    ? json
    : Array.isArray(json.data)
    ? json.data
    : [];
  const total = Array.isArray(json)
    ? auctions.length
    : (json.responseMetadata?.pagination?.totalElements ?? auctions.length);
  return { auctions, total };
}

function isNationalSampleRequest(
  body: Record<string, unknown>,
  filterRequest: Record<string, unknown>,
): boolean {
  return body.sampleAcrossGreece !== false &&
    !filterRequest.prefectureId &&
    !filterRequest.propertyMunicipalityId &&
    !filterRequest.boundingBox;
}

async function fetchNationalAuctionSample(
  osConfig: OsConfig,
  responseSize: number,
  filterRequest: Record<string, unknown>,
): Promise<{ auctions: OsAuction[]; total: number; sourcePages: number[] }> {
  log.info("authenticating with OS API");
  const token = await getOsToken(
    osConfig.url,
    osConfig.email,
    osConfig.password,
  );
  const sourcePageSize = Math.max(
    responseSize,
    NATIONAL_SAMPLE_SOURCE_PAGE_SIZE,
  );
  const firstResponse = await fetchOsAuctionDetailsWithToken(
    osConfig,
    token,
    0,
    sourcePageSize,
    filterRequest,
  );
  const firstPage = parseOsResponse(firstResponse);
  const samplePages = getAuctionSamplePageNumbers(
    firstPage.total,
    sourcePageSize,
    NATIONAL_SAMPLE_PAGE_COUNT,
  );
  const remainingPages = samplePages.filter((page) => page !== 0);
  const successfulPages: OsAuction[][] = [];
  const failedPages: number[] = [];
  const pageResults = await Promise.allSettled(
    remainingPages.map((page) =>
      fetchOsAuctionDetailsWithToken(
        osConfig,
        token,
        page,
        sourcePageSize,
        filterRequest,
      )
    ),
  );

  pageResults.forEach((result, index) => {
    const page = remainingPages[index];
    if (result.status === "fulfilled") {
      successfulPages.push(parseOsResponse(result.value).auctions);
      return;
    }
    failedPages.push(page);
    log.warn("national auction sample page failed, retrying sequentially", {
      page,
      error: result.reason instanceof Error
        ? result.reason.message
        : String(result.reason),
    });
  });

  for (const page of failedPages) {
    try {
      const pageResponse = await fetchOsAuctionDetailsWithToken(
        osConfig,
        token,
        page,
        sourcePageSize,
        filterRequest,
      );
      successfulPages.push(parseOsResponse(pageResponse).auctions);
    } catch (err) {
      log.warn("national auction sample page failed", {
        page,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  return {
    auctions: [firstPage.auctions, ...successfulPages].flat(),
    total: firstPage.total,
    sourcePages: [0, ...remainingPages],
  };
}

function getBearerToken(req: Request): string | null {
  const authHeader = req.headers.get("Authorization");
  return authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(value),
  );
  return Array.from(new Uint8Array(digest), function toHex(byte) {
    return byte.toString(16).padStart(2, "0");
  }).join("");
}

export async function getRateLimitKey(req: Request): Promise<string> {
  const bearerToken = getBearerToken(req);
  return bearerToken ? `auth:${await sha256Hex(bearerToken)}` : "anonymous";
}

async function getGuardResponse(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const preflight = handleCors(req);
  if (preflight) return preflight;
  return await limiter.isLimited(await getRateLimitKey(req))
    ? tooManyRequestsResponse(corsHeaders)
    : null;
}

function getRuntimeConfig(
  corsHeaders: Record<string, string>,
): RuntimeConfig | Response {
  const osConfig = getOsConfig();
  if (!osConfig) {
    return jsonResponse(
      { error: "OS credentials not configured" },
      corsHeaders,
      503,
    );
  }

  const supabaseConfig = getSupabaseConfig();
  if (!supabaseConfig) {
    return jsonResponse(
      { error: "Supabase credentials not configured" },
      corsHeaders,
      503,
    );
  }

  return { osConfig, supabaseConfig };
}

function buildAuctionResponsePayload(
  mapped: MappedAuction[],
  total: number,
  page: number,
  planCap: number,
): AuctionResponsePayload {
  return {
    data: mapped,
    total,
    page,
    planCap,
  };
}

function handleFetchError(
  err: unknown,
  corsHeaders: Record<string, string>,
): Response {
  if (isOsApiFailure(err)) {
    log.error("OS API request failed", {
      status: err.status,
      detail: err.detail,
    });
    const payload = getFetchErrorPayload(err);
    return jsonResponse({ error: payload.error }, corsHeaders, payload.status);
  }

  const message = err instanceof Error ? err.message : String(err);
  log.error("fetch error", { err: message });
  const payload = getFetchErrorPayload(err);
  return jsonResponse({ error: payload.error }, corsHeaders, payload.status);
}

async function handleAuctionRequest(
  req: Request,
  corsHeaders: Record<string, string>,
  runtimeConfig: RuntimeConfig,
): Promise<Response> {
  const sb = createClient(
    runtimeConfig.supabaseConfig.url,
    runtimeConfig.supabaseConfig.serviceRoleKey,
  );

  try {
    const body = await parseRequestBody(req);
    const planCap = await getPlanCap(req, sb);
    const pagination = getValidatedPagination(body, planCap);
    if ("error" in pagination) {
      return jsonResponse({ error: pagination.error }, corsHeaders, 400);
    }
    const { page, size } = pagination;
    const filterRequest = buildFilterRequest(body);
    const sampleAcrossGreece = isNationalSampleRequest(body, filterRequest);
    const cacheKey = getAuctionResponseCacheKey(
      page,
      size,
      planCap,
      sampleAcrossGreece,
      filterRequest,
    );
    const cachedPayload = readAuctionResponseCache(cacheKey);
    if (cachedPayload) {
      log.info("returning cached auctions", {
        count: cachedPayload.data.length,
        total: cachedPayload.total,
        page,
        sample_across_greece: sampleAcrossGreece,
      });
      return jsonResponse(cachedPayload, corsHeaders);
    }

    const osResult = sampleAcrossGreece
      ? await fetchNationalAuctionSample(
        runtimeConfig.osConfig,
        size,
        filterRequest,
      )
      : {
        ...parseOsResponse(
          await fetchOsAuctionDetails(
            runtimeConfig.osConfig,
            page,
            size,
            filterRequest,
          ),
        ),
        sourcePages: [page],
      };
    const mapped = sampleAcrossGreece
      ? selectDiverseAuctionSample(osResult.auctions.map(mapAuction), size)
      : osResult.auctions.map(mapAuction);

    log.info("returning auctions", {
      count: mapped.length,
      total: osResult.total,
      page,
      source_pages: osResult.sourcePages,
      sample_across_greece: sampleAcrossGreece,
    });
    const payload = buildAuctionResponsePayload(
      mapped,
      osResult.total,
      page,
      planCap,
    );
    writeAuctionResponseCache(cacheKey, payload);
    return jsonResponse(
      payload,
      corsHeaders,
    );
  } catch (err: unknown) {
    return handleFetchError(err, corsHeaders);
  }
}

// ── Main handler ─────────────────────────────────────────────────────────────

async function handleRequest(req: Request): Promise<Response> {
  const corsHeaders = getCorsHeaders(req);
  const guardResponse = await getGuardResponse(req, corsHeaders);
  if (guardResponse) return guardResponse;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);
  }

  const runtimeConfig = getRuntimeConfig(corsHeaders);
  if (runtimeConfig instanceof Response) return runtimeConfig;

  return await handleAuctionRequest(req, corsHeaders, runtimeConfig);
}

Deno.serve(handleRequest);
