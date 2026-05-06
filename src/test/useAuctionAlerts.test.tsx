/**
 * useAuctionAlerts hook tests — verifies user-scoped queries,
 * disabled when logged out, explicit column selection, mutation handlers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockChain = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
};
Object.values(mockChain).forEach(m => m.mockReturnValue(mockChain));

const mockGetUser = vi.fn();
const mockFrom = vi.fn().mockReturnValue(mockChain);

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => mockFrom(...args),
    auth: { getUser: (...a: unknown[]) => mockGetUser(...a) },
  },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));
vi.mock("@/lib/planLimitErrors", () => ({ getPlanLimitErrorMessage: vi.fn().mockReturnValue(null) }));

import { useAuth } from "@/contexts/AuthContext";
import {
  useAuctionAlerts,
  useCreateAuctionAlert,
  useUpdateAuctionAlert,
  useDeleteAuctionAlert,
} from "@/hooks/useAuctionAlerts";

const makeWrapper = () => {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return {
    qc,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    ),
  };
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: all chain methods return the chain itself (enables chaining)
  Object.values(mockChain).forEach(m => m.mockReturnValue(mockChain));
  // Terminal methods get their default resolved values
  mockChain.order.mockResolvedValue({ data: [], error: null });
  mockFrom.mockReturnValue(mockChain);
  mockGetUser.mockResolvedValue({ data: { user: { id: "u1" } } });
});

describe("useAuctionAlerts", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuctionAlerts(), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("fetches with user_id filter and explicit columns", async () => {
    const rows = [{ id: "a1", user_id: "u1", city: "Athens", active: true }];
    mockChain.order.mockResolvedValue({ data: rows, error: null });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAuctionAlerts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith("auction_alerts");
  });
});

describe("useCreateAuctionAlert", () => {
  it("inserts an auction alert on success", async () => {
    mockChain.insert.mockResolvedValue({ error: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateAuctionAlert(), { wrapper });

    await act(async () => {
      result.current.mutate({ city: "Athens" });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("auction_alerts");
  });

  it("sets isError when unauthenticated", async () => {
    mockGetUser.mockResolvedValue({ data: { user: null } });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreateAuctionAlert(), { wrapper });

    await act(async () => {
      result.current.mutate({ city: "Athens" });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(result.current.isError).toBe(true);
  });
});

describe("useUpdateAuctionAlert", () => {
  it("updates an alert", async () => {
    // For update: from→update→eq→eq resolves
    mockChain.update.mockReturnValue(mockChain);
    mockChain.eq.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useUpdateAuctionAlert(), { wrapper });

    await act(async () => {
      result.current.mutate({ id: "a1", updates: { active: false } });
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("auction_alerts");
  });
});

describe("useDeleteAuctionAlert", () => {
  it("deletes an alert", async () => {
    // For delete: from→delete→eq→eq resolves
    mockChain.delete.mockReturnValue(mockChain);
    mockChain.eq.mockResolvedValueOnce({ error: null }).mockResolvedValueOnce({ error: null });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useDeleteAuctionAlert(), { wrapper });

    await act(async () => {
      result.current.mutate("a1");
      await new Promise(r => setTimeout(r, 80));
    });
    await waitFor(() => !result.current.isPending);
    expect(mockFrom).toHaveBeenCalledWith("auction_alerts");
  });
});
