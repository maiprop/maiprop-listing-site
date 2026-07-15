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

  const listingId = "00000000-0000-4000-8000-000000000101";

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
    rpcMock.mockResolvedValueOnce({ data: { listing_id: listingId }, error: null });
    const { result } = renderHook(() => useActivateListingPromotion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ listingId, promotionType: "spotlight" });
    });

    expect(rpcMock).toHaveBeenCalledWith("activate_listing_promotion", {
      p_listing_id: listingId,
      p_promotion_type: "spotlight",
      p_request_key: expect.stringMatching(new RegExp(`^web:${listingId}:spotlight:`)),
    });
  });

  it("deactivates only the requested listing promotion", async () => {
    rpcMock.mockResolvedValueOnce({ data: 1, error: null });
    const { result } = renderHook(() => useDeactivateListingPromotion(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ listingId, promotionType: "priority" });
    });

    expect(rpcMock).toHaveBeenCalledWith("deactivate_listing_promotion", {
      p_listing_id: listingId,
      p_promotion_type: "priority",
    });
  });

  it("surfaces RPC errors instead of projecting paid fields locally", async () => {
    rpcMock.mockResolvedValueOnce({ data: null, error: new Error("spotlight_entitlement_required") });
    const { result } = renderHook(() => useActivateListingPromotion(), { wrapper });

    await expect(result.current.mutateAsync({
      listingId,
      promotionType: "spotlight",
    })).rejects.toThrow("spotlight_entitlement_required");
  });

  it("rejects malformed activation input before calling the entitlement RPC", async () => {
    const { result } = renderHook(() => useActivateListingPromotion(), { wrapper });

    await expect(result.current.mutateAsync({
      listingId: "not-a-listing-id",
      promotionType: "spotlight",
    })).rejects.toThrow("Invalid listing promotion");

    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("rejects bundle deactivation before calling the entitlement RPC", async () => {
    const { result } = renderHook(() => useDeactivateListingPromotion(), { wrapper });

    await expect(result.current.mutateAsync({
      listingId,
      promotionType: "bundle",
    } as never)).rejects.toThrow("Invalid listing promotion removal");

    expect(rpcMock).not.toHaveBeenCalled();
  });
});
