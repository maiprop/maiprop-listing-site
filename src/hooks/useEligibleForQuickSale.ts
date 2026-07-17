/**
 * useEligibleForQuickSale — eligibility for Quick Sale deal flow.
 * Eligibility = approved application plus the canonical active managed plan.
 * Used by InvestorRoute and InvestorDashboard.
 */
import { useAuth } from "@/contexts/AuthContext";
import { resolveQuickSaleEligibility } from "@/lib/quickSaleEntitlements";
import { useSubscription } from "@/hooks/useSubscription";

export function useEligibleForQuickSale() {
  const { user, profile } = useAuth();
  const {
    isPro,
    isInvestorManagedPlan,
    subscriptionEnd,
    loading,
  } = useSubscription();
  const hasManagedInvestorAccess = Boolean(user && isPro && isInvestorManagedPlan);

  const eligibility = resolveQuickSaleEligibility({
    profile,
    subscriptionStatus: hasManagedInvestorAccess ? "active" : null,
    subscriptionExpiresAt: hasManagedInvestorAccess ? subscriptionEnd : null,
  });

  return {
    ...eligibility,
    isPro,
    loading,
  };
}
