/**
 * Regression test for the BUG A audit fix in `useListing()`.
 *
 * Before the fix, ownerIsPro was computed by comparing
 * investor_subscriptions.tier === 'pro', but the DB CHECK constraint only
 * allows 'private' / 'institutional' / 'developer' so the comparison was
 * permanently false. Every Pro-owner UI surface was unreachable.
 *
 * After the fix, ownerIsPro is sourced from the public.is_pro(uuid) RPC.
 * These tests verify:
 *   - Listings with no owner_id → ownerIsPro = false
 *   - is_pro RPC returning true → ownerIsPro = true
 *   - is_pro RPC returning false → ownerIsPro = false
 *   - is_pro RPC returning null   → ownerIsPro = false
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    rpc: vi.fn(),
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { useListing } from "@/hooks/useListings";

const TEST_LISTING_ID = "listing-uuid-1";
const TEST_OWNER_ID = "owner-uuid-1";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

/** Minimal supabase.from(...).select(...).eq(...).maybeSingle() mock.
 *  Methods explicitly return the builder rather than relying on mockReturnThis()
 *  whose `this` binding can be flaky when the chain is awaited via Promise.all. */
type MockBuilder = {
  select: ReturnType<typeof vi.fn>;
  eq: ReturnType<typeof vi.fn>;
  order: ReturnType<typeof vi.fn>;
  limit: ReturnType<typeof vi.fn>;
  maybeSingle: ReturnType<typeof vi.fn>;
  single: ReturnType<typeof vi.fn>;
  then: (resolve: (v: unknown) => void) => Promise<void>;
};

function mockTableQuery(resolved: { data: unknown; error: null }) {
  const builder = {} as MockBuilder;
  builder.select = vi.fn(() => builder);
  builder.eq = vi.fn(() => builder);
  builder.order = vi.fn(() => builder);
  builder.limit = vi.fn(() => builder);
  builder.maybeSingle = vi.fn(() => Promise.resolve(resolved));
  builder.single = vi.fn(() => Promise.resolve(resolved));
  // Make the builder thenable so `await builder` (without .maybeSingle/.single)
  // also resolves to the same shape — matches Supabase's PostgrestQueryBuilder.
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve);
  return builder;
}

describe("useListing — BUG A: ownerIsPro is sourced from is_pro RPC", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ownerIsPro=false when listing has no owner_id (RPC not called)", async () => {
    const listingRow = {
      id: TEST_LISTING_ID,
      owner_id: null,
      title: "OS-imported auction",
      listing_images: [],
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "listings") {
        return mockTableQuery({ data: listingRow, error: null }) as unknown as ReturnType<typeof supabase.from>;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { result } = renderHook(() => useListing(TEST_LISTING_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.ownerIsPro).toBe(false);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("returns ownerIsPro=true when is_pro RPC returns true", async () => {
    const listingRow = {
      id: TEST_LISTING_ID,
      owner_id: TEST_OWNER_ID,
      title: "Owned by a Pro",
      listing_images: [],
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "listings") {
        return mockTableQuery({ data: listingRow, error: null }) as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === "profiles_public") {
        return mockTableQuery({
          data: { user_id: TEST_OWNER_ID, display_name: "Pro Owner", avatar_url: null, role: "professional" },
          error: null,
        }) as unknown as ReturnType<typeof supabase.from>;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    // Set up rpc to resolve with data:true. Use mockImplementation directly on
    // the vi.fn() — no `vi.mocked` wrapping needed at runtime.
    const rpcSpy = supabase.rpc as unknown as {
      mockImplementation: (f: (...a: unknown[]) => unknown) => void;
      mock: { calls: unknown[][] };
    };
    rpcSpy.mockImplementation((..._args: unknown[]) => Promise.resolve({ data: true, error: null }));

    const { result } = renderHook(() => useListing(TEST_LISTING_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcSpy.mock.calls.length).toBeGreaterThan(0);
    expect(rpcSpy.mock.calls[0]).toEqual(["is_pro", { p_user_id: TEST_OWNER_ID }]);
    expect(result.current.data?.ownerIsPro).toBe(true);
  });

  it("returns ownerIsPro=false when is_pro RPC returns false", async () => {
    const listingRow = {
      id: TEST_LISTING_ID,
      owner_id: TEST_OWNER_ID,
      title: "Owned by a non-Pro",
      listing_images: [],
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "listings") {
        return mockTableQuery({ data: listingRow, error: null }) as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === "profiles_public") {
        return mockTableQuery({
          data: { user_id: TEST_OWNER_ID, display_name: "Free User", avatar_url: null, role: "buyer" },
          error: null,
        }) as unknown as ReturnType<typeof supabase.from>;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    (supabase.rpc as unknown as { mockImplementation: (f: () => unknown) => void })
      .mockImplementation(() => Promise.resolve({ data: false, error: null }));

    const { result } = renderHook(() => useListing(TEST_LISTING_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.ownerIsPro).toBe(false);
  });

  it("returns ownerIsPro=false when is_pro RPC returns null (defensive)", async () => {
    const listingRow = {
      id: TEST_LISTING_ID,
      owner_id: TEST_OWNER_ID,
      title: "Listing with RPC null result",
      listing_images: [],
    };

    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "listings") {
        return mockTableQuery({ data: listingRow, error: null }) as unknown as ReturnType<typeof supabase.from>;
      }
      if (table === "profiles_public") {
        return mockTableQuery({
          data: { user_id: TEST_OWNER_ID, display_name: "Owner", avatar_url: null, role: "buyer" },
          error: null,
        }) as unknown as ReturnType<typeof supabase.from>;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    (supabase.rpc as unknown as { mockImplementation: (f: () => unknown) => void })
      .mockImplementation(() => Promise.resolve({ data: null, error: null }));

    const { result } = renderHook(() => useListing(TEST_LISTING_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.ownerIsPro).toBe(false);
  });

  it("returns null when the listing does not exist", async () => {
    vi.mocked(supabase.from).mockImplementation((table: string) => {
      if (table === "listings") {
        return mockTableQuery({ data: null, error: null }) as unknown as ReturnType<typeof supabase.from>;
      }
      throw new Error(`unexpected table: ${table}`);
    });

    const { result } = renderHook(() => useListing(TEST_LISTING_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBeNull();
    expect(supabase.rpc).not.toHaveBeenCalled();
  });
});
