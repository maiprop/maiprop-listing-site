/**
 * Tests for the four hooks in `@/hooks/useSavedSearches`.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import React from "react";

const { useAuthMock, fromMock, getUserMock, toastMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  fromMock: vi.fn(),
  getUserMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => useAuthMock() }));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...a: unknown[]) => fromMock(...a),
    auth: { getUser: () => getUserMock() },
  },
}));
vi.mock("sonner", () => ({ toast: toastMock }));
vi.mock("@/lib/planLimitErrors", () => ({ getPlanLimitErrorMessage: () => null }));

import {
  useSavedSearches,
  useCreateSavedSearch,
  useDeleteSavedSearch,
  useToggleSavedSearchAlert,
} from "@/hooks/useSavedSearches";

const wrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
};

beforeEach(() => {
  useAuthMock.mockReset();
  fromMock.mockReset();
  getUserMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "u-1" } });
  getUserMock.mockResolvedValue({ data: { user: { id: "u-1" } } });
});

describe("useSavedSearches (query)", () => {
  it("stays idle when no user is logged in", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useSavedSearches(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeUndefined();
  });

  it("returns rows scoped to the user, ordered desc by created_at", async () => {
    const order = vi.fn().mockResolvedValue({ data: [{ id: "s-1", name: "Athens 2BR" }], error: null });
    const eq = vi.fn().mockReturnValue({ order });
    fromMock.mockReturnValue({ select: () => ({ eq }) });
    const { result } = renderHook(() => useSavedSearches(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(fromMock).toHaveBeenCalledWith("saved_searches");
    expect(eq).toHaveBeenCalledWith("user_id", "u-1");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(result.current.data).toEqual([{ id: "s-1", name: "Athens 2BR" }]);
  });

  it("rejects when supabase returns an error", async () => {
    const order = vi.fn().mockResolvedValue({ data: null, error: new Error("nope") });
    fromMock.mockReturnValue({ select: () => ({ eq: () => ({ order }) }) });
    const { result } = renderHook(() => useSavedSearches(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect((result.current.error as Error).message).toMatch(/nope/);
  });
});

describe("useCreateSavedSearch", () => {
  it("inserts a row with the auth user id and toasts success", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });
    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({
        name: "Greek seaside",
        filters: { region: "attica" },
        emailAlerts: true,
      });
    });
    expect(insert).toHaveBeenCalledWith({
      user_id: "u-1",
      name: "Greek seaside",
      filters: { region: "attica" },
      email_alerts: true,
    });
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/saved/i));
  });

  it("rejects when there is no auth user", async () => {
    getUserMock.mockResolvedValue({ data: { user: null } });
    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper: wrapper() });
    await expect(
      result.current.mutateAsync({ name: "x", filters: {}, emailAlerts: false }),
    ).rejects.toThrow(/authenticated/i);
  });

  it("rejects invalid saved-search input before inserting", async () => {
    const insert = vi.fn().mockResolvedValue({ error: null });
    fromMock.mockReturnValue({ insert });
    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper: wrapper() });

    await expect(
      result.current.mutateAsync({ name: " ", filters: [], emailAlerts: false }),
    ).rejects.toThrow(/Invalid saved search/i);

    expect(insert).not.toHaveBeenCalled();
  });

  it("toasts the supabase error message on failure", async () => {
    const insert = vi.fn().mockResolvedValue({ error: new Error("limit hit") });
    fromMock.mockReturnValue({ insert });
    const { result } = renderHook(() => useCreateSavedSearch(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ name: "x", filters: {}, emailAlerts: false }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith("limit hit");
  });
});

describe("useDeleteSavedSearch", () => {
  it("scopes the delete to id + user_id and toasts success", async () => {
    const savedSearchId = "11111111-1111-4111-8111-111111111111";
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const del = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ delete: del });
    const { result } = renderHook(() => useDeleteSavedSearch(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync(savedSearchId);
    });
    expect(eq1).toHaveBeenCalledWith("id", savedSearchId);
    expect(eq2).toHaveBeenCalledWith("user_id", "u-1");
    expect(toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/removed/i));
  });

  it("rejects without a user", async () => {
    useAuthMock.mockReturnValue({ user: null });
    const { result } = renderHook(() => useDeleteSavedSearch(), { wrapper: wrapper() });
    await expect(result.current.mutateAsync("s")).rejects.toThrow(/authenticated/i);
  });

  it("rejects invalid ids before deleting", async () => {
    const del = vi.fn();
    fromMock.mockReturnValue({ delete: del });
    const { result } = renderHook(() => useDeleteSavedSearch(), { wrapper: wrapper() });

    await expect(result.current.mutateAsync("not-a-uuid")).rejects.toThrow(/Invalid saved search id/i);

    expect(del).not.toHaveBeenCalled();
  });
});

describe("useToggleSavedSearchAlert", () => {
  it("updates the email_alerts flag scoped to id + user_id", async () => {
    const savedSearchId = "22222222-2222-4222-8222-222222222222";
    const eq2 = vi.fn().mockResolvedValue({ error: null });
    const eq1 = vi.fn().mockReturnValue({ eq: eq2 });
    const update = vi.fn().mockReturnValue({ eq: eq1 });
    fromMock.mockReturnValue({ update });
    const { result } = renderHook(() => useToggleSavedSearchAlert(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: savedSearchId, emailAlerts: true });
    });
    expect(update).toHaveBeenCalledWith({ email_alerts: true });
    expect(eq1).toHaveBeenCalledWith("id", savedSearchId);
    expect(eq2).toHaveBeenCalledWith("user_id", "u-1");
  });

  it("toasts on error", async () => {
    const savedSearchId = "33333333-3333-4333-8333-333333333333";
    const eq2 = vi.fn().mockResolvedValue({ error: new Error("oops") });
    fromMock.mockReturnValue({ update: () => ({ eq: () => ({ eq: eq2 }) }) });
    const { result } = renderHook(() => useToggleSavedSearchAlert(), { wrapper: wrapper() });
    await act(async () => {
      await result.current.mutateAsync({ id: savedSearchId, emailAlerts: false }).catch(() => {});
    });
    expect(toastMock.error).toHaveBeenCalledWith("oops");
  });
});
