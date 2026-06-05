/**
 * Tests for the useAuctionListings hook. Public auction list reads use the
 * cached public API so browser traffic does not fan out directly to Supabase.
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

import {
  fetchAuctionListingById,
  randomizeAuctionPresentation,
  useAuctionListings,
} from "@/hooks/useAuctionListings";

type AuctionRow = Parameters<typeof randomizeAuctionPresentation>[0][number];

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

const makeMaybeSingleBuilder = (result: () => Promise<{ data: unknown | null; error: unknown }>) => {
  const b: Record<string, unknown> = {};
  const chain = ["select", "eq", "or", "contains", "limit"];
  for (const method of chain) b[method] = vi.fn().mockReturnValue(b);
  b.maybeSingle = vi.fn().mockImplementation(result);
  return b;
};

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset();
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
    expect(publicApiMock).toHaveBeenCalledWith("/api/public/auctions?limit=60", { throwOnError: true });
    expect(fromMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("requests the full normalized public auction window for Pro-sized pages", async () => {
    publicApiMock.mockResolvedValue({
      data: Array.from({ length: 600 }, (_, i) => auctionRow(`api-${i}`)),
    });

    const { result } = renderHookWithQuery(() => useAuctionListings(9999));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toHaveLength(600);
    expect(publicApiMock).toHaveBeenCalledWith("/api/public/auctions?limit=600", { throwOnError: true });
    expect(fromMock).not.toHaveBeenCalled();
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

  it("surfaces public API outages without direct Supabase fallback", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeMaybeSingleBuilder(() => Promise.resolve({
      data: auctionRow("db-a1"),
      error: null,
    })));

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(fromMock).not.toHaveBeenCalled();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("uses a deterministic daily rotation helper for DB-sourced exact lookup fallbacks", () => {
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
});

describe("fetchAuctionListingById", () => {
  it("uses the public detail API for exact UUID auction lookup", async () => {
    publicApiMock.mockResolvedValue({
      data: auctionRow("11111111-1111-4111-8111-111111111111", {
        listing_type: "auction",
      }),
    });

    await expect(fetchAuctionListingById("11111111-1111-4111-8111-111111111111"))
      .resolves.toMatchObject({ id: "11111111-1111-4111-8111-111111111111" });

    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/listing?id=11111111-1111-4111-8111-111111111111",
      { throwOnError: true },
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uses osTag query routing for non-UUID detail ids", async () => {
    publicApiMock.mockResolvedValue({
      data: auctionRow("os-db-row", {
        listing_type: "auction",
      }),
    });

    await expect(fetchAuctionListingById("os-123")).resolves.toMatchObject({ id: "os-db-row" });

    expect(publicApiMock).toHaveBeenCalledWith("/api/public/listing?osTag=os-123", { throwOnError: true });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
