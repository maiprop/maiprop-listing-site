import { findPublicApiFixtureMarker } from "./public-api-fixture-guard.mjs";
import { fetchReleaseResource } from "./release-http.mjs";

const FETCH_TIMEOUT_MS = 30_000;
const USER_AGENT = "maiprop-production-deploy-check/1.0";

const publicApiPaths = [
  "/api/public/listings?limit=1",
  "/api/public/listings?listing_type=sale&page=1&pageSize=12",
  "/api/public/listings?listing_type=sale&page=1&pageSize=28&offset=12",
  "/api/public/listings?listing_type=sale&page=1&limit=40",
  "/api/public/listings?listing_type=rent&page=1&pageSize=12",
  "/api/public/listings?listing_type=rent&page=1&limit=40",
  "/api/public/listings?listing_type=new_build&limit=1",
  "/api/public/homepage?section=featured",
  "/api/public/open-houses?limit=1",
  "/api/public/open-houses?limit=1&includeMeta=1",
  "/api/public/auctions?limit=60",
  "/api/public/auctions?limit=600",
  "/api/public/homepage?section=auctions",
  "/api/public/homepage?section=open-houses",
  "/api/public/homepage?section=type-counts",
  "/api/public/homepage?section=price-index",
  "/api/public/homepage?section=popular-locations",
  "/api/public/homepage?section=auction-count",
];

export const PUBLIC_API_BUDGETS = new Map([
  ["/api/public/listings?listing_type=sale&page=1&pageSize=12", { maxMs: 1_800, maxBytes: 180_000 }],
  ["/api/public/listings?listing_type=sale&page=1&pageSize=28&offset=12", { maxMs: 2_500, maxBytes: 320_000 }],
  ["/api/public/listings?listing_type=sale&page=1&limit=40", { maxMs: 4_000, maxBytes: 450_000 }],
  ["/api/public/listings?listing_type=rent&page=1&pageSize=12", { maxMs: 1_800, maxBytes: 180_000 }],
  ["/api/public/listings?listing_type=rent&page=1&limit=40", { maxMs: 4_000, maxBytes: 450_000 }],
  ["/api/public/homepage?section=featured", { maxMs: 2_500, maxBytes: 100_000 }],
  ["/api/public/open-houses?limit=1", { maxMs: 1_800, maxBytes: 180_000 }],
  ["/api/public/open-houses?limit=1&includeMeta=1", { maxMs: 1_800, maxBytes: 180_000 }],
  ["/api/public/auctions?limit=60", { maxMs: 3_500, maxBytes: 120_000 }],
  ["/api/public/auctions?limit=600", { maxMs: 3_500, maxBytes: 120_000 }],
  ["/api/public/homepage?section=auctions", { maxMs: 2_500, maxBytes: 120_000 }],
  ["/api/public/homepage?section=open-houses", { maxMs: 2_500, maxBytes: 100_000 }],
]);

const listingDetailSourcePaths = new Set([
  "/api/public/listings?limit=1",
  "/api/public/listings?listing_type=new_build&limit=1",
  "/api/public/auctions?limit=60",
]);
const MAX_DETAIL_CHECK_IDS = 3;
const CACHE_STATES = new Set([
  "BYPASS",
  "COALESCED",
  "HIT",
  "MISS",
  "STALE",
  "STALE_SEED",
]);

const defaultAssertOk = (condition, message) => {
  if (!condition) throw new Error(message);
};

const defaultFetchText = async (url, options = {}) => {
  const { allowHttpError: _allowHttpError, headers, timeoutMs = FETCH_TIMEOUT_MS, ...requestOptions } = options;
  const res = await fetchReleaseResource(url, {
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": USER_AGENT,
      ...(headers ?? {}),
    },
    ...requestOptions,
  });
  const text = await res.text();
  return { res, text };
};

function extractPublicListingIds(body) {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray(body.data)
      ? body.data
      : [];

  return rows
    .map((row) => row && typeof row === "object" ? row.id : null)
    .filter((id) => typeof id === "string" && id.trim().length > 0);
}

function hasOwn(value, key) {
  return Boolean(value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, key));
}

