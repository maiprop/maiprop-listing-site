/**
 * Tests for the useAuctionListings hook. Public auction reads stay on the
 * canonical cached API so a transient edge failure cannot change ordering or
 * reveal a different catalogue window.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();
const rpcMock = vi.fn((fn: string) =>
  fromMock(fn === "get_public_listing_catalogue" ? "public_listing_catalogue" : fn));
const invokeMock = vi.fn();
const getSessionMock = vi.fn();
const publicApiMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
    auth: { getSession: (...args: unknown[]) => getSessionMock(...args) },
  },
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
  isPublicApiAbort: () => false,
}));

import {
  fetchAuctionListingById,
  type AuctionListingRow,
  useAuctionListings,
} from "@/hooks/useAuctionListings";

type AuctionRow = AuctionListingRow;

const auctionRow = (id: string, overrides: Partial<AuctionRow> = {}): AuctionRow => {
  return {
    id,
    title: `Auction ${id}`,
    city: "Athens",
    address: null,
    price: 0,
    auction_starting_bid: null,
    auction_date: "2099-06-01",
    auction_court: null,
    property_type: "apartment",
    listing_type: "auction",
    cover_image_url: null,
    sqm: 0,
    bedrooms: null,
    bathrooms: null,
    floor: null,
    total_floors: null,
    latitude: null,
    longitude: null,
    tags: null,
    year_built: null,
    construction_status: null,
    website_url: null,
    region: null,
    is_featured: false,
    featured_until: null,
    priority_placement: 0,
    priority_until: null,
    ...overrides,
  };
};

const wrap = (children: React.ReactNode) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const renderHookWithQuery = <T,>(hook: () => T) => {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children) });
};

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockClear();
  invokeMock.mockReset();
  getSessionMock.mockReset();
  getSessionMock.mockResolvedValue({ data: { session: null }, error: null });
  publicApiMock.mockReset();
  publicApiMock.mockResolvedValue(null);
});

describe("useAuctionListings", () => {
  it("uses the cached public API before touching Supabase directly", async () => {
    publicApiMock.mockResolvedValue({
      data: [auctionRow("api-a1", { floor: 1 })],
    });

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "api-a1" });
    expect(result.current.auctionPage).toMatchObject({
      facets: { cities: ["Athens"], rounds: [] },
      stats: { avgBid: 0, mappableCount: 0 },
      page: 1,
      pageSize: 60,
      total: 1,
      totalPages: 1,
    });
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/auctions?limit=60",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("requests a canonical server-filtered Pro page with the user JWT", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "pro-access-token" } },
      error: null,
    });
    publicApiMock.mockResolvedValue({
      data: Array.from({ length: 20 }, (_, i) => auctionRow(`api-${i}`)),
      revision: "auction-v1",
      page: 2,
      pageSize: 20,
      total: 80,
      totalRaw: 80,
      totalPages: 4,
      facets: { cities: ["Athens", "Patras"], rounds: [1, 2] },
      stats: { thisWeek: 3, avgBid: 120_000, mappableCount: 60 },
    });

    const { result } = renderHookWithQuery(() => useAuctionListings(9999, {
      page: 2,
      pageSize: 20,
      filters: {
        city: "Patras",
        propertyType: "apartment",
        bidRange: "50000-150000",
      },
    }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(20);
    expect(result.current.auctionPage).toMatchObject({
      revision: "auction-v1",
      page: 2,
      total: 80,
    });
    const [input, options] = publicApiMock.mock.calls[0];
    const requestUrl = new URL(String(input), "https://portal.maiprop.co");
    expect(requestUrl.pathname).toBe("/api/public/auctions");
    expect(requestUrl.searchParams.get("limit")).toBe("600");
    expect(requestUrl.searchParams.get("page")).toBe("2");
    expect(requestUrl.searchParams.get("pageSize")).toBe("20");
    expect(requestUrl.searchParams.get("city")).toBe("Patras");
    expect(requestUrl.searchParams.get("propertyType")).toBe("apartment");
    expect(requestUrl.searchParams.get("bidRange")).toBe("50000-150000");
    expect(options).toEqual(expect.objectContaining({
      headers: { Authorization: "Bearer pro-access-token" },
      signal: expect.any(AbortSignal),
      throwOnError: true,
      timeoutMs: 15_000,
    }));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("does not attempt a paid catalogue read without an authenticated session", async () => {
    const { result } = renderHookWithQuery(() => useAuctionListings(600));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(expect.objectContaining({
      message: "Authentication is required for the expanded auction catalogue",
    }));
    expect(publicApiMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("aborts the authenticated network request when React Query cancels it", async () => {
    getSessionMock.mockResolvedValue({
      data: { session: { access_token: "pro-access-token" } },
      error: null,
    });
    let requestSignal: AbortSignal | undefined;
    publicApiMock.mockImplementation((_path, options) => {
      requestSignal = options?.signal;
      return new Promise((_resolve, reject) => {
        requestSignal?.addEventListener("abort", () => {
          reject(new DOMException("Aborted", "AbortError"));
        }, { once: true });
      });
    });

    const rendered = renderHookWithQuery(() => useAuctionListings(600));
    await waitFor(() => expect(requestSignal).toBeInstanceOf(AbortSignal));
    rendered.unmount();
    await waitFor(() => expect(requestSignal?.aborted).toBe(true));

    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("slices public API rows to the caller entitlement window", async () => {
    publicApiMock.mockResolvedValue({
      data: Array.from({ length: 80 }, (_, i) => auctionRow(`api-${i}`)),
    });

    const { result } = renderHookWithQuery(() => useAuctionListings(20));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(20);
    expect(result.current.data?.at(-1)?.id).toBe("api-19");
  });

  it("surfaces a retryable error without switching catalogue authority", async () => {
    publicApiMock.mockRejectedValue(new Error("public auction catalogue unavailable"));

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(expect.objectContaining({
      message: "public auction catalogue unavailable",
    }));
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("fetchAuctionListingById", () => {
  it("uses the canonical auction revision for exact UUID lookup", async () => {
    publicApiMock.mockResolvedValue({
      data: [auctionRow("11111111-1111-4111-8111-111111111111", {
        listing_type: "auction",
      })],
    });

    await expect(fetchAuctionListingById("11111111-1111-4111-8111-111111111111"))
      .resolves.toMatchObject({ id: "11111111-1111-4111-8111-111111111111" });

    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/auctions?limit=60&page=1&pageSize=1&ids=11111111-1111-4111-8111-111111111111",
      { throwOnError: true, signal: undefined },
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("uses the canonical auction revision for OS-tag lookup", async () => {
    publicApiMock.mockResolvedValue({
      data: [auctionRow("os-db-row", {
        listing_type: "auction",
      })],
    });

    await expect(fetchAuctionListingById("os-123")).resolves.toMatchObject({ id: "os-db-row" });

    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/auctions?limit=60&page=1&pageSize=1&osTag=os-123",
      { throwOnError: true, signal: undefined },
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does not switch to a direct Supabase detail read on an edge failure", async () => {
    publicApiMock.mockRejectedValue(new Error("public auction detail unavailable"));

    await expect(fetchAuctionListingById("os-123"))
      .rejects.toThrow("public auction detail unavailable");

    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
