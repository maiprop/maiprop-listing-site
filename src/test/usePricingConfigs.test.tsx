import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  from: vi.fn(),
}));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => mocks.from(...args) },
}));

import { usePricingConfigs } from "@/hooks/usePricingConfigs";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

describe("usePricingConfigs", () => {
  it("maps active monthly and annual Stripe catalog amounts for shared UI pricing", async () => {
    const eq = vi.fn().mockResolvedValue({
      data: [{
        key: "agent_basic",
        label: "Agent Pro",
        description: "Agent plan",
        amount: 175,
        currency: "eur",
        unit: "monthly",
        metadata: {
          stripe_price_id: "price_monthly",
          stripe_product_id: "prod_agent",
          stripe_last_amount_annual: "1650",
        },
      }],
      error: null,
    });
    const select = vi.fn().mockReturnValue({ eq });
    mocks.from.mockReturnValue({ select });

    const result = renderHook(() => usePricingConfigs(), { wrapper });

    await waitFor(() => expect(result.result.current.isSuccess).toBe(true));
    expect(result.result.current.data?.agent_basic).toMatchObject({
      amount: 175,
      annualAmount: 1_650,
      currency: "eur",
      stripePriceId: "price_monthly",
      stripeProductId: "prod_agent",
    });
    expect(mocks.from).toHaveBeenCalledWith("pricing_configs");
    expect(eq).toHaveBeenCalledWith("is_active", true);
  });
});
