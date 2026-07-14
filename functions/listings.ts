import {
  fetchIndexHtml,
  fetchListingPage,
  injectSeoHead,
  itemListJsonLd,
  CANONICAL_ORIGIN,
  type SeoEnv,
} from "./_seo";

type EdgeCache = {
  match(request: Request): Promise<Response | undefined>;
  put(request: Request, response: Response): Promise<void>;
};

const LISTINGS_HTML_CACHE_VERSION = "listings-html-v2-bounded-upstream";
const LISTINGS_HTML_BROWSER_TTL_SECONDS = 60;
const LISTINGS_HTML_EDGE_TTL_SECONDS = 300;
const LISTINGS_HTML_STALE_SECONDS = 600;
const LISTINGS_HTML_CACHE_READ_BUDGET_MS = 100;
const LISTINGS_HTML_SEO_BUDGET_MS = 350;
const CACHE_KEY_SEARCH_PARAMS = ["city", "includeAuctions", "listing_type", "price_min", "type"] as const;

function nowMs(): number {
  return typeof performance !== "undefined" && typeof performance.now === "function" ? performance.now() : Date.now();
}

function timingMetric(name: string, durationMs: number, desc?: string): string {
  const duration = Math.max(0, durationMs).toFixed(1);
  return desc ? `${name};desc="${desc}";dur=${duration}` : `${name};dur=${duration}`;
}

async function timed<T>(timings: string[], name: string, work: () => Promise<T>): Promise<T> {
  const started = nowMs();
  try {
    return await work();
  } finally {
    timings.push(timingMetric(name, nowMs() - started));
  }
}

function edgeCache(): EdgeCache | null {
  const runtime = globalThis as typeof globalThis & { caches?: { default?: EdgeCache } };
  return runtime.caches?.default ?? null;
}

function listingsHtmlCacheRequest(requestUrl: URL): Request {
  const cacheUrl = new URL("/listings", requestUrl.origin);
  cacheUrl.searchParams.set("v", LISTINGS_HTML_CACHE_VERSION);

  for (const name of CACHE_KEY_SEARCH_PARAMS) {
    const value = requestUrl.searchParams.get(name);
    if (value && value.length <= 120) cacheUrl.searchParams.set(name, value);
  }

  return new Request(cacheUrl.toString(), { method: "GET" });
}

function cacheControlHeader(): string {
  return [
    "public",
    `max-age=${LISTINGS_HTML_BROWSER_TTL_SECONDS}`,
    `s-maxage=${LISTINGS_HTML_EDGE_TTL_SECONDS}`,
    `stale-while-revalidate=${LISTINGS_HTML_STALE_SECONDS}`,
  ].join(", ");
}

function cdnCacheControlHeader(): string {
  return [
    "public",
    `max-age=${LISTINGS_HTML_EDGE_TTL_SECONDS}`,
    `stale-while-revalidate=${LISTINGS_HTML_STALE_SECONDS}`,
  ].join(", ");
}

function withCacheHitHeaders(cached: Response, serverTiming: string): Response {
  const headers = new Headers(cached.headers);
  headers.set("X-Maiprop-Cache", "HIT");
  headers.set("Server-Timing", serverTiming);
  return new Response(cached.body, {
    status: cached.status,
    statusText: cached.statusText,
    headers,
  });
}

async function matchEdgeCacheWithinBudget(
  cache: EdgeCache,
  request: Request,
): Promise<{ response?: Response; timedOut: boolean }> {
  const matchPromise = Promise.resolve()
    .then(() => cache.match(request))
    .then((response) => ({ response, timedOut: false }))
    .catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[listings] Edge HTML cache read failed: ${message}`);
      return { response: undefined, timedOut: false };
    });

  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ response?: Response; timedOut: boolean }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ response: undefined, timedOut: true }),
      LISTINGS_HTML_CACHE_READ_BUDGET_MS,
    );
  });

  try {
    return await Promise.race([matchPromise, timeoutPromise]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

async function withinSeoBudget<T>(
  timings: string[],
  work: Promise<T>,
  fallback: T,
): Promise<T> {
  const started = nowMs();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeoutId = setTimeout(
      () => resolve({ value: fallback, timedOut: true }),
      LISTINGS_HTML_SEO_BUDGET_MS,
    );
  });
  const workPromise = work.then((value) => ({ value, timedOut: false }));

  try {
    const result = await Promise.race([workPromise, timeoutPromise]);
    timings.push(timingMetric("seo", nowMs() - started, result.timedOut ? "TIMEOUT" : undefined));
    return result.value;
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
}

export const onRequestGet: PagesFunction<SeoEnv> = async (ctx) => {
  const started = nowMs();
  const timings: string[] = [];
  const requestUrl = new URL(ctx.request.url);
  const cache = edgeCache();
  const cacheRequest = listingsHtmlCacheRequest(requestUrl);

  if (cache) {
    const cacheStarted = nowMs();
    const cacheResult = await matchEdgeCacheWithinBudget(cache, cacheRequest);
    const cacheState = cacheResult.timedOut ? "TIMEOUT" : cacheResult.response ? "HIT" : "MISS";
    const cacheTiming = timingMetric("cache", nowMs() - cacheStarted, cacheState);
    if (cacheResult.response) {
      return withCacheHitHeaders(cacheResult.response, [cacheTiming, timingMetric("total", nowMs() - started)].join(", "));
    }
    timings.push(cacheTiming);
  } else {
    timings.push(timingMetric("cache", 0, "BYPASS"));
  }

  const indexPromise = timed(timings, "index", () => fetchIndexHtml(ctx));
  const listingsWork = fetchListingPage(ctx.env, requestUrl).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(`[listings] SEO listing fetch failed: ${message}`);
    return [];
  });
  const listingsPromise = withinSeoBudget(timings, listingsWork, []);

  const index = await indexPromise;
  if (!index.ok) return index;
  const [html, listings] = await Promise.all([index.text(), listingsPromise]);
  const canonicalUrl = `${CANONICAL_ORIGIN}/listings`;

  const enriched = injectSeoHead(html, {
    title: "Properties for Sale & Rent in Greece - mAI prop",
    description: "Search properties for sale and rent across Greece. Filter by city, type, price and more.",
    canonicalUrl,
    jsonLd: itemListJsonLd(listings, canonicalUrl, "Properties for Sale & Rent in Greece"),
  });

  const headers = new Headers(index.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", cacheControlHeader());
  headers.set("CDN-Cache-Control", cdnCacheControlHeader());
  headers.set("X-Maiprop-Cache", cache ? "MISS" : "BYPASS");
  headers.set("Server-Timing", [...timings, timingMetric("total", nowMs() - started)].join(", "));

  const response = new Response(enriched, { status: index.status, headers });
  if (cache && response.ok) {
    const cachePut = cache.put(cacheRequest, response.clone()).catch((error) => {
      const message = error instanceof Error ? error.message : String(error);
      console.warn(`[listings] Edge HTML cache write failed: ${message}`);
    });
    ctx.waitUntil(cachePut);
  }

  return response;
};
