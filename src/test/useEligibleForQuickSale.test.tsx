import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@testing-library/react";

const { useAuthMock, useSubscriptionMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useSubscriptionMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));
vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: () => useSubscriptionMock(),
}));

import { useEligibleForQuickSale } from "@/hooks/useEligibleForQuickSale";

function setup(
  profile: Record<string, unknown>,
  subscription: Partial<{
    isPro: boolean;
    isInvestorManagedPlan: boolean;
    subscriptionEnd: string | null;
    loading: boolean;
  }> = {},
) {
  useAuthMock.mockReturnValue({ user: { id: "u1" }, profile });
  useSubscriptionMock.mockReturnValue({
    isPro: false,
    isInvestorManagedPlan: false,
    subscriptionEnd: null,
    loading: false,
    ...subscription,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("useEligibleForQuickSale", () => {
  it("allows platform administrators without an investor subscription", () => {
    setup({ role: "admin" });
    const { result } = renderHook(() => useEligibleForQuickSale());
    expect(result.current.eligible).toBe(true);
    expect(result.current.isAdmin).toBe(true);
  });

  it("allows an investor with the canonical active managed plan", () => {
    setup(
      { role: "investor", participant_type: "investor" },
      { isPro: true, isInvestorManagedPlan: true },
    );
    const { result } = renderHook(() => useEligibleForQuickSale());
    expect(result.current.eligible).toBe(true);
    expect(result.current.hasActiveSubscription).toBe(true);
  });

  it("denies an investor when the canonical plan is no longer current", () => {
    setup({ role: "investor", participant_type: "investor" });
    const { result } = renderHook(() => useEligibleForQuickSale());
    expect(result.current.eligible).toBe(false);
    expect(result.current.hasActiveSubscription).toBe(false);
  });

  it("does not treat a generic Pro or profile override as managed investor access", () => {
    setup(
      { role: "buyer", force_pro_access: true },
      { isPro: true, isInvestorManagedPlan: false },
    );
    const { result } = renderHook(() => useEligibleForQuickSale());
    expect(result.current.eligible).toBe(false);
  });

  it("drops investor eligibility while a role switch is in progress", () => {
    setup(
      {
        role: "investor",
        participant_type: "investor",
        role_switch_in_progress_at: "2026-05-14T10:00:00.000Z",
      },
      { isPro: true, isInvestorManagedPlan: true },
    );
    const { result } = renderHook(() => useEligibleForQuickSale());
    expect(result.current.eligible).toBe(false);
    expect(result.current.isInvestorRole).toBe(false);
  });

  it("exposes canonical entitlement loading without issuing another query", () => {
    setup(
      { role: "investor", participant_type: "investor" },
      { loading: true },
    );
    const { result } = renderHook(() => useEligibleForQuickSale());
    expect(result.current.loading).toBe(true);
    expect(useSubscriptionMock).toHaveBeenCalledTimes(1);
  });
});
