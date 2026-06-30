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

vi.mock("@/hooks/useAuctionListings", () => ({
  useAuctionListings: () => ({ data: [], isLoading: false, isSuccess: true }),
}));

import {
  useHomepageFeaturedListings,
  useHomepageOpenHouseListings,
} from "@/hooks/useHomepageListings";

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
  const chain = ["select", "order", "limit", "eq", "gte", "in"];
  for (const method of chain) b[method] = vi.fn().mockReturnValue(b);
  b.then = (resolve: (value: unknown) => unknown, reject: (reason?: unknown) => unknown) =>
    Promise.resolve({ data, error: null }).then(resolve, reject);
  return b;
};

beforeEach(() => {
  fromMock.mockReset();
  publicApiMock.mockReset();
});

describe("homepage public API fallback behavior", () => {
  it("falls back to constrained Supabase reads for Spotlight listings when the public API is unavailable", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([{ id: "db-featured", title: "DB Spotlight", city: "Athens" }]));

    const { result } = renderHookWithQuery(() => useHomepageFeaturedListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-featured" });
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/homepage?section=featured",
      { throwOnError: true },
    );
    expect(fromMock).toHaveBeenCalledWith("listings");
  });

  it("falls back to constrained Supabase reads for open houses when the public API is unavailable", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([{ id: "db-open-house", title: "DB Open House", city: "Athens" }]));

    const { result } = renderHookWithQuery(() => useHomepageOpenHouseListings());
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(result.current.data?.[0]).toMatchObject({ id: "db-open-house" });
    expect(publicApiMock).toHaveBeenCalledWith(
      "/api/public/homepage?section=open-houses",
      { throwOnError: true },
    );
    expect(fromMock).toHaveBeenCalledWith("listings");
  });
});
