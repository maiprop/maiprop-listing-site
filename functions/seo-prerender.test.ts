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
  is_pre_sale: false,
  construction_status: null,
  updated_at: "2026-05-17T00:00:00Z",
};

type AnyCtx = Parameters<typeof propertyRequest>[0];
type FetchMock = ReturnType<typeof vi.fn>;

function makeCtx(
  url: string,
  params: Record<string, string> = {},
  shell = new Response(htmlShell, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" },
  }),
): AnyCtx {
  return {
    request: new Request(url),
    params,
    env: {
      SUPABASE_PROJECT_ID: "testprojectref000000",
      SUPABASE_PUBLISHABLE_KEY: "publishable_test_key",
      ASSETS: {
        fetch: vi.fn().mockResolvedValue(shell),
      },
    },
  } as unknown as AnyCtx;
}

function fetchMock(): FetchMock {
  return globalThis.fetch as FetchMock;
}

function firstSupabaseUrl(): string {
  return String(fetchMock().mock.calls[0][0]);
}

function firstSupabaseRequestUrl(): URL {
  return new URL(firstSupabaseUrl());
}

beforeEach(() => {
  globalThis.fetch = vi.fn().mockImplementation(() =>
    Promise.resolve(
      new Response(JSON.stringify([listing]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    ),
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

    const [request, init] = fetchMock().mock.calls[0];
    expect(String(request)).toContain("status=eq.active");
    expect(init.headers).toMatchObject({
      apikey: "publishable_test_key",
      Authorization: "Bearer publishable_test_key",
    });
  });

  it("uses canonical auction and new-build detail URLs when listing data requires it", async () => {
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify([{ ...listing, listing_type: "auction" }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const auctionRes = await propertyRequest(makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" }));
    expect(await auctionRes.text()).toContain("https://maiprop.co/auction/listing-1");

    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify([{ ...listing, is_pre_sale: true }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );
    const newBuildRes = await propertyRequest(makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" }));
    expect(await newBuildRes.text()).toContain("https://maiprop.co/new-build/listing-1");
  });

  it("keeps renovated sale listings on the property canonical URL", async () => {
    fetchMock().mockResolvedValueOnce(
      new Response(JSON.stringify([{ ...listing, construction_status: "renovated", is_pre_sale: false }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }),
    );

    const res = await propertyRequest(makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" }));
    const html = await res.text();

    expect(html).toContain("https://maiprop.co/property/listing-1");
    expect(html).not.toContain("https://maiprop.co/new-build/listing-1");
  });

  it("leaves the shell renderable when Supabase runtime bindings are missing", async () => {
    const ctx = makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" });
    ctx.env.SUPABASE_PROJECT_ID = undefined;
    ctx.env.SUPABASE_PUBLISHABLE_KEY = undefined;

    const res = await propertyRequest(ctx);
    const html = await res.text();

    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("<title>mAI prop - Greek Real Estate</title>");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("leaves listing pages renderable when the Supabase SEO fetch aborts", async () => {
    fetchMock().mockRejectedValueOnce(new DOMException("Timeout", "AbortError"));

    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/listings?city=Athens"));
    const html = await res.text();

    expect(res.status).toBe(200);
    expect(html).toContain('<div id="root"></div>');
    expect(html).toContain("Properties for Sale &amp; Rent in Greece");
    const init = fetchMock().mock.calls[0][1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });

  it("accepts Vite-style Supabase runtime bindings for Pages Functions", async () => {
    const ctx = makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" });
    ctx.env.SUPABASE_PROJECT_ID = undefined;
    ctx.env.SUPABASE_PUBLISHABLE_KEY = undefined;
    ctx.env.VITE_SUPABASE_URL = "https://testprojectref000000.supabase.co";
    ctx.env.VITE_SUPABASE_PUBLISHABLE_KEY = "vite_publishable_test_key";

    await propertyRequest(ctx);

    const [request, init] = fetchMock().mock.calls[0];
    expect(String(request)).toContain("https://testprojectref000000.supabase.co/rest/v1/listings");
    expect(init.headers).toMatchObject({
      apikey: "vite_publishable_test_key",
      Authorization: "Bearer vite_publishable_test_key",
    });
  });

  it("falls back to the Supabase URL when the explicit project id binding is malformed", async () => {
    const ctx = makeCtx("https://portal.maiprop.co/property/listing-1", { id: "listing-1" });
    ctx.env.SUPABASE_PROJECT_ID = "not-a-project-ref";
    ctx.env.SUPABASE_URL = "https://testprojectref000000.supabase.co";

    await propertyRequest(ctx);

    expect(firstSupabaseUrl()).toContain("https://testprojectref000000.supabase.co/rest/v1/listings");
  });

  it("adds first-page listing structured data to /listings", async () => {
    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/listings?city=Athens"));
    const html = await res.text();

    expect(html).toContain("Properties for Sale &amp; Rent in Greece");
    expect(html).toContain("Athens Penthouse With Acropolis View");
    expect(html).toContain("\"@type\":\"ItemList\"");
    expect(html).toContain("\"price\":450000");

    const url = firstSupabaseRequestUrl();
    expect(url.searchParams.get("city")).toBe("ilike.*Athens*");
    expect(url.searchParams.get("listing_type")).toBe("in.(sale,rent,firesale)");
  });

  it("honors explicit /listings listing_type and includeAuctions query intent", async () => {
    await listingsRequest(makeCtx("https://portal.maiprop.co/listings?listing_type=rent"));
    expect(firstSupabaseRequestUrl().searchParams.get("listing_type")).toBe("eq.rent");

    fetchMock().mockClear();
    await listingsRequest(makeCtx("https://portal.maiprop.co/listings?includeAuctions=true"));
    expect(firstSupabaseRequestUrl().searchParams.has("listing_type")).toBe(false);
  });

  it("scopes /auctions structured data to active auction listings", async () => {
    await auctionsRequest(makeCtx("https://portal.maiprop.co/auctions"));

    expect(firstSupabaseUrl()).toContain("status=eq.active");
    expect(firstSupabaseUrl()).toContain("listing_type=eq.auction");
  });

  it("passes through the index response when the app shell cannot be loaded", async () => {
    const res = await listingsRequest(makeCtx("https://portal.maiprop.co/listings", {}, new Response("missing", { status: 503 })));

    expect(res.status).toBe(503);
    expect(await res.text()).toBe("missing");
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
