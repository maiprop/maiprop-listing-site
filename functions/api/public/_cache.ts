import {
  getSupabaseRuntime,
  type SeoEnv,
} from "../../_seo";

export type PublicApiEnv = SeoEnv;

export type PublicApiCtx = Parameters<PagesFunction<PublicApiEnv>>[0];

const DEFAULT_EDGE_TTL_SECONDS = 120;
const DEFAULT_BROWSER_TTL_SECONDS = 30;
const DEFAULT_STALE_SECONDS = 300;
const DEFAULT_STALE_FALLBACK_SECONDS = 30 * 60;
const DEFAULT_CACHE_READ_TIMEOUT_MS = 100;
const SUPABASE_FETCH_TIMEOUT_MS = 2500;
const SUPABASE_TRANSIENT_STATUS_RETRIES = 2;
const SUPABASE_TRANSIENT_RETRY_DELAY_MS = 50;
const TRANSIENT_UPSTREAM_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504, 520, 522, 524, 544]);
const INFLIGHT_CACHE_MISS_TTL_MS = 10_000;
export const CACHE_VALID_UNTIL_HEADER = "X-Maiprop-Cache-Valid-Until";
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

export class PublicCatalogueSnapshotExpiredError extends Error {
  constructor() {
    super("Public catalogue snapshot expired");
    this.name = "PublicCatalogueSnapshotExpiredError";
  }
}

export function isSupabaseTransientError(error: unknown): error is SupabaseTransientError {
  return error instanceof SupabaseTransientError;
}

export function isPublicCatalogueSnapshotExpiredError(
  error: unknown,
): boolean {
  return (
    error instanceof PublicCatalogueSnapshotExpiredError ||
    (
      error instanceof Error &&
      error.message.includes("public_catalogue_publication_expired")
    )
  );
}

type CacheOptions = {
  edgeTtlSeconds?: number;
  browserTtlSeconds?: number;
  staleSeconds?: number;
  staleFallbackSeconds?: number;
  producerTimeoutMs?: number;
  cacheReadTimeoutMs?: number;
  disableCdnCache?: boolean;
};

type SupabaseFetchOptions = {
  failOnTransient?: boolean;
  transientStatusRetries?: number;
  retryDelayMs?: number;
  countStrategy?: "exact" | "planned" | "estimated";
  timeoutMs?: number;
};

export type PublicCataloguePublication = {
  publicationId: number;
  snapshotMinute: string;
  publishedAt: string;
  retainUntil: string;
  rowCount: number;
};

export type PublicCatalogueQueryRpcRow = {
  publication_id: number;
  published_at: string;
  listing_id: string;
  priority_rank: number;
  created_at: string;
  price: number;
  ai_score: number | null;
  views_count: number;
  open_house_date: string | null;
  card_payload: unknown;
};

export function publicCatalogueValidityHeaders(
  publication: Pick<PublicCataloguePublication, "retainUntil">,
  ...additionalDeadlines: Array<string | null | undefined>
): Record<string, string> {
  const deadlines = [publication.retainUntil, ...additionalDeadlines]
    .map((deadline) => typeof deadline === "string" ? Date.parse(deadline) : Number.NaN)
    .filter(Number.isFinite);
  if (deadlines.length === 0) {
    throw new Error("Catalogue response has no valid retention deadline");
  }
  return {
    [CACHE_VALID_UNTIL_HEADER]: new Date(Math.min(...deadlines)).toISOString(),
  };
}

