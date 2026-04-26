/**
 * Tests for usePropertyAIInsights — the hook that drives AI valuation on
 * PropertyDetail. It calls supabase.functions.invoke('fetch-report-from-os')
 * first; if that returns nothing usable, it falls back to
 * 'property-valuation'. Errors surface through `sonner` toasts via the
 * `isAiUsageLimitError` helper.
 */
import React from "react";
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
    const { result } = renderHook(() => usePropertyAIInsights(null, baseUser, "L-1"));
    expect(result.current.aiInsightsData).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does nothing when the user is not authenticated", () => {
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, null, "L-1"));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(result.current.aiInsightsLoading).toBe(false);
  });

  it("uses the OpenSearch report when fetch-report-from-os returns a usable payload", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        ok: true,
        report: {
          estimatedValue: 470_000,
          marketComparisonPct: 4.5,
          rentalYieldEstimate: 3.8,
          marketComparison: "above_market",
          confidenceLabel: "High",
        },
      },
    });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1"),
    );
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: 4.5,
      rentalYield: 3.8,
      estimatedValue: 470_000,
      marketComparison: "above_market",
      confidenceLabel: "High",
    });
    // Only the OS endpoint was called — fallback skipped.
    expect(invokeMock).toHaveBeenCalledTimes(1);
    expect(invokeMock.mock.calls[0][0]).toBe("fetch-report-from-os");
  });

  it("falls back to property-valuation when the OS report has no estimatedValue", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: true, report: null } });
    invokeMock.mockResolvedValueOnce({
      data: {
        marketComparisonPct: -2.1,
        rentalYieldEstimate: 4.2,
        estimatedValue: 440_000,
        marketComparison: "below_market",
        confidenceLabel: "Medium",
      },
    });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1"),
    );
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(invokeMock).toHaveBeenCalledTimes(2);
    expect(invokeMock.mock.calls[1][0]).toBe("property-valuation");
    expect(result.current.aiInsightsData?.estimatedValue).toBe(440_000);
  });

  it("uses snapshot.id when the explicit id arg is undefined", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: false } });
    invokeMock.mockResolvedValueOnce({ data: { estimatedValue: 200_000 } });
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, undefined));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    expect(invokeMock.mock.calls[0][1]).toMatchObject({
      body: { listing_id: "L-1", report_type: "valuation" },
    });
  });

  it("populates ownershipStatus and ownershipPercentage from tags", async () => {
    invokeMock.mockResolvedValueOnce({ data: { ok: false } });
    invokeMock.mockResolvedValueOnce({ data: { estimatedValue: 100 } });
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1"));
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(2));
    const valuationBody = (invokeMock.mock.calls[1][1] as { body: Record<string, unknown> }).body;
    expect(valuationBody.ownershipStatus).toBe("private");
    expect(valuationBody.ownershipPercentage).toBe(100);
  });

  it("falls back to default values when property-valuation returns sparse fields", async () => {
    invokeMock.mockResolvedValueOnce({ data: null });
    invokeMock.mockResolvedValueOnce({ data: {} });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1"),
    );
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: 0,
      rentalYield: 0,
      estimatedValue: 450_000, // falls back to listing.price
      marketComparison: "at_market",
      confidenceLabel: "Medium",
    });
  });

  it("surfaces a toast.error when isAiUsageLimitError reports true on the fallback", async () => {
    invokeMock.mockResolvedValueOnce({ data: null });
    invokeMock.mockResolvedValueOnce({ data: { error: "limit reached" }, error: { message: "limit" } });
    isAiLimitMock.mockReturnValue(true);
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1"));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0][0]).toMatch(/usage limits/);
  });

  it("surfaces a toast.error when invoke throws and isAiUsageLimitError reports true", async () => {
    invokeMock.mockRejectedValueOnce(new Error("network"));
    isAiLimitMock.mockReturnValue(true);
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1"));
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it("does not refire if dbListing changes after the first load (aiInsightsLoaded latch)", async () => {
    invokeMock.mockResolvedValueOnce({
      data: { ok: true, report: { estimatedValue: 500_000 } },
    });
    const { rerender } = renderHook(
      ({ l }: { l: ListingWithJoins | null }) => usePropertyAIInsights(l, baseUser, "L-1"),
      { initialProps: { l: baseListing } },
    );
    await waitFor(() => expect(invokeMock).toHaveBeenCalledTimes(1));
    // Re-render with a different listing object — should NOT refire because
    // the internal `aiInsightsLoaded` latch is already true.
    rerender({ l: { ...baseListing, id: "L-2" } });
    await new Promise((r) => setTimeout(r, 10));
    expect(invokeMock).toHaveBeenCalledTimes(1);
  });
});
