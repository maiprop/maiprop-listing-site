/**
 * Dynamic sitemap generator — serves /sitemap-dynamic.xml
 * Queries all public listings, auctions, open houses, and new builds,
 * then emits a sitemap index that references both this dynamic set
 * and the static sitemap already served from /sitemap-static.xml.
 *
 * Crawlers hit: GET https://<project>.supabase.co/functions/v1/sitemap
 * Netlify redirect rewrites that to GET /sitemap.xml (or sitemap-dynamic.xml)
 *
 * verify_jwt = false — crawlers don't carry auth tokens.
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SITE = "https://maiprop.co";
const MAX_ROWS = 5000; // hard cap per sitemap spec (≤ 50k URLs / 50 MB)

const XML_HEADER = `<?xml version="1.0" encoding="UTF-8"?>\n`;

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

Deno.serve(async (_req: Request) => {
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Fetch all public listings in one query
    const { data: listings, error } = await supabase
      .from("listings")
      .select("id, listing_type, updated_at")
      .eq("status", "active")
      .order("updated_at", { ascending: false })
      .limit(MAX_ROWS);

    if (error) throw error;

    const rows = listings ?? [];

    const entries = rows.map((row: { id: string; listing_type: string; updated_at: string }) => {
      // Route mapping mirrors App.tsx:
      //   auction    → /auction/:id
      //   open_house → /open-house/:id
      //   new_build  → /new-build/:id
      //   everything else → /property/:id
      let segment: string;
      if (row.listing_type === "auction") segment = "auction";
      else if (row.listing_type === "open_house") segment = "open-house";
      else if (row.listing_type === "new_build") segment = "new-build";
      else segment = "property";

      return urlEntry(`/${segment}/${row.id}`, row.updated_at, "0.8");
    });

    const xml =
      XML_HEADER +
      `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
      entries.join("\n") +
      `\n</urlset>\n`;

    return new Response(xml, {
      headers: {
        "Content-Type": "application/xml; charset=utf-8",
        "Cache-Control": "public, max-age=3600, s-maxage=3600",
      },
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Internal error";
    return new Response(`<!-- sitemap error: ${msg} -->`, {
      status: 500,
      headers: { "Content-Type": "application/xml" },
    });
  }
});
