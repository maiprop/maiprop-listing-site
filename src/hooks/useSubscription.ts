import { useAuth } from "@/contexts/AuthContext";

/** The Stripe product ID for mAI Prop Pro (€29/month) */
const PRO_PRODUCT_ID = "prod_U8SJbk3fZQ3xgD";

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
 */
// Owner emails always have Pro access
const OWNER_EMAILS = ["kr@maiprop.co", "kostisrenios@gmail.com"];

export function useSubscription() {
  const { subscription, refreshSubscription, user } = useAuth();

  const isOwner = !!user?.email && OWNER_EMAILS.includes(user.email.toLowerCase());
  const isPro = isOwner || (subscription.subscribed && subscription.productId === PRO_PRODUCT_ID);

  return {
    isPro,
    subscribed: subscription.subscribed,
    productId: subscription.productId,
    subscriptionEnd: subscription.subscriptionEnd,
    loading: subscription.loading,
    refreshSubscription,
  };
}
