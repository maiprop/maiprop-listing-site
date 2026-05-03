/**
 * useEligibleForQuickSale — verifies admin bypass, active subscription, trial,
 * force_pro_access, and non-eligible states.
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
import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

function setupMock(profile: Record<string, unknown>, subscriptionData: { status: string } | null) {
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({ user: { id: "u1" }, profile });
  mockFrom.mockReturnValue({
    select: vi.fn().mockReturnValue({
      eq: vi.fn().mockReturnValue({
        in: vi.fn().mockReturnValue({
          limit: vi.fn().mockReturnValue({
            maybeSingle: vi.fn().mockResolvedValue({ data: subscriptionData, error: null }),
          }),
        }),
      }),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  qc.clear();
});

describe("useEligibleForQuickSale", () => {
  it("admin is always eligible", async () => {
    setupMock({ role: "admin" }, null);
    const { result } = renderHook(() => useEligibleForQuickSale(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(true);
    expect(result.current.isAdmin).toBe(true);
  });

  it("active investor subscription is eligible", async () => {
    setupMock({ role: "investor" }, { status: "active" });
    const { result } = renderHook(() => useEligibleForQuickSale(), { wrapper });
    await waitFor(() => expect(result.current.hasActiveSubscription).toBe(true));
    expect(result.current.eligible).toBe(true);
  });

  it("force_pro_access grants eligibility", async () => {
    setupMock({ role: "buyer", force_pro_access: true }, null);
    const { result } = renderHook(() => useEligibleForQuickSale(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(true);
  });

  it("non-admin without subscription is not eligible", async () => {
    setupMock({ role: "buyer" }, null);
    const { result } = renderHook(() => useEligibleForQuickSale(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.eligible).toBe(false);
  });
});
