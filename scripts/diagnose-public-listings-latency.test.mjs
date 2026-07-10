import { describe, expect, it, vi } from "vitest";
import {
  PUBLIC_LISTINGS_DIAGNOSTIC_PATHS,
  runPublicListingsLatencyDiagnostics,
} from "./diagnose-public-listings-latency.mjs";

describe("public listings latency diagnostics", () => {
  it("checks split first-paint, 40-row catalogue, and homepage featured endpoints", () => {
    expect(PUBLIC_LISTINGS_DIAGNOSTIC_PATHS).toEqual(expect.arrayContaining([
      "/api/public/listings?listing_type=sale&page=1&pageSize=12",
      "/api/public/listings?listing_type=sale&page=1&pageSize=28&offset=12",
      "/api/public/listings?listing_type=sale&page=1&limit=40",
      "/api/public/homepage?section=featured",
    ]));
  });

  it("records timing, size, and timeout errors per endpoint", async () => {
    const fetchImpl = vi.fn(async (url) => {
      if (String(url).includes("limit=40")) {
        throw new DOMException("The operation was aborted.", "AbortError");
      }
      return new Response(JSON.stringify({ data: [], hasMore: false }), {
        headers: { "Content-Type": "application/json" },
      });
    });

    const results = await runPublicListingsLatencyDiagnostics("https://portal.maiprop.co", {
      fetchImpl,
      timeoutMs: 50,
      paths: [
        "/api/public/listings?listing_type=sale&page=1&pageSize=12",
        "/api/public/listings?listing_type=sale&page=1&limit=40",
      ],
    });

    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({
      ok: true,
      status: 200,
      bytes: expect.any(Number),
      ms: expect.any(Number),
    });
    expect(results[1]).toMatchObject({
      ok: false,
      status: null,
      error: expect.stringContaining("aborted"),
    });
  });
});
