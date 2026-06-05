import { getSupabaseRuntime, type SeoEnv } from "../../_seo";

export type PublicApiEnv = SeoEnv;

export type PublicApiCtx = Parameters<PagesFunction<PublicApiEnv>>[0];

const DEFAULT_EDGE_TTL_SECONDS = 120;
const DEFAULT_BROWSER_TTL_SECONDS = 30;
const DEFAULT_STALE_SECONDS = 300;
const SUPABASE_FETCH_TIMEOUT_MS = 2500;
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

type CacheOptions = {
  edgeTtlSeconds?: number;
  browserTtlSeconds?: number;
  staleSeconds?: number;
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

export async function cachedJson(
  ctx: PublicApiCtx,
  cacheKey: URL,
  producer: () => Promise<Response>,
  cache: CacheOptions = {},
): Promise<Response> {
  const cacheApi = typeof caches !== "undefined" ? caches.default : null;
  const cacheRequest = new Request(cacheKey.toString(), { method: "GET" });
  if (cacheApi) {
    const hit = await cacheApi.match(cacheRequest);
    if (hit) {
      const headers = new Headers(hit.headers);
      headers.set("X-Maiprop-Cache", "HIT");
      applySecurityHeaders(headers);
      return new Response(hit.body, { status: hit.status, headers });
    }
  }

  const response = await producer();
  const headers = new Headers(response.headers);
  if (response.ok) applyCacheHeaders(headers, cache, true);
  headers.set("X-Maiprop-Cache", cacheApi ? "MISS" : "BYPASS");
  applySecurityHeaders(headers);
  const body = await response.text();
  const outbound = new Response(body, { status: response.status, headers });

  if (cacheApi && response.ok) {
    ctx.waitUntil?.(cacheApi.put(cacheRequest, outbound.clone()));
  }
  return outbound;
}

export async function supabaseJson<T>(
  env: PublicApiEnv,
  path: string,
  searchParams: URLSearchParams,
): Promise<T[]> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("missing-runtime");

  const url = new URL(path, runtime.url);
  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }

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
    warnTransientFetchFailure("request", path, error);
    return [];
  }
  if (!res.ok) {
    if (TRANSIENT_UPSTREAM_STATUSES.has(res.status)) {
      console.warn(`[public-api] Supabase ${path} transiently unavailable with ${res.status}`);
      return [];
    }
    throw new Error(`Supabase request failed with ${res.status}`);
  }
  return (await res.json()) as T[];
}

export async function supabaseCount(
  env: PublicApiEnv,
  path: string,
  searchParams: URLSearchParams,
): Promise<number> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) throw new Error("missing-runtime");

  const url = new URL(path, runtime.url);
  for (const [key, value] of searchParams) {
    url.searchParams.append(key, value);
  }

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
    warnTransientFetchFailure("count", path, error);
    return 0;
  }
  if (!res.ok) {
    if (TRANSIENT_UPSTREAM_STATUSES.has(res.status)) {
      console.warn(`[public-api] Supabase count ${path} transiently unavailable with ${res.status}`);
      return 0;
    }
    throw new Error(`Supabase count failed with ${res.status}`);
  }

  const rangeParts = res.headers.get("Content-Range")?.split("/") ?? [];
  const total = Number(rangeParts[rangeParts.length - 1]);
  return Number.isFinite(total) ? total : 0;
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
