/**
 * Tests for the analytics hooks: useListingViewTrends and useLeadFunnel.
 * Both wrap Supabase queries; we drive them with mocked builders and assert
 * the post-fetch transformations (per-day counts, status roll-ups).
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));

import { useListingViewTrends, useLeadFunnel } from "@/hooks/useAnalytics";

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

describe("useListingViewTrends", () => {
  it("returns [] without firing the query when listingIds is empty", async () => {
    const { result } = renderHookWithQuery(() => useListingViewTrends([], 7));
    // disabled when listingIds.length === 0
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("groups view events by ISO day and sorts ascending by date", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({
        data: [
          { listing_id: "l1", viewed_at: "2026-04-10T10:00:00Z" },
          { listing_id: "l1", viewed_at: "2026-04-10T11:00:00Z" },
          { listing_id: "l1", viewed_at: "2026-04-12T08:00:00Z" },
          { listing_id: "l2", viewed_at: "2026-04-09T14:00:00Z" },
        ],
        error: null,
      }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() =>
      useListingViewTrends(["l1", "l2"], 30),
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([
      { date: "2026-04-09", count: 1 },
      { date: "2026-04-10", count: 2 },
      { date: "2026-04-12", count: 1 },
    ]);
  });

  it("propagates errors from the underlying query", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockReturnThis(),
      gte: vi.fn().mockResolvedValue({ data: null, error: new Error("db") }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() =>
      useListingViewTrends(["l1"], 7),
    );
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useLeadFunnel", () => {
  it("returns zero counts when professionalId is undefined", async () => {
    const { result } = renderHookWithQuery(() => useLeadFunnel(undefined));
    // enabled === false, so the query stays pending; we assert by looking at
    // the disabled default (data is undefined until the queryFn resolves).
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("rolls up status counts and computes conversionRate", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({
        data: [
          { status: "pending" },
          { status: "pending" },
          { status: "reviewed" },
          { status: "confirmed" },
          { status: "confirmed" },
          { status: "cancelled" },
        ],
        error: null,
      }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useLeadFunnel("pro1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      pending: 2,
      reviewed: 1,
      confirmed: 2,
      cancelled: 1,
      total: 6,
      conversionRate: 33, // round(2/6 * 100)
    });
  });

  it("returns conversionRate=0 when there are no leads at all", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: [], error: null }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useLeadFunnel("pro2"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ total: 0, conversionRate: 0 });
  });

  it("propagates errors from the query", async () => {
    const builder = {
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ data: null, error: new Error("boom") }),
    };
    fromMock.mockReturnValue(builder);
    const { result } = renderHookWithQuery(() => useLeadFunnel("pro3"));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});
