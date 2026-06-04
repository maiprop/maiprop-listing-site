/**
 * Tests for the useAuctionListings hook. The hook reads the canonical local
 * 600-auction OS pool from Supabase, then applies the caller's entitlement
 * slice. If the listing_images join fails, it retries without the join.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();
const invokeMock = vi.fn();
const publicApiMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: { invoke: (...args: unknown[]) => invokeMock(...args) },
  },
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
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
  publicApiMock.mockReset();
  publicApiMock.mockResolvedValue(null);
});

/**
 * Build a fluent query builder whose terminal `.range()` returns the supplied
 * data. Every other method returns the same builder to support chaining.
 */
const makeBuilder = (rangeImpl: () => Promise<{ data: unknown[] | null; error: unknown }>) => {
  const b: Record<string, unknown> = {};
  const chain = ["select", "eq", "contains", "or", "order"];
  for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
  b.range = vi.fn().mockImplementation(rangeImpl);
  return b;
};

describe("useAuctionListings", () => {
  it("reads the local canonical auction pool instead of the public cache or OS proxy", async () => {
    const builder = makeBuilder(() => Promise.resolve({
      data: [auctionRow("db-a1", { floor: 1 })],
      error: null,
    }));
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-a1" });
    expect(publicApiMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalled();
  });

  it("derives free and Pro windows from the same 600-row database pool", async () => {
    const builder = makeBuilder(vi.fn()
      .mockResolvedValueOnce({
        data: Array.from({ length: 500 }, (_, i) => auctionRow(`daily-${i}`)),
        error: null,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 100 }, (_, i) => auctionRow(`daily-tail-${i}`)),
        error: null,
      }));
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(60);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(builder.range).toHaveBeenCalledWith(0, 499);
    expect(builder.range).toHaveBeenCalledWith(500, 599);
  });

  it("does not fall through to the slow live OS proxy for public-sized windows", async () => {
    publicApiMock.mockResolvedValue(null);
    const builder = makeBuilder(() => Promise.resolve({
      data: [auctionRow("db-a1", { floor: 1 })],
      error: null,
    }));
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-a1" });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalled();
    expect(builder.eq).toHaveBeenCalledWith("is_off_market", false);
  });

  it("falls back to the latest OS-sourced DB rows if today's pool has not synced yet", async () => {
    const builder = makeBuilder(vi.fn()
      .mockResolvedValueOnce({ data: [], error: null })
      .mockResolvedValueOnce({ data: [auctionRow("db-fallback", { floor: 2, total_floors: 5 })], error: null }));
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-fallback", floor: 2, total_floors: 5 });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(builder.range).toHaveBeenCalledTimes(2);
  });

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

  it("does not call the live OS proxy during normal portal reads", async () => {
    fromMock.mockReturnValue(makeBuilder(() => Promise.resolve({
      data: [{ id: "db-a1", title: "Cached auction" }],
      error: null,
    })));
    invokeMock.mockResolvedValue({ data: { data: [{ id: "os-a1", title: "OS auction" }] }, error: null });

    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-a1" });
    expect(invokeMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalled();
  });

  it("uses cached database auctions even when the live OS proxy would fail", async () => {
    invokeMock.mockRejectedValue(new Error("OS unavailable"));
    fromMock.mockReturnValue(makeBuilder(() => Promise.resolve({
      data: [{ id: "db-a1", title: "Cached auction" }],
      error: null,
    })));

    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-a1" });
  });

  it("reads the local pool at the current entitlement cap", async () => {
    const builder = makeBuilder(() => Promise.resolve({
      data: Array.from({ length: 80 }, (_, i) => auctionRow(`db-${i}`)),
      error: null,
    }));
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings(80));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(80);
    expect(invokeMock).not.toHaveBeenCalled();
    expect(builder.range).toHaveBeenCalledWith(0, 499);
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