function validatePublicApiShape(path, body, assertOk) {
  if (path.startsWith("/api/public/listings")) {
    const url = new URL(path, "https://probe.local");
    const expectedPageSize = Number(url.searchParams.get("pageSize") ?? url.searchParams.get("limit"));
    const rawExpectedOffset = url.searchParams.get("offset");
    const expectedOffset = rawExpectedOffset == null
      ? null
      : Number(rawExpectedOffset);
    assertOk(
      body && typeof body === "object" && Array.isArray(body.data),
      `${path} returned an invalid listings payload; expected { data: [] }`,
    );
    assertOk(
      typeof body.hasMore === "boolean" || body.hasMore === undefined,
      `${path} returned an invalid listings hasMore flag`,
    );
    if (Number.isFinite(expectedPageSize)) {
      assertOk(
        body.pageSize === expectedPageSize,
        `${path} returned pageSize ${body.pageSize} instead of ${expectedPageSize}`,
      );
    }
    if (expectedOffset != null && Number.isFinite(expectedOffset)) {
      assertOk(
        body.offset === expectedOffset,
        `${path} returned offset ${body.offset} instead of ${expectedOffset}`,
      );
    }
    return "listings-feed";
  }

  if (
    path.startsWith("/api/public/auctions") ||
    path.includes("section=auctions")
  ) {
    assertOk(
      body && typeof body === "object" && Array.isArray(body.data),
      `${path} returned an invalid auctions payload; expected { data: [] }`,
    );
    assertOk(
      body.data.length <= 60,
      `${path} exposed ${body.data.length} public auctions; the anonymous cap is 60`,
    );
    return "auctions-feed";
  }

  if (path.startsWith("/api/public/listing?")) {
    const row = body && typeof body === "object" && body.data && typeof body.data === "object"
      ? body.data
      : body;
    assertOk(
      row && typeof row === "object" && !Array.isArray(row),
      `${path} returned an invalid listing detail payload`,
    );
    return "listing-detail";
  }

  if (path.startsWith("/api/public/open-houses")) {
    const includeMeta = new URL(path, "https://probe.local")
      .searchParams.get("includeMeta") === "1";
    if (includeMeta) {
      assertOk(
        body && typeof body === "object" && Array.isArray(body.data),
        `${path} returned an invalid metadata payload; expected { data: [] }`,
      );
      assertOk(
        typeof body.hasMore === "boolean" &&
          (typeof body.nextCursor === "string" || body.nextCursor === null) &&
          Number.isSafeInteger(body.publicationId) &&
          body.publicationId > 0,
        `${path} returned invalid open-house cursor metadata`,
      );
      return "open-houses-cursor-feed";
    }
    assertOk(
      Array.isArray(body),
      `${path} returned an invalid list payload; expected an array`,
    );
    return "open-houses-feed";
  }

  if (path.includes("section=featured")) {
    assertOk(Array.isArray(body), `${path} returned an invalid homepage featured payload; expected an array`);
    for (const [index, row] of body.entries()) {
      for (const key of ["owner_id", "profiles", "has_video_tour", "has_virtual_tour", "is_featured", "featured_until", "priority_placement"]) {
        assertOk(hasOwn(row, key), `${path} returned Spotlight row without ${key}`);
      }
      const featuredUntil = Date.parse(String(row.featured_until ?? ""));
      assertOk(
        row.is_featured === true && Number.isFinite(featuredUntil) && featuredUntil > Date.now(),
        `${path} returned inactive or expired Spotlight row at index ${index}`,
      );
    }
    return "homepage-featured";
  }

  if (path.includes("section=open-houses") || path.includes("section=popular-locations") || path.includes("section=price-index")) {
    assertOk(Array.isArray(body), `${path} returned an invalid homepage list payload; expected an array`);
    return "homepage-list";
  }

  if (path.includes("section=type-counts")) {
    assertOk(body && typeof body === "object" && !Array.isArray(body), `${path} returned an invalid type-count payload`);
    return "homepage-type-counts";
  }

  if (path.includes("section=auction-count")) {
    assertOk(typeof body === "number", `${path} returned an invalid auction-count payload`);
    return "homepage-auction-count";
  }

  assertOk(false, `${path} has no deploy-verification payload contract`);
}

