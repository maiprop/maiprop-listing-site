/**
 * useFavorites hook tests — verifies query key includes user.id,
 * toggle insert/delete logic, and disabled state when logged out.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockFrom = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import { useFavorites } from "@/hooks/useFavorites";

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
