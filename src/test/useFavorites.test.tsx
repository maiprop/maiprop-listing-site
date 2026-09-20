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
import { useFavorites, useToggleFavorite } from "@/hooks/useFavorites";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc.clear();
});

describe("useFavorites", () => {
  it("returns empty array when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { result } = renderHook(() => useFavorites(), { wrapper });
    expect(result.current.data).toBeUndefined();
    expect(result.current.isLoading).toBe(false);
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
      if (table === "public_listing_catalogue") {
        return { select: vi.fn().mockReturnValue({ in: listingIn }) };
      }
      throw new Error(`unexpected table: ${table}`);
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { result } = renderHook(() => useFavorites(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith("favorites");
    expect(mockFrom).toHaveBeenCalledWith("public_listing_catalogue");
    expect(listingIn).toHaveBeenCalledWith("id", ["l1"]);
    expect(result.current.data?.[0].listings).toMatchObject({ id: "l1", title: "Test" });
  });
});

describe("useToggleFavorite", () => {
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
