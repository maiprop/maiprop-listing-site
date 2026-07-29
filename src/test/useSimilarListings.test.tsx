/**
 * Tests for useSimilarListings. Public detail pages read related cards through
 * the canonical cached API and never switch ranking authority during an outage.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const publicApiMock = vi.fn();
const fromMock = vi.fn();
const rpcMock = vi.fn((fn: string) =>
  fromMock(fn === "get_public_listing_catalogue" ? "public_listing_catalogue" : fn));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
  isPublicApiAbort: () => false,
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

import { useSimilarListings } from "@/hooks/useSimilarListings";

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderHookWithQuery<T>(hook: () => T) {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children) });
}

beforeEach(() => {
  publicApiMock.mockReset();
  fromMock.mockReset();
  rpcMock.mockClear();
});

describe("useSimilarListings", () => {
  it("stays disabled until at least a city or propertyType is provided", () => {
    const { result } = renderHookWithQuery(() => useSimilarListings({}));
    expect(result.current.isPending).toBe(true);
    expect(publicApiMock).not.toHaveBeenCalled();
  });

  it("returns public API rows and forwards bounded filters", async () => {
    publicApiMock.mockResolvedValue({
      data: [
        { id: "l1", owner_id: "o1", price: 300_000, profiles: { user_id: "o1", display_name: "Alice" } },
        { id: "l2", owner_id: "o2", price: 500_000, profiles: { user_id: "o2", display_name: "Bob" } },
      ],
    });

    const { result } = renderHookWithQuery(() =>
      useSimilarListings({
        excludeId: "11111111-1111-4111-8111-111111111111",
        city: "Athens",
        propertyType: "apartment",
        listingType: "sale",
        price: 320_000,
        limit: 2,
      }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((row) => row.id)).toEqual(["l1", "l2"]);
    expect(result.current.data?.[0].profiles).toMatchObject({ display_name: "Alice" });
    const [path, options] = publicApiMock.mock.calls[0];
    const url = new URL(String(path), "https://portal.maiprop.co");
    expect(url.pathname).toBe("/api/public/similar-listings");
    expect(url.searchParams.get("excludeId")).toBe("11111111-1111-4111-8111-111111111111");
    expect(url.searchParams.get("city")).toBe("Athens");
    expect(url.searchParams.get("propertyType")).toBe("apartment");
    expect(url.searchParams.get("listingType")).toBe("sale");
    expect(url.searchParams.get("price")).toBe("320000");
    expect(url.searchParams.get("limit")).toBe("2");
    expect(options).toEqual(expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }));
  });

  it("returns [] when the public API has no similar rows", async () => {
    publicApiMock.mockResolvedValue({ data: [] });

    const { result } = renderHookWithQuery(() =>
      useSimilarListings({ propertyType: "apartment" }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("deduplicates cloned OS auction rows before cards render", async () => {
    publicApiMock.mockResolvedValue({
      data: [
        {
          id: "auction-a",
          listing_type: "auction",
          title: "Auction Apartment Dionysou",
          address: "Paianias 9",
          city: "Dionysou",
          property_type: "apartment",
          price: 435920,
          sqm: 281.42,
          auction_date: "2026-06-17",
          tags: ["source:maiprop-os", "os_auction:auction-123"],
        },
        {
          id: "auction-b",
          listing_type: "auction",
          title: "Auction Apartment Dionysou",
          address: "Paianias 9",
          city: "Dionysou",
          property_type: "apartment",
          price: 435920,
          sqm: 281.42,
          auction_date: "2026-06-17",
          tags: ["source:maiprop-os", "os_auction:auction-123"],
        },
        {
          id: "auction-c",
          listing_type: "auction",
          title: "Different Auction",
          address: "Other 1",
          city: "Dionysou",
          property_type: "apartment",
          price: 440000,
          sqm: 120,
          auction_date: "2026-06-18",
          tags: ["source:maiprop-os", "os_auction:auction-456"],
        },
      ],
    });

    const { result } = renderHookWithQuery(() =>
      useSimilarListings({ city: "Dionysou", propertyType: "apartment", listingType: "auction" }),
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((row) => row.id)).toEqual(["auction-a", "auction-c"]);
  });

  it("surfaces canonical API failures without changing catalogue authority", async () => {
    publicApiMock.mockRejectedValue(new Error("upstream unavailable"));

    const { result } = renderHookWithQuery(() =>
      useSimilarListings({ city: "Athens", propertyType: "apartment", listingType: "sale", price: 320000 }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(expect.objectContaining({ message: "upstream unavailable" }));
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
