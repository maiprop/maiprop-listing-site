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

const SITEMAP_UPSTREAM_TIMEOUT_MS = 2500;

export const onRequestGet: PagesFunction<Env> = async (ctx) => {
  const projectId = ctx.env.SUPABASE_PROJECT_ID;

  if (!projectId) {
    // Fall back to the static sitemap if the env var is not set.
    return fetch(new URL("/sitemap.xml", ctx.request.url).toString());
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
        // Use Cloudflare's edge cache for 10 minutes so we don't hammer the
        // Supabase function on every crawl.
        cf: { cacheTtl: 600, cacheEverything: true } as RequestInitCfProperties,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    if (!res.ok) {
      throw new Error(`Upstream sitemap returned ${res.status}`);
    }

    // Re-emit the response with explicit XML content-type and short cache.
    return new Response(res.body, {
      status: 200,
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=600, s-maxage=600",
      },
    });
  } catch {
    // Graceful fallback to static sitemap so crawlers still get something.
    return fetch(new URL("/sitemap.xml", ctx.request.url).toString());
  }
};