async function validateJsonApiPath(
  baseUrl,
  path,
  { assertOk, fetchText, requestHeaders },
) {
  const apiUrl = new URL(path, baseUrl).toString();
  const budget = PUBLIC_API_BUDGETS.get(path);
  const startedAt = performance.now();
  const { res, text } = await fetchText(apiUrl, {
    headers: {
      accept: "application/json",
      ...(requestHeaders ?? {}),
    },
    allowHttpError: true,
    timeoutMs: budget ? budget.maxMs + 1_000 : FETCH_TIMEOUT_MS,
  });
  const elapsedMs = performance.now() - startedAt;
  const responseBytes = new TextEncoder().encode(text).byteLength;
  const contentType = res.headers.get("content-type") ?? "";
  const htmlFallback =
    /text\/html/i.test(contentType) &&
    /<html|<div id=["']root["']|cloudflare access|private preview/i.test(text);
  if (!/application\/json/i.test(contentType)) {
    const message = htmlFallback
      ? `${apiUrl} returned HTML instead of JSON; the Cloudflare Pages Function was not invoked or failed open to the SPA fallback`
      : `${apiUrl} returned ${contentType || "<missing>"} instead of JSON`;
    assertOk(false, message);
  }

  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${apiUrl} returned invalid JSON: ${error.message}`);
  }

  assertOk(res.ok, `${apiUrl} returned HTTP ${res.status}: ${text.slice(0, 160)}`);
  assertOk(
    !(body && typeof body === "object" && "error" in body),
    `${apiUrl} returned API error: ${JSON.stringify(body).slice(0, 240)}`,
  );
  const shape = validatePublicApiShape(path, body, assertOk);

  if (budget) {
    assertOk(
      elapsedMs <= budget.maxMs,
      `${apiUrl} exceeded API latency budget: ${Math.round(elapsedMs)}ms > ${budget.maxMs}ms`,
    );
    assertOk(
      responseBytes <= budget.maxBytes,
      `${apiUrl} exceeded response size budget: ${responseBytes} bytes > ${budget.maxBytes} bytes`,
    );
  }

  const fixtureMarker = findPublicApiFixtureMarker(body);
  assertOk(
    fixtureMarker === null,
    `${apiUrl} returned production-blocked fixture content (${fixtureMarker?.marker}) at ${fixtureMarker?.path}: ${fixtureMarker?.value}`,
  );

  return {
    body,
    evidence: {
      path,
      url: apiUrl,
      status: "passed",
      httpStatus: res.status,
      contentType,
      responseBytes,
      elapsedMs: Math.round(elapsedMs * 100) / 100,
      timeoutMs: budget ? budget.maxMs + 1_000 : FETCH_TIMEOUT_MS,
      latencyBudgetMs: budget?.maxMs ?? null,
      responseSizeBudgetBytes: budget?.maxBytes ?? null,
      responseOk: "passed",
      payloadShape: "passed",
      payloadContract: shape,
      fixtureGuard: "passed",
      cacheStatus: res.headers.get("x-maiprop-cache"),
    },
  };
}

function rowIds(body) {
  const rows = Array.isArray(body)
    ? body
    : body && typeof body === "object" && Array.isArray(body.data)
      ? body.data
      : [];
  return rows
    .map((row) => row && typeof row === "object" ? row.id : null)
    .filter((id) => typeof id === "string" && id.length > 0);
}

function cursorPath(path, cursor) {
  const url = new URL(path, "https://probe.local");
  url.searchParams.set("cursor", cursor);
  return `${url.pathname}${url.search}`;
}

async function validateCursorRoundTrip(
  baseUrl,
  firstPath,
  firstBody,
  { assertOk, fetchText },
) {
  assertOk(
    firstBody?.hasMore === true &&
      typeof firstBody.nextCursor === "string" &&
      firstBody.nextCursor.length > 0,
    `${firstPath} did not expose a cursor for live round-trip proof`,
  );
  const secondPath = cursorPath(firstPath, firstBody.nextCursor);
  const second = await validateJsonApiPath(baseUrl, secondPath, {
    assertOk,
    fetchText,
  });
  assertOk(
    second.body?.publicationId === firstBody.publicationId,
    `${secondPath} changed catalogue publication during cursor traversal`,
  );
  const firstIds = new Set(rowIds(firstBody));
  const duplicate = rowIds(second.body).find((id) => firstIds.has(id));
  assertOk(
    duplicate === undefined,
    `${secondPath} repeated listing ${duplicate} across cursor pages`,
  );
  return {
    evidence: second.evidence,
    proof: {
      firstPath,
      secondPath,
      publicationId: firstBody.publicationId,
      firstIds: [...firstIds],
      secondIds: rowIds(second.body),
      status: "passed",
    },
  };
}

async function validateTurnCredentialBoundary(
  baseUrl,
  { assertOk, fetchText },
) {
  const path = "/api/turn-credentials";
  const apiUrl = new URL(path, baseUrl).toString();
  const requestBody = {
    roomId: "video:viewing:11111111-1111-4111-8111-111111111111",
  };
  const { res, text } = await fetchText(apiUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
    },
    body: JSON.stringify(requestBody),
    allowHttpError: true,
  });
  const contentType = res.headers.get("content-type") ?? "";
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${apiUrl} returned invalid JSON: ${error.message}`);
  }
  assertOk(
    res.status === 401,
    `${apiUrl} did not reject an unauthenticated credential request with HTTP 401`,
  );
  assertOk(
    /application\/json/i.test(contentType) &&
      body?.error === "Authentication required",
    `${apiUrl} did not expose the expected authentication boundary`,
  );
  assertOk(
    /\bno-store\b/i.test(res.headers.get("cache-control") ?? ""),
    `${apiUrl} did not disable credential response caching`,
  );
  const vary = (res.headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  assertOk(
    vary.includes("authorization"),
    `${apiUrl} did not vary credential responses by Authorization`,
  );
  return {
    path,
    url: apiUrl,
    requestMethod: "POST",
    expectedHttpStatus: 401,
    httpStatus: res.status,
    authenticationBoundary: "passed",
    cacheControl: "passed",
    varyAuthorization: "passed",
    status: "passed",
  };
}

