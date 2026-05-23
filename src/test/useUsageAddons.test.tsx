import React from "react";
import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
  useAuth: vi.fn(),
  useSubscription: vi.fn(),
  toast: { error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => mocks.useAuth() }));
vi.mock("@/hooks/useSubscription", () => ({ useSubscription: () => mocks.useSubscription() }));
vi.mock("sonner", () => ({ toast: mocks.toast }));

import {
  PRIORITY_ADS_EXTRA_COST,
  PRIORITY_ADS_INCLUDED,
  PROFESSIONAL_PRIORITY_AD_EXTRA_COST,
  REPORT_EXTRA_COST,
  REPORT_INCLUDED,
  usePriorityAdsUsage,
  useRecordPriorityAd,
  useRecordReport,
  useRecordValuation,
  useReportUsage,
  useValuationUsage,
  VALUATION_EXTRA_COST,
  VALUATION_INCLUDED,
} from "@/hooks/useUsageAddons";

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function makeWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={qc}>{children}</QueryClientProvider>
  );
}

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function selectUsage(data: unknown[] = [], error: Error | null = null) {
  const gte = vi.fn().mockResolvedValue({ data, error });
  const eqBucket = vi.fn().mockReturnValue({ gte });
  const eqUser = vi.fn().mockReturnValue({ eq: eqBucket, gte });
  const select = vi.fn().mockReturnValue({ eq: eqUser });
  return { select, eqUser, eqBucket, gte };
}

describe("useUsageAddons", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.useAuth.mockReturnValue({ user: { id: "u1" } });
    mocks.useSubscription.mockReturnValue({ isPro: true });
  });

  it("exports add-on limits and counts valuation, report, and priority-ad usage from canonical tables", async () => {
    expect({
      VALUATION_INCLUDED,
      VALUATION_EXTRA_COST,
      REPORT_INCLUDED,
      REPORT_EXTRA_COST,
      PRIORITY_ADS_INCLUDED,
      PRIORITY_ADS_EXTRA_COST,
      PROFESSIONAL_PRIORITY_AD_EXTRA_COST,
    }).toEqual({
      VALUATION_INCLUDED: 5,
      VALUATION_EXTRA_COST: 39,
      REPORT_INCLUDED: 3,
      REPORT_EXTRA_COST: 49,
      PRIORITY_ADS_INCLUDED: 10,
      PRIORITY_ADS_EXTRA_COST: 59,
      PROFESSIONAL_PRIORITY_AD_EXTRA_COST: 8,
    });

    const first = selectUsage([{ id: "a" }, { id: "b" }]);
    const second = selectUsage([{ id: "r" }]);
    const third = selectUsage([{ id: "p" }, { id: "q" }, { id: "z" }]);
    mocks.from
      .mockReturnValueOnce(first)
      .mockReturnValueOnce(second)
      .mockReturnValueOnce(third);

    const wrapper = makeWrapper();
    const valuation = renderHook(() => useValuationUsage(), { wrapper });
    const report = renderHook(() => useReportUsage(), { wrapper });
    const priority = renderHook(() => usePriorityAdsUsage(), { wrapper });

    await waitFor(() => expect(valuation.result.current.data).toBe(2));
    await waitFor(() => expect(report.result.current.data).toBe(1));
    await waitFor(() => expect(priority.result.current.data).toBe(3));
    expect(mocks.from).toHaveBeenNthCalledWith(1, "usage_ai_calls");
    expect(mocks.from).toHaveBeenNthCalledWith(2, "usage_property_reports");
    expect(mocks.from).toHaveBeenNthCalledWith(3, "usage_priority_ads");
    expect(first.eqBucket).toHaveBeenCalledWith("bucket", "property-valuation");
    expect(second.eqBucket).not.toHaveBeenCalled();
  });

  it("does not query anonymous users and throws query errors for callers to handle", async () => {
    mocks.useAuth.mockReturnValue({ user: null });
    const wrapper = makeWrapper();
    const anon = renderHook(() => useValuationUsage(), { wrapper });
    expect(anon.result.current.data).toBeUndefined();
    expect(mocks.from).not.toHaveBeenCalled();

    mocks.useAuth.mockReturnValue({ user: { id: "u1" } });
    mocks.from.mockReturnValueOnce(selectUsage([], new Error("usage db")));
    const failing = renderHook(() => useReportUsage(), { wrapper: makeWrapper() });
    await waitFor(() => expect(failing.result.current.isError).toBe(true));
  });

  it("records valuation, report, and priority-ad usage, including auth/pro/error branches", async () => {
    const insertOk = vi.fn().mockResolvedValue({ error: null });
    mocks.from.mockReturnValue({ insert: insertOk });
    const wrapper = makeWrapper();

    const valuation = renderHook(() => useRecordValuation(), { wrapper });
    await act(async () => {
      await valuation.result.current.mutateAsync("listing-1");
    });
    expect(mocks.from).toHaveBeenCalledWith("usage_ai_valuations");
    expect(insertOk).toHaveBeenCalledWith({ user_id: "u1", listing_id: "listing-1" });

    const report = renderHook(() => useRecordReport(), { wrapper });
    await act(async () => {
      await report.result.current.mutateAsync(undefined);
    });
    expect(mocks.from).toHaveBeenCalledWith("usage_property_reports");
    expect(insertOk).toHaveBeenCalledWith({ user_id: "u1", listing_id: null });

    const priority = renderHook(() => useRecordPriorityAd(), { wrapper });
    await act(async () => {
      await priority.result.current.mutateAsync("listing-2");
    });
    expect(mocks.from).toHaveBeenCalledWith("usage_priority_ads");

    mocks.useSubscription.mockReturnValue({ isPro: false });
    const nonPro = renderHook(() => useRecordPriorityAd(), { wrapper: makeWrapper() });
    await expect(nonPro.result.current.mutateAsync("listing-3")).rejects.toThrow("Priority Ads require Pro plan");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Failed to record priority ad usage. Please try again."));

    mocks.useAuth.mockReturnValue({ user: null });
    const anon = renderHook(() => useRecordValuation(), { wrapper: makeWrapper() });
    await expect(anon.result.current.mutateAsync(undefined)).rejects.toThrow("Not authenticated");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Failed to record AI valuation usage. Please try again."));

    mocks.useAuth.mockReturnValue({ user: { id: "u1" } });
    mocks.from.mockReturnValueOnce({ insert: vi.fn().mockResolvedValue({ error: new Error("report db") }) });
    await expect(report.result.current.mutateAsync("listing-4")).rejects.toThrow("report db");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Failed to record report usage. Please try again."));
  });
});
