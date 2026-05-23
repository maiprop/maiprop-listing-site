/* global Deno:readonly */
/**
 * Unit coverage for fetch-os-auctions request shaping and public rate-limit keying.
 */
import {
  assertEquals,
  assertNotEquals,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  authedReq,
  captureHandler,
  jsonBody,
  req,
} from "../_shared/testUtils.ts";

const { handler, restore } = await captureHandler(
  import.meta.url,
  "./index.ts",
  {
    RATE_LIMIT_FORCE_MEMORY: "true",
    MAIPROP_OS_URL: "https://app.os.maiprop.co",
  },
);
const {
  buildFilterRequest,
  getFetchErrorPayload,
  getValidatedPagination,
  getRateLimitKey,
  mapAuction,
  hasPortalProAccess,
  getAuctionSamplePageNumbers,
  getFastNationalSamplePages,
  selectDiverseAuctionSample,
  clearAuctionResponseCache,
} = await import("./index.ts");

Deno.test("buildFilterRequest forwards sort fields to OS", () => {
  const request = buildFilterRequest({
    auctionDateFrom: "2026-05-07",
    sortBy: "AUCTION_DATE",
    order: "ASC",
  });

  assertEquals(request.auctionDateFrom, "2026-05-07");
  assertEquals(request.sortBy, "AUCTION_DATE");
  assertEquals(request.order, "ASC");
});

Deno.test("rate-limit key ignores spoofable forwarded IP headers", async () => {
  const first = new Request("https://functions.supabase.co/fetch-os-auctions", {
    headers: { "x-forwarded-for": "1.1.1.1" },
  });
  const second = new Request(
    "https://functions.supabase.co/fetch-os-auctions",
    {
      headers: { "x-forwarded-for": "2.2.2.2" },
    },
  );

  assertEquals(await getRateLimitKey(first), "anonymous");
  assertEquals(await getRateLimitKey(second), "anonymous");
});

Deno.test("rate-limit key uses a stable token hash for authenticated callers", async () => {
  const first = new Request("https://functions.supabase.co/fetch-os-auctions", {
    headers: { authorization: "Bearer token-a" },
  });
  const second = new Request(
    "https://functions.supabase.co/fetch-os-auctions",
    {
      headers: { authorization: "Bearer token-b" },
    },
  );

  const firstKey = await getRateLimitKey(first);
  assertEquals(firstKey, await getRateLimitKey(first));
  assertNotEquals(firstKey, await getRateLimitKey(second));
});

Deno.test("mapAuction drops malformed numeric fields", () => {
  const mapped = mapAuction({
    auctionListingId: 42,
    propertyLatitude: "not-lat",
    propertyLongitude: "23.7",
    propertySquareMeters: "not-sqm",
    constructionYear: "not-year",
    firstPriceOffer: "not-price",
    ownershipPercentage: "not-ownership",
  });

  assertEquals(mapped.price, 0);
  assertEquals(mapped.cover_image_url, null);
  assertEquals(mapped.sqm, 1);
  assertEquals(mapped.latitude, null);
  assertEquals(mapped.longitude, 23.7);
  assertEquals(mapped.year_built, null);
  assertEquals(mapped.tags.includes("ownership_pct:NaN"), false);
});

Deno.test("national auction sampling spreads page reads across the source catalogue", () => {
  const pages = getAuctionSamplePageNumbers(8678, 60, 10, "seed");

  assertEquals(pages.length, 10);
  assertEquals(new Set(pages).size, 10);
  assertEquals(pages[0] < 10, true);
  assertEquals(pages.some((page) => page > 120), true);
});

Deno.test("national auction sampling avoids returning one municipality cluster first", () => {
  const clustered = [
    ...Array.from({ length: 10 }, (_, i) =>
      mapAuction({
        auctionListingId: `athens-${i}`,
        propertyMunicipalityName: "Αθηναίων",
        propertyPrefectureName: "Αττικής",
      })),
    ...Array.from({ length: 10 }, (_, i) =>
      mapAuction({
        auctionListingId: `crete-${i}`,
        propertyMunicipalityName: "Ηρακλείου",
        propertyPrefectureName: "Ηρακλείου",
      })),
    ...Array.from({ length: 10 }, (_, i) =>
      mapAuction({
        auctionListingId: `thess-${i}`,
        propertyMunicipalityName: "Θεσσαλονίκης",
        propertyPrefectureName: "Θεσσαλονίκης",
      })),
  ];

  const sample = selectDiverseAuctionSample(clustered, 9, "seed");
  const regions = new Set(sample.map((row) => row.region));

  assertEquals(sample.length, 9);
  assertEquals(regions.size, 3);
});

Deno.test("fast national sampling keeps a bounded set of source pages", () => {
  assertEquals(
    getFastNationalSamplePages({
      fastSamplePages: [120, "40", 999, -1, 80, 60],
    }),
    [0, 40, 80, 120],
  );
  assertEquals(getFastNationalSamplePages({}), null);
});

Deno.test("OS upstream failures return sanitized client payload", () => {
  const payload = getFetchErrorPayload({
    kind: "os-api",
    status: 500,
    detail: "upstream stack trace with credentials",
  });

  assertEquals(payload.status, 502);
  assertEquals(payload.error, "Auction provider temporarily unavailable");
});

Deno.test("generic fetch failures return sanitized client payload", () => {
  const payload = getFetchErrorPayload(
    new Error("connection failed with token=secret"),
  );

  assertEquals(payload.status, 500);
  assertEquals(payload.error, "Unable to fetch auctions");
});

