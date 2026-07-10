import { describe, expect, it, vi } from "vitest";
import {
  findPublicApiFixtureMarker,
  PUBLIC_API_FIXTURE_MARKERS,
} from "./public-api-fixture-guard.mjs";
import {
  getSiteLockCookieHeader,
  getSiteLockPlaywrightCookie,
  getSiteLockPassword,
  getCloudflareAccessHeaders,
  isSiteLockHtml,
  mergeHeaders,
} from "./check-production-deploy-site-lock.mjs";

function publicListingsPayloadFromUrl(href, rows = []) {
  const url = new URL(href);
  const pageSize = Number(url.searchParams.get("pageSize") ?? url.searchParams.get("limit") ?? "1");
  const offset = Number(url.searchParams.get("offset") ?? "0");
  return {
    data: rows,
    hasMore: false,
    page: Number(url.searchParams.get("page") ?? "1"),
    pageSize,
    offset,
  };
}

function featuredHomepagePayload() {
  return [{
    id: "featured-1",
    owner_id: "owner-1",
    title: "Clean featured listing",
    profiles: { display_name: "Owner One" },
    has_video_tour: false,
    has_virtual_tour: true,
    is_featured: true,
    priority_placement: 1,
  }];
}

describe("production deploy site-lock smoke helpers", () => {
  it("prefers the dedicated smoke-check passcode secret over the runtime site-lock secret", () => {
    expect(getSiteLockPassword({
      PRODUCTION_DEPLOY_SITE_LOCK_PASSWORD: "smoke-secret",
      SITE_LOCK_PASSWORD: "runtime-secret",
    })).toBe("smoke-secret");

    expect(getSiteLockPassword({
      SITE_LOCK_PASSWORD: "runtime-secret",
    })).toBe("runtime-secret");
  });

  it("creates the Cloudflare middleware unlock cookie without exposing the passcode", async () => {
    const header = await getSiteLockCookieHeader("correct horse battery staple");

    expect(header).toMatch(/^maiprop_unlock=[a-f0-9]{64}$/);
    expect(header).not.toContain("correct horse battery staple");

    await expect(getSiteLockPlaywrightCookie("https://portal.maiprop.co/path", "passcode"))
      .resolves.toMatchObject({
        name: "maiprop_unlock",
        domain: "portal.maiprop.co",
        path: "/",
        httpOnly: true,
        secure: true,
        sameSite: "Lax",
      });
  });

  it("detects the private preview splash and merges smoke headers", () => {
    expect(isSiteLockHtml("<title>Maiprop — Private preview</title><form action=\"/__unlock\">")).toBe(true);
    expect(isSiteLockHtml("<div id=\"root\"></div><script type=\"module\" src=\"/assets/app.js\"></script>")).toBe(false);

    expect(mergeHeaders(
      { accept: "text/html" },
      { cookie: "maiprop_unlock=abc", "x-smoke": "1" },
    )).toEqual({
      accept: "text/html",
      cookie: "maiprop_unlock=abc",
      "x-smoke": "1",
    });
  });
});

