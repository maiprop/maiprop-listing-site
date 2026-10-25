import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
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
    featured_until: "2099-01-01T00:00:00.000Z",
    priority_placement: 1,
  }];
}

function publicApiPayloadForUrl(href, { featured = featuredHomepagePayload() } = {}) {
  const url = new URL(href);
  const path = url.pathname + url.search;
  if (path.startsWith("/api/public/listings?")) return publicListingsPayloadFromUrl(href);
  if (path.startsWith("/api/public/auctions?")) return { data: [] };
  if (path.includes("section=auctions")) return { data: [] };
  if (path.includes("section=type-counts")) return { apartment: 1, land: 1 };
  if (path.includes("section=auction-count")) return 1;
  if (path.includes("section=featured")) return featured;
  if (
    path.startsWith("/api/public/open-houses?") &&
    url.searchParams.get("includeMeta") === "1"
  ) {
    return {
      data: [],
      hasMore: false,
      nextCursor: null,
      limit: Number(url.searchParams.get("limit") ?? "1"),
      publicationId: 1,
    };
  }
  return [];
}

describe("production deploy site-lock smoke helpers", () => {
  it.each([
    [[]],
    [[{ id: "open-house-1", title: "Clean open house" }]],
  ])(
    "accepts a valid terminal open-house page without a fabricated cursor (%#)",
    async (data) => {
      const { validateCursorRoundTrip } = await import(
        "./check-production-deploy-public-api.mjs"
      );
      const fetchText = vi.fn();
      const assertOk = (condition, message) => {
        if (!condition) throw new Error(message);
      };

      const result = await validateCursorRoundTrip(
        "https://portal.maiprop.co",
        "/api/public/open-houses?limit=1&includeMeta=1&showPast=1",
        {
          data,
          hasMore: false,
          nextCursor: null,
          limit: 1,
          publicationId: 17,
        },
        { assertOk, fetchText, allowTerminalPage: true },
      );

      expect(fetchText).not.toHaveBeenCalled();
      expect(result.evidence).toBeNull();
      expect(result.proof).toMatchObject({
        mode: "terminal-page",
        secondPath: null,
        publicationId: 17,
        firstIds: data.map((row) => row.id),
        secondIds: [],
        status: "passed",
      });
    },
  );

  it.each([
    { data: [], hasMore: false, nextCursor: "unexpected", publicationId: 17 },
    { data: [], hasMore: true, nextCursor: null, publicationId: 17 },
  ])("rejects inconsistent open-house cursor metadata (%#)", async (body) => {
    const { validateCursorRoundTrip } = await import(
      "./check-production-deploy-public-api.mjs"
    );
    const assertOk = (condition, message) => {
      if (!condition) throw new Error(message);
    };

    await expect(validateCursorRoundTrip(
      "https://portal.maiprop.co",
      "/api/public/open-houses?limit=1&includeMeta=1&showPast=1",
      body,
      { assertOk, fetchText: vi.fn(), allowTerminalPage: true },
    )).rejects.toThrow();
  });

  it("honors endpoint-specific request timeouts in the deploy wrapper", () => {
    const source = readFileSync("scripts/check-production-deploy.mjs", "utf8");

    expect(source).toContain("timeoutMs = FETCH_TIMEOUT_MS");
    expect(source).toContain("signal: AbortSignal.timeout(timeoutMs)");
  });

  it("requires an access token and room id together for live TURN proof", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-production-deploy.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PRODUCTION_DEPLOY_TURN_ACCESS_TOKEN: "redacted-token",
          PRODUCTION_DEPLOY_TURN_ROOM_ID: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Authenticated TURN proof requires both PRODUCTION_DEPLOY_TURN_ACCESS_TOKEN and PRODUCTION_DEPLOY_TURN_ROOM_ID",
    );
    expect(result.stderr).not.toContain("redacted-token");
  });

  it("requires the documented Cloudflare TURN key and token together", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-production-deploy.mjs"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          CLOUDFLARE_TURN_KEY_ID: "redacted-key-id",
          CLOUDFLARE_TURN_API_TOKEN: "",
        },
      },
    );

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(
      "Cloudflare TURN service proof requires both CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN",
    );
    expect(result.stderr).not.toContain("redacted-key-id");
  });

  it("functionally proves Cloudflare TURN credentials without exposing them", () => {
    const program = [
      'import { verifyCloudflareTurnCredentials } from "./scripts/check-production-deploy.mjs";',
      'const proof = await verifyCloudflareTurnCredentials({',
      '  keyId: "turn-key-id-secret",',
      '  apiToken: "turn-api-token-secret",',
      '  ttlSeconds: 600,',
      '  fetchImpl: async (url, options) => {',
      '    if (url !== "https://rtc.live.cloudflare.com/v1/turn/keys/turn-key-id-secret/credentials/generate-ice-servers") throw new Error(`unexpected URL ${url}`);',
      '    if (options.headers.Authorization !== "Bearer turn-api-token-secret") throw new Error("missing bearer token");',
      '    if (options.method !== "POST" || JSON.parse(options.body).ttl !== 600) throw new Error("invalid request");',
      '    return new Response(JSON.stringify({ iceServers: [',
      '      { urls: ["stun:stun.cloudflare.com:3478"] },',
      '      { urls: ["turn:turn.cloudflare.com:3478?transport=udp", "turns:turn.cloudflare.com:5349?transport=tcp"], username: "ephemeral-user", credential: "ephemeral-credential" },',
      '    ] }), { status: 201, headers: { "content-type": "application/json" } });',
      '  },',
      '});',
      'process.stdout.write(JSON.stringify(proof));',
    ].join("\n");
    const proof = JSON.parse(execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", program],
      { cwd: process.cwd(), encoding: "utf8" },
    ));

    expect(proof).toEqual({
      status: "passed",
      httpStatus: 201,
      authentication: "bearer",
      ttlSeconds: 600,
      iceServerCount: 2,
      turnUrlCount: 2,
      credentialsPresent: true,
      credentialsRedacted: true,
    });
    const serialized = JSON.stringify(proof);
    expect(serialized).not.toContain("turn-key-id-secret");
    expect(serialized).not.toContain("turn-api-token-secret");
    expect(serialized).not.toContain("ephemeral-user");
    expect(serialized).not.toContain("ephemeral-credential");
  });

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

