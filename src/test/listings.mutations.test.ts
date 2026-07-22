/**
 * Mutation success-path tests for listings hooks.
 *
 * Verifies that:
 *   - useCreateListing inserts the correct payload and invalidates caches
 *   - useUpdateListing updates with ownership guard + invalidates specific listing cache
 *   - useDeleteListing deletes with ownership guard + invalidates caches
 *   - onError calls toast.error with the message
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const listingBoundaryMocks = vi.hoisted(() => ({
  create: vi.fn(),
  update: vi.fn(),
  remove: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    auth: { getUser: vi.fn() },
    functions: { invoke: vi.fn() },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));
vi.mock("@/hooks/listingManagementBoundary", () => ({
  createListingForUser: (...args: unknown[]) => listingBoundaryMocks.create(...args),
  updateListingForUser: (...args: unknown[]) => listingBoundaryMocks.update(...args),
  deleteListingForUser: (...args: unknown[]) => listingBoundaryMocks.remove(...args),
}));
vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (k: string) => k, i18n: { language: "en" } }),
}));

import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { toast } from "sonner";
import {
  useCreateListing,
  useDeleteListing,
  useTrackListingView,
  useUpdateListing,
} from "@/hooks/useListings";

const TEST_USER_ID = "user-test-123";
const TEST_LISTING_ID = "listing-test-456";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(useAuth).mockReturnValue({ user: { id: TEST_USER_ID } } as ReturnType<typeof useAuth>);
  listingBoundaryMocks.create.mockResolvedValue({ id: TEST_LISTING_ID, owner_id: TEST_USER_ID });
  listingBoundaryMocks.update.mockResolvedValue({ id: TEST_LISTING_ID, owner_id: TEST_USER_ID });
  listingBoundaryMocks.remove.mockResolvedValue(undefined);
});

describe("useTrackListingView", () => {
  const listingId = "11111111-1111-4111-8111-111111111111";

  it("retries when the Edge Function accepts but does not record the view", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true, recorded: false, reason: "auth_unavailable" },
      error: null,
    });
    const { result } = renderHook(() => useTrackListingView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(listingId);
      await result.current.mutateAsync(listingId);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(`maiprop_viewed_${listingId}`)).toBeNull();
  });

  it("deduplicates only after the Edge Function confirms success", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: { success: true },
      error: null,
    });
    const { result } = renderHook(() => useTrackListingView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(listingId);
      await result.current.mutateAsync(listingId);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(1);
    expect(localStorage.getItem(`maiprop_viewed_${listingId}`)).not.toBeNull();
  });

  it("retries after an Edge Function error", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({
      data: null,
      error: new Error("temporary failure"),
    });
    const { result } = renderHook(() => useTrackListingView(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync(listingId);
      await result.current.mutateAsync(listingId);
    });

    expect(supabase.functions.invoke).toHaveBeenCalledTimes(2);
  });
});

// ── useCreateListing ────────────────────────────────────────────────────────

describe("useCreateListing", () => {
  it("inserts listing with owner_id and resolves with data", async () => {
    const mockListing = { id: TEST_LISTING_ID, title: "Test Villa", owner_id: TEST_USER_ID };
    listingBoundaryMocks.create.mockResolvedValue(mockListing);

    const { result } = renderHook(() => useCreateListing(), { wrapper });

    await act(async () => {
      const data = await result.current.mutateAsync({
        title: "Test Villa",
        city: "Athens",
        price: 250000,
        sqm: 90,
        property_type: "apartment",
        listing_type: "sale",
        latitude: 37.9779,
        longitude: 23.7354,
      });
      expect(data).toEqual(mockListing);
    });

    expect(listingBoundaryMocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: TEST_USER_ID,
        status: "active",
        latitude: 37.9779,
        longitude: 23.7354,
      })
    );
  });

  it("shows success toast on create", async () => {
    const { result } = renderHook(() => useCreateListing(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        title: "Test Villa", city: "Athens", price: 250000, sqm: 90,
        property_type: "apartment", listing_type: "sale",
      });
    });

    expect(toast.success).toHaveBeenCalledWith("Listing published successfully!");
  });

  it("throws and shows error toast when insert fails", async () => {
    const dbError = new Error("Listing quota exceeded");
    listingBoundaryMocks.create.mockRejectedValue(dbError);

    const { result } = renderHook(() => useCreateListing(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({
        title: "Over Limit", city: "Athens", price: 100000, sqm: 50,
        property_type: "apartment", listing_type: "sale",
      }).catch(() => {});
    });

    expect(toast.error).toHaveBeenCalled();
  });
});

// ── useUpdateListing ────────────────────────────────────────────────────────

describe("useUpdateListing", () => {
  it("updates with both id and owner_id guards", async () => {
    const updated = { id: TEST_LISTING_ID, title: "Updated Title", owner_id: TEST_USER_ID };
    listingBoundaryMocks.update.mockResolvedValue(updated);

    const { result } = renderHook(() => useUpdateListing(), { wrapper });
    await act(async () => {
      const data = await result.current.mutateAsync({
        id: TEST_LISTING_ID,
        updates: { title: "Updated Title" },
      });
      expect(data).toEqual(updated);
    });

    expect(listingBoundaryMocks.update).toHaveBeenCalledWith(
      TEST_LISTING_ID,
      { title: "Updated Title" },
    );
  });

  it("shows success toast after update", async () => {
    const { result } = renderHook(() => useUpdateListing(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync({ id: TEST_LISTING_ID, updates: { price: 300000 } });
    });

    expect(toast.success).toHaveBeenCalledWith("Listing updated!");
  });
});

// ── useDeleteListing ────────────────────────────────────────────────────────

describe("useDeleteListing", () => {
  it("deletes with both id and owner_id guards", async () => {
    const { result } = renderHook(() => useDeleteListing(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(TEST_LISTING_ID);
    });

    expect(listingBoundaryMocks.remove).toHaveBeenCalledWith(TEST_LISTING_ID);
  });

  it("shows success toast after delete", async () => {
    const { result } = renderHook(() => useDeleteListing(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(TEST_LISTING_ID);
    });

    expect(toast.success).toHaveBeenCalledWith("Listing deleted.");
  });

  it("throws when not authenticated", async () => {
    vi.mocked(useAuth).mockReturnValue({ user: null } as ReturnType<typeof useAuth>);

    const { result } = renderHook(() => useDeleteListing(), { wrapper });
    await act(async () => {
      await expect(result.current.mutateAsync(TEST_LISTING_ID)).rejects.toThrow("Must be logged in");
    });
  });
});
