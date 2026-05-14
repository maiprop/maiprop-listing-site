import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const { fromMock, invokeMock, toastMock, useAuthMock } = vi.hoisted(() => ({
  fromMock: vi.fn(),
  invokeMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  useAuthMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    from: (...args: unknown[]) => fromMock(...args),
    functions: {
      invoke: (...args: unknown[]) => invokeMock(...args),
    },
  },
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => useAuthMock(),
}));

vi.mock("sonner", () => ({ toast: toastMock }));

import { AdminPricingContent } from "@/pages/AdminPricing";

type TestPricingRow = {
  id: string;
  created_at: string;
  updated_at: string;
  key: string;
  label: string;
  description: string | null;
  audience: string;
  module: string;
  unit: string;
  currency: string;
  amount: number;
  is_active: boolean;
  sort_order: number;
  metadata: Record<string, unknown> | null;
};

const baseRow = (overrides: Partial<TestPricingRow> = {}): TestPricingRow => ({
  id: "price-config-1",
  created_at: "2026-05-01T00:00:00.000Z",
  updated_at: "2026-05-01T00:00:00.000Z",
  key: "agent_basic",
  label: "Agent Pro",
  description: "Unlimited listings",
  audience: "agent",
  module: "agent_subscription",
  unit: "monthly",
  currency: "EUR",
  amount: 149,
  is_active: true,
  sort_order: 2,
  metadata: {},
  ...overrides,
});

const pricingQuery = (rows: TestPricingRow[]) => {
  const builder: Record<string, unknown> = {};
  builder.select = vi.fn().mockReturnValue(builder);
  builder.order = vi.fn().mockReturnValue(builder);
  builder.then = (resolve: (value: unknown) => unknown) =>
    Promise.resolve(resolve({ data: rows, error: null }));
  return builder;
};

const renderAdminPricing = (rows: TestPricingRow[]) => {
  fromMock.mockImplementation((table: string) => {
    expect(table).toBe("pricing_configs");
    return pricingQuery(rows);
  });

  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });

  return render(
    <QueryClientProvider client={client}>
      <AdminPricingContent embed />
    </QueryClientProvider>,
  );
};

beforeEach(() => {
  fromMock.mockReset();
  invokeMock.mockReset();
  toastMock.success.mockReset();
  toastMock.error.mockReset();
  useAuthMock.mockReturnValue({ profile: { role: "admin" } });
});

describe("AdminPricingContent", () => {
  it("renders existing Stripe price IDs and disables creation for zero-amount rows", async () => {
    renderAdminPricing([
      baseRow({
        amount: 0,
        metadata: { stripe_price_id: "price_existing_zero" },
      }),
    ]);

    const stripeInput = await screen.findByPlaceholderText("price_xxx");
    expect(stripeInput).toHaveValue("price_existing_zero");
    expect(screen.getByRole("button", { name: "Create Stripe price" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));

    expect(invokeMock).not.toHaveBeenCalled();
    expect(toastMock.error).not.toHaveBeenCalledWith("Set amount > 0 before creating Stripe price");
  });

  it("creates a Stripe price for a paid row and writes the returned price ID into metadata", async () => {
    const paidRow = baseRow();
    invokeMock.mockImplementationOnce(async () => {
      paidRow.metadata = { stripe_price_id: "price_created_123" };
      return {
        data: { price_id: "price_created_123" },
        error: null,
      };
    });

    renderAdminPricing([paidRow]);

    await screen.findByDisplayValue("Agent Pro");
    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("create-stripe-price", {
        body: { config_id: "price-config-1" },
      }),
    );

    await waitFor(() =>
      expect(screen.getByPlaceholderText("price_xxx")).toHaveValue("price_created_123"),
    );
    expect(toastMock.success).toHaveBeenCalledWith("Stripe price created: price_created_123");
  });

  it("surfaces Stripe sync summaries and row-level sync errors", async () => {
    invokeMock.mockResolvedValueOnce({
      data: {
        summary: { created: 1, price_updated: 2, product_updated: 0, no_change: 3 },
        results: [{ action: "error", key: "agent_basic", error: "missing product" }],
      },
      error: null,
    });

    renderAdminPricing([baseRow()]);

    await screen.findByDisplayValue("Agent Pro");
    fireEvent.click(screen.getByRole("button", { name: /Sync to Stripe/i }));

    await waitFor(() =>
      expect(invokeMock).toHaveBeenCalledWith("sync-stripe-pricing", { body: {} }),
    );
    expect(await screen.findByText("Stripe sync finished with errors")).toBeInTheDocument();
    expect(screen.getByText("agent_basic: missing product")).toBeInTheDocument();
    expect(toastMock.error).toHaveBeenCalledWith("Sync finished with 1 error(s)");
  });
});
