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
      const pricingRows = [
        { key: "pro", audience: "participant", metadata: { stripe_product_id: "prod_participant" } },
        { key: "agent_basic", audience: "agent", metadata: { stripe_product_id: "prod_abc" } },
        { key: "developer_pro", audience: "developer", metadata: { stripe_product_id: "prod_dev" } },
      ];
      const chain = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({
          data: null,
          error: null,
        }),
        single: vi.fn().mockResolvedValue({ data: null, error: null }),
      };
      if (table === "pricing_configs") {
        chain.eq = vi.fn().mockReturnValue(Promise.resolve({ data: pricingRows, error: null }));
      }
      return chain;
    }),
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: vi.fn(),
  profileRoleSwitchInProgress: (profile: { role_switch_in_progress_at?: string | null } | null) =>
    Boolean(profile?.role_switch_in_progress_at),
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
    expect(result.current.accessSource).toBe("free");
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
    expect(result.current.accessSource).toBe("stripe");
    expect(result.current.hasStripeBilling).toBe(true);
  });

  it("rejects participant Pro as developer entitlement", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: true, productId: "prod_participant", subscriptionEnd: "2027-01-01", loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "developer", participant_type: "developer" },
      user: { id: "u6" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPro).toBe(false);
    expect(result.current.hasDeveloperPro).toBe(false);
    expect(result.current.accessSource).toBe("free");
  });

  it("accepts developer Pro only for developer entitlement", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: true, productId: "prod_dev", subscriptionEnd: "2027-01-01", loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "developer", participant_type: "developer" },
      user: { id: "u7" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.hasDeveloperPro).toBe(true));
    expect(result.current.isPro).toBe(true);
    expect(result.current.accessSource).toBe("stripe");
  });

  it("does not grant Pro access for a non-developer product during developer use", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: true, productId: "prod_abc", subscriptionEnd: "2027-01-01", loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "developer", participant_type: "developer" },
      user: { id: "u5" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPro).toBe(false);
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
    expect(result.current.accessSource).toBe("override");
    expect(result.current.isManuallyManagedPlan).toBe(true);
  });

  it("does not inherit investor-pro entitlement during a role switch", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      refreshSubscription: vi.fn(),
      profile: {
        role: "investor",
        participant_type: "investor",
        role_switch_in_progress_at: "2026-05-14T10:00:00.000Z",
      },
      user: { id: "u5" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPro).toBe(false);
  });
});
