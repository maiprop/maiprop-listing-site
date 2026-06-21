import { getSupabaseRuntime, type SeoEnv } from "../../_seo";

export type PublicApiEnv = SeoEnv;

export type PublicApiCtx = Parameters<PagesFunction<PublicApiEnv>>[0];

const DEFAULT_EDGE_TTL_SECONDS = 120;
const DEFAULT_BROWSER_TTL_SECONDS = 30;
const DEFAULT_STALE_SECONDS = 300;
const DEFAULT_STALE_FALLBACK_SECONDS = 30 * 60;
const SUPABASE_FETCH_TIMEOUT_MS = 2500;
const SUPABASE_TRANSIENT_STATUS_RETRIES = 2;
const SUPABASE_TRANSIENT_RETRY_DELAY_MS = 50;
const TRANSIENT_UPSTREAM_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524, 544]);
const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": 'camera=(self "https://meet.jit.si"), microphone=(self "https://meet.jit.si"), display-capture=(self "https://meet.jit.si"), autoplay=(self "https://meet.jit.si"), geolocation=(self)',
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Cross-Origin-Resource-Policy": "same-origin",
} as const;

export class SupabaseTransientError extends Error {
  constructor(message: string, public readonly path: string, public readonly status?: number) {
    super(message);
    this.name = "SupabaseTransientError";
  }
}

export function isSupabaseTransientError(error: unknown): error is SupabaseTransientError {
  return error instanceof SupabaseTransientError;
}

type CacheOptions = {
  edgeTtlSeconds?: number;
  browserTtlSeconds?: number;
  staleSeconds?: number;
  staleFallbackSeconds?: number;
};

type SupabaseFetchOptions = {
  failOnTransient?: boolean;
  transientStatusRetries?: number;
  retryDelayMs?: number;
};

function applyCacheHeaders(headers: Headers, cache: CacheOptions, force = false): void {
  const browserTtl = cache.browserTtlSeconds ?? DEFAULT_BROWSER_TTL_SECONDS;
  const edgeTtl = cache.edgeTtlSeconds ?? DEFAULT_EDGE_TTL_SECONDS;
  const stale = cache.staleSeconds ?? DEFAULT_STALE_SECONDS;
  if (force || !headers.has("Cache-Control")) {
    headers.set("Cache-Control", `public, max-age=${browserTtl}, stale-while-revalidate=${stale}`);
  }
  if (force || !headers.has("CDN-Cache-Control")) {
    headers.set("CDN-Cache-Control", `public, max-age=${edgeTtl}, stale-while-revalidate=${stale}`);
  }
}

function applySecurityHeaders(headers: Headers): void {
  for (const [name, value] of Object.entries(SECURITY_HEADERS)) {
    if (!headers.has(name)) headers.set(name, value);
  }
}

const inflightCacheMisses = new Map<string, Promise<Response>>();

async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit,
  timeoutMs = SUPABASE_FETCH_TIMEOUT_MS,
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function warnTransientFetchFailure(label: string, path: string, error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  console.warn(`[public-api] Supabase ${label} ${path} transiently unavailable: ${message}`);
}

function transientStatusRetryLimit(options: SupabaseFetchOptions): number {
  if (typeof options.transientStatusRetries === "number" && Number.isFinite(options.transientStatusRetries)) {
    return Math.max(0, Math.min(3, Math.floor(options.transientStatusRetries)));
  }
  return options.failOnTransient ? SUPABASE_TRANSIENT_STATUS_RETRIES : 0;
}

function transientRetryDelayMs(options: SupabaseFetchOptions): number {
  if (typeof options.retryDelayMs === "number" && Number.isFinite(options.retryDelayMs)) {
    return Math.max(0, Math.min(500, Math.floor(options.retryDelayMs)));
  }
  return SUPABASE_TRANSIENT_RETRY_DELAY_MS;
}

