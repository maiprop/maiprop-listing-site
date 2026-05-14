/**
 * useSubscription hook tests — verifies Pro access logic:
 * admin always Pro, investor sub → Pro, Stripe subscriber → Pro, free user → not Pro.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: vi.fn((table: string) => {
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: table === "pro_product_ids" ? { product_id: "prod_abc" } : null,
          error: null,
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      return chain;
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
}));

vi.mock("@/hooks/usePricingConfigs", () => ({
  PRICING_KEYS: { developer_pro: "developer_pro" },
  usePricingConfigs: vi.fn(() => ({
    data: {
      developer_pro: {
        stripeProductId: "prod_developer",
      },
    },
    isLoading: false,
  })),
}));

import { useAuth } from "@/contexts/AuthContext";
import { useSubscription } from "@/hooks/useSubscription";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc.clear();
});

describe("useSubscription", () => {
  it("admin always gets isPro", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "admin", participant_type: "agent" },
      user: { id: "u1" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    expect(result.current.isPro).toBe(true);
  });

  it("unsubscribed non-admin user is not Pro", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "buyer", participant_type: "buyer" },
      user: { id: "u2" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    expect(result.current.isPro).toBe(false);
  });

  it("Stripe subscriber gets isPro when the product is server-authorized", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: true, productId: "prod_abc", subscriptionEnd: "2027-01-01", loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "agent", participant_type: "agent" },
      user: { id: "u3" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isPro).toBe(true));
    expect(result.current.productId).toBe("prod_abc");
  });

  it("does not grant developer modules for a non-developer Pro product", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: true, productId: "prod_abc", subscriptionEnd: "2027-01-01", loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "developer", participant_type: "developer" },
      user: { id: "u5" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.isPro).toBe(true));
    expect(result.current.hasDeveloperPro).toBe(false);
  });

  it("force_pro_access grants isPro", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "buyer", participant_type: "buyer", force_pro_access: true },
      user: { id: "u4" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    expect(result.current.isPro).toBe(true);
  });
});
