/**
 * useEligibleForQuickSale — eligibility for Quick Sale deal flow.
 * Eligibility = approved application (active investor_subscription).
 * Used by InvestorRoute and InvestorDashboard.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveQuickSaleEligibility } from "@/lib/quickSaleEntitlements";
import { getClientStripeRuntimeMode } from "@/lib/billingRuntime";

type InvestorSubscriptionGate = {
  status: string;
  expires_at: string | null;
};

export function useEligibleForQuickSale() {
  const { user, profile } = useAuth();
  const runtimeMode = getClientStripeRuntimeMode();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["quick-sale-eligibility", user?.id, runtimeMode],
    queryFn: async () => {
      if (!user?.id) return null;
      let query = supabase
        .from("investor_subscriptions")
        .select("status, expires_at")
        .eq("user_id", user.id)
        .in("status", ["active", "trial"]);
      if (runtimeMode) query = query.eq("runtime_mode", runtimeMode);
      const { data } = await query.limit(1).maybeSingle();
      return (data as unknown) as InvestorSubscriptionGate | null;
    },
    enabled: !!user?.id,
    staleTime: 10 * 1000,
  });

  const eligibility = resolveQuickSaleEligibility({
    profile,
    subscriptionStatus: subscription?.status,
    subscriptionExpiresAt: subscription?.expires_at,
  });

  return {
    ...eligibility,
    loading: isLoading,
  };
}
