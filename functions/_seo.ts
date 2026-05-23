type AssetFetcher = {
  fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response>;
};

export interface SeoEnv {
  ASSETS?: AssetFetcher;
  SUPABASE_PROJECT_ID?: string;
  VITE_SUPABASE_PROJECT_ID?: string;
  SUPABASE_URL?: string;
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_PROJECT_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  VITE_SUPABASE_ANON_KEY?: string;
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
  is_pre_sale?: boolean | null;
  construction_status?: string | null;
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
  "is_pre_sale",
  "construction_status",
  "updated_at",
].join(",");

const BASE_TITLE = "mAI prop - Greek Real Estate";
const BASE_DESCRIPTION =
  "Buy, rent, or sell property in Greece. AI-powered listings, Greek auctions, Firesale instant offers, and verified professionals - all in one place.";
const DEFAULT_LISTING_TYPES = ["sale", "rent", "firesale"] as const;
const ALLOWED_LISTING_TYPES = ["sale", "rent", "firesale", "auction", "open_house"] as const;
const ALLOWED_PROPERTY_TYPES = ["apartment", "house", "villa", "land", "commercial", "office"] as const;
const HEAD_CLOSE_TAG = "</head>";
const DIGIT_CHARS = ["01234", "56789"].join("");
const LOWER_ALPHANUMERIC_CHARS = ["abcde", "fghij", "klmno", "pqrst", "uvwxyz", DIGIT_CHARS].join("");
const SAFE_TOKEN_CHARS = [
  LOWER_ALPHANUMERIC_CHARS,
  ["ABCDE", "FGHIJ", "KLMNO", "PQRST", "UVWXYZ"].join(""),
  "-_",
].join("");

type SupabaseRuntime = { url: string; key: string };
type TagReplacement = {
  tagName: string;
  attrs: Record<string, string>;
  replacement: string;
};

function usesOnlyChars(value: string, allowedChars: string): boolean {
  if (!value) return false;
  for (const char of value) {
    if (!allowedChars.includes(char)) return false;
  }
  return true;
}

function isLowerAlphaNumeric(value: string, expectedLength: number): boolean {
  return value.length === expectedLength && usesOnlyChars(value, LOWER_ALPHANUMERIC_CHARS);
}

function isDigits(value: string): boolean {
  return usesOnlyChars(value, DIGIT_CHARS);
}

function isSafeToken(value: string, maxLength: number): boolean {
  return value.length <= maxLength && usesOnlyChars(value, SAFE_TOKEN_CHARS);
}

export function getSupabaseRuntime(env: SeoEnv): SupabaseRuntime | null {
  const projectId = getSupabaseProjectId(env);
  const key = env.SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY;
  if (!projectId || !key) return null;
  return { url: `https://${projectId}.supabase.co`, key };
}

export function getSupabaseProjectId(env: SeoEnv): string | null {
  const candidates = [
    env.SUPABASE_PROJECT_ID,
    env.VITE_SUPABASE_PROJECT_ID,
    projectIdFromSupabaseUrl(env.SUPABASE_URL),
    projectIdFromSupabaseUrl(env.VITE_SUPABASE_URL),
    projectIdFromSupabaseUrl(env.VITE_SUPABASE_PROJECT_URL),
  ];
  return candidates.find((candidate): candidate is string => Boolean(candidate && isLowerAlphaNumeric(candidate, 20))) ?? null;
}

function projectIdFromSupabaseUrl(value?: string): string | null {
  if (!value) return null;
  try {
    const hostname = new URL(value).hostname;
    const suffix = ".supabase.co";
    if (!hostname.endsWith(suffix)) return null;
    return hostname.slice(0, -suffix.length);
  } catch {
    return null;
  }
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
    .split("&")
    .join("&amp;")
    .split("<")
    .join("&lt;")
    .split(">")
    .join("&gt;")
    .split('"')
    .join("&quot;");
}

function compactText(value: string, fallback: string): string {
  let compacted = "";
  let previousWasSpace = false;
  for (const char of value) {
    if (char.trim() === "") {
      if (compacted && !previousWasSpace) compacted += " ";
      previousWasSpace = true;
    } else {
      compacted += char;
      previousWasSpace = false;
    }
  }
  const trimmed = compacted.trim();
  return trimmed || fallback;
}

