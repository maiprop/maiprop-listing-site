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
  productId:
    (profile as { subscription_product_id?: string | null } | null)
      ?.subscription_product_id ?? null,
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

const useInvestorProStatus = (userId: string | undefined, enabled: boolean) => {
  return useQuery({
    queryKey: ["investor-sub-pro", userId],
    queryFn: async () => {
      if (!userId) return null;
      const { data } = await supabase
        .from("investor_subscriptions")
        .select("status")
        .eq("user_id", userId)
        .in("status", ["active", "trial"])
        .limit(1)
        .maybeSingle();
      return data as unknown as { status: string } | null;
    },
    enabled: Boolean(userId) && enabled,
    staleTime: 30_000,
  });
};

const isActiveInvestorStatus = (status: string | undefined) =>
  status === "active" || status === "trial";
const hasAnyProAccess = (flags: boolean[]) => flags.includes(true);
type SubscriptionAccessSource =
  | "admin"
  | "stripe"
  | "investor"
  | "override"
  | "free";
type PricingEntitlementRow = {
  key?: string | null;
  audience?: string | null;
  metadata?: { stripe_product_id?: string | null } | null;
};

const isLoadingSubscriptionAccess = (options: {
  subscriptionLoading: boolean;
  investorLoading: boolean;
  subscribed: boolean;
  hasEffectiveProduct: boolean;
  proProductLoading: boolean;
}) =>
  options.subscriptionLoading ||
  options.investorLoading ||
  [
    options.subscribed,
    options.hasEffectiveProduct,
    options.proProductLoading,
  ].every(Boolean);

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

/**
 * Thin wrapper around AuthContext.subscription.
 *
 * Platform admins get Pro access through DB role checks. Stripe subscription
 * access is validated against DB pricing_configs metadata and must match the
 * current role/audience to prevent cross-role entitlement reuse.
 */
export const useSubscription = () => {
  const { subscription, refreshSubscription, profile, user } = useAuth();
  const { productId: profileProductId, forceProAccess } =
    getProfileSubscriptionFields(profile);
  const isAdmin = isPlatformAdmin(profile);
  const isInvestorRole = isInvestorParticipant(profile);
  const currentAudience = getCurrentPricingAudience(profile);
  const effectiveProductId = subscription.productId ?? profileProductId;
  const hasEffectiveProduct =
    typeof effectiveProductId === "string" && effectiveProductId.length > 0;
  const { data: validatedProProduct, isLoading: validatedProProductLoading } =
    useValidatedProProduct(effectiveProductId, currentAudience);
  const { data: investorSubStatus, isLoading: investorStatusLoading } =
    useInvestorProStatus(user?.id, isInvestorRole);
  const hasStripePro = subscription.subscribed && Boolean(validatedProProduct);
  const hasInvestorPro =
    isInvestorRole && isActiveInvestorStatus(investorSubStatus?.status);
  const isPro = hasAnyProAccess([
    isAdmin,
    hasStripePro,
    hasInvestorPro,
    forceProAccess,
  ]);
  const hasDeveloperPro =
    isAdmin ||
    forceProAccess ||
    (hasStripePro && currentAudience === "developer");
  const accessSource: SubscriptionAccessSource = isAdmin
    ? "admin"
    : hasStripePro
      ? "stripe"
      : hasInvestorPro
        ? "investor"
        : forceProAccess
          ? "override"
          : "free";

  return {
    isPro,
    hasDeveloperPro,
    accessSource,
    hasStripeBilling: accessSource === "stripe",
    isInvestorManagedPlan: accessSource === "investor",
    isManuallyManagedPlan:
      accessSource === "admin" || accessSource === "override",
    subscribed: subscription.subscribed,
    productId: effectiveProductId,
    subscriptionEnd: subscription.subscriptionEnd,
    loading: isLoadingSubscriptionAccess({
      subscriptionLoading: subscription.loading,
      investorLoading: investorStatusLoading,
      subscribed: subscription.subscribed,
      hasEffectiveProduct,
      proProductLoading: validatedProProductLoading,
    }),
    refreshSubscription,
  };
};
