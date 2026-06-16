/**
 * Tests for usePropertyAIInsights, the hook that drives AI market insights on
 * PropertyDetail. It calls property-valuation directly so GPT analysis and
 * server-side quota are enforced consistently for signed-in free and Pro users.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const { invokeMock, rpcMock, toastErrorMock, isAiLimitMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  rpcMock: vi.fn(),
  toastErrorMock: vi.fn(),
  isAiLimitMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: { invoke: (...a: unknown[]) => invokeMock(...a) },
    rpc: (...a: unknown[]) => rpcMock(...a),
  },
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
  latitude: 37.981,
  longitude: 23.735,
  has_parking: true,
  has_pool: false,
  has_elevator: true,
  region: "Attica",
  auction_court: "Athens Court",
  is_neoclassical: false,
  is_preserved: false,
  distance_from_sea: 1200,
  within_city_plan: true,
  within_settlement: true,
  building_allowance: 210,
  coverage_ratio: 45,
  is_buildable: true,
  cadastre_number: "KAEK-123",
  has_land_concession: false,
  land_use: "residential",
  tags: ["ownership:private", "ownership_pct:100"],
} as unknown as ListingWithJoins;

const baseUser = { id: "u-1" } as User;

beforeEach(() => {
  invokeMock.mockReset();
  rpcMock.mockReset();
  toastErrorMock.mockReset();
  isAiLimitMock.mockReset();
  invokeMock.mockImplementation(async (name: string) => {
    if (name === "ai-quota-status") {
      return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
    }
    return { data: {}, error: null };
  });
  isAiLimitMock.mockReturnValue(false);
});

describe("usePropertyAIInsights", () => {
  it("does nothing when there is no listing", () => {
    const { result } = renderHook(() => usePropertyAIInsights(null, baseUser, "L-1", true));
    expect(result.current.aiInsightsData).toBeNull();
    expect(invokeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
  });

  it("does nothing when the user is not authenticated", () => {
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, null, "L-1", true));
    expect(invokeMock).not.toHaveBeenCalled();
    expect(rpcMock).not.toHaveBeenCalled();
    expect(result.current.aiInsightsLoading).toBe(false);
  });

  it("defers quota checks on initial render so detail pages do not spend network time before user action", async () => {
    renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", false));

    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(invokeMock).not.toHaveBeenCalledWith("ai-quota-status", {
      body: { bucket: "property-valuation" },
    });
    expect(invokeMock.mock.calls.some(([name]) => name === "property-valuation")).toBe(false);
  });

  it("runs for non-Pro users after click because the server enforces the free quota", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return {
        data: {
          estimatedValue: 470_000,
          marketComparisonPct: 4.5,
          rentalYieldEstimate: 3.8,
          marketComparison: "above_market",
          confidenceLabel: "High",
        },
        error: null,
      };
    });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1", false),
    );
    await act(async () => {
      await result.current.loadAiInsights();
    });
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: -4,
      rentalYield: 3.8,
      estimatedValue: 470_000,
      marketComparison: "at_market",
      confidenceLabel: "High",
    });
    expect(invokeMock.mock.calls.filter(([name]) => name === "property-valuation")).toHaveLength(1);
  });

  it("recomputes vs-market from the displayed estimate when AI payload comparison is stale", async () => {
    const listing = {
      ...baseListing,
      price: 275_000,
      price_per_sqm: 7_051,
    } as unknown as ListingWithJoins;
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return {
        data: {
          estimatedValue: 220_000,
          marketComparisonPct: -20,
          rentalYieldEstimate: 5,
          marketComparison: "below_market",
          confidenceLabel: "Medium",
        },
        error: null,
      };
    });
    const { result } = renderHook(() =>
      usePropertyAIInsights(listing, baseUser, "L-1", false),
    );

    await act(async () => {
      await result.current.loadAiInsights();
    });

    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: 25,
      rentalYield: 5,
      estimatedValue: 220_000,
      marketComparison: "above_market",
      confidenceLabel: "Medium",
    });
  });

  it("does not report rental open-house vs-market when no market-rent benchmark is returned", async () => {
    const rentalOpenHouse = {
      ...baseListing,
      listing_type: "open_house",
      open_house_transaction_type: "rent",
      price: 950,
      sqm: 39,
      price_per_sqm: 24,
    } as unknown as ListingWithJoins;
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return {
        data: {
          estimatedValue: 178_000,
          marketComparisonPct: -99,
          rentalYieldEstimate: 0.047,
          marketComparison: "below_market",
          confidenceLabel: "Medium",
        },
        error: null,
      };
    });

    const { result } = renderHook(() =>
      usePropertyAIInsights(rentalOpenHouse, baseUser, "L-1", false),
    );

    await act(async () => {
      await result.current.loadAiInsights();
    });

    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: null,
      rentalYield: 6.4,
      estimatedValue: 178_000,
      marketComparison: null,
      confidenceLabel: "Medium",
    });

    const valuationCall = invokeMock.mock.calls.find(([name]) => name === "property-valuation");
    expect(valuationCall).toMatchObject([
      "property-valuation",
      {
        body: {
          price: 950,
          listingType: "rent",
          openHouseTransactionType: "rent",
          askingMonthlyRent: 950,
        },
      },
    ]);
  });

  it("compares rental open-house monthly rent to returned market-rent estimate when available", async () => {
    const rentalOpenHouse = {
      ...baseListing,
      listing_type: "open_house",
      open_house_transaction_type: "rent",
      price: 950,
      sqm: 39,
      price_per_sqm: 24,
    } as unknown as ListingWithJoins;
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return {
        data: {
          estimatedValue: 178_000,
          estimatedMonthlyRent: 1_050,
          rentalYieldEstimate: 0.047,
          marketComparison: "below_market",
          confidenceLabel: "Medium",
        },
        error: null,
      };
    });

    const { result } = renderHook(() =>
      usePropertyAIInsights(rentalOpenHouse, baseUser, "L-1", false),
    );

    await act(async () => {
      await result.current.loadAiInsights();
    });

    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({
      vsMarket: -10,
      rentalYield: 6.4,
      estimatedValue: 178_000,
      marketComparison: "below_market",
      confidenceLabel: "Medium",
    });
  });

  it("uses the clean-market value as the AI estimate when auction adjustment data is returned", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return {
        data: {
          estimatedValue: 130_000,
          auctionAdjustedValue: 154_000,
          marketComparisonPct: 0,
          rentalYieldEstimate: 4.5,
          marketComparison: "at_market",
          confidenceLabel: "Medium",
        },
        error: null,
      };
    });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1", false),
    );
    await act(async () => {
      await result.current.loadAiInsights();
    });
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData?.estimatedValue).toBe(154_000);
  });

  it("passes listing fields to property-valuation", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return { data: { estimatedValue: 200_000 }, error: null };
    });
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, baseUser, undefined, true));
    await act(async () => {
      await result.current.loadAiInsights();
    });
    await waitFor(() =>
      expect(invokeMock.mock.calls.some(([name]) => name === "property-valuation")).toBe(true)
    );
    const valuationCall = invokeMock.mock.calls.find(([name]) => name === "property-valuation");
    expect(valuationCall).toMatchObject([
      "property-valuation",
      {
        body: {
          listingId: "L-1",
          city: "Athens",
          address: "Kolonaki 12",
          price: 450_000,
          sqm: 95,
          latitude: 37.981,
          longitude: 23.735,
          auctionCourt: "Athens Court",
          isNeoclassical: false,
          isPreserved: false,
          distanceFromSea: 1200,
          withinCityPlan: true,
          withinSettlement: true,
          buildingAllowance: 210,
          coverageRatio: 45,
          isBuildable: true,
          cadastreNumber: "KAEK-123",
          hasLandConcession: false,
          landUse: "residential",
        },
      },
    ]);
  });

  it("populates ownershipStatus and ownershipPercentage from tags", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return { data: { estimatedValue: 100 }, error: null };
    });
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", true));
    await act(async () => {
      await result.current.loadAiInsights();
    });
    await waitFor(() =>
      expect(invokeMock.mock.calls.some(([name]) => name === "property-valuation")).toBe(true)
    );
    const valuationCall = invokeMock.mock.calls.find(([name]) => name === "property-valuation");
    const valuationBody = (valuationCall?.[1] as { body: Record<string, unknown> }).body;
    expect(valuationBody.ownershipStatus).toBe("private");
    expect(valuationBody.ownershipPercentage).toBe(100);
  });

  it("falls back to default values when property-valuation returns sparse fields", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return { data: {}, error: null };
    });
    const { result } = renderHook(() =>
      usePropertyAIInsights(baseListing, baseUser, "L-1", true),
    );
    await act(async () => {
      await result.current.loadAiInsights();
    });
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
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return { data: { error: "limit reached" }, error: { message: "limit" } };
    });
    isAiLimitMock.mockReturnValue(true);
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", true));
    await act(async () => {
      await result.current.loadAiInsights();
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
    expect(toastErrorMock.mock.calls[0][0]).toMatch(/limit/);
  });

  it("surfaces a toast.error when invoke throws and isAiUsageLimitError reports true", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      throw new Error("network");
    });
    isAiLimitMock.mockReturnValue(true);
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", true));
    await act(async () => {
      await result.current.loadAiInsights();
    });
    await waitFor(() => expect(toastErrorMock).toHaveBeenCalled());
  });

  it("does not invoke property-valuation when preflight quota is exhausted", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: false, reason: "monthly_limit_reached", used: 5, limit: 5 }, error: null };
      }
      return { data: {}, error: null };
    });
    const { result } = renderHook(() => usePropertyAIInsights(baseListing, baseUser, "L-1", false));

    await act(async () => {
      await result.current.loadAiInsights();
    });

    expect(invokeMock.mock.calls.some(([name]) => name === "property-valuation")).toBe(false);
    expect(toastErrorMock).toHaveBeenCalledWith("You've reached your AI insights limit for this month. Upgrade to continue.");
  });

  it("does not refire if dbListing changes after the first load", async () => {
    invokeMock.mockImplementation(async (name: string) => {
      if (name === "ai-quota-status") {
        return { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null };
      }
      return {
        data: { estimatedValue: 500_000 },
        error: null,
      };
    });
    const { result, rerender } = renderHook(
      ({ l }: { l: ListingWithJoins | null }) => usePropertyAIInsights(l, baseUser, "L-1", true),
      { initialProps: { l: baseListing } },
    );
    await act(async () => {
      await result.current.loadAiInsights();
    });
    await waitFor(() =>
      expect(invokeMock.mock.calls.filter(([name]) => name === "property-valuation")).toHaveLength(1)
    );
    await act(async () => {
      rerender({ l: { ...baseListing, id: "L-2" } });
    });
    await new Promise((r) => setTimeout(r, 10));
    expect(invokeMock.mock.calls.filter(([name]) => name === "property-valuation")).toHaveLength(1);
  });
});