export async function validateAuthenticatedTurnCredentialIssuance(
  baseUrl,
  {
    accessToken,
    roomId,
    expectedTtlSeconds,
    assertOk = defaultAssertOk,
    fetchText = defaultFetchText,
  } = {},
) {
  assertOk(
    typeof accessToken === "string" && accessToken.trim().length > 0,
    "Authenticated TURN proof requires an access token",
  );
  assertOk(
    typeof roomId === "string" && roomId.trim().length > 0,
    "Authenticated TURN proof requires an authorized room id",
  );
  const path = "/api/turn-credentials";
  const apiUrl = new URL(path, baseUrl).toString();
  const { res, text } = await fetchText(apiUrl, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ roomId }),
    allowHttpError: true,
  });
  const contentType = res.headers.get("content-type") ?? "";
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`${apiUrl} returned invalid JSON: ${error.message}`);
  }

  assertOk(
    res.status === 200,
    `${apiUrl} did not issue credentials for an authenticated authorized room (HTTP ${res.status})`,
  );
  assertOk(
    /application\/json/i.test(contentType),
    `${apiUrl} did not return authenticated TURN proof as JSON`,
  );
  assertOk(
    /\bno-store\b/i.test(res.headers.get("cache-control") ?? "") &&
      /\bno-store\b/i.test(res.headers.get("cdn-cache-control") ?? ""),
    `${apiUrl} did not disable browser and CDN credential response caching`,
  );
  const vary = (res.headers.get("vary") ?? "")
    .split(",")
    .map((value) => value.trim().toLowerCase());
  assertOk(
    vary.includes("authorization"),
    `${apiUrl} did not vary credential responses by Authorization`,
  );
  assertOk(
    Number.isSafeInteger(body?.expiresIn) &&
      body.expiresIn >= 300 &&
      body.expiresIn <= 86_400,
    `${apiUrl} returned an invalid credential TTL`,
  );
  if (Number.isSafeInteger(expectedTtlSeconds)) {
    assertOk(
      body.expiresIn === expectedTtlSeconds,
      `${apiUrl} returned an unexpected credential TTL`,
    );
  }
  assertOk(
    Array.isArray(body?.iceServers) && body.iceServers.length > 0,
    `${apiUrl} returned no ICE servers`,
  );

  let turnUrlCount = 0;
  let credentialsPresent = false;
  for (const server of body.iceServers) {
    assertOk(
      server && typeof server === "object" && !Array.isArray(server),
      `${apiUrl} returned an invalid ICE server`,
    );
    const urls = typeof server.urls === "string"
      ? [server.urls]
      : Array.isArray(server.urls)
        ? server.urls
        : [];
    assertOk(
      urls.length > 0 && urls.every((url) => typeof url === "string"),
      `${apiUrl} returned an ICE server without valid URLs`,
    );
    const serverTurnUrlCount = urls.filter((url) =>
      /^turns?:/i.test(url)
    ).length;
    turnUrlCount += serverTurnUrlCount;
    if (
      serverTurnUrlCount > 0 &&
      typeof server.username === "string" &&
      server.username.length > 0 &&
      typeof server.credential === "string" &&
      server.credential.length > 0
    ) {
      credentialsPresent = true;
    }
  }
  assertOk(
    turnUrlCount > 0 && credentialsPresent,
    `${apiUrl} did not return authenticated TURN relay credentials`,
  );

  return {
    path,
    url: apiUrl,
    requestMethod: "POST",
    httpStatus: res.status,
    authentication: "passed",
    authorizedRoom: "passed",
    expiresIn: body.expiresIn,
    iceServerCount: body.iceServers.length,
    turnUrlCount,
    credentialsPresent: true,
    credentialsRedacted: true,
    cacheControl: "passed",
    varyAuthorization: "passed",
    status: "passed",
  };
}

