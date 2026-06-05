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

import { useListings, useListingsPaginated } from "@/hooks/useListings";

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

beforeEach(() => {
  fromMock.mockReset();
  publicApiMock.mockReset();
});

describe("public listings API fallback behavior", () => {
  it("surfaces public grid read outages without direct Supabase fallback", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([{ id: "db-listing" }]));

    const { result } = renderHookWithQuery(() => useListings({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/listings?"),
      { throwOnError: true },
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("surfaces public paginated read outages without direct Supabase fallback", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([{ id: "db-listing" }]));

    const { result } = renderHookWithQuery(() => useListingsPaginated({ listing_type: "sale" }));
    await waitFor(() => expect(result.current.isError).toBe(true));

    expect(publicApiMock).toHaveBeenCalledWith(
      expect.stringContaining("/api/public/listings?"),
      { throwOnError: true },
    );
    expect(fromMock).not.toHaveBeenCalled();
  });

  it("preserves direct Supabase reads for owner-scoped listing data", async () => {
    publicApiMock.mockResolvedValue(null);
    fromMock.mockReturnValue(makeThenableBuilder([]));

    const { result } = renderHookWithQuery(() => useListings({ owner_id: "owner-1" }));
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(publicApiMock).not.toHaveBeenCalled();
    expect(fromMock).toHaveBeenCalledWith("listings");
  });
});