Deno.test("handler rejects non-POST methods", async () => {
  const res = await handler(authedReq("GET"));
  assertEquals(res.status, 405);
});

Deno.test("pagination validation rejects malformed page/pageSize", () => {
  assertEquals(getValidatedPagination({ page: -1 }, 60), {
    error: "page must be a finite non-negative integer",
  });
  assertEquals(getValidatedPagination({ page: Number.NaN }, 60), {
    error: "page must be a finite non-negative integer",
  });
  assertEquals(getValidatedPagination({ pageSize: 0 }, 60), {
    error: "pageSize must be a finite integer between 1 and 60",
  });
  assertEquals(getValidatedPagination({ pageSize: 61 }, 60), {
    error: "pageSize must be a finite integer between 1 and 60",
  });
  assertEquals(getValidatedPagination({ page: 2, pageSize: 10 }, 60), {
    page: 2,
    size: 10,
  });
});

Deno.test("handler caches identical anonymous auction reads by cap and filter", async () => {
  clearAuctionResponseCache();
  const globalForFetch = globalThis as typeof globalThis & {
    fetch: typeof fetch;
  };
  const originalFetch = globalForFetch.fetch;
  let detailsRequests = 0;

  try {
    globalForFetch.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "os-token" }), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
        );
      }

      if (url.includes("/api/v1/auctions/filter/details")) {
        detailsRequests += 1;
        const requestBody = JSON.parse(String(init?.body ?? "{}")) as Record<
          string,
          unknown
        >;
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{
                auctionListingId: "cached-auction",
                auctionDate: requestBody.auctionDateFrom,
                firstPriceOffer: 120_000,
                propertyLatitude: 37.98,
                propertyLongitude: 23.73,
                propertyMunicipalityName: "Athens",
                propertyPrefectureName: "Attica",
              }],
              responseMetadata: { pagination: { totalElements: 1 } },
            }),
            { headers: { "content-type": "application/json" }, status: 200 },
          ),
        );
      }

      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }) as typeof fetch;

    const body = {
      auctionDateFrom: "2026-05-07",
      pageSize: 1,
      sampleAcrossGreece: false,
    };
    const first = await handler(req("POST", body));
    const second = await handler(req("POST", body));
    const firstPayload = await jsonBody(first) as {
      data: Array<Record<string, unknown>>;
      page: number;
      planCap: number;
      total: number;
    };
    const secondPayload = await jsonBody(second);

    assertEquals(first.status, 200);
    assertEquals(second.status, 200);
    assertEquals(detailsRequests, 1);
    assertEquals(firstPayload.planCap, 60);
    assertEquals(firstPayload.data[0].id, "cached-auction");
    assertEquals(secondPayload, firstPayload);
  } finally {
    globalForFetch.fetch = originalFetch;
    clearAuctionResponseCache();
  }
});

function makeEntitlementClient(
  profile: Record<string, unknown>,
  pricingRow: Record<string, unknown> | null = null,
  rpcProAccess: boolean | null = null,
) {
  return {
    rpc() {
      return Promise.resolve(
        rpcProAccess == null
          ? { data: null, error: { message: "rpc unavailable" } }
          : { data: rpcProAccess, error: null },
      );
    },
    from(table: string) {
      return {
        select() {
          return this;
        },
        eq() {
          return this;
        },
        in() {
          return this;
        },
        limit() {
          return this;
        },
        single() {
          if (table === "profiles") return Promise.resolve({ data: profile });
          return Promise.resolve({ data: null });
        },
        maybeSingle() {
          if (table === "pricing_configs") {
            return Promise.resolve({ data: pricingRow });
          }
          return Promise.resolve({ data: null });
        },
      };
    },
  };
}

Deno.test("OS portal access rejects non-investor Stripe products", async () => {
  const client = makeEntitlementClient({
    role: "agent",
    participant_type: "agent",
    subscription_product_id: "prod_agent",
    force_pro_access: false,
  });

  assertEquals(await hasPortalProAccess(client as never, "user-agent"), false);
});

Deno.test("OS portal access uses canonical Pro RPC for paid portal caps", async () => {
  const client = makeEntitlementClient(
    {
      role: "seller",
      participant_type: "seller",
      subscription_product_id: "prod_participant",
      force_pro_access: false,
    },
    null,
    true,
  );

  assertEquals(await hasPortalProAccess(client as never, "user-pro"), true);
});

Deno.test("OS portal access preserves Supabase RPC method binding", async () => {
  const client = {
    rest: { bound: true },
    rpc(this: { rest?: unknown }, functionName: string) {
      assertEquals(Boolean(this.rest), true);
      assertEquals(functionName, "is_pro");
      return Promise.resolve({ data: true, error: null });
    },
    from() {
      throw new Error("profile fallback should not run when canonical RPC works");
    },
  };

  assertEquals(await hasPortalProAccess(client as never, "user-pro"), true);
});

Deno.test("OS portal access accepts only investor-scoped pricing products", async () => {
  const client = makeEntitlementClient({
    role: "investor",
    participant_type: "investor",
    subscription_product_id: "prod_investor",
    force_pro_access: false,
  }, {
    key: "investor_private",
    audience: "investor",
    metadata: { stripe_product_id: "prod_investor" },
  });

  assertEquals(
    await hasPortalProAccess(client as never, "user-investor"),
    true,
  );
});

restore();
