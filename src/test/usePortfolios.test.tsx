/**
 * Tests for the portfolio hooks (list, single, create, update, delete).
 * Each is a thin Supabase wrapper guarded by useAuth, so we mock both.
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor, act } from "@testing-library/react";

const fromMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => fromMock(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

import {
  usePortfolios,
  usePortfolio,
  useCreatePortfolio,
  useUpdatePortfolio,
  useDeletePortfolio,
} from "@/hooks/usePortfolios";

function wrap(children: React.ReactNode) {
  const qc = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0, staleTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function renderHookWithQuery<T>(hook: () => T) {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children) });
}

beforeEach(() => {
  fromMock.mockReset();
  useAuthMock.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
});

describe("usePortfolios()", () => {
  it("waits for an authenticated user before firing", () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => usePortfolios());
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the user's portfolios sorted by updated_at desc", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({
        data: [{ id: "p1", name: "Athens" }],
        error: null,
      }),
    });
    const { result } = renderHookWithQuery(() => usePortfolios());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "p1", name: "Athens" }]);
  });

  it("propagates errors", async () => {
    fromMock.mockReturnValue({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockResolvedValue({ data: null, error: new Error("rls") }),
    });
    const { result } = renderHookWithQuery(() => usePortfolios());
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("usePortfolio(id)", () => {
  it("returns null when id is falsy and skips queries", () => {
    const { result } = renderHookWithQuery(() => usePortfolio(undefined));
    expect(result.current.isPending).toBe(true);
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("waits for an authenticated user before loading a portfolio detail", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => usePortfolio("p1"));
    expect(result.current.isPending).toBe(true);

    await act(async () => {
      await Promise.resolve();
    });

    expect(fromMock).not.toHaveBeenCalled();
  });

  it("returns the portfolio with empty listings when the listing_ids array is empty", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "p1", name: "Athens", listing_ids: [] },
        error: null,
      }),
    });
    const { result } = renderHookWithQuery(() => usePortfolio("p1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toMatchObject({ id: "p1", listings: [] });
  });

  it("hydrates listings in the order specified by listing_ids", async () => {
    // First from() — portfolio fetch
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "p1", name: "Athens", listing_ids: ["l3", "l1", "l2"] },
        error: null,
      }),
    });
    // Second from() — listings fetch (returns out of order)
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({
        data: [{ id: "l1" }, { id: "l2" }, { id: "l3" }],
        error: null,
      }),
    });
    const { result } = renderHookWithQuery(() => usePortfolio("p1"));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.listings.map((l) => l.id)).toEqual([
      "l3",
      "l1",
      "l2",
    ]);
  });

  it("propagates listing hydration errors instead of hiding saved properties", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({
        data: { id: "p1", name: "X", listing_ids: ["l1"] },
        error: null,
      }),
    });
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      in: vi.fn().mockResolvedValue({ data: null, error: new Error("scoped") }),
    });
    const { result } = renderHookWithQuery(() => usePortfolio("p1"));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("rejects when the portfolio is missing", async () => {
    fromMock.mockReturnValueOnce({
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: null }),
    });
    const { result } = renderHookWithQuery(() => usePortfolio("p404"));
    await waitFor(() => expect(result.current.isError).toBe(true));
  });
});

describe("useCreatePortfolio()", () => {
  it("inserts a row stamped with the current user id and returns it", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "p2", name: "New" }, error: null });
    fromMock.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single,
    });
    const { result } = renderHookWithQuery(() => useCreatePortfolio());
    await act(async () => {
      const created = await result.current.mutateAsync("New");
      expect(created).toEqual({ id: "p2", name: "New" });
    });
  });

  it("rejects when insert returns an error", async () => {
    fromMock.mockReturnValue({
      insert: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockResolvedValue({ data: null, error: new Error("dup") }),
    });
    const { result } = renderHookWithQuery(() => useCreatePortfolio());
    await expect(
      act(async () => {
        await result.current.mutateAsync("dup");
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});

describe("useUpdatePortfolio()", () => {
  it("rejects when not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => useUpdatePortfolio());
    await expect(
      act(async () => {
        await result.current.mutateAsync({ id: "p1", updates: { name: "x" } });
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("updates the row scoped to the current user id", async () => {
    const single = vi.fn().mockResolvedValue({ data: { id: "p1", name: "x" }, error: null });
    const eqUserId = vi.fn().mockReturnValue({ select: vi.fn().mockReturnValue({ single }) });
    const eqId = vi.fn().mockReturnValue({ eq: eqUserId });
    fromMock.mockReturnValue({
      update: vi.fn().mockReturnValue({ eq: eqId }),
    });
    const { result } = renderHookWithQuery(() => useUpdatePortfolio());
    await act(async () => {
      await result.current.mutateAsync({ id: "p1", updates: { name: "x" } });
    });
    // The user-id eq filter is the second `.eq` in the chain.
    expect(eqUserId).toHaveBeenCalledWith("user_id", "u-1");
  });
});

describe("useDeletePortfolio()", () => {
  it("rejects when not authenticated", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHookWithQuery(() => useDeletePortfolio());
    await expect(
      act(async () => {
        await result.current.mutateAsync("p1");
      }),
    ).rejects.toBeInstanceOf(Error);
  });

  it("deletes the row scoped to the current user id", async () => {
    const eqUserId = vi.fn().mockResolvedValue({ error: null });
    const eqId = vi.fn().mockReturnValue({ eq: eqUserId });
    fromMock.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: eqId }),
    });
    const { result } = renderHookWithQuery(() => useDeletePortfolio());
    await act(async () => {
      await result.current.mutateAsync("p1");
    });
    expect(eqUserId).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("rejects when delete returns an error", async () => {
    const eqUserId = vi.fn().mockResolvedValue({ error: new Error("rls") });
    const eqId = vi.fn().mockReturnValue({ eq: eqUserId });
    fromMock.mockReturnValue({
      delete: vi.fn().mockReturnValue({ eq: eqId }),
    });
    const { result } = renderHookWithQuery(() => useDeletePortfolio());
    await expect(
      act(async () => {
        await result.current.mutateAsync("p1");
      }),
    ).rejects.toBeInstanceOf(Error);
  });
});
