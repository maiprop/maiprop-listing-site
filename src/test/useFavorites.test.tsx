/**
 * useFavorites hook tests — verifies query key includes user.id,
 * toggle insert/delete logic, and disabled state when logged out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockFrom = vi.fn();
const mockRpc = vi.fn((fn: string) =>
  mockFrom(fn === "get_public_listing_catalogue" ? "public_listing_catalogue" : fn));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    rpc: (...args: unknown[]) => mockRpc(...args),
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import { useFavorites, useFavoriteMembership, useIsFavorited, useToggleFavorite } from "@/hooks/useFavorites";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc.clear();
});

describe("useFavorites", () => {
  it("shares one row read across twenty cold heart consumers without hydrating listings", async () => {
    const rows = [{ id: "f1", listing_id: "l1", user_id: "u1", price_alert: true, price_when_saved: 42, created_at: "2026-01-01" }];
    mockFrom.mockImplementation((table: string) => {
      if (table !== "favorites") throw new Error(`unexpected table: ${table}`);
      return { select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) };
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { result } = renderHook(() => Array.from({ length: 20 }, (_, i) => useIsFavorited(i ? `other-${i}` : "l1")), { wrapper });
    await waitFor(() => expect(result.current[0].data).toBe(true));
    expect(result.current.slice(1).every(heart => heart.data === false)).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockRpc).not.toHaveBeenCalled();
    expect(qc.getQueryData(["favoriteMembership", "u1"])).toEqual(rows);
  });

  it("hydrates the full saved view from the same membership read and retains missing listings", async () => {
    const rows = [
      { id: "f1", listing_id: "l1", user_id: "u1", price_alert: true, price_when_saved: 42, created_at: "2026-01-02" },
      { id: "f2", listing_id: "missing", user_id: "u1", price_alert: false, price_when_saved: null, created_at: "2026-01-01" },
    ];
    mockFrom.mockImplementation((table: string) => {
      if (table !== "favorites") throw new Error(`unexpected table: ${table}`);
      return { select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) };
    });
    mockRpc.mockReturnValue({ select: () => ({ in: async () => ({ data: [{ id: "l1", title: "Saved", city: "Athens", listing_type: "sale", property_type: "apartment", listing_images: [] }], error: null }) }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { result } = renderHook(() => ({ membership: useFavoriteMembership(), full: useFavorites() }), { wrapper });
    await waitFor(() => expect(result.current.full.isSuccess).toBe(true));
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(mockRpc).toHaveBeenCalledTimes(1);
    expect(result.current.full.data?.map(row => [row.listing_id, row.price_alert, row.price_when_saved, row.listings?.id ?? null])).toEqual([
      ["l1", true, 42, "l1"], ["missing", false, null, null],
    ]);
  });
  it("returns empty array when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { result } = renderHook(() => useFavorites(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
  });

  it("does not expose the previous account's membership during a session switch", async () => {
    const authState = { user: { id: "user-a" } };
    (useAuth as ReturnType<typeof vi.fn>).mockImplementation(() => authState);
    qc.setQueryData(["favoriteMembership", "user-a"], [{ listing_id: "a" }]);
    const { result, rerender } = renderHook(() => useIsFavorited("a"), { wrapper });
    expect(result.current.data).toBe(true);
    authState.user = { id: "user-b" };
    rerender();
    expect(result.current.data).toBe(false);
  });

  it("keeps a membership read failure out of the full saved cache", async () => {
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ order: async () => ({ data: null, error: new Error("read denied") }) }) }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { result } = renderHook(() => ({ membership: useFavoriteMembership(), full: useFavorites() }), { wrapper });
    await waitFor(() => expect(result.current.full.isError).toBe(true));
    expect(result.current.membership.isError).toBe(true);
    expect(qc.getQueryData(["favorites", "u1"])).toBeUndefined();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("preserves membership when public listing hydration fails", async () => {
    const rows = [{ id: "f1", listing_id: "l1", user_id: "u1", price_alert: false, price_when_saved: null, created_at: "2026-01-01" }];
    mockFrom.mockReturnValue({ select: () => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }) });
    mockRpc.mockReturnValue({ select: () => ({ in: async () => ({ data: null, error: new Error("hydrate denied") }) }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { result } = renderHook(() => ({ heart: useIsFavorited("l1"), full: useFavorites() }), { wrapper });
    await waitFor(() => expect(result.current.full.isError).toBe(true));
    expect(result.current.heart.data).toBe(true);
    expect(qc.getQueryData(["favorites", "u1"])).toBeUndefined();
  });

  it("fetches favorites with user_id filter", async () => {
    const favoriteRows = [{ id: "f1", listing_id: "l1", user_id: "u1" }];
    const listingRows = [{
      id: "l1",
      title: "Test",
      city: "Athens",
      listing_type: "sale",
      property_type: "apartment",
      listing_images: [],
    }];
    const listingIn = vi.fn().mockResolvedValue({ data: listingRows, error: null });
    mockFrom.mockImplementation((table: string) => {
      if (table === "favorites") {
        return {
          select: vi.fn().mockReturnValue({
            eq: vi.fn().mockReturnValue({
              order: vi.fn().mockResolvedValue({ data: favoriteRows, error: null }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    mockRpc.mockReturnValue({ select: vi.fn().mockReturnValue({ in: listingIn }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith("favorites");
    expect(mockRpc).toHaveBeenCalledWith("get_public_listing_catalogue");
    expect(listingIn).toHaveBeenCalledWith("id", ["l1"]);
    expect(result.current.data?.[0].listings).toMatchObject({ id: "l1", title: "Test" });
  });
});

describe("useToggleFavorite", () => {
  it("keeps a confirmed save when another listing fails later, across both caches", async () => {
    const first = "d1000000-0000-4000-8000-000000000001";
    const second = "d1000000-0000-4000-8000-000000000002";
    const finishes = new Map<string, (value: { error: Error | null }) => void>();
    const insert = vi.fn((row: { listing_id: string }) => new Promise<{ error: Error | null }>(resolve => finishes.set(row.listing_id, resolve)));
    mockFrom.mockReturnValue({ insert });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });
    qc.setQueryData(["favoriteMembership", "user-a"], []);
    qc.setQueryData(["favorites", "user-a"], []);
    const { result } = renderHook(() => useToggleFavorite(), { wrapper });
    let a!: Promise<void>, b!: Promise<void>;
    act(() => {
      a = result.current.mutateAsync({ listing_id: first, isFavorited: false });
      b = result.current.mutateAsync({ listing_id: second, isFavorited: false, priceAlert: true, price: 200 });
    });
    await waitFor(() => expect(finishes.size).toBe(2));
    act(() => finishes.get(second)!({ error: null }));
    await b;
    act(() => finishes.get(first)!({ error: new Error("denied") }));
    await expect(a).rejects.toThrow("denied");
    expect((qc.getQueryData<Array<{ listing_id: string }>>(["favoriteMembership", "user-a"]) ?? []).map(row => row.listing_id)).toEqual([second]);
    expect((qc.getQueryData<Array<{ listing_id: string; listings: unknown }>>(["favorites", "user-a"]) ?? []).map(row => [row.listing_id, row.listings])).toEqual([[second, null]]);
  });

  it("restores only a failed listing while a later save remains in flight", async () => {
    const first = "d1000000-0000-4000-8000-000000000001";
    const second = "d1000000-0000-4000-8000-000000000002";
    const finishes = new Map<string, (value: { error: Error | null }) => void>();
    mockFrom.mockReturnValue({ insert: (row: { listing_id: string }) => new Promise<{ error: Error | null }>(resolve => finishes.set(row.listing_id, resolve)) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });
    qc.setQueryData(["favoriteMembership", "user-a"], []);
    const { result } = renderHook(() => useToggleFavorite(), { wrapper });
    let a!: Promise<void>, b!: Promise<void>;
    act(() => {
      a = result.current.mutateAsync({ listing_id: first, isFavorited: false });
      b = result.current.mutateAsync({ listing_id: second, isFavorited: false });
    });
    await waitFor(() => expect(finishes.size).toBe(2));
    act(() => finishes.get(first)!({ error: new Error("denied") }));
    await expect(a).rejects.toThrow("denied");
    expect((qc.getQueryData<Array<{ listing_id: string }>>(["favoriteMembership", "user-a"]) ?? []).map(row => row.listing_id)).toEqual([second]);
    act(() => finishes.get(second)!({ error: null }));
    await b;
    expect((qc.getQueryData<Array<{ listing_id: string }>>(["favoriteMembership", "user-a"]) ?? []).map(row => row.listing_id)).toEqual([second]);
  });
  it("rolls a failed optimistic save back to an absent cache", async () => {
    const insert = vi.fn().mockResolvedValue({ error: new Error("write denied") });
    mockFrom.mockReturnValue({ insert });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });

    const { result } = renderHook(() => useToggleFavorite(), { wrapper });
    act(() => result.current.mutate({
      listing_id: "d1000000-0000-4000-8000-000000000001",
      isFavorited: false,
    }));

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(["favorites", "user-a"])).toBeUndefined();
  });

  it("keeps an in-flight write and rollback bound to the initiating account", async () => {
    let finishWrite!: (value: { error: Error }) => void;
    const insert = vi.fn().mockReturnValue(new Promise<{ error: Error }>((resolve) => {
      finishWrite = resolve;
    }));
    mockFrom.mockReturnValue({ insert });
    const authState = { user: { id: "user-a" } };
    (useAuth as ReturnType<typeof vi.fn>).mockImplementation(() => authState);
    qc.setQueryData(["favorites", "user-a"], []);
    qc.setQueryData(["favorites", "user-b"], [{
      listing_id: "b1000000-0000-4000-8000-000000000001",
      user_id: "user-b",
    }]);

    const { result, rerender } = renderHook(() => useToggleFavorite(), { wrapper });
    act(() => result.current.mutate({
      listing_id: "d1000000-0000-4000-8000-000000000001",
      isFavorited: false,
    }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-a" })));

    authState.user = { id: "user-b" };
    rerender();
    finishWrite({ error: new Error("write denied") });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(qc.getQueryData(["favorites", "user-a"])).toEqual([]);
    expect(qc.getQueryData(["favorites", "user-b"])).toEqual([{
      listing_id: "b1000000-0000-4000-8000-000000000001",
      user_id: "user-b",
    }]);
  });

  it("invalidates only the initiating account after an in-flight account switch", async () => {
    let finishWrite!: (value: { error: null }) => void;
    const insert = vi.fn().mockReturnValue(new Promise<{ error: null }>((resolve) => {
      finishWrite = resolve;
    }));
    mockFrom.mockReturnValue({ insert });
    const authState = { user: { id: "user-a" } };
    (useAuth as ReturnType<typeof vi.fn>).mockImplementation(() => authState);
    const invalidateQueries = vi.spyOn(qc, "invalidateQueries");

    const { result, rerender } = renderHook(() => useToggleFavorite(), { wrapper });
    act(() => result.current.mutate({
      listing_id: "d1000000-0000-4000-8000-000000000001",
      isFavorited: false,
    }));
    await waitFor(() => expect(insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: "user-a" })));

    authState.user = { id: "user-b" };
    rerender();
    finishWrite({ error: null });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["favorites", "user-a"],
      exact: true,
    });
    expect(invalidateQueries).not.toHaveBeenCalledWith({
      queryKey: ["favorites", "user-b"],
      exact: true,
    });
  });
});
