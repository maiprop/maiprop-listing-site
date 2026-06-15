import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it, vi, beforeEach } from "vitest";
import BillingTab from "@/pages/dashboard/BillingTab";
import { renderWithProviders } from "@/test/utils";
import { toast } from "sonner";

const mocks = vi.hoisted(() => ({
  supabase: null as ReturnType<typeof import("@/test/utils").makeMockSupabase> | null,
}));

vi.mock("@/integrations/supabase/client", async () => {
  const { makeMockSupabase } = await vi.importActual<typeof import("@/test/utils")>("@/test/utils");
  mocks.supabase = makeMockSupabase();
  return { supabase: mocks.supabase };
});

vi.mock("@/hooks/useSubscription", () => ({
  useSubscription: vi.fn(() => ({
    isPro: true,
    subscriptionEnd: null,
    loading: false,
    accessSource: "stripe",
    hasStripeBilling: true,
    isInvestorManagedPlan: false,
    isManuallyManagedPlan: false,
  })),
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
  },
}));

describe("BillingTab add-on checkout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authState.profile.role = "seller";
    authState.profile.participant_type = "seller";
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
      const query = {
        select: vi.fn(() => query),
        eq: vi.fn(() => query),
        gte: vi.fn(() => Promise.resolve({ data: rowsByTable[table] ?? [], error: null })),
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

  it("shows seller-relevant add-ons and starts Stripe checkout for the selected add-on key", async () => {
    renderWithProviders(<BillingTab />);

    const featuredCard = (await screen.findByText("Featured Listing")).closest("div");
    expect(featuredCard).not.toBeNull();
    fireEvent.click(within(featuredCard as HTMLElement).getByRole("button", { name: /Buy add-on/i }));

    await waitFor(() => {
      expect(mocks.supabase?.functions.invoke).toHaveBeenCalledWith("create-checkout", {
        body: {
          addon_key: "featured_listing",
          success_url: "/dashboard/billing?checkout=success",
          cancel_url: "/dashboard/billing?checkout=cancelled",
        },
      });
    });

    expect(screen.queryByText("Extra Agent Seat")).not.toBeInTheDocument();
    expect(screen.queryByText("API Access")).not.toBeInTheDocument();
  });

  it("shows unified AI/report consumption and wires usage add-ons to Stripe", async () => {
    renderWithProviders(<BillingTab />);

    const panel = await screen.findByRole("region", { name: /monthly ai and report usage/i });
    expect(within(panel).getByText("AI valuations")).toBeInTheDocument();
    expect(within(panel).getByText("48 / 50")).toBeInTheDocument();
    expect(within(panel).getByText("Neighbourhood reports")).toBeInTheDocument();
    expect(within(panel).getByText("50 / 50")).toBeInTheDocument();
    expect(within(panel).getByText("Nearby places / POIs")).toBeInTheDocument();
    expect(within(panel).getByText("Property reports")).toBeInTheDocument();
    await waitFor(() => expect(within(panel).getByText("2 / 3")).toBeInTheDocument());
    expect(within(panel).getByText("Priority ads / boosts")).toBeInTheDocument();
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
      });
    });
  });

  it("keeps developer Market Intelligence as a team-handled add-on", async () => {
    authState.profile.role = "developer";
    authState.profile.participant_type = "developer";

    renderWithProviders(<BillingTab />);

    fireEvent.click(await screen.findByRole("button", { name: /Contact team/i }));

    expect(toast.info).toHaveBeenCalledWith("This add-on is handled by the maiProp team.");
    expect(mocks.supabase?.functions.invoke).not.toHaveBeenCalledWith(
      "create-checkout",
      expect.objectContaining({
        body: expect.objectContaining({ addon_key: "market_intelligence" }),
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
});
