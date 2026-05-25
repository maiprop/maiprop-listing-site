/**
 * Subscription status helpers — single source of truth shared between client
 * hooks (useSubscription) and edge functions (check-subscription, stripe-webhook).
 *
 * Rule: "active" and "trialing" are paid/subscribed states. "past_due" is a
 * payment-recovery grace state and should keep access until Stripe reaches a
 * terminal status such as canceled, unpaid, incomplete_expired, or paused.
 */

export type StripeSubscriptionStatus =
  | "active"
  | "trialing"
  | "past_due"
  | "canceled"
  | "incomplete"
  | "incomplete_expired"
  | "unpaid"
  | "paused";

/** Returns true for statuses where the user should have Pro access. */
export const isActiveSubscription = (status: StripeSubscriptionStatus | string): boolean => {
  return status === "active" || status === "trialing" || status === "past_due";
};

/** Returns true if the Stripe subscription object has Pro access. */
export const isProSubscription = (sub: { status: string }): boolean => {
  return isActiveSubscription(sub.status);
};

export type SubscriptionAudience =
  | "participant"
  | "agent"
  | "developer"
  | "professional"
  | "investor"
  | "institutional";

const SUBSCRIPTION_AUDIENCE_ALIASES: Record<string, SubscriptionAudience> = {
  agent: "agent",
  buyer: "participant",
  developer: "developer",
  institutional: "institutional",
  investor: "investor",
  participant: "participant",
  pro: "participant",
  professional: "professional",
  seller: "participant",
  user: "participant",
};

export const normalizeSubscriptionAudience = (raw: string | null | undefined): SubscriptionAudience | null => {
  return raw ? SUBSCRIPTION_AUDIENCE_ALIASES[raw] ?? null : null;
};

export const isSubscriptionAudienceAllowed = (
  productAudience: string | null | undefined,
  profileAudience: string | null | undefined,
): boolean => {
  const normalizedProductAudience = normalizeSubscriptionAudience(productAudience);
  const normalizedProfileAudience = normalizeSubscriptionAudience(profileAudience);
  return Boolean(normalizedProductAudience && normalizedProductAudience === normalizedProfileAudience);
};