function absoluteUrl(path: string): string {
  return `https://maiprop.co${path}`;
}

function formatPrice(price: number): string {
  return Number.isFinite(price) ? `EUR ${price.toLocaleString("en-US")}` : "Price on request";
}

function insertBeforeHeadClose(html: string, replacement: string): string {
  return html.replace(HEAD_CLOSE_TAG, `${replacement}\n${HEAD_CLOSE_TAG}`);
}

function findTag(html: string, tagName: string, attrs: Record<string, string>): { start: number; end: number } | null {
  const lowerHtml = html.toLowerCase();
  const tagOpen = ["<", tagName.toLowerCase()].join("");
  let cursor = 0;
  while (cursor < lowerHtml.length) {
    const start = lowerHtml.indexOf(tagOpen, cursor);
    if (start === -1) return null;
    const openEnd = lowerHtml.indexOf(">", start);
    if (openEnd === -1) return null;
    const rawTag = lowerHtml.slice(start, openEnd + 1);
    const matches = Object.entries(attrs).every(([name, value]) => {
      const loweredName = name.toLowerCase();
      const loweredValue = value.toLowerCase();
      const doubleQuoted = [loweredName, '="', loweredValue, '"'].join("");
      const singleQuoted = [loweredName, "='", loweredValue, "'"].join("");
      return rawTag.includes(doubleQuoted) || rawTag.includes(singleQuoted);
    });
    if (matches) return { start, end: openEnd + 1 };
    cursor = openEnd + 1;
  }
  return null;
}

function htmlAttrs(attrs: Record<string, string>): string {
  return Object.entries(attrs)
    .map(([name, value]) => [" ", name, '="', htmlEscape(value), '"'].join(""))
    .join("");
}

function voidTag(tagName: string, attrs: Record<string, string>): string {
  return ["<", tagName, htmlAttrs(attrs), ">"].join("");
}

function normalTag(tagName: string, attrs: Record<string, string>, content: string): string {
  return ["<", tagName, htmlAttrs(attrs), ">", content, "</", tagName, ">"].join("");
}

function metaName(name: string, content: string): string {
  return voidTag("meta", { name, content });
}

function metaProperty(property: string, content: string): string {
  return voidTag("meta", { property, content });
}

function scriptJsonLd(data: unknown): string {
  const payload = JSON.stringify(data) ?? "null";
  return normalTag("script", { type: "application/ld+json" }, payload.split("<").join("\\u003c"));
}

export function listingDetailPath(listing: SeoListing): string {
  if (listing.is_pre_sale || listing.construction_status) return `/new-build/${listing.id}`;
  if (listing.listing_type === "auction") return `/auction/${listing.id}`;
  return `/property/${listing.id}`;
}

function normalizeListingType(raw: string | null | undefined): (typeof ALLOWED_LISTING_TYPES)[number] | null {
  if (!raw) return null;
  return ALLOWED_LISTING_TYPES.includes(raw as (typeof ALLOWED_LISTING_TYPES)[number])
    ? (raw as (typeof ALLOWED_LISTING_TYPES)[number])
    : null;
}

function normalizePropertyType(raw: string | null | undefined): (typeof ALLOWED_PROPERTY_TYPES)[number] | null {
  if (!raw) return null;
  return ALLOWED_PROPERTY_TYPES.includes(raw as (typeof ALLOWED_PROPERTY_TYPES)[number])
    ? (raw as (typeof ALLOWED_PROPERTY_TYPES)[number])
    : null;
}

function normalizeListingId(raw: string): string | null {
  return isSafeToken(raw, 80) ? raw : null;
}