describe("production deploy public API fixture guard", () => {
  it("documents the production-blocked fixture markers", () => {
    expect(PUBLIC_API_FIXTURE_MARKERS.map((marker) => marker.name)).toEqual([
      "supervisor marker",
      "full publish E2E marker",
      "full publish QA tag",
      "Devin test marker",
      "test free listing marker",
    ]);
  });

  it("finds nested supervisor fixtures and reports their JSON path", () => {
    const result = findPublicApiFixtureMarker({
      data: [
        {
          id: "listing-1",
          title: "supervisor-1779128352056 pro agent maisonette",
        },
      ],
    });

    expect(result).toEqual({
      marker: "supervisor marker",
      path: "$.data[0].title",
      value: "supervisor-1779128352056 pro agent maisonette",
    });
  });

  it("flags E2E publishing records, QA tags, and historical test listing names", () => {
    expect(findPublicApiFixtureMarker({ title: "E2E-FULL-PUBLISH-20260526T161856Z maisonette" })?.marker)
      .toBe("full publish E2E marker");
    expect(findPublicApiFixtureMarker({ tags: ["qa-full-publish"] })?.marker)
      .toBe("full publish QA tag");
    expect(findPublicApiFixtureMarker({ agent: "Devin Test" })?.marker)
      .toBe("Devin test marker");
    expect(findPublicApiFixtureMarker({ title: "Test Free Listing" })?.marker)
      .toBe("test free listing marker");
  });

  it("allows clean production-shaped public API payloads", () => {
    expect(findPublicApiFixtureMarker({
      data: [
        {
          title: "Renovated apartment in Koukaki",
          tags: ["featured", "city-view"],
          agent: { name: "MaiProp Partner" },
        },
      ],
    })).toBeNull();
  });

  it("follows public listing feed rows into the public detail API", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const calls = [];
    const originalFetch = globalThis.fetch;
    globalThis.fetch = async (url) => {
      const href = String(url);
      calls.push(href);

      if (href.endsWith("/api/public/listings?limit=1")) {
        return Response.json(publicListingsPayloadFromUrl(href, [{ id: "listing-1", title: "Clean listing" }]));
      }
      if (href.endsWith("/api/public/listings?listing_type=new_build&limit=1")) {
        return Response.json(publicListingsPayloadFromUrl(href, [{ id: "new-build-1", title: "Clean new build" }]));
      }
      if (href.includes("/api/public/listings?")) {
        return Response.json(publicListingsPayloadFromUrl(href));
      }
      if (href.endsWith("/api/public/auctions?limit=60")) {
        return Response.json({ data: [{ id: "auction-1", title: "Clean auction" }] });
      }
      if (href.includes("/api/public/homepage?section=type-counts")) {
        return Response.json({ apartment: 1, land: 1 });
      }
      if (href.includes("/api/public/homepage?section=auction-count")) {
        return Response.json(1);
      }
      if (href.includes("/api/public/homepage?section=featured")) {
        return Response.json(featuredHomepagePayload());
      }
      if (href.includes("/api/public/homepage?")) {
        return Response.json([]);
      }
      if (href.includes("/api/public/open-houses?")) {
        return Response.json([]);
      }
      if (href.endsWith("/api/public/listing?id=listing-1")) {
        return Response.json({ data: { id: "listing-1", title: "Clean listing detail" } });
      }
      if (href.endsWith("/api/public/listing?id=new-build-1")) {
        return Response.json({ data: { id: "new-build-1", title: "Clean new build detail" } });
      }
      if (href.endsWith("/api/public/listing?id=auction-1")) {
        return Response.json({ data: { id: "auction-1", title: "Clean auction detail" } });
      }
      return Response.json([]);
    };

    try {
      await validatePublicApiEndpoints("https://portal.maiprop.co");
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toContain("https://portal.maiprop.co/api/public/listing?id=listing-1");
    expect(calls).toContain("https://portal.maiprop.co/api/public/listing?id=new-build-1");
    expect(calls).toContain("https://portal.maiprop.co/api/public/listing?id=auction-1");
  });

  it("reports Cloudflare Pages fail-open HTML when public API functions are not invoked", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async (url) => ({
        res: new Response("<!doctype html><div id=\"root\"></div>", {
          headers: { "Content-Type": "text/html; charset=utf-8" },
        }),
        text: "<!doctype html><div id=\"root\"></div>",
      }),
    })).rejects.toThrow(
      "https://portal.maiprop.co/api/public/listings?limit=1 returned HTML instead of JSON; the Cloudflare Pages Function was not invoked or failed open to the SPA fallback",
    );
  });

  it("can tolerate Cloudflare Pages fail-open HTML when app fallbacks are explicitly enabled", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const previous = process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = "true";

    try {
      await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
        fetchText: async () => ({
          res: new Response("<!doctype html><div id=\"root\"></div>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
          text: "<!doctype html><div id=\"root\"></div>",
        }),
      })).resolves.toBeUndefined();
    } finally {
      stderrWrite.mockRestore();
      if (previous === undefined) delete process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
      else process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = previous;
    }
  });

  it("rejects Supabase upstream outages unless fail-open dependency mode is explicit", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const previous = process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
    delete process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;

    try {
      await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
        fetchText: async () => ({
          res: Response.json({ error: "Supabase upstream unavailable" }, { status: 503 }),
          text: JSON.stringify({ error: "Supabase upstream unavailable" }),
        }),
      })).rejects.toThrow(
        'https://portal.maiprop.co/api/public/listings?limit=1 returned HTTP 503: {"error":"Supabase upstream unavailable"}',
      );
    } finally {
      if (previous === undefined) delete process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
      else process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = previous;
    }
  });

  it("retries transient Supabase upstream outages before failing the deploy check", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const calls = [];

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async (url) => {
        calls.push(url);
        if (calls.length === 1) {
          return {
            res: Response.json({ error: "Supabase upstream unavailable" }, { status: 503 }),
            text: JSON.stringify({ error: "Supabase upstream unavailable" }),
          };
        }
        const parsed = new URL(url);
        const href = parsed.pathname + parsed.search;
        const payload = href.includes("/api/public/listings?")
          ? publicListingsPayloadFromUrl(url)
          : href.includes("section=type-counts")
            ? { apartment: 1, land: 1 }
            : href.includes("section=auction-count")
              ? 1
              : href.includes("/api/public/auctions?")
                ? { data: [] }
                : href.includes("section=featured")
                  ? featuredHomepagePayload()
                  : [];
        const text = JSON.stringify(payload);
        return {
          res: new Response(text, { headers: { "Content-Type": "application/json" } }),
          text,
        };
      },
    })).resolves.toBeUndefined();

    expect(calls[0]).toBe("https://portal.maiprop.co/api/public/listings?limit=1");
    expect(calls[1]).toBe("https://portal.maiprop.co/api/public/listings?limit=1");
  });

  it("can tolerate explicit Supabase upstream outages when production deploy fallbacks are enabled", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const previous = process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
    const stderrWrite = vi.spyOn(process.stderr, "write").mockImplementation(() => true);
    process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = "true";

    try {
      await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
        fetchText: async () => ({
          res: Response.json({ error: "Supabase upstream unavailable" }, { status: 503 }),
          text: JSON.stringify({ error: "Supabase upstream unavailable" }),
        }),
      })).resolves.toBeUndefined();
    } finally {
      stderrWrite.mockRestore();
      if (previous === undefined) delete process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
      else process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = previous;
    }
  });

  it("builds Cloudflare Access service-token headers for protected previews", () => {
    expect(getCloudflareAccessHeaders({
      CLOUDFLARE_ACCESS_CLIENT_ID: "client-id",
      CLOUDFLARE_ACCESS_CLIENT_SECRET: "client-secret",
    })).toEqual({
      "CF-Access-Client-Id": "client-id",
      "CF-Access-Client-Secret": "client-secret",
    });

    expect(getCloudflareAccessHeaders({
      CF_ACCESS_TOKEN: "jwt-token",
    })).toEqual({
      "cf-access-token": "jwt-token",
    });
  });

  it("rejects incomplete Cloudflare Access service-token config", () => {
    expect(() => getCloudflareAccessHeaders({
      CF_ACCESS_CLIENT_ID: "client-id",
    })).toThrow("both client id and client secret");
  });
});

describe("production deploy version marker", () => {
  it("accepts the expected deployment sha before smoke checks continue", async () => {
    const { validateDeploymentVersion } = await import("./check-production-deploy-version.mjs");
    const calls = [];

    await validateDeploymentVersion("https://portal.maiprop.co", {
      expectedSha: "abc123",
      fetchText: async (url) => {
        calls.push(url);
        return {
          res: new Response(JSON.stringify({ sha: "abc123" }), {
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }),
          text: JSON.stringify({ sha: "abc123" }),
        };
      },
    });

    expect(calls).toEqual(["https://portal.maiprop.co/deploy-version.json"]);
  });

  it("rejects stale deployment markers with a precise error", async () => {
    const { validateDeploymentVersion } = await import("./check-production-deploy-version.mjs");

    await expect(validateDeploymentVersion("https://portal.maiprop.co", {
      expectedSha: "new-sha",
      fetchText: async () => ({
        res: new Response(JSON.stringify({ sha: "old-sha" }), {
          headers: { "Content-Type": "application/json" },
        }),
        text: JSON.stringify({ sha: "old-sha" }),
      }),
    })).rejects.toThrow(
      "https://portal.maiprop.co/deploy-version.json is serving deployment old-sha instead of new-sha",
    );
  });
});