describe("production deploy app-shell validation", () => {
  const shell = (rootInner) =>
    `<!doctype html><html><head><title>mAI prop</title></head><body>` +
    `<div id="root">${rootInner}</div>` +
    `<script type="module" crossorigin src="/assets/index-AbC123.js"></script>` +
    `</body></html>`;

  it("accepts the legacy empty #root shell", async () => {
    const { validateHtml } = await import("./check-production-deploy.mjs");

    expect(() => validateHtml("https://example.pages.dev", shell(""))).not.toThrow();
  });

  it("accepts the boot-splash #root shell shipped in index.html", async () => {
    const { validateHtml } = await import("./check-production-deploy.mjs");
    const splash =
      `<div style="min-height: 100vh; display: flex; align-items: center; ` +
      `justify-content: center; background: #ffffff;">Loading mAI prop…</div>`;

    expect(() => validateHtml("https://example.pages.dev", shell(splash))).not.toThrow();
  });

  it("rejects HTML without an app #root element", async () => {
    const { validateHtml } = await import("./check-production-deploy.mjs");

    expect(() => validateHtml(
      "https://example.pages.dev",
      `<!doctype html><html><body><div id="app"></div></body></html>`,
    )).toThrow("is missing #root");
  });
});

describe("production deploy public API fixture guard", () => {
  it("uses canonical auction listing UUIDs and only UUID-safe auction fallbacks", async () => {
    const { extractPublicListingIds } = await import(
      "./check-production-deploy-public-api.mjs"
    );
    const canonicalId = "5a7a9000-0000-4000-8000-000000000002";
    const fallbackId = "5a7a9000-0000-4000-8000-000000000003";

    expect(extractPublicListingIds({
      data: [
        { id: "stage-proof-os-auction", listing_id: canonicalId },
        { id: fallbackId },
        { id: "not-a-uuid" },
      ],
    }, { requireUuid: true })).toEqual([canonicalId, fallbackId]);
  });

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

  it("follows public listing feed rows into the public detail API and records every checked route", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const calls = [];
    const auctionListingId = "5a7a9000-0000-4000-8000-000000000002";
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
      if (href.includes("/api/public/auctions?")) {
        return Response.json({
          data: href.endsWith("limit=60")
            ? [{
                id: "stage-proof-os-auction",
                listing_id: auctionListingId,
                title: "Clean auction",
              }]
            : [],
        });
      }
      if (href.includes("/api/public/homepage?section=auctions")) {
        return Response.json({
          data: [{
            id: "stage-proof-os-auction",
            listing_id: auctionListingId,
            title: "Clean auction",
          }],
        });
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
        const url = new URL(href);
        if (url.searchParams.get("includeMeta") === "1") {
          return Response.json({
            data: [],
            hasMore: false,
            nextCursor: null,
            limit: 1,
            publicationId: 1,
          });
        }
        return Response.json([]);
      }
      if (href.endsWith("/api/public/listing?id=listing-1")) {
        return Response.json({ data: { id: "listing-1", title: "Clean listing detail" } });
      }
      if (href.endsWith("/api/public/listing?id=new-build-1")) {
        return Response.json({ data: { id: "new-build-1", title: "Clean new build detail" } });
      }
      if (href.endsWith(`/api/public/listing?id=${auctionListingId}`)) {
        return Response.json({ data: { id: auctionListingId, title: "Clean auction detail" } });
      }
      return Response.json([]);
    };

    try {
       const evidence = await validatePublicApiEndpoints("https://portal.maiprop.co");

       expect(evidence).toMatchObject({
         schemaVersion: 3,
         kind: "maiprop-public-api-deploy-verification",
         baseUrl: "https://portal.maiprop.co/",
         status: "passed",
      });
      expect(evidence.endpoints).toEqual(expect.arrayContaining([
        expect.objectContaining({
          path: "/api/public/listings?limit=1",
          url: "https://portal.maiprop.co/api/public/listings?limit=1",
          status: "passed",
          httpStatus: 200,
          contentType: expect.stringMatching(/application\/json/i),
          responseBytes: expect.any(Number),
          elapsedMs: expect.any(Number),
          payloadShape: "passed",
          fixtureGuard: "passed",
        }),
        expect.objectContaining({
          path: "/api/public/listing?id=listing-1",
          status: "passed",
        }),
        expect.objectContaining({
          path: "/api/public/listing?id=new-build-1",
          status: "passed",
        }),
        expect.objectContaining({
          path: `/api/public/listing?id=${auctionListingId}`,
          status: "passed",
        }),
      ]));
      expect(evidence.endpoints).toHaveLength(calls.length);
      expect(evidence.endpoints.every((endpoint) => endpoint.status === "passed")).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }

    expect(calls).toContain("https://portal.maiprop.co/api/public/listing?id=listing-1");
    expect(calls).toContain("https://portal.maiprop.co/api/public/listing?id=new-build-1");
    expect(calls).toContain(
      `https://portal.maiprop.co/api/public/listing?id=${auctionListingId}`,
    );
    expect(calls).not.toContain(
      "https://portal.maiprop.co/api/public/listing?id=stage-proof-os-auction",
    );
    expect(calls).toContain("https://portal.maiprop.co/api/public/auctions?limit=600");
  });

  it("attests auction consistency, cursors, publication pinning, and cache warm-up", async () => {
     const { validatePublicApiEndpoints } = await import(
       "./check-production-deploy-public-api.mjs"
     );
     const publicationId = 17;
     const turnRequestOptions = [];
     const accessToken = "jwt-secret-that-must-not-be-attested";
     const roomId =
       "video:professional:11111111-1111-4111-8111-111111111111";
     const auctionRows = Array.from({ length: 6 }, (_, index) => ({
       id: `auction-${index + 1}`,
       title: `Clean auction ${index + 1}`,
    }));
    const response = (payload, cacheStatus = "MISS") => {
      const text = JSON.stringify(payload);
      return {
        res: new Response(text, {
          headers: {
            "Content-Type": "application/json",
            "X-Maiprop-Cache": cacheStatus,
          },
        }),
        text,
      };
    };

    const evidence = await validatePublicApiEndpoints(
      "https://portal.maiprop.co",
       {
         operationalProof: true,
         turnCredentialProof: {
           accessToken,
           roomId,
           expectedTtlSeconds: 21_600,
         },
         fetchText: async (href, options = {}) => {
           const url = new URL(href);
           const path = url.pathname;
           if (path === "/api/turn-credentials") {
             turnRequestOptions.push(options);
             const authorization =
               options.headers?.Authorization ??
               options.headers?.authorization;
             const authenticated = authorization === `Bearer ${accessToken}`;
             const payload = authenticated
               ? {
                   iceServers: [
                     { urls: "stun:stun.cloudflare.com:3478" },
                     {
                       urls: [
                         "turn:turn.cloudflare.com:3478?transport=udp",
                         "turns:turn.cloudflare.com:5349?transport=tcp",
                       ],
                       username: "ephemeral-turn-user",
                       credential: "ephemeral-turn-credential",
                     },
                   ],
                   expiresIn: 21_600,
                 }
               : { error: "Authentication required" };
             const text = JSON.stringify(payload);
             return {
               res: new Response(text, {
                 status: authenticated ? 200 : 401,
                 headers: {
                   "Cache-Control": "no-store",
                   "CDN-Cache-Control": "no-store",
                   "Content-Type": "application/json",
                   Vary: "Authorization",
                 },
              }),
              text,
            };
          }
          if (path === "/api/public/listing") {
            const id = url.searchParams.get("id");
            return response({
              data: { id, title: `Detail ${id}` },
              publicationId,
            }, "HIT");
          }
          if (path === "/api/public/listings") {
            const cursor = url.searchParams.get("cursor");
            const isSingle = url.searchParams.get("limit") === "1";
            if (isSingle && cursor) {
              return response({
                data: [{ id: "listing-2", title: "Clean listing 2" }],
                hasMore: false,
                nextCursor: null,
                page: 1,
                pageSize: 1,
                offset: 1,
                publicationId,
              }, "HIT");
            }
            if (isSingle) {
              return response({
                data: [{ id: "listing-1", title: "Clean listing 1" }],
                hasMore: true,
                nextCursor: "listing-cursor",
                page: 1,
                pageSize: 1,
                offset: 0,
                publicationId,
              });
            }
            const payload = publicListingsPayloadFromUrl(href);
            payload.publicationId = publicationId;
            const cacheStatus =
              options.headers?.["cache-control"] === "no-cache"
                ? "HIT"
                : "MISS";
            return response(payload, cacheStatus);
          }
          if (path === "/api/public/open-houses") {
            if (url.searchParams.get("includeMeta") !== "1") {
              return response([]);
            }
            const cursor = url.searchParams.get("cursor");
            return response({
              data: [{
                id: cursor ? "open-house-2" : "open-house-1",
                title: cursor ? "Clean open house 2" : "Clean open house 1",
              }],
              hasMore: !cursor,
              nextCursor: cursor ? null : "open-house-cursor",
              limit: 1,
              publicationId,
            }, cursor ? "HIT" : "MISS");
          }
          if (path === "/api/public/auctions") {
            return response({ data: auctionRows });
          }
          if (url.searchParams.get("section") === "auctions") {
            return response({ data: auctionRows });
          }
          return response(publicApiPayloadForUrl(href));
        },
      },
    );

     expect(evidence).toMatchObject({
       schemaVersion: 3,
       operational: {
         auctionConsistency: { status: "passed" },
        listingsCursor: {
          publicationId,
          firstIds: ["listing-1"],
          secondIds: ["listing-2"],
          status: "passed",
        },
        openHousesCursor: {
          publicationId,
          firstIds: ["open-house-1"],
          secondIds: ["open-house-2"],
          status: "passed",
        },
        publicationPinning: {
          listingId: "listing-1",
          publicationId,
          status: "passed",
        },
        cacheTransition: {
          initial: "MISS",
          warmed: "HIT",
          status: "passed",
        },
        turnCredentialBoundary: {
          requestMethod: "POST",
          expectedHttpStatus: 401,
          httpStatus: 401,
          authenticationBoundary: "passed",
          cacheControl: "passed",
          varyAuthorization: "passed",
           status: "passed",
         },
         turnCredentialIssuance: {
           requestMethod: "POST",
           httpStatus: 200,
           authentication: "passed",
           authorizedRoom: "passed",
           expiresIn: 21_600,
           iceServerCount: 2,
           turnUrlCount: 2,
           credentialsPresent: true,
           credentialsRedacted: true,
           cacheControl: "passed",
           varyAuthorization: "passed",
           status: "passed",
         },
       },
     });
     expect(turnRequestOptions).toHaveLength(2);
     expect(turnRequestOptions[0]).toMatchObject({
       method: "POST",
       headers: {
         accept: "application/json",
         "content-type": "application/json",
       },
     });
     expect(JSON.parse(turnRequestOptions[0].body)).toEqual({
       roomId: "video:viewing:11111111-1111-4111-8111-111111111111",
     });
     expect(turnRequestOptions[1]).toMatchObject({
       method: "POST",
       headers: {
         accept: "application/json",
         "content-type": "application/json",
         Authorization: `Bearer ${accessToken}`,
       },
     });
     expect(JSON.parse(turnRequestOptions[1].body)).toEqual({ roomId });
     const serializedEvidence = JSON.stringify(evidence);
     expect(serializedEvidence).not.toContain(accessToken);
     expect(serializedEvidence).not.toContain(roomId);
     expect(serializedEvidence).not.toContain("ephemeral-turn-user");
     expect(serializedEvidence).not.toContain("ephemeral-turn-credential");
   });

   it("rejects authenticated TURN proof with a mismatched credential TTL", async () => {
     const { validateAuthenticatedTurnCredentialIssuance } = await import(
       "./check-production-deploy-public-api.mjs"
     );
     const accessToken = "jwt-secret";
     const roomId =
       "video:professional:11111111-1111-4111-8111-111111111111";
     const payload = {
       iceServers: [
         { urls: "stun:stun.cloudflare.com:3478" },
         {
           urls: "turn:turn.cloudflare.com:3478?transport=udp",
           username: "turn-user",
           credential: "turn-credential",
         },
       ],
       expiresIn: 86_400,
     };

     await expect(
       validateAuthenticatedTurnCredentialIssuance(
         "https://staging.maiprop.co",
         {
           accessToken,
           roomId,
           expectedTtlSeconds: 21_600,
           fetchText: async () => ({
             res: new Response(JSON.stringify(payload), {
               status: 200,
               headers: {
                 "Cache-Control": "no-store",
                 "CDN-Cache-Control": "no-store",
                 "Content-Type": "application/json",
                 Vary: "Authorization",
               },
             }),
             text: JSON.stringify(payload),
           }),
         },
       ),
     ).rejects.toThrow("unexpected credential TTL");
   });

  it("accepts a valid empty Spotlight response when no paid placement is active", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async (url) => {
        const payload = publicApiPayloadForUrl(url, { featured: [] });
        return {
          res: Response.json(payload),
          text: JSON.stringify(payload),
        };
      },
     })).resolves.toMatchObject({
       schemaVersion: 3,
       status: "passed",
       endpoints: expect.any(Array),
     });
  });

  it("fails the live Spotlight probe quickly instead of waiting on the global API timeout", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const requestOptions = new Map();

    await validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async (url, options) => {
        requestOptions.set(url, options);
        const payload = publicApiPayloadForUrl(url, { featured: [] });
        return {
          res: Response.json(payload),
          text: JSON.stringify(payload),
        };
      },
    });

    expect(requestOptions.get(
      "https://portal.maiprop.co/api/public/homepage?section=featured",
    )?.timeoutMs).toBe(3_500);
  });

  it("enforces exact staging budgets for open-house and homepage catalogue endpoints", async () => {
    const { PUBLIC_API_BUDGETS } = await import(
      "./check-production-deploy-public-api.mjs"
    );

    expect(Object.fromEntries(PUBLIC_API_BUDGETS)).toMatchObject({
      "/api/public/open-houses?limit=1": {
        maxMs: 1_800,
        maxBytes: 180_000,
      },
      "/api/public/open-houses?limit=1&includeMeta=1": {
        maxMs: 1_800,
        maxBytes: 180_000,
      },
      "/api/public/homepage?section=auctions": {
        maxMs: 2_500,
        maxBytes: 120_000,
      },
      "/api/public/homepage?section=open-houses": {
        maxMs: 2_500,
        maxBytes: 100_000,
      },
    });
  });

  it("rejects inactive or expired rows returned by the Spotlight endpoint", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const invalidRows = [
      {
        ...featuredHomepagePayload()[0],
        is_featured: false,
      },
      {
        ...featuredHomepagePayload()[0],
        id: "expired-featured",
        featured_until: "2000-01-01T00:00:00.000Z",
      },
    ];

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async (url) => {
        const payload = publicApiPayloadForUrl(url, { featured: invalidRows });
        return {
          res: Response.json(payload),
          text: JSON.stringify(payload),
        };
      },
    })).rejects.toThrow(/inactive or expired Spotlight row/);
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

  it("does not let the removed fail-open environment setting tolerate SPA HTML", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const previous = process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
    process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = "true";

    try {
      await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
        fetchText: async () => ({
          res: new Response("<!doctype html><div id=\"root\"></div>", {
            headers: { "Content-Type": "text/html; charset=utf-8" },
          }),
          text: "<!doctype html><div id=\"root\"></div>",
        }),
      })).rejects.toThrow("returned HTML instead of JSON");
    } finally {
      if (previous === undefined) delete process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
      else process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = previous;
    }
  });

  it("rejects wrong content types even when the body happens to contain JSON", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async () => ({
        res: new Response('{"data":[]}', {
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        }),
        text: '{"data":[]}',
      }),
    })).rejects.toThrow("returned text/plain; charset=utf-8 instead of JSON");
  });

  it("rejects JSON with the wrong endpoint payload shape", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const text = JSON.stringify({ data: "not-an-array" });

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async () => ({
        res: new Response(text, {
          headers: { "Content-Type": "application/json" },
        }),
        text,
      }),
    })).rejects.toThrow("invalid listings payload");
  });

  it("fails when an endpoint request times out", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const timeout = Object.assign(new Error("request timed out"), { name: "TimeoutError" });

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async () => {
        throw timeout;
      },
    })).rejects.toMatchObject({
      name: "TimeoutError",
      message: "request timed out",
    });
  });

  it("fails redirects through the shared release HTTP trust boundary", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(async () =>
      new Response(null, {
        status: 302,
        headers: { Location: "https://attacker.example/collect" },
      }));

    try {
      await expect(validatePublicApiEndpoints("https://portal.maiprop.co"))
        .rejects.toThrow(/refused redirect.*attacker\.example/i);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it.each([
    [500, { error: "Unexpected upstream failure" }],
    [502, { error: "Bad gateway" }],
    [503, { error: "Supabase upstream unavailable" }],
  ])("rejects HTTP %i API and upstream failures", async (status, payload) => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const text = JSON.stringify(payload);

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async () => ({
        res: new Response(text, {
          status,
          headers: { "Content-Type": "application/json" },
        }),
        text,
      }),
    })).rejects.toThrow(`returned HTTP ${status}`);
  });

  it("does not hide a first-request Supabase outage behind a successful retry", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const calls = [];

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      fetchText: async (url) => {
        calls.push(url);
        return {
          res: Response.json({ error: "Supabase upstream unavailable" }, { status: 503 }),
          text: JSON.stringify({ error: "Supabase upstream unavailable" }),
        };
      },
    })).rejects.toThrow("returned HTTP 503");

    expect(calls[0]).toBe("https://portal.maiprop.co/api/public/listings?limit=1");
    expect(calls).toHaveLength(1);
  });

  it("does not let the removed fail-open environment setting tolerate an upstream outage", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const previous = process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
    process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = "true";

    try {
      await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
        fetchText: async () => ({
          res: Response.json({ error: "Supabase upstream unavailable" }, { status: 503 }),
          text: JSON.stringify({ error: "Supabase upstream unavailable" }),
        }),
      })).rejects.toThrow("returned HTTP 503");
    } finally {
      if (previous === undefined) delete process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN;
      else process.env.PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN = previous;
    }
  });

  it("does not allow an assertion override to suppress an API failure", async () => {
    const { validatePublicApiEndpoints } = await import("./check-production-deploy-public-api.mjs");
    const text = JSON.stringify(publicListingsPayloadFromUrl(
      "https://portal.maiprop.co/api/public/listings?limit=1",
    ));

    await expect(validatePublicApiEndpoints("https://portal.maiprop.co", {
      assertOk: () => {},
      fetchText: async () => ({
        res: new Response(text, {
          status: 503,
          headers: { "Content-Type": "application/json" },
        }),
        text,
      }),
    })).rejects.toThrow("returned HTTP 503");
  });

  it("rejects the retired fail-open CLI option instead of silently ignoring it", () => {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-production-deploy.mjs", "--public-api-allow-fail-open"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: {
          ...process.env,
          PRODUCTION_DEPLOY_CHECK_ATTEMPTS: "1",
          PRODUCTION_DEPLOY_CHECK_DELAY_MS: "0",
        },
      },
    );

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(
      "Unsupported production deploy check option: --public-api-allow-fail-open",
    );
  });

  it("contains no compatibility escape for public API failures", () => {
    for (const path of [
      "scripts/check-production-deploy-public-api.mjs",
      "scripts/check-production-deploy.mjs",
      "docs/ENV_SETUP.md",
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("PRODUCTION_DEPLOY_PUBLIC_API_ALLOW_FAIL_OPEN");
      expect(source).not.toContain("--public-api-allow-fail-open");
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

describe("production deploy structured evidence", () => {
  it("builds a serializable attestation envelope from target-level endpoint evidence", () => {
    const target = {
      baseUrl: "https://staging.maiprop.co/",
      status: "passed",
      builtAssets: "passed",
      browser: "passed",
      publicApi: {
        schemaVersion: 1,
        kind: "maiprop-public-api-deploy-verification",
        baseUrl: "https://staging.maiprop.co/",
        status: "passed",
        endpoints: [
          {
            path: "/api/public/listings?limit=1",
            url: "https://staging.maiprop.co/api/public/listings?limit=1",
            status: "passed",
            httpStatus: 200,
          },
        ],
      },
    };

    const program = [
      'import { createDeployVerificationEvidence } from "./scripts/check-production-deploy.mjs";',
      `const target = ${JSON.stringify(target)};`,
      "const evidence = createDeployVerificationEvidence([target], { generatedAt: \"2026-07-28T12:00:00.000Z\" });",
      "process.stdout.write(JSON.stringify(evidence));",
    ].join("\n");
    const evidence = JSON.parse(execFileSync(
      process.execPath,
      ["--input-type=module", "--eval", program],
      { cwd: process.cwd(), encoding: "utf8" },
    ));

    expect(evidence).toEqual({
      schemaVersion: 1,
      kind: "maiprop-deploy-verification",
      generatedAt: "2026-07-28T12:00:00.000Z",
      status: "passed",
      targets: [target],
    });
    expect(JSON.parse(JSON.stringify(evidence))).toEqual(evidence);
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
          res: new Response(JSON.stringify({ release_sha: "abc123" }), {
            headers: { "Content-Type": "application/json; charset=utf-8" },
          }),
          text: JSON.stringify({ release_sha: "abc123" }),
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
        res: new Response(JSON.stringify({ release_sha: "old-sha" }), {
          headers: { "Content-Type": "application/json" },
        }),
        text: JSON.stringify({ release_sha: "old-sha" }),
      }),
    })).rejects.toThrow(
      "https://portal.maiprop.co/deploy-version.json is serving deployment old-sha instead of new-sha",
    );
  });
});
