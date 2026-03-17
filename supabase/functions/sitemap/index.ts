import { createClient } from "npm:@supabase/supabase-js@2";

const BASE_URL = "https://properties.maiprop.co";
const HREFLANG_LOCALES = ["el", "ar", "ar-AE", "zh", "zh-CN", "ru", "fr", "hi", "he", "tr"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// All static pages — kept here so no static file dependency
const STATIC_PAGES: Array<{ path: string; changefreq: string; priority: string; lastmod: string; hreflang: boolean }> = [
  { path: "/",                                      changefreq: "weekly",  priority: "1.0",  lastmod: "2026-03-09", hreflang: true },
  { path: "/greek-golden-visa/",                    changefreq: "monthly", priority: "0.9",  lastmod: "2026-03-07", hreflang: true },
  { path: "/greek-golden-visa-requirements/",       changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/250k-golden-visa-properties/",          changefreq: "weekly",  priority: "0.9",  lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-journey/",                  changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/process/",                              changefreq: "monthly", priority: "0.9",  lastmod: "2026-03-07", hreflang: true },
  { path: "/properties/",                           changefreq: "weekly",  priority: "0.85", lastmod: "2026-03-09", hreflang: true },
  { path: "/trackrecord/",                          changefreq: "monthly", priority: "0.8",  lastmod: "2026-03-07", hreflang: true },
  { path: "/guides/",                               changefreq: "weekly",  priority: "0.8",  lastmod: "2026-03-09", hreflang: true },
  { path: "/buy-the-lifestyle/",                    changefreq: "monthly", priority: "0.8",  lastmod: "2026-03-07", hreflang: true },
  { path: "/greece-vs-portugal-golden-visa/",       changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-family-included/",          changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-rental-income-properties/", changefreq: "weekly",  priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-tax-benefits/",             changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-for-investors/",            changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-for-high-net-worth/",       changefreq: "monthly", priority: "0.8",  lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-property-compliance/",      changefreq: "monthly", priority: "0.8",  lastmod: "2026-03-07", hreflang: true },
  { path: "/is-golden-visa-worth-it/",              changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/greece-vs-dubai-golden-visa/",          changefreq: "weekly",  priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/greek-golden-visa-chinese-investors/",  changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/greek-golden-visa-uae-investors/",      changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/greek-golden-visa-russian-investors/",  changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/greek-golden-visa-turkish-investors/",  changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
  { path: "/golden-visa-by-nationality/",           changefreq: "monthly", priority: "0.85", lastmod: "2026-03-07", hreflang: true },
];

function hreflangBlock(path: string): string {
  const clean = `${BASE_URL}${path}`;
  return [
    `    <xhtml:link rel="alternate" hreflang="en" href="${clean}" />`,
    `    <xhtml:link rel="alternate" hreflang="en-US" href="${clean}" />`,
    `    <xhtml:link rel="alternate" hreflang="en-GB" href="${clean}" />`,
    ...HREFLANG_LOCALES.map((l) => {
      const langCode = l.split("-")[0];
      return `    <xhtml:link rel="alternate" hreflang="${l}" href="${clean}?lang=${langCode}" />`;
    }),
    `    <xhtml:link rel="alternate" hreflang="x-default" href="${clean}" />`,
  ].join("\n");
}

function urlEntry(path: string, lastmod: string, changefreq: string, priority: string, withHreflang = false): string {
  return `  <url>
    <loc>${BASE_URL}${path}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority}</priority>${withHreflang ? "\n" + hreflangBlock(path) : ""}
  </url>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const today = new Date().toISOString().split("T")[0];

  // Fetch properties and articles in parallel
  const [{ data: properties, error: propErr }, { data: articles, error: artErr }] = await Promise.all([
    supabase
      .from("properties")
      .select("id, updated_at, status, project_type")
      .order("sort_order", { ascending: true }),
    supabase
      .from("articles")
      .select("slug, updated_at")
      .eq("published", true)
      .order("updated_at", { ascending: false }),
  ]);

  if (propErr || artErr) {
    return new Response(JSON.stringify({ error: propErr || artErr }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const getPriority = (p: { status: string; project_type: string }) => {
    if (p.status === "available") return "0.9";
    if (p.status === "booked") return "0.8";
    if (p.project_type === "delivered") return "0.6";
    return "0.7";
  };
  const getChangefreq = (p: { status: string }) =>
    p.status === "available" || p.status === "booked" ? "weekly" : "monthly";

  const staticEntries = STATIC_PAGES.map((p) =>
    urlEntry(p.path, p.lastmod, p.changefreq, p.priority, p.hreflang)
  );

  const guideEntries = (articles || []).map((a) =>
    urlEntry(
      `/guides/${a.slug}/`,
      a.updated_at ? a.updated_at.split("T")[0] : today,
      "monthly",
      "0.75",
      true
    )
  );

  const propertyEntries = (properties || []).map((p) =>
    urlEntry(
      `/property/${p.id}/`,
      p.updated_at ? p.updated_at.split("T")[0] : today,
      getChangefreq(p),
      getPriority(p),
      true
    )
  );

  const total = staticEntries.length + guideEntries.length + propertyEntries.length;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<!-- Full sitemap: ${staticEntries.length} static + ${guideEntries.length} articles + ${propertyEntries.length} properties = ${total} URLs -->
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${staticEntries.join("\n")}
${guideEntries.join("\n")}
${propertyEntries.join("\n")}
</urlset>`;

  return new Response(xml, {
    headers: {
      ...corsHeaders,
      "Content-Type": "application/xml; charset=utf-8",
      "Cache-Control": "public, max-age=3600, s-maxage=3600",
    },
  });
});