function applyCacheHeaders(headers: Headers, cache: CacheOptions, force = false): void {
  const remainingValiditySeconds = cacheValidityRemainingSeconds(headers);
  if (remainingValiditySeconds === 0) {
    headers.set("Cache-Control", "no-store");
    headers.set("CDN-Cache-Control", "no-store");
    return;
  }

  const browserPolicy = boundedCachePolicy(
    cache.browserTtlSeconds ?? DEFAULT_BROWSER_TTL_SECONDS,
    cache.staleSeconds ?? DEFAULT_STALE_SECONDS,
    remainingValiditySeconds,
  );
  const edgePolicy = boundedCachePolicy(
    cache.edgeTtlSeconds ?? DEFAULT_EDGE_TTL_SECONDS,
    cache.staleSeconds ?? DEFAULT_STALE_SECONDS,
    remainingValiditySeconds,
  );
  if (force || !headers.has("Cache-Control")) {
    headers.set(
      "Cache-Control",
      `public, max-age=${browserPolicy.maxAge}, stale-while-revalidate=${browserPolicy.stale}`,
    );
  }
  if (cache.disableCdnCache) {
    headers.set("CDN-Cache-Control", "no-store");
  } else if (force || !headers.has("CDN-Cache-Control")) {
    headers.set(
      "CDN-Cache-Control",
      `public, max-age=${edgePolicy.maxAge}, stale-while-revalidate=${edgePolicy.stale}`,
    );
  }
}

function cacheValidityRemainingSeconds(headers: Headers): number | null {
  const rawValidUntil = headers.get(CACHE_VALID_UNTIL_HEADER);
  if (!rawValidUntil) return null;
  const validUntil = Date.parse(rawValidUntil);
  if (!Number.isFinite(validUntil)) return 0;
  return Math.max(0, Math.floor((validUntil - Date.now()) / 1_000));
}

function boundedCachePolicy(
  requestedMaxAge: number,
  requestedStale: number,
  remainingValiditySeconds: number | null,
): { maxAge: number; stale: number } {
  const normalizedMaxAge = Math.max(0, Math.trunc(requestedMaxAge));
  const normalizedStale = Math.max(0, Math.trunc(requestedStale));
  if (remainingValiditySeconds == null) {
    return { maxAge: normalizedMaxAge, stale: normalizedStale };
  }
  const maxAge = Math.min(normalizedMaxAge, remainingValiditySeconds);
  return {
    maxAge,
    stale: Math.min(
      normalizedStale,
      Math.max(0, remainingValiditySeconds - maxAge),
    ),
  };
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

function supabaseFetchTimeoutMs(options: SupabaseFetchOptions): number {
  if (typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs)) {
    return Math.max(500, Math.min(10_000, Math.floor(options.timeoutMs)));
  }
  return SUPABASE_FETCH_TIMEOUT_MS;
}

function sleepMs(ms: number): Promise<void> {
  return ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve();
}

function cacheProducerTimeoutMs(cache: CacheOptions): number | null {
  const timeout = cache.producerTimeoutMs;
  if (typeof timeout !== "number" || !Number.isFinite(timeout) || timeout <= 0) return null;
  return Math.max(100, Math.min(10_000, Math.floor(timeout)));
}

function cacheReadTimeoutMs(cache: CacheOptions): number {
  const requested = cache.cacheReadTimeoutMs;
  if (typeof requested !== "number" || !Number.isFinite(requested)) return DEFAULT_CACHE_READ_TIMEOUT_MS;
  return Math.max(5, Math.min(1_000, Math.floor(requested)));
}

