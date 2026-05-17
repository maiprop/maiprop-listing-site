import {
  fetchIndexHtml,
  fetchListingPage,
  injectSeoHead,
  itemListJsonLd,
  type SeoEnv,
} from "./_seo";

export const onRequestGet: PagesFunction<SeoEnv> = async (ctx) => {
  const requestUrl = new URL(ctx.request.url);
  const index = await fetchIndexHtml(ctx);
  const html = await index.text();
  const listings = await fetchListingPage(ctx.env, requestUrl, { listingType: "auction" });
  const canonicalUrl = "https://maiprop.co/auctions";

  const enriched = injectSeoHead(html, {
    title: "Property Auctions in Greece - mAI prop",
    description: "Browse real-time Greek court property auctions. Filter by city, type, and bid range.",
    canonicalUrl,
    jsonLd: itemListJsonLd(listings, canonicalUrl, "Greek Property Auctions"),
  });

  const headers = new Headers(index.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  return new Response(enriched, { status: 200, headers });
};
