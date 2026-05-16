import { act, renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  useAuctionAlerts,
  useCreateAuctionAlert,
  useDeleteAuctionAlert,
  useUpdateAuctionAlert,
} from "@/hooks/useAuctionAlerts";
import { useDealChecklist, useDealChecklists, useUpsertDealChecklist } from "@/hooks/useDealChecklists";
import { appRedirectUrl, sanitizeRedirectPath } from "@/lib/authRedirect";
import { trackAnalyticsEvent } from "@/lib/analytics";

const mocks = vi.hoisted(() => ({
  user: { id: "user-1" } as { id: string } | null,
  authUser: { id: "user-1" } as { id: string } | null,
  from: vi.fn(),
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: mocks.user }),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: mocks.from,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: mocks.authUser }, error: null })),
    },
  },
}));

vi.mock("sonner", () => ({
  toast: { success: mocks.toastSuccess, error: mocks.toastError },
}));

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

function queryBuilder(result: unknown = { data: [], error: null }) {
  const builder = {
    select: vi.fn(() => builder),
    eq: vi.fn(() => builder),
    order: vi.fn(() => builder),
    maybeSingle: vi.fn(async () => result),
    insert: vi.fn(async () => result),
    update: vi.fn(() => builder),
    delete: vi.fn(() => builder),
    upsert: vi.fn(() => builder),
    single: vi.fn(async () => result),
    then: (resolve: (value: unknown) => void, reject?: (reason?: unknown) => void) =>
      Promise.resolve(result).then(resolve, reject),
  };
  return builder;
}

describe("coverage-focused hooks and libs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user = { id: "user-1" };
    mocks.authUser = { id: "user-1" };
    localStorage.clear();
  });

  it("loads, creates, updates, and deletes auction alerts with auth and plan-limit errors", async () => {
    const builder = queryBuilder({ data: [{ id: "alert-1", user_id: "user-1", active: true }], error: null });
    mocks.from.mockReturnValue(builder);

    const list = renderHook(() => useAuctionAlerts(), { wrapper });
    await waitFor(() => expect(list.result.current.data).toHaveLength(1));

    const create = renderHook(() => useCreateAuctionAlert(), { wrapper });
    await act(async () => {
      await create.result.current.mutateAsync({ city: "Athens", email_notify: true });
    });
    expect(builder.insert).toHaveBeenCalledWith({ user_id: "user-1", city: "Athens", email_notify: true });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Auction alert created!");

    const update = renderHook(() => useUpdateAuctionAlert(), { wrapper });
    await update.result.current.mutateAsync({ id: "alert-1", updates: { active: false } });
    expect(builder.update).toHaveBeenCalledWith({ active: false });
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Alert updated.");

    const remove = renderHook(() => useDeleteAuctionAlert(), { wrapper });
    await remove.result.current.mutateAsync("alert-1");
    expect(builder.delete).toHaveBeenCalled();
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Alert deleted.");

    mocks.authUser = null;
    await expect(create.result.current.mutateAsync({ city: "Piraeus" })).rejects.toThrow("Not authenticated");

    mocks.authUser = { id: "user-1" };
    mocks.from.mockReturnValue(queryBuilder({ data: null, error: new Error("auction_alert_limit_reached") }));
    const failing = renderHook(() => useCreateAuctionAlert(), { wrapper });
    await expect(failing.result.current.mutateAsync({ city: "Patras" })).rejects.toThrow("auction_alert_limit_reached");
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalled());
  });

  it("loads single and list deal checklists, upserts defaults, and reports save failures", async () => {
    const checklist = { id: "check-1", user_id: "user-1", entity_type: "listing", entity_id: "listing-1" };
    mocks.from.mockReturnValue(queryBuilder({ data: [checklist], error: null }));
    const list = renderHook(() => useDealChecklists(), { wrapper });
    await waitFor(() => expect(list.result.current.data).toEqual([checklist]));

    mocks.from.mockReturnValue(queryBuilder({ data: checklist, error: null }));
    const single = renderHook(() => useDealChecklist("listing", "listing-1"), { wrapper });
    await waitFor(() => expect(single.result.current.data).toEqual(checklist));

    const upsertBuilder = queryBuilder({ data: checklist, error: null });
    mocks.from.mockReturnValue(upsertBuilder);
    const upsert = renderHook(() => useUpsertDealChecklist(), { wrapper });
    await upsert.result.current.mutateAsync({ entity_type: "listing", entity_id: "listing-1" });
    expect(upsertBuilder.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ title: "Due diligence", items: [], status: "in_progress" }),
      { onConflict: "user_id,entity_type,entity_id" },
    );
    expect(mocks.toastSuccess).toHaveBeenCalledWith("Checklist saved");

    mocks.user = null;
    const loggedOut = renderHook(() => useUpsertDealChecklist(), { wrapper });
    await expect(loggedOut.result.current.mutateAsync({ entity_type: "listing", entity_id: "listing-1" })).rejects.toThrow("Not authenticated");

    mocks.user = { id: "user-1" };
    mocks.from.mockReturnValue(queryBuilder({ data: null, error: new Error("save failed") }));
    const failing = renderHook(() => useUpsertDealChecklist(), { wrapper });
    await expect(failing.result.current.mutateAsync({ entity_type: "firesale_request", entity_id: "deal-1" })).rejects.toThrow("save failed");
    await waitFor(() => expect(mocks.toastError).toHaveBeenCalledWith("Failed to save checklist. Please try again."));
  });

  it("sanitizes redirect paths and only sends analytics with explicit consent", () => {
    expect(sanitizeRedirectPath("/dashboard?tab=billing#top")).toBe("/dashboard?tab=billing#top");
    expect(sanitizeRedirectPath("//evil.example", "/fallback")).toBe("/fallback");
    expect(sanitizeRedirectPath({ pathname: "/pricing", search: "?audience=agent", hash: "#plans" })).toBe("/pricing?audience=agent#plans");
    expect(appRedirectUrl("//evil.example")).toMatch(/\/dashboard$/);

    const plausible = vi.fn();
    window.plausible = plausible;
    trackAnalyticsEvent("No Consent", { ignored: true });
    expect(plausible).not.toHaveBeenCalled();

    localStorage.setItem("maiprop_cookie_consent", JSON.stringify({ analytics: true }));
    trackAnalyticsEvent("Plan Viewed", { audience: "agent", skipped: undefined });
    expect(plausible).toHaveBeenCalledWith("Plan Viewed", { props: { audience: "agent" } });

    window.plausible = vi.fn(() => {
      throw new Error("analytics unavailable");
    });
    expect(() => trackAnalyticsEvent("Broken Provider")).not.toThrow();

    localStorage.setItem("maiprop_cookie_consent", "{bad json");
    trackAnalyticsEvent("Invalid Consent");
  });
});