async function matchCacheWithinBudget(
  cacheApi: Cache,
  request: Request,
  cache: CacheOptions,
): Promise<Response | undefined> {
  const timeoutMs = cacheReadTimeoutMs(cache);
  let matchedResponse: Response | undefined;
  let timedOut = false;
  const matchPromise = Promise.resolve()
    .then(() => cacheApi.match(request))
    .then(async (response) => {
      if (!response) return undefined;
      matchedResponse = response;
      if (timedOut) {
        await response.body?.cancel().catch(() => undefined);
        return undefined;
      }
      const body = await response.arrayBuffer();
      return new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: response.headers,
      });
    })
    .catch((error) => {
      if (timedOut) return undefined;
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[public-api] cache read failed for ${request.url}: ${message}`);
      return undefined;
    });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<undefined>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      console.warn(`[public-api] cache read exceeded ${timeoutMs}ms for ${request.url}`);
      void matchedResponse?.body?.cancel().catch(() => undefined);
      resolve(undefined);
    }, timeoutMs);
  });

  try {
    return await Promise.race([matchPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function producerWithTimeout(producer: () => Promise<Response>, cache: CacheOptions): Promise<Response> {
  const timeoutMs = cacheProducerTimeoutMs(cache);
  const producerPromise = Promise.resolve().then(producer);
  if (!timeoutMs) return producerPromise;

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutPromise = new Promise<Response>((resolve) => {
    timeoutId = setTimeout(() => {
      timedOut = true;
      resolve(upstreamUnavailable());
    }, timeoutMs);
  });

  try {
    return await Promise.race([producerPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
    if (timedOut) {
      producerPromise.catch((error) => {
        const message = error instanceof Error ? error.message : String(error);
        console.warn(`[public-api] cache producer resolved after timeout: ${message}`);
      });
    }
  }
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

function cacheHeaderResponse(response: Response, cacheState: string, cache: CacheOptions): Response {
  const headers = new Headers(response.headers);
  applyCacheHeaders(headers, cache, true);
  headers.set("X-Maiprop-Cache", cacheState);
  applySecurityHeaders(headers);
  return new Response(response.clone().body, { status: response.status, headers });
}

function staleFallbackCacheSeconds(cache: CacheOptions): number {
  const requested = cache.staleFallbackSeconds;
  if (typeof requested === "number" && Number.isFinite(requested) && requested >= 0) {
    return requested;
  }
  const edgeTtl = cache.edgeTtlSeconds ?? DEFAULT_EDGE_TTL_SECONDS;
  const stale = cache.staleSeconds ?? DEFAULT_STALE_SECONDS;
  return Math.max(DEFAULT_STALE_FALLBACK_SECONDS, edgeTtl + stale);
}

function cacheResponseIsWithinBusinessValidity(response: Response): boolean {
  const remainingValiditySeconds = cacheValidityRemainingSeconds(response.headers);
  return remainingValiditySeconds == null || remainingValiditySeconds > 0;
}

async function matchStaleFallback(cacheApi: Cache, cacheKey: URL, cache: CacheOptions): Promise<Response | null> {
  const stale = await matchCacheWithinBudget(
    cacheApi,
    new Request(staleCacheUrl(cacheKey).toString(), { method: "GET" }),
    cache,
  );
  if (!stale || !cacheResponseIsWithinBusinessValidity(stale)) return null;
  const headers = new Headers(stale.headers);
  applyCacheHeaders(headers, cache, true);
  headers.set("X-Maiprop-Cache", "STALE");
  headers.set("Warning", '110 - "Response is stale due to transient upstream failure"');
  applySecurityHeaders(headers);
  return new Response(stale.body, { status: stale.status, headers });
}

function putFreshAndStale(
  ctx: PublicApiCtx,
  cacheApi: Cache,
  cacheRequest: Request,
  staleRequest: Request,
  body: string,
  status: number,
  headers: Headers,
  cache: CacheOptions,
): Promise<void> {
  const freshHeaders = new Headers(headers);
  const staleHeaders = new Headers(headers);
  const responseCacheControl = headers.get("Cache-Control") ?? "";
  const remainingValiditySeconds = cacheValidityRemainingSeconds(headers);
  if (
    /\bno-store\b/i.test(responseCacheControl) ||
    remainingValiditySeconds === 0
  ) {
    return Promise.resolve();
  }
  const edgeSeconds = boundedCachePolicy(
    cache.edgeTtlSeconds ?? DEFAULT_EDGE_TTL_SECONDS,
    0,
    remainingValiditySeconds,
  ).maxAge;
  const staleSeconds = boundedCachePolicy(
    staleFallbackCacheSeconds(cache),
    0,
    remainingValiditySeconds,
  ).maxAge;
  if (edgeSeconds === 0) return Promise.resolve();
  freshHeaders.set("Cache-Control", `public, max-age=${edgeSeconds}`);
  freshHeaders.delete("CDN-Cache-Control");
  staleHeaders.set("Cache-Control", `public, max-age=${staleSeconds}`);
  staleHeaders.delete("CDN-Cache-Control");
  staleHeaders.set("X-Maiprop-Cache", "STALE_SEED");
  applySecurityHeaders(staleHeaders);
  const freshResponse = new Response(body, {
    status,
    headers: freshHeaders,
  });
  const staleResponse = new Response(body, {
    status,
    headers: staleHeaders,
  });

  const cacheWrites = [cacheApi.put(cacheRequest, freshResponse)];
  if (staleSeconds > 0) {
    cacheWrites.push(cacheApi.put(staleRequest, staleResponse));
  }
  const putPromise = Promise.all(cacheWrites);
  const guardedPut: Promise<void> = putPromise.then(() => undefined).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[public-api] cache seed failed for ${cacheRequest.url}: ${message}`);
  });
  ctx.waitUntil?.(guardedPut);
  return guardedPut;
}

