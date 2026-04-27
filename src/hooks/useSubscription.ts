import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";
import { getParticipantTypeFromProfile } from "@/lib/participantConfig";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * useSubscription — thin wrapper around AuthContext.subscription.
 *
 * Returns:
 *   isPro       — true when the user has any active subscription, or is admin,
 *                 or is an investor/institutional with an active investor_subscription.
 *   subscribed  — raw subscribed boolean from Stripe
 *   productId   — current Stripe product ID (null if unsubscribed)
 *   subscriptionEnd — ISO date string of renewal/expiry
 *   loading     — true while the subscription status is being fetched
 *   refreshSubscription — force-refresh from Stripe
 *
 * Platform admins (role="admin" in DB) always get Pro access.
 * Access is controlled server-side via DB role — never via hardcoded emails.
 * Any active Stripe subscription grants Pro, regardless of which plan was purchased.
 */
export function useSubscription() {
  const { subscription, refreshSubscription, profile, user } = useAuth();

  const isAdmin = isPlatformAdmin(profile);
  const participantType = getParticipantTypeFromProfile(profile);
  const isInvestorRole = participantType === "investor" || participantType === "institutional";

  const profileProductId = (profile as { subscription_product_id?: string | null } | null)?.subscription_product_id ?? null;
  const forceProAccess = !!(profile as { force_pro_access?: boolean | null } | null)?.force_pro_access;
  const effectiveProductId = subscription.productId ?? profileProductId;

  // Any active Stripe subscription grants Pro access — plan key doesn't matter.
  const hasStripePro = subscription.subscribed && !!effectiveProductId;

  // Investors/institutional with an admin-approved investor_subscriptions record also get Pro features,
  // since they pay €490–€1490/month for the deal-flow tier.
  const { data: investorSubStatus } = useQuery({
    queryKey: ["investor-sub-pro", user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from("investor_subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .in("status", ["active", "trial"])
        .limit(1)
        .maybeSingle();
      return (data as unknown as { status: string } | null);
    },
    enabled: !!user?.id && isInvestorRole,
    staleTime: 30_000,
  });

  const hasInvestorPro =
    isInvestorRole &&
    (investorSubStatus?.status === "active" || investorSubStatus?.status === "trial");

  const isPro = isAdmin || hasStripePro || hasInvestorPro || forceProAccess;

  return {
    isPro,
    subscribed: subscription.subscribed,
    productId: subscription.productId,
    subscriptionEnd: subscription.subscriptionEnd,
    loading: subscription.loading,
    refreshSubscription,
  };
}
