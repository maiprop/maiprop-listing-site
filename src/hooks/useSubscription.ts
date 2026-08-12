import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import {
  getExplicitParticipantTypeFromProfile,
  getPricingAudienceFromProfile,
} from "@/lib/participantConfig";
import { isSubscriptionAudienceAllowed } from "@/lib/subscriptionUtils";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const getProfileSubscriptionFields = (
  profile: ReturnType<typeof useAuth>["profile"],
) => ({
  forceProAccess: Boolean(
    (profile as { force_pro_access?: boolean | null } | null)?.force_pro_access,
  ),
});

const profileRoleSwitchInProgress = (
  profile: ReturnType<typeof useAuth>["profile"],
) =>
  Boolean(
    (profile as { role_switch_in_progress_at?: string | null } | null)
      ?.role_switch_in_progress_at,
  );

const isInvestorParticipant = (
  profile: ReturnType<typeof useAuth>["profile"],
) => {
  const participantType = profileRoleSwitchInProgress(profile)
    ? null
    : getExplicitParticipantTypeFromProfile(profile);
  return participantType === "investor" || participantType === "institutional";
};

const hasAnyProAccess = (flags: boolean[]) => flags.includes(true);
type SubscriptionAccessSource =
  | "admin"
  | "stripe"
  | "investor"
  | "override"
  | "unknown"
  | "free";
type PricingEntitlementRow = {
  key?: string | null;
  audience?: string | null;
  metadata?: { stripe_product_id?: string | null } | null;
};

const isLoadingSubscriptionAccess = (options: {
  profileLoading: boolean;
  subscriptionLoading: boolean;
  entitlementUnresolved: boolean;
  needsLegacyProductValidation: boolean;
  proProductLoading: boolean;
  hasImmediateAccess: boolean;
}) => {
  if (options.hasImmediateAccess) return false;
  return options.profileLoading ||
    options.subscriptionLoading ||
    options.entitlementUnresolved ||
    (options.needsLegacyProductValidation && options.proProductLoading);
};

const getCurrentPricingAudience = (
  profile: ReturnType<typeof useAuth>["profile"],
) =>
  profileRoleSwitchInProgress(profile)
    ? null
    : getPricingAudienceFromProfile(profile);

const findMatchingEntitlement = (
  rows: PricingEntitlementRow[],
  productId: string,
  profileAudience: string | null,
): PricingEntitlementRow | null =>
  rows.find(
    (row) =>
      row.metadata?.stripe_product_id === productId &&
      isSubscriptionAudienceAllowed(row.audience, profileAudience),
  ) ?? null;

const useValidatedProProduct = (
  productId: string | null,
  profileAudience: string | null,
) => {
  return useQuery({
    queryKey: ["validated-pro-product", productId, profileAudience],
    queryFn: async () => {
      if (!productId || !profileAudience) return null;
      const { data } = await supabase
        .from("pricing_configs")
        .select("key, audience, metadata")
        .eq("is_active", true);
      return findMatchingEntitlement(
        (data ?? []) as PricingEntitlementRow[],
        productId,
        profileAudience,
      );
    },
    enabled: Boolean(productId && profileAudience),
    staleTime: 60_000,
  });
};

const hasDeveloperEntitlement = (options: {
  isAdmin: boolean;
  forceProAccess: boolean;
  hasValidatedProProduct: boolean;
}) => (
  options.isAdmin ||
  options.forceProAccess ||
  options.hasValidatedProProduct
);

const hasCurrentSubscriptionGrant = (subscription: {
  subscribed: boolean;
  subscriptionEnd?: string | null;
  source?: string | null;
  syncStatus?: string | null;
  staleUntil?: number | null;
}) => {
  if (!subscription.subscribed) return false;
  if (subscription.subscriptionEnd) {
    const subscriptionEnd = Date.parse(subscription.subscriptionEnd);
    if (!Number.isFinite(subscriptionEnd) || subscriptionEnd <= Date.now()) {
      return false;
    }
  }
  if (subscription.syncStatus !== "timeout") return true;
  return typeof subscription.staleUntil === "number" &&
    subscription.staleUntil > Date.now();
};

/**
 * Thin wrapper around AuthContext.subscription.
 *
 * Platform admins get Pro access through DB role checks. Stripe subscription
 * access is validated against DB pricing_configs metadata and must match the
 * current role/audience to prevent cross-role entitlement reuse.
 */
export const useSubscription = () => {
  const { subscription, refreshSubscription, profile, profileLoading } = useAuth();
  const { forceProAccess } = getProfileSubscriptionFields(profile);
  const isAdmin = isPlatformAdmin(profile);
  const isInvestorRole = isInvestorParticipant(profile);
  const currentAudience = getCurrentPricingAudience(profile);
  const effectiveProductId = subscription.productId;
  const hasEffectiveProduct =
    typeof effectiveProductId === "string" && effectiveProductId.length > 0;
  const hasServerValidatedProduct = hasEffectiveProduct &&
    isSubscriptionAudienceAllowed(subscription.audience, currentAudience);
  const needsLegacyProductValidation = hasEffectiveProduct &&
    !subscription.audience;
  const { data: validatedProProduct, isLoading: validatedProProductLoading } =
    useValidatedProProduct(
      needsLegacyProductValidation ? effectiveProductId : null,
      currentAudience,
    );
  const hasCurrentGrant = hasCurrentSubscriptionGrant(subscription);
  const entitlementUnresolved = subscription.syncStatus === "timeout" &&
    !hasCurrentGrant;
  const hasStripePro = hasCurrentGrant &&
    (hasServerValidatedProduct || Boolean(validatedProProduct));
  const hasInvestorPro =
    isInvestorRole && hasCurrentGrant && subscription.source === "investor";
  const isPro = hasAnyProAccess([
    isAdmin,
    hasStripePro,
    hasInvestorPro,
    forceProAccess,
  ]);
  const hasDeveloperPro = hasDeveloperEntitlement({
    isAdmin,
    forceProAccess,
    hasValidatedProProduct: hasStripePro && currentAudience === "developer",
  });
  const accessSource: SubscriptionAccessSource = isAdmin
    ? "admin"
    : hasStripePro
      ? "stripe"
      : hasInvestorPro
        ? "investor"
        : forceProAccess
          ? "override"
          : entitlementUnresolved
            ? "unknown"
            : "free";
  const hasPaidPromotionCredits =
    accessSource === "stripe" && subscription.billingStatus === "active";

  return {
    isPro,
    hasDeveloperPro,
    accessSource,
    hasStripeBilling: accessSource === "stripe",
    hasPaidPromotionCredits,
    isInvestorManagedPlan: accessSource === "investor",
    isManuallyManagedPlan:
      accessSource === "admin" || accessSource === "override",
    subscribed: subscription.subscribed,
    productId: effectiveProductId,
    subscriptionEnd: subscription.subscriptionEnd,
    syncStatus: subscription.syncStatus,
    loading: isLoadingSubscriptionAccess({
      profileLoading: Boolean(profileLoading),
      subscriptionLoading: subscription.loading,
      entitlementUnresolved,
      needsLegacyProductValidation,
      proProductLoading: validatedProProductLoading,
      hasImmediateAccess: isAdmin || forceProAccess,
    }),
    refreshSubscription,
  };
};