function sleepMs(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

export function jsonResponse(
  body: unknown,
  init: ResponseInit = {},
  cache: CacheOptions = {},
): Response {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json; charset=utf-8");
  applyCacheHeaders(headers, cache);
  applySecurityHeaders(headers);
  return new Response(JSON.stringify(body), {
    ...init,
    headers,
  });
}

export function methodNotAllowed(): Response {
  return jsonResponse(
    { error: "Method not allowed" },
    {
      status: 405,
      headers: {
        Allow: "GET",
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

export function missingRuntime(): Response {
  return jsonResponse(
    { error: "Supabase runtime is not configured" },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

export function upstreamUnavailable(): Response {
  return jsonResponse(
    { error: "Supabase upstream unavailable" },
    {
      status: 503,
      headers: {
        "Cache-Control": "no-store",
        "CDN-Cache-Control": "no-store",
      },
    },
  );
}

function staleCacheUrl(cacheKey: URL): URL {
  const key = new URL(cacheKey.toString());
  key.searchParams.set("__maiprop_stale", "1");
  return key;
}

function cacheHeaderResponse(response: Response, cacheState: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Maiprop-Cache", cacheState);
  applySecurityHeaders(headers);
  return new Response(response.clone().body, { status: response.status, headers });
}

function staleFallbackCacheSeconds(cache: CacheOptions): number {
  const requested = cache.staleFallbackSeconds;
  if (typeof requested === "number" && Number.isFinite(requested) && requested > 0) return requested;
  const edgeTtl = cache.edgeTtlSeconds ?? DEFAULT_EDGE_TTL_SECONDS;
  const stale = cache.staleSeconds ?? DEFAULT_STALE_SECONDS;
  return Math.max(DEFAULT_STALE_FALLBACK_SECONDS, edgeTtl + stale);
}

async function matchStaleFallback(cacheApi: Cache, cacheKey: URL): Promise<Response | null> {
  const stale = await cacheApi.match(new Request(staleCacheUrl(cacheKey).toString(), { method: "GET" }));
  if (!stale) return null;
  const headers = new Headers(stale.headers);
  headers.set("X-Maiprop-Cache", "STALE");
  headers.set("Warning", '110 - "Response is stale due to transient upstream failure"');
  applySecurityHeaders(headers);
  return new Response(stale.body, { status: stale.status, headers });
}

async function putFreshAndStale(
  ctx: PublicApiCtx,
  cacheApi: Cache,
  cacheRequest: Request,
  staleRequest: Request,
  outbound: Response,
  cache: CacheOptions,
): Promise<void> {
  const staleHeaders = new Headers(outbound.headers);
  const staleSeconds = staleFallbackCacheSeconds(cache);
  staleHeaders.set("Cache-Control", `public, max-age=${staleSeconds}`);
  staleHeaders.set("CDN-Cache-Control", `public, max-age=${staleSeconds}`);
  staleHeaders.set("X-Maiprop-Cache", "STALE_SEED");
  applySecurityHeaders(staleHeaders);
  const staleResponse = new Response(outbound.clone().body, {
    status: outbound.status,
    headers: staleHeaders,
  });

  const putPromise = Promise.all([
    cacheApi.put(cacheRequest, outbound.clone()),
    cacheApi.put(staleRequest, staleResponse),
  ]);
  ctx.waitUntil?.(putPromise);
}

function scheduleBackgroundRefresh(ctx: PublicApiCtx, cacheId: string, refresh: Promise<Response>): void {
  ctx.waitUntil?.(
    refresh
      .catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[public-api] background refresh for ${cacheId} failed: ${message}`);
      })
      .finally(() => {
        if (inflightCacheMisses.get(cacheId) === refresh) inflightCacheMisses.delete(cacheId);
      }),
  );
}

export async function cachedJson(
  ctx: PublicApiCtx,
  cacheKey: URL,
  producer: () => Promise<Response>,
  cache: CacheOptions = {},
): Promise<Response> {
  const cacheApi = typeof caches !== "undefined" ? caches.default : null;
  const cacheRequest = new Request(cacheKey.toString(), { method: "GET" });
  const staleRequest = new Request(staleCacheUrl(cacheKey).toString(), { method: "GET" });
  if (cacheApi) {
    const hit = await cacheApi.match(cacheRequest);
    if (hit) {
      return cacheHeaderResponse(hit, "HIT");
    }
  }

  const cacheId = cacheRequest.url;
  const produceAndCache = async (): Promise<Response> => {
    const response = await producer();
    if (cacheApi && TRANSIENT_UPSTREAM_STATUSES.has(response.status)) {
      const stale = await matchStaleFallback(cacheApi, cacheKey);
      if (stale) return stale;
    }

    const headers = new Headers(response.headers);
    if (response.ok) applyCacheHeaders(headers, cache, true);
    headers.set("X-Maiprop-Cache", cacheApi ? "MISS" : "BYPASS");
    applySecurityHeaders(headers);
    const body = await response.text();
    const outbound = new Response(body, { status: response.status, headers });

    if (cacheApi && response.ok) {
      await putFreshAndStale(ctx, cacheApi, cacheRequest, staleRequest, outbound, cache);
    }
    return outbound;
  };

  if (!cacheApi) {
    return produceAndCache();
  }

  const stale = await matchStaleFallback(cacheApi, cacheKey);
  if (stale) {
    let refresh = inflightCacheMisses.get(cacheId);
    if (!refresh) {
      refresh = produceAndCache();
      inflightCacheMisses.set(cacheId, refresh);
      scheduleBackgroundRefresh(ctx, cacheId, refresh);
    } else {
      scheduleBackgroundRefresh(ctx, cacheId, refresh);
    }
    return stale;
  }

  const existing = inflightCacheMisses.get(cacheId);
  if (existing) {
    const response = await existing;
    const cacheState = response.headers.get("X-Maiprop-Cache") === "STALE" ? "STALE" : "COALESCED";
    return cacheHeaderResponse(response, cacheState);
  }

  const pending = produceAndCache();
  inflightCacheMisses.set(cacheId, pending);
  try {
    const response = await pending;
    return response.clone();
  } finally {
    inflightCacheMisses.delete(cacheId);
  }
}

export async function supabaseJson<T>(
  env: PublicApiEnv,
  path: string,
  searchParams: URLSearchParams,
  options: SupabaseFetchOptions = {},
): Promise<T[]> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("missing-runtime");

  const url = new URL(path, runtime.url);
  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }

  const retryLimit = transientStatusRetryLimit(options);
  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        headers: {
          apikey: runtime.key,
          Authorization: `Bearer ${runtime.key}`,
          Accept: "application/json",
        },
        cf: { cacheTtl: DEFAULT_EDGE_TTL_SECONDS, cacheEverything: true } as RequestInitCfProperties,
      });
    } catch (error) {
      if (options.failOnTransient) {
        throw new SupabaseTransientError("Supabase request timed out", path);
      }
      warnTransientFetchFailure("request", path, error);
      return [];
    }

    if (!res.ok) {
      if (TRANSIENT_UPSTREAM_STATUSES.has(res.status)) {
        if (attempt < retryLimit) {
          await sleepMs(transientRetryDelayMs(options));
          continue;
        }
        if (options.failOnTransient) {
          throw new SupabaseTransientError(`Supabase request failed with ${res.status}`, path, res.status);
        }
        console.warn(`[public-api] Supabase ${path} transiently unavailable with ${res.status}`);
        return [];
      }
      throw new Error(`Supabase request failed with ${res.status}`);
    }

    return (await res.json()) as T[];
  }
}

export async function supabaseCount(
  env: PublicApiEnv,
  path: string,
  searchParams: URLSearchParams,
  options: SupabaseFetchOptions = {},
): Promise<number> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("missing-runtime");

  const url = new URL(path, runtime.url);
  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }

  const retryLimit = transientStatusRetryLimit(options);
  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        method: "HEAD",
        headers: {
          apikey: runtime.key,
          Authorization: `Bearer ${runtime.key}`,
          Accept: "application/json",
          Prefer: "count=exact",
        },
        cf: { cacheTtl: DEFAULT_EDGE_TTL_SECONDS, cacheEverything: true } as RequestInitCfProperties,
      });
    } catch (error) {
      if (options.failOnTransient) {
        throw new SupabaseTransientError("Supabase count request timed out", path);
      }
      warnTransientFetchFailure("count", path, error);
      return 0;
    }

    if (!res.ok) {
      if (TRANSIENT_UPSTREAM_STATUSES.has(res.status)) {
        if (attempt < retryLimit) {
          await sleepMs(transientRetryDelayMs(options));
          continue;
        }
        if (options.failOnTransient) {
          throw new SupabaseTransientError(`Supabase count failed with ${res.status}`, path, res.status);
        }
        console.warn(`[public-api] Supabase count ${path} transiently unavailable with ${res.status}`);
        return 0;
      }
      throw new Error(`Supabase count failed with ${res.status}`);
    }

    const rangeParts = res.headers.get("Content-Range")?.split("/") ?? [];
    const total = Number(rangeParts[rangeParts.length - 1]);
    return Number.isFinite(total) ? total : 0;
  }
}

export function normalizedCacheUrl(requestUrl: URL, namespace: string, params: URLSearchParams): URL {
  const key = new URL(`/api/public/${namespace}`, requestUrl.origin);
  const ordered = [...params.entries()].sort(([aKey, aVal], [bKey, bVal]) => {
    const keyCompare = aKey.localeCompare(bKey);
    return keyCompare || aVal.localeCompare(bVal);
  });
  for (const [name, value] of ordered) key.searchParams.append(name, value);
  return key;
}

export function safeInt(value: string | null, fallback: number, min: number, max: number): number {
  if (!value || !/^\d+$/.test(value)) return fallback;
  return Math.min(max, Math.max(min, Number(value)));
}

export function safeDecimal(value: string | null): string | null {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value)) return null;
  return value;
}

export function safeToken<const T extends readonly string[]>(value: string | null, allowed: T): T[number] | null {
  if (!value) return null;
  return allowed.includes(value) ? value as T[number] : null;
}

export function safeText(value: string | null, maxLength = 80): string | null {
  if (!value) return null;
  const compact = value.replace(/[%*]/g, "").trim();
  if (!compact || compact.length > maxLength) return null;
  return compact;
}
