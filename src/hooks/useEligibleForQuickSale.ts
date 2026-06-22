/**
 * useEligibleForQuickSale — eligibility for Quick Sale deal flow.
 * Eligibility = approved application (active investor_subscription).
 * Used by InvestorRoute and InvestorDashboard.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { resolveQuickSaleEligibility } from "@/lib/quickSaleEntitlements";

export function useEligibleForQuickSale() {
  const { user, profile } = useAuth();

  const { data: subscription, isLoading } = useQuery({
    queryKey: ["quick-sale-eligibility", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("investor_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["active", "trial"])
        .limit(1)
        .maybeSingle();
      return (data as unknown) as { status: string } | null;
    },
    enabled: !!user?.id,
    staleTime: 10 * 1000,
  });

  const eligibility = resolveQuickSaleEligibility({
    profile,
    subscriptionStatus: subscription?.status,
  });

  return {
    ...eligibility,
    loading: isLoading,
  };
}
