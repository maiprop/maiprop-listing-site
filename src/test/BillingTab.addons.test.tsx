import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BillingTab from "@/pages/dashboard/BillingTab";
import { createTestQueryClient, renderWithProviders } from "@/test/utils";
import { toast } from "sonner";
import { useLocation } from "react-router-dom";

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
    refreshSubscription: vi.fn().mockResolvedValue(undefined),
  },
  pricingConfigs: {} as Record<
    string,
    {
      amount: number;
      annualAmount?: number;
      currency: string;
      label: string;
      description: null;
      unit: string;
    }
  >,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { makeMockSupabase } = await vi.importActual<typeof import("@/test/utils")>("@/test/utils");
  mocks.supabase = makeMockSupabase();
  return { supabase: mocks.supabase };
});

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn(() => mocks.subscription),
}));

vi.mock("@/hooks/usePricingConfigs", () => ({
  usePricingConfigs: () => ({ data: mocks.pricingConfigs }),
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

const LocationProbe = () => {
  const location = useLocation();
  return <output data-testid="location-probe">{location.pathname}{location.search}</output>;
};

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
      refreshSubscription: vi.fn().mockResolvedValue(undefined),
    });
    mocks.pricingConfigs = {};
    mocks.supabase?.rpc.mockImplementation((fn: string, args?: { p_bucket?: string }) => {
      if (fn === "get_listing_promotion_balance") {
        return Promise.resolve({
          data: {
            cycle_start: "2026-07-01",
            spotlight: { included: 1, used: 1, remaining: 0, addons: 0 },
            priority: { included: 0, used: 0, remaining: 0, addons: 0 },
            bundles: { addons: 0 },
          },
          error: null,
        });
      }
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
        listing_promotion_allocations: Array.from({ length: 10 }, (_, i) => ({ id: `boost-${i}` })),
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

  it("shows seller-relevant add-ons and makes delivered promotions self-serve", async () => {
    renderWithProviders(<BillingTab />);

    const featuredCard = (await screen.findByText("Spotlight")).closest("div");
    expect(featuredCard).not.toBeNull();
    expect(within(featuredCard as HTMLElement).getByText("Badge + featured sections. Visual promotion only."))
      .toBeInTheDocument();
    fireEvent.click(
      within(featuredCard as HTMLElement).getByRole("button", {
        name: /Buy Spotlight add-on/i,
      }),
    );
    expect(screen.getByText("Priority Rank")).toBeInTheDocument();
    expect(screen.getByText("Spotlight + Priority Rank")).toBeInTheDocument();

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "featured_listing",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
        timeout: 20_000,
      });
    });

    expect(screen.queryByText("Extra Agent Seat")).not.toBeInTheDocument();
    expect(screen.queryByText("API Access")).not.toBeInTheDocument();
  });

  it("renders add-on prices from active pricing configuration", async () => {
    mocks.pricingConfigs = {
      featured_listing: {
        amount: 45,
        currency: "EUR",
        label: "Spotlight",
        description: null,
        unit: "per_listing",
      },
      priority_placement: {
        amount: 65,
        currency: "EUR",
        label: "Priority Rank",
        description: null,
        unit: "per_listing",
      },
      featured_priority_bundle: {
        amount: 88,
        currency: "EUR",
        label: "Spotlight + Priority Rank",
        description: null,
        unit: "per_listing",
      },
      property_report_single: {
        amount: 55,
        currency: "EUR",
        label: "Property Report",
        description: null,
        unit: "per_report",
      },
    };

    renderWithProviders(<BillingTab />);

    expect(await screen.findByText("€45")).toBeInTheDocument();
    expect(screen.getByText(/Extra reports cost EUR 55 each/i))
      .toBeInTheDocument();
    expect(screen.getByText(/Add-on EUR 45\/30 days/i)).toBeInTheDocument();
    expect(
      screen.getByText(/Priority add-on EUR 65\/30 days; bundle EUR 88\/30 days/i),
    ).toBeInTheDocument();
  });

  it("renders config-backed contact-sales prices without enabling self-serve checkout", async () => {
    authState.profile.role = "agent";
    authState.profile.participant_type = "agent";
    mocks.pricingConfigs = {
      agent_extra_seat: {
        amount: 44,
        currency: "EUR",
        label: "Extra Agent Seat",
        description: null,
        unit: "monthly",
      },
    };

    renderWithProviders(<BillingTab />);

    const extraSeatCard = (await screen.findByText("Extra Agent Seat")).closest(
      "div",
    );
    expect(extraSeatCard).not.toBeNull();
    expect(within(extraSeatCard as HTMLElement).getByText("€44"))
      .toBeInTheDocument();
    expect(
      within(extraSeatCard as HTMLElement).getByRole("link", {
        name: /Contact team/i,
      }),
    ).toBeInTheDocument();
    expect(
      within(extraSeatCard as HTMLElement).queryByRole("button", {
        name: /Buy Extra Agent Seat/i,
      }),
    ).not.toBeInTheDocument();
  });

  it("renders monthly and annual subscription prices from active pricing configuration", async () => {
    Object.assign(mocks.subscription, {
      isPro: false,
      hasStripeBilling: false,
      accessSource: null,
    });
    authState.profile.role = "agent";
    authState.profile.participant_type = "agent";
    mocks.pricingConfigs = {
      agent_basic: {
        amount: 175,
        annualAmount: 1_650,
        currency: "EUR",
        label: "Agent Pro",
        description: null,
        unit: "monthly",
      },
    };

    renderWithProviders(<BillingTab />);

    expect(await screen.findByRole("button", { name: /175[.,]00\s*€\/mo/i }))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: /1[.,]650[.,]00\s*€\/yr/i }))
      .toBeInTheDocument();
  });

  it("does not sell redundant report credits or unfulfilled priority ads to B2B Pro users", async () => {
    authState.profile.role = "professional";
    authState.profile.participant_type = "professional";

    renderWithProviders(<BillingTab />);

    expect(await screen.findByText("Spotlight Professional")).toBeInTheDocument();
    expect(screen.queryByText("Property Report")).not.toBeInTheDocument();
    expect(screen.queryByText("Extra Priority Rank Ad")).not.toBeInTheDocument();
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
    expect(within(panel).getByText("Spotlight credits")).toBeInTheDocument();
    expect(within(panel).getByText("Priority credits")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByText("1 / 1")).toBeInTheDocument());
    expect(within(panel).getByText(/Add-on EUR 39\/30 days/)).toBeInTheDocument();
    expect(within(panel).getByText(/Priority add-on EUR 59\/30 days/)).toBeInTheDocument();
    await waitFor(() => {
      const quotaCalls = mocks.supabase?.functions.invoke.mock.calls.filter(
        ([fn]) => fn === "ai-quota-status",
      ) ?? [];
      expect(quotaCalls).toHaveLength(1);
      expect(quotaCalls[0][1]).toEqual(
        expect.objectContaining({
          body: {
            buckets: expect.arrayContaining([
              "property-valuation",
              "neighbourhood-report",
              "property-pois",
            ]),
          },
          timeout: 4_000,
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

  it("shows paid business plans the unlimited report contract", async () => {
    authState.profile.role = "agent";
    authState.profile.participant_type = "agent";

    renderWithProviders(<BillingTab />);

    const panel = await screen.findByRole("region", { name: /monthly ai and report usage/i });
    const reportRow = within(panel).getByText("Property reports").closest(".rounded-xl");
    expect(reportRow).not.toBeNull();
    await waitFor(() => {
      expect(within(reportRow as HTMLElement).getByText("2 used")).toBeInTheDocument();
    });
    expect(within(reportRow as HTMLElement).getByText("Unlimited with your plan")).toBeInTheDocument();
    expect(within(reportRow as HTMLElement).queryByRole("button", { name: /report/i })).not.toBeInTheDocument();
  });

  it("renders admin AI usage as unlimited without purchase actions", async () => {
    authState.profile.role = "admin";
    authState.profile.participant_type = "admin";

    renderWithProviders(<BillingTab />);

    const panel = await screen.findByRole("region", { name: /monthly ai and report usage/i });
    for (const label of ["AI valuations", "Neighbourhood reports", "Nearby places / POIs"]) {
      const row = within(panel).getByText(label).closest(".rounded-xl");
      expect(row).not.toBeNull();
      expect(within(row as HTMLElement).getByText("Unlimited")).toBeInTheDocument();
      expect(within(row as HTMLElement).getByText("Unlimited with your plan")).toBeInTheDocument();
    }

    expect(within(panel).queryByRole("button", { name: /buy|top up/i })).not.toBeInTheDocument();
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

  it("offers self-serve Spotlight and Priority top-ups from monthly usage", async () => {
    renderWithProviders(<BillingTab />);

    const panel = await screen.findByRole("region", { name: /monthly ai and report usage/i });
    const buySpotlight = within(panel).getByRole("button", { name: "Buy Spotlight" });
    expect(within(panel).getByRole("button", { name: "Buy Priority" })).toBeInTheDocument();
    expect(within(panel).queryByRole("link", { name: /Contact team/i })).not.toBeInTheDocument();

    fireEvent.click(buySpotlight);
    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "featured_listing",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
        timeout: 20_000,
      });
    });
  });

  it("lets developers buy the Spotlight and Priority promotion bundle", async () => {
    authState.profile.role = "developer";
    authState.profile.participant_type = "developer";

    renderWithProviders(<BillingTab />);

    const bundleCard = (await screen.findByText("Spotlight + Priority Rank")).closest("div");
    expect(bundleCard).not.toBeNull();
    expect(within(bundleCard as HTMLElement).getByText("€79")).toBeInTheDocument();
    expect(within(bundleCard as HTMLElement).getByText("/ 30 days")).toBeInTheDocument();
    fireEvent.click(
      within(bundleCard as HTMLElement).getByRole("button", {
        name: /Buy Spotlight \+ Priority Rank add-on/i,
      }),
    );

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith(
        "create-checkout",
        {
          body: {
            addon_key: "featured_priority_bundle",
            success_url: "/dashboard/billing?checkout=success",
            cancel_url: "/dashboard/billing?checkout=cancelled",
          },
          timeout: 20_000,
        },
      );
    });
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
      expect(mocks.subscription.refreshSubscription).toHaveBeenCalledTimes(1);
      expect(
        mocks.supabase?.functions.invoke.mock.calls.filter(([name]) => name === "get-invoices"),
      ).not.toHaveLength(0);
      expect(
        mocks.supabase?.functions.invoke.mock.calls.filter(([name]) => name === "ai-quota-status"),
      ).toHaveLength(2);
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["addon_purchases"] });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["usage_property_reports"] });
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: ["listing_promotion_allocations", "priority-plan-usage"],
      });
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["listing-promotion-balance"] });
    });
  });

  it("reconciles the exact Stripe session on a successful billing return", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    renderWithProviders(<BillingTab />, {
      initialPath: "/dashboard/billing?checkout=success&session_id=cs_test_billing_return",
    });

    try {
      await waitFor(() => {
        expect(mocks.subscription.refreshSubscription).toHaveBeenCalledWith(
          "cs_test_billing_return",
        );
      });
      await vi.advanceTimersByTimeAsync(2_500);
      expect(mocks.subscription.refreshSubscription).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes checkout-derived usage only after exact reconciliation completes", async () => {
    let finishReconciliation!: () => void;
    mocks.subscription.refreshSubscription = vi.fn(() => new Promise<void>((resolve) => {
      finishReconciliation = resolve;
    }));
    const queryClient = createTestQueryClient();
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    renderWithProviders(<BillingTab />, {
      initialPath: "/dashboard/billing?checkout=success&session_id=cs_test_ordered_return",
      queryClient,
    });
    await waitFor(() => {
      expect(mocks.subscription.refreshSubscription).toHaveBeenCalledWith(
        "cs_test_ordered_return",
      );
    });
    expect(invalidateSpy).not.toHaveBeenCalledWith({ queryKey: ["addon_purchases"] });

    finishReconciliation();
    await waitFor(() => {
      expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ["addon_purchases"] });
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

  it("uses annual role pricing for a Free subscription checkout", async () => {
    Object.assign(mocks.subscription, {
      isPro: false,
      hasStripeBilling: false,
      accessSource: null,
    });

    renderWithProviders(<BillingTab />);
    fireEvent.click(await screen.findByRole("button", { name: /290.*yr/i }));
    fireEvent.click(screen.getByRole("button", { name: /Get Pro Plan/i }));

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          plan: "pro",
          billing_cycle: "annual",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
        timeout: 20_000,
      });
    });
  });

  it.each([
    ["investor", "/investor-dashboard"],
    ["institutional", "/contact"],
  ] as const)("routes the %s invite-only upgrade without creating a public checkout", async (role, route) => {
    authState.profile.role = role;
    authState.profile.participant_type = role;
    Object.assign(mocks.subscription, {
      isPro: false,
      hasStripeBilling: false,
      accessSource: null,
    });

    renderWithProviders(
      <>
        <BillingTab />
        <LocationProbe />
      </>,
    );
    fireEvent.click((await screen.findAllByRole("button", { name: /^Upgrade$/i }))[0]);

    expect(screen.getByTestId("location-probe")).toHaveTextContent(route);
    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "create-checkout",
      expect.anything(),
    );
    expect(screen.getByText("Invitation-only access")).toBeInTheDocument();
  });

  it("resumes a scheduled cancellation without redirecting to the portal", async () => {
    const getInvoices = vi.fn().mockResolvedValue({
      data: {
        invoices: [],
        billing_configured: true,
        customer_found: true,
        portal_eligible: true,
        subscription: {
          id: "sub_resume",
          status: "active",
          current_period_end: "2026-08-01T00:00:00.000Z",
          cancel_at_period_end: true,
          plan_name: "Pro Plan",
          amount: 29,
          currency: "EUR",
          interval: "month",
        },
      },
      error: null,
    });
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") return getInvoices();
      if (fn === "customer-portal") return Promise.resolve({ data: { resumed: true }, error: null });
      if (fn === "ai-quota-status") return Promise.resolve({ data: { quotas: {} }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);
    fireEvent.click(await screen.findByRole("button", { name: /Resume plan/i }));

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("customer-portal", {
        body: {
          action: "resume_subscription",
          subscription_id: "sub_resume",
          operation_id: expect.stringMatching(
            /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
          ),
        },
        timeout: 20_000,
      });
      expect(toast.success).toHaveBeenCalledWith("Your subscription renewal has been resumed.");
    });
    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "customer-portal",
      expect.objectContaining({ body: expect.objectContaining({ action: "manage" }) }),
    );
  });

  it("blocks a subscription action while the Stripe subscription id is unavailable", async () => {
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
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
      if (fn === "ai-quota-status") return Promise.resolve({ data: { quotas: {} }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);
    await screen.findByText(/No invoices yet/i);
    fireEvent.click(await screen.findByRole("button", { name: /Change plan/i }));

    expect(toast.info).toHaveBeenCalledWith("Subscription details are still loading.");
    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "customer-portal",
      expect.anything(),
    );
  });

  it("surfaces portal and subscription checkout failures without leaving billing", async () => {
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: {
              id: "sub_error",
              status: "active",
              current_period_end: null,
              cancel_at_period_end: false,
              plan_name: "Pro Plan",
              amount: null,
              currency: "EUR",
              interval: "month",
            },
          },
          error: null,
        });
      }
      if (fn === "customer-portal") {
        return Promise.resolve({ data: { error: "Portal session failed" }, error: null });
      }
      if (fn === "ai-quota-status") return Promise.resolve({ data: { quotas: {} }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    const { unmount } = renderWithProviders(<BillingTab />);
    await screen.findByText(/No invoices yet/i);
    const currentPlanCard = (await screen.findByText("Current plan")).closest(".glass-card");
    expect(currentPlanCard).not.toBeNull();
    fireEvent.click(within(currentPlanCard as HTMLElement).getByRole("button", { name: /Manage billing/i }));
    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("customer-portal", {
        body: { action: "manage", subscription_id: "sub_error" },
        timeout: 20_000,
      });
    });
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Portal session failed"));
    unmount();

    vi.clearAllMocks();
    Object.assign(mocks.subscription, {
      isPro: false,
      hasStripeBilling: false,
      accessSource: null,
    });
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: { invoices: [], customer_found: false, portal_eligible: false, subscription: null },
          error: null,
        });
      }
      if (fn === "create-checkout") {
        return Promise.resolve({ data: { error: "Plan checkout unavailable" }, error: null });
      }
      if (fn === "ai-quota-status") return Promise.resolve({ data: { quotas: {} }, error: null });
      return Promise.resolve({ data: null, error: null });
    });
    renderWithProviders(<BillingTab />);
    fireEvent.click((await screen.findAllByRole("button", { name: /^Upgrade$/i }))[0]);
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Plan checkout unavailable"));
  });

  it("shows the live-fetch warning while preserving the profile access state", async () => {
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({ data: null, error: { message: "Stripe timed out" } });
      }
      if (fn === "ai-quota-status") return Promise.resolve({ data: { quotas: {} }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);

    expect(await screen.findByText(/Live billing details could not be fully refreshed/i)).toBeInTheDocument();
    expect(screen.getByText(/Pro access active/i)).toBeInTheDocument();
  });

  it("labels every paid credit type and renders invoice fallback details safely", async () => {
    const addonRows = [
      { id: "a-1", addon_key: "valuation_single", status: "paid", credits_granted: 1, credits_consumed: 0, credits_refunded: 0 },
      { id: "a-2", addon_key: "valuation_bundle", status: "active", credits_granted: 5, credits_consumed: 1, credits_refunded: 0 },
      { id: "a-3", addon_key: "neighbourhood_report_single", status: "paid", credits_granted: 1, credits_consumed: 0, credits_refunded: 0 },
      { id: "a-4", addon_key: "neighbourhood_report_bundle", status: "paid", credits_granted: 3, credits_consumed: 1, credits_refunded: 0 },
      { id: "a-5", addon_key: "custom_credit_pack", status: "paid", credits_granted: 2, credits_consumed: 0, credits_refunded: 0 },
      { id: "a-6", addon_key: "", status: "paid", credits_granted: 5, credits_consumed: 0, credits_refunded: 0 },
      { id: "a-7", addon_key: "featured_listing", status: "paid", credits_granted: 1, credits_consumed: 0, credits_refunded: 0 },
      { id: "a-8", addon_key: "priority_placement", status: "paid", credits_granted: 1, credits_consumed: 0, credits_refunded: 0 },
      { id: "a-9", addon_key: "featured_priority_bundle", status: "paid", credits_granted: 1, credits_consumed: 0, credits_refunded: 0 },
    ];
    mocks.supabase?.from.mockImplementation((table: string) => {
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        in: vi.fn(() => query),
        gte: vi.fn(() => Promise.resolve({ data: [], error: null })),
        then: (resolve: (value: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: table === "addon_purchases" ? addonRows : [], error: null }),
      };
      return query;
    });
    mocks.supabase?.functions.invoke.mockImplementation((fn: string) => {
      if (fn === "get-invoices") {
        return Promise.resolve({
          data: {
            invoices: [{
              id: "in_123456789",
              number: null,
              status: "open",
              amount_paid: 0,
              tax_amount: 0,
              currency: "EUR",
              created: "2026-07-01T00:00:00.000Z",
              period_start: "2026-07-01T00:00:00.000Z",
              period_end: "2026-08-01T00:00:00.000Z",
              description: "Pro renewal",
              hosted_invoice_url: null,
              invoice_pdf: null,
              receipt_url: null,
              customer_tax_ids: [{ id: "empty", type: "eu_vat", value: "" }],
            }],
            billing_configured: true,
            customer_found: true,
            portal_eligible: true,
            subscription: null,
          },
          error: null,
        });
      }
      if (fn === "ai-quota-status") return Promise.resolve({ data: { quotas: {} }, error: null });
      return Promise.resolve({ data: null, error: null });
    });

    renderWithProviders(<BillingTab />);

    await screen.findByText("custom credit pack");
    expect(screen.getAllByText("AI valuations").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Neighbourhood reports").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Spotlight").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Priority Rank").length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText("Spotlight + Priority Rank").length).toBeGreaterThanOrEqual(2);
    expect(screen.queryByText("Add-on credits")?.closest("div")?.textContent).not.toContain("5 credits available");
    expect(screen.getByText("23456789")).toBeInTheDocument();
    expect(screen.getByText(/Pro renewal/)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /View|PDF|Receipt/i })).not.toBeInTheDocument();
  });
});
