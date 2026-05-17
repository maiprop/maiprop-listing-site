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
  const listings = await fetchListingPage(ctx.env, requestUrl);
  const canonicalUrl = "https://maiprop.co/listings";

  const enriched = injectSeoHead(html, {
    title: "Properties for Sale & Rent in Greece - mAI prop",
    description: "Search properties for sale and rent across Greece. Filter by city, type, price and more.",
    canonicalUrl,
    jsonLd: itemListJsonLd(listings, canonicalUrl, "Properties for Sale & Rent in Greece"),
  });

  const headers = new Headers(index.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  return new Response(enriched, { status: 200, headers });
};
