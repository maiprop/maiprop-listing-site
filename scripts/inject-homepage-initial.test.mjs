import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
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
      if (href.includes("section=open-houses")) {
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
    expect(JSON.stringify(payload).length).toBeLessThan(16_000);
  });

  it("falls back to public listings when featured homepage rows are transiently empty", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (url) => {
      const href = String(url);
      if (href.includes("section=featured") || href.includes("section=open-houses")) {
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

    expect(payload.featured).toMatchObject([
      {
        id: "fallback-1",
        title: "Fallback Listing",
        city: "Athens",
        address: "2 Main St",
        price: 310000,
        sqm: 80,
      },
    ]);
    expect(JSON.stringify(payload)).not.toContain("owner_id");
    expect(globalThis.fetch.mock.calls.some(([url]) => String(url).includes("/api/public/listings"))).toBe(true);
  });

  it("retries transient HTTP failures before declaring the public-listings fallback empty", async () => {
    let fallbackCalls = 0;
    const fetchImpl = vi.fn(async (url) => {
      const href = String(url);
      if (href.includes("section=featured") || href.includes("section=open-houses")) {
        return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
      }
      if (href.includes("/api/public/listings")) {
        fallbackCalls += 1;
        if (fallbackCalls === 1) {
          return new Response(JSON.stringify({ error: "upstream unavailable" }), {
            status: 503,
            headers: { "content-type": "application/json" },
          });
        }
        return new Response(JSON.stringify({
          data: [
            {
              id: "fallback-after-retry",
              title: "Fallback After Retry",
              city: "Athens",
              address: "4 Main St",
            },
          ],
        }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return new Response("not found", { status: 404 });
    });

    const payload = await buildHomepageInitialPayload({
      origin: "https://portal.maiprop.co",
      now: new Date("2026-07-01T10:00:00.000Z"),
      fetchImpl,
      fetchOptions: { attempts: 2, timeoutMs: 1_000 },
    });

    expect(fallbackCalls).toBe(2);
    expect(payload.featured).toMatchObject([
      {
        id: "fallback-after-retry",
        title: "Fallback After Retry",
        city: "Athens",
        address: "4 Main St",
      },
    ]);
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
      if (href.includes("section=open-houses")) {
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
    expect(fetchImpl.mock.calls.some(([url]) => String(url).includes("/api/public/listings"))).toBe(false);
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
