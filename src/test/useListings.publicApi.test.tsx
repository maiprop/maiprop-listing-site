import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";

const fromMock = vi.fn();
const publicApiMock = vi.fn();

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
  },
}));

vi.mock("@/lib/publicApi", () => ({
  fetchPublicApi: (...args: unknown[]) => publicApiMock(...args),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: null }),
}));

import { useListing, useListings, useListingsPaginated } from "@/hooks/useListings";

const wrap = (children: React.ReactNode) => {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
};

const renderHookWithQuery = <T,>(hook: () => T) => {
  return renderHook(hook, { wrapper: ({ children }) => wrap(children) });
};

const makeThenableBuilder = (data: unknown[] = []) => {
  const b: Record<string, unknown> = {};
  const chain = ["select", "order", "limit", "range", "ilike", "eq", "in", "gte", "lte"];
  for (const method of chain) b[method] = vi.fn().mockReturnValue(b);
  b.then = (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
  return b;
};

const makeMaybeSingleBuilder = (data: unknown) => {
  const b: Record<string, unknown> = {};
  const chain = ["select", "eq", "order", "limit"];
  for (const method of chain) b[method] = vi.fn().mockReturnValue(b);
  b.maybeSingle = vi.fn().mockResolvedValue({ data, error: null });
  return b;
};

beforeEach(() => {
  fromMock.mockReset();
  publicApiMock.mockReset();
});

describe("public listings API fallback behavior", () => {
  it("falls back to constrained Supabase rows when the public grid read is unavailable", async () => {
    publicApiMock.mockRejectedValue(new Error("Public API returned 503"));
    fromMock.mockReturnValue(makeThenableBuilder([{ id: "db-listing", owner_id: null, listing_images: [] }]));

    const { result } = renderHookWithQuery(() => useListings({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/listings?"),
      { throwOnError: true },
    );
    expect(fromMock).toHaveBeenCalledWith("listings");
    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "db-listing", profiles: null }),
    ]);
  });

  it("falls back to constrained Supabase pages when the public paginated read is unavailable", async () => {
    publicApiMock.mockRejectedValue(new Error("Public API returned 503"));
    fromMock.mockReturnValue(makeThenableBuilder([{ id: "db-listing", owner_id: null, listing_images: [] }]));

    const { result } = renderHookWithQuery(() => useListingsPaginated({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/listings?"),
      { throwOnError: true },
    );
    expect(publicApiMock.mock.calls[0][0]).toContain("pageSize=40");
    expect(fromMock).toHaveBeenCalledWith("listings");
    expect(result.current.data?.pages[0]?.data).toEqual([
      expect.objectContaining({ id: "db-listing", profiles: null }),
    ]);
  });

  it("preserves direct Supabase reads for owner-scoped listing data", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([]));

    const { result } = renderHookWithQuery(() => useListings({ owner_id: "owner-1" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("listings");
  });

  it("falls back to the constrained public Supabase detail query when same-origin public detail is unavailable", async () => {
    const listingBuilder = makeMaybeSingleBuilder({
      id: "listing-1",
      owner_id: "owner-1",
      status: "active",
      is_off_market: false,
      title: "Fallback listing",
      listing_images: [],
    });
    const profileBuilder = makeMaybeSingleBuilder({
      user_id: "owner-1",
      display_name: "Fallback Owner",
      avatar_url: null,
      role: "seller",
    });
    publicApiMock.mockRejectedValue(new Error("Public API returned a non-JSON response"));
    fromMock.mockImplementation((table: string) => {
      if (table === "listings") return listingBuilder;
      if (table === "profiles_public") return profileBuilder;
      throw new Error(`unexpected table: ${table}`);
    });

    const { result } = renderHookWithQuery(() => useListing("listing-1", { publicScope: true }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/listing?id=listing-1",
      { throwOnError: true },
    );
    expect(fromMock).toHaveBeenCalledWith("listings");
    expect(listingBuilder.eq).toHaveBeenCalledWith("id", "listing-1");
    expect(listingBuilder.eq).toHaveBeenCalledWith("status", "active");
    expect(listingBuilder.eq).toHaveBeenCalledWith("is_off_market", false);
    expect(result.current.data).toMatchObject({
      id: "listing-1",
      profiles: { display_name: "Fallback Owner" },
    });
  });
});
