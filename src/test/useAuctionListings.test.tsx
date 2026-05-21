/**
 * Tests for the useAuctionListings hook. The hook prefers cached DB pagination
 * for a fast portal response, then falls back to the live OS proxy when the
 * cache is empty. If the listing_images join fails, it retries without the join.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();
const invokeMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

import { randomizeAuctionPresentation, useAuctionListings } from "@/hooks/useAuctionListings";

type AuctionRow = Parameters<typeof randomizeAuctionPresentation>[0][number];

const auctionRow = (id: string, overrides: Partial<AuctionRow> = {}): AuctionRow => {
  return {
    id,
    title: `Auction ${id}`,
    city: "Athens",
    address: null,
    price: 0,
    auction_starting_bid: null,
    auction_date: "2026-06-01",
    auction_court: null,
    property_type: "apartment",
    cover_image_url: null,
    sqm: 0,
    bedrooms: null,
    bathrooms: null,
    latitude: null,
    longitude: null,
    tags: null,
    year_built: null,
    construction_status: null,
    website_url: null,
    region: null,
    is_featured: false,
    priority_placement: 0,
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
  invokeMock.mockReset();
});

/**
 * Build a fluent query builder whose terminal `.range()` returns the supplied
 * data. Every other method returns the same builder to support chaining.
 */
const makeBuilder = (rangeImpl: () => Promise<{ data: unknown[] | null; error: unknown }>) => {
  const b: Record<string, unknown> = {};
  const chain = ["select", "eq", "or", "order"];
  for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
  b.range = vi.fn().mockImplementation(rangeImpl);
  return b;
};

describe("useAuctionListings", () => {
  it("uses a deterministic daily rotation instead of preserving OS municipality order", () => {
    const municipalitySorted = [
      auctionRow("athens-a", { city: "Athens" }),
      auctionRow("athens-b", { city: "Athens" }),
      auctionRow("marousi-a", { city: "Marousi" }),
      auctionRow("piraeus-a", { city: "Piraeus" }),
    ];

    const firstPass = randomizeAuctionPresentation(municipalitySorted, "seed:2026-05-15");
    const secondPass = randomizeAuctionPresentation(municipalitySorted, "seed:2026-05-15");

    expect(firstPass.map((row) => row.id)).toEqual(secondPass.map((row) => row.id));
    expect(firstPass.map((row) => row.id)).not.toEqual(municipalitySorted.map((row) => row.id));
  });

  it("keeps commercial placement above randomized organic auctions", () => {
    const rows = [
      auctionRow("organic-a"),
      auctionRow("featured", { is_featured: true }),
      auctionRow("priority", { priority_placement: 5 }),
      auctionRow("organic-b"),
    ];

    const ordered = randomizeAuctionPresentation(rows, "seed:2026-05-15");

    expect(ordered[0].id).toBe("priority");
    expect(ordered[1].id).toBe("featured");
  });

  it("prefers the live OS proxy over cached database auctions", async () => {
    fromMock.mockReturnValue(makeBuilder(() => Promise.resolve({
      data: [{ id: "db-a1", title: "Cached auction" }],
      error: null,
    })));
    invokeMock.mockResolvedValue({ data: { data: [{ id: "os-a1", title: "OS auction" }] }, error: null });

    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "os-a1" });
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("falls back to cached database auctions when the live OS proxy fails", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    fromMock.mockReturnValue(makeBuilder(() => Promise.resolve({
      data: [{ id: "db-a1", title: "Cached auction" }],
      error: null,
    })));

    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-a1" });
  });

  it("asks the OS proxy for a national sample at the current entitlement cap", async () => {
    fromMock.mockReturnValue(makeBuilder(() => Promise.resolve({ data: [], error: null })));
    invokeMock.mockResolvedValue({
      data: { data: Array.from({ length: 80 }, (_, i) => auctionRow(`os-${i}`)) },
      error: null,
    });

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(60);
    expect(invokeMock).toHaveBeenCalledWith("fetch-os-auctions", expect.objectContaining({
      body: expect.objectContaining({ pageSize: 60, sampleAcrossGreece: true }),
    }));
  });

  it("returns an empty array when the first page is empty", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    fromMock.mockReturnValue(makeBuilder(() => Promise.resolve({ data: [], error: null })));
    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("returns the joined-image rows when the first attempt succeeds", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    fromMock.mockReturnValue(
      makeBuilder(() =>
        Promise.resolve({
          data: [{ id: "a1", listing_images: [{ url: "x" }] }],
          error: null,
        }),
      ),
    );
    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ id: "a1" });
  });

  it("caps database fallback pagination to the portal limit", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    const firstPage = Array.from({ length: 500 }, (_, i) => ({ id: `a${i}` }));
    const secondPage = Array.from({ length: 100 }, (_, i) => ({ id: `b${i}` }));
    const builder = makeBuilder(vi.fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: secondPage, error: null }));
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(600);
    expect(builder.range).toHaveBeenCalledTimes(2);
    expect(builder.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(builder.range).toHaveBeenNthCalledWith(2, 500, 599);
  });

  it("fetches the portal database window before applying the supplied entitlement limit", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    const firstPage = Array.from({ length: 500 }, (_, i) => auctionRow(`a${i}`));
    const secondPage = Array.from({ length: 100 }, (_, i) => auctionRow(`b${i}`));
    const builder = makeBuilder(vi.fn()
      .mockResolvedValueOnce({ data: firstPage, error: null })
      .mockResolvedValueOnce({ data: secondPage, error: null }));
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(60);
    expect(builder.range).toHaveBeenCalledTimes(2);
    expect(builder.range).toHaveBeenNthCalledWith(1, 0, 499);
    expect(builder.range).toHaveBeenNthCalledWith(2, 500, 599);
  });

  it("falls back to a no-images query when the joined version fails", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    // First call: every range invocation rejects with a join error.
    let call = 0;
    fromMock.mockImplementation(() => {
      call++;
      if (call === 1) {
        return makeBuilder(() => Promise.reject(new Error("relation listing_images does not exist")));
      }
      return makeBuilder(() => Promise.resolve({ data: [{ id: "a2" }], error: null }));
    });
    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ id: "a2" });
  });

  it("propagates a non-join Supabase error", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    fromMock.mockReturnValue(
      makeBuilder(() => Promise.resolve({ data: null, error: new Error("rls denied") })),
    );
    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
