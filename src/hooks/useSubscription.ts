import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { PRICING_KEYS, usePricingConfigs } from "@/hooks/usePricingConfigs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

const getProfileSubscriptionFields = (profile: ReturnType<typeof useAuth>["profile"]) => ({
  productId: (profile as { subscription_product_id?: string | null } | null)?.subscription_product_id ?? null,
  forceProAccess: Boolean((profile as { force_pro_access?: boolean | null } | null)?.force_pro_access),
});

const isInvestorParticipant = (profile: ReturnType<typeof useAuth>["profile"]) => {
  const participantType = getParticipantTypeFromProfile(profile);
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
      return (data as unknown as { status: string } | null);
    },
    enabled: Boolean(userId) && enabled,
    staleTime: 30_000,
  });
};

const isActiveInvestorStatus = (status: string | undefined) => status === "active" || status === "trial";
const hasAnyProAccess = (flags: boolean[]) => flags.includes(true);
const isLoadingSubscriptionAccess = (options: {
  subscriptionLoading: boolean;
  investorLoading: boolean;
  subscribed: boolean;
  hasEffectiveProduct: boolean;
  pricingConfigsLoading: boolean;
}) => (
  options.subscriptionLoading ||
  options.investorLoading ||
  [options.subscribed, options.hasEffectiveProduct, options.pricingConfigsLoading].every(Boolean)
);

const getDeveloperProductIds = (pricingConfigs: ReturnType<typeof usePricingConfigs>["data"]) => [
  pricingConfigs?.[PRICING_KEYS.developer_pro]?.stripeProductId,
].filter((value): value is string => typeof value === "string" && value.length > 0);

const hasDeveloperEntitlement = (options: {
  isAdmin: boolean;
  forceProAccess: boolean;
  subscribed: boolean;
  effectiveProductId: string | null;
  developerProductIds: string[];
}) => (
  options.isAdmin ||
  options.forceProAccess ||
  (
    options.subscribed &&
    typeof options.effectiveProductId === "string" &&
    options.developerProductIds.includes(options.effectiveProductId)
  )
);

/**
 * Thin wrapper around AuthContext.subscription.
 *
 * Platform admins get Pro access through DB role checks. Any active Stripe
 * subscription grants broad Pro access, while developer modules require a
 * Developer Pro product or explicit platform/admin entitlement.
 */
export const useSubscription = () => {
  const { subscription, refreshSubscription, profile, user } = useAuth();
  const { data: pricingConfigs, isLoading: pricingConfigsLoading } = usePricingConfigs();
  const { productId: profileProductId, forceProAccess } = getProfileSubscriptionFields(profile);
  const isAdmin = isPlatformAdmin(profile);
  const isInvestorRole = isInvestorParticipant(profile);
  const effectiveProductId = subscription.productId ?? profileProductId;
  const hasEffectiveProduct = typeof effectiveProductId === "string" && effectiveProductId.length > 0;
  const hasStripePro = subscription.subscribed && hasEffectiveProduct;
  const { data: investorSubStatus, isLoading: investorStatusLoading } = useInvestorProStatus(user?.id, isInvestorRole);
  const hasInvestorPro = isInvestorRole && isActiveInvestorStatus(investorSubStatus?.status);

  const isPro = hasAnyProAccess([isAdmin, hasStripePro, hasInvestorPro, forceProAccess]);
  const hasDeveloperPro = hasDeveloperEntitlement({
    isAdmin,
    forceProAccess,
    subscribed: subscription.subscribed,
    effectiveProductId,
    developerProductIds: getDeveloperProductIds(pricingConfigs),
  });

  return {
    isPro,
    hasDeveloperPro,
    subscribed: subscription.subscribed,
    productId: effectiveProductId,
    subscriptionEnd: subscription.subscriptionEnd,
    loading: isLoadingSubscriptionAccess({
      subscriptionLoading: subscription.loading,
      investorLoading: investorStatusLoading,
      subscribed: subscription.subscribed,
      hasEffectiveProduct,
      pricingConfigsLoading,
    }),
    refreshSubscription,
  };
};
