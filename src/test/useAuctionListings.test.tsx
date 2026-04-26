/**
 * Tests for the useAuctionListings hook. The hook paginates via .range() and
 * has a graceful fallback path: if the join on listing_images fails we retry
 * without the join. We drive both branches with mocked builders.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { useAuctionListings } from "@/hooks/useAuctionListings";

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
  fromMock.mockReset();
});

/**
 * Build a fluent query builder whose terminal `.range()` returns the supplied
 * data. Every other method returns the same builder to support chaining.
 */
function makeBuilder(rangeImpl: () => Promise<{ data: unknown[] | null; error: unknown }>) {
  const b: Record<string, unknown> = {};
  const chain = ["select", "eq", "or", "order"];
  for (const m of chain) b[m] = vi.fn().mockReturnValue(b);
  b.range = vi.fn().mockImplementation(rangeImpl);
  return b;
}

describe("useAuctionListings", () => {
  it("returns an empty array when the first page is empty", async () => {
    fromMock.mockReturnValue(makeBuilder(() => Promise.resolve({ data: [], error: null })));
    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("returns the joined-image rows when the first attempt succeeds", async () => {
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

  it("falls back to a no-images query when the joined version fails", async () => {
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
    fromMock.mockReturnValue(
      makeBuilder(() => Promise.resolve({ data: null, error: new Error("rls denied") })),
    );
    const { result } = renderHookWithQuery(() => useAuctionListings());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
