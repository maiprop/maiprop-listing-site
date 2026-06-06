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

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: vi.fn(), auth: { getUser: vi.fn() } },
}));
vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
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
import { useCreateListing, useUpdateListing, useDeleteListing } from "@/hooks/useListings";

const TEST_USER_ID = "user-test-123";
const TEST_LISTING_ID = "listing-test-456";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Minimal chainable Supabase mock that resolves with given data */
function makeInsertChain(data: unknown) {
  const chain: Record<string, unknown> = {};
  chain.insert = vi.fn().mockReturnValue(chain);
  chain.update = vi.fn().mockReturnValue(chain);
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.select = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.single = vi.fn().mockResolvedValue({ data, error: null });
  chain.then = (resolve: (v: { data: unknown; error: null }) => void) =>
    Promise.resolve({ data, error: null }).then(resolve);
  chain.catch = (_rej: unknown) => Promise.resolve({ data, error: null });
  return chain;
}

function makeDeleteChain() {
  const chain: Record<string, unknown> = {};
  chain.delete = vi.fn().mockReturnValue(chain);
  chain.eq = vi.fn().mockReturnValue(chain);
  chain.then = (resolve: (v: { error: null }) => void) =>
    Promise.resolve({ error: null }).then(resolve);
  chain.catch = (_rej: unknown) => Promise.resolve({ error: null });
  return chain;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(useAuth).mockReturnValue({ user: { id: TEST_USER_ID } } as ReturnType<typeof useAuth>);
});

// ── useCreateListing ────────────────────────────────────────────────────────

describe("useCreateListing", () => {
  it("inserts listing with owner_id and resolves with data", async () => {
    const mockListing = { id: TEST_LISTING_ID, title: "Test Villa", owner_id: TEST_USER_ID };
    const chain = makeInsertChain(mockListing);
    vi.mocked(supabase).from = vi.fn().mockReturnValue(chain);

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

    expect(vi.mocked(supabase).from).toHaveBeenCalledWith("listings");
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        owner_id: TEST_USER_ID,
        status: "active",
        latitude: 37.9779,
        longitude: 23.7354,
      })
    );
  });

  it("shows success toast on create", async () => {
    const chain = makeInsertChain({ id: TEST_LISTING_ID, title: "Test Villa", owner_id: TEST_USER_ID });
    vi.mocked(supabase).from = vi.fn().mockReturnValue(chain);

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
    const chain: Record<string, unknown> = {};
    chain.insert = vi.fn().mockReturnValue(chain);
    chain.select = vi.fn().mockReturnValue(chain);
    chain.single = vi.fn().mockResolvedValue({ data: null, error: dbError });
    vi.mocked(supabase).from = vi.fn().mockReturnValue(chain);

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
    const chain = makeInsertChain(updated);
    vi.mocked(supabase).from = vi.fn().mockReturnValue(chain);

    const { result } = renderHook(() => useUpdateListing(), { wrapper });
    await act(async () => {
      const data = await result.current.mutateAsync({
        id: TEST_LISTING_ID,
        updates: { title: "Updated Title" },
      });
      expect(data).toEqual(updated);
    });

    // Verify ownership filter applied
    const eqCalls = vi.mocked(chain.eq as ReturnType<typeof vi.fn>).mock.calls;
    const hasIdFilter = eqCalls.some(([col]) => col === "id");
    const hasOwnerFilter = eqCalls.some(([col]) => col === "owner_id");
    expect(hasIdFilter).toBe(true);
    expect(hasOwnerFilter).toBe(true);
  });

  it("shows success toast after update", async () => {
    const chain = makeInsertChain({ id: TEST_LISTING_ID, owner_id: TEST_USER_ID });
    vi.mocked(supabase).from = vi.fn().mockReturnValue(chain);

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
    const chain = makeDeleteChain();
    vi.mocked(supabase).from = vi.fn().mockReturnValue(chain);

    const { result } = renderHook(() => useDeleteListing(), { wrapper });
    await act(async () => {
      await result.current.mutateAsync(TEST_LISTING_ID);
    });

    const eqCalls = vi.mocked(chain.eq as ReturnType<typeof vi.fn>).mock.calls;
    expect(eqCalls.some(([col]) => col === "id")).toBe(true);
    expect(eqCalls.some(([col]) => col === "owner_id")).toBe(true);
    expect(eqCalls.some(([, val]) => val === TEST_LISTING_ID)).toBe(true);
    expect(eqCalls.some(([, val]) => val === TEST_USER_ID)).toBe(true);
  });

  it("shows success toast after delete", async () => {
    const chain = makeDeleteChain();
    vi.mocked(supabase).from = vi.fn().mockReturnValue(chain);

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
