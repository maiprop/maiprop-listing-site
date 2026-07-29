import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();
const rpcMock = vi.fn();
const publicApiMock = vi.fn();
const useAuctionListingsMock = vi.hoisted(() => vi.fn(() => ({ data: [], isLoading: false, isSuccess: true })));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
  isPublicApiAbort: () => false,
}));

vi.mock("@/hooks/useAuctionListings", () => ({
  useAuctionListings: (...args: unknown[]) => useAuctionListingsMock(...args),
}));

import {
  useHomepageAuctionListings,
  useHomepageFeaturedListings,
  useHomepageOpenHouseListings,
} from "@/hooks/useHomepageListings";
import {
  HOMEPAGE_FEATURED_SNAPSHOT_KEY,
  HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY,
  readInitialListingsPage,
  readHomepageSnapshot,
  writeHomepageSnapshot,
} from "@/lib/homepageSnapshotCache";

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
  rpcMock.mockReset();
  publicApiMock.mockReset();
  useAuctionListingsMock.mockClear();
  useAuctionListingsMock.mockReturnValue({ data: [], isLoading: false, isSuccess: true });
  window.localStorage.clear();
  delete (window as Window & { __MAIPROP_HOMEPAGE_INITIAL__?: unknown }).__MAIPROP_HOMEPAGE_INITIAL__;
});

describe("homepage public API fallback behavior", () => {
  it("reads a fresh sale catalogue page from the embedded deployment payload", () => {
    (window as Window & { __MAIPROP_HOMEPAGE_INITIAL__?: unknown }).__MAIPROP_HOMEPAGE_INITIAL__ = {
      version: 1,
      generatedAt: new Date(Date.now() - 60_000).toISOString(),
      featured: [],
      openHouses: [],
      saleListings: {
        data: [{ id: "embedded-sale" }],
        hasMore: true,
        page: 1,
        pageSize: 12,
        offset: 0,
      },
    };

    expect(readInitialListingsPage<{ id: string }>("sale")).toEqual({
      data: [{ id: "embedded-sale" }],
      hasMore: true,
      page: 1,
      pageSize: 12,
      offset: 0,
    });
    expect(readInitialListingsPage("rent")).toBeUndefined();
  });

  it("uses embedded deploy payload for cold first paint when local snapshots are absent", async () => {
    publicApiMock.mockReturnValue(new Promise(() => undefined));
    (window as Window & { __MAIPROP_HOMEPAGE_INITIAL__?: unknown }).__MAIPROP_HOMEPAGE_INITIAL__ = {
      version: 1,
      generatedAt: new Date(Date.now() - 60_000).toISOString(),
      featured: [
        { id: "bootstrap-featured", title: "Bootstrap Spotlight", city: "Athens", price: 250_000, sqm: 72 },
      ],
      openHouses: [],
    };

    const { result } = renderHookWithQuery(() => useHomepageFeaturedListings());

    expect(result.current.data?.[0]).toMatchObject({ id: "bootstrap-featured" });
    expect(result.current.isFetching).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("paints cached Spotlight listings immediately while the public API revalidates", async () => {
    publicApiMock.mockReturnValue(new Promise(() => undefined));
    writeHomepageSnapshot(HOMEPAGE_FEATURED_SNAPSHOT_KEY, [
      { id: "cached-featured", title: "Cached Spotlight", city: "Athens", price: 250_000, sqm: 72 },
    ]);

    const { result } = renderHookWithQuery(() => useHomepageFeaturedListings());

    expect(result.current.data?.[0]).toMatchObject({ id: "cached-featured" });
    expect(result.current.isFetching).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("stores successful public Spotlight responses for instant repeat paints", async () => {
    publicApiMock.mockResolvedValue([
      { id: "api-featured", title: "API Spotlight", city: "Athens", price: 250_000, sqm: 72 },
    ]);

    const { result } = renderHookWithQuery(() => useHomepageFeaturedListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(readHomepageSnapshot<unknown[]>(HOMEPAGE_FEATURED_SNAPSHOT_KEY)?.[0]).toMatchObject({
      id: "api-featured",
    });
  });

  it("reuses a fresh same-source Spotlight snapshot when the public API is unavailable", async () => {
    writeHomepageSnapshot(HOMEPAGE_FEATURED_SNAPSHOT_KEY, [
      { id: "snapshot-featured", title: "Snapshot Spotlight", city: "Athens" },
    ]);
    publicApiMock.mockRejectedValue(new Error("public homepage unavailable"));

    const { result } = renderHookWithQuery(() => useHomepageFeaturedListings());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data?.[0]).toMatchObject({ id: "snapshot-featured" });
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/homepage?section=featured",
      expect.objectContaining({ throwOnError: true, timeoutMs: 5500, signal: expect.any(AbortSignal) }),
    );
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("reuses a fresh same-source open-house snapshot when the public API is unavailable", async () => {
    writeHomepageSnapshot(HOMEPAGE_OPEN_HOUSES_SNAPSHOT_KEY, [
      { id: "snapshot-open-house", title: "Snapshot Open House", city: "Athens" },
    ]);
    publicApiMock.mockRejectedValue(new Error("public open-house catalogue unavailable"));

    const { result } = renderHookWithQuery(() => useHomepageOpenHouseListings());
    await waitFor(() => expect(result.current.isFetching).toBe(false));

    expect(result.current.data?.[0]).toMatchObject({ id: "snapshot-open-house" });
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/open-houses?showPast=0&limit=60&includeMeta=1",
      expect.objectContaining({ throwOnError: true, timeoutMs: 5500, signal: expect.any(AbortSignal) }),
    );
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("surfaces an error rather than changing catalogue source when no snapshot exists", async () => {
    publicApiMock.mockRejectedValue(new Error("canonical homepage catalogue unavailable"));

    const featured = renderHookWithQuery(() => useHomepageFeaturedListings());
    await waitFor(() => expect(featured.result.current.isError).toBe(true), { timeout: 3_000 });
    expect(featured.result.current.error).toEqual(expect.objectContaining({
      message: "canonical homepage catalogue unavailable",
    }));
    expect(rpcMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("preserves the canonical first six open houses without client re-ranking", async () => {
    publicApiMock.mockResolvedValue({
      data: Array.from({ length: 60 }, (_, index) => ({
        id: `real-open-house-${index}`,
        title: `Glyfada Open House ${index + 1}`,
        address: "Glyfada",
        cover_image_url: index % 2 === 0 ? null : `https://img.example/${index}.jpg`,
      })),
      hasMore: true,
      nextCursor: "canonical-page-2",
      limit: 60,
    });

    const { result } = renderHookWithQuery(() => useHomepageOpenHouseListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.map((listing) => listing.id)).toEqual(
      Array.from({ length: 6 }, (_, index) => `real-open-house-${index}`),
    );
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/open-houses?showPast=0&limit=60&includeMeta=1",
      expect.objectContaining({ throwOnError: true, timeoutMs: 5500, signal: expect.any(AbortSignal) }),
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("does not fetch open houses before the deferred section is enabled", async () => {
    const { result } = renderHookWithQuery(() => useHomepageOpenHouseListings({ enabled: false }));

    expect(result.current.fetchStatus).toBe("idle");
    expect(publicApiMock).not.toHaveBeenCalled();
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("uses a compact deferred auction request for the homepage preview", () => {
    renderHookWithQuery(() => useHomepageAuctionListings({ enabled: false }));

    expect(useAuctionListingsMock).toHaveBeenCalledWith(60, { enabled: false });
  });

});
