import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { createTestQueryClient, renderWithProviders } from "@/test/utils";

const mocks = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof import("@/test/utils").makeMockSupabase> | null,
  deleteEqMock: vi.fn(),
  upsertMock: vi.fn(),
  toastMock: { success: vi.fn(), error: vi.fn() },
  useAuthMock: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { makeMockSupabase } = await vi.importActual<typeof import("@/test/utils")>("@/test/utils");
  mocks.supabase = makeMockSupabase();
  return { supabase: mocks.supabase };
});

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => mocks.useAuthMock(),
}));

vi.mock("sonner", () => ({ toast: mocks.toastMock }));

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
  mocks.supabase?.from.mockImplementation((table: string) => {
    expect(table).toBe("pricing_configs");
    const builder = pricingQuery(rows) as Record<string, unknown>;
    builder.delete = vi.fn().mockReturnValue({ eq: mocks.deleteEqMock });
    builder.upsert = mocks.upsertMock;
    return builder;
  });

  const client = createTestQueryClient();

  const view = renderWithProviders(<AdminPricingContent embed />, { queryClient: client });
  return { client, ...view };
};

beforeEach(() => {
  mocks.deleteEqMock.mockReset();
  mocks.deleteEqMock.mockResolvedValue({ error: null });
  mocks.upsertMock.mockReset();
  mocks.upsertMock.mockResolvedValue({ error: null });
  mocks.supabase?.from.mockReset();
  mocks.supabase?.functions.invoke.mockReset();
  mocks.toastMock.success.mockReset();
  mocks.toastMock.error.mockReset();
  mocks.useAuthMock.mockReturnValue({ profile: { role: "admin" } });
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

    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalled();
    expect(mocks.toastMock.error).not.toHaveBeenCalledWith("Set amount > 0 before creating Stripe price");
  });

  it("creates a Stripe price for a paid row and writes the returned price ID into metadata", async () => {
    const paidRow = baseRow();
    mocks.supabase?.functions.invoke.mockImplementationOnce(async () => {
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
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-stripe-price", {
        body: { config_id: "price-config-1" },
      }),
    );

    await waitFor(() =>
      expect(screen.getByPlaceholderText("price_xxx")).toHaveValue("price_created_123"),
    );
    expect(mocks.toastMock.success).toHaveBeenCalledWith("Stripe price created: price_created_123");
  });

  it("surfaces Stripe sync summaries and row-level sync errors", async () => {
    mocks.supabase?.functions.invoke.mockResolvedValueOnce({
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
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("sync-stripe-pricing", { body: {} }),
    );
    expect(await screen.findByText("Stripe sync finished with errors")).toBeInTheDocument();
    expect(screen.getByText("agent_basic: missing product")).toBeInTheDocument();
    expect(mocks.toastMock.error).toHaveBeenCalledWith("Sync finished with 1 error(s)");
  });

  it("deletes rows from embedded admin pricing and invalidates public pricing cache", async () => {
    const { client } = renderAdminPricing([baseRow()]);
    const invalidateSpy = vi.spyOn(client, "invalidateQueries");

    await screen.findByDisplayValue("Agent Pro");
    fireEvent.click(screen.getByRole("button", { name: "Delete pricing row" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));

    await waitFor(() => expect(mocks.deleteEqMock).toHaveBeenCalledWith("id", "price-config-1"));
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-pricing-configs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pricing-configs-public"] });
    expect(mocks.toastMock.success).toHaveBeenCalledWith("Pricing row deleted.");
  });

  it("adds rows, edits every table field, saves, dismisses sync banners, and closes the add modal paths", async () => {
    const row = baseRow({ metadata: { stripe_price_id: "price_old" } });
    mocks.supabase?.functions.invoke.mockResolvedValueOnce({
      data: { summary: { created: 0, price_updated: 0, product_updated: 0, no_change: 1 }, results: [] },
      error: null,
    });

    const { client } = renderAdminPricing([row]);
    client.setQueryData(["admin-pricing-configs"], [row]);

    await screen.findByDisplayValue("Agent Pro");

    fireEvent.click(screen.getAllByRole("button", { name: /Add to this section/i })[0]);
    expect(mocks.toastMock.success).toHaveBeenCalledWith("Row added. Edit and save.");

    fireEvent.click(screen.getByRole("button", { name: /^Add item$/i }));
    const modalCombos = screen.getAllByRole("combobox");
    fireEvent.change(modalCombos.at(-2)!, { target: { value: "professional_subscription" } });
    fireEvent.change(modalCombos.at(-1)!, { target: { value: "professional" } });
    fireEvent.click(screen.getAllByRole("button", { name: /^Add item$/i }).at(-1)!);
    expect(screen.queryByText("Add pricing item")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Add item$/i }));
    fireEvent.click(screen.getByRole("button", { name: /^Cancel$/i }));
    expect(screen.queryByText("Add pricing item")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Add item$/i }));
    fireEvent.click(screen.getByRole("button", { name: "" }));
    expect(screen.queryByText("Add pricing item")).not.toBeInTheDocument();

    fireEvent.change(screen.getByDisplayValue("Agent Pro"), { target: { value: "Agent Elite" } });
    fireEvent.change(screen.getByDisplayValue("agent_basic"), { target: { value: "agent_elite" } });
    fireEvent.change(screen.getByDisplayValue("149"), { target: { value: "199" } });
    fireEvent.change(screen.getAllByDisplayValue("monthly")[0], { target: { value: "annual" } });
    fireEvent.change(screen.getAllByDisplayValue("EUR")[0], { target: { value: "USD" } });
    fireEvent.click(screen.getAllByRole("checkbox")[0]);
    fireEvent.change(screen.getAllByDisplayValue("2")[0], { target: { value: "9" } });
    fireEvent.change(screen.getByDisplayValue("Unlimited listings"), { target: { value: "Priority plus" } });
    fireEvent.change(screen.getByDisplayValue("price_old"), { target: { value: "price_new" } });

    fireEvent.click(screen.getByRole("button", { name: /^Save all$/i }));
    await waitFor(() => expect(mocks.upsertMock).toHaveBeenCalled());
    expect(mocks.toastMock.success).toHaveBeenCalledWith("Pricing configuration saved.");

    fireEvent.click(screen.getByRole("button", { name: /Sync to Stripe/i }));
    await waitFor(() => expect(screen.getByText(/Stripe sync complete/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    expect(screen.queryByText(/Stripe sync complete/i)).not.toBeInTheDocument();
  });

  it("seeds empty pricing and reports save, seed, delete, and Stripe creation failures", async () => {
    mocks.upsertMock
      .mockResolvedValueOnce({ error: null })
      .mockResolvedValueOnce({ error: new Error("save denied") })
      .mockResolvedValueOnce({ error: new Error("seed denied") });
    mocks.deleteEqMock.mockResolvedValueOnce({ error: new Error("delete denied") });
    mocks.supabase?.functions.invoke.mockResolvedValueOnce({ data: { error: "stripe denied" }, error: null });

    renderAdminPricing([]);

    await screen.findByText(/No pricing rows yet/i);
    fireEvent.click(screen.getByRole("button", { name: /Seed default pricing/i }));
    await waitFor(() => expect(mocks.toastMock.success).toHaveBeenCalledWith("Default pricing seeded. You can adjust amounts and save."));

    const paidRow = baseRow();
    cleanup();
    const { client, rerender } = renderAdminPricing([paidRow]);
    client.setQueryData(["admin-pricing-configs"], [paidRow]);
    rerender(<AdminPricingContent embed />);

    await screen.findByDisplayValue("Agent Pro");
    fireEvent.click(screen.getAllByRole("button", { name: /^Save all$/i })[0]);
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("save denied"));

    fireEvent.click(screen.getByRole("button", { name: /Seed defaults/i }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("seed denied"));

    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("stripe denied"));

    fireEvent.click(screen.getByRole("button", { name: "Delete pricing row" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("delete denied"));
  });
});
