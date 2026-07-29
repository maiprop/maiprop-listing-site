import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();
const rpcMock = vi.fn((fn: string) => {
  const viewByFunction: Record<string, string> = {
    get_public_listing_catalogue: "public_listing_catalogue",
    get_listing_management_catalogue: "listing_management_catalogue",
  };
  return fromMock(viewByFunction[fn] ?? fn);
});
const publicApiMock = vi.fn();
const publicAbortMock = vi.fn(() => false);
const initialListingsPageMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    rpc: (...args: unknown[]) => rpcMock(...args),
  },
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
  isPublicApiAbort: (...args: unknown[]) => publicAbortMock(...args),
}));

vi.mock("@/lib/homepageSnapshotCache", () => ({
  readInitialListingsPage: (...args: unknown[]) => initialListingsPageMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

import { useListing, useListings, useListingsPaginated } from "@/hooks/useListings";

const wrap = (children: React.ReactNode) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const renderHookWithQuery = <T,>(hook: () => T) => {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children) });
};

const makeThenableBuilder = (data: unknown[] | null = [], error: unknown = null) => {
  const b: Record<string, unknown> = {};
  const chain = ["select", "order", "limit", "range", "ilike", "or", "eq", "in", "gte", "lte"];
  for (const method of chain) b[method] = vi.fn().mockReturnValue(b);
  b.abortSignal = vi.fn().mockReturnValue(b);
  b.then = (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve({ data, error }).then(resolve, reject);
  return b;
};

beforeEach(() => {
  fromMock.mockReset();
  rpcMock.mockClear();
  publicApiMock.mockReset();
  publicAbortMock.mockReset();
  publicAbortMock.mockReturnValue(false);
  initialListingsPageMock.mockReset();
  initialListingsPageMock.mockReturnValue(undefined);
});

describe("public listings API source continuity", () => {
  it("returns successful public map data without touching Supabase", async () => {
    publicApiMock.mockResolvedValue({
      data: [{ id: "api-listing", owner_id: null, listing_images: [] }],
      hasMore: false,
      page: 1,
      pageSize: 200,
      offset: 0,
    });

    const { result } = renderHookWithQuery(() => useListings({ listing_type: "rent" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toEqual([expect.objectContaining({ id: "api-listing" })]);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("does not hide public API aborts behind a slower database fallback", async () => {
    const aborted = new DOMException("aborted", "AbortError");
    publicApiMock.mockRejectedValue(aborted);
    publicAbortMock.mockReturnValue(true);

    const { result } = renderHookWithQuery(() => useListings({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toBe(aborted);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("surfaces public grid failures without switching catalogue authority", async () => {
    const failure = new Error("Public API returned 503");
    publicApiMock.mockRejectedValue(failure);

    const { result } = renderHookWithQuery(() => useListings({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/listings?"),
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
    expect(result.current.error).toBe(failure);
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("treats an empty public response as a contract failure without a direct database read", async () => {
    publicApiMock.mockResolvedValue(null);

    const { result } = renderHookWithQuery(() => useListings({ listing_type: "sale", limit: 3 }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(result.current.error).toEqual(expect.objectContaining({
      message: "Public listings API returned no data",
    }));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("preserves the canonical API error instead of replacing it with a second-source error", async () => {
    publicApiMock.mockRejectedValue(new Error("gateway unavailable"));

    const { result } = renderHookWithQuery(() => useListings({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(expect.objectContaining({ message: "gateway unavailable" }));
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("surfaces paginated API failures without switching page source", async () => {
    publicApiMock.mockRejectedValue(new Error("Public API returned 503"));

    const { result } = renderHookWithQuery(() => useListingsPaginated({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/listings?"),
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
    expect(publicApiMock.mock.calls[0][0]).toContain("pageSize=12");
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("loads the first grid paint in 12 rows and fills the 40-row window with a 28-row follow-up", async () => {
    publicApiMock
      .mockResolvedValueOnce({
        data: Array.from({ length: 12 }, (_, index) => ({ id: `listing-${index + 1}` })),
        hasMore: true,
        nextCursor: "v1.first-cursor",
        page: 1,
        pageSize: 12,
        offset: 0,
      })
      .mockResolvedValueOnce({
        data: Array.from({ length: 28 }, (_, index) => ({ id: `listing-${index + 13}` })),
        hasMore: true,
        nextCursor: "v1.second-cursor",
        page: 1,
        pageSize: 28,
        offset: 12,
      });

    const { result } = renderHookWithQuery(() => useListingsPaginated({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock.mock.calls[0][0]).toContain("pageSize=12");
    expect(publicApiMock.mock.calls[0][0]).not.toContain("offset=");
    expect(publicApiMock.mock.calls[0][0]).not.toContain("cursor=");

    let nextFetchLength = 0;
    await act(async () => {
      const nextResult = await result.current.fetchNextPage();
      nextFetchLength = nextResult.data?.pages.flatMap((page) => page.data).length ?? 0;
    });

    expect(publicApiMock.mock.calls[1][0]).toContain("pageSize=28");
    expect(publicApiMock.mock.calls[1][0]).toContain("cursor=v1.first-cursor");
    expect(publicApiMock.mock.calls[1][0]).not.toContain("offset=");
    expect(nextFetchLength).toBe(40);
  });

  it("paints an unfiltered sale snapshot immediately while refreshing it from the public API", async () => {
    let resolveApi: ((value: unknown) => void) | undefined;
    publicApiMock.mockReturnValue(new Promise((resolve) => {
      resolveApi = resolve;
    }));
    initialListingsPageMock.mockReturnValue({
      data: [{ id: "snapshot-sale", owner_id: null, listing_images: [] }],
      hasMore: false,
      page: 1,
      pageSize: 12,
      offset: 0,
    });

    const { result } = renderHookWithQuery(() => useListingsPaginated({ listing_type: "sale" }));

    expect(result.current.data?.pages[0]?.data).toEqual([
      expect.objectContaining({ id: "snapshot-sale" }),
    ]);
    expect(result.current.isPlaceholderData).toBe(true);
    expect(publicApiMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolveApi?.({
        data: [{ id: "live-sale", owner_id: null, listing_images: [] }],
        hasMore: false,
        page: 1,
        pageSize: 12,
        offset: 0,
      });
    });
    await waitFor(() => expect(result.current.isPlaceholderData).toBe(false));
    expect(result.current.data?.pages[0]?.data).toEqual([
      expect.objectContaining({ id: "live-sale" }),
    ]);
  });

  it("keeps loading when the embedded catalogue is empty until the live query resolves", () => {
    publicApiMock.mockReturnValue(new Promise(() => undefined));
    initialListingsPageMock.mockReturnValue({
      data: [],
      hasMore: false,
      page: 1,
      pageSize: 12,
      offset: 0,
    });

    const { result } = renderHookWithQuery(() => useListingsPaginated({ listing_type: "rent" }));

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isPlaceholderData).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(publicApiMock).toHaveBeenCalledTimes(1);
  });

  it("never applies the default catalogue snapshot to a filtered search", async () => {
    initialListingsPageMock.mockReturnValue({
      data: [{ id: "wrong-city", owner_id: null, listing_images: [] }],
      hasMore: false,
      page: 1,
      pageSize: 12,
      offset: 0,
    });
    publicApiMock.mockResolvedValue({
      data: [{ id: "athens-only", owner_id: null, listing_images: [] }],
      hasMore: false,
      page: 1,
      pageSize: 12,
      offset: 0,
    });

    const { result } = renderHookWithQuery(() => useListingsPaginated({
      listing_type: "sale",
      city: "Athens",
    }));

    expect(result.current.data).toBeUndefined();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(initialListingsPageMock).not.toHaveBeenCalled();
    expect(result.current.data?.pages[0]?.data).toEqual([
      expect.objectContaining({ id: "athens-only" }),
    ]);
  });

  it("uses the scoped management projection for owner listing data", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([]));

    const { result } = renderHookWithQuery(() => useListings({ owner_id: "owner-1" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("listing_management_catalogue");
  });

  it("keeps non-owner non-active status queries inside the public projection", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([]));

    const { result } = renderHookWithQuery(() => useListings({ status: "draft" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("public_listing_catalogue");
  });

  it("normalizes successful public detail responses and accepts a clean not-found response", async () => {
    publicApiMock.mockResolvedValueOnce({
      data: {
        id: "listing-api",
        owner_id: null,
        profiles: null,
        listing_images: undefined,
        ownerIsPro: undefined,
        ownerParticipantType: undefined,
      },
    });
    const found = renderHookWithQuery(() => useListing("listing-api", { publicScope: true }));
    await waitFor(() => expect(found.result.current.isSuccess).toBe(true));
    expect(found.result.current.data).toEqual(expect.objectContaining({
      id: "listing-api",
      listing_images: [],
      ownerIsPro: false,
      ownerParticipantType: null,
    }));
    expect(fromMock).not.toHaveBeenCalled();
    found.unmount();

    publicApiMock.mockResolvedValueOnce({ data: null });
    const missing = renderHookWithQuery(() => useListing("missing", { publicScope: true }));
    await waitFor(() => expect(missing.result.current.isSuccess).toBe(true));
    expect(missing.result.current.data).toBeNull();
  });

  it("rethrows aborted detail reads without querying the fallback", async () => {
    const aborted = new DOMException("aborted", "AbortError");
    publicApiMock.mockRejectedValue(aborted);
    publicAbortMock.mockReturnValue(true);

    const { result } = renderHookWithQuery(() => useListing("listing-1", { publicScope: true }));
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toBe(aborted);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("surfaces public detail failures without switching to a direct Supabase query", async () => {
    publicApiMock.mockRejectedValue(new Error("Public API returned a non-JSON response"));

    const { result } = renderHookWithQuery(() => useListing("listing-1", { publicScope: true }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/listing?id=listing-1",
      expect.objectContaining({ throwOnError: true, signal: expect.any(AbortSignal) }),
    );
    expect(fromMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });
});
