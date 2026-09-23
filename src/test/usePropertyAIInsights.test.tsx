import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
import type { ListingWithJoins } from "@/hooks/useListings";
import { valuationV2 } from "@/test/valuationV2Fixture";

const { invokeMock, toastErrorMock, isAiLimitMock } = vi.hoisted(() => ({ invokeMock: vi.fn(), toastErrorMock: vi.fn(), isAiLimitMock: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { functions: { invoke: (...args: unknown[]) => invokeMock(...args) } } }));
vi.mock("sonner", () => ({ toast: { error: toastErrorMock } }));
vi.mock("@/lib/aiErrorUtils", () => ({ isAiUsageLimitError: (...args: unknown[]) => isAiLimitMock(...args) }));

import { usePropertyAIInsights } from "@/hooks/usePropertyAIInsights";

const listing = (id = "a") => ({ id, title: id, city: "Athens", address: "Street", price: 320000, sqm: 80, property_type: "apartment", listing_type: "sale", tags: [] } as unknown as ListingWithJoins);
const user = { id: "u-1" } as User;
const installResponses = (valuation: unknown, error: unknown = null) => invokeMock.mockImplementation(async (name: string) => name === "ai-quota-status"
  ? { data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null }
  : { data: valuation, error });

beforeEach(() => { invokeMock.mockReset(); toastErrorMock.mockReset(); isAiLimitMock.mockReturnValue(false); });

