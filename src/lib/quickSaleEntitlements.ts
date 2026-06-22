import { isPlatformAdmin } from "@/lib/authUtils";

export type QuickSaleEntitlementProfile = {
  role?: string | null;
  role_switch_in_progress_at?: string | null;
  force_pro_access?: boolean | null;
} | null;

export type QuickSaleSubscriptionStatus = "active" | "trial" | string | null | undefined;

export type QuickSaleEligibility = {
  eligible: boolean;
  isAdmin: boolean;
  hasActiveSubscription: boolean;
  isInvestorRole: boolean;
};

export const quickSaleRoleSwitchInProgress = (profile: QuickSaleEntitlementProfile): boolean =>
  Boolean(profile?.role_switch_in_progress_at);

export function resolveQuickSaleEligibility({
  profile,
  subscriptionStatus,
}: {
  profile: QuickSaleEntitlementProfile;
  subscriptionStatus: QuickSaleSubscriptionStatus;
}): QuickSaleEligibility {
  const isAdmin = isPlatformAdmin(profile);
  const hasActiveSubscription = subscriptionStatus === "active" || subscriptionStatus === "trial";
  const isInvestorRole =
    !quickSaleRoleSwitchInProgress(profile) &&
    (profile?.role === "investor" || profile?.role === "institutional");

  return {
    eligible: isAdmin || (isInvestorRole && hasActiveSubscription),
    isAdmin,
    hasActiveSubscription,
    isInvestorRole,
  };
}