export async function validatePublicApiEndpoints(
  baseUrl,
  {
    fetchText = defaultFetchText,
    operationalProof = false,
    turnCredentialProof,
  } = {},
) {
  const assertOk = defaultAssertOk;
  const listingIds = new Set();
  const endpoints = [];
  const results = new Map();

  for (const path of publicApiPaths) {
    const { body, evidence } = await validateJsonApiPath(baseUrl, path, {
      assertOk,
      fetchText,
    });
    endpoints.push(evidence);
    results.set(path, { body, evidence });
    if (listingDetailSourcePaths.has(path)) {
      for (const id of extractPublicListingIds(body)) {
        if (listingIds.size >= MAX_DETAIL_CHECK_IDS) break;
        listingIds.add(id);
      }
    }
  }

  const canonicalAuctionBody = results.get(
    "/api/public/auctions?limit=60",
  )?.body;
  const homepageAuctionBody = results.get(
    "/api/public/homepage?section=auctions",
  )?.body;
  const canonicalAuctionIds = rowIds(canonicalAuctionBody);
  const homepageAuctionIds = rowIds(homepageAuctionBody);
  assertOk(
    homepageAuctionIds.length === Math.min(6, canonicalAuctionIds.length) &&
      homepageAuctionIds.every(
        (id, index) => id === canonicalAuctionIds[index],
      ),
    "Homepage auctions are not the canonical auction prefix in the same order",
  );

  const operational = {
    auctionConsistency: {
      canonicalPath: "/api/public/auctions?limit=60",
      homepagePath: "/api/public/homepage?section=auctions",
      canonicalIds: canonicalAuctionIds,
      homepageIds: homepageAuctionIds,
      status: "passed",
    },
  };

  if (operationalProof) {
    const listingFirstPath = "/api/public/listings?limit=1";
    const listingFirst = results.get(listingFirstPath)?.body;
    const listingCursor = await validateCursorRoundTrip(
      baseUrl,
      listingFirstPath,
      listingFirst,
      { assertOk, fetchText },
    );
    endpoints.push(listingCursor.evidence);

    let openHouseFirstPath =
      "/api/public/open-houses?limit=1&includeMeta=1";
    let openHouseFirst = results.get(openHouseFirstPath)?.body;
    if (
      openHouseFirst?.hasMore !== true ||
      typeof openHouseFirst.nextCursor !== "string"
    ) {
      openHouseFirstPath =
        "/api/public/open-houses?limit=1&includeMeta=1&showPast=1";
      const fallback = await validateJsonApiPath(baseUrl, openHouseFirstPath, {
        assertOk,
        fetchText,
      });
      endpoints.push(fallback.evidence);
      openHouseFirst = fallback.body;
    }
    const openHouseCursor = await validateCursorRoundTrip(
      baseUrl,
      openHouseFirstPath,
      openHouseFirst,
      { assertOk, fetchText },
    );
    endpoints.push(openHouseCursor.evidence);

    const listingId = rowIds(listingFirst)[0];
    assertOk(
      typeof listingId === "string" &&
        Number.isSafeInteger(listingFirst?.publicationId),
      "Listings feed did not expose a publication-pinnable detail row",
    );
    const pinnedDetailPath =
      `/api/public/listing?id=${encodeURIComponent(listingId)}` +
      `&publicationId=${listingFirst.publicationId}`;
    const pinnedDetail = await validateJsonApiPath(
      baseUrl,
      pinnedDetailPath,
      { assertOk, fetchText },
    );
    endpoints.push(pinnedDetail.evidence);
    assertOk(
      pinnedDetail.body?.publicationId === listingFirst.publicationId &&
        pinnedDetail.body?.data?.id === listingId,
      `${pinnedDetailPath} did not preserve its requested publication`,
    );

    const cachePath =
      "/api/public/listings?listing_type=sale&page=1&pageSize=12";
    const initialCacheState = results.get(cachePath)?.evidence?.cacheStatus;
    const cacheFollowUp = await validateJsonApiPath(baseUrl, cachePath, {
      assertOk,
      fetchText,
      requestHeaders: {
        "cache-control": "no-cache",
        pragma: "no-cache",
      },
    });
    endpoints.push(cacheFollowUp.evidence);
    const warmedCacheState = cacheFollowUp.evidence.cacheStatus;
    assertOk(
      CACHE_STATES.has(initialCacheState) &&
        ["COALESCED", "HIT", "STALE"].includes(warmedCacheState),
      `${cachePath} did not expose a valid cache warm-up transition ` +
        `(${initialCacheState ?? "<missing>"} -> ` +
        `${warmedCacheState ?? "<missing>"})`,
    );

    const turnCredentialBoundary = await validateTurnCredentialBoundary(
      baseUrl,
      { assertOk, fetchText },
    );
    const turnCredentialIssuance = turnCredentialProof
      ? await validateAuthenticatedTurnCredentialIssuance(baseUrl, {
          ...turnCredentialProof,
          assertOk,
          fetchText,
        })
      : null;

    Object.assign(operational, {
      listingsCursor: listingCursor.proof,
      openHousesCursor: openHouseCursor.proof,
      publicationPinning: {
        path: pinnedDetailPath,
        listingId,
        publicationId: listingFirst.publicationId,
        status: "passed",
      },
      cacheTransition: {
        path: cachePath,
        initial: initialCacheState,
        warmed: warmedCacheState,
        status: "passed",
      },
      turnCredentialBoundary,
      ...(turnCredentialIssuance ? { turnCredentialIssuance } : {}),
    });
  }

  for (const id of listingIds) {
    const detailPath = `/api/public/listing?id=${encodeURIComponent(id)}`;
    const { body, evidence } = await validateJsonApiPath(baseUrl, detailPath, { assertOk, fetchText });
    const detailId = body && typeof body === "object" && body.data && typeof body.data === "object"
      ? body.data.id
      : body?.id;
    assertOk(
      !detailId || detailId === id,
      `${new URL(detailPath, baseUrl).toString()} returned listing id ${detailId} instead of ${id}`,
    );
    endpoints.push({
      ...evidence,
      expectedListingId: id,
      listingIdMatch: "passed",
    });
  }

  return {
    schemaVersion: 3,
    kind: "maiprop-public-api-deploy-verification",
    baseUrl: new URL(baseUrl).toString(),
    status: "passed",
    endpoints,
    operational,
  };
}
