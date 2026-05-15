/**
 * Tests for usePropertyAIInsights, the hook that drives AI market insights on
 * PropertyDetail. It calls property-valuation directly so GPT analysis and
 * server-side quota are enforced consistently for signed-in free and Pro users.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";

const { invokeMock, toastErrorMock, isAiLimitMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  toastErrorMock: vi.fn(),
  isAiLimitMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { functions: { invoke: (...a: unknown[]) => invokeMock(...a) } },
}));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock } }));
vi.mock("@/lib/aiErrorUtils", () => ({
  isAiUsageLimitError: (...a: unknown[]) => isAiLimitMock(...a),
}));

import { usePropertyAIInsights } from "@/hooks/usePropertyAIInsights";
import type { ListingWithJoins } from "@/hooks/useListings";
import type { User } from "@supabase/supabase-js";

const baseListing = {
  id: "L-1",
  title: "Athens 3-bed",
  city: "Athens",
  address: "Kolonaki 12",
  price: 450_000,
  sqm: 95,
  bedrooms: 3,
  bathrooms: 2,
  property_type: "apartment",
  listing_type: "sale",
  floor: 4,
  year_built: 2010,
  energy_class: "B",
  price_per_sqm: 4_736,
  has_parking: true,
  has_pool: false,
  has_elevator: true,
  region: "Attica",
  tags: ["ownership:private", "ownership_pct:100"],
} as unknown as ListingWithJoins;

const baseUser = { id: "u-1" } as User;

beforeEach(() => {
  invokeMock.mockReset();
  toastErrorMock.mockReset();
  isAiLimitMock.mockReset();
  isAiLimitMock.mockReturnValue(false);
});

describe("usePropertyAIInsights", () => {
  it("does nothing when there is no listing", () => {
    const { result } = renderHook(() => usePropertyAIInsights(null, baseUser, "L-1", true));
    expect(result.current.aiInsightsData).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does nothing when the user is not authenticated", () => {
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, null, "L-1", true));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.aiInsightsLoading).toBe(false);
  });

  it("runs for non-Pro users because the server enforces the free quota", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        estimatedValue: 470_000,
        marketComparisonPct: 4.5,
        rentalYieldEstimate: 3.8,
        marketComparison: "above_market",
        confidenceLabel: "High",
      },
    });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1", false),
    );
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: 4.5,
      rentalYield: 3.8,
      estimatedValue: 470_000,
      marketComparison: "above_market",
      confidenceLabel: "High",
    });
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe("property-valuation");
  });

  it("passes listing fields to property-valuation", async () => {
    invokeMock.mockResolvedValueOnce({ data: { estimatedValue: 200_000 } });
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, undefined, true));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    expect(invokeMock.mock.calls[0]).toMatchObject([
      "property-valuation",
      { body: { city: "Athens", address: "Kolonaki 12", price: 450_000, sqm: 95 } },
    ]);
  });

  it("populates ownershipStatus and ownershipPercentage from tags", async () => {
    invokeMock.mockResolvedValueOnce({ data: { estimatedValue: 100 } });
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", true));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    const valuationBody = (invokeMock.mock.calls[0][1] as { body: Record<string, unknown> }).body;
    expect(valuationBody.ownershipStatus).toBe("private");
    expect(valuationBody.ownershipPercentage).toBe(100);
  });

  it("falls back to default values when property-valuation returns sparse fields", async () => {
    invokeMock.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1", true),
    );
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: 0,
      rentalYield: 0,
      estimatedValue: 450_000,
      marketComparison: "at_market",
      confidenceLabel: "Medium",
    });
  });

  it("surfaces a toast.error when isAiUsageLimitError reports true", async () => {
    invokeMock.mockResolvedValueOnce({ data: { error: "limit reached" }, error: { message: "limit" } });
    isAiLimitMock.mockReturnValue(true);
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", true));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0][0]).toMatch(/usage limits/);
  });

  it("surfaces a toast.error when invoke throws and isAiUsageLimitError reports true", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network"));
    isAiLimitMock.mockReturnValue(true);
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", true));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it("does not refire if dbListing changes after the first load", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { estimatedValue: 500_000 },
    });
    const { rerender } = renderHook(
      ({ l }: { l: ListingWithJoins | null }) => usePropertyAIInsights(l, baseUser, "L-1", true),
      { initialProps: { l: baseListing } },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    rerender({ l: { ...baseListing, id: "L-2" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
