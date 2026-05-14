/**
 * Subscription status helpers — single source of truth shared between client
 * hooks (useSubscription) and edge functions (check-subscription, stripe-webhook).
 *
 * Rule: "active" and "trialing" are both billable/subscribed states.
 * Everything else (past_due, canceled, incomplete, unpaid, paused) is not.
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
export function isActiveSubscription(status: StripeSubscriptionStatus | string): boolean {
  return status === "active" || status === "trialing";
}

/** Returns true if the Stripe subscription object has Pro access. */
export function isProSubscription(sub: { status: string }): boolean {
  return isActiveSubscription(sub.status);
}

export type SubscriptionAudience =
  | "participant"
  | "agent"
  | "developer"
  | "professional"
  | "investor"
  | "institutional";

export function normalizeSubscriptionAudience(raw: string | null | undefined): SubscriptionAudience | null {
  if (raw === "buyer" || raw === "seller" || raw === "participant" || raw === "pro") return "participant";
  if (raw === "agent") return "agent";
  if (raw === "developer") return "developer";
  if (raw === "professional") return "professional";
  if (raw === "investor") return "investor";
  if (raw === "institutional") return "institutional";
  return null;
}

export function isSubscriptionAudienceAllowed(
  productAudience: string | null | undefined,
  profileAudience: string | null | undefined,
): boolean {
  const normalizedProductAudience = normalizeSubscriptionAudience(productAudience);
  const normalizedProfileAudience = normalizeSubscriptionAudience(profileAudience);
  return Boolean(normalizedProductAudience && normalizedProductAudience === normalizedProfileAudience);
}
