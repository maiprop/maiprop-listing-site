/**
 * Cloudflare Pages Function: GET /sitemap-dynamic.xml
 *
 * Proxies to the Supabase Edge Function that generates a fresh sitemap from
 * listings data. Mirrors the previous Netlify `[[redirects]]` rule in
 * netlify.toml with `status = 200` (internal rewrite, client sees
 * maiprop.co/sitemap-dynamic.xml).
 *
 * Required env binding (configure in Cloudflare Pages → project → Settings → Environment Variables):
 *   - SUPABASE_PROJECT_ID: e.g. "abcdefghijklmnop"
 *
 * If the env var is missing or the upstream call fails, falls back to the
 * static /sitemap.xml bundled with the site so crawlers never see a 5xx.
 */

interface Env {
  SUPABASE_PROJECT_ID?: string;
}

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

const SITEMAP_UPSTREAM_TIMEOUT_MS = 2500;
const SITEMAP_CACHE_VERSION = "sitemap-dynamic-v1";
const SITEMAP_BROWSER_TTL_SECONDS = 600;
const SITEMAP_EDGE_TTL_SECONDS = 600;
const SITEMAP_STALE_SECONDS = 3600;

const inflightSitemaps = new Map<string, Promise<Response>>();

function edgeCache(): EdgeCache | null {
  const runtime = globalThis as typeof globalThis & { caches?: { default?: EdgeCache } };
  return runtime.caches?.default ?? null;
}

function sitemapCacheRequest(requestUrl: URL): Request {
  const cacheUrl = new URL("/sitemap-dynamic.xml", requestUrl.origin);
  cacheUrl.searchParams.set("v", SITEMAP_CACHE_VERSION);
  return new Request(cacheUrl.toString(), { method: "GET" });
}

function cacheControlHeader(): string {
  return [
    "public",
    `max-age=${SITEMAP_BROWSER_TTL_SECONDS}`,
    `s-maxage=${SITEMAP_EDGE_TTL_SECONDS}`,
    `stale-while-revalidate=${SITEMAP_STALE_SECONDS}`,
  ].join(", ");
}

function cdnCacheControlHeader(): string {
  return [
    "public",
    `max-age=${SITEMAP_EDGE_TTL_SECONDS}`,
    `stale-while-revalidate=${SITEMAP_STALE_SECONDS}`,
  ].join(", ");
}

function xmlResponse(body: BodyInit | null, cacheState: string): Response {
  return new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": cacheControlHeader(),
      "CDN-Cache-Control": cdnCacheControlHeader(),
      "X-Maiprop-Cache": cacheState,
    },
  });
}

function withCacheState(response: Response, cacheState: string): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Maiprop-Cache", cacheState);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function staticSitemap(ctx: Parameters<PagesFunction<Env>>[0]): Promise<Response> {
  const fallback = await fetch(new URL("/sitemap.xml", ctx.request.url).toString());
  return xmlResponse(await fallback.text(), "FALLBACK");
}

async function freshSitemap(ctx: Parameters<PagesFunction<Env>>[0], projectId: string | undefined): Promise<Response> {
  if (!projectId) {
    return staticSitemap(ctx);
  }

  const upstream = `https://${projectId}.supabase.co/functions/v1/sitemap`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SITEMAP_UPSTREAM_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(upstream, {
        headers: {
          "X-Forwarded-Host": "maiprop.co",
          Accept: "application/xml, text/xml;q=0.9, */*;q=0.5",
        },
        // Keep Cloudflare's native edge cache request too; explicit Cache API
        // handling below protects local/preview runtimes and coalesces misses.
        cf: { cacheTtl: SITEMAP_EDGE_TTL_SECONDS, cacheEverything: true } as RequestInitCfProperties,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new Error(`Upstream sitemap returned ${res.status}`);
    }

    return xmlResponse(await res.text(), "MISS");
  } catch {
    // Graceful fallback to static sitemap so crawlers still get something.
    return staticSitemap(ctx);
  }
}

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const projectId = ctx.env.SUPABASE_PROJECT_ID;
  const requestUrl = new URL(ctx.request.url);
  const cache = edgeCache();
  const cacheRequest = sitemapCacheRequest(requestUrl);

  if (cache) {
    const cached = await cache.match(cacheRequest);
    if (cached) return withCacheState(cached, "HIT");
  }

  const cacheId = cacheRequest.url;
  const existing = inflightSitemaps.get(cacheId);
  if (existing) {
    return withCacheState((await existing).clone(), "COALESCED");
  }

  const pending = freshSitemap(ctx, projectId);
  inflightSitemaps.set(cacheId, pending);
  try {
    const response = await pending;
    if (cache && response.ok) {
      ctx.waitUntil?.(
        cache.put(cacheRequest, response.clone()).catch((error) => {
          const message = error instanceof Error ? error.message : String(error);
          console.warn(`[sitemap] Edge cache write failed: ${message}`);
        }),
      );
    }
    return response.clone();
  } finally {
    if (inflightSitemaps.get(cacheId) === pending) inflightSitemaps.delete(cacheId);
  }
};
