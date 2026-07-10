import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BillingTab from "@/pages/dashboard/BillingTab";
import { createTestQueryClient, renderWithProviders } from "@/test/utils";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof import("@/test/utils").makeMockSupabase> | null,
  subscription: {
    isPro: true,
    subscriptionEnd: null as string | null,
    loading: false,
    accessSource: "stripe",
    hasStripeBilling: true,
    isInvestorManagedPlan: false,
    isManuallyManagedPlan: false,
  },
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { makeMockSupabase } = await vi.importActual<typeof import("@/test/utils")>("@/test/utils");
  mocks.supabase = makeMockSupabase();
  return { supabase: mocks.supabase };
});

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn(() => mocks.subscription),
}));

const authState = {
  user: {
    id: "user-1",
  },
  profile: {
    role: "seller",
    participant_type: "seller",
  },
};

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => authState,
}));

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    info: vi.fn(),
    success: vi.fn(),
  },
}));

describe("BillingTab add-on checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.profile.role = "seller";
    authState.profile.participant_type = "seller";
    Object.assign(mocks.subscription, {
      isPro: true,
      subscriptionEnd: null,
      loading: false,
      accessSource: "stripe",
      hasStripeBilling: true,
      isInvestorManagedPlan: false,
      isManuallyManagedPlan: false,
    });
    mocks.supabase?.rpc.mockImplementation((_fn: string, args?: { p_bucket?: string }) => {
      const quotas: Record<string, { used: number; limit: number }> = {
        "property-valuation": { used: 48, limit: 50 },
        "neighbourhood-report": { used: 50, limit: 50 },
        "property-pois": { used: 12, limit: 50 },
      };
      const quota = quotas[args?.p_bucket ?? ""] ?? { used: 0, limit: 0 };
      return Promise.resolve({
        data: {
          allowed: quota.used < quota.limit,
          reason: quota.used >= quota.limit ? "monthly_limit_reached" : null,
          used: quota.used,
          limit: quota.limit,
          remaining: Math.max(quota.limit - quota.used, 0),
        },
        error: null,
      });
    });
    mocks.supabase?.from.mockImplementation((table: string) => {
      const rowsByTable: Record<string, Array<{ id: string }>> = {
        usage_property_reports: [{ id: "report-1" }, { id: "report-2" }],
        usage_priority_ads: Array.from({ length: 10 }, (_, i) => ({ id: `boost-${i}` })),
      };
      const addonRows = [
        { credits_granted: 1, credits_consumed: 0 },
      ];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        gte: vi.fn(() => Promise.resolve({ data: rowsByTable[table] ?? [], error: null })),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          _reject?: (reason?: unknown) => unknown,
        ) => resolve({ data: table === "addon_purchases" ? addonRows : rowsByTable[table] ?? [], error: null }),
      };
      return query;
    });
    mocks.supabase?.functions.invoke.mockImplementation((fn: string, opts?: { body?: { bucket?: string; buckets?: string[] } }) => {
      if (fn === "ai-quota-status") {
        const quotas: Record<string, { used: number; limit: number }> = {
          "property-valuation": { used: 48, limit: 50 },
          "neighbourhood-report": { used: 50, limit: 50 },
          "property-pois": { used: 12, limit: 50 },
        };
        if (Array.isArray(opts?.body?.buckets)) {
          return Promise.resolve({
            data: {
              quotas: Object.fromEntries(
                opts.body.buckets.map((bucket) => {
                  const quota = quotas[bucket] ?? { used: 0, limit: 0 };
                  return [
                    bucket,
                    {
                      allowed: quota.used < quota.limit,
                      reason: quota.used >= quota.limit ? "monthly_limit_reached" : null,
                      used: quota.used,
                      limit: quota.limit,
                      remaining: Math.max(quota.limit - quota.used, 0),
                    },
                  ];
                }),
              ),
            },
            error: null,
          });
        }
        const quota = quotas[opts?.body?.bucket ?? ""] ?? { used: 0, limit: 0 };
        return Promise.resolve({
          data: {
            allowed: quota.used < quota.limit,
            reason: quota.used >= quota.limit ? "monthly_limit_reached" : null,
            used: quota.used,
            limit: quota.limit,
            remaining: Math.max(quota.limit - quota.used, 0),
          },
          error: null,
        });
      }
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: null,
          },
          error: null,
        });
      }
      if (fn === "create-checkout") {
        return Promise.resolve({
          data: { url: "#stripe-checkout-session" },
          error: null,
        });
      }
      return Promise.resolve({ data: null, error: null });
    });
  });

  it("shows seller-relevant add-ons and starts Stripe checkout only for fulfilled report add-ons", async () => {
    renderWithProviders(<BillingTab />);

    const spotlightCard = (await screen.findByText("Spotlight Listing")).closest("div");
    expect(spotlightCard).not.toBeNull();
    expect(within(spotlightCard as HTMLElement).getByText("Badge + featured sections. Visual promotion only."))
      .toBeInTheDocument();
    expect(within(spotlightCard as HTMLElement).getByRole("link", { name: /Contact team/i }))
      .toHaveAttribute("href", expect.stringContaining("mailto:support@maiprop.co"));
    expect(screen.getByText("Priority Rank")).toBeInTheDocument();
    expect(screen.getByText("Maximum Exposure")).toBeInTheDocument();

    const propertyReportCard = (await screen.findByText("Property Report")).closest("div");
    expect(propertyReportCard).not.toBeNull();
    fireEvent.click(within(propertyReportCard as HTMLElement).getByRole("button", { name: /Buy add-on/i }));

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "property_report_single",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
        timeout: 20_000,
      });
    });

    expect(screen.queryByText("Extra Agent Seat")).not.toBeInTheDocument();
    expect(screen.queryByText("API Access")).not.toBeInTheDocument();
  });

  it("starts subscription checkout from the internal Billing tab upgrade action", async () => {
    Object.assign(mocks.subscription, {
      isPro: false,
      hasStripeBilling: false,
      accessSource: null,
    });

    renderWithProviders(<BillingTab />);

    const upgradeButtons = await screen.findAllByRole("button", {
      name: /^Upgrade$/i,
    });
    fireEvent.click(upgradeButtons[0]);

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          plan: "pro",
          billing_cycle: "monthly",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
        timeout: 20_000,
      });
    });
  });

  it("labels active trials by their trial end date in billing", async () => {
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: {
              id: "sub_trialing",
              status: "trialing",
              current_period_end: "2026-07-07T06:04:38.000Z",
              cancel_at_period_end: false,
              plan_name: "Pro Plan",
              amount: 29,
              currency: "EUR",
              interval: "month",
              plan_key: "pro",
            },
          },
          error: null,
        });
      }
      if (fn === "ai-quota-status") {
        return Promise.resolve({ data: { quotas: {} }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);

    expect(await screen.findByText("Trial ends on")).toBeInTheDocument();
    expect(screen.getByText(/2026/)).toBeInTheDocument();
  });

  it("labels annual subscriptions safely and surfaces no-expiry refunded credit state", async () => {
    mocks.supabase?.from.mockImplementation((table: string) => {
      const addonRows = [
        {
          id: "addon-refunded",
          addon_key: "property_report_single",
          status: "refunded",
          credits_granted: 1,
          credits_consumed: 1,
          credits_refunded: 1,
          refund_status: "refunded",
          created_at: "2026-07-01T10:00:00.000Z",
        },
      ];
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        order: vi.fn(() => Promise.resolve({ data: addonRows, error: null })),
        gte: vi.fn(() => Promise.resolve({ data: [], error: null })),
        then: (
          resolve: (value: { data: unknown[]; error: null }) => unknown,
          _reject?: (reason?: unknown) => unknown,
        ) => resolve({ data: table === "addon_purchases" ? addonRows : [], error: null }),
      };
      return query;
    });
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: {
              id: "sub_annual",
              status: "active",
              current_period_end: "2027-07-07T06:04:38.000Z",
              cancel_at_period_end: false,
              plan_name: "Pro Plan",
              amount: 29000,
              currency: "eur",
              interval: "year",
              plan_key: "pro",
            },
          },
          error: null,
        });
      }
      if (fn === "ai-quota-status") {
        return Promise.resolve({ data: { quotas: {} }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);

    expect(await screen.findByText("Subscription price")).toBeInTheDocument();
    expect(screen.queryByText("Monthly price")).not.toBeInTheDocument();
    expect(screen.getByText("/year")).toBeInTheDocument();
    expect(await screen.findByText("Add-on credits")).toBeInTheDocument();
    expect(screen.getByText("No expiry")).toBeInTheDocument();
    expect(screen.getByText(/Refund adjustment/i)).toBeInTheDocument();
    expect(screen.getByText(/1 credit owed/i)).toBeInTheDocument();
  });

  it("shows unified AI/report consumption and wires usage add-ons to Stripe", async () => {
    renderWithProviders(<BillingTab />);

    const panel = await screen.findByRole("region", { name: /monthly ai and report usage/i });
    expect(within(panel).getByText("AI, reports & promotions")).toBeInTheDocument();
    expect(within(panel).getByText("AI valuations")).toBeInTheDocument();
    expect(within(panel).getByText("48 / 50")).toBeInTheDocument();
    expect(within(panel).getByText("Neighbourhood reports")).toBeInTheDocument();
    expect(within(panel).getByText("50 / 50")).toBeInTheDocument();
    expect(within(panel).getByRole("button", { name: /Buy Neighbourhood reports add-on/i }))
      .toHaveTextContent("Top up");
    expect(within(panel).getByText("Nearby places / POIs")).toBeInTheDocument();
    expect(within(panel).getByText("Property reports")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByText("2 / 4")).toBeInTheDocument());
    expect(within(panel).getByText("Listing promotions")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByText("10 / 10")).toBeInTheDocument());
    await waitFor(() => {
      const quotaCalls = mocks.supabase?.functions.invoke.mock.calls.filter(
        ([fn]) => fn === "ai-quota-status",
      ) ?? [];
      expect(quotaCalls).toHaveLength(1);
      expect(quotaCalls[0][1]).toEqual(
        expect.objectContaining({
          body: {
            buckets: ["property-valuation", "neighbourhood-report", "property-pois"],
          },
        }),
      );
    });

    fireEvent.click(within(panel).getByRole("button", { name: /Buy Neighbourhood reports add-on/i }));

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "neighbourhood_report_single",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
        timeout: 20_000,
      });
    });
  });

  it("offers free users both upgrade and top-up when a monthly add-on-backed quota is consumed", async () => {
    Object.assign(mocks.subscription, {
      isPro: false,
      hasStripeBilling: false,
      accessSource: null,
    });

    renderWithProviders(<BillingTab />);

    const panel = await screen.findByRole("region", { name: /monthly ai and report usage/i });
    const neighbourhoodTopUp = within(panel).getByRole("button", {
      name: /Buy Neighbourhood reports add-on/i,
    });

    expect(within(panel).getAllByRole("button", { name: /^Upgrade$/i }).length).toBeGreaterThan(0);
    expect(neighbourhoodTopUp).toHaveTextContent("Top up");

    fireEvent.click(neighbourhoodTopUp);

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "neighbourhood_report_single",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
        timeout: 20_000,
      });
    });
  });

  it("keeps developer Market Intelligence as a team-handled add-on", async () => {
    authState.profile.role = "developer";
    authState.profile.participant_type = "developer";

    renderWithProviders(<BillingTab />);

    const marketIntelligenceTitle = (await screen.findAllByText("Market Intelligence")).find(
      (element) => element.tagName.toLowerCase() === "p",
    );
    const marketIntelligenceCard = marketIntelligenceTitle?.closest("div");
    expect(marketIntelligenceCard).not.toBeNull();
    expect(
      within(marketIntelligenceCard as HTMLElement).getByRole("link", {
        name: /Contact team/i,
      }),
    ).toHaveAttribute("href", expect.stringContaining("mailto:support@maiprop.co"));

    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({ addon_key: "market_intelligence" }),
      }),
    );
  });

  it("makes agency add-on contact buttons functional without starting checkout", async () => {
    authState.profile.role = "agent";
    authState.profile.participant_type = "agent";

    renderWithProviders(<BillingTab />);

    const extraSeatCard = (await screen.findByText("Extra Agent Seat")).closest("div");
    expect(extraSeatCard).not.toBeNull();

    expect(
      within(extraSeatCard as HTMLElement).getByRole("link", {
        name: /Contact team/i,
      }),
    ).toHaveAttribute("href", expect.stringContaining("mailto:support@maiprop.co"));

    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({ addon_key: "agent_extra_seat" }),
      }),
    );
  });

  it("discloses mock add-on checkout success without implying entitlement", async () => {
    renderWithProviders(<BillingTab />, {
      initialPath: "/dashboard/billing?checkout=success&billing_mode=mock",
    });

    await waitFor(() => {
      expect(toast.info).toHaveBeenCalledWith(
        "Mock add-on checkout completed. No live payment or add-on entitlement was created.",
      );
    });
  });

  it("refreshes billing and usage state after a successful checkout return", async () => {
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithProviders(<BillingTab />, {
      initialPath: "/dashboard/billing?checkout=success",
      queryClient,
    });

    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["billing-info"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["addon_purchases"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["usage_property_reports"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["usage_priority_ads"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["usage_ai_calls"] });
    });
  });

  it("shows VAT amount and VAT ID from Stripe invoice tax details", async () => {
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [{
              id: "in_taxed",
              number: "INV-2026-001",
              status: "paid",
              amount_paid: 35.96,
              tax_amount: 6.96,
              currency: "EUR",
              created: "2026-06-29T10:00:00.000Z",
              period_start: null,
              period_end: null,
              hosted_invoice_url: "https://billing.stripe.com/invoice/test",
              invoice_pdf: "https://pay.stripe.com/invoice/test.pdf",
              receipt_url: "https://pay.stripe.com/receipts/test",
              description: "Participant Pro",
              automatic_tax: { enabled: true, status: "complete" },
              customer_tax_exempt: "none",
              customer_tax_ids: [{
                id: "txi_123",
                type: "eu_vat",
                value: "EL123456789",
              }],
              taxes: [],
            }],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: null,
          },
          error: null,
        });
      }
      if (fn === "ai-quota-status") {
        return Promise.resolve({ data: { quotas: {} }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);

    expect(await screen.findByText("INV-2026-001")).toBeInTheDocument();
    expect(screen.getByText(/VAT\/tax/)).toBeInTheDocument();
    expect(screen.getByText(/VAT ID EL123456789/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Receipt/i })).toHaveAttribute(
      "href",
      "https://pay.stripe.com/receipts/test",
    );
  });

  it("surfaces past-due subscriptions with an update-card portal action", async () => {
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: {
              id: "sub_past_due",
              status: "past_due",
              current_period_end: null,
              cancel_at_period_end: false,
              plan_name: "Agent Pro",
              amount: 14900,
              currency: "eur",
              interval: "month",
            },
          },
          error: null,
        });
      }
      if (fn === "customer-portal") {
        return Promise.resolve({ data: { url: "#stripe-card" }, error: null });
      }
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);

    expect(await screen.findByText("Payment needs attention")).toBeInTheDocument();
    fireEvent.click(screen.getAllByRole("button", { name: /update card/i })[0]);

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("customer-portal", {
        body: {
          action: "payment_method_update",
          subscription_id: "sub_past_due",
        },
        timeout: 20_000,
      });
    });
  });
});
