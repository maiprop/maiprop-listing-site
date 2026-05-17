type AssetFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export interface SeoEnv {
  ASSETS?: AssetFetcher;
  SUPABASE_PROJECT_ID?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
}

export type SeoListing = {
  id: string;
  title: string;
  city: string;
  address?: string | null;
  price: number;
  sqm: number;
  bedrooms?: number | null;
  bathrooms?: number | null;
  property_type?: string | null;
  listing_type?: string | null;
  description?: string | null;
  cover_image_url?: string | null;
  updated_at?: string | null;
};

const SELECT_FIELDS = [
  "id",
  "title",
  "city",
  "address",
  "price",
  "sqm",
  "bedrooms",
  "bathrooms",
  "property_type",
  "listing_type",
  "description",
  "cover_image_url",
  "updated_at",
].join(",");

const BASE_TITLE = "mAI prop - Greek Real Estate";
const BASE_DESCRIPTION =
  "Buy, rent, or sell property in Greece. AI-powered listings, Greek auctions, Firesale instant offers, and verified professionals - all in one place.";

export function getSupabaseRuntime(env: SeoEnv): { url: string; key: string } | null {
  const projectId = env.SUPABASE_PROJECT_ID;
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!projectId || !key) return null;
  return { url: `https://${projectId}.supabase.co`, key };
}

export async function fetchIndexHtml(ctx: {
  request: Request;
  env: SeoEnv;
  next?: (input?: Request | string, init?: RequestInit) => Promise<Response>;
}): Promise<Response> {
  if (ctx.env.ASSETS) {
    return ctx.env.ASSETS.fetch(new URL("/", ctx.request.url));
  }
  if (ctx.next) return ctx.next("/");
  return new Response("", { status: 500 });
}

