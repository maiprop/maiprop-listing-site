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

export function hasCurrentQuickSaleSubscription(
  status: QuickSaleSubscriptionStatus,
  expiresAt?: string | null,
  now = new Date(),
): boolean {
  if (status !== "active" && status !== "trial") return false;
  if (!expiresAt) return true;
  const expiry = new Date(expiresAt);
  return !Number.isNaN(expiry.getTime()) && expiry > now;
}

export function resolveQuickSaleEligibility({
  profile,
  subscriptionStatus,
  subscriptionExpiresAt,
  now,
}: {
  profile: QuickSaleEntitlementProfile;
  subscriptionStatus: QuickSaleSubscriptionStatus;
  subscriptionExpiresAt?: string | null;
  now?: Date;
}): QuickSaleEligibility {
  const isAdmin = isPlatformAdmin(profile);
  const hasActiveSubscription = hasCurrentQuickSaleSubscription(
    subscriptionStatus,
    subscriptionExpiresAt,
    now,
  );
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
