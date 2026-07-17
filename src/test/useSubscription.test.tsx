/**
 * useSubscription hook tests — verifies Pro access logic:
 * admin always Pro, investor sub → Pro, Stripe subscriber → Pro, free user → not Pro.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { investorSubscriptionRow } = vi.hoisted(() => ({
  investorSubscriptionRow: {
    current: null as { status: string; expires_at: string | null } | null,
  },
}));

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
      if (table === "investor_subscriptions") {
        chain.maybeSingle = vi.fn().mockResolvedValue({
          data: investorSubscriptionRow.current,
          error: null,
        });
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
import { supabase } from "@/integrations/supabase/client";

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrapper = ({ children }: { children: React.ReactNode }) => (
  <QueryClientProvider client={qc}>{children}</QueryClientProvider>
);

beforeEach(() => {
  vi.clearAllMocks();
  qc.clear();
  investorSubscriptionRow.current = null;
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

  it("does not hold admin controls behind a remote subscription refresh", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: false,
        productId: null,
        subscriptionEnd: null,
        syncStatus: "pending",
        loading: true,
      },
      refreshSubscription: vi.fn(),
      profile: { role: "admin", participant_type: "agent" },
      user: { id: "u-admin-loading" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    expect(result.current.isPro).toBe(true);
    expect(result.current.loading).toBe(false);
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

  it("keeps server-verified durable Stripe access while reconciliation is pending", async () => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        subscription: {
          subscribed: true,
          productId: "prod_abc",
          subscriptionEnd: "2027-01-01",
          source: "stripe",
          syncStatus: "pending",
          loading: false,
        },
        refreshSubscription: vi.fn(),
        profile: { role: "agent", participant_type: "agent" },
        user: { id: "u-pending" },
      });

      const { result } = renderHook(() => useSubscription(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPro).toBe(true);
      expect(result.current.accessSource).toBe("stripe");
  });

  it("uses the server-resolved audience without a second pricing catalogue query", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: true,
        productId: "prod_abc",
        subscriptionEnd: "2027-01-01",
        audience: "agent",
        planKey: "agent_basic",
        source: "billing_state",
        syncStatus: "synced",
        loading: false,
      },
      refreshSubscription: vi.fn(),
      profile: { role: "agent", participant_type: "agent" },
      user: { id: "u-server-resolved" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    expect(result.current.isPro).toBe(true);
    expect(result.current.accessSource).toBe("stripe");
    expect(supabase.from).not.toHaveBeenCalled();
  });

  it("rejects an unbounded stale Stripe timeout grant", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: true,
        productId: "prod_abc",
        subscriptionEnd: "2099-01-01",
        source: "stripe",
        syncStatus: "timeout",
        loading: false,
      },
      refreshSubscription: vi.fn(),
      profile: { role: "agent", participant_type: "agent" },
      user: { id: "u-stale-timeout" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPro).toBe(false);
    expect(result.current.accessSource).toBe("free");
  });

  it.each(["billing_state", "investor"])(
    "rejects an unbounded stale %s timeout grant",
    async (source) => {
      (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
        subscription: {
          subscribed: true,
          productId: source === "billing_state" ? "prod_abc" : null,
          subscriptionEnd: "2099-01-01",
          source,
          syncStatus: "timeout",
          loading: false,
        },
        refreshSubscription: vi.fn(),
        profile: source === "investor"
          ? { role: "investor", participant_type: "investor" }
          : { role: "agent", participant_type: "agent" },
        user: { id: `u-stale-${source}` },
      });

      const { result } = renderHook(() => useSubscription(), { wrapper });
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(result.current.isPro).toBe(false);
      expect(result.current.accessSource).toBe("free");
    },
  );

  it("keeps entitlement unknown while the signed-in profile is still loading", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: false,
        productId: null,
        subscriptionEnd: null,
        syncStatus: "synced",
        loading: false,
      },
      refreshSubscription: vi.fn(),
      profile: null,
      profileLoading: true,
      user: { id: "u-profile-loading" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    expect(result.current.isPro).toBe(false);
    expect(result.current.loading).toBe(true);
  });

  it("does not use a stale profile product when durable subscription state has no product", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: true,
        productId: null,
        subscriptionEnd: null,
        loading: false,
      },
      refreshSubscription: vi.fn(),
      profile: {
        role: "buyer",
        participant_type: "buyer",
        subscription_product_id: "prod_participant",
      },
      user: { id: "u-stale-product" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPro).toBe(false);
    expect(result.current.productId).toBeNull();
    expect(result.current.accessSource).toBe("free");
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
      subscription: {
        subscribed: true,
        productId: "prod_dev",
        subscriptionEnd: "2027-01-01",
        billingStatus: "active",
        loading: false,
      },
      refreshSubscription: vi.fn(),
      profile: { role: "developer", participant_type: "developer" },
      user: { id: "u7" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.hasDeveloperPro).toBe(true));
    expect(result.current.isPro).toBe(true);
    expect(result.current.accessSource).toBe("stripe");
    expect(result.current.hasPaidPromotionCredits).toBe(true);
  });

  it("does not grant paid promotion credits to a Stripe trial", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: true,
        productId: "prod_dev",
        subscriptionEnd: "2027-01-01",
        billingStatus: "trialing",
        loading: false,
      },
      refreshSubscription: vi.fn(),
      profile: { role: "developer", participant_type: "developer" },
      user: { id: "u-dev-trial" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.hasDeveloperPro).toBe(true));
    expect(result.current.hasPaidPromotionCredits).toBe(false);
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
    expect(result.current.hasPaidPromotionCredits).toBe(false);
  });

  it("does not hold force-Pro controls behind a remote subscription refresh", () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: false,
        productId: null,
        subscriptionEnd: null,
        syncStatus: "pending",
        loading: true,
      },
      refreshSubscription: vi.fn(),
      profile: {
        role: "buyer",
        participant_type: "buyer",
        force_pro_access: true,
      },
      user: { id: "u-override-loading" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    expect(result.current.isPro).toBe(true);
    expect(result.current.loading).toBe(false);
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

  it("does not grant investor-managed Pro after annual access expires", async () => {
    investorSubscriptionRow.current = {
      status: "active",
      expires_at: "2000-01-01T00:00:00.000Z",
    };
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: { subscribed: false, productId: null, subscriptionEnd: null, loading: false },
      refreshSubscription: vi.fn(),
      profile: { role: "investor", participant_type: "investor" },
      user: { id: "u8" },
    });
    const { result } = renderHook(() => useSubscription(), { wrapper });
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.isPro).toBe(false);
    expect(result.current.accessSource).toBe("free");
  });

  it("uses the runtime-scoped investor state without a second investor query", async () => {
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      subscription: {
        subscribed: true,
        productId: null,
        subscriptionEnd: "2099-06-30T00:00:00.000Z",
        source: "investor",
        syncStatus: "synced",
        loading: false,
      },
      refreshSubscription: vi.fn(),
      profile: { role: "investor", participant_type: "investor" },
      user: { id: "u-investor" },
    });

    const { result } = renderHook(() => useSubscription(), { wrapper });

    expect(result.current.isPro).toBe(true);
    expect(result.current.accessSource).toBe("investor");
    expect(result.current.isInvestorManagedPlan).toBe(true);
    expect(supabase.from).not.toHaveBeenCalled();
  });
});
