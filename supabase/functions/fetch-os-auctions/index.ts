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
import { SchemaValidationError } from "../_shared/schema.ts";
import {
  dedupeOsAuctionsById,
  requireValidOsAuctionBatch,
} from "../_shared/osAuctionIdentity.ts";
import {
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
  fetchNationalAuctionSample,
  fetchOsAuctionDetails,
  parseOsResponse,
} from "./osClient.ts";
import {
  buildFilterRequest,
  getValidatedPagination,
  parseAuctionRequest,
  type AuctionRequest,
} from "./requestFilters.ts";
import { getPlanCap, hasPortalProAccess } from "./entitlements.ts";
import { getFetchErrorPayload, isOsApiFailure } from "./fetchErrors.ts";
import type {
  AuctionResponsePayload,
  MappedAuction,
  OsConfig,
  RuntimeConfig,
  SupabaseConfig,
} from "./types.ts";

type AuthClient = {
  auth?: {
    getUser: (jwt: string) => Promise<{
      data: { user?: { id: string } | null };
      error?: unknown;
    }>;
  };
};
type SupabaseClient = AuthClient & {
  rpc?: unknown;
  from: (table: string) => unknown;
};
type AuthIdentity = {
  rateLimitKey: string;
  userId: string | null;
};

export {
  buildFilterRequest,
  clearAuctionResponseCache,
  getAuctionResponseCacheKey,
  getAuctionSamplePageNumbers,
  getFetchErrorPayload,
  getPlanCap,
  getValidatedPagination,
  hasPortalProAccess,
  mapAuction,
  parseAuctionRequest,
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

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function isNationalSampleRequest(
  body: Record<string, unknown>,
  filterRequest: Record<string, unknown>,
): boolean {
  return body.sampleAcrossGreece !== false &&
    filterRequest.prefectureId === undefined &&
    filterRequest.propertyMunicipalityId === undefined &&
    filterRequest.boundingBox === undefined;
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

async function getAuthIdentity(
  req: Request,
  authClient?: AuthClient | null,
): Promise<AuthIdentity> {
  const bearerToken = getBearerToken(req);
  if (!bearerToken || !authClient?.auth?.getUser) {
    return { rateLimitKey: "anonymous", userId: null };
  }

  try {
    const { data, error } = await authClient.auth.getUser(bearerToken);
    const userId = data?.user?.id;
    return error || !userId
      ? { rateLimitKey: "anonymous", userId: null }
      : { rateLimitKey: `auth:${await sha256Hex(userId)}`, userId };
  } catch {
    return { rateLimitKey: "anonymous", userId: null };
  }
}

export async function getRateLimitKey(
  req: Request,
  authClient?: AuthClient | null,
): Promise<string> {
  return (await getAuthIdentity(req, authClient)).rateLimitKey;
}

async function getGuardResponse(
  corsHeaders: Record<string, string>,
  rateLimitKey: string,
): Promise<Response | null> {
  return await limiter.isLimited(rateLimitKey)
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
  body: AuctionRequest,
  corsHeaders: Record<string, string>,
  runtimeConfig: RuntimeConfig,
  sb: SupabaseClient,
  verifiedUserId: string | null,
): Promise<Response> {
  try {
    const planCap = await getPlanCap(req, sb, verifiedUserId);
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
    const validAuctions = dedupeOsAuctionsById(osResult.auctions);
    requireValidOsAuctionBatch(osResult.auctions.length, validAuctions.length);
    const mapped = sampleAcrossGreece
      ? selectDiverseAuctionSample(validAuctions.map(mapAuction), size)
      : validAuctions.map(mapAuction);

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
  const preflight = handleCors(req);
  if (preflight) return preflight;

  if (req.method !== "POST") {
    return jsonResponse({ error: "Method not allowed" }, corsHeaders, 405);
  }

  const runtimeConfig = getRuntimeConfig(corsHeaders);
  if (runtimeConfig instanceof Response) return runtimeConfig;

  const sb = createClient(
    runtimeConfig.supabaseConfig.url,
    runtimeConfig.supabaseConfig.serviceRoleKey,
  );
  const authIdentity = await getAuthIdentity(req, sb);
  const guardResponse = await getGuardResponse(corsHeaders, authIdentity.rateLimitKey);
  if (guardResponse) return guardResponse;

  let body: AuctionRequest;
  try {
    body = await parseAuctionRequest(req);
  } catch (err: unknown) {
    if (err instanceof SchemaValidationError) {
      const status = err.code === "payload_too_large"
        ? 413
        : err.code === "request_body_timeout"
        ? 408
        : 400;
      return jsonResponse(
        { error: err.message, code: err.code, issues: err.issues },
        corsHeaders,
        status,
      );
    }
    throw err;
  }

  return await handleAuctionRequest(
    req,
    body,
    corsHeaders,
    runtimeConfig,
    sb,
    authIdentity.userId,
  );
}

Deno.serve(handleRequest);
