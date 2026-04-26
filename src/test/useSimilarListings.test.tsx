/**
 * Tests for useSimilarListings. The hook builds a chained Supabase query
 * with optional filters, then post-processes the results: hydrating owner
 * profiles via profiles_public and sorting by price proximity when a price
 * is supplied. We drive both branches.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
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
  fromMock.mockReset();
});

/**
 * Builds a Supabase listing-query mock whose terminal awaitable yields
 * `data`. The chained methods (select/eq/limit/neq/ilike) all return `this`.
 */
function listingsBuilder(data: unknown[] | null, error: unknown = null) {
  const b: Record<string, unknown> = {};
  ["select", "limit", "neq", "ilike"].forEach((m) => (b[m] = vi.fn().mockReturnValue(b)));
  // .eq returns the chain *and* is awaited terminally, so it must be a
  // thenable that resolves to {data, error} while still being chainable.
  const eqFn = vi.fn().mockReturnValue(b);
  b.eq = eqFn;
  // Make the whole builder thenable so awaiting it yields {data, error}.
  b.then = (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
    Promise.resolve(resolve({ data, error }));
  return b;
}

function profilesPublicBuilder(rows: { user_id: string; display_name?: string }[]) {
  const b: Record<string, unknown> = {};
  ["select", "in"].forEach((m) => (b[m] = vi.fn().mockReturnValue(b)));
  b.then = (resolve: (v: { data: typeof rows }) => unknown) =>
    Promise.resolve(resolve({ data: rows }));
  return b;
}

describe("useSimilarListings", () => {
  it("stays disabled until at least a city or propertyType is provided", () => {
    const { result } = renderHookWithQuery(() => useSimilarListings({}));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns [] when no listings match", async () => {
    fromMock.mockReturnValueOnce(listingsBuilder([]));
    const { result } = renderHookWithQuery(() =>
      useSimilarListings({ city: "Athens" }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
  });

  it("hydrates profiles and sorts by price proximity when price is provided", async () => {
    fromMock.mockReturnValueOnce(
      listingsBuilder([
        { id: "l1", owner_id: "o1", price: 300_000 },
        { id: "l2", owner_id: "o2", price: 500_000 },
        { id: "l3", owner_id: "o1", price: 100_000 },
      ]),
    );
    fromMock.mockReturnValueOnce(
      profilesPublicBuilder([
        { user_id: "o1", display_name: "Alice" },
        { user_id: "o2", display_name: "Bob" },
      ]),
    );
    const { result } = renderHookWithQuery(() =>
      useSimilarListings({ city: "Athens", price: 320_000, limit: 2 }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // Closest to 320k = l1 (Δ20k), then l2 (Δ180k); l3 (Δ220k) drops past limit.
    expect(result.current.data?.map((r) => r.id)).toEqual(["l1", "l2"]);
    expect(result.current.data?.[0].profiles).toMatchObject({ display_name: "Alice" });
  });

  it("returns listings without sorting when price is not provided", async () => {
    fromMock.mockReturnValueOnce(
      listingsBuilder([
        { id: "l1", owner_id: "o1", price: 100 },
        { id: "l2", owner_id: "o1", price: 999 },
      ]),
    );
    fromMock.mockReturnValueOnce(profilesPublicBuilder([{ user_id: "o1" }]));
    const { result } = renderHookWithQuery(() =>
      useSimilarListings({ propertyType: "apartment" }),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.map((r) => r.id)).toEqual(["l1", "l2"]);
  });

  it("propagates errors from the listings query", async () => {
    fromMock.mockReturnValueOnce(listingsBuilder(null, new Error("rls")));
    const { result } = renderHookWithQuery(() =>
      useSimilarListings({ city: "Athens" }),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
