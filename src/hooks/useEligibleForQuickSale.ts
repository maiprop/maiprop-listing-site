/**
 * useEligibleForQuickSale — eligibility for Quick Sale deal flow.
 * Eligibility = approved application (active investor_subscription).
 * Used by InvestorRoute and InvestorDashboard.
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { profileRoleSwitchInProgress, useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getExplicitParticipantTypeFromProfile } from "@/lib/participantConfig";

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

  const isAdmin = isPlatformAdmin(profile);
  const hasActiveSubscription = !!(subscription?.status === "active" || subscription?.status === "trial");
  const participantType = profileRoleSwitchInProgress(profile) ? null : getExplicitParticipantTypeFromProfile(profile);
  const isInvestorRole = participantType === "investor" || participantType === "institutional";

  return {
    eligible: isAdmin || (isInvestorRole && hasActiveSubscription),
    isAdmin,
    hasActiveSubscription,
    isInvestorRole,
    loading: isLoading,
  };
}
