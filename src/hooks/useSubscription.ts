import { useAuth } from "@/contexts/AuthContext";
import { isPlatformAdmin } from "@/lib/authUtils";

/** The Stripe product ID for mAI Prop Pro — sourced from env so it can differ per environment */
const PRO_PRODUCT_ID = import.meta.env.VITE_STRIPE_PRO_PRODUCT_ID ?? "prod_U8SJbk3fZQ3xgD";

/**
 * useSubscription — thin wrapper around AuthContext.subscription.
 *
 * Returns:
 *   isPro       — true when the user has an active Pro subscription
 *   subscribed  — raw subscribed boolean from Stripe
 *   productId   — current Stripe product ID (null if unsubscribed)
 *   subscriptionEnd — ISO date string of renewal/expiry
 *   loading     — true while the subscription status is being fetched
 *   refreshSubscription — force-refresh from Stripe
 *
 * Platform admins (role="admin" in DB) always get Pro access.
 * Access is controlled server-side via DB role — never via hardcoded emails.
 */
export function useSubscription() {
  const { subscription, refreshSubscription, profile } = useAuth();


  const isAdmin = isPlatformAdmin(profile);
  const isPro = isAdmin || (subscription.subscribed && subscription.productId === PRO_PRODUCT_ID);

  return {
    isPro,
    subscribed: subscription.subscribed,
    productId: subscription.productId,
    subscriptionEnd: subscription.subscriptionEnd,
    loading: subscription.loading,
    refreshSubscription,
  };
}
