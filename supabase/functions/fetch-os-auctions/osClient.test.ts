/* global Deno:readonly */
import {
  assertEquals,
  assertRejects,
} from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  fetchNationalAuctionSample,
  fetchOsAuctionDetails,
  parseOsResponse,
} from "./osClient.ts";

const OS_CONFIG = {
  url: "https://app.os.maiprop.co",
  email: "test@test.com",
  password: "secret",
};

function stalledResponse(
  init: RequestInit | undefined,
  onAbort: () => void,
  status = 200,
): Response {
  let fallbackTimer: number | undefined;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      fallbackTimer = setTimeout(() => {
        controller.error(
          new Error("mock body was not aborted before fallback"),
        );
      }, 250);
      init?.signal?.addEventListener("abort", () => {
        onAbort();
        clearTimeout(fallbackTimer);
        controller.error(new DOMException("Aborted", "AbortError"));
      }, { once: true });
    },
    cancel() {
      clearTimeout(fallbackTimer);
    },
  });
  return new Response(stream, {
    status,
    headers: { "content-type": "application/json" },
  });
}

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

Deno.test("OS auth timeout covers a stalled JSON response body", async () => {
  const originalFetch = globalThis.fetch;
  let abortObserved = false;

  try {
    globalThis.fetch = ((_input: URL | RequestInfo, init?: RequestInit) =>
      Promise.resolve(stalledResponse(init, () =>
        abortObserved = true))) as typeof fetch;

    const error = await assertRejects(
      () =>
        fetchOsAuctionDetails(OS_CONFIG, 0, 1, {}, { authTimeoutMs: 20 }),
      Error,
    );
    assertEquals(error.message.includes("timed out"), true);
    assertEquals(abortObserved, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OS provider timeout covers a stalled successful JSON body", async () => {
  const originalFetch = globalThis.fetch;
  let abortObserved = false;

  try {
    globalThis.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "os-token" })),
        );
      }
      return Promise.resolve(stalledResponse(init, () => abortObserved = true));
    }) as typeof fetch;

    const error = await assertRejects(
      () =>
        fetchOsAuctionDetails(OS_CONFIG, 0, 1, {}, { auctionTimeoutMs: 20 }),
      Error,
    );
    assertEquals(error.message.includes("timed out"), true);
    assertEquals(abortObserved, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

Deno.test("OS provider timeout covers a stalled error text body", async () => {
  const originalFetch = globalThis.fetch;
  let abortObserved = false;

  try {
    globalThis.fetch = ((input: URL | RequestInfo, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/auth/login")) {
        return Promise.resolve(
          new Response(JSON.stringify({ token: "os-token" })),
        );
      }
      return Promise.resolve(
        stalledResponse(init, () => abortObserved = true, 502),
      );
    }) as typeof fetch;

    const error = await assertRejects(
      () =>
        fetchOsAuctionDetails(OS_CONFIG, 0, 1, {}, { auctionTimeoutMs: 20 }),
      Error,
    );
    assertEquals(error.message.includes("timed out"), true);
    assertEquals(abortObserved, true);
  } finally {
    globalThis.fetch = originalFetch;
  }
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
        requestedPageSizes.push(
          Number(requestUrl.searchParams.get("pageSize")),
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{
                auctionListingId: `auction-${requestedPageSizes.length}`,
              }],
              responseMetadata: { pagination: { totalElements: 9_600 } },
            }),
            { headers: { "content-type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }) as typeof fetch;

    await fetchNationalAuctionSample(
      OS_CONFIG,
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
        requestedPageSizes.push(
          Number(requestUrl.searchParams.get("pageSize")),
        );
        return Promise.resolve(
          new Response(
            JSON.stringify({
              data: [{
                auctionListingId: `auction-${requestedPageSizes.length}`,
              }],
              responseMetadata: { pagination: { totalElements: 9_600 } },
            }),
            { headers: { "content-type": "application/json" } },
          ),
        );
      }

      return Promise.reject(new Error(`unexpected fetch ${url}`));
    }) as typeof fetch;

    await fetchNationalAuctionSample(
      OS_CONFIG,
      600,
      {},
    );

    assertEquals(requestedPageSizes.every((size) => size === 600), true);
  } finally {
    globalForFetch.fetch = originalFetch;
  }
});