function shouldIncludeAuctions(requestUrl: URL): boolean {
  const raw = requestUrl.searchParams.get("includeAuctions");
  return raw === "true" || raw === "1";
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
  const titleTag = normalTag("title", {}, htmlEscape(title));
  const lowerHtml = out.toLowerCase();
  const titleStart = lowerHtml.indexOf("<title>");
  const titleClose = titleStart === -1 ? -1 : lowerHtml.indexOf("</title>", titleStart);

  // nosemgrep -- titleTag is escaped with htmlEscape; out is the trusted Pages app shell.
  out =
    titleStart === -1 || titleClose === -1
      ? insertBeforeHeadClose(out, titleTag)
      : [out.slice(0, titleStart), titleTag, out.slice(titleClose + "</title>".length)].join(""); // nosemgrep
  const tagReplacements: TagReplacement[] = [
    {
      tagName: "meta",
      attrs: { name: "description" },
      replacement: metaName("description", description),
    },
    {
      tagName: "meta",
      attrs: { property: "og:title" },
      replacement: metaProperty("og:title", title),
    },
    {
      tagName: "meta",
      attrs: { property: "og:description" },
      replacement: metaProperty("og:description", description),
    },
    {
      tagName: "meta",
      attrs: { property: "og:url" },
      replacement: metaProperty("og:url", opts.canonicalUrl),
    },
    {
      tagName: "meta",
      attrs: { property: "og:image" },
      replacement: metaProperty("og:image", imageUrl),
    },
    {
      tagName: "meta",
      attrs: { name: "twitter:title" },
      replacement: metaName("twitter:title", title),
    },
    {
      tagName: "meta",
      attrs: { name: "twitter:description" },
      replacement: metaName("twitter:description", description),
    },
    {
      tagName: "meta",
      attrs: { name: "twitter:image" },
      replacement: metaName("twitter:image", imageUrl),
    },
    {
      tagName: "link",
      attrs: { rel: "canonical" },
      replacement: voidTag("link", { rel: "canonical", href: opts.canonicalUrl }),
    },
  ];

  for (const tagReplacement of tagReplacements) {
    const match = findTag(out, tagReplacement.tagName, tagReplacement.attrs);
    out = match
      ? [out.slice(0, match.start), tagReplacement.replacement, out.slice(match.end)].join("")
      : insertBeforeHeadClose(out, tagReplacement.replacement);
  }

  const extraTags = [opts.jsonLd ? scriptJsonLd(opts.jsonLd) : ""].filter(Boolean);

  return out.replace(HEAD_CLOSE_TAG, ["<!-- maiprop-seo -->", extraTags.join("\n"), HEAD_CLOSE_TAG].join("\n"));
}

export function listingDescription(listing: SeoListing): string {
  if (listing.description) return listing.description.slice(0, 160);
  const type = listing.property_type?.split("_").join(" ") || "Property";
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
      const path = listingDetailPath(listing);
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
  const listingId = normalizeListingId(id);
  if (!listingId) return null;

  const url = new URL("/rest/v1/listings", runtime.url);
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.set("id", `eq.${listingId}`);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("limit", "1");

  const rows = await fetchSupabaseListings(runtime, url);
  return rows[0] ?? null;
}

async function fetchSupabaseListings(runtime: SupabaseRuntime, url: URL): Promise<SeoListing[]> {
  // nosemgrep: javascript.lang.security.audit.detect-non-literal-fetch.detect-non-literal-fetch -- The origin is built only from a validated Supabase project ref; request values are encoded as query params.
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

export async function fetchListingPage(
  env: SeoEnv,
  requestUrl: URL,
  opts: { listingType?: string; limit?: number } = {},
): Promise<SeoListing[]> {
  const runtime = getSupabaseRuntime(env);
  if (!runtime) return [];

  const url = new URL("/rest/v1/listings", runtime.url);
  url.searchParams.set("select", SELECT_FIELDS);
  url.searchParams.set("status", "eq.active");
  url.searchParams.set("limit", String(opts.limit ?? 12));
  url.searchParams.set("order", "is_featured.desc,priority_placement.desc,updated_at.desc");

  const listingType = normalizeListingType(opts.listingType ?? requestUrl.searchParams.get("listing_type"));
  if (listingType) {
    url.searchParams.set("listing_type", `eq.${listingType}`);
  } else if (!shouldIncludeAuctions(requestUrl)) {
    url.searchParams.set("listing_type", `in.(${DEFAULT_LISTING_TYPES.join(",")})`);
  }

  const city = requestUrl.searchParams.get("city");
  if (city) url.searchParams.set("city", `ilike.*${city.split("*").join("")}*`);

  const propertyType = normalizePropertyType(requestUrl.searchParams.get("type"));
  if (propertyType) url.searchParams.set("property_type", `eq.${propertyType}`);

  const min = requestUrl.searchParams.get("price_min");
  if (min && isDigits(min)) url.searchParams.set("price", `gte.${min}`);

  return fetchSupabaseListings(runtime, url);
}