function trackInflightCacheMiss(cacheId: string, promise: Promise<Response>): void {
  inflightCacheMisses.set(cacheId, promise);
  setTimeout(() => {
    if (inflightCacheMisses.get(cacheId) === promise) inflightCacheMisses.delete(cacheId);
  }, INFLIGHT_CACHE_MISS_TTL_MS);

  void promise.catch(() => undefined);
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
  // cachedJson owns edge caching through the Cache API. Prevent Cloudflare's
  // outer CDN cache from retaining a second, unbounded copy before this Worker
  // can enforce cache-read and producer deadlines.
  const cachePolicy: CacheOptions = cache.disableCdnCache === undefined
    ? { ...cache, disableCdnCache: true }
    : cache;
  const cacheApi = typeof caches !== "undefined" ? caches.default : null;
  const cacheRequest = new Request(cacheKey.toString(), { method: "GET" });
  const staleRequest = new Request(staleCacheUrl(cacheKey).toString(), { method: "GET" });
  const cacheSeedState: { promise: Promise<void> | null } = { promise: null };
  if (cacheApi) {
    const hit = await matchCacheWithinBudget(cacheApi, cacheRequest, cachePolicy);
    if (hit && cacheResponseIsWithinBusinessValidity(hit)) {
      return cacheHeaderResponse(hit, "HIT", cachePolicy);
    }
  }

  const cacheId = cacheRequest.url;
  const produceAndCache = async (): Promise<Response> => {
    const response = await producerWithTimeout(producer, cachePolicy);
    if (cacheApi && TRANSIENT_UPSTREAM_STATUSES.has(response.status)) {
      const stale = await matchStaleFallback(cacheApi, cacheKey, cachePolicy);
      if (stale) return stale;
    }

    const headers = new Headers(response.headers);
    if (response.ok) applyCacheHeaders(headers, cachePolicy, true);
    headers.set("X-Maiprop-Cache", cacheApi ? "MISS" : "BYPASS");
    applySecurityHeaders(headers);
    const body = await response.text();
    const outbound = new Response(body, { status: response.status, headers });

    if (cacheApi && response.ok) {
      cacheSeedState.promise = putFreshAndStale(
        ctx,
        cacheApi,
        cacheRequest,
        staleRequest,
        body,
        response.status,
        headers,
        cachePolicy,
      );
    }
    return outbound;
  };

  if (!cacheApi) {
    return produceAndCache();
  }

  const stale = await matchStaleFallback(cacheApi, cacheKey, cachePolicy);
  if (stale) {
    let refresh = inflightCacheMisses.get(cacheId);
    if (!refresh) {
      refresh = produceAndCache();
      trackInflightCacheMiss(cacheId, refresh);
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
    return cacheHeaderResponse(response, cacheState, cachePolicy);
  }

  const pending = produceAndCache();
  trackInflightCacheMiss(cacheId, pending);
  try {
    const response = await pending;
    return response.clone();
  } finally {
    const clearInflight = () => {
      if (inflightCacheMisses.get(cacheId) === pending) inflightCacheMisses.delete(cacheId);
    };
    const cacheSeed = cacheSeedState.promise;
    if (cacheSeed) {
      const clearAfterSeed = cacheSeed.finally(clearInflight);
      ctx.waitUntil?.(clearAfterSeed);
      void clearAfterSeed.catch(() => undefined);
    } else {
      clearInflight();
    }
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
      }, supabaseFetchTimeoutMs(options));
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

export async function supabaseRpcJson<T>(
  env: PublicApiEnv,
  functionName: string,
  body: Record<string, unknown>,
  options: SupabaseFetchOptions = {},
): Promise<T[]> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("missing-runtime");

  const path = `/rest/v1/rpc/${functionName}`;
  const url = new URL(path, runtime.url);
  const retryLimit = transientStatusRetryLimit(options);

  for (let attempt = 0; ; attempt += 1) {
    let res: Response;
    try {
      res = await fetchWithTimeout(url, {
        method: "POST",
        headers: {
          apikey: runtime.key,
          Authorization: `Bearer ${runtime.key}`,
          Accept: "application/json",
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      }, supabaseFetchTimeoutMs(options));
    } catch (error) {
      if (options.failOnTransient) {
        throw new SupabaseTransientError("Supabase RPC timed out", path);
      }
      warnTransientFetchFailure("RPC", path, error);
      return [];
    }

    if (!res.ok) {
      if (TRANSIENT_UPSTREAM_STATUSES.has(res.status)) {
        if (attempt < retryLimit) {
          await sleepMs(transientRetryDelayMs(options));
          continue;
        }
        if (options.failOnTransient) {
          throw new SupabaseTransientError(`Supabase RPC failed with ${res.status}`, path, res.status);
        }
        console.warn(`[public-api] Supabase ${path} transiently unavailable with ${res.status}`);
        return [];
      }
      const details = (await res.text()).slice(0, 1_000);
      throw new Error(
        `Supabase RPC failed with ${res.status}${details ? `: ${details}` : ""}`,
      );
    }

    return (await res.json()) as T[];
  }
}

export async function getPublicCataloguePublication(
  env: PublicApiEnv,
  requestedPublicationId: number | null,
): Promise<PublicCataloguePublication> {
  try {
    const rows = await supabaseRpcJson<{
      publication_id?: unknown;
      snapshot_minute?: unknown;
      published_at?: unknown;
      retain_until?: unknown;
      row_count?: unknown;
    }>(
      env,
      "get_public_catalogue_publication",
      { p_publication_id: requestedPublicationId },
      { failOnTransient: true },
    );
    const publicationId = Number(rows[0]?.publication_id);
    const snapshotMinute = rows[0]?.snapshot_minute;
    const publishedAt = rows[0]?.published_at;
    const retainUntil = rows[0]?.retain_until;
    const rowCount = Number(rows[0]?.row_count);
    if (
      !Number.isSafeInteger(publicationId) ||
      publicationId < 1 ||
      typeof snapshotMinute !== "string" ||
      !Number.isFinite(Date.parse(snapshotMinute)) ||
      typeof publishedAt !== "string" ||
      !Number.isFinite(Date.parse(publishedAt)) ||
      typeof retainUntil !== "string" ||
      !Number.isFinite(Date.parse(retainUntil)) ||
      !Number.isSafeInteger(rowCount) ||
      rowCount < 0
    ) {
      throw new Error("Catalogue publication reader returned invalid metadata");
    }
    return {
      publicationId,
      snapshotMinute: new Date(Date.parse(snapshotMinute)).toISOString(),
      publishedAt: new Date(Date.parse(publishedAt)).toISOString(),
      retainUntil: new Date(Date.parse(retainUntil)).toISOString(),
      rowCount,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("public_catalogue_publication_expired")
    ) {
      throw new PublicCatalogueSnapshotExpiredError();
    }
    throw error;
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
          Prefer: `count=${options.countStrategy ?? "exact"}`,
        },
        cf: { cacheTtl: DEFAULT_EDGE_TTL_SECONDS, cacheEverything: true } as RequestInitCfProperties,
      }, supabaseFetchTimeoutMs(options));
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
