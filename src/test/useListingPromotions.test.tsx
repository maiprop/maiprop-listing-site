import type { ReactNode } from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const rpcMock = vi.hoisted(() => vi.fn());

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...args: unknown[]) => rpcMock(...args) },
}));

import {
  useActivateListingPromotion,
  useDeactivateListingPromotion,
  useListingPromotionBalance,
} from "@/hooks/useListingPromotions";

const wrapper = ({ children }: { children: ReactNode }) => (
  <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
    {children}
  </QueryClientProvider>
);

describe("listing promotion hooks", () => {
  beforeEach(() => rpcMock.mockReset());

  it("reads the server-owned monthly and add-on balance", async () => {
    rpcMock.mockResolvedValueOnce({
      data: {
        cycle_start: "2026-07-01",
        spotlight: { included: 1, used: 0, remaining: 1, addons: 0 },
        priority: { included: 1, used: 0, remaining: 1, addons: 0 },
        bundles: { addons: 0 },
      },
      error: null,
    });

    const { result } = renderHook(() => useListingPromotionBalance(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(rpcMock).toHaveBeenCalledWith("get_listing_promotion_balance");
    expect(result.current.data?.spotlight.remaining).toBe(1);
  });

  it("does not request promotion balances for ineligible dashboard roles", async () => {
    const { result } = renderHook(() => useListingPromotionBalance(false), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("activates a promotion through the idempotent entitlement RPC", async () => {
    rpcMock.mockResolvedValueOnce({ data: { listing_id: "listing-1" }, error: null });
    const { result } = renderHook(() => useActivateListingPromotion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ listingId: "listing-1", promotionType: "spotlight" });
    });

    expect(rpcMock).toHaveBeenCalledWith("activate_listing_promotion", {
      p_listing_id: "listing-1",
      p_promotion_type: "spotlight",
      p_request_key: expect.stringMatching(/^web:listing-1:spotlight:/),
    });
  });

  it("deactivates only the requested listing promotion", async () => {
    rpcMock.mockResolvedValueOnce({ data: 1, error: null });
    const { result } = renderHook(() => useDeactivateListingPromotion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ listingId: "listing-1", promotionType: "priority" });
    });

    expect(rpcMock).toHaveBeenCalledWith("deactivate_listing_promotion", {
      p_listing_id: "listing-1",
      p_promotion_type: "priority",
    });
  });

  it("surfaces RPC errors instead of projecting paid fields locally", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("spotlight_entitlement_required") });
    const { result } = renderHook(() => useActivateListingPromotion(), { wrapper });

    await expect(result.current.mutateAsync({
      listingId: "listing-1",
      promotionType: "spotlight",
    })).rejects.toThrow("spotlight_entitlement_required");
  });
});
