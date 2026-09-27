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
    const select = vi.fn(() => ({ eq: () => ({ order: async () => ({ data: rows, error: null }) }) }));
    mockFrom.mockImplementation((table: string) => {
      if (table !== "favorites") throw new Error(`unexpected table: ${table}`);
      return { select };
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { result } = renderHook(() => Array.from({ length: 20 }, (_, i) => useIsFavorited(i ? `other-${i}` : "l1")), { wrapper });
    await waitFor(() => expect(result.current[0].data).toBe(true));
    expect(result.current.slice(1).every(heart => heart.data === false)).toBe(true);
    expect(mockFrom).toHaveBeenCalledTimes(1);
    expect(select).toHaveBeenCalledWith("id, user_id, listing_id, price_alert, price_when_saved, created_at");
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
  it.each([[0, 1, false], [1, 0, false], [0, 1, true], [1, 0, true]] as const)("preserves equal-timestamp saved order when removals fail in order %s,%s with concurrent save=%s", async (first, second, withSave) => {
    const ids = [1, 2, 3, 4].map(n => `d1000000-0000-4000-8000-${String(n).padStart(12, "0")}`);
    const original = ids.slice(0, 3).map((listing_id, i) => ({ id: `favorite-${i}`, listing_id, user_id: "user-a", created_at: "2026-09-01T00:00:00Z", price_alert: false, price_when_saved: null, listings: null }));
    const finishes = new Map<string, (value: { error: Error | null }) => void>();
    mockFrom.mockReturnValue({
      delete: () => ({ eq: () => ({ eq: (_: string, id: string) => new Promise(resolve => finishes.set(id, resolve)) }) }),
      insert: (row: { listing_id: string }) => new Promise(resolve => finishes.set(row.listing_id, resolve)),
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });
    for (const key of ["favoriteMembership", "favorites"]) qc.setQueryData([key, "user-a"], original);
    const { result } = renderHook(() => useToggleFavorite(), { wrapper });
    const writes: Promise<void>[] = [];
    for (const id of ids.slice(0, 2)) {
      act(() => { writes.push(result.current.mutateAsync({ listing_id: id, isFavorited: true })); });
      await waitFor(() => expect(finishes.has(id)).toBe(true));
    }
    let save!: Promise<void>;
    if (withSave) {
      act(() => { save = result.current.mutateAsync({ listing_id: ids[3], isFavorited: false }); });
      await waitFor(() => expect(finishes.has(ids[3])).toBe(true));
    }
    act(() => finishes.get(ids[first])!({ error: new Error("denied") }));
    await expect(writes[first]).rejects.toThrow("denied");
    // A separate successful write must survive either failure completion order.
    if (withSave) {
      act(() => finishes.get(ids[3])!({ error: null }));
      await save;
    }
    act(() => finishes.get(ids[second])!({ error: new Error("denied") }));
    await expect(writes[second]).rejects.toThrow("denied");
    for (const key of ["favoriteMembership", "favorites"]) {
      expect(qc.getQueryData<Array<{ listing_id: string }>>([key, "user-a"])?.map(row => row.listing_id)).toEqual([...(withSave ? [ids[3]] : []), ...ids.slice(0, 3)]);
    }
  });
  it("removes a rejected save from a full view opened while the write was pending", async () => {
    const listingId = "d1000000-0000-4000-8000-000000000011";
    let finishWrite!: (value: { error: Error | null }) => void;
    const insert = vi.fn().mockReturnValue(new Promise<{ error: Error | null }>(resolve => { finishWrite = resolve; }));
    mockFrom.mockReturnValue({ insert });
    mockRpc.mockReturnValue({ select: () => ({ in: async () => ({ data: [{ id: listingId, title: "Transient" }], error: null }) }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });
    qc.setQueryData(["favoriteMembership", "user-a"], []);

    const toggle = renderHook(() => useToggleFavorite(), { wrapper });
    let write!: Promise<void>;
    act(() => { write = toggle.result.current.mutateAsync({ listing_id: listingId, isFavorited: false }); });
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const full = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(full.result.current.data?.[0]?.listing_id).toBe(listingId));

    act(() => finishWrite({ error: new Error("denied") }));
    await expect(write).rejects.toThrow("denied");
    await waitFor(() => expect(full.result.current.data).toEqual([]));
    expect(qc.getQueryData(["favoriteMembership", "user-a"])).toEqual([]);
    expect(qc.getQueryData(["favorites", "user-a"])).toEqual([]);
  });

  it("prevents late full hydration from publishing a rejected optimistic save", async () => {
    const listingId = "d1000000-0000-4000-8000-000000000012";
    let finishWrite!: (value: { error: Error | null }) => void;
    let finishHydration!: (value: { data: Array<{ id: string; title: string }>; error: null }) => void;
    const insert = vi.fn().mockReturnValue(new Promise<{ error: Error | null }>(resolve => { finishWrite = resolve; }));
    mockFrom.mockReturnValue({ insert });
    const inListings = vi.fn().mockReturnValue(new Promise(resolve => { finishHydration = resolve; }));
    mockRpc.mockReturnValue({ select: () => ({ in: inListings }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });
    qc.setQueryData(["favoriteMembership", "user-a"], []);

    const toggle = renderHook(() => useToggleFavorite(), { wrapper });
    let write!: Promise<void>;
    act(() => { write = toggle.result.current.mutateAsync({ listing_id: listingId, isFavorited: false }); });
    await waitFor(() => expect(insert).toHaveBeenCalledTimes(1));
    const full = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(inListings).toHaveBeenCalledTimes(1));

    act(() => finishWrite({ error: new Error("denied") }));
    await expect(write).rejects.toThrow("denied");
    act(() => finishHydration({ data: [{ id: listingId, title: "Transient" }], error: null }));
    await waitFor(() => expect(full.result.current.data).toEqual([]));
    expect(qc.getQueryData(["favoriteMembership", "user-a"])).toEqual([]);
    expect(qc.getQueryData(["favorites", "user-a"])).toEqual([]);
  });

  it("does not publish an intermediate save when two pending saves both fail", async () => {
    const first = "d1000000-0000-4000-8000-000000000031";
    const second = "d1000000-0000-4000-8000-000000000032";
    const finishes = new Map<string, (value: { error: Error | null }) => void>();
    mockFrom.mockReturnValue({
      insert: (row: { listing_id: string }) => new Promise<{ error: Error | null }>(resolve => finishes.set(row.listing_id, resolve)),
    });
    const hydrations: Array<{ ids: string[]; finish: (value: { data: Array<{ id: string; title: string }>; error: null }) => void }> = [];
    mockRpc.mockReturnValue({ select: () => ({ in: (_column: string, ids: string[]) => new Promise(resolve => {
      hydrations.push({ ids, finish: resolve });
    }) }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });
    qc.setQueryData(["favoriteMembership", "user-a"], []);

    const toggle = renderHook(() => useToggleFavorite(), { wrapper });
    let a!: Promise<void>, b!: Promise<void>;
    act(() => {
      a = toggle.result.current.mutateAsync({ listing_id: first, isFavorited: false });
      b = toggle.result.current.mutateAsync({ listing_id: second, isFavorited: false });
    });
    await waitFor(() => expect(finishes.size).toBe(2));
    const full = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(hydrations.length).toBe(1));

    act(() => {
      finishes.get(first)!({ error: new Error("first denied") });
      finishes.get(second)!({ error: new Error("second denied") });
    });
    await Promise.all([expect(a).rejects.toThrow("first denied"), expect(b).rejects.toThrow("second denied")]);
    for (let i = 0; i < hydrations.length; i++) {
      const request = hydrations[i];
      act(() => request.finish({ data: request.ids.map(id => ({ id, title: id })), error: null }));
      await new Promise(resolve => setTimeout(resolve, 0));
    }
    await waitFor(() => expect(full.result.current.data).toEqual([]));
    expect(qc.getQueryData(["favoriteMembership", "user-a"])).toEqual([]);
    expect(qc.getQueryData(["favorites", "user-a"])).toEqual([]);
  });

  it("retains another pending save in a full view when the first save fails", async () => {
    const first = "d1000000-0000-4000-8000-000000000021";
    const second = "d1000000-0000-4000-8000-000000000022";
    const finishes = new Map<string, (value: { error: Error | null }) => void>();
    let confirmed: Array<{ id: string; listing_id: string; user_id: string; price_alert: boolean; price_when_saved: null; created_at: string }> = [];
    mockFrom.mockReturnValue({
      insert: (row: { listing_id: string }) => new Promise<{ error: Error | null }>(resolve => finishes.set(row.listing_id, resolve)),
      select: () => ({ eq: () => ({ order: async () => ({ data: confirmed, error: null }) }) }),
    });
    mockRpc.mockReturnValue({ select: () => ({ in: async (_column: string, ids: string[]) => ({ data: ids.map(id => ({ id, title: id })), error: null }) }) });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "user-a" } });
    qc.setQueryData(["favoriteMembership", "user-a"], []);
    const toggle = renderHook(() => useToggleFavorite(), { wrapper });
    let a!: Promise<void>, b!: Promise<void>;
    act(() => {
      a = toggle.result.current.mutateAsync({ listing_id: first, isFavorited: false });
      b = toggle.result.current.mutateAsync({ listing_id: second, isFavorited: false });
    });
    await waitFor(() => expect(finishes.size).toBe(2));
    const full = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(full.result.current.data?.map(row => row.listing_id)).toEqual([second, first]));

    act(() => finishes.get(first)!({ error: new Error("denied") }));
    await expect(a).rejects.toThrow("denied");
    await waitFor(() => expect(full.result.current.data?.map(row => row.listing_id)).toEqual([second]));
    expect(qc.getQueryData<Array<{ listing_id: string }>>(["favoriteMembership", "user-a"])?.map(row => row.listing_id)).toEqual([second]);

    confirmed = [{ id: "confirmed-second", listing_id: second, user_id: "user-a", price_alert: false, price_when_saved: null, created_at: "2026-01-01" }];
    act(() => finishes.get(second)!({ error: null }));
    await b;
    await waitFor(() => expect(full.result.current.data?.map(row => row.listing_id)).toEqual([second]));
  });
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
    expect(qc.getQueryData(["favoriteMembership", "user-a"])).toBeUndefined();
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
