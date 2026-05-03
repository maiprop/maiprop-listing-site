/**
 * useAuctionAlerts hook tests — verifies user-scoped queries,
 * disabled when logged out, explicit column selection (not select("*")).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const mockSelect = vi.fn();
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const mockFrom = vi.fn((..._args: any[]) => ({ select: mockSelect }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mockFrom(...args) },
}));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/contexts/AuthContext";
import { useAuctionAlerts } from "@/hooks/useAuctionAlerts";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc.clear();
});

describe("useAuctionAlerts", () => {
  it("is disabled when user is null", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: null });
    const { result } = renderHook(() => useAuctionAlerts(), { wrapper });
    expect(result.current.isLoading).toBe(false);
    expect(result.current.data).toBeUndefined();
    expect(mockFrom).not.toHaveBeenCalled();
  });

  it("fetches with user_id filter and explicit columns", async () => {
    const rows = [{ id: "a1", user_id: "u1", city: "Athens", active: true }];
    mockSelect.mockReturnValue({
      eq: vi.fn().mockReturnValue({
        order: vi.fn().mockResolvedValue({ data: rows, error: null }),
      }),
    });
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" } });

    const { result } = renderHook(() => useAuctionAlerts(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(1);
    expect(mockFrom).toHaveBeenCalledWith("auction_alerts");
    // Verify explicit column selection (not select("*"))
    const selectCall = mockSelect.mock.calls[0]?.[0] as string;
    expect(selectCall).not.toBe("*");
    expect(selectCall).toContain("id");
    expect(selectCall).toContain("user_id");
  });
});
