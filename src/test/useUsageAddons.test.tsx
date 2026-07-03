import React from "react";
import { renderHook, waitFor } from "@testing-library/react";
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
  usePropertyReportAddonCredits,
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

// skipcq: JS-0067 - Top-level test/helper declaration is intentional in this module.
function selectAddonCredits(data: unknown[] = [], error: Error | null = null) {
  const inStatus = vi.fn().mockResolvedValue({ data, error });
  const inAddon = vi.fn().mockReturnValue({ in: inStatus });
  const eqUser = vi.fn().mockReturnValue({ in: inAddon });
  const select = vi.fn().mockReturnValue({ eq: eqUser });
  return { select, eqUser, inAddon, inStatus };
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
    expect(first.gte.mock.calls[0][1]).toMatch(/T00:00:00\.000Z$/);
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

  it("counts remaining paid property-report add-on credits from the durable purchase ledger", async () => {
    const credits = selectAddonCredits([
      { credits_granted: 3, credits_consumed: 1 },
      { credits_granted: 1, credits_consumed: 0 },
      { credits_granted: 1, credits_consumed: 1 },
    ]);
    mocks.from.mockReturnValueOnce(credits);

    const result = renderHook(() => usePropertyReportAddonCredits(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.result.current.data).toBe(3));
    expect(mocks.from).toHaveBeenCalledWith("addon_purchases");
    expect(credits.eqUser).toHaveBeenCalledWith("user_id", "u1");
    expect(credits.inAddon).toHaveBeenCalledWith("addon_key", ["property_report_single"]);
    expect(credits.inStatus).toHaveBeenCalledWith("status", ["paid", "active", "refunded"]);
  });

  it("subtracts refunded add-on credits and preserves negative debt", async () => {
    const credits = selectAddonCredits([
      { credits_granted: 1, credits_consumed: 1, credits_refunded: 1 },
      { credits_granted: 3, credits_consumed: 0, credits_refunded: 0 },
    ]);
    mocks.from.mockReturnValueOnce(credits);

    const result = renderHook(() => usePropertyReportAddonCredits(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.result.current.data).toBe(2));
    expect(credits.select).toHaveBeenCalledWith("credits_granted, credits_consumed, credits_refunded");
  });

  it("does not let negative refunded debt reduce included report allowance in UI reads", async () => {
    const credits = selectAddonCredits([
      { credits_granted: 1, credits_consumed: 1, credits_refunded: 1 },
    ]);
    mocks.from.mockReturnValueOnce(credits);

    const result = renderHook(() => usePropertyReportAddonCredits(), {
      wrapper: makeWrapper(),
    });

    await waitFor(() => expect(result.result.current.data).toBe(0));
  });

  it("rejects direct browser usage writes because usage is recorded by server workflows", async () => {
    const wrapper = makeWrapper();

    const valuation = renderHook(() => useRecordValuation(), { wrapper });
    await expect(valuation.result.current.mutateAsync("listing-1")).rejects.toThrow(
      /recorded server-side by the valuation function/,
    );
    expect(mocks.from).not.toHaveBeenCalledWith("usage_ai_valuations");

    const report = renderHook(() => useRecordReport(), { wrapper });
    await expect(report.result.current.mutateAsync(undefined)).rejects.toThrow(
      /recorded server-side by the report function/,
    );
    expect(mocks.from).not.toHaveBeenCalledWith("usage_property_reports");

    const priority = renderHook(() => useRecordPriorityAd(), { wrapper });
    await expect(priority.result.current.mutateAsync("listing-2")).rejects.toThrow(
      /recorded server-side by the checkout or boost workflow/,
    );
    expect(mocks.from).not.toHaveBeenCalledWith("usage_priority_ads");

    mocks.useSubscription.mockReturnValue({ isPro: false });
    const nonPro = renderHook(() => useRecordPriorityAd(), { wrapper: makeWrapper() });
    await expect(nonPro.result.current.mutateAsync("listing-3")).rejects.toThrow("Priority Ads require Pro plan");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Failed to record priority ad usage. Please try again."));

    mocks.useAuth.mockReturnValue({ user: null });
    const anon = renderHook(() => useRecordValuation(), { wrapper: makeWrapper() });
    await expect(anon.result.current.mutateAsync(undefined)).rejects.toThrow("Not authenticated");
    await waitFor(() => expect(mocks.toast.error).toHaveBeenCalledWith("Failed to record AI valuation usage. Please try again."));
  });
});
