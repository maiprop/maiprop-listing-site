/**
 * Dynamic sitemap generator - serves /sitemap-dynamic.xml
 * Queries all public listings, auctions, open houses, and new builds,
 * then emits a sitemap index that references both this dynamic set
 * and the static sitemap already served from /sitemap-static.xml.
 *
 * Crawlers hit: GET https://<project>.supabase.co/functions/v1/sitemap
 * Netlify redirect rewrites that to GET /sitemap.xml (or sitemap-dynamic.xml)
 *
 * verify_jwt = false - crawlers don't carry auth tokens.
 */

import { createClient } from "npm:@supabase/supabase-js@2.57.2";

const SITE = "https://maiprop.co";
const MAX_ROWS = 500; // Keep crawler traffic from amplifying DB incidents.
const SITEMAP_DB_TIMEOUT_MS = 2_500;

const XML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>\n`;
const URLSET_OPEN = `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n`;
const URLSET_CLOSE = `</urlset>\n`;

function loc(path: string) {
  return `<loc>${SITE}${path}</loc>`;
}

function urlEntry(path: string, lastmod?: string, priority = "0.7") {
  return [
    "  <url>",
    `    ${loc(path)}`,
    lastmod ? `    <lastmod>${lastmod.slice(0, 10)}</lastmod>` : "",
    `    <changefreq>daily</changefreq>`,
    `    <priority>${priority}</priority>`,
    "  </url>",
  ]
    .filter(Boolean)
    .join("\n");
}

function createTimedFetch(timeoutMs = SITEMAP_DB_TIMEOUT_MS): typeof fetch {
  return async (input, init = {}) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(input, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
  };
}

function xmlComment(message: string) {
  return `  <!-- ${message.replace(/[<>&]/g, " ").replace(/--+/g, "-").slice(0, 160)} -->\n`;
}

function buildSitemapXml(entries: string[], fallbackMessage?: string) {
  return XML_HEADER +
    URLSET_OPEN +
    (fallbackMessage ? xmlComment(fallbackMessage) : "") +
    entries.join("\n") +
    (entries.length > 0 ? "\n" : "") +
    URLSET_CLOSE;
}

function sitemapResponse(xml: string, init: ResponseInit = {}) {
  const response = new Response(xml, init);
  response.headers.set("Content-Type", "text/xml; charset=utf-8");
  if (!response.headers.has("Cache-Control")) {
    response.headers.set("Cache-Control", "public, max-age=3600, s-maxage=3600");
  }
  return response;
}

function fallbackSitemapResponse() {
  return sitemapResponse(buildSitemapXml([], "Dynamic sitemap temporarily unavailable"), {
    status: 200,
    headers: {
      "Cache-Control": "public, max-age=300, s-maxage=300",
      "X-Maiprop-Sitemap-Fallback": "1",
    },
  });
}

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: { persistSession: false },
        global: { fetch: createTimedFetch() },
      },
    );

    // Fetch all public listings in one query
    const { data: listings, error } = await supabase
      .from("listings")
      .select("id, listing_type, updated_at")
      .eq("status", "active")
      .eq("is_off_market", false)
      .order("updated_at", { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw error;

    const rows = listings ?? [];

    const entries = rows.map((row: { id: string; listing_type: string; updated_at: string }) => {
      // Route mapping mirrors App.tsx:
      //   auction    -> /auction/:id
      //   open_house -> /open-house/:id
      //   new_build  -> /new-build/:id
      //   everything else -> /property/:id
      let segment: string;
      if (row.listing_type === "auction") segment = "auction";
      else if (row.listing_type === "open_house") segment = "open-house";
      else if (row.listing_type === "new_build") segment = "new-build";
      else segment = "property";

      return urlEntry(`/${segment}/${row.id}`, row.updated_at, "0.8");
    });

    return sitemapResponse(buildSitemapXml(entries));
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    console.warn(`[sitemap] Supabase unavailable; serving fallback sitemap: ${msg}`);
    return fallbackSitemapResponse();
  }
});
