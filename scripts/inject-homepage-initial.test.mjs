import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  assertStrictHomepageInitialPayload,
  buildHomepageInitialPayload,
  injectHomepageInitialPayload,
} from "./inject-homepage-initial.mjs";

const tempDirs = [];

afterEach(() => {
  vi.restoreAllMocks();
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function createTempDist(html) {
  const dir = mkdtempSync(join(tmpdir(), "maiprop-homepage-initial-"));
  tempDirs.push(dir);
  writeFileSync(join(dir, "index.html"), html);
  return dir;
}

describe("homepage initial payload injection", () => {
  it("fetches compact public homepage rows and strips non-card fields", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("section=featured")) {
        return new Response(JSON.stringify([
          {
            id: "featured-1",
            title: "Featured Home",
            city: "Athens",
            address: "1 Main St",
            price: 250000,
            sqm: 72,
            is_featured: true,
            priority_placement: 2,
            has_pool: true,
            ownerParticipantType: "agent",
            profiles: {
              user_id: "public-owner-1",
              display_name: "Public Agent",
              avatar_url: "https://images.example/agent.jpg",
              private_phone: "+30 000",
            },
            project: {
              name: "Public Project Name",
              delivery_date: "2027-03-01",
            },
            owner_id: "must-not-ship",
            description: "too large",
            private_note: "nope",
            listing_images: [
              { url: "https://images.example/1.jpg", sort_order: 0, internal: "drop" },
              { url: "", sort_order: 1 },
            ],
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (href.includes("/api/public/open-houses?")) {
        return new Response(JSON.stringify([
          {
            id: "open-house-1",
            title: "Open House",
            city: "Glyfada",
            price: 950,
            sqm: 39,
            open_house_date: "2026-07-09T10:00:00.000Z",
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
    });

    expect(payload).toMatchObject({
      version: 1,
      generatedAt: "2026-07-01T10:00:00.000Z",
      featured: [
        {
          id: "featured-1",
          title: "Featured Home",
          city: "Athens",
          address: "1 Main St",
          price: 250000,
          sqm: 72,
          is_featured: true,
          priority_placement: 2,
          has_pool: true,
          ownerParticipantType: "agent",
          profiles: {
            user_id: "public-owner-1",
            display_name: "Public Agent",
            avatar_url: "https://images.example/agent.jpg",
          },
          project: {
            name: "Public Project Name",
            delivery_date: "2027-03-01",
          },
          listing_images: [{ url: "https://images.example/1.jpg", sort_order: 0 }],
        },
      ],
      openHouses: [
        {
          id: "open-house-1",
          title: "Open House",
          city: "Glyfada",
          price: 950,
          sqm: 39,
        },
      ],
    });
    expect(JSON.stringify(payload)).not.toContain("owner_id");
    expect(JSON.stringify(payload)).not.toContain("private_note");
    expect(JSON.stringify(payload)).not.toContain("private_phone");
    expect(JSON.stringify(payload).length).toBeLessThan(16_000);
  });

  it("prefetches the exact default sale and rent first pages for instant catalogue paint", async () => {
    const requestedUrls = [];
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      requestedUrls.push(parsed);

      if (parsed.pathname === "/api/public/homepage") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (parsed.pathname === "/api/public/listings") {
        const listingType = parsed.searchParams.get("listing_type");
        return new Response(JSON.stringify({
          data: listingType === "sale"
            ? [{ id: "sale-1", title: "Sale Home", city: "Athens", owner_id: "private" }]
            : [{ id: "rent-1", title: "Rental Home", city: "Piraeus", owner_id: "private" }],
          hasMore: listingType === "sale",
          nextCursor: listingType === "sale" ? "v1.sale-cursor" : null,
          page: 1,
          pageSize: 12,
          offset: 0,
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response("not found", { status: 404 });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
      fetchImpl,
      fetchOptions: { attempts: 1, timeoutMs: 1_000 },
    });

    const catalogueRequests = requestedUrls.filter((url) =>
      url.pathname === "/api/public/listings" && url.searchParams.has("listing_type"));
    expect(catalogueRequests).toHaveLength(2);
    for (const url of catalogueRequests) {
      expect(url.searchParams.get("page")).toBe("1");
      expect(url.searchParams.get("pageSize")).toBe("12");
      expect(url.searchParams.get("offset")).toBe("0");
      expect(url.searchParams.get("sort")).toBe("relevant");
    }
    expect(catalogueRequests.map((url) => url.searchParams.get("listing_type")).sort()).toEqual(["rent", "sale"]);
    expect(payload.saleListings).toEqual({
      data: [{ id: "sale-1", title: "Sale Home", city: "Athens" }],
      hasMore: true,
      nextCursor: "v1.sale-cursor",
      page: 1,
      pageSize: 12,
      offset: 0,
    });
    expect(payload.rentListings).toEqual({
      data: [{ id: "rent-1", title: "Rental Home", city: "Piraeus" }],
      hasMore: false,
      page: 1,
      pageSize: 12,
      offset: 0,
    });
    expect(JSON.stringify(payload)).not.toContain("owner_id");
  });

  it("builds the Open House bootstrap from the canonical first-six stream", async () => {
    const requestedUrls = [];
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      requestedUrls.push(parsed);
      if (parsed.pathname === "/") {
        return new Response("<html></html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        });
      }
      if (parsed.pathname === "/api/public/open-houses") {
        return new Response(JSON.stringify([
          { id: "open-house-1", title: "First Canonical Open House", city: "Athens" },
          { id: "open-house-2", title: "Second Canonical Open House", city: "Piraeus" },
        ]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (parsed.pathname === "/api/public/homepage") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      if (parsed.pathname === "/api/public/listings") {
        return new Response(JSON.stringify({ data: [], hasMore: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      fetchImpl,
      fetchOptions: { attempts: 1, timeoutMs: 1_000 },
    });

    expect(payload.openHouses.map((row) => row.id)).toEqual([
      "open-house-1",
      "open-house-2",
    ]);
    const openHouseRequest = requestedUrls.find((url) =>
      url.pathname === "/api/public/open-houses");
    expect(openHouseRequest?.searchParams.get("limit")).toBe("6");
    expect(requestedUrls.some((url) =>
      url.pathname === "/api/public/homepage"
      && url.searchParams.get("section") === "open-houses")).toBe(false);
  });

  it("uses the compatible catalogue contract when the canonical first-page key is unavailable", async () => {
    const fallbackRequests = [];
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/api/public/homepage") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      if (parsed.pathname === "/api/public/listings" && parsed.searchParams.has("listing_type")) {
        if (parsed.searchParams.has("pageSize")) {
          return new Response(JSON.stringify({ error: "cache path unavailable" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }

        fallbackRequests.push(parsed);
        const listingType = parsed.searchParams.get("listing_type");
        const data = listingType === "sale"
          ? Array.from({ length: 13 }, (_, index) => ({
            id: `sale-${index + 1}`,
            title: `Sale ${index + 1}`,
            city: "Athens",
          }))
          : [];
        return new Response(JSON.stringify({ data, hasMore: false }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({ data: [] }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
      fetchImpl,
      fetchOptions: { attempts: 1, timeoutMs: 1_000 },
    });

    expect(fallbackRequests).toHaveLength(2);
    expect(fallbackRequests.every((url) => url.searchParams.get("limit") === "40")).toBe(true);
    expect(payload.saleListings?.data).toHaveLength(12);
    expect(payload.saleListings?.hasMore).toBe(true);
    expect(payload.rentListings).toEqual({
      data: [],
      hasMore: false,
      page: 1,
      pageSize: 12,
      offset: 0,
    });
  });

  it("does not republish stale edge-cache catalogue rows as a fresh deployment snapshot", async () => {
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/api/public/homepage") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }

      return new Response(JSON.stringify({
        data: [{ id: "withdrawn-1", title: "Withdrawn listing", city: "Athens" }],
        hasMore: false,
      }), {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-maiprop-cache": "STALE",
          warning: '110 - "Response is stale due to transient upstream failure"',
        },
      });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
      fetchImpl,
      fetchOptions: { attempts: 1, timeoutMs: 1_000 },
    });

    expect(payload.saleListings).toBeUndefined();
    expect(payload.rentListings).toBeUndefined();
    expect(JSON.stringify(payload)).not.toContain("withdrawn-1");
  });

  it("keeps Spotlight empty while still bootstrapping organic catalogue rows", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("section=featured") || href.includes("/api/public/open-houses?")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (href.includes("/api/public/listings")) {
        return new Response(JSON.stringify({
          data: [
            {
              id: "fallback-1",
              title: "Fallback Listing",
              city: "Athens",
              address: "2 Main St",
              price: 310000,
              sqm: 80,
              owner_id: "must-not-ship",
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
    });

    expect(payload.featured).toEqual([]);
    expect(payload.saleListings?.data).toMatchObject([
      {
        id: "fallback-1",
        title: "Fallback Listing",
        city: "Athens",
      },
    ]);
    expect(JSON.stringify(payload)).not.toContain("owner_id");
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url).includes("/api/public/listings"))).toBe(true);
  });

  it("accepts zero Spotlight placements in strict mode when both catalogue snapshots are valid", () => {
    const payload = {
      version: 1,
      generatedAt: "2026-07-15T07:00:00.000Z",
      featured: [],
      openHouses: [],
      saleListings: { data: [], hasMore: false, page: 1, pageSize: 12, offset: 0 },
      rentListings: { data: [], hasMore: false, page: 1, pageSize: 12, offset: 0 },
    };

    expect(() => assertStrictHomepageInitialPayload(payload)).not.toThrow();
  });

  it("rejects strict deployment when a catalogue snapshot could not be generated", () => {
    const payload = {
      version: 1,
      generatedAt: "2026-07-15T07:00:00.000Z",
      featured: [],
      openHouses: [],
      saleListings: { data: [], hasMore: false, page: 1, pageSize: 12, offset: 0 },
      rentListings: undefined,
    };

    expect(() => assertStrictHomepageInitialPayload(payload)).toThrow(
      "Strict homepage initial payload generation could not produce valid sale and rent catalogue snapshots.",
    );
  });

  it("never relabels organic catalogue rows as Spotlight when no paid placement exists", async () => {
    let genericCatalogueCalls = 0;
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("section=featured") || href.includes("/api/public/open-houses?")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (href.includes("/api/public/listings")) {
        const parsed = new URL(href);
        if (parsed.searchParams.has("listing_type")) {
          return new Response(JSON.stringify({
            data: [],
            hasMore: false,
            page: 1,
            pageSize: 12,
            offset: 0,
          }), { status: 200, headers: { "content-type": "application/json" } });
        }
        genericCatalogueCalls += 1;
        return new Response(JSON.stringify({ data: [{ id: "organic-row" }] }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response("not found", { status: 404 });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
      fetchImpl,
      fetchOptions: { attempts: 2, timeoutMs: 1_000 },
    });

    expect(genericCatalogueCalls).toBe(0);
    expect(payload.featured).toEqual([]);
  });

  it("retries transient homepage prefetch failures before using the fallback", async () => {
    let featuredCalls = 0;
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("section=featured")) {
        featuredCalls += 1;
        if (featuredCalls === 1) {
          throw new Error("transient abort");
        }
        return new Response(JSON.stringify([
          {
            id: "featured-after-retry",
            title: "Retry Listing",
            city: "Athens",
            address: "3 Main St",
          },
        ]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (href.includes("/api/public/open-houses?")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
      fetchImpl,
      fetchOptions: { attempts: 2, timeoutMs: 1_000 },
    });

    expect(featuredCalls).toBe(2);
    expect(payload.featured).toMatchObject([
      {
        id: "featured-after-retry",
        title: "Retry Listing",
        city: "Athens",
        address: "3 Main St",
      },
    ]);
    expect(fetchImpl.mock.calls.some(([url]) => {
      const parsed = new URL(String(url));
      return parsed.pathname === "/api/public/listings" && !parsed.searchParams.has("listing_type");
    })).toBe(false);
  });

  it("reuses the deployed sanitized bootstrap when every live JSON endpoint is unavailable", async () => {
    const previousPayload = {
      version: 1,
      generatedAt: "2026-06-30T10:00:00.000Z",
      featured: [
        {
          id: "previous-featured",
          title: "Previously deployed home",
          city: "Athens",
          owner_id: "must-not-ship",
          private_note: "must-not-ship",
        },
      ],
      openHouses: [
        {
          id: "previous-open-house",
          title: "Previously deployed open house",
          city: "Glyfada",
        },
      ],
      saleListings: {
        data: [{ id: "previous-sale", title: "Previously deployed sale", city: "Athens" }],
        hasMore: false,
        page: 1,
        pageSize: 12,
        offset: 0,
      },
    };
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/") {
        return new Response(
          `<html><body><script id="maiprop-homepage-initial" type="application/json">${JSON.stringify(previousPayload)}</script></body></html>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      return new Response(JSON.stringify({ error: "upstream unavailable" }), {
        status: 503,
        headers: { "content-type": "application/json" },
      });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
      fetchImpl,
      fetchOptions: { attempts: 1, timeoutMs: 1_000 },
    });

    expect(payload.featured).toEqual([
      { id: "previous-featured", title: "Previously deployed home", city: "Athens" },
    ]);
    expect(payload.openHouses).toEqual([
      { id: "previous-open-house", title: "Previously deployed open house", city: "Glyfada" },
    ]);
    expect(payload.saleListings).toEqual(previousPayload.saleListings);
    expect(payload.rentListings).toBeUndefined();
    expect(payload.generatedAt).toBe("2026-07-01T10:00:00.000Z");
    expect(JSON.stringify(payload)).not.toContain("owner_id");
    expect(JSON.stringify(payload)).not.toContain("private_note");
  });

  it("does not resurrect prior open houses when the live endpoint validly returns no rows", async () => {
    const previousPayload = {
      version: 1,
      generatedAt: "2026-06-30T10:00:00.000Z",
      featured: [{ id: "previous-featured", title: "Previous home", city: "Athens" }],
      openHouses: [{ id: "expired-open-house", title: "Expired event", city: "Athens" }],
    };
    const fetchImpl = vi.fn(async (url) => {
      const parsed = new URL(String(url));
      if (parsed.pathname === "/") {
        return new Response(
          `<script id="maiprop-homepage-initial" type="application/json">${JSON.stringify(previousPayload)}</script>`,
          { status: 200, headers: { "content-type": "text/html" } },
        );
      }
      if (parsed.pathname === "/api/public/homepage") {
        return new Response(JSON.stringify([]), {
          status: 200,
          headers: { "content-type": "application/json" },
        });
      }
      return new Response(JSON.stringify({ data: [], hasMore: false }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      fetchImpl,
      fetchOptions: { attempts: 1, timeoutMs: 1_000 },
    });

    expect(payload.openHouses).toEqual([]);
    expect(JSON.stringify(payload)).not.toContain("expired-open-house");
  });

  it("injects the payload into dist index.html without executable inline JavaScript", async () => {
    const distDir = createTempDist(`
      <html><body>
        <div id="root"></div>
        <script id="maiprop-homepage-initial" type="application/json">{"version":1,"generatedAt":"1970-01-01T00:00:00.000Z","featured":[],"openHouses":[]}</script>
      </body></html>
    `);

    await injectHomepageInitialPayload({
      distDir,
      payload: {
        version: 1,
        generatedAt: "2026-07-01T10:00:00.000Z",
        featured: [{ id: "featured-1", title: "</script><script>alert(1)</script>", city: "Athens" }],
        openHouses: [],
      },
    });

    const html = readFileSync(join(distDir, "index.html"), "utf8");
    const match = html.match(/<script id="maiprop-homepage-initial" type="application\/json">([^<]*)<\/script>/);
    expect(match?.[1]).toBeTruthy();
    expect(JSON.parse(match[1])).toMatchObject({
      featured: [{ id: "featured-1", title: "</script><script>alert(1)</script>" }],
    });
    expect(html).not.toContain("</script><script>alert(1)</script>");
  });
});
