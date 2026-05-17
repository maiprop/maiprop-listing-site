import {
  fetchActiveListingById,
  fetchIndexHtml,
  injectSeoHead,
  listingDetailPath,
  listingDescription,
  propertyJsonLd,
  type SeoEnv,
} from "../_seo";

export const onRequestGet: PagesFunction<SeoEnv, "id"> = async (ctx) => {
  const index = await fetchIndexHtml(ctx);
  const html = await index.text();
  const id = Array.isArray(ctx.params.id) ? ctx.params.id[0] : ctx.params.id;
  const listing = await fetchActiveListingById(ctx.env, id);

  if (!listing) {
    return new Response(html, {
      status: index.status,
      headers: index.headers,
    });
  }

  const canonicalUrl = `https://maiprop.co${listingDetailPath(listing)}`;
  const enriched = injectSeoHead(html, {
    title: `${listing.title} - mAI prop`,
    description: listingDescription(listing),
    canonicalUrl,
    imageUrl: listing.cover_image_url,
    jsonLd: propertyJsonLd(listing, canonicalUrl),
  });

  const headers = new Headers(index.headers);
  headers.set("Content-Type", "text/html; charset=utf-8");
  headers.set("Cache-Control", "public, max-age=300, s-maxage=300");
  return new Response(enriched, { status: index.status, headers });
};
