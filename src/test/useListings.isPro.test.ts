/**
 * Regression tests for listing detail loading and owner Pro status.
 *
 * The browser must not receive direct execute grants on subscription helper
 * RPCs. Owner Pro status resolves through the owner-pro-status Edge Function,
 * but separately from useListing() so ad detail pages can first-paint quickly.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn(),
    functions: {
      invoke: vi.fn(),
    },
  },
}));

import { supabase } from "@/integrations/supabase/client";
import { useListing, useOwnerProStatus } from "@/hooks/useListings";

const TEST_LISTING_ID = "00000000-0000-4000-8000-000000000101";
const TEST_OWNER_ID = "00000000-0000-4000-8000-000000000001";

function wrapper({ children }: { children: React.ReactNode }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return React.createElement(QueryClientProvider, { client: qc }, children);
}

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
  builder.then = (resolve: (v: unknown) => void) => Promise.resolve(resolved).then(resolve);
  return builder;
}

describe("useListing detail loading and owner Pro status", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ownerIsPro=false when listing has no owner_id", async () => {
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
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });

  it("loads owner profile without waiting on owner-pro-status", async () => {
    const listingRow = {
      id: TEST_LISTING_ID,
      owner_id: TEST_OWNER_ID,
      title: "Owned listing",
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
    const { result } = renderHook(() => useListing(TEST_LISTING_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.functions.invoke).not.toHaveBeenCalled();
    expect(result.current.data?.profiles?.display_name).toBe("Pro Owner");
    expect(result.current.data?.ownerIsPro).toBe(false);
  });

  it("returns ownerIsPro=false when owner-pro-status returns false", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { isPro: false }, error: null });

    const { result } = renderHook(() => useOwnerProStatus(TEST_LISTING_ID, TEST_OWNER_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(false);
  });

  it("returns ownerIsPro=false when owner-pro-status returns null", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: null, error: null });

    const { result } = renderHook(() => useOwnerProStatus(TEST_LISTING_ID, TEST_OWNER_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data).toBe(false);
  });

  it("returns ownerIsPro=true when owner-pro-status returns true", async () => {
    vi.mocked(supabase.functions.invoke).mockResolvedValue({ data: { isPro: true }, error: null });

    const { result } = renderHook(() => useOwnerProStatus(TEST_LISTING_ID, TEST_OWNER_ID), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(supabase.functions.invoke).toHaveBeenCalledWith("owner-pro-status", {
      body: { listingId: TEST_LISTING_ID },
    });
    expect(result.current.data).toBe(true);
  });

  it("does not call owner-pro-status when the listing payload already proves Pro status", async () => {
    const { result } = renderHook(
      () => useOwnerProStatus(TEST_LISTING_ID, TEST_OWNER_ID, { enabled: false, initialData: true }),
      { wrapper },
    );

    expect(result.current.data).toBe(true);
    expect(result.current.fetchStatus).toBe("idle");
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
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
    expect(supabase.functions.invoke).not.toHaveBeenCalled();
  });
});
