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

import {
  useAgentDataInputs,
  useAgentDataInputQuota,
  useSubmitAgentDataInput,
} from "@/hooks/useAgentDataInputs";

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

describe("useAgentDataInputs", () => {
  it("normalizes edge entries with billing credit invoice metadata", async () => {
    invokeMock.mockResolvedValue({
      data: {
        monthly_count: 1,
        monthly_limit: 20,
        lifetime_banned: false,
        entries: [
          {
            id: "entry-1",
            property_address: "Ermou 12",
            city: "Athens",
            postal_code: "10563",
            property_type: "apartment",
            transaction_type: "rental",
            agent_side: "buyer",
            sale_price: 1200,
            closing_date: "2026-04-30",
            status: "verified",
            rejection_reason: null,
            discount_pct: 0.5,
            discount_applied_at: "2026-05-01T10:00:00.000Z",
            discount_invoice_id: "in_credit_123",
            created_at: "2026-04-30T09:00:00.000Z",
            reviewed_at: "2026-05-01T09:30:00.000Z",
          },
        ],
      },
      error: null,
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputs(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("agent-data-input", {
      body: { action: "list" },
    });
    expect(result.current.data).toEqual([
      expect.objectContaining({
        id: "entry-1",
        user_id: "agent-1",
        property_city: "Athens",
        property_postal_code: "10563",
        transaction_type: "rent",
        agent_side: "buyer",
        closing_price: 1200,
        status: "verified",
        discount_pct: 0.5,
        applied_to_invoice_at: "2026-05-01T10:00:00.000Z",
        stripe_credit_id: "in_credit_123",
        stripe_credit_amount_cents: null,
        stripe_credit_currency: null,
        updated_at: "2026-05-01T09:30:00.000Z",
      }),
    ]);
  });
});

describe("useAgentDataInputQuota", () => {
  it("returns remaining billing-credit submissions from the edge status response", async () => {
    invokeMock.mockResolvedValue({
      data: {
        monthly_count: 18,
        monthly_limit: 20,
        lifetime_banned: false,
        entries: [],
      },
      error: null,
    });

    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useAgentDataInputQuota(), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(invokeMock).toHaveBeenCalledWith("agent-data-input", {
      body: { action: "status" },
    });
    expect(result.current.data).toEqual({
      used: 18,
      monthly_limit: 20,
      remaining: 2,
      is_banned: false,
    });
  });
});

describe("useSubmitAgentDataInput", () => {
  it("submits billing-credit data input through the edge function and refreshes list and quota caches", async () => {
    invokeMock.mockResolvedValue({
      data: { entry: { id: "entry-new" } },
      error: null,
    });

    const { client, wrapper } = makeWrapper();
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useSubmitAgentDataInput(), { wrapper });

    await act(async () => {
      await expect(result.current.mutateAsync({
        closed_at: "2026-04-30",
        property_address: " Ermou 12 ",
        property_city: " Athens ",
        property_postal_code: "",
        property_type: "villa",
        transaction_type: "rent",
        agent_side: "both",
        closing_price: 1200,
        kaek: "",
        buyer_name: "Buyer",
        seller_name: "",
        notes: "Notary ref",
      })).resolves.toBe("entry-new");
    });

    expect(invokeMock).toHaveBeenCalledWith("agent-data-input", {
      body: {
        action: "submit",
        payload: {
          property_address: " Ermou 12 ",
          city: " Athens ",
          postal_code: "",
          kaek: "",
          property_type: "other",
          transaction_type: "rental",
          agent_side: "both",
          sale_price: 1200,
          closing_date: "2026-04-30",
          buyer_name: "Buyer",
          seller_name: "",
          notes: "Notary ref",
        },
      },
    });
    expect(toastMock.success).toHaveBeenCalledWith("Submission received - pending verification");
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["agent-data-inputs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["agent-data-input-quota"] });
  });
});
