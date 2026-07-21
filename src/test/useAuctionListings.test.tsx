/**
 * Tests for the useAuctionListings hook. Public auction list reads use the
 * cached public API first and fall back to bounded public Supabase reads when
 * Cloudflare Pages Functions fail open.
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
  isPublicApiAbort: () => false,
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

const makeThenableBuilder = (data: unknown[] = []) => {
  const b: Record<string, unknown> = {};
  const chain = ["select", "eq", "or", "contains", "limit", "order"];
  for (const method of chain) b[method] = vi.fn().mockReturnValue(b);
  b.then = (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
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
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/auctions?limit=60",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
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
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/auctions?limit=600",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
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

  it("falls back to constrained Supabase auction reads when the public API is unavailable", async () => {
    publicApiMock.mockResolvedValue(null);
    const builder = makeThenableBuilder([auctionRow("db-a1")]);
    fromMock.mockReturnValue(builder);

    const { result } = renderHookWithQuery(() => useAuctionListings(60));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-a1" });
    expect(fromMock).toHaveBeenCalledWith("public_listing_catalogue");
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining("featured_until"));
    expect(builder.select).toHaveBeenCalledWith(expect.stringContaining("priority_until"));
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

  it("ranks only active Priority while Spotlight remains visual-only", () => {
    const rows = [
      auctionRow("organic-a"),
      auctionRow("spotlight", {
        is_featured: true,
        featured_until: "2099-01-01T00:00:00.000Z",
      }),
      auctionRow("priority", {
        priority_placement: 1,
        priority_until: "2099-01-01T00:00:00.000Z",
      }),
      auctionRow("organic-b"),
    ];
    const withoutSpotlight = rows.map((row) => row.id === "spotlight"
      ? { ...row, is_featured: false }
      : row);

    const ordered = randomizeAuctionPresentation(rows, "seed:2026-05-15");
    const comparison = randomizeAuctionPresentation(withoutSpotlight, "seed:2026-05-15");

    expect(ordered[0].id).toBe("priority");
    expect(ordered.map((row) => row.id)).toEqual(comparison.map((row) => row.id));
  });

  it("suppresses expired paid state before presentation", () => {
    const ordered = randomizeAuctionPresentation([
      auctionRow("expired", {
        is_featured: true,
        featured_until: "2000-01-01T00:00:00.000Z",
        priority_placement: 1,
        priority_until: "2000-01-01T00:00:00.000Z",
      }),
      auctionRow("organic"),
    ], "seed:2026-05-15");

    expect(ordered.find((row) => row.id === "expired")).toMatchObject({
      is_featured: false,
      priority_placement: 0,
    });
  });

  it("limits active Priority auctions to three slots per twelve results", () => {
    const priorityRows = Array.from({ length: 8 }, (_, index) => auctionRow(`priority-${index}`, {
      priority_placement: 1,
      priority_until: "2099-01-01T00:00:00.000Z",
    }));
    const organicRows = Array.from({ length: 20 }, (_, index) => auctionRow(`organic-${index}`));

    const ordered = randomizeAuctionPresentation([...priorityRows, ...organicRows], "seed:2026-05-15");

    expect(ordered.slice(0, 12).filter((row) => row.priority_placement > 0)).toHaveLength(3);
    expect(ordered.slice(12, 24).filter((row) => row.priority_placement > 0)).toHaveLength(3);
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
      { throwOnError: true, signal: undefined },
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

    expect(publicApiMock).toHaveBeenCalledWith("/api/public/listing?osTag=os-123", { throwOnError: true, signal: undefined });
    expect(fromMock).not.toHaveBeenCalled();
  });
});
