/* global Deno:readonly */
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { fetchNationalAuctionSample, parseOsResponse } from "./osClient.ts";

Deno.test("OS client parses paginated OS responses without changing the total", () => {
  const result = parseOsResponse({
    data: [{ auctionListingId: "auction-1" }],
    responseMetadata: { pagination: { totalElements: 123 } },
  });

  assertEquals(result.auctions.length, 1);
  assertEquals(result.total, 123);
});

Deno.test("OS client parses array responses as already-sized result sets", () => {
  const result = parseOsResponse([{ auctionListingId: "auction-1" }]);

  assertEquals(result.auctions.length, 1);
  assertEquals(result.total, 1);
});

Deno.test("national sampling keeps free-sized requests at free-sized OS pages", async () => {
  const globalForFetch = globalThis as typeof globalThis & {
    fetch: typeof fetch;
  };
  const originalFetch = globalForFetch.fetch;
  const requestedPageSizes: number[] = [];

  try {
    globalForFetch.fetch = ((input: URL | RequestInfo, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "os-token" }), {
            headers: { "content-type": "application/json" },
          }),
        );
      }

      if (url.includes("/api/v1/auctions/filter/details")) {
        const requestUrl = new URL(url);
        requestedPageSizes.push(Number(requestUrl.searchParams.get("pageSize")));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ auctionListingId: `auction-${requestedPageSizes.length}` }],
              responseMetadata: { pagination: { totalElements: 9_600 } },
            }),
            { headers: { "content-type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }) as typeof fetch;

    await fetchNationalAuctionSample(
      { url: "https://app.os.maiprop.co", email: "test@test.com", password: "secret" },
      60,
      {},
    );

    assertEquals(requestedPageSizes.every((size) => size === 60), true);
  } finally {
    globalForFetch.fetch = originalFetch;
  }
});

Deno.test("national sampling still uses 600-row OS pages for Pro-sized requests", async () => {
  const globalForFetch = globalThis as typeof globalThis & {
    fetch: typeof fetch;
  };
  const originalFetch = globalForFetch.fetch;
  const requestedPageSizes: number[] = [];

  try {
    globalForFetch.fetch = ((input: URL | RequestInfo, _init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "os-token" }), {
            headers: { "content-type": "application/json" },
          }),
        );
      }

      if (url.includes("/api/v1/auctions/filter/details")) {
        const requestUrl = new URL(url);
        requestedPageSizes.push(Number(requestUrl.searchParams.get("pageSize")));
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{ auctionListingId: `auction-${requestedPageSizes.length}` }],
              responseMetadata: { pagination: { totalElements: 9_600 } },
            }),
            { headers: { "content-type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }) as typeof fetch;

    await fetchNationalAuctionSample(
      { url: "https://app.os.maiprop.co", email: "test@test.com", password: "secret" },
      600,
      {},
    );

    assertEquals(requestedPageSizes.every((size) => size === 600), true);
  } finally {
    globalForFetch.fetch = originalFetch;
  }
});