describe("usePropertyAIInsights v2", () => {
  it("defers network calls until requested", () => {
    renderHook(() => usePropertyAIInsights(listing(), user, "a", false));
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("does nothing without a listing or signed-in user", async () => {
    const withoutListing = renderHook(() => usePropertyAIInsights(null, user, undefined, false));
    const withoutUser = renderHook(() => usePropertyAIInsights(listing(), null, "a", false));
    await act(async () => {
      await withoutListing.result.current.loadAiInsights();
      await withoutUser.result.current.loadAiInsights();
    });
    expect(invokeMock).not.toHaveBeenCalled();
  });

  it("allows a signed-in free user to request v2 analysis after the server quota precheck", async () => {
    installResponses(valuationV2());
    const { result } = renderHook(() => usePropertyAIInsights(listing(), user, "a", false));
    await act(async () => result.current.loadAiInsights());
    expect(result.current.aiInsightsData?.estimatedValue).toBe(400000);
    expect(invokeMock.mock.calls.filter(([name]) => name === "property-valuation")).toHaveLength(1);
  });

  it("stops before valuation and reports feedback when the quota precheck denies access", async () => {
    invokeMock.mockImplementation(async (name: string) => name === "ai-quota-status"
      ? { data: { allowed: false, reason: "monthly_limit_reached", used: 5, limit: 5, remaining: 0 }, error: null }
      : { data: valuationV2(), error: null });
    const { result } = renderHook(() => usePropertyAIInsights(listing(), user, "a", false));
    await act(async () => result.current.loadAiInsights());
    expect(invokeMock.mock.calls.some(([name]) => name === "property-valuation")).toBe(false);
    expect(toastErrorMock).toHaveBeenCalledWith(expect.stringMatching(/limit/i));
  });

  it("projects nullable fields, source, unit, and true zero values without heuristics", async () => {
    installResponses(valuationV2({ confidence: 0, rentalYieldEstimate: null, marketComparisonPct: 0, marketComparison: "at_market" }));
    const { result } = renderHook(() => usePropertyAIInsights(listing(), user, "a", false));
    await act(async () => result.current.loadAiInsights());
    await waitFor(() => expect(result.current.aiInsightsData).not.toBeNull());
    expect(result.current.aiInsightsData).toEqual({ vsMarket: 0, rentalYield: null, estimatedValue: 400000, pricePerSqmEstimate: 4000, marketComparison: "at_market", confidenceLabel: "Low", estimateSource: "os_prediction", estimateUnit: "EUR" });
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({ body: expect.objectContaining({ responseVersion: 2 }) }));
  });

  it("accepts a useful analysis-only response with unavailable numbers", async () => {
    const base = valuationV2();
    installResponses(valuationV2({ status: "partial", estimatedValue: null, rangeLow: null, rangeHigh: null, rangeBasis: null, pricePerSqmEstimate: null, confidence: null, confidenceLabel: null, summary: "Useful qualitative analysis", evidence: { ...base.evidence, fields: { ...base.evidence.fields, estimatedValue: "unavailable", rangeLow: "unavailable", rangeHigh: "unavailable", pricePerSqmEstimate: "unavailable", confidence: "unavailable" }, analysis: "ai_estimate" } }));
    const { result } = renderHook(() => usePropertyAIInsights(listing(), user, "a", false));
    await act(async () => result.current.loadAiInsights());
    expect(result.current.aiInsightsData).toMatchObject({ estimatedValue: null, rentalYield: null, confidenceLabel: null, estimateSource: null, estimateUnit: null });
  });

  it("checks invoke error before accepting a supplied data object", async () => {
    installResponses(valuationV2(), new Error("provider unavailable"));
    const { result } = renderHook(() => usePropertyAIInsights(listing(), user, "a", false));
    await act(async () => result.current.loadAiInsights());
    expect(result.current.aiInsightsData).toBeNull();
    expect(toastErrorMock).toHaveBeenCalled();
  });

  it("preserves listing identity, coordinates, and ownership inputs in the v2 request", async () => {
    const enriched = {
      ...listing("property-7"), latitude: 37.981, longitude: 23.735,
      auction_court: "Athens Court", cadastre_number: "KAEK-123",
      tags: ["ownership:private", "ownership_pct:75"],
    } as unknown as ListingWithJoins;
    installResponses(valuationV2());
    const { result } = renderHook(() => usePropertyAIInsights(enriched, user, "property-7", false));
    await act(async () => result.current.loadAiInsights());
    expect(invokeMock).toHaveBeenCalledWith("property-valuation", expect.objectContaining({
      body: expect.objectContaining({
        responseVersion: 2,
        listingId: "property-7",
        latitude: 37.981,
        longitude: 23.735,
        auctionCourt: "Athens Court",
        cadastreNumber: "KAEK-123",
        ownershipStatus: "private",
        ownershipPercentage: 75,
      }),
    }));
  });

  it("shows generic feedback when the provider returns no supported valuation", async () => {
    installResponses({ code: "valuation_unavailable" }, new Error("Edge Function returned a non-2xx status code"));
    const { result } = renderHook(() => usePropertyAIInsights(listing(), user, "a", false));
    await act(async () => result.current.loadAiInsights());
    expect(result.current.aiInsightsData).toBeNull();
    expect(toastErrorMock).toHaveBeenCalledWith("Could not load AI insights. Please try again.");
  });

  it("does not publish a delayed old-listing response after identity changes", async () => {
    let resolveOld!: (value: unknown) => void;
    invokeMock.mockImplementation((name: string) => name === "ai-quota-status" ? Promise.resolve({ data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null }) : new Promise((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(({ item }) => usePropertyAIInsights(item, user, item.id, false), { initialProps: { item: listing("a") } });
    let pending!: Promise<void>;
    act(() => { pending = result.current.loadAiInsights(); });
    await waitFor(() => expect(invokeMock.mock.calls.some(([name]) => name === "property-valuation")).toBe(true));
    rerender({ item: listing("b") });
    resolveOld({ data: valuationV2({ estimatedValue: 999999 }), error: null });
    await act(async () => { await pending; });
    expect(result.current.aiInsightsData).toBeNull();
  });

  it("does not publish a delayed response after the requesting actor changes", async () => {
    let resolveOld!: (value: unknown) => void;
    invokeMock.mockImplementation((name: string) => name === "ai-quota-status"
      ? Promise.resolve({ data: { allowed: true, reason: null, used: 0, limit: 5 }, error: null })
      : new Promise((resolve) => { resolveOld = resolve; }));
    const { result, rerender } = renderHook(
      ({ actor }) => usePropertyAIInsights(listing("a"), actor, "a", false),
      { initialProps: { actor: user } },
    );
    let pending!: Promise<void>;
    act(() => { pending = result.current.loadAiInsights(); });
    await waitFor(() => expect(invokeMock.mock.calls.some(([name]) => name === "property-valuation")).toBe(true));
    rerender({ actor: { id: "u-2" } as User });
    resolveOld({ data: valuationV2({ estimatedValue: 999999 }), error: null });
    await act(async () => { await pending; });
    expect(result.current.aiInsightsData).toBeNull();
  });
});
