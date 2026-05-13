import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
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

const useValidatedProProduct = (productId: string | null) => {
  return useQuery({
    queryKey: ["validated-pro-product", productId],
    queryFn: async () => {
      if (!productId) return null;
      const { data } = await supabase
        .from("pro_product_ids")
        .select("product_id")
        .eq("product_id", productId)
        .maybeSingle();
      return data;
    },
    enabled: Boolean(productId),
    staleTime: 60_000,
  });
};

const isActiveInvestorStatus = (status: string | undefined) => status === "active" || status === "trial";
const hasAnyProAccess = (flags: boolean[]) => flags.includes(true);
const isLoadingSubscriptionAccess = (options: {
  subscriptionLoading: boolean;
  investorLoading: boolean;
  subscribed: boolean;
  hasEffectiveProduct: boolean;
  proProductLoading: boolean;
}) => (
  options.subscriptionLoading ||
  options.investorLoading ||
  [options.subscribed, options.hasEffectiveProduct, options.proProductLoading].every(Boolean)
);

/**
 * Thin wrapper around AuthContext.subscription.
 *
 * Platform admins get Pro access through DB role checks. Stripe subscription
 * access is validated against the server-maintained pro_product_ids table.
 */
export const useSubscription = () => {
  const { subscription, refreshSubscription, profile, user } = useAuth();
  const { productId: profileProductId, forceProAccess } = getProfileSubscriptionFields(profile);
  const isAdmin = isPlatformAdmin(profile);
  const isInvestorRole = isInvestorParticipant(profile);
  const effectiveProductId = subscription.productId ?? profileProductId;
  const hasEffectiveProduct = typeof effectiveProductId === "string" && effectiveProductId.length > 0;
  const { data: validatedProProduct, isLoading: validatedProProductLoading } = useValidatedProProduct(effectiveProductId);
  const { data: investorSubStatus, isLoading: investorStatusLoading } = useInvestorProStatus(user?.id, isInvestorRole);
  const hasStripePro = subscription.subscribed && Boolean(validatedProProduct);
  const hasInvestorPro = isInvestorRole && isActiveInvestorStatus(investorSubStatus?.status);
  const isPro = hasAnyProAccess([isAdmin, hasStripePro, hasInvestorPro, forceProAccess]);

  return {
    isPro,
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
