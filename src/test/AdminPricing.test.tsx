import { describe, it, expect, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
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
vi.mock("@/components/Navbar", () => ({ Navbar: () => <nav data-testid="pricing-navbar" /> }));
vi.mock("@/components/Footer", () => ({ Footer: () => <footer data-testid="pricing-footer" /> }));

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

const renderAdminPricing = (rows: TestPricingRow[], embed = true) => {
  mocks.supabase?.from.mockImplementation((table: string) => {
    expect(table).toBe("pricing_configs");
    const builder = pricingQuery(rows) as Record<string, unknown>;
    builder.delete = vi.fn().mockReturnValue({ eq: mocks.deleteEqMock });
    builder.upsert = mocks.upsertMock;
    return builder;
  });

  const client = createTestQueryClient();

  const view = renderWithProviders(<AdminPricingContent embed={embed} />, { queryClient: client });
  return { client, ...view };
};

beforeEach(() => {
  mocks.deleteEqMock.mockReset();
  mocks.deleteEqMock.mockResolvedValue({ error: null });
  mocks.upsertMock.mockReset();
  mocks.upsertMock.mockResolvedValue({ error: null });
  mocks.supabase?.from.mockReset();
  mocks.supabase?.functions.invoke.mockReset();
  mocks.supabase?.functions.invoke.mockResolvedValue({ data: { ok: true }, error: null });
  mocks.toastMock.success.mockReset();
  mocks.toastMock.error.mockReset();
  mocks.useAuthMock.mockReturnValue({ profile: { role: "admin" } });
});

describe("AdminPricingContent", () => {
  it("renders existing Stripe price IDs and disables creation for zero-amount rows", async () => {
    renderAdminPricing([
      baseRow({
        amount: 0,
        metadata: {
          stripe_price_id_monthly: "price_existing_zero",
          stripe_price_id_annual: "price_existing_annual",
        },
      }),
    ]);

    const monthlyStripeInput = await screen.findByLabelText("Monthly Stripe price ID");
    expect(monthlyStripeInput).toHaveValue("price_existing_zero");
    expect(screen.getByLabelText("Annual Stripe price ID")).toHaveValue("price_existing_annual");
    expect(screen.getByRole("button", { name: "Create Stripe price" })).toBeDisabled();

    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));

    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalled();
    expect(mocks.toastMock.error).not.toHaveBeenCalledWith("Set amount > 0 before creating Stripe price");
  });

  it("creates a Stripe price for a paid row and writes the returned price ID into metadata", async () => {
    const paidRow = baseRow();
    mocks.supabase?.functions.invoke.mockImplementationOnce(async () => {
      paidRow.metadata = { stripe_price_id_monthly: "price_created_123" };
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
      expect(screen.getByLabelText("Monthly Stripe price ID")).toHaveValue("price_created_123"),
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

    await waitFor(() =>
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("admin-pricing-config", {
        body: { action: "delete", id: "price-config-1" },
      }),
    );
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["admin-pricing-configs"] });
    expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["pricing-configs-public"] });
    expect(mocks.toastMock.success).toHaveBeenCalledWith("Pricing row deleted.");
  });

  it("adds rows, edits every table field, saves, dismisses sync banners, and closes the add modal paths", async () => {
    const row = baseRow({
      metadata: {
        stripe_price_id_monthly: "price_old",
        stripe_price_id_annual: "price_year_old",
      },
    });
    mocks.supabase?.functions.invoke.mockImplementation(async (functionName: string) => {
      if (functionName === "sync-stripe-pricing") {
        return {
          data: { summary: { created: 0, price_updated: 0, product_updated: 0, no_change: 1 }, results: [] },
          error: null,
        };
      }
      return { data: { ok: true }, error: null };
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
    fireEvent.change(screen.getByDisplayValue("price_year_old"), { target: { value: "price_year_new" } });

    fireEvent.click(screen.getByRole("button", { name: /^Save all$/i }));
    await waitFor(() =>
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("admin-pricing-config", {
        body: expect.objectContaining({
          action: "upsert",
          rows: expect.arrayContaining([
            expect.objectContaining({
              metadata: expect.objectContaining({
                stripe_price_id_monthly: "price_new",
                stripe_price_id_annual: "price_year_new",
              }),
            }),
          ]),
        }),
      }),
    );
    expect(mocks.toastMock.success).toHaveBeenCalledWith("Pricing configuration saved.");

    fireEvent.click(screen.getByRole("button", { name: /Sync to Stripe/i }));
    await waitFor(() => expect(screen.getByText(/Stripe sync complete/i)).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "×" }));
    expect(screen.queryByText(/Stripe sync complete/i)).not.toBeInTheDocument();
  });

  it("seeds empty pricing and reports save, seed, delete, and Stripe creation failures", async () => {
    let adminPricingCalls = 0;
    mocks.supabase?.functions.invoke.mockImplementation(async (functionName: string) => {
      if (functionName === "admin-pricing-config") {
        adminPricingCalls += 1;
        if (adminPricingCalls === 1) return { data: { ok: true }, error: null };
        if (adminPricingCalls === 2) return { data: { error: "save denied" }, error: null };
        if (adminPricingCalls === 3) return { data: { error: "seed denied" }, error: null };
        return { data: { error: "delete denied" }, error: null };
      }
      if (functionName === "create-stripe-price") {
        return { data: { error: "stripe denied" }, error: null };
      }
      return { data: { ok: true }, error: null };
    });

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

  it("enforces platform-admin access outside the embedded dashboard", async () => {
    mocks.useAuthMock.mockReturnValue({ profile: { role: "buyer" } });
    renderAdminPricing([baseRow()], false);

    expect(await screen.findByText("Access restricted")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-footer")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Agent Pro")).not.toBeInTheDocument();
  });

  it("renders the full page shell for admins when pricing is not embedded", async () => {
    renderAdminPricing([baseRow()], false);

    expect(await screen.findByDisplayValue("Agent Pro")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-navbar")).toBeInTheDocument();
    expect(screen.getByTestId("pricing-footer")).toBeInTheDocument();
  });

  it("normalizes legacy monthly and annual Stripe metadata aliases", async () => {
    renderAdminPricing([
      baseRow({
        id: "monthly-alias",
        metadata: { stripe_monthly_price_id: "price_monthly_alias", stripe_annual_price_id: "price_annual_alias" },
      }),
      baseRow({
        id: "annual-base",
        key: "investor_private",
        label: "Private Investor",
        module: "investor_subscription",
        audience: "investor",
        unit: "annual",
        metadata: { stripe_price_id: "price_annual_base" },
      }),
      baseRow({
        id: "invalid-meta",
        key: "custom_invalid_meta",
        label: "Invalid Metadata",
        metadata: null,
      }),
    ]);

    const monthlyAliasRow = (await screen.findByDisplayValue("Agent Pro")).closest("tr")!;
    const annualBaseRow = screen.getByDisplayValue("Private Investor").closest("tr")!;
    const invalidMetaRow = screen.getByDisplayValue("Invalid Metadata").closest("tr")!;
    expect(within(monthlyAliasRow).getByLabelText("Monthly Stripe price ID")).toHaveValue("price_monthly_alias");
    expect(within(monthlyAliasRow).getByLabelText("Annual Stripe price ID")).toHaveValue("price_annual_alias");
    expect(within(annualBaseRow).getByLabelText("Monthly Stripe price ID")).toHaveValue("");
    expect(within(annualBaseRow).getByLabelText("Annual Stripe price ID")).toHaveValue("price_annual_base");
    expect(within(invalidMetaRow).getByLabelText("Monthly Stripe price ID")).toHaveValue("");
    expect(within(invalidMetaRow).getByLabelText("Annual Stripe price ID")).toHaveValue("");
  });

  it("stores returned recurring Stripe IDs on annual configurations", async () => {
    const annualRow = baseRow({
      id: "annual-config",
      key: "investor_private",
      label: "Private Investor",
      module: "investor_subscription",
      audience: "investor",
      unit: "annual",
      amount: 900,
      metadata: {},
    });
    mocks.supabase?.functions.invoke.mockResolvedValueOnce({
      data: { price_id: "price_primary", annual_price_id: "price_annual" },
      error: null,
    });
    renderAdminPricing([annualRow]);

    await screen.findByDisplayValue("Private Investor");
    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));

    await waitFor(() => expect(screen.getByLabelText("Annual Stripe price ID")).toHaveValue("price_annual"));
    expect(screen.getByLabelText("Monthly Stripe price ID")).toHaveValue("");
    expect(mocks.toastMock.success).toHaveBeenCalledWith("Stripe price created: price_primary");
  });

  it("rejects invalid pricing rows before any privileged mutation is sent", async () => {
    const invalid = baseRow({ key: "", label: "", amount: -1, currency: "" });
    const { client } = renderAdminPricing([invalid]);
    client.setQueryData(["admin-pricing-configs"], [invalid]);

    await screen.findAllByDisplayValue("");
    fireEvent.click(screen.getByRole("button", { name: /^Save all$/i }));

    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalled());
    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "admin-pricing-config",
      expect.anything(),
    );
  });

  it("reports Stripe sync transport failures without leaving the control pending", async () => {
    mocks.supabase?.functions.invoke.mockResolvedValueOnce({ data: null, error: new Error("Stripe unavailable") });
    renderAdminPricing([baseRow()]);

    await screen.findByDisplayValue("Agent Pro");
    fireEvent.click(screen.getByRole("button", { name: /Sync to Stripe/i }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("Stripe unavailable"));
    expect(screen.getByRole("button", { name: /Sync to Stripe/i })).toBeEnabled();
  });

  it("cancels deletion and preserves the pricing row", async () => {
    renderAdminPricing([baseRow()]);

    await screen.findByDisplayValue("Agent Pro");
    fireEvent.click(screen.getByRole("button", { name: "Delete pricing row" }));
    fireEvent.click(await screen.findByRole("button", { name: "Cancel" }));

    expect(screen.queryByText("Delete pricing row")).not.toBeInTheDocument();
    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "admin-pricing-config",
      expect.objectContaining({ body: expect.objectContaining({ action: "delete" }) }),
    );
    expect(screen.getByDisplayValue("Agent Pro")).toBeInTheDocument();
  });

  it("renders custom pricing groups and clears Stripe identifiers from metadata", async () => {
    const custom = baseRow({
      id: "custom-row",
      key: "custom_service",
      label: "Custom Service",
      module: "custom_module",
      audience: "custom_audience",
      metadata: {
        stripe_price_id: "price_base",
        stripe_price_id_monthly: "price_monthly",
        stripe_monthly_price_id: "price_monthly",
      },
    });
    const { client } = renderAdminPricing([custom]);
    client.setQueryData(["admin-pricing-configs"], [custom]);

    expect(await screen.findByText(/custom_module.*custom_audience/i)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Monthly Stripe price ID"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save all$/i }));

    await waitFor(() => expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith(
      "admin-pricing-config",
      expect.objectContaining({
        body: expect.objectContaining({
          rows: expect.arrayContaining([
            expect.objectContaining({ metadata: expect.objectContaining({}) }),
          ]),
        }),
      }),
    ));
  });

  it("adds after the highest section sort order and saves the expanded configuration", async () => {
    const row = baseRow({ sort_order: 7 });
    renderAdminPricing([row]);
    await screen.findByDisplayValue("Agent Pro");

    const agentSection = screen.getByText("Agents").closest("section")!;
    fireEvent.click(within(agentSection).getByRole("button", { name: /Add to this section/i }));
    expect(await screen.findByDisplayValue("New pricing item")).toBeInTheDocument();
    expect(screen.getByDisplayValue("8")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /^Save all$/i }));
    await waitFor(() => expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith(
      "admin-pricing-config",
      expect.objectContaining({ body: expect.objectContaining({ action: "upsert" }) }),
    ));
  });

  it("uses safe default error messages when privileged Edge Functions omit details", async () => {
    let adminCalls = 0;
    mocks.supabase?.functions.invoke.mockImplementation(async (name: string) => {
      if (name === "admin-pricing-config") {
        adminCalls += 1;
        return { data: null, error: {} };
      }
      if (name === "create-stripe-price") return { data: null, error: {} };
      return { data: {}, error: null };
    });
    renderAdminPricing([baseRow()]);
    await screen.findByDisplayValue("Agent Pro");

    fireEvent.click(screen.getByRole("button", { name: /^Save all$/i }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("Pricing configuration update failed"));

    fireEvent.click(screen.getByRole("button", { name: "Delete pricing row" }));
    fireEvent.click(await screen.findByRole("button", { name: "Delete" }));
    await waitFor(() => expect(adminCalls).toBe(2));

    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("Failed"));
  });

  it("handles empty successful Stripe responses with zero-valued summaries", async () => {
    mocks.supabase?.functions.invoke.mockImplementation(async (name: string) => {
      if (name === "sync-stripe-pricing") return { data: {}, error: null };
      if (name === "create-stripe-price") return { data: {}, error: null };
      return { data: { ok: true }, error: null };
    });
    renderAdminPricing([baseRow()]);
    await screen.findByDisplayValue("Agent Pro");

    fireEvent.click(screen.getByRole("button", { name: /Sync to Stripe/i }));
    expect(await screen.findByText(/0 created, 0 price updates, 0 product updates, 0 unchanged/i)).toBeInTheDocument();
    expect(mocks.toastMock.success).toHaveBeenCalledWith(expect.stringMatching(/0 created, 0 updated/i));

    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));
    await waitFor(() => expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith(
      "create-stripe-price",
      { body: { config_id: "price-config-1" } },
    ));
    expect(mocks.toastMock.success).not.toHaveBeenCalledWith(expect.stringMatching(/Stripe price created/i));
  });

  it("falls back safely for non-Error Stripe rejections", async () => {
    let syncCalls = 0;
    mocks.supabase?.functions.invoke.mockImplementation((name: string) => {
      if (name === "sync-stripe-pricing") {
        syncCalls += 1;
        return Promise.reject("sync socket closed");
      }
      if (name === "create-stripe-price") return Promise.reject("price socket closed");
      return Promise.resolve({ data: { ok: true }, error: null });
    });
    renderAdminPricing([baseRow()]);
    await screen.findByDisplayValue("Agent Pro");

    fireEvent.click(screen.getByRole("button", { name: /Sync to Stripe/i }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("Stripe sync failed"));
    expect(syncCalls).toBe(1);

    fireEvent.click(screen.getByRole("button", { name: "Create Stripe price" }));
    await waitFor(() => expect(mocks.toastMock.error).toHaveBeenCalledWith("Failed to create Stripe price"));
  });

  it("normalizes empty numeric fields, null descriptions, and null metadata before save", async () => {
    const row = baseRow({ description: null, metadata: null });
    const { client } = renderAdminPricing([row]);
    client.setQueryData(["admin-pricing-configs"], [row]);
    await screen.findByDisplayValue("Agent Pro");

    const rowElement = screen.getByDisplayValue("Agent Pro").closest("tr")!;
    fireEvent.change(within(rowElement).getByDisplayValue("149"), { target: { value: "" } });
    fireEvent.change(within(rowElement).getByDisplayValue("2"), { target: { value: "" } });
    fireEvent.change(within(rowElement).getByLabelText("Monthly Stripe price ID"), { target: { value: "price_new" } });
    fireEvent.click(screen.getByRole("button", { name: /^Save all$/i }));

    await waitFor(() => expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith(
      "admin-pricing-config",
      expect.objectContaining({
        body: expect.objectContaining({
          rows: expect.arrayContaining([
            expect.objectContaining({
              amount: 0,
              sort_order: 0,
              description: null,
              metadata: expect.objectContaining({ stripe_price_id_monthly: "price_new" }),
            }),
          ]),
        }),
      }),
    ));
  });

  it("renders pending controls while pricing writes and Stripe syncs are in flight", async () => {
    const resolvers: Array<(value: { data: Record<string, unknown>; error: null }) => void> = [];
    mocks.supabase?.functions.invoke.mockImplementation((name: string) => {
      if (["admin-pricing-config", "sync-stripe-pricing"].includes(name)) {
        return new Promise((resolve) => resolvers.push(resolve));
      }
      return Promise.resolve({ data: {}, error: null });
    });
    renderAdminPricing([baseRow()]);
    await screen.findByDisplayValue("Agent Pro");

    const save = screen.getByRole("button", { name: /^Save all$/i });
    fireEvent.click(save);
    await waitFor(() => expect(save).toBeDisabled());
    resolvers.shift()!({ data: { ok: true }, error: null });
    await waitFor(() => expect(save).toBeEnabled());

    const sync = screen.getByRole("button", { name: /Sync to Stripe/i });
    fireEvent.click(sync);
    await waitFor(() => expect(sync).toBeDisabled());
    resolvers.shift()!({ data: { summary: {}, results: [] }, error: null });
    await waitFor(() => expect(sync).toBeEnabled());
  });
});