function htmlEscape(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function compactText(value: string, fallback: string): string {
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed || fallback;
}

function absoluteUrl(path: string): string {
  return `https://maiprop.co${path}`;
}

function formatPrice(price: number): string {
  return Number.isFinite(price) ? `EUR ${price.toLocaleString("en-US")}` : "Price on request";
}

function replaceOrInsertHead(html: string, pattern: RegExp, replacement: string): string {
  if (pattern.test(html)) return html.replace(pattern, replacement);
  return html.replace("</head>", `${replacement}\n</head>`);
}

function metaName(name: string, content: string): string {
  return `<meta name="${htmlEscape(name)}" content="${htmlEscape(content)}">`;
}

function metaProperty(property: string, content: string): string {
  return `<meta property="${htmlEscape(property)}" content="${htmlEscape(content)}">`;
}

function scriptJsonLd(data: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(data).replace(/</g, "\\u003c")}</script>`;
}

export function injectSeoHead(
  html: string,
  opts: {
    title: string;
    description: string;
    canonicalUrl: string;
    imageUrl?: string | null;
    jsonLd?: unknown;
  },
): string {
  let out = html;
  const title = compactText(opts.title, BASE_TITLE);
  const description = compactText(opts.description, BASE_DESCRIPTION);
  const imageUrl = opts.imageUrl || "https://maiprop.co/og-image.png";

  out = replaceOrInsertHead(out, /<title>[\s\S]*?<\/title>/i, `<title>${htmlEscape(title)}</title>`);
  out = replaceOrInsertHead(
    out,
    /<meta\s+name=["']description["'][^>]*>/i,
    metaName("description", description),
  );
  out = replaceOrInsertHead(
    out,
    /<meta\s+property=["']og:title["'][^>]*>/i,
    metaProperty("og:title", title),
  );
  out = replaceOrInsertHead(
    out,
    /<meta\s+property=["']og:description["'][^>]*>/i,
    metaProperty("og:description", description),
  );
  out = replaceOrInsertHead(
    out,
    /<meta\s+property=["']og:url["'][^>]*>/i,
    metaProperty("og:url", opts.canonicalUrl),
  );
  out = replaceOrInsertHead(
    out,
    /<meta\s+property=["']og:image["'][^>]*>/i,
    metaProperty("og:image", imageUrl),
  );
  out = replaceOrInsertHead(
    out,
    /<meta\s+name=["']twitter:title["'][^>]*>/i,
    metaName("twitter:title", title),
  );
  out = replaceOrInsertHead(
    out,
    /<meta\s+name=["']twitter:description["'][^>]*>/i,
    metaName("twitter:description", description),
  );
  out = replaceOrInsertHead(
    out,
    /<meta\s+name=["']twitter:image["'][^>]*>/i,
    metaName("twitter:image", imageUrl),
  );

  out = replaceOrInsertHead(
    out,
    /<link\s+rel=["']canonical["'][^>]*>/i,
    `<link rel="canonical" href="${htmlEscape(opts.canonicalUrl)}">`,
  );

  const extraTags = [opts.jsonLd ? scriptJsonLd(opts.jsonLd) : ""].filter(Boolean);

  return out.replace("</head>", `<!-- maiprop-seo -->\n${extraTags.join("\n")}\n</head>`);
}

export function listingDescription(listing: SeoListing): string {
  if (listing.description) return listing.description.slice(0, 160);
  const type = listing.property_type?.replace(/_/g, " ") || "Property";
  return `${type} in ${listing.city} - ${listing.sqm} sqm - ${formatPrice(Number(listing.price))}`;
}

export function propertyJsonLd(listing: SeoListing, canonicalUrl: string): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "RealEstateListing",
    name: listing.title,
    description: listingDescription(listing),
    url: canonicalUrl,
    image: listing.cover_image_url ? [listing.cover_image_url] : undefined,
    address: {
      "@type": "PostalAddress",
      streetAddress: listing.address ?? undefined,
      addressLocality: listing.city,
      addressCountry: "GR",
    },
    floorSize: {
      "@type": "QuantitativeValue",
      value: listing.sqm,
      unitCode: "MTK",
    },
    offers: {
      "@type": "Offer",
      price: listing.price,
      priceCurrency: "EUR",
      availability: "https://schema.org/InStock",
    },
  };
}

export function itemListJsonLd(listings: SeoListing[], canonicalUrl: string, name: string): unknown {
  return {
    "@context": "https://schema.org",
    "@type": "ItemList",
    name,
    url: canonicalUrl,
    numberOfItems: listings.length,
    itemListElement: listings.map((listing, index) => {
      const path = listing.listing_type === "auction" ? `/auction/${listing.id}` : `/property/${listing.id}`;
      return {
        "@type": "ListItem",
        position: index + 1,
        url: absoluteUrl(path),
        item: {
          "@type": "RealEstateListing",
          name: listing.title,
          description: listingDescription(listing),
          url: absoluteUrl(path),
          offers: {
            "@type": "Offer",
            price: listing.price,
            priceCurrency: "EUR",
          },
        },
      };
    }),
  };
}

export async function fetchActiveListingById(env: SeoEnv, id: string): Promise<SeoListing | null> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) return null;

  const url = new URL(`${runtime.url}/rest/v1/listings`);
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.set("id", `eq.${id}`);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("limit", "1");

  const res = await fetch(url, {
    headers: {
      apikey: runtime.key,
      Authorization: `Bearer ${runtime.key}`,
      Accept: "application/json",
    },
    cf: { cacheTtl: 300, cacheEverything: true } as RequestInitCfProperties,
  });
  if (!res.ok) return null;
  const rows = (await res.json()) as SeoListing[];
  return rows[0] ?? null;
}

export async function fetchListingPage(
  env: SeoEnv,
  requestUrl: URL,
  opts: { listingType?: string; limit?: number } = {},
): Promise<SeoListing[]> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) return [];

  const url = new URL(`${runtime.url}/rest/v1/listings`);
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("limit", String(opts.limit ?? 12));
  url.searchParams.set("order", "is_featured.desc,priority_placement.desc,updated_at.desc");
  if (opts.listingType) url.searchParams.set("listing_type", `eq.${opts.listingType}`);

  const city = requestUrl.searchParams.get("city");
  if (city) url.searchParams.set("city", `ilike.*${city.replace(/\*/g, "")}*`);

  const propertyType = requestUrl.searchParams.get("type");
  if (propertyType) url.searchParams.set("property_type", `eq.${propertyType}`);

  const min = requestUrl.searchParams.get("price_min");
  if (min && /^\d+$/.test(min)) url.searchParams.set("price", `gte.${min}`);

  const res = await fetch(url, {
    headers: {
      apikey: runtime.key,
      Authorization: `Bearer ${runtime.key}`,
      Accept: "application/json",
    },
    cf: { cacheTtl: 300, cacheEverything: true } as RequestInitCfProperties,
  });
  if (!res.ok) return [];
  return (await res.json()) as SeoListing[];
}
