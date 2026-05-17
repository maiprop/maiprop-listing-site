import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { onRequestGet as auctionsRequest } from "./auctions";
import { onRequestGet as listingsRequest } from "./listings";
import { onRequestGet as propertyRequest } from "./property/[id]";

const realFetch = globalThis.fetch;

const htmlShell = `<!doctype html>
<html lang="en">
<head>
  <title>mAI prop - Greek Real Estate</title>
  <meta name="description" content="Base description">
  <meta property="og:title" content="Base title">
  <meta property="og:description" content="Base OG description">
  <meta property="og:url" content="https://maiprop.co/">
  <meta property="og:image" content="https://maiprop.co/base.png">
  <meta name="twitter:title" content="Base twitter">
  <meta name="twitter:description" content="Base twitter description">
  <meta name="twitter:image" content="https://maiprop.co/base.png">
</head>
<body><div id="root"></div><script type="module" src="/assets/app.js"></script></body>
</html>`;

const listing = {
  id: "listing-1",
  title: "Athens Penthouse With Acropolis View",
  city: "Athens",
  address: "1 Ermou",
  price: 450000,
  sqm: 91,
  bedrooms: 2,
  bathrooms: 2,
  property_type: "apartment",
  listing_type: "sale",
  description: "Bright penthouse in central Athens.",
  cover_image_url: "https://images.example/penthouse.jpg",
  updated_at: "2026-05-17T00:00:00Z",
};

type AnyCtx = Parameters<typeof propertyRequest>[0];

function makeCtx(url: string, params: Record<string, string> = {}): AnyCtx {
  return {
    request: new Request(url),
    params,
    env: {
      SUPABASE_PROJECT_ID: "abcdefghijklmnop",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test_key_1234567890",
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(
          new Response(htmlShell, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
        ),
      },
    },
  } as unknown as AnyCtx;
}

beforeEach(() => {
  globalThis.fetch = vi.fn().mockResolvedValue(
    new Response(JSON.stringify([listing]), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    }),
  ) as unknown as typeof fetch;
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("SEO Pages Functions", () => {
  it("injects property title, price, canonical URL, and JSON-LD into the app shell", async () => {
    const res = await propertyRequest(makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" }));
    const html = await res.text();

    expect(res.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(html).toContain("<title>Athens Penthouse With Acropolis View - mAI prop</title>");
    expect(html).toContain("Bright penthouse in central Athens.");
    expect(html).toContain("https://maiprop.co/property/listing-1");
    expect(html).toContain("\"price\":450000");
    expect(html).toContain("maiprop-seo");

    const [request, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(request)).toContain("status=eq.active");
    expect(init.headers).toMatchObject({
      apikey: "sb_publishable_test_key_1234567890",
      Authorization: "Bearer sb_publishable_test_key_1234567890",
    });
  });

  it("leaves the shell renderable when Supabase runtime bindings are missing", async () => {
    const ctx = makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" });
    ctx.env.SUPABASE_PROJECT_ID = undefined;

    const res = await propertyRequest(ctx);
    const html = await res.text();

    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("<title>mAI prop - Greek Real Estate</title>");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("adds first-page listing structured data to /listings", async () => {
    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/listings?city=Athens"));
    const html = await res.text();

    expect(html).toContain("Properties for Sale &amp; Rent in Greece");
    expect(html).toContain("Athens Penthouse With Acropolis View");
    expect(html).toContain("\"@type\":\"ItemList\"");
    expect(html).toContain("\"price\":450000");

    const [request] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(request)).toContain("city=ilike.*Athens*");
  });

  it("scopes /auctions structured data to active auction listings", async () => {
    await auctionsRequest(makeCtx("https://portal.maiprop.co/auctions"));

    const [request] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(String(request)).toContain("status=eq.active");
    expect(String(request)).toContain("listing_type=eq.auction");
  });
});
