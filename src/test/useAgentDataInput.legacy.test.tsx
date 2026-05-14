import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { invokeMock, useAuthMock, toastMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  useAuthMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import { useAgentDataInputStatus, useSubmitDataInput } from "@/hooks/useAgentDataInput";

const makeWrapper = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return {
    client,
    wrapper: ({ children }: { children: React.ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  };
};

beforeEach(() => {
  invokeMock.mockReset();
  useAuthMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useAuthMock.mockReturnValue({ user: { id: "agent-1" } });
});

describe("useAgentDataInputStatus", () => {
  it("loads the status workflow only for authenticated agents", async () => {
    invokeMock.mockResolvedValue({
      data: {
        monthly_count: 3,
        monthly_limit: 20,
        discount_pct_per_input: 0.5,
        pending_discount_pct: 1.5,
        pending_discount_count: 3,
        total_pending: 1,
        total_verified: 3,
        total_rejected: 0,
        lifetime_banned: false,
        ban_reason: null,
        banned_at: null,
        entries: [],
      },
      error: null,
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputStatus(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("agent-data-input", {
      body: { action: "status" },
    });
    expect(result.current.data?.pending_discount_pct).toBe(1.5);
  });

  it("does not call the edge function without a user session", () => {
    useAuthMock.mockReturnValue({ user: null });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputStatus(), { wrapper });

    expect(result.current.fetchStatus).toBe("idle");
    expect(invokeMock).not.toHaveBeenCalled();
  });
});

describe("useSubmitDataInput", () => {
  it("submits agent data input and invalidates the status cache", async () => {
    invokeMock.mockResolvedValue({ data: { entry: { id: "entry-1" } }, error: null });

    const { client, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSubmitDataInput(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({
        property_address: "Ermou 12",
        city: "Athens",
        postal_code: "10563",
        property_type: "apartment",
        transaction_type: "sale",
        agent_side: "seller",
        sale_price: 240000,
        closing_date: "2026-05-01",
      })).resolves.toEqual({ id: "entry-1" });
    });

    expect(invokeMock).toHaveBeenCalledWith("agent-data-input", {
      body: {
        action: "submit",
        payload: expect.objectContaining({
          property_address: "Ermou 12",
          sale_price: 240000,
        }),
      },
    });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["agent-data-input"] });
    expect(toastMock.success).toHaveBeenCalledWith(
      "Submitted for review. We'll verify the closing within a few business days.",
    );
  });

  it("surfaces structured edge-function validation errors", async () => {
    invokeMock.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { body: JSON.stringify({ message: "Monthly limit reached" }) },
      },
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useSubmitDataInput(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({
        property_address: "Ermou 12",
        property_type: "apartment",
        transaction_type: "sale",
        agent_side: "seller",
        sale_price: 240000,
        closing_date: "2026-05-01",
      })).rejects.toThrow("Monthly limit reached");
    });

    expect(toastMock.error).toHaveBeenCalledWith("Monthly limit reached");
  });
});
